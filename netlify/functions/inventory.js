import { ensureSchema, sql, ensureInventoryItem, canonicalizeIngredientName } from './_db.js';

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
					const rows = await sql`SELECT id, ingredient, kind, qty, note, actor_name, metadata, created_at FROM inventory_movements ORDER BY id DESC LIMIT 500`;
					return json(rows);
				}
				if (historyFor) {
					const name = canonicalizeIngredientName(historyFor.toString());
					const rows = await sql`SELECT id, ingredient, kind, qty, note, actor_name, metadata, created_at FROM inventory_movements WHERE lower(ingredient)=lower(${name}) ORDER BY id DESC LIMIT 200`;
					return json(rows);
				}
				// Default: list unique ingredients from Recetas/Extras with saldo and price
				// 1) Read recipe items (with price) and extras (without price)
				const recipeItems = await sql`SELECT ingredient, unit, price FROM dessert_recipe_items`;
				const extraItems = await sql`SELECT ingredient, unit FROM extras_items`;
				// 2) Build canonical definitions map: key -> { ingredient, unit, price }
				const defs = new Map();
				function upsertDef(name, unit, price, isExtra = false){
					if (!name) return;
					const canon = canonicalizeIngredientName((name||'').toString());
					const key = (canon||'').toString().toLowerCase();
					if (!key) return;
					const prev = defs.get(key) || { ingredient: canon, unit: unit || 'g', price: 0, isExtra: false };
					if (unit && unit !== '') prev.unit = unit;
					const p = Number(price || 0) || 0;
					if (p > 0 && p > Number(prev.price || 0)) prev.price = p;
					if (isExtra) prev.isExtra = true;
					defs.set(key, prev);
				}
				for (const it of (recipeItems || [])) upsertDef(it.ingredient, it.unit, it.price, false);
				for (const it of (extraItems || [])) upsertDef(it.ingredient, it.unit, 0, true);
				// 3) Compute balances by canonical key
				// Aggregate movements by canonical name to avoid split balances
				const rawMovs = await sql`SELECT ingredient, SUM(qty)::numeric AS qty FROM inventory_movements GROUP BY ingredient`;
				const movs = new Map();
				for (const r of (rawMovs || [])) {
					const canon = canonicalizeIngredientName((r.ingredient||'').toString());
					const key = (canon||'').toString().toLowerCase();
					const prev = Number(movs.get(key) || 0) || 0;
					movs.set(key, prev + (Number(r.qty||0)||0));
				}
				const saldoByKey = movs;
				// 4) Materialize list, excluding items with price 0
				const list = [];
				for (const [key, v] of defs.entries()) {
					const price = Number(v.price || 0) || 0;
					if (price <= 0 && !v.isExtra) continue; // excluir costo 0, excepto extras
					const saldo = Number(saldoByKey.get(key) || 0) || 0;
					list.push({ ingredient: v.ingredient, unit: v.unit || 'g', saldo, price, valor: saldo * price });
				}
				list.sort((a,b) => (a.ingredient||'').localeCompare(b.ingredient||''));
				return json(list);
			}
			case 'POST': {
				const data = JSON.parse(event.body || '{}');
				const action = (data.action || '').toString();
				const actor = (data.actor_name || '').toString() || null;
				if (action === 'sync') {
					// Ensure all Ingredientes (ingredient_formulas) exist as inventory items (case-insensitive unique)
					await sql`
						WITH pick AS (
							SELECT DISTINCT ON (lower(ingredient)) ingredient, COALESCE(NULLIF(unit,''), 'g') AS unit
							FROM ingredient_formulas
							WHERE ingredient IS NOT NULL AND trim(ingredient) <> ''
							ORDER BY lower(ingredient), unit ASC
						)
						INSERT INTO inventory_items (ingredient, unit)
						SELECT ingredient, unit FROM pick
						ON CONFLICT (ingredient) DO UPDATE SET unit = COALESCE(EXCLUDED.unit, inventory_items.unit), updated_at = now()
					`;
					// Canonicalize and merge duplicates (e.g., Agua*, Nutella*, *Oreo*)
					const items = await sql`SELECT ingredient, unit FROM inventory_items`;
					for (const it of (items || [])) {
						const current = (it.ingredient || '').toString();
						const canon = canonicalizeIngredientName(current);
						if (!canon) continue;
						if (current.toLowerCase() !== canon.toLowerCase()) {
							await ensureInventoryItem(canon, it.unit || 'g');
							await sql`UPDATE inventory_movements SET ingredient=${canon} WHERE lower(ingredient)=lower(${current})`;
							await sql`DELETE FROM inventory_items WHERE ingredient=${current}`;
						}
					}
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
					const kind = action;
					const signed = action === 'ingreso' ? Math.abs(qty) : qty; // ajuste puede ser +/- ya enviado
					const [row] = await sql`INSERT INTO inventory_movements (ingredient, kind, qty, note, actor_name, metadata) VALUES (${ingredient}, ${kind}, ${signed}, ${note}, ${actor}, '{}'::jsonb) RETURNING *`;
					return json(row, 201);
				}
				if (action === 'reset') {
					// Danger: clears all movement history and leaves all balances at zero
					await sql`DELETE FROM inventory_movements`;
					return json({ ok: true, cleared: true });
				}
				if (action === 'produccion') {
					// counts: { arco, melo, mara, oreo, nute }
					const counts = data.counts && typeof data.counts === 'object' ? data.counts : {};
					const c = {
						arco: Number(counts.arco || 0) || 0,
						melo: Number(counts.melo || 0) || 0,
						mara: Number(counts.mara || 0) || 0,
						oreo: Number(counts.oreo || 0) || 0,
						nute: Number(counts.nute || 0) || 0
					};
					// Fetch full recipes and extras
					const steps = await sql`SELECT id, dessert FROM dessert_recipes ORDER BY dessert ASC, position ASC`;
					const stepIds = steps.map(s => s.id);
					let items = [];
					if (stepIds.length) items = await sql`SELECT recipe_id, ingredient, unit, qty_per_unit FROM dessert_recipe_items WHERE recipe_id = ANY(${stepIds})`;
					const byDessert = new Map();
					for (const s of steps) { const key = (s.dessert||'').toString(); if (!byDessert.has(key)) byDessert.set(key, []); }
					for (const it of items) {
						const step = steps.find(s => s.id === it.recipe_id);
						if (!step) continue;
						const key = (step.dessert || '').toString();
						byDessert.get(key).push({ ingredient: it.ingredient, unit: it.unit || 'g', qty: Number(it.qty_per_unit || 0) || 0 });
					}
					const extras = await sql`SELECT ingredient, unit, qty_per_unit FROM extras_items`;
					const totals = new Map(); // ingredient -> { unit, qty }
					function add(ing, unit, qty) {
						if (!ing) return;
						const canon = canonicalizeIngredientName(ing.toString());
						const k = canon;
						const prev = totals.get(k) || { unit: unit || 'g', qty: 0 };
						prev.qty += Number(qty || 0) || 0;
						if (unit) prev.unit = unit;
						totals.set(k, prev);
					}
					const mapKey = (name) => (name||'').toString().trim().toLowerCase();
					for (const [dessertName, arr] of byDessert.entries()) {
						const k = mapKey(dessertName);
						const mult = k.startsWith('arco') ? c.arco : k.startsWith('melo') ? c.melo : k.startsWith('mara') ? c.mara : k.startsWith('oreo') ? c.oreo : k.startsWith('nute') ? c.nute : 0;
						if (!mult) continue;
						for (const it of (arr || [])) add(it.ingredient, it.unit, it.qty * mult);
					}
					const unitsTotal = c.arco + c.melo + c.mara + c.oreo + c.nute;
					for (const ex of (extras || [])) add(ex.ingredient, ex.unit, Number(ex.qty_per_unit || 0) * unitsTotal);
					// Ensure inventory items and insert movements as negatives
					const out = [];
					for (const [ingredient, v] of totals.entries()) {
						const canon = canonicalizeIngredientName(ingredient);
						await ensureInventoryItem(canon, v.unit || 'g');
						const [row] = await sql`INSERT INTO inventory_movements (ingredient, kind, qty, note, actor_name, metadata) VALUES (${canon}, ${'produccion'}, ${-Math.abs(v.qty || 0)}, ${'Producción aprobada'}, ${actor}, ${JSON.stringify({ counts: c })}::jsonb) RETURNING *`;
						out.push({ ingredient: canon, unit: v.unit || 'g', qty: v.qty || 0, movement_id: row?.id });
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

