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
			case 'PUT': {
				// Update an existing time session (steps and/or total)
				const data = JSON.parse(event.body || '{}');
				const id = Number(data.id || 0) || 0;
				if (!id) return json({ error: 'Falta id' }, 400);
				const hasSteps = Array.isArray(data.steps);
				const incomingSteps = hasSteps ? data.steps : null;
				let total = (data.total_elapsed_ms == null) ? null : (Number(data.total_elapsed_ms) || 0);
				// If steps provided but total omitted, recompute from steps
				if (hasSteps && (total == null)) {
					try { total = (incomingSteps || []).reduce((acc, s) => acc + (Number(s?.elapsed_ms || 0) || 0), 0); } catch { total = 0; }
				}
				let row = null;
				if (hasSteps && (total != null)) {
					[row] = await sql`UPDATE time_sessions SET steps=${JSON.stringify(incomingSteps)}, total_elapsed_ms=${total} WHERE id=${id} RETURNING id, dessert, steps, total_elapsed_ms, actor_name, created_at`;
				} else if (hasSteps) {
					[row] = await sql`UPDATE time_sessions SET steps=${JSON.stringify(incomingSteps)} WHERE id=${id} RETURNING id, dessert, steps, total_elapsed_ms, actor_name, created_at`;
				} else if (total != null) {
					[row] = await sql`UPDATE time_sessions SET total_elapsed_ms=${total} WHERE id=${id} RETURNING id, dessert, steps, total_elapsed_ms, actor_name, created_at`;
				} else {
					return json({ error: 'Nada para actualizar' }, 400);
				}
				if (!row) return json({ error: 'No encontrado' }, 404);
				return json(row);
			}
			case 'DELETE': {
				// Delete an existing time session by id
				const raw = typeof event.rawQuery === 'string' ? event.rawQuery : (event.queryStringParameters ? new URLSearchParams(event.queryStringParameters).toString() : '');
				const params = new URLSearchParams(raw);
				let id = Number(params.get('id') || 0) || 0;
				if (!id) {
					try { const data = JSON.parse(event.body || '{}'); id = Number(data.id || 0) || 0; } catch {}
				}
				if (!id) return json({ error: 'Falta id' }, 400);
				const [row] = await sql`DELETE FROM time_sessions WHERE id=${id} RETURNING id`;
				if (!row) return json({ error: 'No encontrado' }, 404);
				return json({ ok: true, id: row.id });
			}
			default:
				return json({ error: 'Método no permitido' }, 405);
		}
	} catch (err) {
		return json({ error: String(err) }, 500);
	}
}

