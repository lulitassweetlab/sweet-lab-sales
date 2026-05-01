import { sql, recalculateAllDessertCosts, ensureSchema } from './netlify/functions/_db.js';

async function test() {
    try {
        console.log('Testing schema...');
        await ensureSchema();
        console.log('Recalculating costs...');
        await recalculateAllDessertCosts();
        const desserts = await sql`SELECT name, cost_price FROM desserts`;
        console.table(desserts);
        const inv = await sql`SELECT ingredient, price FROM inventory_items`;
        console.table(inv);
    } catch (err) {
        console.error('Test failed:', err);
    }
}

test();
