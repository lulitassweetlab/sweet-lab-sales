import { ensureSchema, sql } from './_db.js';

function json(body, status = 200) {
    return { statusCode: status, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) };
}

export async function handler(event) {
    if (event.httpMethod === 'OPTIONS') return json({ ok: true });
    
    try {
        await ensureSchema();

        if (event.httpMethod === 'GET') {
            // Fetch all commission rules
            const rules = await sql`
                SELECT id, product_name, commission_cents, seller_id, 
                       valid_from::text as valid_from, 
                       valid_to::text as valid_to
                FROM crm_product_commissions
                ORDER BY product_name ASC, valid_from DESC
            `;
            return json(rules);
        }

        if (event.httpMethod === 'POST') {
            const body = JSON.parse(event.body);
            
            // Allow batch insertions/updates or single edit
            // Expected body.rules = [{ product_name, commission_cents, valid_from, valid_to, seller_id, id? }]
            const rules = Array.isArray(body) ? body : (body.rules || [body]);
            
            for (const r of rules) {
                if (!r.product_name) continue;

                // Set defaults
                const cents = Number(r.commission_cents) || 0;
                const vf = r.valid_from || new Date().toISOString().split('T')[0];
                const vt = r.valid_to || null;
                const sId = r.seller_id || null;

                if (r.id) {
                    await sql`
                        UPDATE crm_product_commissions
                        SET product_name = ${r.product_name},
                            commission_cents = ${cents},
                            seller_id = ${sId},
                            valid_from = ${vf},
                            valid_to = ${vt},
                            updated_at = now()
                        WHERE id = ${r.id}
                    `;
                } else {
                    await sql`
                        INSERT INTO crm_product_commissions 
                        (product_name, commission_cents, seller_id, valid_from, valid_to)
                        VALUES (${r.product_name}, ${cents}, ${sId}, ${vf}, ${vt})
                    `;
                }
            }
            return json({ success: true, message: 'Comisiones guardadas' });
        }

        if (event.httpMethod === 'DELETE') {
            const id = event.queryStringParameters?.id;
            if(!id) return json({ error: 'Falta ID' }, 400);

            await sql`DELETE FROM crm_product_commissions WHERE id = ${id}`;
            return json({ success: true });
        }

        return json({ error: 'Método no soportado' }, 405);
    } catch (err) {
        console.error('Error in /crm-commissions:', err);
        return json({ error: String(err) }, 500);
    }
}
