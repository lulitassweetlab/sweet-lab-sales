import { ensureSchema, sql } from './_db.js';

function json(body, status = 200) {
    return { statusCode: status, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) };
}

export async function handler(event) {
    let currentProcessMonth = 'init';
    try {
        await ensureSchema();
        const params = event.queryStringParameters || {};
        const forceSync = params.force_sync === '1';

        await sql`CREATE TABLE IF NOT EXISTS financial_snapshots (month TEXT PRIMARY KEY, data JSONB NOT NULL, calculated_at TIMESTAMPTZ DEFAULT now())`;
        if (forceSync) await sql`DELETE FROM financial_snapshots`;

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

        const allSellersRows = await sql`SELECT id, name, parent_id FROM sellers`;
        const sellerMap = {};
        const sellersById = {};
        allSellersRows.forEach(s => { sellerMap[s.id] = s.name; sellersById[s.id] = s; });

        const leadPartnerMap = {};
        allSellersRows.forEach(s => {
            let current = s;
            let visited = new Set();
            let foundPartner = null;
            while (current && !visited.has(current.id)) {
                visited.add(current.id);
                if (partnerIds.includes(Number(current.id))) { foundPartner = Number(current.id); break; }
                if (!current.parent_id) break;
                current = sellersById[current.parent_id];
            }
            leadPartnerMap[s.id] = foundPartner || s.id;
        });

        const snapshotsMap = {};
        const snapshotsRows = await sql`SELECT month, data FROM financial_snapshots ORDER BY month ASC`;
        snapshotsRows.forEach(r => snapshotsMap[r.month] = r.data);

        const monthRows = await sql`
            SELECT DISTINCT to_char(sd.day, 'YYYY-MM') as month FROM sale_days sd
            UNION
            SELECT DISTINCT to_char(entry_date, 'YYYY-MM') as month FROM accounting_entries
            ORDER BY month ASC
        `;
        const allMonths = monthRows.map(r => r.month);
        const currentMonth = new Date().toISOString().slice(0, 7);

        let lastCumulativeSales = {};
        partnerIds.forEach(pid => lastCumulativeSales[pid] = 0);
        const history = [];

        for (const m of allMonths) {
            currentProcessMonth = m;
            let monthData;

            if (snapshotsMap[m] && m !== currentMonth && !forceSync) {
                monthData = snapshotsMap[m];
                if (monthData.cumulative_sales) {
                    Object.keys(monthData.cumulative_sales).forEach(pid => { lastCumulativeSales[pid] = Number(monthData.cumulative_sales[pid] || 0); });
                }
            } else {
                // FIXED REVENUE & COGS QUERIES to avoid double counting
                const [revenueRows, cogsRows, accRows, commRows] = await Promise.all([
                    sql`
                        SELECT s.seller_id, SUM(s.total_cents) as revenue
                        FROM sales s
                        JOIN sale_days sd ON sd.id = s.sale_day_id
                        WHERE to_char(sd.day, 'YYYY-MM') = ${m}
                        GROUP BY s.seller_id
                    `,
                    sql`
                        SELECT s.seller_id, SUM(si.quantity * d.cost_price) as cogs
                        FROM sale_items si
                        JOIN sales s ON s.id = si.sale_id
                        JOIN sale_days sd ON sd.id = s.sale_day_id
                        JOIN desserts d ON d.id = si.dessert_id
                        WHERE to_char(sd.day, 'YYYY-MM') = ${m}
                        GROUP BY s.seller_id
                    `,
                    sql`SELECT kind, SUM(amount_cents) as total FROM accounting_entries WHERE to_char(entry_date, 'YYYY-MM') = ${m} GROUP BY kind`,
                    sql`SELECT SUM(commissions_paid) as total FROM sale_days WHERE to_char(day, 'YYYY-MM') = ${m}`
                ]);

                const revenue = revenueRows.reduce((a, b) => a + Number(b.revenue || 0), 0);
                const cogs = cogsRows.reduce((a, b) => a + Number(b.cogs || 0), 0);
                const expenses = Number(accRows.find(a => a.kind === 'gasto')?.total || 0);
                const losses = Number(accRows.find(a => a.kind === 'perdida')?.total || 0);
                const provManual = Number(accRows.find(a => a.kind === 'provision')?.total || 0);
                const commissions = Number(commRows[0]?.total || 0);

                const opProfit = revenue - cogs - expenses - losses - commissions;

                // Important: Use revenueRows (single count) for merit attribution
                revenueRows.forEach(s => {
                    const leadId = leadPartnerMap[s.seller_id] || s.seller_id;
                    if (partnerIds.includes(Number(leadId))) {
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
                        id: pid, name: sellerMap[pid] || `Socio ${pid}`, share_perc: Number(perc.toFixed(2)),
                        share_amount: netToShare > 0 ? Math.round(netToShare * (perc / 100)) : 0
                    };
                });

                monthData = {
                    month: m, revenue, cogs, expenses, losses, commissions, profit: opProfit, provision, net_to_share: netToShare,
                    partners: partnerShares, cumulative_sales: { ...lastCumulativeSales }
                };

                if (m < currentMonth) {
                    await sql`INSERT INTO financial_snapshots (month, data) VALUES (${m}, ${JSON.stringify(monthData)}) ON CONFLICT (month) DO UPDATE SET data = EXCLUDED.data, calculated_at = now()`;
                }
            }
            history.push(monthData);
        }
        return json({ settings, history: history.reverse() });
    } catch (err) {
        console.error(`[Partners Report] Fatal Error:`, err);
        return json({ error: 'Fallo histórico', month: currentProcessMonth, details: String(err) }, 500);
    }
}
