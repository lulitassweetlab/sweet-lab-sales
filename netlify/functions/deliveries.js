import { ensureSchema, sql } from './_db.js';

function json(body, status = 200) {
	return { statusCode: status, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) };
}

async function getActorRole(evt, body = null) {
	try {
		const headers = (evt.headers || {});
		const hActor = (headers['x-actor-name'] || headers['X-Actor-Name'] || headers['x-actor'] || '').toString();
		let bActor = '';
		try { bActor = (body && (body.actor_name || body._actor_name || body.username)) ? String(body.actor_name || body._actor_name || body.username) : ''; } catch {}
		let qActor = '';
		try { const qs = new URLSearchParams(evt.rawQuery || (evt.queryStringParameters ? new URLSearchParams(evt.queryStringParameters).toString() : '')); qActor = (qs.get('actor') || '').toString(); } catch {}
		const actor = (hActor || bActor || qActor || '').trim();
		if (!actor) return 'user';
		const rows = await sql`SELECT role FROM users WHERE lower(username)=lower(${actor}) LIMIT 1`;
		return (rows && rows[0] && rows[0].role) ? String(rows[0].role) : 'user';
	} catch { return 'user'; }
}

export async function handler(event) {
	try {
		await ensureSchema();
		if (event.httpMethod === 'OPTIONS') return json({ ok: true });
		switch (event.httpMethod) {
			case 'GET': {
				let raw = '';
				if (event.rawQuery && typeof event.rawQuery === 'string') raw = event.rawQuery;
				else if (event.queryStringParameters && typeof event.queryStringParameters === 'object') {
					raw = Object.entries(event.queryStringParameters).map(([k,v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v ?? '')}`).join('&');
				}
				const params = new URLSearchParams(raw);
				
				// Check if this is a request for consolidated sales by date
				const salesConsolidated = params.get('sales_consolidated');
				if (salesConsolidated === 'true') {
					// Get all desserts dynamically
					const desserts = await sql`SELECT id, short_code, name FROM desserts WHERE is_active = true ORDER BY position ASC, id ASC`;
					
					// Create a map of dessert short_code to id
					const dessertIdByCode = {};
					for (const d of desserts) {
						dessertIdByCode[d.short_code] = d.id;
					}
					
					// OPTIMIZED: Get all sales with quantities per dessert
					// For each sale, use sale_items if they exist, otherwise use qty_* columns
					const allSalesData = await sql`
						SELECT 
							s.id AS sale_id,
							sd.day,
							s.seller_id,
							se.name AS seller_name,
							s.qty_arco,
							s.qty_melo,
							s.qty_mara,
							s.qty_oreo,
							s.qty_nute,
							s.special_pricing_type,
							s.client_name,
							-- Check if this sale has any sale_items
							(SELECT COUNT(*) FROM sale_items WHERE sale_id = s.id) > 0 AS has_items
						FROM sales s
						INNER JOIN sale_days sd ON sd.id = s.sale_day_id
						INNER JOIN sellers se ON se.id = s.seller_id
						ORDER BY sd.day DESC, se.name ASC
					`;
					
					// Get all sale_items in one query
					const allItems = await sql`
						SELECT 
							si.sale_id,
							si.dessert_id,
							si.quantity
						FROM sale_items si
					`;
					
					// Get delivered quantities from sale_days
					const deliveredData = await sql`
						SELECT 
							sd.day,
							sd.seller_id,
							sd.delivered_arco,
							sd.delivered_melo,
							sd.delivered_mara,
							sd.delivered_oreo,
							sd.delivered_nute
						FROM sale_days sd
						WHERE sd.delivered_arco > 0 
						   OR sd.delivered_melo > 0 
						   OR sd.delivered_mara > 0 
						   OR sd.delivered_oreo > 0 
						   OR sd.delivered_nute > 0
					`;
					
					// Create a map of sale_items by sale_id
					const itemsBySaleId = {};
					for (const item of allItems) {
						if (!itemsBySaleId[item.sale_id]) {
							itemsBySaleId[item.sale_id] = [];
						}
						itemsBySaleId[item.sale_id].push(item);
					}
					
					// Create a map of delivered quantities by date and seller
					const deliveredByKey = {};
					for (const delivered of deliveredData) {
						const key = `${delivered.day}_${delivered.seller_id}`;
						deliveredByKey[key] = {
							arco: delivered.delivered_arco || 0,
							melo: delivered.delivered_melo || 0,
							mara: delivered.delivered_mara || 0,
							oreo: delivered.delivered_oreo || 0,
							nute: delivered.delivered_nute || 0
						};
					}
					
					// Build a map to organize data by date and seller
					const dataByDate = {};
					const sellersByDateAndId = {};
					
					// Process each sale
					for (const sale of allSalesData) {
						const dateKey = sale.day;
						const sellerKey = `${dateKey}_${sale.seller_id}`;
						
						// Initialize structures if needed
						if (!dataByDate[dateKey]) {
							dataByDate[dateKey] = {
								day: dateKey,
								sellers: [],
								totals: {}
							};
							for (const d of desserts) {
								dataByDate[dateKey].totals[d.short_code] = 0;
							}
						}
						
						if (!sellersByDateAndId[sellerKey]) {
							sellersByDateAndId[sellerKey] = {
								seller_id: sale.seller_id,
								seller_name: sale.seller_name,
								has_muestra: false,
								has_a_costo: false,
								muestra_quantities: {},
								a_costo_quantities: {},
								delivered_quantities: deliveredByKey[sellerKey] || {}
							};
							for (const d of desserts) {
								sellersByDateAndId[sellerKey][d.short_code] = 0;
								sellersByDateAndId[sellerKey].muestra_quantities[d.short_code] = 0;
								sellersByDateAndId[sellerKey].a_costo_quantities[d.short_code] = 0;
								// Initialize delivered quantities
								if (!sellersByDateAndId[sellerKey].delivered_quantities[d.short_code]) {
									sellersByDateAndId[sellerKey].delivered_quantities[d.short_code] = 0;
								}
							}
						}
						
						// Track special pricing types and quantities
						const specialType = sale.special_pricing_type;
						
						// Decide whether to use sale_items or legacy columns for this sale
						if (sale.has_items && itemsBySaleId[sale.sale_id]) {
							// Use sale_items data
							for (const item of itemsBySaleId[sale.sale_id]) {
								const dessert = desserts.find(d => d.id === item.dessert_id);
								if (dessert) {
									sellersByDateAndId[sellerKey][dessert.short_code] += item.quantity;
									dataByDate[dateKey].totals[dessert.short_code] += item.quantity;
									
									// Track special pricing quantities
									if (specialType === 'muestra') {
										sellersByDateAndId[sellerKey].has_muestra = true;
										sellersByDateAndId[sellerKey].muestra_quantities[dessert.short_code] += item.quantity;
									} else if (specialType === 'a_costo') {
										sellersByDateAndId[sellerKey].has_a_costo = true;
										sellersByDateAndId[sellerKey].a_costo_quantities[dessert.short_code] += item.quantity;
									}
								}
							}
						} else {
							// Use legacy columns
							for (const d of desserts) {
								const qtyKey = `qty_${d.short_code}`;
								const qty = sale[qtyKey] || 0;
								if (qty > 0) {
									sellersByDateAndId[sellerKey][d.short_code] += qty;
									dataByDate[dateKey].totals[d.short_code] += qty;
									
									// Track special pricing quantities
									if (specialType === 'muestra') {
										sellersByDateAndId[sellerKey].has_muestra = true;
										sellersByDateAndId[sellerKey].muestra_quantities[d.short_code] += qty;
									} else if (specialType === 'a_costo') {
										sellersByDateAndId[sellerKey].has_a_costo = true;
										sellersByDateAndId[sellerKey].a_costo_quantities[d.short_code] += qty;
									}
								}
							}
						}
					}
					
					// Convert sellers map to arrays organized by date
					for (const [sellerKey, sellerData] of Object.entries(sellersByDateAndId)) {
						const [dateKey] = sellerKey.split('_');
						if (dataByDate[dateKey]) {
							dataByDate[dateKey].sellers.push(sellerData);
						}
					}
					
					// Sort sellers within each date
					for (const dateData of Object.values(dataByDate)) {
						dateData.sellers.sort((a, b) => a.seller_name.localeCompare(b.seller_name));
					}
					
					// Convert to array and return
					const result = Object.values(dataByDate);
					
					return json(result);
				}
				
				// Check if this is a request for seller assignments
				const deliveryId = params.get('delivery_id');
				if (deliveryId) {
					// Return seller assignments for a specific delivery
					const id = Number(deliveryId) || 0;
					if (!id) return json({ error: 'delivery_id inválido' }, 400);
					
					const rows = await sql`
						SELECT 
							dsi.delivery_id,
							dsi.seller_id,
							s.name AS seller_name,
							COALESCE(SUM(CASE WHEN des.short_code='arco' THEN dsi.quantity END),0)::int AS arco,
							COALESCE(SUM(CASE WHEN des.short_code='melo' THEN dsi.quantity END),0)::int AS melo,
							COALESCE(SUM(CASE WHEN des.short_code='mara' THEN dsi.quantity END),0)::int AS mara,
							COALESCE(SUM(CASE WHEN des.short_code='oreo' THEN dsi.quantity END),0)::int AS oreo,
							COALESCE(SUM(CASE WHEN des.short_code='nute' THEN dsi.quantity END),0)::int AS nute
						FROM delivery_seller_items dsi
						JOIN sellers s ON s.id = dsi.seller_id
						JOIN desserts des ON des.id = dsi.dessert_id
						WHERE dsi.delivery_id = ${id}
						GROUP BY dsi.delivery_id, dsi.seller_id, s.name
						ORDER BY s.name ASC
					`;
					return json(rows);
				}
				
				// Check if this is a request for production users
				const productionUsersId = params.get('production_users');
				if (productionUsersId) {
					const id = Number(productionUsersId) || 0;
					if (!id) return json({ error: 'production_users inválido' }, 400);
					
					const rows = await sql`
						SELECT DISTINCT u.username
						FROM delivery_production_users dpu
						JOIN users u ON u.id = dpu.user_id
						WHERE dpu.delivery_id = ${id}
						ORDER BY u.username ASC
					`;
					return json(rows.map(r => r.username));
				}
				
				// Check if this is a production report request
				const reportType = params.get('report');
				if (reportType === 'production') {
					const start = (params.get('start') || '').toString().slice(0,10);
					const end = (params.get('end') || '').toString().slice(0,10);
					if (!start || !end) return json({ error: 'start y end requeridos' }, 400);
					
					const rows = await sql`
						SELECT 
							u.username,
							d.name AS dessert_name,
							des.short_code,
							COUNT(DISTINCT dpu.delivery_id) AS days_count,
							COALESCE(SUM(di.quantity), 0)::int AS total_quantity
						FROM delivery_production_users dpu
						JOIN users u ON u.id = dpu.user_id
						JOIN desserts des ON des.id = dpu.dessert_id
						JOIN deliveries d ON d.id = dpu.delivery_id
						JOIN desserts d2 ON d2.id = dpu.dessert_id
						LEFT JOIN delivery_items di ON di.delivery_id = dpu.delivery_id AND di.dessert_id = dpu.dessert_id
						WHERE d.day BETWEEN ${start} AND ${end}
						GROUP BY u.username, d2.name, des.short_code
						ORDER BY u.username ASC, d2.position ASC
					`;
					
					// Group by username
					const grouped = {};
					for (const row of rows) {
						if (!grouped[row.username]) grouped[row.username] = {};
						grouped[row.username][row.short_code] = row.total_quantity;
					}
					return json(grouped);
				}
				
				// List deliveries with totals per dessert
				const start = (params.get('start') || '').toString().slice(0,10) || null;
				const end = (params.get('end') || '').toString().slice(0,10) || null;
				let rows;
				if (start && end) {
					rows = await sql`
						SELECT d.id, d.day,
							COALESCE(SUM(CASE WHEN di.dessert_id = (SELECT id FROM desserts WHERE short_code='arco' LIMIT 1) THEN di.quantity END),0)::int AS arco,
							COALESCE(SUM(CASE WHEN di.dessert_id = (SELECT id FROM desserts WHERE short_code='melo' LIMIT 1) THEN di.quantity END),0)::int AS melo,
							COALESCE(SUM(CASE WHEN di.dessert_id = (SELECT id FROM desserts WHERE short_code='mara' LIMIT 1) THEN di.quantity END),0)::int AS mara,
							COALESCE(SUM(CASE WHEN di.dessert_id = (SELECT id FROM desserts WHERE short_code='oreo' LIMIT 1) THEN di.quantity END),0)::int AS oreo,
							COALESCE(SUM(CASE WHEN di.dessert_id = (SELECT id FROM desserts WHERE short_code='nute' LIMIT 1) THEN di.quantity END),0)::int AS nute
						FROM deliveries d
						LEFT JOIN delivery_items di ON di.delivery_id = d.id
						WHERE d.day BETWEEN ${start} AND ${end}
						GROUP BY d.id, d.day
						ORDER BY d.day DESC, d.id DESC
					`;
				} else {
					rows = await sql`
						SELECT d.id, d.day,
							COALESCE(SUM(CASE WHEN di.dessert_id = (SELECT id FROM desserts WHERE short_code='arco' LIMIT 1) THEN di.quantity END),0)::int AS arco,
							COALESCE(SUM(CASE WHEN di.dessert_id = (SELECT id FROM desserts WHERE short_code='melo' LIMIT 1) THEN di.quantity END),0)::int AS melo,
							COALESCE(SUM(CASE WHEN di.dessert_id = (SELECT id FROM desserts WHERE short_code='mara' LIMIT 1) THEN di.quantity END),0)::int AS mara,
							COALESCE(SUM(CASE WHEN di.dessert_id = (SELECT id FROM desserts WHERE short_code='oreo' LIMIT 1) THEN di.quantity END),0)::int AS oreo,
							COALESCE(SUM(CASE WHEN di.dessert_id = (SELECT id FROM desserts WHERE short_code='nute' LIMIT 1) THEN di.quantity END),0)::int AS nute
						FROM deliveries d
						LEFT JOIN delivery_items di ON di.delivery_id = d.id
						GROUP BY d.id, d.day
						ORDER BY d.day DESC, d.id DESC
						LIMIT 200
					`;
				}
				return json(rows);
			}
			case 'POST': {
				const data = JSON.parse(event.body || '{}');
				const role = await getActorRole(event, data);
				if (role !== 'admin' && role !== 'superadmin') return json({ error: 'No autorizado' }, 403);
				const day = (data.day || '').toString().slice(0,10);
				const items = (data.items && typeof data.items === 'object') ? data.items : {};
				const production_users = (data.production_users && typeof data.production_users === 'object') ? data.production_users : {};
				if (!day) return json({ error: 'day requerido' }, 400);
				const [row] = await sql`INSERT INTO deliveries (day, note, actor_name) VALUES (${day}, ${data.note || ''}, ${data.actor_name || ''}) RETURNING id, day`;
				const dmap = await sql`SELECT id, short_code FROM desserts WHERE short_code IN ('arco','melo','mara','oreo','nute')`;
				const idByCode = new Map(dmap.map(d => [String(d.short_code), d.id]));
				async function ins(code, qty){
					const id = idByCode.get(code);
					const q = Number(qty || 0) | 0;
					if (!id || q <= 0) return;
					await sql`INSERT INTO delivery_items (delivery_id, dessert_id, quantity) VALUES (${row.id}, ${id}, ${q}) ON CONFLICT (delivery_id, dessert_id) DO UPDATE SET quantity=EXCLUDED.quantity`;
				}
				await ins('arco', items.arco);
				await ins('melo', items.melo);
				await ins('mara', items.mara);
				await ins('oreo', items.oreo);
				await ins('nute', items.nute);
				// Save production users
				for (const [code, userIds] of Object.entries(production_users)) {
					const dessertId = idByCode.get(code);
					if (!dessertId || !Array.isArray(userIds)) continue;
					for (const userId of userIds) {
						const uid = Number(userId) || 0;
						if (uid > 0) {
							await sql`INSERT INTO delivery_production_users (delivery_id, dessert_id, user_id) VALUES (${row.id}, ${dessertId}, ${uid}) ON CONFLICT DO NOTHING`;
						}
					}
				}
				return json({ ok: true, id: row.id, day: row.day }, 201);
			}
			case 'PUT': {
				// Check if this is a request to update delivered quantities
				let raw = '';
				if (event.rawQuery && typeof event.rawQuery === 'string') raw = event.rawQuery;
				else if (event.queryStringParameters && typeof event.queryStringParameters === 'object') {
					raw = Object.entries(event.queryStringParameters).map(([k,v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v ?? '')}`).join('&');
				}
				const params = new URLSearchParams(raw);
				
				const data = JSON.parse(event.body || '{}');
				const role = await getActorRole(event, data);
				if (role !== 'admin' && role !== 'superadmin') return json({ error: 'No autorizado' }, 403);
				
				// Update single delivered quantity
				if (params.get('update_delivered') === 'true') {
					const day = (data.day || '').toString().slice(0,10);
					const sellerId = Number(data.seller_id || 0) || 0;
					const dessertCode = (data.dessert_code || '').toString();
					const quantity = Number(data.quantity || 0) || 0;
					
					if (!day || !sellerId || !dessertCode) {
						return json({ error: 'day, seller_id y dessert_code requeridos' }, 400);
					}
					
					// Get or create sale_day
					const saleDayRows = await sql`
						SELECT id FROM sale_days 
						WHERE seller_id = ${sellerId} AND day = ${day}
					`;
					
					let saleDayId;
					if (saleDayRows.length > 0) {
						saleDayId = saleDayRows[0].id;
					} else {
						const [newSaleDay] = await sql`
							INSERT INTO sale_days (seller_id, day)
							VALUES (${sellerId}, ${day})
							RETURNING id
						`;
						saleDayId = newSaleDay.id;
					}
					
					// Update the delivered quantity for this dessert
					const columnName = `delivered_${dessertCode}`;
					await sql.unsafe(`
						UPDATE sale_days 
						SET ${columnName} = ${quantity}
						WHERE id = ${saleDayId}
					`);
					
					return json({ ok: true, sale_day_id: saleDayId });
				}
				
				// Update all delivered quantities at once
				if (params.get('update_all_delivered') === 'true') {
					const day = (data.day || '').toString().slice(0,10);
					const sellerId = Number(data.seller_id || 0) || 0;
					const quantities = data.quantities || {};
					
					if (!day || !sellerId) {
						return json({ error: 'day y seller_id requeridos' }, 400);
					}
					
					// Get or create sale_day
					const saleDayRows = await sql`
						SELECT id FROM sale_days 
						WHERE seller_id = ${sellerId} AND day = ${day}
					`;
					
					let saleDayId;
					if (saleDayRows.length > 0) {
						saleDayId = saleDayRows[0].id;
					} else {
						const [newSaleDay] = await sql`
							INSERT INTO sale_days (seller_id, day)
							VALUES (${sellerId}, ${day})
							RETURNING id
						`;
						saleDayId = newSaleDay.id;
					}
					
					// Update all delivered quantities
					const updates = [];
					const desserts = await sql`SELECT short_code FROM desserts WHERE is_active = true`;
					for (const d of desserts) {
						const code = d.short_code;
						if (quantities[code] !== undefined) {
							const qty = Number(quantities[code] || 0) || 0;
							updates.push(`delivered_${code} = ${qty}`);
						}
					}
					
					if (updates.length > 0) {
						await sql.unsafe(`
							UPDATE sale_days 
							SET ${updates.join(', ')}
							WHERE id = ${saleDayId}
						`);
					}
					
					return json({ ok: true, sale_day_id: saleDayId });
				}
				
				// Original update items or note logic
				const id = Number(data.id || 0) || 0;
				if (!id) return json({ error: 'id requerido' }, 400);
				if (data.note != null) await sql`UPDATE deliveries SET note=${String(data.note)} WHERE id=${id}`;
				if (data.items && typeof data.items === 'object') {
					const dmap = await sql`SELECT id, short_code FROM desserts WHERE short_code IN ('arco','melo','mara','oreo','nute')`;
					const idByCode = new Map(dmap.map(d => [String(d.short_code), d.id]));
					async function up(code, qty){
						const did = idByCode.get(code);
						if (!did) return;
						const q = Number(qty || 0) | 0;
						if (q <= 0) await sql`DELETE FROM delivery_items WHERE delivery_id=${id} AND dessert_id=${did}`;
						else await sql`INSERT INTO delivery_items (delivery_id, dessert_id, quantity) VALUES (${id}, ${did}, ${q}) ON CONFLICT (delivery_id, dessert_id) DO UPDATE SET quantity=EXCLUDED.quantity`;
					}
					for (const k of ['arco','melo','mara','oreo','nute']) await up(k, data.items[k]);
				}
				return json({ ok: true });
			}
			case 'PATCH': {
				// Assign seller quantities: { id, seller_id|seller_name, items: { arco, melo, mara, oreo, nute } }
				const data = JSON.parse(event.body || '{}');
				const role = await getActorRole(event, data);
				if (role !== 'admin' && role !== 'superadmin') return json({ error: 'No autorizado' }, 403);
				const id = Number(data.id || 0) || 0;
				if (!id) return json({ error: 'id requerido' }, 400);
				let sellerId = Number(data.seller_id || 0) || null;
				if (!sellerId) {
					const nm = (data.seller_name || data.seller || '').toString();
					if (!nm) return json({ error: 'seller_id o seller_name requerido' }, 400);
					const s = await sql`SELECT id FROM sellers WHERE lower(name)=lower(${nm}) LIMIT 1`;
					if (!s.length) return json({ error: 'Vendedor no encontrado' }, 404);
					sellerId = s[0].id;
				}
				const dmap = await sql`SELECT id, short_code FROM desserts WHERE short_code IN ('arco','melo','mara','oreo','nute')`;
				const idByCode = new Map(dmap.map(d => [String(d.short_code), d.id]));
				async function up(code, qty){
					const did = idByCode.get(code);
					if (!did) return;
					const q = Number(qty || 0) | 0;
					if (q <= 0) await sql`DELETE FROM delivery_seller_items WHERE delivery_id=${id} AND seller_id=${sellerId} AND dessert_id=${did}`;
					else await sql`INSERT INTO delivery_seller_items (delivery_id, seller_id, dessert_id, quantity) VALUES (${id}, ${sellerId}, ${did}, ${q}) ON CONFLICT (delivery_id, seller_id, dessert_id) DO UPDATE SET quantity=EXCLUDED.quantity`;
				}
				const items = (data.items && typeof data.items === 'object') ? data.items : {};
				for (const k of ['arco','melo','mara','oreo','nute']) await up(k, items[k]);
				return json({ ok: true });
			}
			case 'DELETE': {
				const params = new URLSearchParams(event.rawQuery || event.queryStringParameters ? event.rawQuery || '' : '');
				const role = await getActorRole(event, null);
				if (role !== 'admin' && role !== 'superadmin') return json({ error: 'No autorizado' }, 403);
				const idParam = params.get('id');
				const id = Number(idParam || 0) || 0;
				if (!id) return json({ error: 'id requerido' }, 400);
				await sql`DELETE FROM deliveries WHERE id=${id}`;
				return json({ ok: true });
			}
			default:
				return json({ error: 'Método no permitido' }, 405);
		}
	} catch (err) {
		return json({ error: String(err) }, 500);
	}
}

