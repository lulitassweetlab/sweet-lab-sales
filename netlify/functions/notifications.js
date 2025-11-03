import { ensureSchema, sql } from './_db.js';

// Rate limiting cache to prevent excessive polling
// Structure: Map<clientKey, { count: number, windowStart: timestamp, lastQuery: string }>
const requestCache = new Map();
const RATE_LIMIT_WINDOW = 5000; // 5 seconds
const MAX_REQUESTS_PER_WINDOW = 2; // Maximum 2 requests every 5 seconds
const CACHE_CLEANUP_THRESHOLD = 1000; // Clean up cache when it grows too large

function json(body, status = 200) {
	// Add cache headers to prevent unnecessary repeated calls
	const headers = {
		'Content-Type': 'application/json',
		'Cache-Control': 'no-cache, no-store, must-revalidate',
		'X-Invocation-Time': new Date().toISOString()
	};
	return { statusCode: status, headers, body: JSON.stringify(body) };
}

export async function handler(event) {
	try {
		// ⚠️ CRITICAL LOGGING: Track all invocations to identify polling source
		const timestamp = new Date().toISOString();
		const ip = event.headers['x-forwarded-for'] || event.headers['client-ip'] || 'unknown';
		const userAgent = event.headers['user-agent'] || 'unknown';
		const referer = event.headers['referer'] || 'none';
		const method = event.httpMethod;
		const query = event.rawQuery || '';
		
		console.log(`[NOTIFICATIONS] ${timestamp} | ${method} | IP: ${ip} | UA: ${userAgent} | Referer: ${referer} | Query: ${query}`);
		
		// 🛡️ RATE LIMITING: Prevent excessive polling
		// Skip rate limiting for PATCH requests (marking as read/unread) and OPTIONS
		if (method === 'GET') {
			const now = Date.now();
			const clientKey = `${ip}:${query}`; // Include query to allow different requests
			const clientData = requestCache.get(clientKey) || { count: 0, windowStart: now, lastQuery: query };
			
			// Check if we're in the same time window
			if (now - clientData.windowStart < RATE_LIMIT_WINDOW) {
				clientData.count++;
				
				// Detect excessive polling (same query repeated too frequently)
				if (clientData.count > MAX_REQUESTS_PER_WINDOW && clientData.lastQuery === query) {
					const waitTime = Math.ceil((RATE_LIMIT_WINDOW - (now - clientData.windowStart)) / 1000);
					console.warn(`[NOTIFICATIONS] 🚨 RATE LIMIT EXCEEDED | IP: ${ip} | Count: ${clientData.count} | Query: ${query}`);
					
					return json({ 
						error: 'Demasiadas solicitudes. Por favor espera unos segundos.',
						message: 'Too many requests detected. This may indicate automatic polling.',
						retryAfter: waitTime,
						hint: 'Si ves este mensaje frecuentemente, por favor recarga la página y limpia el caché del navegador.'
					}, 429);
				}
			} else {
				// New window, reset counter
				clientData.count = 1;
				clientData.windowStart = now;
			}
			
			clientData.lastQuery = query;
			requestCache.set(clientKey, clientData);
			
			// Cleanup old entries periodically
			if (requestCache.size > CACHE_CLEANUP_THRESHOLD) {
				const expirationTime = now - (RATE_LIMIT_WINDOW * 2);
				for (const [key, data] of requestCache.entries()) {
					if (data.windowStart < expirationTime) {
						requestCache.delete(key);
					}
				}
				console.log(`[NOTIFICATIONS] Cache cleanup: ${requestCache.size} entries remaining`);
			}
		}
		
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
		// Optional filters: seller (by id or name), sale_day_id
		let sellerIdFilter = Number(params.get('seller_id')) || 0;
		const sellerNameParamRaw = (params.get('seller') || '').toString().trim();
		if (!sellerIdFilter && sellerNameParamRaw && sellerNameParamRaw.toLowerCase() !== 'all' && sellerNameParamRaw.toLowerCase() !== 'todos') {
			try {
				const sidRows = await sql`SELECT id FROM sellers WHERE lower(name)=lower(${sellerNameParamRaw}) LIMIT 1`;
				sellerIdFilter = sidRows?.[0]?.id ? Number(sidRows[0].id) : 0;
			} catch {}
		}
		const saleDayIdFilter = Number(params.get('sale_day_id')) || 0;
		let rows;
		if (afterId) {
			if (sellerIdFilter && saleDayIdFilter) {
				rows = await sql`SELECT id, type, seller_id, sale_id, sale_day_id, message, actor_name, icon_url, pay_method, created_at, read_at FROM notifications WHERE id > ${afterId} AND seller_id = ${sellerIdFilter} AND sale_day_id = ${saleDayIdFilter} ORDER BY id ASC LIMIT ${limitParam}`;
			} else if (sellerIdFilter) {
				rows = await sql`SELECT id, type, seller_id, sale_id, sale_day_id, message, actor_name, icon_url, pay_method, created_at, read_at FROM notifications WHERE id > ${afterId} AND seller_id = ${sellerIdFilter} ORDER BY id ASC LIMIT ${limitParam}`;
			} else if (saleDayIdFilter) {
				rows = await sql`SELECT id, type, seller_id, sale_id, sale_day_id, message, actor_name, icon_url, pay_method, created_at, read_at FROM notifications WHERE id > ${afterId} AND sale_day_id = ${saleDayIdFilter} ORDER BY id ASC LIMIT ${limitParam}`;
			} else {
				rows = await sql`SELECT id, type, seller_id, sale_id, sale_day_id, message, actor_name, icon_url, pay_method, created_at, read_at FROM notifications WHERE id > ${afterId} ORDER BY id ASC LIMIT ${limitParam}`;
			}
		} else if (beforeId) {
			if (sellerIdFilter && saleDayIdFilter) {
				rows = await sql`SELECT id, type, seller_id, sale_id, sale_day_id, message, actor_name, icon_url, pay_method, created_at, read_at FROM notifications WHERE id < ${beforeId} AND seller_id = ${sellerIdFilter} AND sale_day_id = ${saleDayIdFilter} ORDER BY id DESC LIMIT ${limitParam}`;
			} else if (sellerIdFilter) {
				rows = await sql`SELECT id, type, seller_id, sale_id, sale_day_id, message, actor_name, icon_url, pay_method, created_at, read_at FROM notifications WHERE id < ${beforeId} AND seller_id = ${sellerIdFilter} ORDER BY id DESC LIMIT ${limitParam}`;
			} else if (saleDayIdFilter) {
				rows = await sql`SELECT id, type, seller_id, sale_id, sale_day_id, message, actor_name, icon_url, pay_method, created_at, read_at FROM notifications WHERE id < ${beforeId} AND sale_day_id = ${saleDayIdFilter} ORDER BY id DESC LIMIT ${limitParam}`;
			} else {
				rows = await sql`SELECT id, type, seller_id, sale_id, sale_day_id, message, actor_name, icon_url, pay_method, created_at, read_at FROM notifications WHERE id < ${beforeId} ORDER BY id DESC LIMIT ${limitParam}`;
			}
		} else if (sinceParam) {
			if (sellerIdFilter && saleDayIdFilter) {
				rows = await sql`SELECT id, type, seller_id, sale_id, sale_day_id, message, actor_name, icon_url, pay_method, created_at, read_at FROM notifications WHERE created_at > ${new Date(sinceParam)} AND seller_id = ${sellerIdFilter} AND sale_day_id = ${saleDayIdFilter} ORDER BY created_at ASC, id ASC LIMIT ${limitParam}`;
			} else if (sellerIdFilter) {
				rows = await sql`SELECT id, type, seller_id, sale_id, sale_day_id, message, actor_name, icon_url, pay_method, created_at, read_at FROM notifications WHERE created_at > ${new Date(sinceParam)} AND seller_id = ${sellerIdFilter} ORDER BY created_at ASC, id ASC LIMIT ${limitParam}`;
			} else if (saleDayIdFilter) {
				rows = await sql`SELECT id, type, seller_id, sale_id, sale_day_id, message, actor_name, icon_url, pay_method, created_at, read_at FROM notifications WHERE created_at > ${new Date(sinceParam)} AND sale_day_id = ${saleDayIdFilter} ORDER BY created_at ASC, id ASC LIMIT ${limitParam}`;
			} else {
				rows = await sql`SELECT id, type, seller_id, sale_id, sale_day_id, message, actor_name, icon_url, pay_method, created_at, read_at FROM notifications WHERE created_at > ${new Date(sinceParam)} ORDER BY created_at ASC, id ASC LIMIT ${limitParam}`;
			}
		} else {
			if (sellerIdFilter && saleDayIdFilter) {
				rows = await sql`SELECT id, type, seller_id, sale_id, sale_day_id, message, actor_name, icon_url, pay_method, created_at, read_at FROM notifications WHERE seller_id = ${sellerIdFilter} AND sale_day_id = ${saleDayIdFilter} ORDER BY id DESC LIMIT ${limitParam}`;
			} else if (sellerIdFilter) {
				rows = await sql`SELECT id, type, seller_id, sale_id, sale_day_id, message, actor_name, icon_url, pay_method, created_at, read_at FROM notifications WHERE seller_id = ${sellerIdFilter} ORDER BY id DESC LIMIT ${limitParam}`;
			} else if (saleDayIdFilter) {
				rows = await sql`SELECT id, type, seller_id, sale_id, sale_day_id, message, actor_name, icon_url, pay_method, created_at, read_at FROM notifications WHERE sale_day_id = ${saleDayIdFilter} ORDER BY id DESC LIMIT ${limitParam}`;
			} else {
				rows = await sql`SELECT id, type, seller_id, sale_id, sale_day_id, message, actor_name, icon_url, pay_method, created_at, read_at FROM notifications ORDER BY id DESC LIMIT ${limitParam}`;
			}
		}
		return json(rows);
	} catch (e) {
		return json({ error: String(e) }, 500);
	}
}

