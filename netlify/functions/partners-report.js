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
        const settingsRows = await sql`SELECT key, value FROM store_settings WHERE key IN ('partner_seller_ids', 'provision_default_perc', 'partner_founders', 'partner_distribution_model', 'triple_w1', 'triple_w2', 'triple_w3', 'triple_months') OR key LIKE 'historic_%'`;
        const settings = { 
            partner_seller_ids: [], 
            provision_default_perc: 3, 
            partner_founders: {}, 
            partner_distribution_model: 'pro',
            triple_w1: 33.33, triple_w2: 33.33, triple_w3: 33.34,
            triple_months: 4
        };
        for (const r of settingsRows) {
            if (r.key === 'partner_seller_ids') {
                try { settings.partner_seller_ids = JSON.parse(r.value); } catch { settings.partner_seller_ids = []; }
            } else if (r.key === 'provision_default_perc') {
                settings.provision_default_perc = Number(r.value) || 3;
            } else if (r.key === 'partner_founders') {
                try { settings.partner_founders = JSON.parse(r.value); } catch { settings.partner_founders = {}; }
            } else if (r.key === 'partner_distribution_model') {
                settings.partner_distribution_model = r.value || 'pro';
            } else if (r.key === 'triple_months') {
                settings.triple_months = Number(r.value) || 4;
            } else if (r.key.startsWith('triple_w')) {
                settings[r.key] = Number(r.value);
            } else {
                settings[r.key] = r.value;
            }
        }
        const partnerIds = Array.isArray(settings.partner_seller_ids) ? settings.partner_seller_ids.map(Number) : [];
        const founders = settings.partner_founders || {};

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
        let partnerRollingM = {};
        let partnerHistoryH = {};
        const history = [];
        let prev_inventory_value = 0;

        for (const m of allMonths) {
            currentProcessMonth = m;
            let monthData = null;

            if (snapshotsMap[m] && m !== currentMonth && !forceSync && snapshotsMap[m].expense_detail) {
                monthData = snapshotsMap[m];
            }
            
            // 1. Gather Basic Data (if not cached)
            let revenue = monthData?.revenue || 0;
            let cogs = monthData?.cogs || 0;
            let expenses = monthData?.expenses || 0;
            let losses = monthData?.losses || 0;
            let provManual = monthData?.provision || 0;
            let purchases_total = monthData?.purchases_total || 0;
            let inventory_value = monthData?.inventory_value || 0;
            let product_detail = monthData?.product_detail || [];
            let revenue_detail = monthData?.revenue_detail || [];
            let expense_detail = monthData?.expense_detail || [];
            let purchase_detail = monthData?.purchase_detail || [];
            let inventory_detail = monthData?.inventory_detail || [];

            if (!monthData || forceSync || m === currentMonth) {
                let revenueRows, cogsRows, accRows, productRows, expenseRows;
                try {
                    [revenueRows, cogsRows, accRows, productRows, expenseRows] = await Promise.all([
                        sql`SELECT s.seller_id, sd.day as date, SUM(s.total_cents) as revenue FROM sales s JOIN sale_days sd ON sd.id = s.sale_day_id WHERE to_char(sd.day, 'YYYY-MM') = ${m} GROUP BY s.seller_id, sd.day ORDER BY sd.day ASC`,
                        sql`SELECT s.seller_id, SUM(si.quantity * d.cost_price) as cogs FROM sale_items si JOIN sales s ON s.id = si.sale_id JOIN sale_days sd ON sd.id = s.sale_day_id JOIN desserts d ON d.id = si.dessert_id WHERE to_char(sd.day, 'YYYY-MM') = ${m} GROUP BY s.seller_id`,
                        sql`SELECT kind, SUM(amount_cents) as total FROM accounting_entries WHERE to_char(entry_date, 'YYYY-MM') = ${m} GROUP BY kind`,
                        sql`SELECT s.seller_id, CASE WHEN si.id IS NULL THEN 'Registros Antiguos' ELSE COALESCE(d.name, 'Otro') END as product_name, SUM(COALESCE(si.quantity, 0)) as quantity, SUM(COALESCE(si.quantity * si.unit_price, s.total_cents)) as revenue, SUM(COALESCE(si.quantity * d.cost_price, 0)) as cogs FROM sales s JOIN sale_days sd ON sd.id = s.sale_day_id LEFT JOIN sale_items si ON s.id = si.sale_id LEFT JOIN desserts d ON d.id = si.dessert_id WHERE to_char(sd.day, 'YYYY-MM') = ${m} GROUP BY s.seller_id, CASE WHEN si.id IS NULL THEN 'Registros Antiguos' ELSE COALESCE(d.name, 'Otro') END ORDER BY revenue DESC`,
                        sql`SELECT e.id, e.entry_date, e.description, e.amount_cents, (SELECT json_agg(t.*) FROM accounting_tags t JOIN accounting_entry_tags et ON et.tag_id = t.id WHERE et.entry_id = e.id) as tags FROM accounting_entries e WHERE to_char(entry_date, 'YYYY-MM') = ${m} AND kind = 'gasto' ORDER BY entry_date ASC`
                    ]);
                } catch (sqlErr) {
                    return { statusCode: 500, body: JSON.stringify({ error: "DB Fetch Error", details: sqlErr.message }) };
                }
                
                revenue = Math.round(revenueRows.reduce((a, b) => a + Number(b.revenue || 0), 0));
                cogs = Math.round(cogsRows.reduce((a, b) => a + Number(b.cogs || 0), 0));
                
                // Smart Expense Filtering: Exclude 'Insumos' and 'Comisiones' from operating expenses
                let filteredExpenses = 0;
                let inventoryTotal = 0;
                (expenseRows || []).forEach(r => {
                    const tags = (r.tags || []).map(t => t.name.toLowerCase());
                    const isInsumos = tags.some(t => t === 'insumos');
                    const isCommission = tags.some(t => t.includes('comision'));
                    
                    if (isInsumos) {
                        inventoryTotal += Number(r.amount_cents || 0);
                    } else if (isCommission) {
                        // Skip commissions as they are calculated automatically
                    } else {
                        filteredExpenses += Number(r.amount_cents || 0);
                    }
                });

                expenses = Math.round(filteredExpenses);
                purchases_total = Math.round(inventoryTotal);
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
                
                let groupedProducts = {};
                productRows.forEach(r => {
                    const sid = r.seller_id;
                    if (!groupedProducts[sid]) {
                        groupedProducts[sid] = {
                            seller_name: sellerMap[sid] || `Vendedor ${sid}`,
                            total_revenue: 0,
                            total_cogs: 0,
                            products: []
                        };
                    }
                    let rev = Math.round(Number(r.revenue || 0));
                    let cg = Math.round(Number(r.cogs || 0));
                    groupedProducts[sid].total_revenue += rev;
                    groupedProducts[sid].total_cogs += cg;
                    groupedProducts[sid].products.push({
                        name: r.product_name,
                        quantity: Number(r.quantity || 0),
                        revenue: rev,
                        cogs: cg
                    });
                });
                product_detail = Object.values(groupedProducts).filter(r => r.total_revenue > 0).sort((a,b) => b.total_revenue - a.total_revenue);
                
                expense_detail = (expenseRows || []).map(r => ({
                    id: r.id,
                    date: r.entry_date instanceof Date ? r.entry_date.toISOString().split('T')[0] : String(r.entry_date).split('T')[0],
                    description: r.description,
                    amount: Math.round(Number(r.amount_cents || 0)),
                    tags: r.tags || []
                }));

                // Group detailed purchases (Insumos)
                purchase_detail = expense_detail.filter(d => (d.tags || []).some(t => t.name.toLowerCase() === 'insumos'));

                // Calculate Historical Inventory Value at month-end
                try {
                    const lastDayOfMonth = new Date(m + '-01');
                    lastDayOfMonth.setMonth(lastDayOfMonth.getMonth() + 1);
                    lastDayOfMonth.setDate(0); // Last day of month m
                    const dateStr = lastDayOfMonth.toISOString().split('T')[0];

                    const stockRows = await sql`
                        SELECT 
                            ii.ingredient, 
                            ii.unit, 
                            ii.price,
                            COALESCE(SUM(im.qty), 0) as stock
                        FROM inventory_items ii
                        LEFT JOIN inventory_movements im ON ii.ingredient = im.ingredient AND im.created_at <= (${dateStr}::date + '23:59:59'::interval)
                        GROUP BY ii.ingredient, ii.unit, ii.price
                        HAVING COALESCE(SUM(im.qty), 0) > 0
                    `;
                    inventory_detail = stockRows.map(s => ({
                        ingredient: s.ingredient,
                        unit: s.unit,
                        qty: Number(s.stock || 0),
                        value: Math.round(Number(s.stock || 0) * Number(s.price || 0))
                    }));
                    inventory_value = inventory_detail.reduce((a, b) => a + b.value, 0);
                } catch (invErr) { console.error("Inv Calc Error:", invErr); }
            } else {
                // If cached, get the inventory_value from cache
                inventory_value = monthData.inventory_value || 0;
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
                    if (hData.inventory_value !== undefined) inventory_value = Number(hData.inventory_value);
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


            // 3. Final Profit Formula with Inventory Adjustment
            const inventory_investment = inventory_value - (prev_inventory_value || 0);
            const opProfitBeforeInv = revenue - cogs - expenses - losses - calculatedCommissionsTotal - modCents;
            const opProfit = opProfitBeforeInv - inventory_investment;
            
            let provision = provManual;
            if (provision === 0) provision = Math.round(Math.max(0, opProfit) * (settings.provision_default_perc / 100));
            const netToShare = opProfit - provision;

            // 4. Partner Shares Distribution (PRO MODEL EMA)
            let totalMonthPartnerSales = 0;
            partnerIds.forEach(pid => {
                totalMonthPartnerSales += (monthCumulToAdd[pid] || 0);
            });
            
            let curM = {};
            partnerIds.forEach(pid => {
                curM[pid] = totalMonthPartnerSales > 0 ? (monthCumulToAdd[pid] || 0) / totalMonthPartnerSales : 0;
                if (partnerRollingM[pid] === undefined) partnerRollingM[pid] = [];
                partnerRollingM[pid].push({ month: m, val: curM[pid] });
                if (partnerRollingM[pid].length > (settings.triple_months || 4)) partnerRollingM[pid].shift();
            });

            let avgP = {};
            partnerIds.forEach(pid => {
                let w = partnerRollingM[pid];
                let sum = w.reduce((a, b) => a + (typeof b === 'number' ? b : b.val), 0);
                avgP[pid] = w.length > 0 ? sum / w.length : 0;
            });

            let rawF = {};
            const distModel = settings.partner_distribution_model || 'pro';
            partnerIds.forEach(pid => {
                const currentM = curM[pid] || 0;
                
                if (distModel === 'triple') {
                    // MODELO TRIPLE HORIZONTE
                    const p1 = currentM;
                    const p2 = avgP[pid] || currentM;
                    let totalCumul = 0;
                    partnerIds.forEach(id => totalCumul += (lastCumulativeDesserts[id] || 0));
                    const p3 = totalCumul > 0 ? (lastCumulativeDesserts[pid] || 0) / totalCumul : (1 / partnerIds.length);

                    const w1 = Number(settings.triple_w1 || 33.33) / 100;
                    const w2 = Number(settings.triple_w2 || 33.33) / 100;
                    const w3 = Number(settings.triple_w3 || 33.34) / 100;
                    rawF[pid] = (p1 * w1) + (p2 * w2) + (p3 * w3);
                } else if (distModel === 'historic') {
                    // MODELO HISTORICO SIMPLE (Acumulado Total)
                    let totalCumul = 0;
                    partnerIds.forEach(id => totalCumul += (lastCumulativeDesserts[id] || 0));
                    rawF[pid] = totalCumul > 0 ? (lastCumulativeDesserts[pid] || 0) / totalCumul : (1 / partnerIds.length);
                } else {
                    // MODELO PRO (EMA - Exponential Moving Average)
                    if (partnerHistoryH[pid] === undefined) partnerHistoryH[pid] = currentM; 
                    let newH = (partnerHistoryH[pid] * 0.5) + (avgP[pid] * 0.5);
                    partnerHistoryH[pid] = newH;
                    rawF[pid] = (newH * 0.5) + (currentM * 0.5);
                }
            });

            const sumF = Object.values(rawF).reduce((a,b) => a+b, 0) || 1;
            const normalizedF = {};
            partnerIds.forEach(pid => normalizedF[pid] = rawF[pid] / sumF);

            let totalFoundersFixed = 0;
            partnerIds.forEach(pid => {
                if (founders[pid]) {
                    totalFoundersFixed += Math.round(Math.max(0, netToShare) * (Number(founders[pid]) / 100));
                }
            });
            const meritPool = netToShare - totalFoundersFixed;

            const totalCumulGlobal = Object.values(lastCumulativeDesserts).reduce((a,b) => a+b, 0);
            const partnerShares = partnerIds.map(pid => {
                const meritPerc = normalizedF[pid];
                let shareAmount = Math.round(meritPool * meritPerc);
                if (founders[pid]) {
                    shareAmount += Math.round(Math.max(0, netToShare) * (Number(founders[pid]) / 100));
                }
                const finalPerc = netToShare > 0 ? (shareAmount / netToShare) * 100 : 0;
                const founderFixed = founders[pid] ? Number(founders[pid]) : 0;
                const globalHPerc = totalCumulGlobal > 0 ? (lastCumulativeDesserts[pid] || 0) / totalCumulGlobal : 0;
                
                return {
                    id: pid, name: sellerMap[pid] || `Socio ${pid}`, 
                    share_perc: Number(finalPerc.toFixed(2)),
                    share_amount: Math.round(shareAmount),
                    founder_fixed_perc: founderFixed,
                    metrics_debug: { 
                        M: curM[pid] || 0, 
                        P: avgP[pid] || 0, 
                        H: partnerHistoryH[pid] || 0, 
                        F: normalizedF[pid] || 0, 
                        H_global: globalHPerc,
                        desserts: monthCumulToAdd[pid] || 0,
                        cumulative_total: lastCumulativeDesserts[pid] || 0,
                        rolling_M: [...(partnerRollingM[pid] || [])]
                    }
                };
            });

            // 5. Finalize monthData
            monthData = {
                month: m, revenue, cogs, expenses, losses, purchases_total, inventory_value, inventory_investment, commissions: calculatedCommissionsTotal, 
                total_desserts: totalMonthDesserts, total_brigs: totalMonthBrigs, mod: modCents,
                profit: opProfit, provision, net_to_share: netToShare, merit_pool: meritPool,
                partners: partnerShares, commission_detail: commissionDetail,
                product_detail, revenue_detail, expense_detail, purchase_detail, inventory_detail,
                cumulative_desserts: { ...lastCumulativeDesserts },
                total_cumulative_desserts: totalCumulGlobal
            };
            prev_inventory_value = inventory_value;

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
