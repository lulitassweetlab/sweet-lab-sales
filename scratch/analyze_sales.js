import { sql } from '../netlify/functions/_db.js';

async function analyze() {
    try {
        console.log('--- Analyzing Sales for April 13, 2026 ---');
        
        // 1. Find the sale_day
        const days = await sql`SELECT id, day FROM sale_days WHERE day = '2026-04-13'`;
        if (days.length === 0) {
            console.log('No sale day found for 2026-04-13');
            return;
        }
        
        const dayId = days[0].id;
        console.log(`Found dayId: ${dayId} for ${days[0].day}`);

        // 2. Find sales for that day
        const sales = await sql`
            SELECT id, client_name, qty_nute, total_cents, special_pricing_type
            FROM sales
            WHERE sale_day_id = ${dayId}
        `;
        
        console.log(`Found ${sales.length} sales.`);

        // 3. For each sale, check sale_items
        for (const s of sales) {
            const items = await sql`
                SELECT si.id, si.dessert_id, si.quantity, si.unit_price, d.short_code
                FROM sale_items si
                JOIN desserts d ON d.id = si.dessert_id
                WHERE si.sale_id = ${s.id}
            `;
            
            console.log(`Sale ID: ${s.id} | Client: ${s.client_name}`);
            console.log(`  Legacy qty_nute: ${s.qty_nute} | total_cents: ${s.total_cents}`);
            
            if (items.length > 0) {
                for (const item of items) {
                    if (item.short_code === 'nute') {
                        console.log(`  - DYNAMIC NUTE: qty=${item.quantity}, price=${item.unit_price}`);
                    }
                }
            } else {
                console.log('  - NO DYNAMIC ITEMS');
            }
        }
    } catch (err) {
        console.error('Error:', err);
    }
}

analyze();
