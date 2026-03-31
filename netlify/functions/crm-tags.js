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

        const params = getQueryParams(event);
        const method = event.httpMethod;

        if (method === 'GET') {
            const action = params.get('action');
            const sellerId = Number(params.get('seller_id'));
            const clientId = Number(params.get('client_id'));

            if (action === 'get_seller_tags') {
                if (!sellerId) return json({ error: 'Falta seller_id' }, 400);
                const tags = await sql`SELECT * FROM crm_tags WHERE seller_id = ${sellerId} ORDER BY name ASC`;
                return json(tags);
            }

            if (action === 'get_client_tags') {
                if (!clientId) return json({ error: 'Falta client_id' }, 400);
                const tags = await sql`
                    SELECT t.* 
                    FROM crm_tags t
                    JOIN crm_client_tags ct ON t.id = ct.tag_id
                    WHERE ct.client_id = ${clientId}
                    ORDER BY t.name ASC
                `;
                return json(tags);
            }

            if (action === 'get_tag_clients') {
                const tagId = Number(params.get('tag_id'));
                if (!tagId) return json({ error: 'Falta tag_id' }, 400);
                const clients = await sql`SELECT client_id FROM crm_client_tags WHERE tag_id = ${tagId}`;
                return json(clients.map(c => c.client_id));
            }

            if (action === 'get_tag_summary') {
                if (!sellerId) return json({ error: 'Faltante seller_id' }, 400);
                const summary = await sql`
                    SELECT 
                        t.id, t.name, t.color,
                        COUNT(ct.client_id) as client_count
                    FROM crm_tags t
                    LEFT JOIN crm_client_tags ct ON t.id = ct.tag_id
                    WHERE t.seller_id = ${sellerId}
                    GROUP BY t.id, t.name, t.color
                    ORDER BY client_count DESC, t.name ASC
                `;
                return json(summary);
            }

            if (action === 'get_clients_by_tag') {
                const tagId = Number(params.get('tag_id'));
                if (!tagId) return json({ error: 'Falta tag_id' }, 400);
                const clients = await sql`
                    SELECT 
                        c.id, c.name, c.whatsapp,
                        st.name as stage_name, st.color as stage_color, st.id as stage_id,
                        COUNT(s.id) as total_orders,
                        COALESCE(SUM(s.total_cents), 0) as lifetime_value_cents,
                        COALESCE(SUM(CASE WHEN s.pay_method IS NULL OR s.pay_method = '' OR s.pay_method = '-' OR s.pay_method = 'entregado' THEN s.total_cents ELSE 0 END), 0) as total_debt_cents,
                        (
                            SELECT json_agg(json_build_object('id', t2.id, 'name', t2.name, 'color', t2.color))
                            FROM crm_client_tags ct2
                            JOIN crm_tags t2 ON ct2.tag_id = t2.id
                            WHERE ct2.client_id = c.id
                        ) as custom_tags
                    FROM clients c
                    JOIN crm_client_tags ct ON c.id = ct.client_id
                    LEFT JOIN crm_client_sales cs ON c.id = cs.client_id
                    LEFT JOIN sales s ON cs.sale_id = s.id
                    LEFT JOIN crm_client_stage cst ON c.id = cst.client_id
                    LEFT JOIN crm_stages st ON cst.stage_id = st.id
                    WHERE ct.tag_id = ${tagId}
                    GROUP BY c.id, c.name, c.whatsapp, st.name, st.color, st.id
                    ORDER BY c.name ASC
                `;
                return json(clients);
            }

            return json({ error: 'Acción GET no válida' }, 400);
        }

        if (method === 'POST') {
            const body = JSON.parse(event.body || '{}');
            const action = body.action;

            if (action === 'create_tag') {
                const { seller_id, name, color } = body;
                if (!seller_id || !name) return json({ error: 'Faltan datos (seller_id, name)' }, 400);
                
                const inserted = await sql`
                    INSERT INTO crm_tags (seller_id, name, color)
                    VALUES (${seller_id}, ${name.trim()}, ${color || '#818cf8'})
                    ON CONFLICT (seller_id, name) DO UPDATE SET color = EXCLUDED.color
                    RETURNING *
                `;
                return json({ success: true, tag: inserted[0] });
            }

            if (action === 'assign_tag') {
                const { client_id, tag_id } = body;
                if (!client_id || !tag_id) return json({ error: 'Falta client_id o tag_id' }, 400);

                await sql`
                    INSERT INTO crm_client_tags (client_id, tag_id)
                    VALUES (${client_id}, ${tag_id})
                    ON CONFLICT DO NOTHING
                `;
                return json({ success: true });
            }

            if (action === 'remove_tag') {
                const { client_id, tag_id } = body;
                if (!client_id || !tag_id) return json({ error: 'Falta client_id o tag_id' }, 400);

                await sql`DELETE FROM crm_client_tags WHERE client_id = ${client_id} AND tag_id = ${tag_id}`;
                return json({ success: true });
            }

            if (action === 'delete_tag') {
                const { tag_id, seller_id } = body;
                if (!tag_id || !seller_id) return json({ error: 'Falta tag_id o seller_id' }, 400);

                await sql`DELETE FROM crm_tags WHERE id = ${tag_id} AND seller_id = ${seller_id}`;
                return json({ success: true });
            }

            return json({ error: 'Acción POST no válida' }, 400);
        }

        return json({ error: 'Método no soportado' }, 405);
    } catch (err) {
        console.error('Error in crm-tags API:', err);
        return json({ error: String(err) }, 500);
    }
}
