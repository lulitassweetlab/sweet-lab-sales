import { ensureSchema, sql, recalcTotalForId } from './_db.js';

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
				const sellerId = Number(sellerIdParam);
				if (!sellerId) return json({ error: 'seller_id requerido' }, 400);
				const rows = await sql`SELECT id, seller_id, client_name, qty_arco, qty_melo, qty_mara, qty_oreo, total_cents, created_at FROM sales WHERE seller_id = ${sellerId} ORDER BY created_at ASC, id ASC`;
				return json(rows);
			}
			case 'POST': {
				const data = JSON.parse(event.body || '{}');
				const sellerId = Number(data.seller_id);
				if (!sellerId) return json({ error: 'seller_id requerido' }, 400);
				const [row] = await sql`INSERT INTO sales (seller_id) VALUES (${sellerId}) RETURNING id, seller_id, client_name, qty_arco, qty_melo, qty_mara, qty_oreo, total_cents, created_at`;
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
				await sql`UPDATE sales SET client_name=${client}, qty_arco=${qa}, qty_melo=${qm}, qty_mara=${qma}, qty_oreo=${qo} WHERE id=${id}`;
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