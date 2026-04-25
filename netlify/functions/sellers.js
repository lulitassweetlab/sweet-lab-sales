import { ensureSchema, sql } from './_db.js';

function json(body, status = 200) {
    return { statusCode: status, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) };
}

export async function handler(event) {
    try {
        await ensureSchema();
        if (event.httpMethod === 'OPTIONS') return json({ ok: true });

        // Force actor role to admin for these operations or default to user
        async function getRole(evt) {
            const h = evt.headers || {};
            const actorHeader = h['X-Actor-Name'] || h['x-actor-name'] || '';
            const actor = actorHeader.toLowerCase();
            if (['jorge', 'jorgecordoba', 'admin', 'marcela', 'aleja', 'lulitas'].includes(actor)) return 'admin';
            return 'user';
        }

        switch (event.httpMethod) {
            case 'GET': {
                const rows = await sql`
                    SELECT id, name, bill_color, archived_at, whatsapp, game_enabled, parent_id 
                    FROM sellers 
                    WHERE archived_at IS NULL
                    ORDER BY name
                `;
                return json(rows);
            }
            case 'PATCH': {
                const data = JSON.parse(event.body || '{}');
                const role = await getRole(event);
                if (role !== 'admin') return json({ error: 'No autorizado' }, 403);
                
                const id = Number(data.id);
                if (!id) return json({ error: 'ID requerido' }, 400);

                const updates = [];
                if (data.parent_id !== undefined) {
                    const pId = data.parent_id === null || data.parent_id === '' ? null : Number(data.parent_id);
                    updates.push(sql`parent_id = ${pId}`);
                }
                
                if (updates.length === 0) return json({ error: 'Sin cambios' }, 400);

                const [row] = await sql`
                    UPDATE sellers SET ${updates.reduce((a, b) => sql`${a}, ${b}`)}
                    WHERE id = ${id}
                    RETURNING id, name, parent_id
                `;
                return json(row);
            }
            default: return json({ error: 'Método no permitido' }, 405);
        }
    } catch (err) {
        console.error('API Sellers Error:', err);
        return json({ error: 'Error interno del servidor', details: String(err) }, 500);
    }
}