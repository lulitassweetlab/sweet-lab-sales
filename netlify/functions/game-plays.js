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
            const params = getQueryParams(event);
            const limit = Number(params.get('limit')) || 0;
            const offset = Number(params.get('offset')) || 0;

            let plays;
            if (limit > 0) {
                plays = await sql`
                    SELECT 
                        id,
                        customer_name,
                        prize_type,
                        prize_value,
                        played_at
                    FROM game_plays
                    ORDER BY played_at DESC
                    LIMIT ${limit} OFFSET ${offset}
                `;
            } else {
                // Return all but only essential columns for privacy/speed
                plays = await sql`
                    SELECT 
                        id,
                        customer_name,
                        prize_type,
                        prize_value,
                        played_at
                    FROM game_plays
                    ORDER BY played_at DESC
                `;
            }

            return json(plays);
        }

        if (event.httpMethod === 'DELETE') {
            const params = getQueryParams(event);
            const id = Number(params.get('id') || 0);
            if (!id) return json({ error: 'id inválido' }, 400);

            const deleted = await sql`DELETE FROM game_plays WHERE id = ${id} RETURNING id`;
            return json({ ok: true, deleted: deleted[0]?.id });
        }

        return json({ error: 'Método no permitido' }, 405);
    } catch (err) {
        console.error('Error in game-plays:', err);
        return json({ error: String(err) }, 500);
    }
}
