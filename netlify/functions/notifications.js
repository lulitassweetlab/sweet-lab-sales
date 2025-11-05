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
				try {
					console.log('Fetching notifications for:', actorName);
					
					// Check if tables exist
					let tablesExist = true;
					try {
						await sql`SELECT 1 FROM notification_center_visits LIMIT 1`;
						await sql`SELECT 1 FROM notification_checks LIMIT 1`;
					} catch (err) {
						console.warn('Notification tables do not exist yet:', err.message);
						tablesExist = false;
					}
					
					if (!tablesExist) {
						console.log('Tables do not exist, returning empty array');
						return json([]);
					}
					
					// Get last visit timestamp
					let lastVisit = [];
					try {
						lastVisit = await sql`
							SELECT visited_at 
							FROM notification_center_visits 
							WHERE lower(username) = lower(${actorName})
							LIMIT 1
						`;
						console.log('Last visit query result:', lastVisit.length > 0 ? 'found' : 'not found');
					} catch (err) {
						console.error('Error fetching last visit:', err);
					}
					
					// Get notifications since last visit (or all if first visit)
					let notifications = [];
					try {
						if (lastVisit.length > 0 && lastVisit[0].visited_at) {
							const since = lastVisit[0].visited_at;
							console.log('Fetching notifications since:', since);
							notifications = await sql`
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
									COALESCE((SELECT true FROM notification_checks nc WHERE nc.notification_id = n.id AND lower(nc.checked_by) = lower(${actorName}) LIMIT 1), false) AS is_checked
								FROM notifications n
								LEFT JOIN sellers s ON s.id = n.seller_id
								WHERE n.created_at >= ${since}
								ORDER BY n.created_at DESC
							`;
						} else {
							// First visit, get all notifications
							console.log('First visit - fetching all notifications');
							notifications = await sql`
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
									COALESCE((SELECT true FROM notification_checks nc WHERE nc.notification_id = n.id AND lower(nc.checked_by) = lower(${actorName}) LIMIT 1), false) AS is_checked
								FROM notifications n
								LEFT JOIN sellers s ON s.id = n.seller_id
								ORDER BY n.created_at DESC
							`;
						}
						console.log('Notifications fetched:', notifications.length);
					} catch (err) {
						console.error('Error fetching notifications:', err.message);
						// If notifications table doesn't exist, return empty array
						if (err.message && err.message.includes('does not exist')) {
							console.log('Notifications table does not exist, returning empty');
							return json([]);
						}
						throw err;
					}
				
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
					
					console.log('Returning enriched notifications:', enriched.length);
					return json(enriched);
				} catch (err) {
					console.error('GET notifications error:', err);
					throw err;
				}
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
