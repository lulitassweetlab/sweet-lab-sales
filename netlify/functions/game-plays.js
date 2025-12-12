import { ensureSchema, sql } from './_db.js';

function json(body, status = 200) {
    return { statusCode: status, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) };
}

export async function handler(event) {
    try {
        await ensureSchema();

        if (event.httpMethod === 'OPTIONS') return json({ ok: true });

        if (event.httpMethod !== 'GET') {
            return json({ error: 'Método no permitido' }, 405);
        }

        // Get all game plays ordered by most recent first
        const plays = await sql`
			SELECT 
				id,
				customer_name,
				whatsapp,
				seller_name,
				prize_type,
				prize_value,
				played_at,
				ip_address
			FROM game_plays
			ORDER BY played_at DESC
		`;

        return json(plays);

    } catch (err) {
        console.error('Error in game-plays:', err);
        return json({ error: String(err) }, 500);
    }
}
