const postgres = require('postgres');
const sql = postgres(process.env.DATABASE_URL);

async function check() {
    const months = await sql`
        SELECT to_char(sd.day, 'YYYY-MM') as month, COUNT(*) 
        FROM sales s 
        JOIN sale_days sd ON s.sale_day_id = sd.id 
        GROUP BY month 
        ORDER BY month
    `;
    console.log('Sales by month:', months);

    const sellers = await sql`SELECT id, name FROM sellers`;
    console.log('Sellers:', sellers);
    
    process.exit(0);
}

check().catch(err => {
    console.error(err);
    process.exit(1);
});
