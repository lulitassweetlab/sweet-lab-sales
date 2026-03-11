import { ensureSchema, sql } from './_db.js';

function json(body, status = 200) {
    return { statusCode: status, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) };
}

function getQueryParams(event) {
    const params = new URLSearchParams(event.rawQuery || '');
    const fallback = event.queryStringParameters || {};
    for (const [key, value] of Object.entries(fallback)) {
        if (value === undefined || value === null) continue;
        if (!params.has(key)) params.set(key, String(value));
    }
    return params;
}

export async function handler(event) {
    try {
        await ensureSchema();
        if (event.httpMethod === 'OPTIONS') return json({ ok: true });
        if (event.httpMethod !== 'GET') return json({ error: 'Método no soportado' }, 405);

        const params = getQueryParams(event);
        const segmentType = params.get('type') || 'all';
        const sellerId = params.get('seller_id') ? Number(params.get('seller_id')) : null;
        
        // Product specific filtering
        const productName = params.get('product_name');

        let queryArgs = [];
        let baseQuery = `
            SELECT 
                c.id, c.name, c.short_name, c.whatsapp, c.created_at,
                COALESCE(SUM(s.total_cents), 0) as lifetime_value,
                MAX(s.created_at) as last_purchase_date,
                COALESCE(SUM(CASE WHEN s.is_paid = false THEN s.total_cents ELSE 0 END), 0) as total_debt,
                st.name as stage_name, st.color as stage_color, st.id as stage_id
            FROM clients c
            LEFT JOIN crm_client_sales cs ON c.id = cs.client_id
            LEFT JOIN sales s ON cs.sale_id = s.id
            LEFT JOIN crm_client_stage cst ON c.id = cst.client_id
            LEFT JOIN crm_stages st ON cst.stage_id = st.id
        `;
        
        if (sellerId) {
            baseQuery += ` WHERE c.seller_id = $1`;
            queryArgs.push(sellerId);
        }

        baseQuery += ` GROUP BY c.id, c.name, c.short_name, c.whatsapp, c.created_at, st.name, st.color, st.id`;
        
        // Execute base fetch
        let clients = [];
        if (sellerId) {
            clients = await sql(baseQuery, [sellerId]);
        } else {
            clients = await sql(baseQuery, []);
        }

        // Only keep clients with valid WhatsApp numbers (>= 10 digits after cleanup)
        clients = clients.filter(c => c.whatsapp && c.whatsapp.replace(/\D/g, '').length >= 10);

        const now = new Date();
        const thirtyDaysAgo = new Date(now.setDate(now.getDate() - 30));
        const sixtyDaysAgo = new Date(now.setDate(now.getDate() - 30)); // -60 from start
        const sevenDaysAgo = new Date(new Date().setDate(new Date().getDate() - 7));

        let results = [];

        switch(segmentType) {
            case 'debt':
                results = clients.filter(c => c.total_debt > 0);
                break;
            case 'inactive':
                results = clients.filter(c => {
                    const created = new Date(c.created_at);
                    const lastPurchase = c.last_purchase_date ? new Date(c.last_purchase_date) : null;
                    if (lastPurchase) return lastPurchase >= sixtyDaysAgo && lastPurchase < thirtyDaysAgo;
                    return created < thirtyDaysAgo;
                });
                break;
            case 'lost':
            case 'churned':
                results = clients.filter(c => {
                    const lastPurchase = c.last_purchase_date ? new Date(c.last_purchase_date) : null;
                    return lastPurchase && lastPurchase < sixtyDaysAgo;
                });
                break;
            case 'new':
                results = clients.filter(c => {
                    return new Date(c.created_at) >= sevenDaysAgo;
                });
                break;
            case 'vip':
                // Top 20% by LTV or minimum threshold
                const sorted = [...clients].sort((a,b) => b.lifetime_value - a.lifetime_value);
                results = sorted.slice(0, Math.max(5, Math.floor(clients.length * 0.2)));
                break;
            case 'birthday':
                // Clients with birthday in the current month
                const currentMonth = new Date().getMonth() + 1; // 1-12
                
                // We need to fetch birth_dates as they aren't in the generic aggregate by default
                let bdayQuery = `SELECT id, name, whatsapp, short_name FROM clients WHERE EXTRACT(MONTH FROM birth_date) = $1`;
                let bdayArgs = [currentMonth];
                if(sellerId) {
                    bdayQuery += ` AND seller_id = $2`;
                    bdayArgs.push(sellerId);
                }
                const bdayClients = await sql(bdayQuery, bdayArgs);
                results = bdayClients.filter(c => c.whatsapp && c.whatsapp.replace(/\D/g, '').length >= 10);
                break;
            case 'product':
                if (!productName) return json({ error: 'Falta parametro product_name' }, 400);
                
                // Needs special JOIN to sale_items or specific qty_ checks
                let prodQuery = `
                    SELECT DISTINCT c.id, c.name, c.whatsapp, c.short_name
                    FROM clients c
                    JOIN crm_client_sales cs ON c.id = cs.client_id
                    JOIN sales s ON cs.sale_id = s.id
                `;
                
                let pArgs = [];
                let conds = [];
                
                if (['arco', 'melo', 'mara', 'oreo', 'nute'].includes(productName.toLowerCase())) {
                    conds.push(`s.qty_${productName.toLowerCase()} > 0`);
                } else {
                    prodQuery += ` JOIN sale_items si ON s.id = si.sale_id JOIN desserts d ON si.dessert_id = d.id `;
                    conds.push(`d.short_code ILIKE $1`);
                    pArgs.push(productName);
                }
                
                if (sellerId) {
                    conds.push(`c.seller_id = $${pArgs.length + 1}`);
                    pArgs.push(sellerId);
                }
                
                if(conds.length > 0) prodQuery += ` WHERE ` + conds.join(' AND ');
                
                const prodClients = await sql(prodQuery, pArgs);
                results = prodClients.filter(c => c.whatsapp && c.whatsapp.replace(/\D/g, '').length >= 10);
                break;
            case 'reminders':
                // Built in the CRM Admin by looking at due reminders
                let remQuery = `
                    SELECT DISTINCT c.id, c.name, c.whatsapp, c.short_name
                    FROM clients c
                    JOIN crm_reminders r ON c.id = r.client_id
                    WHERE r.completed = false
                `;
                let rArgs = [];
                if (sellerId) {
                    remQuery += ` AND r.seller_id = $1`;
                    rArgs.push(sellerId);
                }
                const remClients = await sql(remQuery, rArgs);
                results = remClients.filter(c => c.whatsapp && c.whatsapp.replace(/\D/g, '').length >= 10);
                break;
            case 'all':
            default:
                results = clients;
                break;
        }

        return json({
            segment: segmentType,
            count: results.length,
            clients: results
        });

    } catch (err) {
        console.error('Error in crm-segments API:', err);
        return json({ error: String(err) }, 500);
    }
}
