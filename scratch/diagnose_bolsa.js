import { sql } from '../netlify/functions/_db.js';

async function diagnose() {
    try {
        console.log("--- INVENTORY ITEMS ---");
        const items = await sql`SELECT * FROM inventory_items WHERE ingredient ILIKE '%bolsa%' OR ingredient ILIKE '%cuchara%'`;
        console.table(items);

        console.log("\n--- INVENTORY MOVEMENTS (Last 20) ---");
        const movs = await sql`SELECT * FROM inventory_movements WHERE ingredient ILIKE '%bolsa%' OR ingredient ILIKE '%cuchara%' ORDER BY created_at DESC LIMIT 20`;
        console.table(movs);

        console.log("\n--- INVENTORY ALIASES ---");
        const aliases = await sql`SELECT * FROM inventory_alias WHERE alias ILIKE '%bolsa%' OR ingredient_name ILIKE '%bolsa%'`;
        console.table(aliases);

        console.log("\n--- STOCK CALCULATION ---");
        const stock = await sql`SELECT ingredient, SUM(qty) as saldo FROM inventory_movements WHERE ingredient ILIKE '%bolsa%' OR ingredient ILIKE '%cuchara%' GROUP BY ingredient`;
        console.table(stock);

    } catch (err) {
        console.error(err);
    }
}

diagnose();
