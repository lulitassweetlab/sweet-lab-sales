import { neon } from '@netlify/neon';
const sql = neon(process.env.NETLIFY_DATABASE_URL);
const rows = await sql`SELECT DISTINCT category FROM inventory_items ORDER BY category;`;
console.log(JSON.stringify(rows, null, 2));
