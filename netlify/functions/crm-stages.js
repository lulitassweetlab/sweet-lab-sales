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
            const action = params.get('action') || 'get_stages';
            
            if (action === 'get_stages') {
                const stages = await sql`SELECT * FROM crm_stages WHERE is_active = true ORDER BY order_index ASC`;
                return json(stages);
            }

            if (action === 'get_all_stages') {
                // Returns ALL stages including inactive (for admin use)
                const stages = await sql`SELECT * FROM crm_stages ORDER BY order_index ASC`;
                return json(stages);
            }


            if (action === 'get_stage_summary') {
                // Returns all active stages with the count of clients for this seller in each stage
                const sellerId = Number(params.get('seller_id'));
                if (!sellerId) return json({ error: 'Missing seller_id' }, 400);

                const summary = await sql`
                    SELECT 
                        s.id, s.name, s.color, s.order_index,
                        COUNT(c.id) as client_count
                    FROM crm_stages s
                    LEFT JOIN crm_client_stage cs ON cs.stage_id = s.id
                    LEFT JOIN clients c ON cs.client_id = c.id AND c.seller_id = ${sellerId}
                    WHERE s.is_active = true
                    GROUP BY s.id, s.name, s.color, s.order_index
                    ORDER BY s.order_index ASC
                `;
                return json(summary);
            }

            if (action === 'get_clients_by_stage') {
                const stageId = Number(params.get('stage_id'));
                const sellerId = Number(params.get('seller_id'));
                if (!stageId || !sellerId) return json({ error: 'Missing stage_id or seller_id' }, 400);

                const clients = await sql`
                    SELECT 
                        c.id, c.name, c.whatsapp, c.birth_date,
                        st.name as stage_name, st.color as stage_color,
                        cs.updated_at as stage_assigned_at,
                        sh.changed_at as last_stage_change,
                        COALESCE((
                            SELECT SUM(CASE WHEN s2.pay_method IS NULL OR s2.pay_method = '' OR s2.pay_method = '-' OR s2.pay_method = 'entregado' THEN s2.total_cents ELSE 0 END)
                            FROM sales s2
                            JOIN crm_client_sales cs2 ON s2.id = cs2.sale_id
                            WHERE cs2.client_id = c.id
                        ), 0) as total_debt_cents
                    FROM clients c
                    JOIN crm_client_stage cs ON cs.client_id = c.id
                    JOIN crm_stages st ON cs.stage_id = st.id
                    LEFT JOIN crm_stage_history sh ON sh.client_id = c.id AND sh.new_stage_id = ${stageId}
                    WHERE cs.stage_id = ${stageId} AND c.seller_id = ${sellerId}
                    ORDER BY cs.updated_at DESC
                `;
                return json(clients);
            }
            
            if (action === 'get_client_stage') {
                const clientId = Number(params.get('client_id'));
                if (!clientId) return json({ error: 'Missing client_id' }, 400);
                
                const clientStage = await sql`
                    SELECT cs.*, s.name as stage_name, s.color 
                    FROM crm_client_stage cs
                    JOIN crm_stages s ON cs.stage_id = s.id
                    WHERE cs.client_id = ${clientId}
                `;
                return json(clientStage[0] || null);
            }

            if (action === 'get_history') {
                const clientId = Number(params.get('client_id'));
                if (!clientId) return json({ error: 'Missing client_id' }, 400);
                
                const history = await sql`
                    SELECT h.*, 
                           s1.name as old_stage_name, s1.color as old_stage_color,
                           s2.name as new_stage_name, s2.color as new_stage_color,
                           sel.name as changed_by_name
                    FROM crm_stage_history h
                    LEFT JOIN crm_stages s1 ON h.old_stage_id = s1.id
                    LEFT JOIN crm_stages s2 ON h.new_stage_id = s2.id
                    LEFT JOIN sellers sel ON h.changed_by = sel.id
                    WHERE h.client_id = ${clientId}
                    ORDER BY h.changed_at DESC
                `;
                return json(history);
            }

            if (action === 'get_actions') {
                const clientId = Number(params.get('client_id'));
                if (!clientId) return json({ error: 'Missing client_id' }, 400);

                const actions = await sql`
                    SELECT 
                        id, client_id, seller_id, activity_type as action_type, description as note, created_at, created_by as person_name
                    FROM crm_activities
                    WHERE client_id = ${clientId}
                    ORDER BY created_at DESC
                `;
                return json(actions);
            }

            return json({ error: 'Invalid GET action' }, 400);
        }

        if (method === 'POST') {
            const body = JSON.parse(event.body || '{}');
            const action = body.action;

            if (action === 'set_stage') {
                const { client_id, stage_id, note, user_id } = body;
                if (!client_id || !stage_id) return json({ error: 'Missing client_id or stage_id' }, 400);

                // Find old stage
                const oldStageRes = await sql`SELECT stage_id FROM crm_client_stage WHERE client_id = ${client_id}`;
                const oldStageId = oldStageRes.length > 0 ? oldStageRes[0].stage_id : null;

                // Insert into history
                await sql`
                    INSERT INTO crm_stage_history (client_id, old_stage_id, new_stage_id, note, changed_by)
                    VALUES (${client_id}, ${oldStageId}, ${stage_id}, ${note || ''}, ${user_id || null})
                `;

                // Upsert current stage
                const upsert = await sql`
                    INSERT INTO crm_client_stage (client_id, stage_id, updated_by, updated_at)
                    VALUES (${client_id}, ${stage_id}, ${user_id || null}, now())
                    ON CONFLICT (client_id) 
                    DO UPDATE SET 
                        stage_id = EXCLUDED.stage_id, 
                        updated_by = EXCLUDED.updated_by,
                        updated_at = EXCLUDED.updated_at
                    RETURNING *
                `;

                return json({ success: true, client_stage: upsert[0] });
            }

            if (action === 'add_action') {
                const { client_id, action_type, note, seller_id } = body;
                if (!client_id || !action_type) return json({ error: 'Missing client_id or action_type' }, 400);

                const insert = await sql`
                    INSERT INTO crm_activities (client_id, activity_type, description, seller_id)
                    VALUES (${client_id}, ${action_type}, ${note || ''}, ${seller_id || null})
                    RETURNING id, client_id, activity_type as action_type, description as note, created_at, seller_id
                `;
                return json({ success: true, action: insert[0] });
            }

            if (action === 'create_stage') {
                const { name, color, order_index } = body;
                if (!name) return json({ error: 'Falta el nombre de la etapa' }, 400);

                // Auto-assign highest order if not provided
                let orderIdx = order_index;
                if (!orderIdx) {
                    const maxRow = await sql`SELECT COALESCE(MAX(order_index), 0) as mx FROM crm_stages`;
                    orderIdx = Number(maxRow[0].mx) + 1;
                }

                const inserted = await sql`
                    INSERT INTO crm_stages (name, color, order_index, is_active)
                    VALUES (${name.trim()}, ${color || '#808080'}, ${orderIdx}, true)
                    RETURNING *
                `;
                return json({ success: true, stage: inserted[0] });
            }

            if (action === 'update_stage') {
                const { id, name, color, order_index, is_active } = body;
                if (!id) return json({ error: 'Falta id de etapa' }, 400);

                const updated = await sql`
                    UPDATE crm_stages SET
                        name = ${name},
                        color = ${color || '#808080'},
                        order_index = ${order_index},
                        is_active = ${is_active !== false}
                    WHERE id = ${id}
                    RETURNING *
                `;
                return json({ success: true, stage: updated[0] });
            }

            if (action === 'delete_stage') {
                const { id } = body;
                if (!id) return json({ error: 'Falta id de etapa' }, 400);

                // Check if any clients are in this stage
                const inUse = await sql`SELECT COUNT(*) as cnt FROM crm_client_stage WHERE stage_id = ${id}`;
                if (Number(inUse[0].cnt) > 0) {
                    // Soft-delete: mark inactive so existing client assignments remain valid
                    await sql`UPDATE crm_stages SET is_active = false WHERE id = ${id}`;
                    return json({ success: true, soft_deleted: true, message: `${inUse[0].cnt} clientes tenían esta etapa. La etapa quedó oculta (inactiva) pero sus registros se conservan.` });
                }
                // Hard delete only if no clients assigned
                await sql`DELETE FROM crm_stages WHERE id = ${id}`;
                return json({ success: true, deleted: true });
            }

            if (action === 'reorder_stages') {
                // body.order: array of { id, order_index }
                const order = body.order;
                if (!Array.isArray(order) || order.length === 0) return json({ error: 'Falta array order' }, 400);

                for (const item of order) {
                    await sql`UPDATE crm_stages SET order_index = ${item.order_index} WHERE id = ${item.id}`;
                }
                return json({ success: true });
            }

            if (action === 'delete_history') {
                const { id } = body;
                if (!id) return json({ error: 'Falta id' }, 400);
                await sql`DELETE FROM crm_stage_history WHERE id = ${id}`;
                return json({ success: true });
            }

            if (action === 'delete_action') {
                const { id } = body;
                if (!id) return json({ error: 'Falta id' }, 400);
                await sql`DELETE FROM crm_activities WHERE id = ${id}`;
                return json({ success: true });
            }

            return json({ error: 'Invalid POST action' }, 400);

        }

        return json({ error: 'Method not supported' }, 405);
    } catch (err) {
        console.error('Error in crm-stages API:', err);
        return json({ error: String(err) }, 500);
    }
}
