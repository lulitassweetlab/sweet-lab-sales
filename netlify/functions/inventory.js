import { ensureSchema, sql, ensureInventoryItem, canonicalizeIngredientName, recalculateAllDessertCosts, updateIngredientPMP } from './_db.js';

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
				const historyFor = params.get('history_for');
				const historyAll = params.get('history_all');
				
				if (historyAll) {
					const dateStart = params.get('date_start');
					let rows;
					if (dateStart) {
						rows = await sql`SELECT id, ingredient, kind, qty, note, actor_name, metadata, created_at FROM inventory_movements WHERE created_at >= ${dateStart} OR (metadata->>'target_date') >= ${dateStart} ORDER BY id DESC LIMIT 2000`;
					} else {
						rows = await sql`SELECT id, ingredient, kind, qty, note, actor_name, metadata, created_at FROM inventory_movements ORDER BY id DESC LIMIT 1000`;
					}
					return json(rows);
				}
				
				if (historyFor) {
					const name = canonicalizeIngredientName(historyFor.toString());
					const rows = await sql`SELECT id, ingredient, kind, qty, note, actor_name, metadata, created_at FROM inventory_movements WHERE lower(ingredient)=lower(${name}) ORDER BY id DESC LIMIT 500`;
					return json(rows);
				}

				const actionQuery = params.get('action');
				if (actionQuery === 'get_production_logs') {
					const stepId = params.get('step_id');
					let list;
					if (stepId) {
						list = await sql`SELECT id, step_id, qty, duration_seconds, actor_name, created_at FROM production_logs WHERE step_id = ${Number(stepId)} ORDER BY created_at DESC LIMIT 100`;
					} else {
						list = await sql`SELECT id, step_id, qty, duration_seconds, actor_name, created_at FROM production_logs ORDER BY created_at DESC LIMIT 1000`;
					}
					return json(list);
				}

				if (actionQuery === 'get_conversions') {
					const list = await sql`SELECT * FROM inventory_conversions ORDER BY ingredient_name`;
					return json(list);
				}

				if (actionQuery === 'get_aliases') {
					const list = await sql`SELECT * FROM inventory_alias ORDER BY alias ASC`;
					return json(list);
				}

				// Unified Inventory List
				const items = await sql`SELECT id, ingredient, category, unit, price, pack_size FROM inventory_items ORDER BY category DESC, ingredient ASC`;
				const rawMovs = await sql`SELECT ingredient, SUM(qty)::numeric AS qty FROM inventory_movements GROUP BY ingredient`;
				const movsMap = new Map();
				for (const r of (rawMovs || [])) {
					const canon = canonicalizeIngredientName((r.ingredient||'').toString());
					const key = (canon||'').toString().toLowerCase();
					const prev = Number(movsMap.get(key) || 0) || 0;
					movsMap.set(key, prev + (Number(r.qty||0)||0));
				}

				const result = items.map(it => {
					const canonName = canonicalizeIngredientName(it.ingredient || '');
					const key = canonName.toLowerCase();
					const saldo = Number(movsMap.get(key) || 0) || 0;
					return { ...it, saldo, valor: saldo * Number(it.price || 0) };
				});

				return json(result);
			}
			case 'POST': {
				const data = JSON.parse(event.body || '{}');
				const action = (data.action || '').toString();
				const actor = (data.actor_name || '').toString() || null;

				if (action === 'save_alias') {
					const { alias, ingredient_name } = data;
					if (!alias || !ingredient_name) return json({ error: 'Missing alias or ingredient_name' }, 400);
					
					await sql`
						INSERT INTO inventory_alias (alias, ingredient_name)
						VALUES (${alias.toLowerCase().trim()}, ${ingredient_name})
						ON CONFLICT (alias, vendor) DO UPDATE SET ingredient_name = EXCLUDED.ingredient_name
					`;
					return json({ ok: true });
				}


				if (action === 'save_conversion') {
					const { ingredient_name, factor } = data;
					if (!ingredient_name || factor === undefined) return json({ error: 'Missing name or factor' }, 400);
					await sql`INSERT INTO inventory_conversions (ingredient_name, factor) VALUES (${ingredient_name}, ${factor}) ON CONFLICT (ingredient_name) DO UPDATE SET factor = EXCLUDED.factor`;
					return json({ ok: true });
				}

				if (action === 'delete_conversion') {
					const { id } = data;
					if (!id) return json({ error: 'Missing id' }, 400);
					await sql`DELETE FROM inventory_conversions WHERE id = ${id}`;
					return json({ ok: true });
				}

				if (action === 'delete_production') {
					const { ids } = data;
					if (!ids || !Array.isArray(ids) || ids.length === 0) return json({ error: 'Missing or invalid ids' }, 400);
					const numericIds = ids.map(id => Number(id)).filter(id => !isNaN(id));
					
					let deletedCount = 0;
					for (const id of numericIds) {
						const result = await sql`DELETE FROM inventory_movements WHERE id = ${id} RETURNING id`;
						if (result.length > 0) deletedCount++;
					}
					
					return json({ ok: true, deletedCount });
				}

				if (action === 'add_item') {
					const ingredient = (data.ingredient || '').toString().trim();
					if (!ingredient) return json({ error: 'ingredient requerido' }, 400);
					const { unit = 'g', category = 'ingrediente', price = 0, pack_size = 0 } = data;

					// ⚠️ SUPER NORMALIZATION check
					const norm = (s) => (s || '').toLowerCase().trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
					const canonNew = norm(ingredient);

					const all = await sql`SELECT id, ingredient, category FROM inventory_items`;
					const existing = all.find(it => norm(it.ingredient) === canonNew);

					if (existing) {
						// Item already exists (deep normalization), just update it
						const [row] = await sql`
							UPDATE inventory_items 
							SET 
								unit = ${unit}, 
								category = ${category || existing.category}, 
								price = ${Number(price) || 0}, 
								pack_size = ${Number(pack_size) || 0}, 
								updated_at = now()
							WHERE id = ${existing.id}
							RETURNING *
						`;
						await recalculateAllDessertCosts();
						return json({ ...row, status: 'updated_existing' });
					}

					const [row] = await sql`
						INSERT INTO inventory_items (ingredient, unit, category, price, pack_size)
						VALUES (${ingredient}, ${unit}, ${category}, ${price}, ${pack_size})
						RETURNING *
					`;
					await recalculateAllDessertCosts();
					return json(row, 201);
				}

				if (action === 'merge_ingredients') {
					const { source, target } = data;
					if (!source || !target) return json({ error: 'Missing source or target' }, 400);
					
					await sql`UPDATE inventory_movements SET ingredient = ${target} WHERE ingredient = ${source}`;
					await sql`DELETE FROM inventory_items WHERE ingredient = ${source}`;
					await recalculateAllDessertCosts();
					return json({ ok: true });
				}

				if (action === 'update_item') {
					const { id, price, category, unit, pack_size, ingredient } = data;
					if (!id) return json({ error: 'id requerido' }, 400);

					const [old] = await sql`SELECT * FROM inventory_items WHERE id = ${id}`;
					if (!old) return json({ error: 'ítem no encontrado' }, 404);

					const newName = (ingredient || old.ingredient || '').trim();

					// ⚠️ SUPER NORMALIZATION for merge check (accents, cases, spaces)
					const norm = (s) => (s || '').toLowerCase().trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
					const canonNew = norm(newName);

					// We check for any OTHER item that matches the canonical name using deep normalization
					const all = await sql`SELECT id, ingredient FROM inventory_items WHERE id != ${id}`;
					const existing = all.find(it => norm(it.ingredient) === canonNew);
					
					if (existing) {
						console.log(`[MERGE] ${old.ingredient} -> ${existing.ingredient}`);
						// Update ALL references in other tables
						const oldName = old.ingredient;
						const targetName = existing.ingredient;

						await sql`UPDATE inventory_movements SET ingredient = ${targetName} WHERE lower(trim(ingredient)) = lower(trim(${oldName}))`;
						await sql`UPDATE dessert_recipe_items SET ingredient = ${targetName} WHERE lower(trim(ingredient)) = lower(trim(${oldName}))`;
						await sql`UPDATE extras_items SET ingredient = ${targetName} WHERE lower(trim(ingredient)) = lower(trim(${oldName}))`;
						
						// Update the existing item with new data if provided (price, etc)
						await sql`
							UPDATE inventory_items 
							SET 
								price = ${price !== undefined ? Number(price) : existing.price},
								category = ${category || existing.category},
								unit = ${unit || existing.unit},
								pack_size = ${pack_size !== undefined ? Number(pack_size) : existing.pack_size},
								updated_at = now()
							WHERE id = ${existing.id}
						`;

						await sql`DELETE FROM inventory_items WHERE id = ${id}`;
						await recalculateAllDessertCosts();
						return json({ status: 'merged', target_id: existing.id, ingredient: targetName });
					}

					// Standard Update
					const [row] = await sql`
						UPDATE inventory_items 
						SET 
							ingredient = ${newName}, 
							price = ${price !== undefined ? Number(price) : old.price}, 
							category = ${category || old.category}, 
							unit = ${unit || old.unit}, 
							pack_size = ${pack_size !== undefined ? Number(pack_size) : old.pack_size}, 
							updated_at = now()
						WHERE id = ${id}
						RETURNING *
					`;
					
					// If name changed (even without merge), sync movements/recipes
					if (newName !== old.ingredient) {
						await sql`UPDATE inventory_movements SET ingredient = ${newName} WHERE lower(trim(ingredient)) = lower(trim(${old.ingredient}))`;
						await sql`UPDATE dessert_recipe_items SET ingredient = ${newName} WHERE lower(trim(ingredient)) = lower(trim(${old.ingredient}))`;
						await sql`UPDATE extras_items SET ingredient = ${newName} WHERE lower(trim(ingredient)) = lower(trim(${old.ingredient}))`;
					}

					await recalculateAllDessertCosts();
					return json(row);
				}

				if (action === 'delete_item') {
					const { id } = data;
					if (!id) return json({ error: 'id requerido' }, 400);
					await sql`DELETE FROM inventory_items WHERE id = ${id}`;
					return json({ ok: true });
				}

				if (action === 'ingreso' || action === 'ajuste') {
					const ingredient = canonicalizeIngredientName((data.ingredient || '').toString().trim());
					const unit = (data.unit || 'g').toString();
					let qty = Number(data.qty || 0) || 0;
					const note = (data.note || '').toString();
					const totalCost = Number(data.total_cost || 0); // Opcional para PMP
					const unitPrice = Number(data.unit_price || 0); // Opcional para PMP
					
					if (!ingredient) return json({ error: 'ingredient requerido' }, 400);
					if (!qty) return json({ error: 'qty requerido' }, 400);
					
					await ensureInventoryItem(ingredient, unit);
					const signed = action === 'ingreso' ? Math.abs(qty) : qty;
					
					const metadata = data.metadata && typeof data.metadata === 'object' ? data.metadata : {};
					if (totalCost > 0) metadata.total_cost = totalCost;
					if (unitPrice > 0) metadata.unit_price = unitPrice;

					const movementDate = data.date || null;
					const [row] = await sql`
						INSERT INTO inventory_movements (ingredient, kind, qty, note, actor_name, metadata, created_at) 
						VALUES (${ingredient}, ${action}, ${signed}, ${note}, ${actor}, ${JSON.stringify(metadata)}::jsonb, COALESCE(${movementDate}::timestamptz, now())) 
						RETURNING *
					`;
					
					// Si es un ingreso con precio, actualizar PMP
					if (action === 'ingreso' && (totalCost > 0 || unitPrice > 0)) {
						const priceToUse = unitPrice > 0 ? unitPrice : (totalCost / Math.abs(qty));
						await updateIngredientPMP(ingredient, Math.abs(qty), priceToUse);
					}

					return json(row, 201);
				}

				if (action === 'compra') {
					const { items, total_cost, note, date, receipt_base64, receipt_name, accounting_id } = data;
					if (!items || !items.length || !total_cost || !date) return json({ error: 'Faltan campos requeridos (items, total, fecha)' }, 400);

					const results = [];
					const metadata = { total_cost: Number(total_cost), purchase_date: date, items_count: items.length };

					let accEntry;
					const accDesc = note || (items[0].ingredient + (items.length > 1 ? '...' : ''));

					if (accounting_id) {
						// MODO EDICIÓN
						[accEntry] = await sql`
							UPDATE accounting_entries 
							SET entry_date = ${date}, description = ${accDesc}, amount_cents = ${Number(total_cost)}, actor_name = ${actor} 
							WHERE id = ${Number(accounting_id)} 
							RETURNING *
						`;
						// Borrar movimientos previos para re-insertar los nuevos
						await sql`DELETE FROM inventory_movements WHERE metadata->>'accounting_id' = ${accounting_id.toString()}`;
					} else {
						// MODO NUEVO
						[accEntry] = await sql`INSERT INTO accounting_entries (kind, entry_date, description, amount_cents, actor_name) VALUES ('gasto', ${date}, ${accDesc}, ${Number(total_cost)}, ${actor}) RETURNING *`;
					}
					
					metadata.accounting_id = accEntry.id;

					// Etiquetado automático: Insumos
					try {
						const [tag] = await sql`SELECT id FROM accounting_tags WHERE lower(name) = 'insumos' LIMIT 1`;
						if (tag) {
							await sql`INSERT INTO accounting_entry_tags (entry_id, tag_id) VALUES (${accEntry.id}, ${tag.id}) ON CONFLICT DO NOTHING`;
						}
					} catch (e) { console.error('Error tagging as Insumos:', e); }

					// 2. Procesar cada item (Nuevo o Actualizado)
					for (const it of items) {
						const canon = canonicalizeIngredientName(it.ingredient);
						await ensureInventoryItem(canon);
						
						// Movimiento individual para trazabilidad
						const itemMeta = { total_cost: Number(it.price_cents || 0), purchase_date: date, accounting_id: accEntry.id };
						const [invMov] = await sql`
							INSERT INTO inventory_movements (ingredient, kind, qty, note, actor_name, metadata, created_at) 
							VALUES (${canon}, 'ingreso', ${Math.abs(it.qty)}, ${note || 'Parte de compra multi'}, ${actor}, ${JSON.stringify(itemMeta)}::jsonb, ${date}) 
							RETURNING id
						`;
						
						// Calcular precio unitario para PMP si se proporcionó precio por item, si no, prorratear o usar 0
						const unitPrice = it.price_cents ? (Number(it.price_cents) / Math.abs(it.qty)) : 0;
						if (unitPrice > 0) {
							await updateIngredientPMP(canon, Math.abs(it.qty), unitPrice);
						}
						results.push({ ingredient: canon, movement_id: invMov.id });
					}

					// 3. Adjunto si existe
					if (receipt_base64) {
						await sql`INSERT INTO accounting_attachments (entry_id, file_base64, mime_type, file_name) VALUES (${accEntry.id}, ${receipt_base64}, 'image/jpeg', ${receipt_name || 'recibo.jpg'})`;
					}

					return json({ ok: true, accounting_id: accEntry.id, movements: results }, 201);
				}
				
				if (action === 'delete_purchase') {
					const { accounting_id } = data;
					if (!accounting_id) return json({ error: 'accounting_id requerido' }, 400);
					
					// 1. Borrar movimientos de inventario asociados
					await sql`DELETE FROM inventory_movements WHERE metadata->>'accounting_id' = ${accounting_id.toString()}`;
					
					// 2. Borrar asiento contable (esto borra los adjuntos por CASCADE)
					await sql`DELETE FROM accounting_entries WHERE id = ${Number(accounting_id)}`;
					
					return json({ ok: true });
				}

				if (action === 'reset') {
					await sql`DELETE FROM inventory_movements`;
					return json({ ok: true, cleared: true });
				}

				if (action === 'update_production_log') {
					const logId = Number(data.log_id || 0);
					const qty = Number(data.qty || 0);
					const durationSeconds = Number(data.duration_seconds || 0);
					if (!logId) return json({ error: 'log_id requerido' }, 400);

					await sql`
						UPDATE production_logs 
						SET qty = ${qty}, duration_seconds = ${durationSeconds}
						WHERE id = ${logId}
					`;
					return json({ ok: true });
				}

				if (action === 'produccion_paso') {
					const stepId = Number(data.step_id || 0);
					const multiplier = Number(data.multiplier || 1) || 1;
					const producedQty = Number(data.produced_qty || 0) || 0;
					if (!stepId) return json({ error: 'step_id requerido' }, 400);

					const [step] = await sql`SELECT id, dessert, step_name, produces_ingredient, produces_unit FROM dessert_recipes WHERE id = ${stepId}`;
					if (!step) return json({ error: 'paso no encontrado' }, 404);

					const items = await sql`SELECT ingredient, unit, qty_per_unit FROM dessert_recipe_items WHERE recipe_id = ${stepId}`;

					const results = [];
					const note = `Producción: ${step.dessert}${step.step_name ? ' - ' + step.step_name : ''} (x${multiplier})`;
					
					const metadata = { step_id: stepId, multiplier: multiplier };
					if (data.target_date) metadata.target_date = data.target_date;
					if (producedQty > 0) metadata.produced_qty = producedQty;

					const now = new Date();
					
					// 0. Log duration if provided
					const durationSeconds = Number(data.duration_seconds || 0) || 0;
					if (durationSeconds > 0) {
						await sql`
							INSERT INTO production_logs (step_id, qty, duration_seconds, actor_name, created_at)
							VALUES (${stepId}, ${multiplier}, ${durationSeconds}, ${actor}, ${now})
						`;
					}

					// 1. Record consumption of ingredients
					let insertedProduccion = false;
					
					if (data.custom_ingredients && Array.isArray(data.custom_ingredients)) {
						for (const customIt of data.custom_ingredients) {
							const canon = (customIt.ingredient || '').toString().trim();
							const qtyToSubtract = -Math.abs(Number(customIt.qty || 0));
							
							if (qtyToSubtract === 0) continue;

							const [row] = await sql`
								INSERT INTO inventory_movements (ingredient, kind, qty, note, actor_name, metadata, created_at) 
								VALUES (${canon}, 'produccion', ${qtyToSubtract}, ${note + ' (Ajuste manual)'}, ${actor}, ${JSON.stringify(metadata)}::jsonb, ${now}) 
								RETURNING *
							`;
							results.push({ ingredient: canon, qty: qtyToSubtract, movement_id: row?.id, type: 'consumption' });
							insertedProduccion = true;
						}
					} else {
						for (const it of items) {
							const canon = (it.ingredient || '').toString().trim();
							const qtyToSubtract = -Math.abs(Number(it.qty_per_unit || 0) * multiplier);
							
							if (qtyToSubtract === 0) continue;

							const [row] = await sql`
								INSERT INTO inventory_movements (ingredient, kind, qty, note, actor_name, metadata, created_at) 
								VALUES (${canon}, 'produccion', ${qtyToSubtract}, ${note}, ${actor}, ${JSON.stringify(metadata)}::jsonb, ${now}) 
								RETURNING *
							`;
							results.push({ ingredient: canon, qty: qtyToSubtract, movement_id: row?.id, type: 'consumption' });
							insertedProduccion = true;
						}
					}

					// Si no hubo ingredientes (es solo una actividad), insertamos un movimiento en cero para que el historial lo cuente
					if (!insertedProduccion) {
						const [row] = await sql`
							INSERT INTO inventory_movements (ingredient, kind, qty, note, actor_name, metadata, created_at) 
							VALUES ('- Actividad -', 'produccion', 0, ${note}, ${actor}, ${JSON.stringify(metadata)}::jsonb, ${now}) 
							RETURNING *
						`;
						results.push({ ingredient: '- Actividad -', qty: 0, movement_id: row?.id, type: 'activity' });
					}

					// 2. Record production output (if configured and qty > 0)
					if (producedQty > 0 && step.produces_ingredient) {
						const canonProduced = (step.produces_ingredient || '').toString().trim();
						const noteProduced = `Resultado de producción: ${step.dessert}${step.step_name ? ' - ' + step.step_name : ''} (x${multiplier})`;
						
						const [rowProduced] = await sql`
							INSERT INTO inventory_movements (ingredient, kind, qty, note, actor_name, metadata, created_at) 
							VALUES (${canonProduced}, 'entrada', ${producedQty}, ${noteProduced}, ${actor}, ${JSON.stringify(metadata)}::jsonb, ${now}) 
							RETURNING *
						`;
						results.push({ ingredient: canonProduced, qty: producedQty, movement_id: rowProduced?.id, type: 'output' });
					}

					return json({ 
						ok: true, 
						step: step.step_name, 
						dessert: step.dessert, 
						movements: results,
						produced: producedQty > 0 ? { ingredient: step.produces_ingredient, qty: producedQty } : null
					});
				}

				if (action === 'produccion') {
					const counts = data.counts && typeof data.counts === 'object' ? data.counts : {};
					const desserts = await sql`SELECT id, short_code, name FROM desserts WHERE is_active = true`;
					const steps = await sql`SELECT id, dessert FROM dessert_recipes`;
					const stepIds = steps.map(s => s.id);
					let items = [];
					if (stepIds.length) items = await sql`SELECT recipe_id, ingredient, unit, qty_per_unit FROM dessert_recipe_items WHERE recipe_id = ANY(${stepIds})`;
					const extras = await sql`SELECT ingredient, unit, qty_per_unit FROM extras_items`;
					
					const totals = new Map();
					function add(ing, unit, qty) {
						if (!ing) return;
						const canon = canonicalizeIngredientName(ing.toString());
						const prev = totals.get(canon) || { unit: unit || 'g', qty: 0 };
						prev.qty += Number(qty || 0) || 0;
						if (unit) prev.unit = unit;
						totals.set(canon, prev);
					}

					for (const d of desserts) {
						const q = Number(counts[d.short_code] || 0);
						if (q <= 0) continue;
						const dSteps = steps.filter(s => s.dessert.toLowerCase() === d.name.toLowerCase() || s.dessert.toLowerCase() === d.short_code.toLowerCase());
						for (const s of dSteps) {
							for (const it of items.filter(i => i.recipe_id === s.id)) add(it.ingredient, it.unit, Number(it.qty_per_unit || 0) * q);
						}
					}
					
					let totalUnits = 0;
					for (const k in counts) totalUnits += Number(counts[k] || 0);
					for (const ex of (extras || [])) add(ex.ingredient, ex.unit, Number(ex.qty_per_unit || 0) * totalUnits);

					const out = [];
					for (const [ingredient, v] of totals.entries()) {
						const [row] = await sql`INSERT INTO inventory_movements (ingredient, kind, qty, note, actor_name, metadata) VALUES (${ingredient}, 'produccion', ${-Math.abs(v.qty || 0)}, 'Producción aprobada', ${actor}, ${JSON.stringify({ counts })}::jsonb) RETURNING *`;
						out.push({ ingredient, unit: v.unit, qty: v.qty, movement_id: row?.id });
					}
					return json({ ok: true, movements: out });
				}

				return json({ error: 'acción inválida' }, 400);
			}
			default:
				return json({ error: 'Método no permitido' }, 405);
		}
	} catch (err) {
		return json({ error: String(err) }, 500);
	}
}

