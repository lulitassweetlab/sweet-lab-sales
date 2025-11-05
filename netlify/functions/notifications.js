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
	console.log('=== Notifications Handler Start ===');
	console.log('Method:', event.httpMethod);
	console.log('Raw query:', event.rawQuery);
	console.log('Query params:', event.queryStringParameters);
	
	try {
		// Test endpoint
		const params = new URLSearchParams(event.rawQuery || '');
		if (params.get('test') === '1') {
			console.log('Test endpoint hit');
			return json({ ok: true, message: 'Notifications endpoint is working', timestamp: new Date().toISOString() });
		}
		
		console.log('Calling ensureSchema...');
		await ensureSchema();
		console.log('✓ ensureSchema completed');
		
		if (event.httpMethod === 'OPTIONS') return json({ ok: true });

		// Only superadmin can access the notification center
		console.log('Getting actor role...');
		const role = await getActorRole(event);
		console.log('Actor role:', role);
		if (role !== 'superadmin') {
			console.log('Access denied - not superadmin');
			return json({ error: 'No autorizado' }, 403);
		}

		console.log('Getting actor name...');
		const actorName = await getActorName(event);
		console.log('Actor name:', actorName);
		if (!actorName) {
			console.log('Access denied - no actor name');
			return json({ error: 'Usuario no identificado' }, 401);
		}

		switch (event.httpMethod) {
			case 'GET': {
				try {
					console.log('Fetching notifications for:', actorName);
					
					// Get last visit timestamp (with error handling)
					let lastVisit = [];
					try {
						console.log('Querying last visit...');
						lastVisit = await sql`
							SELECT visited_at 
							FROM notification_center_visits 
							WHERE lower(username) = lower(${actorName})
							LIMIT 1
						`;
						console.log('✓ Last visit query completed:', lastVisit.length > 0 ? 'found' : 'not found');
					} catch (err) {
						console.warn('⚠️ Error fetching last visit (table may not exist):', err.message);
						// Table doesn't exist yet, return empty array
						console.log('Returning empty array due to missing tables');
						return json([]);
					}
					
					// Get notifications since last visit (or all if first visit)
					let notifications = [];
					try {
						if (lastVisit.length > 0 && lastVisit[0].visited_at) {
							const since = lastVisit[0].visited_at;
							console.log('Fetching notifications since:', since);
							console.log('Query: notifications WHERE created_at >=', since);
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
									false AS is_checked
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
									false AS is_checked
								FROM notifications n
								LEFT JOIN sellers s ON s.id = n.seller_id
								ORDER BY n.created_at DESC
								LIMIT 100
							`;
						}
						console.log('✓ Notifications query completed:', notifications.length, 'rows');
					} catch (err) {
						console.error('❌ Error fetching notifications:', err.message);
						console.error('Error details:', err);
						// If notifications table doesn't exist, return empty array
						if (err.message && (err.message.includes('does not exist') || err.message.includes('relation'))) {
							console.log('Notifications table does not exist, returning empty');
							return json([]);
						}
						throw err;
					}
				
					// Also fetch detailed sale information for each notification
					console.log('Enriching notifications with sale details...');
					const enriched = [];
					for (let i = 0; i < notifications.length; i++) {
						const notif = notifications[i];
						const item = { ...notif };
						
						// If there's a sale_id, fetch detailed dessert quantities
						if (notif.sale_id) {
							try {
								console.log(`Fetching sale details for notification ${i+1}/${notifications.length}, sale_id: ${notif.sale_id}`);
								const saleDetails = await sql`
									SELECT s.client_name, s.qty_arco, s.qty_melo, s.qty_mara, s.qty_oreo, s.qty_nute
									FROM sales s
									WHERE s.id = ${notif.sale_id}
									LIMIT 1
								`;
								if (saleDetails.length > 0) {
									item.sale_details = saleDetails[0];
									console.log('✓ Sale details found');
								} else {
									console.log('⚠️ Sale not found (deleted?)');
								}
							} catch (err) {
								// Sale might have been deleted
								console.warn('Error fetching sale details:', err.message);
								item.sale_details = null;
							}
						}
						
						enriched.push(item);
					}
					
					console.log('✓ Returning enriched notifications:', enriched.length);
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
		console.error('❌ Error in notifications handler:', err);
		console.error('Error stack:', err.stack);
		console.error('Error message:', err.message);
		return json({ error: String(err.message || err) }, 500);
	}
}
