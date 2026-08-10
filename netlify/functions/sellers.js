import { ensureSchema, sql } from './_db.js';

function json(body, status = 200) {
    return { statusCode: status, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) };
}

export async function handler(event) {
    try {
        await ensureSchema();
        if (event.httpMethod === 'OPTIONS') return json({ ok: true });

        async function getRole(evt, body = null) {
            try {
                const h = evt.headers || {};
                const hActor = (h['X-Actor-Name'] || h['x-actor-name'] || h['x-actor'] || '').toString();
                let bActor = '';
                try { if (body) bActor = (body.actor_name || body._actor_name || body.username || '').toString(); } catch {}
                const actor = (hActor || bActor || '').trim().toLowerCase();
                if (!actor) return 'user';
                if (['jorge', 'jorgecordoba', 'admin', 'marcela', 'aleja', 'lulitas'].includes(actor)) return 'admin';
                const rows = await sql`SELECT role FROM users WHERE lower(username)=lower(${actor}) LIMIT 1`;
                if (rows && rows[0] && rows[0].role) {
                    const r = String(rows[0].role).toLowerCase();
                    if (r === 'admin' || r === 'superadmin') return 'admin';
                }
                return 'user';
            } catch {
                return 'user';
            }
        }

        switch (event.httpMethod) {
            case 'GET': {
                const rows = await sql`SELECT id, name, bill_color, archived_at, whatsapp, game_enabled, position, parent_id FROM sellers WHERE archived_at IS NULL ORDER BY position ASC, name ASC`;
                return json(rows);
            }
            case 'POST': {
                const data = JSON.parse(event.body || '{}');
                const role = await getRole(event, data);
                if (role !== 'admin') return json({ error: 'No autorizado' }, 403);

                const name = (data.name || '').trim();
                if (!name) return json({ error: 'Nombre requerido' }, 400);

                const [row] = await sql`
                    INSERT INTO sellers (name, archived_at) 
                    VALUES (${name}, NULL) 
                    ON CONFLICT (name) 
                    DO UPDATE SET archived_at = NULL, name = EXCLUDED.name 
                    RETURNING id, name, bill_color, archived_at, whatsapp, game_enabled, position, parent_id
                `;
                return json(row, 201);
            }
            case 'PATCH': {
                const data = JSON.parse(event.body || '{}');
                const role = await getRole(event, data);
                if (role !== 'admin') return json({ error: 'No autorizado' }, 403);
                
                // Bulk update support
                if (Array.isArray(data)) {
                    const results = [];
                    for (const item of data) {
                        const id = Number(item.id);
                        if (!id) continue;
                        
                        if (item.position !== undefined) {
                            const [row] = await sql`UPDATE sellers SET position = ${Number(item.position) || 0} WHERE id = ${id} RETURNING id, name, position`;
                            if (row) results.push(row);
                        }
                    }
                    return json({ ok: true, count: results.length, items: results });
                }
                
                const id = Number(data.id);
                if (!id) return json({ error: 'ID requerido' }, 400);

                if (data.whatsapp !== undefined) {
                    const [row] = await sql`UPDATE sellers SET whatsapp = ${data.whatsapp || null} WHERE id = ${id} RETURNING id, name, whatsapp`;
                    return json(row);
                }

                if (data.game_enabled !== undefined) {
                    const [row] = await sql`UPDATE sellers SET game_enabled = ${!!data.game_enabled} WHERE id = ${id} RETURNING id, name, game_enabled`;
                    return json(row);
                }

                if (data.position !== undefined) {
                    const [row] = await sql`UPDATE sellers SET position = ${Number(data.position) || 0} WHERE id = ${id} RETURNING id, name, position`;
                    return json(row);
                }

                if (data.parent_id !== undefined) {
                    const pIdValue = (data.parent_id === null || data.parent_id === "" || data.parent_id === undefined) ? null : Number(data.parent_id);
                    const [row] = await sql`UPDATE sellers SET parent_id = ${pIdValue} WHERE id = ${id} RETURNING id, name, parent_id`;
                    return json(row);
                }
                
                return json({ error: 'Nada que actualizar' }, 400);
            }
            default: return json({ error: 'Método no permitido' }, 405);
        }
    } catch (err) {
        console.error('API Sellers Error:', err);
        return json({ error: String(err) }, 500);
    }
}