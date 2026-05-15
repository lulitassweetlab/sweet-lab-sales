import { ensureSchema, sql } from '../netlify/functions/_db.js';

async function run() {
    console.log('Running ensureSchema...');
    await ensureSchema();
    console.log('Schema ensured.');

    console.log('Checking columns in dessert_recipes...');
    const columns = await sql`
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_name = 'dessert_recipes'
    `;
    console.log('Columns:', columns.map(c => c.column_name));
}

run().catch(console.error);
