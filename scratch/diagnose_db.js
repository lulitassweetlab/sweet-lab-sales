import { sql, ensureSchema } from './netlify/functions/_db.js';

async function diagnose() {
    try {
        const settings = await sql`SELECT value FROM store_settings WHERE key = 'db_version'`;
        console.log('Current Schema Version:', settings[0]?.value);
        
        const tables = await sql`SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'`;
        console.log('Tables:', tables.map(t => t.table_name).join(', '));

        const invCount = await sql`SELECT count(*)::int as count FROM inventory_items`;
        console.log('Inventory items count:', invCount[0].count);

        if (invCount[0].count > 0) {
            const cols = await sql`SELECT column_name FROM information_schema.columns WHERE table_name = 'inventory_items'`;
            console.log('Inventory columns:', cols.map(c => c.column_name).join(', '));
            const sample = await sql`SELECT * FROM inventory_items LIMIT 3`;
            console.log('Sample items:', sample);
        }

        const dessertCount = await sql`SELECT count(*)::int as count FROM desserts`;
        console.log('Desserts count:', dessertCount[0].count);

    } catch (err) {
        console.error('Diagnosis failed:', err);
    }
}

diagnose();
