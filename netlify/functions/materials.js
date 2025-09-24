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
				const computeStart = params.get('compute_start');
				const computeEnd = params.get('compute_end');
				if (computeStart && computeEnd) {
					const start = computeStart.toString().slice(0,10);
					const end = computeEnd.toString().slice(0,10);
					const qtyRows = await sql`
						SELECT 
							SUM(qty_arco)::int AS sum_arco,
							SUM(qty_melo)::int AS sum_melo,
							SUM(qty_mara)::int AS sum_mara,
							SUM(qty_oreo)::int AS sum_oreo,
							SUM(qty_nute)::int AS sum_nute
						FROM sales s
						LEFT JOIN sale_days sd ON sd.id = s.sale_day_id
						WHERE COALESCE(sd.day, s.created_at::date) BETWEEN ${start} AND ${end}
					`;
					const totals = qtyRows && qtyRows[0] ? qtyRows[0] : { sum_arco: 0, sum_melo: 0, sum_mara: 0, sum_oreo: 0, sum_nute: 0 };
					// Prefer recipes if present; otherwise fall back to ingredient_formulas
					const haveRecipes = (await sql`SELECT COUNT(*)::int AS c FROM dessert_recipes`)[0]?.c > 0;
					let out = [];
					if (haveRecipes) {
						// Build per-dessert ingredient maps
						const steps = await sql`SELECT id, dessert FROM dessert_recipes ORDER BY dessert ASC, position ASC`;
						const stepIds = steps.map(s => s.id);
						let items = [];
						if (stepIds.length) items = await sql`SELECT recipe_id, ingredient, unit, qty_per_unit FROM dessert_recipe_items WHERE recipe_id = ANY(${stepIds})`;
						const byDessert = new Map();
						for (const s of steps) {
							if (!byDessert.has(s.dessert)) byDessert.set(s.dessert, new Map());
						}
						for (const it of items) {
							const step = steps.find(s => s.id === it.recipe_id);
							if (!step) continue;
							const dmap = byDessert.get(step.dessert);
							const key = (it.ingredient || '').toString();
							const prev = dmap.get(key) || { unit: it.unit || 'g', qty: 0 };
							prev.qty += Number(it.qty_per_unit || 0);
							prev.unit = it.unit || prev.unit || 'g';
							dmap.set(key, prev);
						}
						// Add extras
						const extras = await sql`SELECT ingredient, unit, qty_per_unit FROM extras_items`;
						const dessertsTotals = { arco: Number(totals.sum_arco||0), melo: Number(totals.sum_melo||0), mara: Number(totals.sum_mara||0), oreo: Number(totals.sum_oreo||0), nute: Number(totals.sum_nute||0) };
						const aggregate = new Map();
						function addToAggregate(name, unit, qty) {
							const key = name;
							const prev = aggregate.get(key) || { unit: unit || 'g', total_needed: 0 };
							prev.total_needed += Number(qty || 0);
							prev.unit = unit || prev.unit || 'g';
							aggregate.set(key, prev);
						}
						for (const [dessert, dmap] of byDessert.entries()) {
							const mult = dessert.toLowerCase() === 'arco' ? dessertsTotals.arco
								: dessert.toLowerCase() === 'melo' ? dessertsTotals.melo
								: dessert.toLowerCase() === 'mara' ? dessertsTotals.mara
								: dessert.toLowerCase() === 'oreo' ? dessertsTotals.oreo
								: dessert.toLowerCase() === 'nute' ? dessertsTotals.nute : 0;
							if (!mult) continue;
							for (const [ing, rec] of dmap.entries()) addToAggregate(ing, rec.unit, rec.qty * mult);
						}
						for (const ex of (extras || [])) {
							const totalUnits = dessertsTotals.arco + dessertsTotals.melo + dessertsTotals.mara + dessertsTotals.oreo + dessertsTotals.nute;
							addToAggregate(ex.ingredient, ex.unit, Number(ex.qty_per_unit || 0) * totalUnits);
						}
						out = Array.from(aggregate.entries()).map(([ingredient, v]) => ({ ingredient, unit: v.unit, total_needed: v.total_needed }));
					} else {
						const formulas = await sql`SELECT id, ingredient, unit, per_arco, per_melo, per_mara, per_oreo, per_nute FROM ingredient_formulas ORDER BY ingredient ASC`;
						out = (formulas || []).map(r => {
							const total = Number(r.per_arco||0) * Number(totals.sum_arco||0)
								+ Number(r.per_melo||0) * Number(totals.sum_melo||0)
								+ Number(r.per_mara||0) * Number(totals.sum_mara||0)
								+ Number(r.per_oreo||0) * Number(totals.sum_oreo||0)
								+ Number(r.per_nute||0) * Number(totals.sum_nute||0);
							return { ingredient: r.ingredient, unit: r.unit || 'g', total_needed: total };
						});
					}
					return json({ range: { start, end }, desserts: totals, materials: out });
				}
				// default: list formulas
				const rows = await sql`SELECT id, ingredient, unit, per_arco, per_melo, per_mara, per_oreo, per_nute FROM ingredient_formulas ORDER BY ingredient ASC`;
				return json(rows);
			}
			case 'POST': {
				const data = JSON.parse(event.body || '{}');
				const ingredient = (data.ingredient || '').toString().trim();
				if (!ingredient) return json({ error: 'ingredient requerido' }, 400);
				const unit = (data.unit || 'g').toString();
				const per_arco = Number(data.per_arco || 0) || 0;
				const per_melo = Number(data.per_melo || 0) || 0;
				const per_mara = Number(data.per_mara || 0) || 0;
				const per_oreo = Number(data.per_oreo || 0) || 0;
				const per_nute = Number(data.per_nute || 0) || 0;
				await ensureInventoryItem(ingredient, unit);
				const [row] = await sql`
					INSERT INTO ingredient_formulas (ingredient, unit, per_arco, per_melo, per_mara, per_oreo, per_nute)
					VALUES (${ingredient}, ${unit}, ${per_arco}, ${per_melo}, ${per_mara}, ${per_oreo}, ${per_nute})
					ON CONFLICT (ingredient) DO UPDATE SET
						unit = EXCLUDED.unit,
						per_arco = EXCLUDED.per_arco,
						per_melo = EXCLUDED.per_melo,
						per_mara = EXCLUDED.per_mara,
						per_oreo = EXCLUDED.per_oreo,
						per_nute = EXCLUDED.per_nute,
						updated_at = now()
					RETURNING id, ingredient, unit, per_arco, per_melo, per_mara, per_oreo, per_nute
				`;
				return json(row, 201);
			}
			case 'DELETE': {
				const raw = typeof event.rawQuery === 'string' ? event.rawQuery : (event.queryStringParameters ? new URLSearchParams(event.queryStringParameters).toString() : '');
				const params = new URLSearchParams(raw);
				const idParam = params.get('id');
				const ingParam = params.get('ingredient');
				if (idParam) {
					const id = Number(idParam);
					if (!id) return json({ error: 'id inválido' }, 400);
					const rows = await sql`SELECT ingredient FROM ingredient_formulas WHERE id=${id}`;
					await sql`DELETE FROM ingredient_formulas WHERE id=${id}`;
					if (rows && rows[0] && rows[0].ingredient) {
						const ing = rows[0].ingredient;
						await sql`DELETE FROM inventory_movements WHERE lower(ingredient)=lower(${ing})`;
						await sql`DELETE FROM inventory_items WHERE ingredient=${ing}`;
					}
					return json({ ok: true });
				}
				if (ingParam) {
					const ing = ingParam.toString();
					await sql`DELETE FROM ingredient_formulas WHERE ingredient=${ing}`;
					await sql`DELETE FROM inventory_movements WHERE lower(ingredient)=lower(${ing})`;
					await sql`DELETE FROM inventory_items WHERE ingredient=${ing}`;
					return json({ ok: true });
				}
				return json({ error: 'id o ingredient requerido' }, 400);
			}
			default:
				return json({ error: 'Método no permitido' }, 405);
		}
	} catch (err) {
		return json({ error: String(err) }, 500);
	}
}

