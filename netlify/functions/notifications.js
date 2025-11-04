import { ensureSchema, sql } from './_db.js';

function json(body, status = 200) {
	return { statusCode: status, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) };
}

async function getActorName(event) {
	try {
		const headers = (event.headers || {});
		const hActor = (headers['x-actor-name'] || headers['X-Actor-Name'] || headers['x-actor'] || '').toString();
		let qActor = '';
		try {
			const qs = new URLSearchParams(event.rawQuery || (event.queryStringParameters ? new URLSearchParams(event.queryStringParameters).toString() : ''));
			qActor = (qs.get('actor') || '').toString();
		} catch {}
		return (hActor || qActor || '').toString();
	} catch {
		return '';
	}
}

async function getActorRole(event) {
	try {
		const actorName = await getActorName(event);
		if (!actorName) return 'user';
		const rows = await sql`SELECT role FROM users WHERE lower(username)=lower(${actorName}) LIMIT 1`;
		return (rows && rows[0] && rows[0].role) ? String(rows[0].role) : 'user';
	} catch {
		return 'user';
	}
}

export async function handler(event) {
	try {
		await ensureSchema();
		if (event.httpMethod === 'OPTIONS') return json({ ok: true });

		// Only superadmin can access the notification center
		const role = await getActorRole(event);
		if (role !== 'superadmin') {
			return json({ error: 'No autorizado' }, 403);
		}

		const actorName = await getActorName(event);
		if (!actorName) {
			return json({ error: 'Usuario no identificado' }, 401);
		}

		switch (event.httpMethod) {
			case 'GET': {
				// Fetch notifications with seller information and check status
				// Only show notifications created since the last visit
				
				// Get last visit timestamp
				const lastVisit = await sql`
					SELECT visited_at 
					FROM notification_center_visits 
					WHERE lower(username) = lower(${actorName})
					LIMIT 1
				`;
				
				const sinceDate = lastVisit.length && lastVisit[0].visited_at 
					? lastVisit[0].visited_at 
					: new Date(0); // If no previous visit, show all notifications
				
				// Fetch notifications with enhanced information
				const notifications = await sql`
					SELECT 
						n.id,
						n.type,
						n.seller_id,
						n.sale_id,
						n.sale_day_id,
						n.message,
						n.actor_name,
						n.icon_url,
						n.pay_method,
						n.created_at,
						s.name AS seller_name,
						CASE WHEN nc.id IS NOT NULL THEN true ELSE false END AS is_checked
					FROM notifications n
					LEFT JOIN sellers s ON s.id = n.seller_id
					LEFT JOIN notification_checks nc ON nc.notification_id = n.id 
						AND lower(nc.checked_by) = lower(${actorName})
					WHERE n.created_at >= ${sinceDate.toISOString()}
					ORDER BY n.created_at DESC
				`;
				
				// Also fetch detailed sale information for each notification
				const enriched = [];
				for (const notif of notifications) {
					const item = { ...notif };
					
					// If there's a sale_id, fetch detailed dessert quantities
					if (notif.sale_id) {
						try {
							const saleDetails = await sql`
								SELECT s.client_name, s.qty_arco, s.qty_melo, s.qty_mara, s.qty_oreo, s.qty_nute
								FROM sales s
								WHERE s.id = ${notif.sale_id}
								LIMIT 1
							`;
							if (saleDetails.length > 0) {
								item.sale_details = saleDetails[0];
							}
						} catch (err) {
							// Sale might have been deleted
							item.sale_details = null;
						}
					}
					
					enriched.push(item);
				}
				
				return json(enriched);
			}

			case 'POST': {
				const data = JSON.parse(event.body || '{}');
				
				// Update last visit timestamp
				if (data.action === 'visit') {
					await sql`
						INSERT INTO notification_center_visits (username, visited_at)
						VALUES (${actorName}, now())
						ON CONFLICT (username) 
						DO UPDATE SET visited_at = now()
					`;
					return json({ ok: true });
				}
				
				// Toggle check status for a notification
				if (data.action === 'toggle_check' && data.notification_id) {
					const notifId = Number(data.notification_id);
					if (!notifId) return json({ error: 'notification_id inválido' }, 400);
					
					// Check if already checked
					const existing = await sql`
						SELECT id FROM notification_checks
						WHERE notification_id = ${notifId}
						AND lower(checked_by) = lower(${actorName})
					`;
					
					if (existing.length > 0) {
						// Uncheck
						await sql`
							DELETE FROM notification_checks
							WHERE notification_id = ${notifId}
							AND lower(checked_by) = lower(${actorName})
						`;
						return json({ ok: true, checked: false });
					} else {
						// Check
						await sql`
							INSERT INTO notification_checks (notification_id, checked_by)
							VALUES (${notifId}, ${actorName})
							ON CONFLICT (notification_id, checked_by) DO NOTHING
						`;
						return json({ ok: true, checked: true });
					}
				}
				
				return json({ error: 'Acción inválida' }, 400);
			}

			case 'DELETE': {
				const params = new URLSearchParams(event.rawQuery || (event.queryStringParameters ? new URLSearchParams(event.queryStringParameters).toString() : ''));
				const notifIdParam = params.get('id');
				if (!notifIdParam) return json({ error: 'id requerido' }, 400);
				
				const notifId = Number(notifIdParam);
				if (!notifId) return json({ error: 'id inválido' }, 400);
				
				// Delete the notification (cascade will delete associated checks)
				await sql`DELETE FROM notifications WHERE id = ${notifId}`;
				
				return json({ ok: true });
			}

			default:
				return json({ error: 'Método no permitido' }, 405);
		}
	} catch (err) {
		console.error('Error in notifications handler:', err);
		return json({ error: String(err) }, 500);
	}
}
