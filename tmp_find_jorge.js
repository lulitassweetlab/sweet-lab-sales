import { sql, ensureSchema } from './netlify/functions/_db.js';
async function run() {
  await ensureSchema();
  const rows = await sql`SELECT id, name FROM sellers WHERE name ILIKE '%Jorge%'`;
  console.log(JSON.stringify(rows));
  process.exit();
}
run();
