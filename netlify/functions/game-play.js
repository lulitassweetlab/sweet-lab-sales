import { ensureSchema, sql } from './_db.js';

function json(body, status = 200) {
    return { statusCode: status, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) };
}

// Prize configuration with probabilities
const prizes = [
    { type: 'free', label: 'POSTRE GRATIS', value: '🎂', probability: 5, color: '#fbbf24' },
    { type: 'discount', label: '70% DESC', value: '70%', probability: 2, color: '#f43f5e' },
    { type: 'discount', label: '50% DESC', value: '50%', probability: 5, color: '#ec4899' },
    { type: 'discount', label: '30% DESC', value: '30%', probability: 10, color: '#f472b6' },
    { type: 'discount', label: '20% DESC', value: '20%', probability: 15, color: '#f9a8d4' },
    { type: 'discount', label: '10% DESC', value: '10%', probability: 25, color: '#fbcfe8' },
    { type: 'discount', label: '5% DESC', value: '5%', probability: 38, color: '#fce7f3' }
];

// Generate weighted random prize
function getRandomPrize() {
    const totalWeight = prizes.reduce((sum, p) => sum + p.probability, 0);
    let random = Math.random() * totalWeight;

    for (const prize of prizes) {
        random -= prize.probability;
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
        const seller = (data.seller || '').trim();

        // Validate input
        if (!name || !whatsapp || !seller) {
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
        const prize = getRandomPrize();

        // Get IP address for tracking
        const ip = event.headers['x-forwarded-for'] ||
            event.headers['x-real-ip'] ||
            'unknown';

        // Store the game play
        const [result] = await sql`
			INSERT INTO game_plays (
				customer_name,
				whatsapp,
				seller_name,
				prize_type,
				prize_value,
				ip_address
			) VALUES (
				${name},
				${whatsapp},
				${seller},
				${prize.type},
				${prize.value},
				${ip}
			)
			RETURNING id, customer_name, prize_type, prize_value, played_at
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
