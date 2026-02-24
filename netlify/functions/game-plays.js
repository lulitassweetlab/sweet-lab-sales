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

        if (event.httpMethod === 'GET') {
            // Get all game plays ordered by most recent first
            const plays = await sql`
				SELECT 
					id,
					customer_name,
					whatsapp,
					birth_date,
					seller_name,
					prize_type,
					prize_value,
					played_at,
					ip_address
				FROM game_plays
				ORDER BY played_at DESC
			`;

            return json(plays);
        }

        if (event.httpMethod === 'DELETE') {
            const params = getQueryParams(event);
            const id = Number(params.get('id') || 0);
            if (!id) return json({ error: 'id inválido' }, 400);

            const deleted = await sql`DELETE FROM game_plays WHERE id = ${id} RETURNING id`;
            if (!deleted.length) return json({ error: 'Registro no encontrado' }, 404);
            return json({ ok: true, deletedId: deleted[0].id });
        }

        return json({ error: 'Método no permitido' }, 405);

    } catch (err) {
        console.error('Error in game-plays:', err);
        return json({ error: String(err) }, 500);
    }
}
