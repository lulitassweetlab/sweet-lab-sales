import { ensureSchema, sql, recalcTotalForId, getOrCreateDayId } from './_db.js';

function json(body, status = 200) {
	return { statusCode: status, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) };
}

export async function handler(event) {
	try {
		await ensureSchema();
		if (event.httpMethod === 'OPTIONS') return json({ ok: true });
		switch (event.httpMethod) {
			case 'GET': {
				const params = new URLSearchParams(event.rawQuery || event.queryStringParameters ? event.rawQuery || '' : '');
				const sellerIdParam = params.get('seller_id') || (event.queryStringParameters && event.queryStringParameters.seller_id);
				const dayIdParam = params.get('sale_day_id') || (event.queryStringParameters && event.queryStringParameters.sale_day_id);
				const sellerId = Number(sellerIdParam);
				const saleDayId = dayIdParam ? Number(dayIdParam) : null;
				if (!sellerId) return json({ error: 'seller_id requerido' }, 400);
				let rows;
				if (saleDayId) {
					rows = await sql`SELECT id, seller_id, sale_day_id, client_name, qty_arco, qty_melo, qty_mara, qty_oreo, is_paid, total_cents, created_at FROM sales WHERE seller_id = ${sellerId} AND sale_day_id=${saleDayId} ORDER BY created_at ASC, id ASC`;
				} else {
					rows = await sql`SELECT id, seller_id, sale_day_id, client_name, qty_arco, qty_melo, qty_mara, qty_oreo, is_paid, total_cents, created_at FROM sales WHERE seller_id = ${sellerId} ORDER BY created_at ASC, id ASC`;
				}
				return json(rows);
			}
			case 'POST': {
				const data = JSON.parse(event.body || '{}');
				const sellerId = Number(data.seller_id);
				let saleDayId = data.sale_day_id ? Number(data.sale_day_id) : null;
				if (!sellerId) return json({ error: 'seller_id requerido' }, 400);
				if (!saleDayId) {
					const now = new Date();
					const iso = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())).toISOString().slice(0,10);
					saleDayId = await getOrCreateDayId(sellerId, iso);
				}
				const [row] = await sql`INSERT INTO sales (seller_id, sale_day_id, is_paid) VALUES (${sellerId}, ${saleDayId}, false) RETURNING id, seller_id, sale_day_id, client_name, qty_arco, qty_melo, qty_mara, qty_oreo, is_paid, total_cents, created_at`;
				return json(row, 201);
			}
			case 'PUT': {
				const data = JSON.parse(event.body || '{}');
				const id = Number(data.id);
				if (!id) return json({ error: 'id requerido' }, 400);
				const client = (data.client_name ?? '').toString();
				const qa = Number(data.qty_arco ?? 0) || 0;
				const qm = Number(data.qty_melo ?? 0) || 0;
				const qma = Number(data.qty_mara ?? 0) || 0;
				const qo = Number(data.qty_oreo ?? 0) || 0;
				const paid = data.is_paid === true || data.is_paid === 'true';
				await sql`UPDATE sales SET client_name=${client}, qty_arco=${qa}, qty_melo=${qm}, qty_mara=${qma}, qty_oreo=${qo}, is_paid=${paid} WHERE id=${id}`;
				const row = await recalcTotalForId(id);
				return json(row);
			}
			case 'DELETE': {
				const params = new URLSearchParams(event.rawQuery || event.queryStringParameters ? event.rawQuery || '' : '');
				const idParam = params.get('id') || (event.queryStringParameters && event.queryStringParameters.id);
				const id = Number(idParam);
				if (!id) return json({ error: 'id requerido' }, 400);
				await sql`DELETE FROM sales WHERE id=${id}`;
				return json({ ok: true });
			}
			default:
				return json({ error: 'Método no permitido' }, 405);
		}
	} catch (err) {
		return json({ error: String(err) }, 500);
	}
}