import {
	getConfiguredGamePrizes,
	getTotalProbability,
	setGamePrizeProbability
} from './_game-prizes.js';

function json(body, status = 200) {
	return { statusCode: status, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) };
}

export async function handler(event) {
	try {
		if (event.httpMethod === 'OPTIONS') return json({ ok: true });

		if (event.httpMethod === 'GET') {
			const prizes = await getConfiguredGamePrizes();
			return json({
				ok: true,
				prizes,
				totalProbability: getTotalProbability(prizes)
			});
		}

		if (event.httpMethod === 'PUT') {
			const body = JSON.parse(event.body || '{}');
			const label = String(body?.label || '').trim();
			const probability = body?.probability;

			if (!label) {
				return json({ error: 'Premio inválido' }, 400);
			}

			const prizes = await setGamePrizeProbability(label, probability);
			return json({
				ok: true,
				prizes,
				totalProbability: getTotalProbability(prizes)
			});
		}

		return json({ error: 'Método no permitido' }, 405);
	} catch (err) {
		console.error('Error in game-probabilities:', err);
		const message = err instanceof Error ? err.message : String(err);
		const statusCode = Number(err?.statusCode);
		return json({ error: message }, Number.isInteger(statusCode) ? statusCode : 500);
	}
}
