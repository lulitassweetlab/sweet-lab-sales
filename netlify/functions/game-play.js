import { ensureSchema, sql } from './_db.js';
import { getConfiguredGamePrizes } from './_game-prizes.js';

function json(body, status = 200) {
    return { statusCode: status, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) };
}

function normalizeBirthDate(rawValue) {
    const text = String(rawValue || '').trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return '';
    if (text < '1900-01-01') return '';
    if (text > new Date().toISOString().slice(0, 10)) return '';

    const parsed = new Date(`${text}T00:00:00Z`);
    if (!Number.isFinite(parsed.getTime())) return '';
    if (parsed.toISOString().slice(0, 10) !== text) return '';
    return text;
}

// Generate weighted random prize
function getRandomPrize(prizes) {
    if (!Array.isArray(prizes) || prizes.length === 0) {
        throw new Error('No hay premios configurados');
    }

    const totalWeight = prizes.reduce((sum, p) => sum + Math.max(0, Number(p?.probability || 0) || 0), 0);
    if (totalWeight <= 0) {
        return prizes[prizes.length - 1];
    }

    let random = Math.random() * totalWeight;

    for (const prize of prizes) {
        random -= Math.max(0, Number(prize?.probability || 0) || 0);
        if (random <= 0) {
            return prize;
        }
    }

    // Fallback to smallest prize
    return prizes[prizes.length - 1];
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
        const birthDate = normalizeBirthDate(data.birthDate || data.birth_date || '');
        const seller = (data.seller || '').trim();

        // Validate input
        if (!name || !whatsapp || !seller || !birthDate) {
            return json({ error: 'Datos incompletos' }, 400);
        }

        // Double-check if already played
        const existing = await sql`
			SELECT id FROM game_plays WHERE whatsapp = ${whatsapp} LIMIT 1
		`;

        if (existing.length > 0) {
            return json({
                error: 'Ya has jugado antes',
                alreadyPlayed: true
            }, 409);
        }

        // Generate random prize
        const configuredPrizes = await getConfiguredGamePrizes();
        const prize = getRandomPrize(configuredPrizes);

        // Get IP address for tracking
        const ip = event.headers['x-forwarded-for'] ||
            event.headers['x-real-ip'] ||
            'unknown';

        // Store the game play
        const [result] = await sql`
			INSERT INTO game_plays (
				customer_name,
				whatsapp,
				birth_date,
				seller_name,
				prize_type,
				prize_value,
				ip_address
			) VALUES (
				${name},
				${whatsapp},
				${birthDate},
				${seller},
				${prize.type},
				${prize.value},
				${ip}
			)
			RETURNING id, customer_name, birth_date, prize_type, prize_value, played_at
		`;

        return json({
            ok: true,
            prize: {
                type: prize.type,
                label: prize.label,
                value: prize.value,
                color: prize.color
            },
            playId: result.id,
            playedAt: result.played_at
        });

    } catch (err) {
        console.error('Error in game-play:', err);
        return json({ error: String(err) }, 500);
    }
}
