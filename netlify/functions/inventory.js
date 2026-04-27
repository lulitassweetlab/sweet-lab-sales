import { ensureSchema, sql, ensureInventoryItem, canonicalizeIngredientName, recalculateAllDessertCosts } from './_db.js';

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
					const rows = await sql`SELECT id, ingredient, kind, qty, note, actor_name, metadata, created_at FROM inventory_movements ORDER BY id DESC LIMIT 1000`;
					return json(rows);
				}
				
				if (historyFor) {
					const name = canonicalizeIngredientName(historyFor.toString());
					const rows = await sql`SELECT id, ingredient, kind, qty, note, actor_name, metadata, created_at FROM inventory_movements WHERE lower(ingredient)=lower(${name}) ORDER BY id DESC LIMIT 500`;
					return json(rows);
				}

				// Unified Inventory List
				const items = await sql`SELECT id, ingredient, category, unit, price, pack_size FROM inventory_items ORDER BY category ASC, ingredient ASC`;
				const rawMovs = await sql`SELECT ingredient, SUM(qty)::numeric AS qty FROM inventory_movements GROUP BY ingredient`;
				const movsMap = new Map();
				for (const r of (rawMovs || [])) {
					const canon = canonicalizeIngredientName((r.ingredient||'').toString());
					const key = (canon||'').toString().toLowerCase();
					const prev = Number(movsMap.get(key) || 0) || 0;
					movsMap.set(key, prev + (Number(r.qty||0)||0));
				}

				const result = items.map(it => {
					const key = (it.ingredient || '').toString().toLowerCase();
					const saldo = Number(movsMap.get(key) || 0) || 0;
					return { ...it, saldo, valor: saldo * Number(it.price || 0) };
				});

				return json(result);
			}
			case 'POST': {
				const data = JSON.parse(event.body || '{}');
				const action = (data.action || '').toString();
				const actor = (data.actor_name || '').toString() || null;

				if (action === 'add_item') {
					const ingredient = canonicalizeIngredientName((data.ingredient || '').toString().trim());
					if (!ingredient) return json({ error: 'ingredient requerido' }, 400);
					const { unit = 'g', category = 'ingrediente', price = 0, pack_size = 0 } = data;
					const [row] = await sql`
						INSERT INTO inventory_items (ingredient, unit, category, price, pack_size)
						VALUES (${ingredient}, ${unit}, ${category}, ${price}, ${pack_size})
						RETURNING *
					`;
					await recalculateAllDessertCosts();
					return json(row, 201);
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
					const canonOld = norm(old.ingredient);

					// We check for any OTHER item that matches the canonical name
					const [existing] = await sql`
						SELECT id, ingredient FROM inventory_items 
						WHERE (lower(trim(ingredient)) = lower(trim(${newName})) 
						   OR lower(trim(ingredient)) = lower(trim(${old.ingredient})))
						  AND id != ${id}
						LIMIT 1
					`;
					
					// Note: Since I can't do complex JS normalization easily inside a SQL WHERE without extensions, 
					// we'll rely on the simple lower(trim) for the SQL and then verify the JS side if needed.
					// But usually lower(trim) + exact match is enough for what the user is doing.

					if (existing && (newName !== old.ingredient || canonNew === norm(existing.ingredient))) {
						console.log(`[MERGE] ${old.ingredient} -> ${existing.ingredient}`);
						await sql`UPDATE inventory_movements SET ingredient = ${existing.ingredient} WHERE lower(trim(ingredient)) = lower(trim(${old.ingredient}))`;
						await sql`UPDATE dessert_recipe_items SET ingredient = ${existing.ingredient} WHERE lower(trim(ingredient)) = lower(trim(${old.ingredient}))`;
						await sql`UPDATE extras_items SET ingredient = ${existing.ingredient} WHERE lower(trim(ingredient)) = lower(trim(${old.ingredient}))`;
						await sql`DELETE FROM inventory_items WHERE id = ${id}`;
						await recalculateAllDessertCosts();
						return json({ status: 'merged', target_id: existing.id, ingredient: existing.ingredient });
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
					if (!ingredient) return json({ error: 'ingredient requerido' }, 400);
					if (!qty) return json({ error: 'qty requerido' }, 400);
					await ensureInventoryItem(ingredient, unit);
					const signed = action === 'ingreso' ? Math.abs(qty) : qty;
					const [row] = await sql`INSERT INTO inventory_movements (ingredient, kind, qty, note, actor_name, metadata) VALUES (${ingredient}, ${action}, ${signed}, ${note}, ${actor}, '{}'::jsonb) RETURNING *`;
					return json(row, 201);
				}

				if (action === 'reset') {
					await sql`DELETE FROM inventory_movements`;
					return json({ ok: true, cleared: true });
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

