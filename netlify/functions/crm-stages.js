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
                    SELECT a.*, sel.name as seller_name
                    FROM crm_stage_actions a
                    LEFT JOIN sellers sel ON a.seller_id = sel.id
                    WHERE a.client_id = ${clientId}
                    ORDER BY a.created_at DESC
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
                    INSERT INTO crm_stage_actions (client_id, action_type, note, seller_id)
                    VALUES (${client_id}, ${action_type}, ${note || ''}, ${seller_id || null})
                    RETURNING *
                `;
                return json({ success: true, action: insert[0] });
            }

            return json({ error: 'Invalid POST action' }, 400);
        }

        return json({ error: 'Method not supported' }, 405);
    } catch (err) {
        console.error('Error in crm-stages API:', err);
        return json({ error: String(err) }, 500);
    }
}
