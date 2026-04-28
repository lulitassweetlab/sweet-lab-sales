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

        // 1. Get Settings (Added Founder settings and Generic historic overrides)
        const settingsRows = await sql`SELECT key, value FROM store_settings WHERE key IN ('partner_seller_ids', 'provision_default_perc', 'partner_founder_id', 'partner_founder_perc') OR key LIKE 'historic_%'`;
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
            } else {
                settings[r.key] = r.value;
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
        let allMonths = monthRows.map(r => r.month);
        allMonths = [...new Set(allMonths)].sort();

        const currentMonth = new Date().toISOString().slice(0, 7);

        let lastCumulativeDesserts = {};
        partnerIds.forEach(pid => lastCumulativeDesserts[pid] = 0);
        const history = [];

        for (const m of allMonths) {
            currentProcessMonth = m;
            let monthData = null;

            if (snapshotsMap[m] && m !== currentMonth && !forceSync) {
                monthData = snapshotsMap[m];
            }
            
            // 1. Gather Basic Data (if not cached)
            let revenue = monthData?.revenue || 0;
            let cogs = monthData?.cogs || 0;
            let expenses = monthData?.expenses || 0;
            let losses = monthData?.losses || 0;
            let provManual = monthData?.provision || 0;
            let inventory = monthData?.inventory || 0;
            let revenue_detail = monthData?.revenue_detail || [];

            if (!monthData || forceSync || m === currentMonth) {
                const [revenueRows, cogsRows, accRows] = await Promise.all([
                    sql`SELECT s.seller_id, sd.day as date, SUM(s.total_cents) as revenue FROM sales s JOIN sale_days sd ON sd.id = s.sale_day_id WHERE to_char(sd.day, 'YYYY-MM') = ${m} GROUP BY s.seller_id, sd.day ORDER BY sd.day ASC`,
                    sql`SELECT s.seller_id, SUM(si.quantity * d.cost_price) as cogs FROM sale_items si JOIN sales s ON s.id = si.sale_id JOIN sale_days sd ON sd.id = s.sale_day_id JOIN desserts d ON d.id = si.dessert_id WHERE to_char(sd.day, 'YYYY-MM') = ${m} GROUP BY s.seller_id`,
                    sql`SELECT kind, SUM(amount_cents) as total FROM accounting_entries WHERE to_char(entry_date, 'YYYY-MM') = ${m} GROUP BY kind`
                ]);
                
                revenue = Math.round(revenueRows.reduce((a, b) => a + Number(b.revenue || 0), 0));
                cogs = Math.round(cogsRows.reduce((a, b) => a + Number(b.cogs || 0), 0));
                expenses = Math.round(Number(accRows.find(a => a.kind === 'gasto')?.total || 0));
                losses = Math.round(Number(accRows.find(a => a.kind === 'perdida')?.total || 0));
                provManual = Math.round(Number(accRows.find(a => a.kind === 'provision')?.total || 0));
                
                let groupedRevenues = {};
                revenueRows.forEach(r => {
                    const sid = r.seller_id;
                    if (!groupedRevenues[sid]) {
                        groupedRevenues[sid] = {
                            seller_name: sellerMap[sid] || `Vendedor ${sid}`,
                            amount: 0,
                            days: []
                        };
                    }
                    let amt = Math.round(Number(r.revenue || 0));
                    groupedRevenues[sid].amount += amt;
                    let dateStr = r.date instanceof Date ? r.date.toISOString().split('T')[0] : String(r.date).split('T')[0];
                    groupedRevenues[sid].days.push({ date: dateStr, amount: amt });
                });
                revenue_detail = Object.values(groupedRevenues).filter(r => r.amount > 0).sort((a,b) => b.amount - a.amount);
            } else {
                // If cached, we still need to update cumulative tracking state for the next month
                if (monthData.cumulative_desserts) {
                    Object.keys(monthData.cumulative_desserts).forEach(pid => { 
                        lastCumulativeDesserts[pid] = Number(monthData.cumulative_desserts[pid] || 0); 
                    });
                } else if (monthData.cumulative_sales) {
                    // Fallback for old snapshots (approx based on revenue if needed, but better to recalculate)
                    Object.keys(monthData.cumulative_sales).forEach(pid => { 
                        lastCumulativeDesserts[pid] = (lastCumulativeDesserts[pid] || 0) + Math.round(Number(monthData.cumulative_sales[pid] || 0) / 10000); 
                    });
                }
            }

            // 2. Calculate Real Commissions and MOD (ALWAYS)
            const commCalculatedRows = await sql`
                WITH unpivoted AS (
                    SELECT s.id as sale_id, s.seller_id, sd.day as sale_date, 'arco' as product_name, s.qty_arco as qty FROM sales s JOIN sale_days sd ON s.sale_day_id = sd.id WHERE s.qty_arco > 0 AND to_char(sd.day, 'YYYY-MM') = ${m} AND s.id NOT IN (SELECT sale_id FROM sale_items)
                    UNION ALL SELECT s.id, s.seller_id, sd.day, 'melo', s.qty_melo FROM sales s JOIN sale_days sd ON s.sale_day_id = sd.id WHERE s.qty_melo > 0 AND to_char(sd.day, 'YYYY-MM') = ${m} AND s.id NOT IN (SELECT sale_id FROM sale_items)
                    UNION ALL SELECT s.id, s.seller_id, sd.day, 'mara', s.qty_mara FROM sales s JOIN sale_days sd ON s.sale_day_id = sd.id WHERE s.qty_mara > 0 AND to_char(sd.day, 'YYYY-MM') = ${m} AND s.id NOT IN (SELECT sale_id FROM sale_items)
                    UNION ALL SELECT s.id, s.seller_id, sd.day, 'oreo', s.qty_oreo FROM sales s JOIN sale_days sd ON s.sale_day_id = sd.id WHERE s.qty_oreo > 0 AND to_char(sd.day, 'YYYY-MM') = ${m} AND s.id NOT IN (SELECT sale_id FROM sale_items)
                    UNION ALL SELECT s.id, s.seller_id, sd.day, 'nute', s.qty_nute FROM sales s JOIN sale_days sd ON s.sale_day_id = sd.id WHERE s.qty_nute > 0 AND to_char(sd.day, 'YYYY-MM') = ${m} AND s.id NOT IN (SELECT sale_id FROM sale_items)
                    UNION ALL SELECT s.id, s.seller_id, sd.day, d.short_code, si.quantity FROM sales s JOIN sale_items si ON s.id = si.sale_id JOIN desserts d ON si.dessert_id = d.id JOIN sale_days sd ON s.sale_day_id = sd.id WHERE si.quantity > 0 AND to_char(sd.day, 'YYYY-MM') = ${m}
                )
                SELECT u.seller_id, u.product_name, SUM(u.qty) as total_qty FROM unpivoted u GROUP BY u.seller_id, u.product_name
            `;

            const commissionsMap = {};
            (commCalculatedRows || []).forEach(c => {
                const sid = c.seller_id;
                if (!commissionsMap[sid]) commissionsMap[sid] = { desserts: 0, brigs: 0, total_comm: 0 };
                const qty = Number(c.total_qty || 0);
                const isBrig = (c.product_name || '').toLowerCase().includes('brig') || (c.product_name || '').toLowerCase().includes('bt');
                if (isBrig) commissionsMap[sid].brigs += qty;
                else commissionsMap[sid].desserts += qty;
            });

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

            let totalMonthDesserts = commissionDetail.reduce((a, b) => a + Number(b.desserts || 0), 0);
            let totalMonthBrigs = commissionDetail.reduce((a, b) => a + Number(b.brigs || 0), 0);
            let modCents = totalMonthDesserts * 2000;
            let calculatedCommissionsTotal = Math.round(commissionDetail.reduce((a, b) => a + Number(b.total_comm || 0), 0));

            // ----> CUSTOM INLINE MANUAL OVERRIDES <----
            const overrideStr = settings[`historic_${m.replace('-', '_')}`];
            if (overrideStr) {
                try {
                    const hData = JSON.parse(overrideStr);
                    if (hData.revenue !== undefined) revenue = Number(hData.revenue);
                    if (hData.cogs !== undefined) cogs = Number(hData.cogs);
                    if (hData.expenses !== undefined) expenses = Number(hData.expenses);
                    if (hData.losses !== undefined) losses = Number(hData.losses);
                    if (hData.mod !== undefined) modCents = Number(hData.mod);
                    if (hData.inventory !== undefined) inventory = Number(hData.inventory);
                    if (hData.commissions !== undefined) calculatedCommissionsTotal = Number(hData.commissions);
                    
                    // Override desserts and individual commissions if provided
                    let newCommSum = null;
                    let hasCommOverrides = false;

                    commissionDetail.forEach(c => {
                        const n = c.seller_name.toLowerCase();
                        if (n.includes('marcela') && hData.marcela !== undefined) c.desserts = Number(hData.marcela);
                        if (n.includes('janeth') && hData.janeth !== undefined) c.desserts = Number(hData.janeth);
                        if (n.includes('aleja') && hData.aleja !== undefined) c.desserts = Number(hData.aleja);

                        if (n.includes('marcela') && hData.comm_marcela !== undefined) { c.total_comm = Number(hData.comm_marcela); hasCommOverrides = true; }
                        if (n.includes('janeth') && hData.comm_janeth !== undefined) { c.total_comm = Number(hData.comm_janeth); hasCommOverrides = true; }
                        if (n.includes('aleja') && hData.comm_aleja !== undefined) { c.total_comm = Number(hData.comm_aleja); hasCommOverrides = true; }
                    });
                    
                    if (hasCommOverrides) {
                        newCommSum = Math.round(commissionDetail.reduce((a, b) => a + Number(b.total_comm || 0), 0));
                    }
                    
                    totalMonthDesserts = commissionDetail.reduce((a, b) => a + Number(b.desserts || 0), 0);
                    
                    // Prioritize generic global commission override over sum of individuals if explicitly set
                    if (hData.commissions !== undefined) calculatedCommissionsTotal = Number(hData.commissions);
                    else if (hasCommOverrides) calculatedCommissionsTotal = newCommSum;
                    commissionDetail.forEach(c => {
                        const sid = Number(c.seller_id);
                        const leadId = leadPartnerMap[sid] || sid;
                        if (partnerIds.includes(Number(leadId))) {
                            // First, subtract what we added automatically based on DB loop to prevent doubling
                            // Actually wait, lastCumulativeDesserts ALREADY got these added in lines 157-164!
                        }
                    });
                } catch(e) {}
            }

            // Clean up: Recalculate cumulatives explicitly from scratch using commissionDetail
            // We'll revert the `lastCumulativeDesserts` to its state before this month first.
            let monthCumulToAdd = {};
            commissionDetail.forEach(c => {
                const sid = Number(c.seller_id);
                const leadId = leadPartnerMap[sid] || sid;
                if (partnerIds.includes(Number(leadId))) {
                    monthCumulToAdd[leadId] = (monthCumulToAdd[leadId] || 0) + Number(c.desserts || 0);
                }
            });
            Object.keys(monthCumulToAdd).forEach(pid => {
                lastCumulativeDesserts[pid] = (lastCumulativeDesserts[pid] || 0) + monthCumulToAdd[pid];
            });


            // 3. Final Profit Formula
            const opProfit = revenue - cogs - expenses - losses - calculatedCommissionsTotal - modCents;
            let provision = provManual;
            if (provision === 0) provision = Math.round(Math.max(0, opProfit) * (settings.provision_default_perc / 100));
            const netToShare = opProfit - provision;

            // 4. Partner Shares Distribution
            const totalPartnerCumulative = partnerIds.reduce((a, pid) => a + (lastCumulativeDesserts[pid] || 0), 0);
            const founderFixedAmount = founderId && founderPerc > 0 ? Math.round(Math.max(0, netToShare) * (founderPerc / 100)) : 0;
            const meritPool = netToShare - founderFixedAmount;

            const partnerShares = partnerIds.map(pid => {
                const cum = lastCumulativeDesserts[pid] || 0;
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

            // 5. Finalize monthData
            monthData = {
                month: m, revenue, cogs, expenses, losses, inventory, commissions: calculatedCommissionsTotal, 
                total_desserts: totalMonthDesserts, total_brigs: totalMonthBrigs, mod: modCents,
                profit: opProfit, provision, net_to_share: netToShare,
                partners: partnerShares, commission_detail: commissionDetail,
                revenue_detail,
                cumulative_desserts: { ...lastCumulativeDesserts }
            };

            if (m < currentMonth && (!snapshotsMap[m] || forceSync)) {
                await sql`INSERT INTO financial_snapshots (month, data) VALUES (${m}, ${JSON.stringify(monthData)}) ON CONFLICT (month) DO UPDATE SET data = EXCLUDED.data, calculated_at = now()`;
            }
            history.push(monthData);
        }
        return json({ settings, history: history.reverse() });
    } catch (err) {
        console.error(`[Partners Report] Fatal Error:`, err);
        return json({ error: 'Fallo histórico', month: currentProcessMonth, details: String(err) }, 500);
    }
}
