import { ensureSchema, sql } from './_db.js';

function json(body, status = 200) {
    return { statusCode: status, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) };
}

export async function handler(event) {
    try {
        await ensureSchema();

        if (event.httpMethod === 'OPTIONS') return json({ ok: true });

        if (event.httpMethod !== 'POST') {
            return json({ error: 'Método no permitido' }, 405);
        }

        const data = JSON.parse(event.body || '{}');
        const name = (data.name || '').trim();
        const whatsapp = (data.whatsapp || '').trim();
        const seller = (data.seller || '').trim();

        // Validate input
        if (!name || name.length < 3) {
            return json({ error: 'Nombre inválido' }, 400);
        }

        if (!whatsapp || !/^\d{10}$/.test(whatsapp)) {
            return json({ error: 'WhatsApp inválido' }, 400);
        }

        if (!seller) {
            return json({ error: 'Vendedor requerido' }, 400);
        }

        // Check if WhatsApp has already played
        const existing = await sql`
			SELECT id, customer_name, prize_type, prize_value, played_at
			FROM game_plays
			WHERE whatsapp = ${whatsapp}
			LIMIT 1
		`;

        if (existing.length > 0) {
            return json({
                error: 'Ya has jugado antes',
                alreadyPlayed: true,
                previousPlay: existing[0]
            }, 409);
        }

        // Registration successful - customer can proceed to play
        return json({
            ok: true,
            canPlay: true,
            message: 'Registro exitoso'
        });

    } catch (err) {
        console.error('Error in game-register:', err);
        return json({ error: String(err) }, 500);
    }
}
