import { sql, ensureSchema } from './netlify/functions/_db.js';
async function run() {
  await ensureSchema();
  const rows = await sql`SELECT name, short_code, cost_price, price_cents FROM desserts WHERE short_code = 'arco' OR name ILIKE '%arco%'`;
  console.log(JSON.stringify(rows));
  process.exit();
}
run();
