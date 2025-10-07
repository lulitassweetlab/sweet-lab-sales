import { ensureSchema, sql } from './_db.js';

function json(body, status = 200) {
	return { statusCode: status, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) };
}

export async function handler(event) {
	try {
		await ensureSchema();
		if (event.httpMethod === 'OPTIONS') return json({ ok: true });
		
		// Handle PATCH request to mark notification as read/unread
		if (event.httpMethod === 'PATCH') {
			const body = JSON.parse(event.body || '{}');
			const notificationId = Number(body.id);
			const isRead = body.is_read;
			
			if (!notificationId) {
				return json({ error: 'ID de notificación requerido' }, 400);
			}
			
			if (typeof isRead !== 'boolean') {
				return json({ error: 'is_read debe ser un booleano' }, 400);
			}
			
			// Update read_at: set to current timestamp if marking as read, null if marking as unread
			const readAt = isRead ? new Date() : null;
			const [updated] = await sql`
				UPDATE notifications 
				SET read_at = ${readAt}
				WHERE id = ${notificationId}
				RETURNING id, type, seller_id, sale_id, sale_day_id, message, actor_name, icon_url, pay_method, created_at, read_at
			`;
			
			if (!updated) {
				return json({ error: 'Notificación no encontrada' }, 404);
			}
			
			return json(updated);
		}
		
		if (event.httpMethod !== 'GET') return json({ error: 'Método no permitido' }, 405);
		
		const params = new URLSearchParams(event.rawQuery || (event.queryStringParameters ? new URLSearchParams(event.queryStringParameters).toString() : ''));
		const afterId = Number(params.get('after_id')) || 0;
		const beforeId = Number(params.get('before_id')) || 0;
		const sinceParam = params.get('since');
		const limitParamRaw = Number(params.get('limit')) || 0;
		const limitParam = Math.max(1, Math.min(200, limitParamRaw || 100));
		let rows;
		if (afterId) {
			rows = await sql`SELECT id, type, seller_id, sale_id, sale_day_id, message, actor_name, icon_url, pay_method, created_at, read_at FROM notifications WHERE id > ${afterId} ORDER BY id ASC LIMIT ${limitParam}`;
		} else if (beforeId) {
			rows = await sql`SELECT id, type, seller_id, sale_id, sale_day_id, message, actor_name, icon_url, pay_method, created_at, read_at FROM notifications WHERE id < ${beforeId} ORDER BY id DESC LIMIT ${limitParam}`;
		} else if (sinceParam) {
			rows = await sql`SELECT id, type, seller_id, sale_id, sale_day_id, message, actor_name, icon_url, pay_method, created_at, read_at FROM notifications WHERE created_at > ${new Date(sinceParam)} ORDER BY created_at ASC, id ASC LIMIT ${limitParam}`;
		} else {
			rows = await sql`SELECT id, type, seller_id, sale_id, sale_day_id, message, actor_name, icon_url, pay_method, created_at, read_at FROM notifications ORDER BY id DESC LIMIT ${limitParam}`;
		}
		return json(rows);
	} catch (e) {
		return json({ error: String(e) }, 500);
	}
}

