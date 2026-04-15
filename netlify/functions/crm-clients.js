import { ensureSchema, sql } from './_db.js';

function json(body, status = 200) {
    return { statusCode: status, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) };
}

function getQueryParams(event) {
    const params = new URLSearchParams(event.rawQuery || '');
    const fallback = event.queryStringParameters || {};
    for (const [key, value] of Object.entries(fallback)) {
        if (value === undefined || value === null) continue;
        if (!params.has(key)) params.set(key, String(value));
    }
    return params;
}

export async function handler(event) {
    try {
        await ensureSchema();
        if (event.httpMethod === 'OPTIONS') return json({ ok: true });

        if (event.httpMethod === 'POST') {
            const data = JSON.parse(event.body || '{}');
            const action = data.action;

            if (action === 'mark_dashboard_check') {
                const clientId = Number(data.client_id);
                const type = data.type; // 'birthday', 'inactive'
                const sellerName = data.seller_name || 'Vendedor';
                if (!clientId) return json({ error: 'Falta client_id' }, 400);

                // Fetch seller_id from the client record
                const clientRes = await sql`SELECT seller_id FROM clients WHERE id = ${clientId}`;
                const sellerId = clientRes[0]?.seller_id;
                if (!sellerId) return json({ error: 'Vendedor no encontrado para este cliente' }, 404);

                await sql`UPDATE clients SET last_dashboard_check = now() WHERE id = ${clientId}`;
                
                let note = 'Dashboard task completada';
                if (type === 'birthday') note = '✅ Se felicitó al cliente por su cumpleaños';
                else if (type === 'inactive') note = '✅ Se contactó al cliente inactivo para reactivación';

                await sql`
                    INSERT INTO crm_activities (client_id, seller_id, activity_type, description, created_by)
                    VALUES (${clientId}, ${sellerId}, 'note', ${note}, ${sellerName})
                `;
                return json({ ok: true });
            }
            return json({ error: 'Acción no válida' }, 400);
        }

        const params = getQueryParams(event);
        const sellerId = Number(params.get('seller_id'));
        if (!sellerId) return json({ error: 'Falta seller_id' }, 400);

        if (event.httpMethod === 'GET') {
            const id = Number(params.get('id'));

            // If an ID is provided, return the "Client 360° Profile"
            if (id) {
                // 1. Basic client info + advanced metrics
                const clientQuery = await sql`
                    SELECT 
                        c.id, c.name, c.short_name, c.whatsapp, c.birth_date, c.description,
                        c.address, c.latitude, c.longitude,
                        COUNT(s.id) as total_orders,
                        COALESCE(SUM(s.total_cents), 0) as lifetime_value_cents,
                        MAX(sd.day)::text as last_purchase_date,
                        COALESCE(SUM(CASE WHEN s.pay_method IS NULL OR s.pay_method = '' OR s.pay_method = '-' OR s.pay_method = 'entregado' THEN s.total_cents ELSE 0 END), 0) as total_debt_cents,
                        (
                            SELECT json_agg(json_build_object('id', t.id, 'name', t.name, 'color', t.color))
                            FROM crm_client_tags ct
                            JOIN crm_tags t ON ct.tag_id = t.id
                            WHERE ct.client_id = c.id
                        ) as custom_tags
                    FROM clients c
                    LEFT JOIN crm_client_sales cs ON c.id = cs.client_id
                    LEFT JOIN sales s ON cs.sale_id = s.id
                    LEFT JOIN sale_days sd ON s.sale_day_id = sd.id
                    WHERE c.seller_id = ${sellerId} AND c.id = ${id}
                    GROUP BY c.id, c.name, c.short_name, c.whatsapp, c.birth_date, c.description, c.address, c.latitude, c.longitude
                `;
                if (!clientQuery.length) return json({ error: 'Cliente no encontrado' }, 404);
                const profile = clientQuery[0];

                // 2. Sales History (Read-only directly from sales table via bridge)
                const sales = await sql`
                    SELECT s.id, sd.day::text as created_at, s.total_cents, s.is_paid, s.pay_method,
                           s.qty_arco, s.qty_melo, s.qty_mara, s.qty_oreo, s.qty_nute,
                           (
                               SELECT json_agg(json_build_object('name', d.short_code, 'name_full', d.name, 'qty', i.quantity))
                               FROM sale_items i
                               JOIN desserts d ON d.id = i.dessert_id
                               WHERE i.sale_id = s.id
                           ) as dynamic_items
                    FROM sales s
                    JOIN crm_client_sales cs ON s.id = cs.sale_id
                    JOIN sale_days sd ON s.sale_day_id = sd.id
                    WHERE cs.client_id = ${id}
                    ORDER BY sd.day DESC
                `;
                
                // 3. Activity History
                const activities = await sql`
                    SELECT id, activity_type, description, metadata, created_by, created_at, related_sale_id
                    FROM crm_activities
                    WHERE client_id = ${id}
                    ORDER BY created_at DESC
                `;

                // 4. Pending Reminders specifically for this client
                const reminders = await sql`
                    SELECT id, title, description, due_date, reminder_type, priority, completed, completed_at
                    FROM crm_reminders
                    WHERE client_id = ${id}
                    ORDER BY priority DESC, due_date ASC
                `;

                return json({
                    profile,
                    sales: sales || [],
                    activities: activities || [],
                    reminders: reminders || []
                });
            }

            // Otherwise, return the specific directory of clients for list views
            const directory = await sql`
                SELECT 
                    c.id, c.name, c.whatsapp,
                    st.name as stage_name, st.color as stage_color,
                    COUNT(s.id)::int as total_orders,
                    COALESCE(SUM(s.total_cents), 0)::int as lifetime_value_cents,
                    MAX(sd.day)::text as last_purchase_date,
                    COALESCE(SUM(CASE WHEN s.pay_method IS NULL OR s.pay_method = '' OR s.pay_method = '-' OR s.pay_method = 'entregado' THEN s.total_cents ELSE 0 END), 0)::int as total_debt_cents,
                    COALESCE((
                        SELECT json_agg(json_build_object('id', t.id, 'name', t.name, 'color', t.color))
                        FROM crm_client_tags ct
                        JOIN crm_tags t ON ct.tag_id = t.id
                        WHERE ct.client_id = c.id
                    ), '[]'::json) as custom_tags
                FROM clients c
                LEFT JOIN crm_client_sales cs ON c.id = cs.client_id
                LEFT JOIN sales s ON cs.sale_id = s.id
                LEFT JOIN sale_days sd ON s.sale_day_id = sd.id
                LEFT JOIN crm_client_stage cst ON c.id = cst.client_id
                LEFT JOIN crm_stages st ON cst.stage_id = st.id
                WHERE c.seller_id = ${sellerId}
                GROUP BY c.id, c.name, c.whatsapp, st.name, st.color, st.id
                ORDER BY MAX(sd.day) DESC NULLS LAST, c.name ASC
            `;
            return json(directory);

            return json(directory);

        }

        return json({ error: 'Método no permitido' }, 405);

    } catch (err) {
        console.error('Error in crm-clients:', err);
        return json({ error: String(err) }, 500);
    }
}
