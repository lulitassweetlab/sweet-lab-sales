import { sql, ensureSchema, getOrCreateDayId } from './_db.js';

function json(body, status = 200) {
    return { statusCode: status, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) };
}

export async function handler(event) {
    try {
        await ensureSchema();
        
        const sellers = await sql`SELECT id, name FROM sellers`;
        const findSeller = (name) => sellers.find(s => s.name.toLowerCase().replace(' ', '').includes(name.toLowerCase().replace(' ', '')))?.id;
        
        const sIds = {
            marcela: findSeller('Marcela'),
            janeth: findSeller('Janeth'),
            aleja: findSeller('Aleja'),
            jorge: findSeller('Jorge')
        };
        
        if (!sIds.marcela || !sIds.janeth || !sIds.aleja) {
            return json({ error: 'Core sellers missing', found: sIds }, 500);
        }
        
        const [arco] = await sql`SELECT id FROM desserts WHERE short_code = 'arco'`;
        if (!arco) return json({ error: 'Dessert "arco" missing' }, 500);

        const data = [
            { month: '2025-07', date: '2025-07-31', sales: { marcela: 174, janeth: 99, aleja: 100, jorge: 0 } },
            { month: '2025-08', date: '2025-08-31', sales: { marcela: 243, janeth: 40, aleja: 32, jorge: 0 } }
        ];

        const log = [];
        for (const d of data) {
            for (const [sName, qty] of Object.entries(d.sales)) {
                if (qty <= 0) continue;
                const sid = sIds[sName];
                if (!sid) continue;
                
                const dayId = await getOrCreateDayId(sid, d.date);
                const revenueCents = qty * 12000; // Estimated 12k average
                
                const existing = await sql`
                    SELECT s.id FROM sales s 
                    WHERE s.seller_id = ${sid} AND s.sale_day_id = ${dayId} AND s.client_name = 'Venta Histórica Consolidad'
                `;
                
                if (existing.length === 0) {
                    const [sale] = await sql`
                        INSERT INTO sales (seller_id, sale_day_id, client_name, total_cents, is_paid, pay_method) 
                        VALUES (${sid}, ${dayId}, 'Venta Histórica Consolidad', ${revenueCents}, true, 'efectivo')
                        RETURNING id
                    `;
                    
                    await sql`
                        INSERT INTO sale_items (sale_id, dessert_id, quantity, unit_price)
                        VALUES (${sale.id}, ${arco.id}, ${qty}, 12000)
                    `;
                    log.push(`Added ${qty} postres ($${revenueCents}) for ${sName} in ${d.month}`);
                } else {
                    log.push(`Skipped ${sName} in ${d.month} (legacy data already exists)`);
                }
            }
        }
        
        await sql`DELETE FROM financial_snapshots WHERE month IN ('2025-07', '2025-08')`;
        // We also need to clear later months snapshots to force recalculation of cumulative sales
        await sql`DELETE FROM financial_snapshots WHERE month > '2025-07'`;
        
        return json({ ok: true, log, sellers: sIds });

    } catch (err) {
        console.error(err);
        return json({ error: String(err) }, 500);
    }
}
