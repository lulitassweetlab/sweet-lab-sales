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
        let allMonths = monthRows.map(r => r.month);
        
        // Inject July and August 2025 if missing
        if (!allMonths.includes('2025-07')) allMonths.unshift('2025-07');
        if (!allMonths.includes('2025-08')) {
            const idx = allMonths.indexOf('2025-07');
            if (allMonths.indexOf('2025-08') === -1) {
                allMonths.splice(idx + 1, 0, '2025-08');
            }
        }
        allMonths = [...new Set(allMonths)].sort();

        const currentMonth = new Date().toISOString().slice(0, 7);

        let lastCumulativeSales = {};
        partnerIds.forEach(pid => lastCumulativeSales[pid] = 0);
        const history = [];

        for (const m of allMonths) {
            currentProcessMonth = m;
            let monthData = null;

            // 1. Historical Hardcoded Override for Jul/Aug 2025 (PRIORITY)
            const isHistorical = m === '2025-07' || m === '2025-08';
            if (isHistorical) {
                const hData = m === '2025-07' 
                    ? { marcela: 174, janeth: 99, aleja: 100 } 
                    : { marcela: 243, janeth: 40, aleja: 32 };
                
                const totalDesserts = Object.values(hData).reduce((a,b)=>a+b, 0);
                const revenue = totalDesserts * 10000;
                const cogs = Math.round(revenue * 0.55);
                const commissions = totalDesserts * 1000;
                const mod = totalDesserts * 2000;
                const profit = revenue - cogs - commissions - mod;
                const provision = Math.round(Math.max(0, profit) * (settings.provision_default_perc / 100));
                const netToShare = profit - provision;

                const commDetail = Object.entries(hData).map(([name, qty]) => {
                    const seller = allSellersRows.find(s => s.name.toLowerCase().includes(name.toLowerCase()));
                    return { 
                        seller_id: seller ? seller.id : 0, 
                        seller_name: seller ? seller.name : (name.charAt(0).toUpperCase() + name.slice(1)), 
                        desserts: qty, brigs: 0, total_comm: qty * 1000 
                    };
                });

                // Update cumulative tracking for potential partners in this months sales
                commDetail.forEach(c => {
                    const sid = Number(c.seller_id);
                    const leadId = leadPartnerMap[sid] || sid;
                    if (partnerIds.includes(Number(leadId))) {
                        lastCumulativeSales[leadId] = (lastCumulativeSales[leadId] || 0) + (c.desserts * 10000);
                    }
                });

                const totalPartnerCum = partnerIds.reduce((a, pid) => a + (lastCumulativeSales[pid] || 0), 0);
                const founderAmt = founderId && founderPerc > 0 ? Math.round(Math.max(0, netToShare) * (founderPerc / 100)) : 0;
                const pool = netToShare - founderAmt;
                const shares = partnerIds.map(pid => {
                    const cum = lastCumulativeSales[pid] || 0;
                    const mp = totalPartnerCum > 0 ? (cum / totalPartnerCum) : 0;
                    let amt = Math.round(pool * mp);
                    if (pid === founderId) amt += founderAmt;
                    const sp = netToShare > 0 ? Number(((amt/netToShare)*100).toFixed(2)) : 0;
                    return { id: pid, name: sellerMap[pid] || `Socio ${pid}`, share_perc: sp, share_amount: amt };
                });

                monthData = { 
                    month: m, revenue, cogs, expenses: 0, losses: 0, commissions, 
                    total_desserts: totalDesserts, total_brigs: 0, mod, profit, provision, 
                    net_to_share: netToShare, partners: shares, commission_detail: commDetail, 
                    cumulative_sales: { ...lastCumulativeSales } 
                };
                
                // Ensure snapshot is saved if not there, to speed up next runs (but prioritize logic above)
                if (!snapshotsMap[m]) {
                    await sql`INSERT INTO financial_snapshots (month, data) VALUES (${m}, ${JSON.stringify(monthData)}) ON CONFLICT (month) DO UPDATE SET data = EXCLUDED.data`;
                }

                history.push(monthData);
                continue; 
            }

            if (snapshotsMap[m] && m !== currentMonth && !forceSync) {
                monthData = snapshotsMap[m];
            }
            
            // 1. Gather Basic Data (if not cached)
            let revenue = monthData?.revenue || 0;
            let cogs = monthData?.cogs || 0;
            let expenses = monthData?.expenses || 0;
            let losses = monthData?.losses || 0;
            let provManual = monthData?.provision || 0;

            if (!monthData || forceSync || m === currentMonth) {
                const [revenueRows, cogsRows, accRows] = await Promise.all([
                    sql`SELECT s.seller_id, SUM(s.total_cents) as revenue FROM sales s JOIN sale_days sd ON sd.id = s.sale_day_id WHERE to_char(sd.day, 'YYYY-MM') = ${m} GROUP BY s.seller_id`,
                    sql`SELECT s.seller_id, SUM(si.quantity * d.cost_price) as cogs FROM sale_items si JOIN sales s ON s.id = si.sale_id JOIN sale_days sd ON sd.id = s.sale_day_id JOIN desserts d ON d.id = si.dessert_id WHERE to_char(sd.day, 'YYYY-MM') = ${m} GROUP BY s.seller_id`,
                    sql`SELECT kind, SUM(amount_cents) as total FROM accounting_entries WHERE to_char(entry_date, 'YYYY-MM') = ${m} GROUP BY kind`
                ]);
                
                revenue = Math.round(revenueRows.reduce((a, b) => a + Number(b.revenue || 0), 0));
                cogs = Math.round(cogsRows.reduce((a, b) => a + Number(b.cogs || 0), 0));
                expenses = Math.round(Number(accRows.find(a => a.kind === 'gasto')?.total || 0));
                losses = Math.round(Number(accRows.find(a => a.kind === 'perdida')?.total || 0));
                provManual = Math.round(Number(accRows.find(a => a.kind === 'provision')?.total || 0));

                // Helper for cumulative sales during full calc
                revenueRows.forEach(s => {
                    const leadId = leadPartnerMap[s.seller_id] || s.seller_id;
                    if (partnerIds.includes(Number(leadId))) {
                        lastCumulativeSales[leadId] = (lastCumulativeSales[leadId] || 0) + Number(s.revenue || 0);
                    }
                });
            } else {
                // If cached, we still need to update cumulative sales state for the next month
                if (monthData.cumulative_sales) {
                    Object.keys(monthData.cumulative_sales).forEach(pid => { 
                        lastCumulativeSales[pid] = Number(monthData.cumulative_sales[pid] || 0); 
                    });
                }
            }

            // 2. Calculate Real Commissions and MOD (ALWAYS)
            const commCalculatedRows = await sql`
                WITH unpivoted AS (
                    SELECT s.id as sale_id, s.seller_id, sd.day as sale_date, 'arco' as product_name, s.qty_arco as qty FROM sales s JOIN sale_days sd ON s.sale_day_id = sd.id WHERE s.qty_arco > 0 AND to_char(sd.day, 'YYYY-MM') = ${m}
                    UNION ALL SELECT s.id, s.seller_id, sd.day, 'melo', s.qty_melo FROM sales s JOIN sale_days sd ON s.sale_day_id = sd.id WHERE s.qty_melo > 0 AND to_char(sd.day, 'YYYY-MM') = ${m}
                    UNION ALL SELECT s.id, s.seller_id, sd.day, 'mara', s.qty_mara FROM sales s JOIN sale_days sd ON s.sale_day_id = sd.id WHERE s.qty_mara > 0 AND to_char(sd.day, 'YYYY-MM') = ${m}
                    UNION ALL SELECT s.id, s.seller_id, sd.day, 'oreo', s.qty_oreo FROM sales s JOIN sale_days sd ON s.sale_day_id = sd.id WHERE s.qty_oreo > 0 AND to_char(sd.day, 'YYYY-MM') = ${m}
                    UNION ALL SELECT s.id, s.seller_id, sd.day, 'nute', s.qty_nute FROM sales s JOIN sale_days sd ON s.sale_day_id = sd.id WHERE s.qty_nute > 0 AND to_char(sd.day, 'YYYY-MM') = ${m}
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

            const totalMonthDesserts = commissionDetail.reduce((a, b) => a + Number(b.desserts || 0), 0);
            const totalMonthBrigs = commissionDetail.reduce((a, b) => a + Number(b.brigs || 0), 0);
            const modCents = totalMonthDesserts * 2000;
            const calculatedCommissionsTotal = Math.round(commissionDetail.reduce((a, b) => a + Number(b.total_comm || 0), 0));

            // 3. Final Profit Formula
            const opProfit = revenue - cogs - expenses - losses - calculatedCommissionsTotal - modCents;
            let provision = provManual;
            if (provision === 0) provision = Math.round(Math.max(0, opProfit) * (settings.provision_default_perc / 100));
            const netToShare = opProfit - provision;

            // 4. Partner Shares Distribution
            const totalPartnerCumulative = partnerIds.reduce((a, pid) => a + (lastCumulativeSales[pid] || 0), 0);
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

            // 5. Finalize monthData
            monthData = {
                month: m, revenue, cogs, expenses, losses, commissions: calculatedCommissionsTotal, 
                total_desserts: totalMonthDesserts, total_brigs: totalMonthBrigs, mod: modCents,
                profit: opProfit, provision, net_to_share: netToShare,
                partners: partnerShares, commission_detail: commissionDetail,
                cumulative_sales: { ...lastCumulativeSales }
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
