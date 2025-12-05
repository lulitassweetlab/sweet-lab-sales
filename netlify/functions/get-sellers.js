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

		// Get all active (non-archived) sellers
		const rows = await sql`
			SELECT id, name 
			FROM sellers 
			WHERE archived_at IS NULL 
			ORDER BY name
		`;

		return json(rows);

	} catch (err) {
		console.error('Error in get-sellers:', err);
		return json({ error: String(err) }, 500);
	}
}
