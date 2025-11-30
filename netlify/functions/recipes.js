import { ensureSchema, sql, ensureInventoryItem } from './_db.js';

function json(body, status = 200) {
	return { statusCode: status, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) };
}

export async function handler(event) {
	try {
		await ensureSchema();
		if (event.httpMethod === 'OPTIONS') return json({ ok: true });
		switch (event.httpMethod) {
			case 'GET': {
				const raw = typeof event.rawQuery === 'string' ? event.rawQuery : (event.queryStringParameters ? new URLSearchParams(event.queryStringParameters).toString() : '');
				const params = new URLSearchParams(raw);
				const dessert = params.get('dessert');
				const includeExtras = params.get('include_extras') === '1' || params.get('include_extras') === 'true';
				const allItems = params.get('all_items') === '1' || params.get('all_items') === 'true';
				const seed = params.get('seed') === '1' || params.get('seed') === 'true';
			const productionUsers = params.get('production_users') === '1' || params.get('production_users') === 'true';
			const savedSessions = params.get('saved_sessions') === '1' || params.get('saved_sessions') === 'true';
			
			// Get saved recipe sessions
			if (savedSessions) {
				const sessions = await sql`
					SELECT 
						id,
						session_date,
						actor_name,
						desserts_data,
						created_at
					FROM recipe_sessions
					ORDER BY session_date DESC, created_at DESC
					LIMIT 50
				`;
				return json(sessions);
			}
			
			// Get production users sorted by frequency
			if (productionUsers) {
					const dessertFilter = params.get('dessert_filter');
					
					// First, get all users from users table OR sellers table
					let allUsers = [];
					try {
						// Get explicit users
						const usersFromTable = await sql`SELECT id, username FROM users ORDER BY username ASC`;
						allUsers = usersFromTable || [];
						
						// If no users in table, get from sellers as fallback
						if (allUsers.length === 0) {
							const sellers = await sql`SELECT id, name as username FROM sellers WHERE archived_at IS NULL ORDER BY name ASC`;
							allUsers = sellers || [];
						}
					} catch (err) {
						console.error('Error fetching users:', err);
					}
					
					// Now add participation counts
					const usersWithCounts = [];
					for (const user of allUsers) {
						let participationCount = 0;
						let lastParticipation = null;
						
						try {
							if (dessertFilter) {
								const counts = await sql`
									SELECT 
										COUNT(*)::int as count,
										MAX(session_date) as last_date
									FROM recipe_production_users
									WHERE user_id = ${user.id} 
										AND lower(dessert) = lower(${dessertFilter})
								`;
								participationCount = counts[0]?.count || 0;
								lastParticipation = counts[0]?.last_date || null;
							} else {
								const counts = await sql`
									SELECT 
										COUNT(*)::int as count,
										MAX(session_date) as last_date
									FROM recipe_production_users
									WHERE user_id = ${user.id}
								`;
								participationCount = counts[0]?.count || 0;
								lastParticipation = counts[0]?.last_date || null;
							}
						} catch (err) {
							// Table might not exist yet, that's OK
						}
						
						usersWithCounts.push({
							id: user.id,
							username: user.username,
							participation_count: participationCount,
							last_participation: lastParticipation
						});
					}
					
					// Sort by participation count (desc), then last participation (desc), then name (asc)
					usersWithCounts.sort((a, b) => {
						if (b.participation_count !== a.participation_count) {
							return b.participation_count - a.participation_count;
						}
						if (a.last_participation && b.last_participation) {
							return new Date(b.last_participation) - new Date(a.last_participation);
						}
						if (a.last_participation) return -1;
						if (b.last_participation) return 1;
						return a.username.localeCompare(b.username);
					});
					
					return json(usersWithCounts);
				}
				if (seed) {
					await seedDefaults();
					return json({ ok: true });
				}
				if (allItems) {
					// Single payload with all items grouped by dessert + extras to reduce roundtrips
					const desserts = (await sql`SELECT DISTINCT dessert FROM dessert_recipes ORDER BY dessert ASC`).map(r => r.dessert);
					const items = await sql`
						SELECT dr.dessert, i.ingredient, i.unit, i.qty_per_unit, i.adjustment, i.price, i.pack_size
						FROM dessert_recipe_items i
						LEFT JOIN dessert_recipes dr ON dr.id = i.recipe_id
						ORDER BY dr.dessert ASC, i.position ASC, i.id ASC
					`;
					let extras = [];
					if (includeExtras) extras = await sql`SELECT ingredient, unit, qty_per_unit, price, pack_size FROM extras_items ORDER BY position ASC, id ASC`;
					return json({ desserts, items, extras });
				}
				if (dessert) {
					const steps = await sql`SELECT id, dessert, step_name, position FROM dessert_recipes WHERE lower(dessert)=lower(${dessert}) ORDER BY position ASC, id ASC`;
					const stepIds = steps.map(s => s.id);
					let items = [];
					if (stepIds.length) items = await sql`SELECT id, recipe_id, ingredient, unit, qty_per_unit, adjustment, price, pack_size, position FROM dessert_recipe_items WHERE recipe_id = ANY(${stepIds}) ORDER BY position ASC, id ASC`;
					const grouped = steps.map(s => ({ id: s.id, dessert: s.dessert, step_name: s.step_name || null, position: s.position, items: items.filter(i => i.recipe_id === s.id) }));
					let extras = [];
					if (includeExtras) extras = await sql`SELECT id, ingredient, unit, qty_per_unit, price, pack_size, position FROM extras_items ORDER BY position ASC, id ASC`;
					return json({ dessert, steps: grouped, extras });
				}
				// all desserts summary (respect saved order if present)
				const ds = await sql`
					SELECT d.dessert
					FROM (SELECT DISTINCT dessert FROM dessert_recipes) d
					LEFT JOIN dessert_order o ON lower(o.dessert) = lower(d.dessert)
					ORDER BY COALESCE(o.position, 1000000) ASC, d.dessert ASC
				`;
				return json(ds.map(r => r.dessert));
			}
		case 'POST': {
			const data = JSON.parse(event.body || '{}');
			const kind = (data.kind || '').toString();
			
			// Save complete recipe session (quantities, times, participants)
			if (kind === 'recipe.session') {
				const sessionDate = (data.session_date || new Date().toISOString().split('T')[0]).toString().slice(0, 10);
				const actorName = (data.actor_name || '').toString();
				const dessertsData = data.desserts || []; // Array of { dessert, qty, participants: [userIds], steps: [{ step_name, times }] }
				
				console.log('📥 Received recipe.session request:', { sessionDate, actorName, dessertsCount: dessertsData.length });
				
				if (!Array.isArray(dessertsData) || dessertsData.length === 0) {
					return json({ error: 'desserts data requerido' }, 400);
				}
				
				// Save the complete session
				const [session] = await sql`
					INSERT INTO recipe_sessions (session_date, actor_name, desserts_data)
					VALUES (${sessionDate}, ${actorName}, ${JSON.stringify(dessertsData)})
					RETURNING id
				`;
				const sessionId = session.id;
				console.log(`✅ Created recipe session ${sessionId}`);
				
				// Save participants with session reference
				for (const dessertData of dessertsData) {
					const dessert = dessertData.dessert;
					const userIds = Array.isArray(dessertData.participants) ? dessertData.participants : [];
					
					if (userIds.length === 0) continue;
					
					// Ensure users exist
					for (const userId of userIds) {
						try {
							const userExists = await sql`SELECT id FROM users WHERE id = ${userId}`;
							if (userExists.length === 0) {
								const seller = await sql`SELECT id, name FROM sellers WHERE id = ${userId}`;
								if (seller.length > 0) {
									await sql`
										INSERT INTO users (username, password_hash, role)
										VALUES (${seller[0].name}, ${seller[0].name.toLowerCase() + 'sweet'}, 'user')
										ON CONFLICT (username) DO NOTHING
									`;
								}
							}
						} catch (err) {
							console.error('Error ensuring user exists:', err);
						}
					}
					
					// Delete existing entries
					await sql`DELETE FROM recipe_production_users WHERE lower(dessert) = lower(${dessert}) AND session_date = ${sessionDate}`;
					
					// Insert with session reference
					for (const userId of userIds) {
						try {
							await sql`
								INSERT INTO recipe_production_users (dessert, user_id, session_date, recipe_session_id)
								VALUES (${dessert}, ${userId}, ${sessionDate}, ${sessionId})
								ON CONFLICT (dessert, user_id, session_date) DO UPDATE SET recipe_session_id = ${sessionId}
							`;
						} catch (err) {
							console.error(`Error saving participant ${userId} for ${dessert}:`, err);
						}
					}
					
					// Sync to delivery_production_users
					try {
						let deliveryRows = await sql`SELECT id FROM deliveries WHERE day = ${sessionDate} LIMIT 1`;
						let deliveryId;
						
						if (deliveryRows.length === 0) {
							const [newDelivery] = await sql`
								INSERT INTO deliveries (day, note, actor_name)
								VALUES (${sessionDate}, 'Auto-creado desde recetas', ${actorName})
								RETURNING id
							`;
							deliveryId = newDelivery.id;
						} else {
							deliveryId = deliveryRows[0].id;
						}
						
					const dessertRows = await sql`
						SELECT id, name, short_code FROM desserts 
						WHERE lower(name) = lower(${dessert}) OR lower(short_code) = lower(${dessert})
						LIMIT 1
					`;
					
					console.log(`🔍 Sync: Looking for dessert '${dessert}' - Found:`, dessertRows.length > 0 ? dessertRows[0] : 'NOT FOUND');
					
					if (dessertRows.length > 0) {
						const dessertId = dessertRows[0].id;
							await sql`DELETE FROM delivery_production_users WHERE delivery_id = ${deliveryId} AND dessert_id = ${dessertId}`;
							
							for (const userId of userIds) {
								try {
									await sql`
										INSERT INTO delivery_production_users (delivery_id, dessert_id, user_id)
										VALUES (${deliveryId}, ${dessertId}, ${userId})
										ON CONFLICT DO NOTHING
									`;
								} catch (err) {
									console.error(`Error saving to delivery_production_users:`, err);
								}
							}
						}
					} catch (err) {
						console.error('Error syncing to deliveries:', err);
					}
				}
				
				return json({ ok: true, session_id: sessionId });
			}
			
			// Save production users for a recipe session (OLD - kept for compatibility)
			if (kind === 'production.users') {
				const dessert = (data.dessert || '').toString();
				const userIds = Array.isArray(data.user_ids) ? data.user_ids.map(x => Number(x) || 0).filter(Boolean) : [];
				const sessionDate = (data.session_date || new Date().toISOString().split('T')[0]).toString().slice(0, 10);
				
				console.log('📥 Received production.users request:', { dessert, userIds, sessionDate });
				
				if (!dessert) return json({ error: 'dessert requerido' }, 400);
				if (userIds.length === 0) return json({ error: 'user_ids requerido' }, 400);
					
					// First, ensure all user IDs exist in users table
					// This is important because recipe_production_users has a foreign key to users
					for (const userId of userIds) {
						try {
							// Check if user exists
							const userExists = await sql`SELECT id FROM users WHERE id = ${userId}`;
							if (userExists.length === 0) {
								// User doesn't exist, try to create from sellers
								const seller = await sql`SELECT id, name FROM sellers WHERE id = ${userId}`;
								if (seller.length > 0) {
									// Create user from seller
									const defaultPass = seller[0].name.toLowerCase() + 'sweet';
									await sql`
										INSERT INTO users (username, password_hash, role)
										VALUES (${seller[0].name}, ${defaultPass}, 'user')
										ON CONFLICT (username) DO NOTHING
									`;
								}
							}
						} catch (err) {
							console.error('Error ensuring user exists:', err);
						}
					}
					
				// Delete existing entries for this dessert and date
				await sql`DELETE FROM recipe_production_users WHERE lower(dessert) = lower(${dessert}) AND session_date = ${sessionDate}`;
				console.log(`🗑️ Deleted existing entries for ${dessert} on ${sessionDate}`);
				
				// Insert new entries
				let savedCount = 0;
				const insertErrors = [];
				for (const userId of userIds) {
					try {
						await sql`
							INSERT INTO recipe_production_users (dessert, user_id, session_date)
							VALUES (${dessert}, ${userId}, ${sessionDate})
							ON CONFLICT (dessert, user_id, session_date) DO NOTHING
						`;
						savedCount++;
						console.log(`✅ Inserted ${dessert} - user ${userId}`);
					} catch (err) {
						console.error(`❌ Error saving user ${userId} for ${dessert}:`, err.message);
						insertErrors.push({ userId, error: err.message });
					}
				}
				
				if (insertErrors.length > 0) {
					console.error('Insert errors:', insertErrors);
				}
					
					// ALSO save to delivery_production_users (for page "Entregas")
					// First, get or create a delivery for this date
					try {
						// Check if delivery exists for this date
						let deliveryRows = await sql`SELECT id FROM deliveries WHERE day = ${sessionDate} LIMIT 1`;
						let deliveryId;
						
						if (deliveryRows.length === 0) {
							// Create delivery for this date
							const [newDelivery] = await sql`
								INSERT INTO deliveries (day, note, actor_name)
								VALUES (${sessionDate}, 'Auto-creado desde recetas', '')
								RETURNING id
							`;
							deliveryId = newDelivery.id;
						} else {
							deliveryId = deliveryRows[0].id;
						}
						
					// Get dessert ID from short_code/name
					const dessertRows = await sql`
						SELECT id, name, short_code FROM desserts 
						WHERE lower(name) = lower(${dessert}) OR lower(short_code) = lower(${dessert})
						LIMIT 1
					`;
					
					console.log(`🔍 Looking for dessert '${dessert}':`, dessertRows);
					
					if (dessertRows.length > 0) {
						const dessertId = dessertRows[0].id;
						console.log(`✅ Found dessert: ${dessertRows[0].name} (id: ${dessertId})`);
						
						// Delete existing entries for this delivery, dessert
						await sql`
							DELETE FROM delivery_production_users 
							WHERE delivery_id = ${deliveryId} AND dessert_id = ${dessertId}
						`;
						console.log(`🗑️ Deleted existing delivery_production_users for delivery ${deliveryId}, dessert ${dessertId}`);
						
						// Insert new entries
						for (const userId of userIds) {
							try {
								await sql`
									INSERT INTO delivery_production_users (delivery_id, dessert_id, user_id)
									VALUES (${deliveryId}, ${dessertId}, ${userId})
									ON CONFLICT DO NOTHING
								`;
								console.log(`✅ Inserted delivery_production_users: delivery ${deliveryId}, dessert ${dessertId}, user ${userId}`);
							} catch (err) {
								console.error(`❌ Error saving to delivery_production_users (user ${userId}):`, err.message);
							}
						}
					} else {
						console.error(`❌ Dessert '${dessert}' not found in desserts table!`);
					}
					} catch (err) {
						console.error('Error syncing to deliveries:', err);
						// Don't fail the whole request if delivery sync fails
					}
					
					return json({ ok: true, saved: savedCount });
				}
				
				if (kind === 'dessert.order') {
					const names = Array.isArray(data.names) ? data.names : [];
					for (let i=0;i<names.length;i++) {
						const name = (names[i]||'').toString();
						if (!name) continue;
						await sql`INSERT INTO dessert_order (dessert, position, updated_at) VALUES (${name}, ${i+1}, now()) ON CONFLICT (dessert) DO UPDATE SET position=EXCLUDED.position, updated_at=now()`;
					}
					return json({ ok: true });
				}
				if (kind === 'step.reorder') {
					const ids = Array.isArray(data.ids) ? data.ids.map(x => Number(x)||0).filter(Boolean) : [];
					for (let i=0;i<ids.length;i++) {
						await sql`UPDATE dessert_recipes SET position=${i+1}, updated_at=now() WHERE id=${ids[i]}`;
					}
					return json({ ok: true });
				}
				if (kind === 'item.reorder') {
					const ids = Array.isArray(data.ids) ? data.ids.map(x => Number(x)||0).filter(Boolean) : [];
					for (let i=0;i<ids.length;i++) {
						await sql`UPDATE dessert_recipe_items SET position=${i+1}, updated_at=now() WHERE id=${ids[i]}`;
					}
					return json({ ok: true });
				}
				if (kind === 'step.upsert') {
					const dessert = (data.dessert || '').toString();
					if (!dessert) return json({ error: 'dessert requerido' }, 400);
					const stepName = (data.step_name || null);
					let position = Number(data.position || 0) || 0;
					const id = Number(data.id || 0) || 0;
					const salePrice = data.sale_price !== undefined ? Number(data.sale_price || 0) : null;
					
					// If sale_price is provided, upsert into desserts table
					if (salePrice !== null && salePrice > 0) {
						const shortCode = dessert.toLowerCase().slice(0, 4);
						await sql`
							INSERT INTO desserts (name, short_code, sale_price, position)
							VALUES (${dessert}, ${shortCode}, ${salePrice}, 0)
							ON CONFLICT (name) DO UPDATE SET sale_price = EXCLUDED.sale_price, updated_at = now()
						`;
					}
					
					let row;
					if (id) {
						[row] = await sql`UPDATE dessert_recipes SET dessert=${dessert}, step_name=${stepName}, position=${position}, updated_at=now() WHERE id=${id} RETURNING id, dessert, step_name, position`; 
					} else {
						if (!position || position <= 0) {
							const [p] = await sql`SELECT COALESCE(MAX(position), 0)::int + 1 AS next_pos FROM dessert_recipes WHERE lower(dessert)=lower(${dessert})`;
							position = Number(p?.next_pos || 1) || 1;
						}
						[row] = await sql`INSERT INTO dessert_recipes (dessert, step_name, position) VALUES (${dessert}, ${stepName}, ${position}) RETURNING id, dessert, step_name, position`;
					}
					return json(row, id ? 200 : 201);
				}
				if (kind === 'item.upsert') {
					const recipeId = Number(data.recipe_id || 0) || 0;
					if (!recipeId) return json({ error: 'recipe_id requerido' }, 400);
					const ingredient = (data.ingredient || '').toString();
					const unit = (data.unit || 'g').toString();
					const qty = Number(data.qty_per_unit || 0) || 0;
					const adjustment = Number(data.adjustment || 0) || 0;
					const price = Number(data.price || 0) || 0;
					const packSize = Number(data.pack_size || 0) || 0;
					const position = Number(data.position || 0) || 0;
					const id = Number(data.id || 0) || 0;
					let row;
					if (id) {
						[row] = await sql`UPDATE dessert_recipe_items SET recipe_id=${recipeId}, ingredient=${ingredient}, unit=${unit}, qty_per_unit=${qty}, adjustment=${adjustment}, price=${price}, pack_size=${packSize}, position=${position}, updated_at=now() WHERE id=${id} RETURNING id, recipe_id, ingredient, unit, qty_per_unit, adjustment, price, pack_size, position`;
					} else {
						[row] = await sql`INSERT INTO dessert_recipe_items (recipe_id, ingredient, unit, qty_per_unit, adjustment, price, pack_size, position) VALUES (${recipeId}, ${ingredient}, ${unit}, ${qty}, ${adjustment}, ${price}, ${packSize}, ${position}) RETURNING id, recipe_id, ingredient, unit, qty_per_unit, adjustment, price, pack_size, position`;
					}
					// Ensure inventory item exists for this ingredient
					try { await ensureInventoryItem(ingredient, unit); } catch {}
					return json(row, id ? 200 : 201);
				}
				if (kind === 'extras.upsert') {
					const id = Number(data.id || 0) || 0;
					const ingredient = (data.ingredient || '').toString();
					const unit = (data.unit || 'g').toString();
					const qty = Number(data.qty_per_unit || 0) || 0;
					const price = Number(data.price || 0) || 0;
					const packSize = Number(data.pack_size || 0) || 0;
					const position = Number(data.position || 0) || 0;
					let row;
					if (id) {
						[row] = await sql`UPDATE extras_items SET ingredient=${ingredient}, unit=${unit}, qty_per_unit=${qty}, price=${price}, pack_size=${packSize}, position=${position}, updated_at=now() WHERE id=${id} RETURNING id, ingredient, unit, qty_per_unit, price, pack_size, position`;
					} else {
						[row] = await sql`INSERT INTO extras_items (ingredient, unit, qty_per_unit, price, pack_size, position) VALUES (${ingredient}, ${unit}, ${qty}, ${price}, ${packSize}, ${position}) RETURNING id, ingredient, unit, qty_per_unit, price, pack_size, position`;
					}
					// Ensure inventory item exists for this ingredient
					try { await ensureInventoryItem(ingredient, unit); } catch {}
					return json(row, id ? 200 : 201);
				}
				return json({ error: 'kind inválido' }, 400);
			}
			case 'DELETE': {
				const raw = typeof event.rawQuery === 'string' ? event.rawQuery : (event.queryStringParameters ? new URLSearchParams(event.queryStringParameters).toString() : '');
				const params = new URLSearchParams(raw);
				const kind = params.get('kind');
				if (kind === 'dessert') {
					const dessert = (params.get('dessert') || '').toString();
					if (!dessert) return json({ error: 'dessert requerido' }, 400);
					await sql`DELETE FROM dessert_recipes WHERE lower(dessert)=lower(${dessert})`;
					await sql`DELETE FROM dessert_order WHERE lower(dessert)=lower(${dessert})`;
					return json({ ok: true });
				}
				const id = Number(params.get('id') || 0) || 0;
				if (!id) return json({ error: 'id requerido' }, 400);
				if (kind === 'step') { await sql`DELETE FROM dessert_recipes WHERE id=${id}`; return json({ ok: true }); }
				if (kind === 'item') { await sql`DELETE FROM dessert_recipe_items WHERE id=${id}`; return json({ ok: true }); }
				if (kind === 'extras') { await sql`DELETE FROM extras_items WHERE id=${id}`; return json({ ok: true }); }
				return json({ error: 'kind inválido' }, 400);
			}
			default:
				return json({ error: 'Método no permitido' }, 405);
		}
	} catch (err) {
		return json({ error: String(err) }, 500);
	}
}

async function seedDefaults() {
	// Seed the five desserts with provided recipes and extras; idempotent-ish by clearing first
	await sql`DELETE FROM dessert_recipe_items`;
	await sql`DELETE FROM dessert_recipes`;
	await sql`DELETE FROM extras_items`;
	function step(dessert, stepName, position) {
		return sql`INSERT INTO dessert_recipes (dessert, step_name, position) VALUES (${dessert}, ${stepName}, ${position}) RETURNING id`;
	}
	async function items(recipeId, arr) {
		for (let i=0;i<arr.length;i++) {
			const it = arr[i];
			await sql`INSERT INTO dessert_recipe_items (recipe_id, ingredient, unit, qty_per_unit, position) VALUES (${recipeId}, ${it.ingredient}, ${it.unit}, ${it.qty}, ${i+1})`;
		}
	}
	// Arco (single step)
	{
		const [s] = await step('Arco', null, 1);
		await items(s.id, [
			{ ingredient: 'Gelatina amarilla', unit: 'g', qty: 4.7 },
			{ ingredient: 'Gelatina roja', unit: 'g', qty: 4.7 },
			{ ingredient: 'Gelatina morada', unit: 'g', qty: 4.7 },
			{ ingredient: 'Lechera', unit: 'g', qty: 84.51 },
			{ ingredient: 'Crema de leche Alpina', unit: 'g', qty: 84.51 },
			{ ingredient: 'Leche Colanta', unit: 'g', qty: 105.63 },
			{ ingredient: 'Gelatina sin sabor', unit: 'g', qty: 4.23 },
			{ ingredient: 'Agua', unit: 'g', qty: 21.13 },
		]);
	}
	// Melo
	{
		const [s] = await step('Melo', null, 1);
		await items(s.id, [
			{ ingredient: 'Lechera', unit: 'g', qty: 81.46 },
			{ ingredient: 'Crema de leche Alpina', unit: 'g', qty: 81.46 },
			{ ingredient: 'Leche Colanta', unit: 'g', qty: 122.18 },
			{ ingredient: 'Gelatina sin sabor', unit: 'g', qty: 4.36 },
			{ ingredient: 'Agua', unit: 'g', qty: 20.36 },
			{ ingredient: 'Melocotón', unit: 'g', qty: 60 },
			{ ingredient: 'Almíbar', unit: 'g', qty: 10.18 },
		]);
	}
	// Mara (4 steps)
	{
		const [s1] = await step('Mara', 'Fondo', 1);
		await items(s1.id, [
			{ ingredient: 'Galletas', unit: 'unidad', qty: 2 },
			{ ingredient: 'Lechera', unit: 'g', qty: 9 },
			{ ingredient: 'Crema de leche Alpina', unit: 'g', qty: 9 },
			{ ingredient: 'Leche Alquería', unit: 'g', qty: 22.5 },
			{ ingredient: 'Vainilla', unit: 'g', qty: 0.1 },
		]);
		const [s2] = await step('Mara', 'Mezcla', 2);
		await items(s2.id, [
			{ ingredient: 'Lechera', unit: 'g', qty: 11 },
			{ ingredient: 'Puré de mango', unit: 'g', qty: 30.4 },
			{ ingredient: 'Gelatina sin sabor', unit: 'g', qty: 0.8 },
			{ ingredient: 'Agua', unit: 'g', qty: 3.6 },
			{ ingredient: 'Crema de leche Colanta', unit: 'g', qty: 19 },
		]);
		const [s3] = await step('Mara', 'Mascarpone', 3);
		await items(s3.id, [
			{ ingredient: 'Queso crema', unit: 'g', qty: 38 },
			{ ingredient: 'Crema de leche Colanta', unit: 'g', qty: 9.5 },
			{ ingredient: 'Mantequilla', unit: 'g', qty: 2.28 },
		]);
		const [s4] = await step('Mara', 'Cubierta', 4);
		await items(s4.id, [
			{ ingredient: 'Puré de maracuyá', unit: 'g', qty: 20 },
			{ ingredient: 'Agua', unit: 'g', qty: 6 },
			{ ingredient: 'Crema de leche Alpina', unit: 'g', qty: 11 },
			{ ingredient: 'Lechera', unit: 'g', qty: 3 },
			{ ingredient: 'Gelatina sin sabor', unit: 'g', qty: 0.8 },
		]);
	}
	// Oreo (4 steps)
	{
		const [s1] = await step('Oreo', 'Fondo', 1);
		await items(s1.id, [
			{ ingredient: 'Galleta Oreo molida', unit: 'g', qty: 26 },
			{ ingredient: 'Mantequilla', unit: 'g', qty: 6 },
		]);
		const [s2] = await step('Oreo', 'Crema de vainilla', 2);
		await items(s2.id, [
			{ ingredient: 'Crema de leche Colanta', unit: 'g', qty: 20 },
			{ ingredient: 'Chocolate blanco', unit: 'g', qty: 7 },
			{ ingredient: 'Agua', unit: 'g', qty: 6.5 },
			{ ingredient: 'Gelatina sin sabor', unit: 'g', qty: 1.3 },
			{ ingredient: 'Esencia de vainilla', unit: 'g', qty: 0.3 },
			{ ingredient: 'Lechera', unit: 'g', qty: 30 },
			{ ingredient: 'Galleta Oreo molida', unit: 'g', qty: 2 },
		]);
		const [s3] = await step('Oreo', 'Mezcla', 3);
		await items(s3.id, [
			{ ingredient: 'Crema de leche Colanta', unit: 'g', qty: 45 },
			{ ingredient: 'Queso crema', unit: 'g', qty: 40 },
		]);
		const [s4] = await step('Oreo', 'Cubierta', 4);
		await items(s4.id, [
			{ ingredient: 'Oreo fino', unit: 'g', qty: 2.5 },
		]);
	}
	// Nute (single step, with Nutella split as three items)
	{
		const [s] = await step('Nute', null, 1);
		await items(s.id, [
			{ ingredient: 'Chips Ahoy', unit: 'unidad', qty: 2 },
			{ ingredient: 'Crema de leche Colanta', unit: 'g', qty: 80 },
			{ ingredient: 'Agua', unit: 'g', qty: 2 },
			{ ingredient: 'Gelatina sin sabor', unit: 'g', qty: 0.5 },
			{ ingredient: 'Queso crema', unit: 'g', qty: 35 },
			{ ingredient: 'Nutella (Sides)', unit: 'g', qty: 1 },
			{ ingredient: 'Nutella (Top)', unit: 'g', qty: 1 },
			{ ingredient: 'Nutella (Relleno)', unit: 'g', qty: 18 },
			{ ingredient: 'Ferrero', unit: 'unidad', qty: 1 },
		]);
	}
	// Extras
	await sql`INSERT INTO extras_items (ingredient, unit, qty_per_unit, position) VALUES ('Cuchara', 'unidad', 1, 1), ('Bolsa cuchara', 'unidad', 1, 2), ('Contenedor 8 oz', 'unidad', 1, 3), ('Sticker', 'unidad', 1, 4)`;
}

