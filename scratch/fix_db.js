import { sql, ensureSchema } from '../netlify/functions/_db.js';

async function test() {
    try {
        console.log('Running ensureSchema...');
        await ensureSchema();
        console.log('Testing inventory_conversions...');
        const res = await sql`SELECT * FROM inventory_conversions`;
        console.log('Success:', res);
    } catch (err) {
        console.error('FAILED:', err);
    } finally {
        process.exit();
    }
}

test();
