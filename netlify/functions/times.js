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
				const raw = typeof event.rawQuery === 'string' ? event.rawQuery : (event.queryStringParameters ? new URLSearchParams(event.queryStringParameters).toString() : '');
				const params = new URLSearchParams(raw);
				const dessert = params.get('dessert');
				const limit = Math.min(200, Math.max(1, Number(params.get('limit') || 50)));
				if (dessert) {
					const rows = await sql`SELECT id, dessert, steps, total_elapsed_ms, actor_name, created_at FROM time_sessions WHERE lower(dessert)=lower(${dessert}) ORDER BY id DESC LIMIT ${limit}`;
					return json(rows);
				}
				const rows = await sql`SELECT id, dessert, steps, total_elapsed_ms, actor_name, created_at FROM time_sessions ORDER BY id DESC LIMIT ${limit}`;
				return json(rows);
			}
			case 'POST': {
				const data = JSON.parse(event.body || '{}');
				const dessert = (data.dessert || '').toString();
				const steps = Array.isArray(data.steps) ? data.steps : [];
				const total = Number(data.total_elapsed_ms || 0) || 0;
				const actor = (data.actor_name || '').toString() || null;
				if (!dessert || !steps.length) return json({ error: 'Datos incompletos' }, 400);
				const [row] = await sql`INSERT INTO time_sessions (dessert, steps, total_elapsed_ms, actor_name) VALUES (${dessert}, ${JSON.stringify(steps)}, ${total}, ${actor}) RETURNING id, dessert, steps, total_elapsed_ms, actor_name, created_at`;
				return json(row, 201);
			}
			default:
				return json({ error: 'Método no permitido' }, 405);
		}
	} catch (err) {
		return json({ error: String(err) }, 500);
	}
}

