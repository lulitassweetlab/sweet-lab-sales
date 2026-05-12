import { sql } from '../netlify/functions/_db.js';

async function test() {
    try {
        const m = '2025-08';
        const res = await sql`SELECT s.seller_id, CASE WHEN si.id IS NULL THEN 'Registros Antiguos' ELSE COALESCE(d.name, 'Otro') END as product_name, SUM(COALESCE(si.quantity, 0)) as quantity, SUM(COALESCE(si.quantity * si.unit_price, s.total_cents)) as revenue, SUM(COALESCE(si.quantity * d.cost_price, 0)) as cogs FROM sales s JOIN sale_days sd ON sd.id = s.sale_day_id LEFT JOIN sale_items si ON s.id = si.sale_id LEFT JOIN desserts d ON d.id = si.dessert_id WHERE to_char(sd.day, 'YYYY-MM') = ${m} GROUP BY s.seller_id, 2 ORDER BY revenue DESC`;
        console.log("Success:", res.length, "rows");
    } catch (e) {
        console.error("SQL_ERROR", e);
    }
    process.exit(0);
}
test();
