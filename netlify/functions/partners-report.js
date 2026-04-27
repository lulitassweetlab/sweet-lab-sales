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

        // 1. Get Settings (Added Founder settings)
        const settingsRows = await sql`SELECT key, value FROM store_settings WHERE key IN ('partner_seller_ids', 'provision_default_perc', 'partner_founder_id', 'partner_founder_perc')`;
        const settings = { partner_seller_ids: [], provision_default_perc: 3, partner_founder_id: null, partner_founder_perc: 25 };
        for (const r of settingsRows) {
            if (r.key === 'partner_seller_ids') {
                try { settings.partner_seller_ids = JSON.parse(r.value); } catch { settings.partner_seller_ids = []; }
            } else if (r.key === 'provision_default_perc') {
                settings.provision_default_perc = Number(r.value) || 3;
            } else if (r.key === 'partner_founder_id') {
                settings.partner_founder_id = r.value;
            } else if (r.key === 'partner_founder_perc') {
                settings.partner_founder_perc = Number(r.value) || 0;
            }
        }
        const partnerIds = Array.isArray(settings.partner_seller_ids) ? settings.partner_seller_ids.map(Number) : [];
        const founderId = Number(settings.partner_founder_id);
        const founderPerc = Number(settings.partner_founder_perc);

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
            }
            
            // Calculate commissions for every month (even if cached, to ensure detail is always there)
            const [commCalculatedRows] = await Promise.all([
                sql`
                    WITH unpivoted AS (
                        SELECT s.id as sale_id, s.seller_id, sd.day as sale_date, 'arco' as product_name, s.qty_arco as qty FROM sales s JOIN sale_days sd ON s.sale_day_id = sd.id WHERE s.qty_arco > 0 AND to_char(sd.day, 'YYYY-MM') = ${m}
                        UNION ALL SELECT s.id, s.seller_id, sd.day, 'melo', s.qty_melo FROM sales s JOIN sale_days sd ON s.sale_day_id = sd.id WHERE s.qty_melo > 0 AND to_char(sd.day, 'YYYY-MM') = ${m}
                        UNION ALL SELECT s.id, s.seller_id, sd.day, 'mara', s.qty_mara FROM sales s JOIN sale_days sd ON s.sale_day_id = sd.id WHERE s.qty_mara > 0 AND to_char(sd.day, 'YYYY-MM') = ${m}
                        UNION ALL SELECT s.id, s.seller_id, sd.day, 'oreo', s.qty_oreo FROM sales s JOIN sale_days sd ON s.sale_day_id = sd.id WHERE s.qty_oreo > 0 AND to_char(sd.day, 'YYYY-MM') = ${m}
                        UNION ALL SELECT s.id, s.seller_id, sd.day, 'nute', s.qty_nute FROM sales s JOIN sale_days sd ON s.sale_day_id = sd.id WHERE s.qty_nute > 0 AND to_char(sd.day, 'YYYY-MM') = ${m}
                        UNION ALL SELECT s.id, s.seller_id, sd.day, d.short_code, si.quantity FROM sales s JOIN sale_items si ON s.id = si.sale_id JOIN desserts d ON si.dessert_id = d.id JOIN sale_days sd ON s.sale_day_id = sd.id WHERE si.quantity > 0 AND to_char(sd.day, 'YYYY-MM') = ${m}
                    )
                    SELECT 
                        u.seller_id, u.product_name, SUM(u.qty) as total_qty,
                        (
                            SELECT c.commission_cents 
                            FROM crm_product_commissions c 
                            WHERE c.product_name = u.product_name 
                              AND (c.seller_id IS NULL OR c.seller_id = u.seller_id)
                              AND to_date(${m}, 'YYYY-MM') >= c.valid_from 
                              AND (c.valid_to IS NULL OR to_date(${m}, 'YYYY-MM') <= c.valid_to)
                            ORDER BY c.seller_id NULLS LAST, c.valid_from DESC LIMIT 1
                        ) as unit_comm
                    FROM unpivoted u
                    GROUP BY u.seller_id, u.product_name
                `
            ]);

            const commissionsMap = {};
            (commCalculatedRows || []).forEach(c => {
                const sid = c.seller_id;
                if (!commissionsMap[sid]) commissionsMap[sid] = { desserts: 0, brigs: 0, total_comm: 0 };
                const qty = Number(c.total_qty || 0);
                const isBrig = (c.product_name || '').toLowerCase().includes('brig') || (c.product_name || '').toLowerCase().includes('bt');
                if (isBrig) commissionsMap[sid].brigs += qty;
                else commissionsMap[sid].desserts += qty;
            });

            // Apply tiered logic per seller
            Object.keys(commissionsMap).forEach(sid => {
                const s = commissionsMap[sid];
                let unitPricePostre = 0;
                if (s.desserts >= 60) unitPricePostre = 1500;
                else if (s.desserts >= 30) unitPricePostre = 1300;
                else if (s.desserts >= 1) unitPricePostre = 1000;
                
                s.total_comm = (s.desserts * unitPricePostre) + (s.brigs * 200);
            });

            const commissionDetail = Object.keys(commissionsMap).map(sid => ({
                seller_id: Number(sid),
                seller_name: sellerMap[sid] || `Vendedor ${sid}`,
                ...commissionsMap[sid]
            }));

            const totalMonthDesserts = commissionDetail.reduce((a, b) => a + Number(b.desserts || 0), 0);
            const modCents = totalMonthDesserts * 2000;

            if (!monthData) {
                const [revenueRows, cogsRows, accRows, commRows] = await Promise.all([
                    sql`SELECT s.seller_id, SUM(s.total_cents) as revenue FROM sales s JOIN sale_days sd ON sd.id = s.sale_day_id WHERE to_char(sd.day, 'YYYY-MM') = ${m} GROUP BY s.seller_id`,
                    sql`SELECT s.seller_id, SUM(si.quantity * d.cost_price) as cogs FROM sale_items si JOIN sales s ON s.id = si.sale_id JOIN sale_days sd ON sd.id = s.sale_day_id JOIN desserts d ON d.id = si.dessert_id WHERE to_char(sd.day, 'YYYY-MM') = ${m} GROUP BY s.seller_id`,
                    sql`SELECT kind, SUM(amount_cents) as total FROM accounting_entries WHERE to_char(entry_date, 'YYYY-MM') = ${m} GROUP BY kind`,
                    sql`SELECT SUM(commissions_paid) as total FROM sale_days WHERE to_char(day, 'YYYY-MM') = ${m}`
                ]);

                const revenue = Math.round(revenueRows.reduce((a, b) => a + Number(b.revenue || 0), 0));
                const cogs = Math.round(cogsRows.reduce((a, b) => a + Number(b.cogs || 0), 0));
                const expenses = Math.round(Number(accRows.find(a => a.kind === 'gasto')?.total || 0));
                const losses = Math.round(Number(accRows.find(a => a.kind === 'perdida')?.total || 0));
                const provManual = Math.round(Number(accRows.find(a => a.kind === 'provision')?.total || 0));
                const calculatedCommissionsTotal = Math.round(commissionDetail.reduce((a, b) => a + Number(b.total_comm || 0), 0));
                const opProfit = revenue - cogs - expenses - losses - calculatedCommissionsTotal - modCents;

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

                // TWO-LAYER CALCULATION: Founder Fixed + Merit Distribution
                const founderFixedAmount = founderId && founderPerc > 0 ? Math.round(Math.max(0, netToShare) * (founderPerc / 100)) : 0;
                const meritPool = netToShare - founderFixedAmount;

                const partnerShares = partnerIds.map(pid => {
                    const cum = lastCumulativeSales[pid] || 0;
                    const meritPerc = totalPartnerCumulative > 0 ? (cum / totalPartnerCumulative) : 0;
                    
                    let shareAmount = Math.round(meritPool * meritPerc);
                    if (pid === founderId) shareAmount += founderFixedAmount;
                    
                    const finalPerc = netToShare > 0 ? (shareAmount / netToShare) * 100 : 0;

                    return {
                        id: pid, name: sellerMap[pid] || `Socio ${pid}`, 
                        share_perc: Number(finalPerc.toFixed(2)),
                        share_amount: Math.round(shareAmount)
                    };
                });

                monthData = {
                    month: m, revenue, cogs, expenses, losses, commissions: calculatedCommissionsTotal, 
                    total_desserts: totalMonthDesserts, mod: modCents,
                    profit: opProfit, provision, net_to_share: netToShare,
                    partners: partnerShares, cumulative_sales: { ...lastCumulativeSales }
                };

                if (m < currentMonth) {
                    await sql`INSERT INTO financial_snapshots (month, data) VALUES (${m}, ${JSON.stringify(monthData)}) ON CONFLICT (month) DO UPDATE SET data = EXCLUDED.data, calculated_at = now()`;
                }
            }

            // Always add the dynamic detail (whether it was cached without it or just calculated)
            monthData.commission_detail = commissionDetail;
            monthData.total_desserts = totalMonthDesserts;
            monthData.mod = modCents;
            history.push(monthData);
        }
        return json({ settings, history: history.reverse() });
    } catch (err) {
        console.error(`[Partners Report] Fatal Error:`, err);
        return json({ error: 'Fallo histórico', month: currentProcessMonth, details: String(err) }, 500);
    }
}
