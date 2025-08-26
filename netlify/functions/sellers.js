import { ensureSchema, sql } from './_db.js';

function json(body, status = 200) {
	return { statusCode: status, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) };
}

export async function handler(event) {
	try {
		await ensureSchema();
		if (event.httpMethod === 'OPTIONS') return json({ ok: true });
		switch (event.httpMethod) {
			case 'GET': {
				const rows = await sql`SELECT id, name FROM sellers ORDER BY name`;
				return json(rows);
			}
			case 'POST': {
				const data = JSON.parse(event.body || '{}');
				const name = (data.name || '').trim();
				if (!name) return json({ error: 'Nombre requerido' }, 400);
				const [row] = await sql`INSERT INTO sellers (name) VALUES (${name}) ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name RETURNING id, name`;
				return json(row, 201);
			}
			default:
				return json({ error: 'Método no permitido' }, 405);
		}
	} catch (err) {
		return json({ error: String(err) }, 500);
	}
}