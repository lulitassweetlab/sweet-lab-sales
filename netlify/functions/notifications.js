import { ensureSchema, sql } from './_db.js';

function json(body, status = 200) {
	return { statusCode: status, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) };
}

export async function handler(event) {
	try {
		await ensureSchema();
		if (event.httpMethod === 'OPTIONS') return json({ ok: true });
		if (event.httpMethod !== 'GET') return json({ error: 'Método no permitido' }, 405);
		const params = new URLSearchParams(event.rawQuery || (event.queryStringParameters ? new URLSearchParams(event.queryStringParameters).toString() : ''));
		const afterId = Number(params.get('after_id')) || 0;
		const beforeId = Number(params.get('before_id')) || 0;
		const sinceParam = params.get('since');
		const limitParamRaw = Number(params.get('limit')) || 0;
		const limitParam = Math.max(1, Math.min(200, limitParamRaw || 100));
		let rows;
		if (afterId) {
			rows = await sql`SELECT id, type, seller_id, sale_id, sale_day_id, message, actor_name, icon_url, pay_method, created_at FROM notifications WHERE id > ${afterId} ORDER BY id ASC LIMIT ${limitParam}`;
		} else if (beforeId) {
			rows = await sql`SELECT id, type, seller_id, sale_id, sale_day_id, message, actor_name, icon_url, pay_method, created_at FROM notifications WHERE id < ${beforeId} ORDER BY id DESC LIMIT ${limitParam}`;
		} else if (sinceParam) {
			rows = await sql`SELECT id, type, seller_id, sale_id, sale_day_id, message, actor_name, icon_url, pay_method, created_at FROM notifications WHERE created_at > ${new Date(sinceParam)} ORDER BY created_at ASC, id ASC LIMIT ${limitParam}`;
		} else {
			rows = await sql`SELECT id, type, seller_id, sale_id, sale_day_id, message, actor_name, icon_url, pay_method, created_at FROM notifications ORDER BY id DESC LIMIT ${limitParam}`;
		}
		return json(rows);
	} catch (e) {
		return json({ error: String(e) }, 500);
	}
}

