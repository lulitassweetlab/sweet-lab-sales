import { ensureSchema, sql } from './_db.js';

function json(body, status = 200) {
    return { statusCode: status, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) };
}

export async function handler(event) {
    if (event.httpMethod === 'OPTIONS') return json({ ok: true });

    try {
        await ensureSchema();
        
        // Date Logic processing
        let timeRange = event.queryStringParameters?.time_range || 'month';
        
        let dtStart = new Date();
        let dtEnd = new Date();
        
        if (timeRange === 'custom' && event.queryStringParameters?.start && event.queryStringParameters?.end) {
            dtStart = new Date(event.queryStringParameters.start + 'T00:00:00');
            dtEnd = new Date(event.queryStringParameters.end + 'T23:59:59');
        } else if (timeRange === 'today') {
            dtStart.setHours(0, 0, 0, 0);
            dtEnd.setHours(23, 59, 59, 999);
        } else if (timeRange === 'week') {
            const day = dtStart.getDay() || 7; // Sunday is 0 -> 7
            if (day !== 1) dtStart.setHours(-24 * (day - 1));
            dtStart.setHours(0, 0, 0, 0);
            dtEnd.setHours(23, 59, 59, 999);
        } else {
            // month (default)
            dtStart = new Date(dtStart.getFullYear(), dtStart.getMonth(), 1);
            dtStart.setHours(0, 0, 0, 0);
            dtEnd.setHours(23, 59, 59, 999);
        }

        // 1. General Stats (Total month/today remain fixed semantics, but let's map them to "Total Selected Period" and "Total Today")
        const [generalStats] = await sql`
            SELECT 
                COUNT(*) FILTER (WHERE created_at >= CURRENT_DATE) as sales_today_count,
                COALESCE(SUM(total_cents) FILTER (WHERE created_at >= CURRENT_DATE), 0) as sales_today_cents,
                COALESCE(SUM(total_cents) FILTER (WHERE created_at >= ${dtStart} AND created_at <= ${dtEnd}), 0) as sales_month_cents,
                (SELECT COUNT(DISTINCT client_id) FROM crm_client_sales) as active_clients_count
            FROM sales;
        `;

        // 2. Seller Control
        // Combine sales joined with sellers, plus subqueries for activities
        const sellerStats = await sql`
            WITH unpivoted_sales AS (
                SELECT s.id as sale_id, s.seller_id, s.created_at::DATE as sale_date, 'arco' as product_name, s.qty_arco as qty FROM sales s WHERE s.qty_arco > 0 AND s.created_at >= ${dtStart} AND s.created_at <= ${dtEnd}
                UNION ALL SELECT s.id, s.seller_id, s.created_at::DATE, 'melo', s.qty_melo FROM sales s WHERE s.qty_melo > 0 AND s.created_at >= ${dtStart} AND s.created_at <= ${dtEnd}
                UNION ALL SELECT s.id, s.seller_id, s.created_at::DATE, 'mara', s.qty_mara FROM sales s WHERE s.qty_mara > 0 AND s.created_at >= ${dtStart} AND s.created_at <= ${dtEnd}
                UNION ALL SELECT s.id, s.seller_id, s.created_at::DATE, 'oreo', s.qty_oreo FROM sales s WHERE s.qty_oreo > 0 AND s.created_at >= ${dtStart} AND s.created_at <= ${dtEnd}
                UNION ALL SELECT s.id, s.seller_id, s.created_at::DATE, 'nute', s.qty_nute FROM sales s WHERE s.qty_nute > 0 AND s.created_at >= ${dtStart} AND s.created_at <= ${dtEnd}
            ),
            sales_with_commissions AS (
                SELECT 
                    u.sale_id, u.seller_id,
                    (u.qty * COALESCE((
                        SELECT c.commission_cents 
                        FROM crm_product_commissions c 
                        WHERE c.product_name = u.product_name 
                          AND (c.seller_id IS NULL OR c.seller_id = u.seller_id)
                          AND u.sale_date >= c.valid_from 
                          AND (c.valid_to IS NULL OR u.sale_date <= c.valid_to)
                        ORDER BY c.seller_id NULLS LAST, c.valid_from DESC LIMIT 1
                    ), 0)) as comm
                FROM unpivoted_sales u
            ),
            seller_commissions AS (
                SELECT seller_id, SUM(comm) as total_commission FROM sales_with_commissions GROUP BY seller_id
            )
            SELECT 
                sl.id, sl.name,
                COALESCE(SUM(s.total_cents), 0) as total_cents,
                COUNT(s.id) as total_sales,
                COALESCE(SUM(s.total_cents) / NULLIF(COUNT(s.id), 0), 0) as avg_ticket,
                COALESCE(sc.total_commission, 0) as total_commission,
                COALESCE(sc.total_commission / NULLIF(COUNT(s.id), 0), 0) as avg_commission,
                MAX(s.created_at) as last_sale,
                COUNT(s.id) FILTER (WHERE s.created_at >= CURRENT_DATE) as sales_today,
                (SELECT COUNT(*) FROM crm_reminders r WHERE r.seller_id = sl.id AND r.created_at >= ${dtStart} AND r.created_at <= ${dtEnd}) as reminders_created,
                (SELECT COUNT(*) FROM crm_activities a WHERE a.seller_id = sl.id AND a.created_at >= ${dtStart} AND a.created_at <= ${dtEnd}) as notes_created
            FROM sellers sl
            LEFT JOIN sales s ON s.seller_id = sl.id AND s.created_at >= ${dtStart} AND s.created_at <= ${dtEnd}
            LEFT JOIN seller_commissions sc ON sc.seller_id = sl.id
            GROUP BY sl.id, sl.name, sc.total_commission
            ORDER BY total_cents DESC;
        `;

        // 3. Client Aggregates for Business Alerts
        const clientsQuery = await sql`
            SELECT 
                c.id, c.name, c.created_at,
                COALESCE(SUM(s.total_cents), 0) as lifetime_value,
                MAX(s.created_at) as last_purchase_date,
                COALESCE(SUM(CASE WHEN s.is_paid = false THEN s.total_cents ELSE 0 END), 0) as total_debt
            FROM clients c
            LEFT JOIN crm_client_sales cs ON c.id = cs.client_id
            LEFT JOIN sales s ON cs.sale_id = s.id
            GROUP BY c.id, c.name, c.created_at
        `;

        // Process Client Alerts in JS for simplicity
        const now = new Date();
        const thirtyDaysAgo = new Date(now.setDate(now.getDate() - 30));
        const sixtyDaysAgo = new Date(now.setDate(now.getDate() - 30)); // -30 again = -60
        const sevenDaysAgo = new Date(new Date().setDate(new Date().getDate() - 7));

        let clientsWithDebt = 0;
        let clientsInactive = 0;
        let clientsChurned = 0;
        let clientsNewWeek = 0;

        const topLtvClients = [...clientsQuery].sort((a, b) => b.lifetime_value - a.lifetime_value).slice(0, 5);

        clientsQuery.forEach(c => {
            if (c.total_debt > 0) clientsWithDebt++;
            const created = new Date(c.created_at);
            if (created >= sevenDaysAgo) clientsNewWeek++;
            
            if (c.last_purchase_date) {
                const lastPurchase = new Date(c.last_purchase_date);
                if (lastPurchase < sixtyDaysAgo) {
                    clientsChurned++;
                } else if (lastPurchase < thirtyDaysAgo) {
                    clientsInactive++;
                }
            } else {
                // Never bought
                if (created < thirtyDaysAgo) clientsInactive++;
            }
        });

        // 4. Product Metrics (from sales table)
        const [productMetrics] = await sql`
            SELECT
                COALESCE(SUM(qty_arco), 0) as arco,
                COALESCE(SUM(qty_melo), 0) as melo,
                COALESCE(SUM(qty_mara), 0) as mara,
                COALESCE(SUM(qty_oreo), 0) as oreo,
                COALESCE(SUM(qty_nute), 0) as nute,
                COALESCE(SUM(qty_arco) FILTER (WHERE created_at >= CURRENT_DATE), 0) as arco_today,
                COALESCE(SUM(qty_melo) FILTER (WHERE created_at >= CURRENT_DATE), 0) as melo_today,
                COALESCE(SUM(qty_mara) FILTER (WHERE created_at >= CURRENT_DATE), 0) as mara_today,
                COALESCE(SUM(qty_oreo) FILTER (WHERE created_at >= CURRENT_DATE), 0) as oreo_today,
                COALESCE(SUM(qty_nute) FILTER (WHERE created_at >= CURRENT_DATE), 0) as nute_today
            FROM sales
            WHERE created_at >= ${dtStart} AND created_at <= ${dtEnd};
        `;

        // 5. CRM Activity
        const [crmActivity] = await sql`
            SELECT 
                (SELECT COUNT(DISTINCT client_id) FROM crm_activities WHERE created_at >= CURRENT_DATE) as contacted_today,
                (SELECT COUNT(*) FROM crm_reminders WHERE completed = false) as pending_reminders,
                (SELECT COUNT(*) FROM crm_activities WHERE created_at >= CURRENT_DATE) as notes_today,
                (SELECT COUNT(*) FROM crm_prospects WHERE status = 'won') as won_prospects
        `;

        return json({
            general: generalStats,
            sellers: sellerStats,
            businessAlerts: {
                with_debt: clientsWithDebt,
                inactive: clientsInactive,
                churned: clientsChurned,
                new_this_week: clientsNewWeek,
                total_clients: clientsQuery.length,
                top_ltv: topLtvClients
            },
            products: productMetrics,
            crmActivity: crmActivity
        });

    } catch (err) {
        console.error('Error in crm-admin-dashboard:', err);
        return json({ error: String(err) }, 500);
    }
}
