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
				if (historyFor) {
					const name = canonicalizeIngredientName(historyFor.toString());
					const rows = await sql`SELECT id, ingredient, kind, qty, note, actor_name, metadata, created_at FROM inventory_movements WHERE lower(ingredient)=lower(${name}) ORDER BY id DESC LIMIT 200`;
					return json(rows);
				}
				// Default: list items with saldo
				const items = await sql`SELECT id, ingredient, unit FROM inventory_items ORDER BY ingredient ASC`;
				// Compute balances
				const movs = await sql`SELECT lower(ingredient) AS key, SUM(qty)::numeric AS qty FROM inventory_movements GROUP BY lower(ingredient)`;
				const byKey = new Map();
				for (const it of items) byKey.set((it.ingredient||'').toString().toLowerCase(), { ingredient: it.ingredient, unit: it.unit || 'g', saldo: 0 });
				for (const m of (movs || [])) {
					const k = (m.key || '').toString();
					const prev = byKey.get(k);
					if (prev) prev.saldo = Number(m.qty || 0) || 0;
					else byKey.set(k, { ingredient: m.key, unit: 'g', saldo: Number(m.qty || 0) || 0 });
				}
				const list = Array.from(byKey.values()).sort((a,b) => (a.ingredient||'').localeCompare(b.ingredient||''));
				return json(list);
			}
			case 'POST': {
				const data = JSON.parse(event.body || '{}');
				const action = (data.action || '').toString();
				const actor = (data.actor_name || '').toString() || null;
				if (action === 'sync') {
					// Ensure all current recipe/extras ingredients exist as inventory items (case-insensitive unique)
					await sql`
						WITH src AS (
							SELECT ingredient, unit FROM dessert_recipe_items
							UNION ALL
							SELECT ingredient, unit FROM extras_items
						), pick AS (
							SELECT DISTINCT ON (lower(ingredient)) ingredient, COALESCE(NULLIF(unit,''), 'g') AS unit
							FROM src
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

