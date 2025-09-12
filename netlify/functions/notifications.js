import { ensureSchema, sql } from './_db.js';

function json(body, status = 200) {
	return {
		statusCode: status,
		headers: {
			'Content-Type': 'application/json',
			'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
			'Pragma': 'no-cache',
			'Expires': '0'
		},
		body: JSON.stringify(body)
	};
}

export async function handler(event) {
	try {
		await ensureSchema();
		if (event.httpMethod === 'OPTIONS') return json({ ok: true });
		if (event.httpMethod !== 'GET') return json({ error: 'Método no permitido' }, 405);
		const params = new URLSearchParams(event.rawQuery || event.queryStringParameters ? event.rawQuery || '' : '');
		const afterId = Number(params.get('after_id')) || 0;
		const sinceParam = params.get('since');
		let rows;
		if (afterId) {
			rows = await sql`SELECT id, type, seller_id, sale_id, sale_day_id, message, actor_name, created_at FROM notifications WHERE id > ${afterId} ORDER BY id ASC LIMIT 100`;
		} else if (sinceParam) {
			rows = await sql`SELECT id, type, seller_id, sale_id, sale_day_id, message, actor_name, created_at FROM notifications WHERE created_at > ${new Date(sinceParam)} ORDER BY created_at ASC, id ASC LIMIT 100`;
		} else {
			rows = await sql`SELECT id, type, seller_id, sale_id, sale_day_id, message, actor_name, created_at FROM notifications ORDER BY id DESC LIMIT 20`;
		}
		return json(rows);
	} catch (e) {
		return json({ error: String(e) }, 500);
	}
}

