import { ensureSchema, sql } from './_db.js';

function json(body, status = 200) {
    return { statusCode: status, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) };
}

export async function handler(event) {
    try {
        await ensureSchema();
        const params = event.queryStringParameters || {};
        const forceSync = params.force_sync === '1';

        if (forceSync) {
            console.log('[Partners Report] Force Sync: Clearing snapshots...');
            await sql`DELETE FROM financial_snapshots`;
        }

        // 1. Get Settings
        const settingsRows = await sql`SELECT key, value FROM store_settings WHERE key IN ('partner_seller_ids', 'provision_default_perc')`;
        const settings = { partner_seller_ids: [], provision_default_perc: 3 };
        for (const r of settingsRows) {
            if (r.key === 'partner_seller_ids') {
                try { settings.partner_seller_ids = JSON.parse(r.value); } catch { settings.partner_seller_ids = []; }
            } else if (r.key === 'provision_default_perc') {
                settings.provision_default_perc = Number(r.value) || 3;
            }
        }

        const partnerIds = Array.isArray(settings.partner_seller_ids) ? settings.partner_seller_ids.map(Number) : [];

        // 2. Get Existing Snapshots
        const snapshotsRows = await sql`SELECT month, data FROM financial_snapshots ORDER BY month ASC`;
        const snapshotsMap = {};
        snapshotsRows.forEach(r => snapshotsMap[r.month] = r.data);

        // 3. Get All Months with Activity
        const monthRows = await sql`
            SELECT DISTINCT to_char(sd.day, 'YYYY-MM') as month FROM sale_days sd
            UNION
            SELECT DISTINCT to_char(entry_date, 'YYYY-MM') as month FROM accounting_entries
            ORDER BY month ASC
        `;
        const allMonths = monthRows.map(r => r.month);
        const currentMonth = new Date().toISOString().slice(0, 7);

        // 4. Identify which months need calculation
        // If a month is missing or it's the current month, we calculate.
        // Also, if any month BEFORE a snapshot changed, we'd need to invalidate, but for now we rely on forceSync or check for "dirty" months.
        
        let lastCumulativeSales = {};
        partnerIds.forEach(pid => lastCumulativeSales[pid] = 0);

        const history = [];
        const sellers = await sql`SELECT id, name, parent_id FROM sellers WHERE archived_at IS NULL`;
        const sellerMap = {};
        const hierarchy = {};
        sellers.forEach(s => {
            sellerMap[s.id] = s.name;
            if (s.parent_id && partnerIds.includes(Number(s.parent_id))) hierarchy[s.id] = Number(s.parent_id);
            else hierarchy[s.id] = s.id;
        });

        for (const m of allMonths) {
            let monthData;

            // USE CACHE if exists and NOT current month and NOT forced
            if (snapshotsMap[m] && m !== currentMonth && !forceSync) {
                monthData = snapshotsMap[m];
                // Update cumulative for the next month based on this snapshot
                if (monthData.cumulative_sales) {
                    lastCumulativeSales = { ...monthData.cumulative_sales };
                }
            } else {
                // CALCULATE MONTH
                console.log(`[Partners Report] Calculating month: ${m}`);
                
                const mSales = await sql`
                    SELECT s.seller_id, SUM(s.total_cents) as revenue, SUM(si.quantity * d.cost_price) as cogs
                    FROM sales s
                    JOIN sale_days sd ON sd.id = s.sale_day_id
                    LEFT JOIN sale_items si ON si.sale_id = s.id
                    LEFT JOIN desserts d ON d.id = si.dessert_id
                    WHERE to_char(sd.day, 'YYYY-MM') = ${m}
                    GROUP BY s.seller_id
                `;

                const mAcc = await sql`
                    SELECT kind, SUM(amount_cents) as total FROM accounting_entries 
                    WHERE to_char(entry_date, 'YYYY-MM') = ${m} GROUP BY kind
                `;

                const mComm = await sql`
                    SELECT SUM(commissions_paid) as total FROM sale_days WHERE to_char(day, 'YYYY-MM') = ${m}
                `;

                const revenue = mSales.reduce((a, b) => a + Number(b.revenue || 0), 0);
                const cogs = mSales.reduce((a, b) => a + Number(b.cogs || 0), 0);
                const expenses = Number(mAcc.find(a => a.kind === 'gasto')?.total || 0);
                const losses = Number(mAcc.find(a => a.kind === 'perdida')?.total || 0);
                const provManual = Number(mAcc.find(a => a.kind === 'provision')?.total || 0);
                const commissions = Number(mComm[0]?.total || 0);

                const opProfit = revenue - cogs - expenses - losses - commissions;

                // Update Cumulative Sales for this month
                mSales.forEach(s => {
                    const leadId = hierarchy[s.seller_id];
                    if (partnerIds.includes(leadId)) {
                        lastCumulativeSales[leadId] = (lastCumulativeSales[leadId] || 0) + Number(s.revenue || 0);
                    }
                });

                const totalPartnerCumulative = partnerIds.reduce((a, pid) => a + (lastCumulativeSales[pid] || 0), 0);

                let provision = provManual;
                if (provManual === 0) provision = Math.round(Math.max(0, opProfit) * (settings.provision_default_perc / 100));
                
                const netToShare = opProfit - provision;

                const partnerShares = partnerIds.map(pid => {
                    const cum = lastCumulativeSales[pid] || 0;
                    const perc = totalPartnerCumulative > 0 ? (cum / totalPartnerCumulative) * 100 : 0;
                    return {
                        id: pid,
                        name: sellerMap[pid],
                        share_perc: Number(perc.toFixed(2)),
                        share_amount: netToShare > 0 ? Math.round(netToShare * (perc / 100)) : 0
                    };
                });

                monthData = {
                    month: m, revenue, cogs, expenses, losses, commissions, profit: opProfit, provision, net_to_share: netToShare,
                    partners: partnerShares,
                    cumulative_sales: { ...lastCumulativeSales }
                };

                // SAVE SNAPSHOT if it's a past month (so it's finalized)
                if (m < currentMonth) {
                    await sql`
                        INSERT INTO financial_snapshots (month, data) 
                        VALUES (${m}, ${JSON.stringify(monthData)})
                        ON CONFLICT (month) DO UPDATE SET data = EXCLUDED.data, calculated_at = now()
                    `;
                }
            }

            history.push(monthData);
        }

        return json({ settings, history: history.reverse() });

    } catch (err) {
        console.error('[Partners Report] Error:', err);
        return json({ error: String(err) }, 500);
    }
}
