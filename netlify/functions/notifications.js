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
				const params = new URLSearchParams(event.rawQuery || event.queryStringParameters ? event.rawQuery || '' : '');
				const sellerIdParam = params.get('seller_id') || (event.queryStringParameters && event.queryStringParameters.seller_id);
				const unreadOnlyParam = params.get('unread_only') || (event.queryStringParameters && event.queryStringParameters.unread_only);
				const limitParam = params.get('limit') || (event.queryStringParameters && event.queryStringParameters.limit);
				const sellerId = sellerIdParam ? Number(sellerIdParam) : null;
				const unreadOnly = unreadOnlyParam === 'true' || unreadOnlyParam === true;
				const limit = Math.max(1, Math.min(200, Number(limitParam || 50) || 50));
				let where = [];
				if (sellerId) where.push(sql`seller_id = ${sellerId}`);
				if (unreadOnly) where.push(sql`read_at IS NULL`);
				const whereSql = where.length ? sql`WHERE ${sql.join(where, sql` AND `)}` : sql``;
				const rows = await sql`SELECT id, type, seller_id, sale_id, sale_day_id, message, actor_name, created_at, read_at FROM notifications ${whereSql} ORDER BY created_at DESC, id DESC LIMIT ${limit}`;
				return json(rows);
			}
			case 'PUT': {
				const data = JSON.parse(event.body || '{}');
				const id = data.id ? Number(data.id) : null;
				const markAll = !!data.mark_all;
				const sellerId = data.seller_id ? Number(data.seller_id) : null;
				if (!id && !markAll) return json({ error: 'id o mark_all requerido' }, 400);
				if (id) {
					await sql`UPDATE notifications SET read_at = now() WHERE id = ${id}`;
					return json({ ok: true });
				}
				if (markAll) {
					if (sellerId) await sql`UPDATE notifications SET read_at = now() WHERE read_at IS NULL AND seller_id = ${sellerId}`; else await sql`UPDATE notifications SET read_at = now() WHERE read_at IS NULL`;
					return json({ ok: true });
				}
				return json({ ok: true });
			}
			default:
				return json({ error: 'Método no permitido' }, 405);
		}
	} catch (err) {
		return json({ error: String(err) }, 500);
	}
}

