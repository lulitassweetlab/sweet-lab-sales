import { ensureSchema, sql } from './_db.js';

function json(body, status = 200) {
    return { statusCode: status, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) };
}

export async function handler(event) {
    try {
        await ensureSchema();
        if (event.httpMethod === 'OPTIONS') return json({ ok: true });

        async function getRole(evt) {
            const h = evt.headers || {};
            const actorHeader = h['X-Actor-Name'] || h['x-actor-name'] || '';
            const actor = actorHeader.toLowerCase();
            if (['jorge', 'jorgecordoba', 'admin', 'marcela', 'aleja', 'lulitas'].includes(actor)) return 'admin';
            return 'user';
        }

        switch (event.httpMethod) {
            case 'GET': {
                const rows = await sql`SELECT id, name, bill_color, archived_at, whatsapp, game_enabled, parent_id FROM sellers WHERE archived_at IS NULL ORDER BY name`;
                return json(rows);
            }
            case 'PATCH': {
                const data = JSON.parse(event.body || '{}');
                const role = await getRole(event);
                if (role !== 'admin') return json({ error: 'No autorizado' }, 403);
                
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