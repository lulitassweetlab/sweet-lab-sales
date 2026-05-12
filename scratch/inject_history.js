const { sql, ensureSchema, getOrCreateDayId } = require('./netlify/functions/_db.js');

async function addHistory() {
    await ensureSchema();
    
    const sellers = await sql`SELECT id, name FROM sellers`;
    const findSeller = (name) => sellers.find(s => s.name.toLowerCase().includes(name.toLowerCase()))?.id;
    
    const sIds = {
        marcela: findSeller('Marcela'),
        janeth: findSeller('Janeth'),
        aleja: findSeller('Aleja'),
        jorge: findSeller('Jorge')
    };
    
    console.log('Sellers found:', sIds);
    if (!sIds.marcela || !sIds.janeth || !sIds.aleja) {
        console.error('Core sellers missing!');
        process.exit(1);
    }
    
    const [arco] = await sql`SELECT id FROM desserts WHERE short_code = 'arco'`;
    if (!arco) {
        console.error('Dessert "arco" missing!');
        process.exit(1);
    }

    const data = [
        { month: '2025-07', date: '2025-07-31', sales: { marcela: 174, janeth: 99, aleja: 100, jorge: 0 } },
        { month: '2025-08', date: '2025-08-31', sales: { marcela: 243, janeth: 40, aleja: 32, jorge: 0 } }
    ];

    for (const d of data) {
        for (const [sName, qty] of Object.entries(d.sales)) {
            const sid = sIds[sName];
            if (!sid || qty <= 0) continue;
            
            console.log(`Adding ${qty} for ${sName} in ${d.month}`);
            const dayId = await getOrCreateDayId(sid, d.date);
            
            // Create a single consolidated sale for the month
            const [sale] = await sql`
                INSERT INTO sales (seller_id, sale_day_id, client_name, total_cents, is_paid, pay_method) 
                VALUES (${sid}, ${dayId}, 'Venta Histórica Consolidad', ${qty * 8500}, true, 'efectivo')
                RETURNING id
            `;
            
            await sql`
                INSERT INTO sale_items (sale_id, dessert_id, quantity, unit_price)
                VALUES (${sale.id}, ${arco.id}, ${qty}, 8500)
            `;
        }
    }
    
    console.log('Clearing cache for those months...');
    await sql`DELETE FROM financial_snapshots WHERE month IN ('2025-07', '2025-08')`;
    
    console.log('Done!');
    process.exit(0);
}

addHistory().catch(err => { console.error(err); process.exit(1); });
