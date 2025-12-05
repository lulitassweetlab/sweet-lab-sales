import { ensureSchema, sql } from './_db.js';

function json(body, status = 200) {
    return { statusCode: status, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) };
}

export async function handler(event) {
    try {
        console.log('game-register: Starting handler');

        // Ensure schema
        console.log('game-register: Calling ensureSchema');
        await ensureSchema();
        console.log('game-register: Schema ensured successfully');

        if (event.httpMethod === 'OPTIONS') return json({ ok: true });

        if (event.httpMethod !== 'POST') {
            return json({ error: 'Método no permitido' }, 405);
        }

        console.log('game-register: Parsing request body');
        const data = JSON.parse(event.body || '{}');
        const name = (data.name || '').trim();
        const whatsapp = (data.whatsapp || '').trim();
        const seller = (data.seller || '').trim();

        console.log('game-register: Validating input', { name, whatsapp, seller });

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
        console.log('game-register: Checking if user has already played');
        const existing = await sql`
			SELECT id, customer_name, prize_type, prize_value, played_at
			FROM game_plays
			WHERE whatsapp = ${whatsapp}
			LIMIT 1
		`;
        console.log('game-register: Query completed', { found: existing.length });

        if (existing.length > 0) {
            return json({
                error: 'Ya has jugado antes',
                alreadyPlayed: true,
                previousPlay: existing[0]
            }, 409);
        }

        // Registration successful - customer can proceed to play
        console.log('game-register: Registration successful');
        return json({
            ok: true,
            canPlay: true,
            message: 'Registro exitoso'
        });

    } catch (err) {
        console.error('game-register ERROR:', err);
        console.error('game-register ERROR stack:', err.stack);
        console.error('game-register ERROR message:', err.message);
        return json({
            error: String(err),
            message: err.message,
            stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
        }, 500);
    }
}
