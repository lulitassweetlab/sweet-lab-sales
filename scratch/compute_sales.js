import { neon } from '@neondatabase/serverless';

const dbUrl = 'postgresql://neondb_owner:npg_ho6GYnZIxR4t@ep-round-mountain-aesbm539-pooler.c-2.us-east-2.aws.neon.tech/neondb?channel_binding=require&sslmode=require';
const sql = neon(dbUrl);

async function run() {
    try {
        const rows = await sql`
            SELECT 
                to_char(sd.day, 'YYYY-MM') as month,
                s.seller_id,
                SUM(s.total_cents) as amount
            FROM sales s
            JOIN sale_days sd ON s.sale_day_id = sd.id
            GROUP BY month, s.seller_id
            ORDER BY month ASC
        `;

        const sellersRes = await sql`SELECT id, name FROM sellers`;
        const sellerMap = {};
        sellersRes.forEach(r => sellerMap[r.id] = r.name);

        const dataByMonth = {};
        rows.forEach(r => {
            if (!dataByMonth[r.month]) dataByMonth[r.month] = { total: 0, sellers: {} };
            const amt = Number(r.amount);
            dataByMonth[r.month].total += amt;
            dataByMonth[r.month].sellers[r.seller_id] = amt;
        });

        console.log("=== PORCENTAJES DE VENTAS POR SOCIO POR MES ===");
        
        for (const month of Object.keys(dataByMonth).sort()) {
            const mData = dataByMonth[month];
            console.log(`\nMES: ${month} (Total Venta: $${(mData.total/1000).toFixed(0)}k)`);
            const sortedSellers = Object.keys(mData.sellers).sort((a,b) => mData.sellers[b] - mData.sellers[a]);
            for (const sid of sortedSellers) {
                const amt = mData.sellers[sid];
                const pct = ((amt / mData.total) * 100).toFixed(1);
                console.log(` - ${sellerMap[sid] || sid}: ${pct}% (ingreso: $${amt})`);
            }
        }
        
    } catch (e) {
        console.error("Error:", e);
    }
}

run();
