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
				const start = params.get('start');
				const end = params.get('end');
				
				if (start && end) {
					// Get purchases in date range
					const rows = await sql`
						SELECT id, purchase_date, ingredient, quantity, unit_price, amount_cents, created_at
						FROM purchases
						WHERE purchase_date >= ${start} AND purchase_date <= ${end}
						ORDER BY purchase_date DESC, id DESC
					`;
					return json(rows);
				}
				
				// Get all purchases
				const rows = await sql`
					SELECT id, purchase_date, ingredient, quantity, unit_price, amount_cents, created_at
					FROM purchases
					ORDER BY purchase_date DESC, id DESC
				`;
				return json(rows);
			}
			
			case 'POST': {
				const data = JSON.parse(event.body || '{}');
				const purchaseDate = (data.purchase_date || '').toString();
				const purchases = Array.isArray(data.purchases) ? data.purchases : [];
				
				if (!purchaseDate) return json({ error: 'purchase_date requerido' }, 400);
				if (purchases.length === 0) return json({ error: 'purchases array requerido' }, 400);
				
				const actorName = event.headers['x-actor-name'] || data._actor_name || 'system';
				
				// Insert all purchases
				const inserted = [];
				for (const p of purchases) {
					const ingredient = (p.ingredient || '').toString();
					const quantity = Number(p.quantity || 0) || 0;
					const unitPrice = Number(p.unit_price || 0) || 0;
					const amountCents = Number(p.amount_cents || 0) || Math.round(quantity * unitPrice);
					
					if (!ingredient || quantity <= 0 || unitPrice <= 0) continue;
					
					const [row] = await sql`
						INSERT INTO purchases (purchase_date, ingredient, quantity, unit_price, amount_cents, actor_name)
						VALUES (${purchaseDate}, ${ingredient}, ${quantity}, ${unitPrice}, ${amountCents}, ${actorName})
						RETURNING id, purchase_date, ingredient, quantity, unit_price, amount_cents, created_at
					`;
					inserted.push(row);
				}
				
				return json({ ok: true, count: inserted.length, purchases: inserted }, 201);
			}
			
			case 'DELETE': {
				const raw = typeof event.rawQuery === 'string' ? event.rawQuery : (event.queryStringParameters ? new URLSearchParams(event.queryStringParameters).toString() : '');
				const params = new URLSearchParams(raw);
				const id = Number(params.get('id') || 0) || 0;
				
				if (!id) return json({ error: 'id requerido' }, 400);
				
				await sql`DELETE FROM purchases WHERE id = ${id}`;
				return json({ ok: true });
			}
			
			default:
				return json({ error: 'Método no permitido' }, 405);
		}
	} catch (err) {
		console.error('Error in purchases handler:', err);
		return json({ error: String(err) }, 500);
	}
}
