import { ensureSchema, sql } from './_db.js';

function json(body, status = 200) {
    return { statusCode: status, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) };
}

export async function handler(event) {
    try {
        await ensureSchema();

        // 1. Get Settings
        const settingsRows = await sql`SELECT key, value FROM store_settings WHERE key IN ('partner_seller_ids', 'provision_default_perc')`;
        const settings = {
            partner_seller_ids: [],
            provision_default_perc: 3
        };
        for (const r of settingsRows) {
            if (r.key === 'partner_seller_ids') {
                try { settings.partner_seller_ids = JSON.parse(r.value); } catch { settings.partner_seller_ids = []; }
            } else if (r.key === 'provision_default_perc') {
                settings.provision_default_perc = Number(r.value) || 3;
            }
        }

        // 2. Get All Sellers (to map names and identify partners and hierarchies)
        const allSellers = await sql`SELECT id, name, parent_id FROM sellers WHERE archived_at IS NULL`;
        const sellerMap = {};
        const hierarchy = {}; // seller_id -> lead_partner_id
        
        allSellers.forEach(s => {
            sellerMap[s.id] = s.name;
        });

        const partnerIds = Array.isArray(settings.partner_seller_ids) ? settings.partner_seller_ids.map(Number) : [];

        // Build hierarchy map: Each seller points to their lead partner if they are part of a team
        allSellers.forEach(s => {
            if (s.parent_id && partnerIds.includes(Number(s.parent_id))) {
                hierarchy[s.id] = Number(s.parent_id);
            } else {
                hierarchy[s.id] = s.id; // Self
            }
        });

        // 3. Get All Sales grouped by Month and Seller
        // We need this to calculate "Monthly Revenue" and "Cumulative Merit"
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
            GROUP BY month, s.seller_id
            ORDER BY month ASC
        `;

        // 4. Get Expenses, Losses and Provisions from accounting_entries
        const accountingData = await sql`
            SELECT 
                to_char(entry_date, 'YYYY-MM') as month,
                kind,
                SUM(amount_cents) as total_cents
            FROM accounting_entries
            GROUP BY month, kind
        `;

        // 5. Get Commissions (approximated for now as a percentage or from historical logic if needed)
        // For simplicity and accuracy, if there isn't a commissions table, we can estimate or query sale_days
        const commissionsData = await sql`
            SELECT 
                to_char(day, 'YYYY-MM') as month,
                SUM(commissions_paid) as commissions_cents
            FROM sale_days
            GROUP BY month
        `;

        // Process Timeline
        const months = [...new Set([...salesData.map(d => d.month), ...accountingData.map(d => d.month)])].sort();
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
            const manualProvision = Number(mAcc.find(a => a.kind === 'provision')?.total_cents || 0);
            const commissions = Number(mComm?.commissions_cents || 0);

            const grossProfit = revenue - cogs - commissions;
            const operatingProfit = grossProfit - expenses - losses;

            // Update cumulative sales for partners up to this month (including their teams)
            mSales.forEach(s => {
                const leadId = hierarchy[s.seller_id];
                if (partnerIds.includes(leadId)) {
                    cumulativeSalesByPartner[leadId] += Number(s.revenue_cents || 0);
                }
            });

            const totalCumulativeSalesOfPartners = partnerIds.reduce((acc, pid) => acc + (cumulativeSalesByPartner[pid] || 0), 0);

            // Provision logic
            let provision = manualProvision;
            if (manualProvision === 0) {
                provision = Math.round(Math.max(0, operatingProfit) * (settings.provision_default_perc / 100));
            }

            const netToShare = operatingProfit - provision;

            // Generate partner list with their share for THIS month based on cumulative performance
            const partners = partnerIds.map(pid => {
                const cum = cumulativeSalesByPartner[pid] || 0;
                const perc = totalCumulativeSalesOfPartners > 0 ? (cum / totalCumulativeSalesOfPartners) * 100 : 0;
                const shareAmount = netToShare > 0 ? Math.round(netToShare * (perc / 100)) : 0;

                return {
                    id: pid,
                    name: sellerMap[pid] || `Socio ${pid}`,
                    cumulative_sales: cum,
                    share_perc: Number(perc.toFixed(2)),
                    share_amount: shareAmount
                };
            });

            history.push({
                month: m,
                revenue,
                cogs,
                expenses,
                losses,
                commissions,
                profit: operatingProfit,
                provision,
                net_to_share: netToShare,
                partners
            });
        }

        return json({
            settings,
            history: history.reverse() // Newest month first
        });

    } catch (err) {
        console.error('Error in partners-report:', err);
        return json({ error: String(err) }, 500);
    }
}
