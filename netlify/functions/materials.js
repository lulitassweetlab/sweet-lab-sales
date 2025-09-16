import { ensureSchema, sql } from './_db.js';

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
					const formulas = await sql`SELECT id, ingredient, unit, per_arco, per_melo, per_mara, per_oreo, per_nute FROM ingredient_formulas ORDER BY ingredient ASC`;
					const out = (formulas || []).map(r => {
						const total = Number(r.per_arco||0) * Number(totals.sum_arco||0)
							+ Number(r.per_melo||0) * Number(totals.sum_melo||0)
							+ Number(r.per_mara||0) * Number(totals.sum_mara||0)
							+ Number(r.per_oreo||0) * Number(totals.sum_oreo||0)
							+ Number(r.per_nute||0) * Number(totals.sum_nute||0);
						return { ingredient: r.ingredient, unit: r.unit || 'g', total_needed: total };
					});
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
					await sql`DELETE FROM ingredient_formulas WHERE id=${id}`;
					return json({ ok: true });
				}
				if (ingParam) {
					const ing = ingParam.toString();
					await sql`DELETE FROM ingredient_formulas WHERE ingredient=${ing}`;
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

