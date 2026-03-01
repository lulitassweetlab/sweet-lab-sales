import('node-fetch').then(async ({default: fetch}) => {
  const db = await import('./netlify/functions/_db.js');
  const d = await db.sql`SELECT * FROM desserts LIMIT 1`;
  console.log("Found:", d[0]);
  const req = {
    id: d[0].id,
    name: d[0].name + " Edit",
    sale_price: d[0].sale_price,
    store_name: d[0].store_name || "Test Store Name"
  };
  const m = await import('./netlify/functions/desserts.js');
  const res = await m.handler({
    httpMethod: 'PUT',
    body: JSON.stringify(req)
  });
  console.log("Result:", res);
  process.exit();
}).catch(console.error);
