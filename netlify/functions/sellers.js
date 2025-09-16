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
				const rows = await sql`SELECT id, name, bill_color FROM sellers ORDER BY name`;
				return json(rows);
			}
			case 'POST': {
				const data = JSON.parse(event.body || '{}');
				const name = (data.name || '').trim();
				if (!name) return json({ error: 'Nombre requerido' }, 400);
				const [row] = await sql`INSERT INTO sellers (name) VALUES (${name}) ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name RETURNING id, name, bill_color`;
				return json(row, 201);
			}
			case 'PATCH': {
				// Update seller properties (currently bill_color)
				// Body: { id? or name?, bill_color }
				const data = JSON.parse(event.body || '{}');
				const id = Number(data.id || 0) || null;
				const rawName = (data.name || '').toString().trim();
				const billColor = (data.bill_color ?? null);
				if (!id && !rawName) return json({ error: 'id o name requerido' }, 400);
				if (billColor !== null && typeof billColor !== 'string') return json({ error: 'bill_color inválido' }, 400);
				let targetId = id;
				if (!targetId) {
					const found = await sql`SELECT id FROM sellers WHERE lower(name)=lower(${rawName}) LIMIT 1`;
					if (!found.length) return json({ error: 'Vendedor no encontrado' }, 404);
					targetId = found[0].id;
				}
				const [row] = await sql`UPDATE sellers SET bill_color=${billColor} WHERE id=${targetId} RETURNING id, name, bill_color`;
				return json(row);
			}
			case 'DELETE': {
				const params = new URLSearchParams(event.rawQuery || event.queryStringParameters ? event.rawQuery || '' : '');
				const idParam = params.get('id');
				const nameParam = params.get('name');
				if (!idParam && !nameParam) return json({ error: 'id o name requerido' }, 400);
				if (idParam) {
					const id = Number(idParam);
					if (!id) return json({ error: 'id inválido' }, 400);
					await sql`DELETE FROM sellers WHERE id=${id}`;
					return json({ ok: true, deleted_id: id });
				}
				// If deleting by name, keep the oldest (smallest id) and delete the rest (case-insensitive)
				const nm = (nameParam || '').toString();
				if (!nm.trim()) return json({ error: 'name inválido' }, 400);
				const rows = await sql`SELECT id, name FROM sellers WHERE lower(name)=lower(${nm}) ORDER BY id ASC`;
				if (rows.length <= 1) return json({ ok: true, kept_id: rows[0]?.id || null, deleted: 0 });
				const keepId = rows[0].id;
				const toDelete = rows.slice(1).map(r => r.id);
				await sql`DELETE FROM sellers WHERE id = ANY(${toDelete})`;
				return json({ ok: true, kept_id: keepId, deleted: toDelete.length });
			}
			default:
				return json({ error: 'Método no permitido' }, 405);
		}
	} catch (err) {
		return json({ error: String(err) }, 500);
	}
}