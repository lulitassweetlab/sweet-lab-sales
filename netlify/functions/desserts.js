import { ensureSchema, sql, getDesserts } from './_db.js';

function json(body, status = 200) {
	return { statusCode: status, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) };
}

export async function handler(event) {
	try {
		await ensureSchema();
		if (event.httpMethod === 'OPTIONS') return json({ ok: true });
		
		switch (event.httpMethod) {
			case 'GET': {
				const desserts = await getDesserts();
				return json(desserts);
			}
			case 'POST': {
				const data = JSON.parse(event.body || '{}');
				const name = (data.name || '').toString().trim();
				const shortCode = (data.short_code || '').toString().trim().toLowerCase();
				const salePrice = Number(data.sale_price || 0) || 0;
				const position = Number(data.position || 0) || 0;
				
				if (!name) return json({ error: 'name requerido' }, 400);
				if (!shortCode) return json({ error: 'short_code requerido' }, 400);
				if (salePrice <= 0) return json({ error: 'sale_price debe ser mayor a 0' }, 400);
				
				const [row] = await sql`
					INSERT INTO desserts (name, short_code, sale_price, position)
					VALUES (${name}, ${shortCode}, ${salePrice}, ${position})
					RETURNING id, name, short_code, sale_price, is_active, position
				`;
				return json(row, 201);
			}
			case 'PUT': {
				const data = JSON.parse(event.body || '{}');
				const id = Number(data.id || 0) || 0;
				if (!id) return json({ error: 'id requerido' }, 400);
				
				const name = (data.name || '').toString().trim();
				const salePrice = Number(data.sale_price || 0) || 0;
				const position = Number(data.position || 0) || 0;
				const isActive = data.is_active !== undefined ? Boolean(data.is_active) : true;
				
				if (!name) return json({ error: 'name requerido' }, 400);
				if (salePrice <= 0) return json({ error: 'sale_price debe ser mayor a 0' }, 400);
				
				const [row] = await sql`
					UPDATE desserts
					SET name = ${name}, sale_price = ${salePrice}, position = ${position}, is_active = ${isActive}, updated_at = now()
					WHERE id = ${id}
					RETURNING id, name, short_code, sale_price, is_active, position
				`;
				return json(row);
			}
			case 'DELETE': {
				const raw = typeof event.rawQuery === 'string' ? event.rawQuery : (event.queryStringParameters ? new URLSearchParams(event.queryStringParameters).toString() : '');
				const params = new URLSearchParams(raw);
				const id = Number(params.get('id') || 0) || 0;
				
				if (!id) return json({ error: 'id requerido' }, 400);
				
				// Soft delete: just mark as inactive
				await sql`UPDATE desserts SET is_active = false, updated_at = now() WHERE id = ${id}`;
				return json({ ok: true });
			}
			default:
				return json({ error: 'Método no permitido' }, 405);
		}
	} catch (err) {
		return json({ error: String(err) }, 500);
	}
}
