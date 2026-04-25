import { ensureSchema, sql } from './_db.js';

function json(body, status = 200) {
    return { statusCode: status, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) };
}

export async function handler(event) {
    try {
        console.log('[Partners Report] Starting...');
        await ensureSchema();

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

        // 2. Get Sellers
        const allSellers = await sql`SELECT id, name, parent_id FROM sellers WHERE archived_at IS NULL`;
        const sellerMap = {};
        allSellers.forEach(s => sellerMap[s.id] = s.name);
        const partnerIds = Array.isArray(settings.partner_seller_ids) ? settings.partner_seller_ids.map(Number) : [];

        const hierarchy = {}; // seller_id -> lead_partner_id
        allSellers.forEach(s => {
            if (s.parent_id && partnerIds.includes(Number(s.parent_id))) {
                hierarchy[s.id] = Number(s.parent_id);
            } else {
                hierarchy[s.id] = s.id;
            }
        });

        // 3. Consolidated Financial Data in FEWER queries to avoid overhead
        console.log('[Partners Report] Querying Sales...');
        const salesData = await sql`
            SELECT 
                to_char(sd.day, 'YYYY-MM') as month,
                s.seller_id,
                SUM(s.total_cents) as revenue_cents,
                SUM(CASE WHEN si.quantity IS NOT NULL THEN (si.quantity * d.cost_price) ELSE 0 END) as cogs_cents
            FROM sales s
            JOIN sale_days sd ON sd.id = s.sale_day_id
            LEFT JOIN sale_items si ON si.sale_id = s.id
            LEFT JOIN desserts d ON d.id = si.dessert_id
            GROUP BY 1, 2
        `;

        console.log('[Partners Report] Querying Accounting...');
        const accountingData = await sql`
            SELECT to_char(entry_date, 'YYYY-MM') as month, kind, SUM(amount_cents) as total_cents
            FROM accounting_entries GROUP BY 1, 2
        `;

        const commissionsData = await sql`
            SELECT to_char(day, 'YYYY-MM') as month, SUM(commissions_paid) as comm_cents
            FROM sale_days GROUP BY 1
        `;

        // Process Months
        const monthSet = new Set();
        salesData.forEach(d => monthSet.add(d.month));
        accountingData.forEach(d => monthSet.add(d.month));
        const months = [...monthSet].sort();

        const history = [];
        const cumulativeSalesByPartner = {};
        partnerIds.forEach(pid => cumulativeSalesByPartner[pid] = 0);

        for (const m of months) {
            const mSales = salesData.filter(d => d.month === m);
            const mAcc = accountingData.filter(d => d.month === m);
            const mComm = commissionsData.find(d => d.month === m);

            const revenue = mSales.reduce((acc, curr) => acc + Number(curr.revenue_cents || 0), 0);
            const cogs = mSales.reduce((acc, curr) => acc + Number(curr.cogs_cents || 0), 0);
            const expenses = Number(mAcc.find(a => a.kind === 'gasto')?.total_cents || 0);
            const losses = Number(mAcc.find(a => a.kind === 'perdida')?.total_cents || 0);
            const provManual = Number(mAcc.find(a => a.kind === 'provision')?.total_cents || 0);
            const commissions = Number(mComm?.comm_cents || 0);

            const opProfit = revenue - cogs - expenses - losses - commissions;

            // Update cumulative INCLUDING hierarchical teams
            mSales.forEach(s => {
                const leadId = hierarchy[s.seller_id];
                if (partnerIds.includes(leadId)) {
                    cumulativeSalesByPartner[leadId] += Number(s.revenue_cents || 0);
                }
            });

            const totalPartnerCumulative = partnerIds.reduce((a, pid) => a + cumulativeSalesByPartner[pid], 0);

            let provision = provManual;
            if (provManual === 0) provision = Math.round(Math.max(0, opProfit) * (settings.provision_default_perc / 100));

            const netToShare = opProfit - provision;

            const partners = partnerIds.map(pid => {
                const cum = cumulativeSalesByPartner[pid];
                const perc = totalPartnerCumulative > 0 ? (cum / totalPartnerCumulative) * 100 : 0;
                return {
                    id: pid,
                    name: sellerMap[pid],
                    share_perc: Number(perc.toFixed(2)),
                    share_amount: netToShare > 0 ? Math.round(netToShare * (perc / 100)) : 0
                };
            });

            history.push({ month: m, revenue, cogs, expenses, losses, commissions, profit: opProfit, provision, net_to_share: netToShare, partners });
        }

        console.log('[Partners Report] Done.');
        return json({ settings, history: history.reverse() });

    } catch (err) {
        console.error('[Partners Report] Error:', err);
        return json({ error: String(err) }, 500);
    }
}
