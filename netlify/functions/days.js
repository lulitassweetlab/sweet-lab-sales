import { ensureSchema, sql, getOrCreateDayId, notify } from './_db.js';

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
				const rows = await sql`SELECT id, day FROM sale_days WHERE seller_id=${sellerId} ORDER BY day DESC`;
				return json(rows);
			}
			case 'POST': {
				const data = JSON.parse(event.body || '{}');
				const sellerId = Number(data.seller_id);
				let day = (data.day || '').toString();
				if (!sellerId) return json({ error: 'seller_id requerido' }, 400);
				if (!day) {
					const now = new Date();
					const iso = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())).toISOString().slice(0,10);
					day = iso;
				}
				const id = await getOrCreateDayId(sellerId, day);
				try {
					const seller = (await sql`SELECT name FROM sellers WHERE id=${sellerId}`)[0];
					const sellerName = seller?.name || '';
					await notify({ type: 'day_created', sellerId, saleDayId: id, message: `Nueva fecha ${day} para ${sellerName}`, actorName: (data._actor_name || '').toString() });
				} catch {}
				return json({ id, day }, 201);
			}
			case 'PUT': {
				const data = JSON.parse(event.body || '{}');
				const id = Number(data.id);
				const day = (data.day || '').toString();
				if (!id || !day) return json({ error: 'id y day requeridos' }, 400);
				const [row] = await sql`UPDATE sale_days SET day=${day} WHERE id=${id} RETURNING id, day`;
				return json(row || { id, day });
			}
			case 'DELETE': {
				const params = new URLSearchParams(event.rawQuery || event.queryStringParameters ? event.rawQuery || '' : '');
				const idParam = params.get('id') || (event.queryStringParameters && event.queryStringParameters.id);
				const id = Number(idParam);
				if (!id) return json({ error: 'id requerido' }, 400);
				await sql`DELETE FROM sale_days WHERE id=${id}`;
				return json({ ok: true });
			}
			default:
				return json({ error: 'Método no permitido' }, 405);
		}
	} catch (err) {
		return json({ error: String(err) }, 500);
	}
}