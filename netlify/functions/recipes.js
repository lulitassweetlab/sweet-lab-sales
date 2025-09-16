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
				const dessert = params.get('dessert');
				const includeExtras = params.get('include_extras') === '1' || params.get('include_extras') === 'true';
				if (dessert) {
					const steps = await sql`SELECT id, dessert, step_name, position FROM dessert_recipes WHERE lower(dessert)=lower(${dessert}) ORDER BY position ASC, id ASC`;
					const stepIds = steps.map(s => s.id);
					let items = [];
					if (stepIds.length) items = await sql`SELECT id, recipe_id, ingredient, unit, qty_per_unit, position FROM dessert_recipe_items WHERE recipe_id = ANY(${stepIds}) ORDER BY position ASC, id ASC`;
					const grouped = steps.map(s => ({ id: s.id, dessert: s.dessert, step_name: s.step_name || null, position: s.position, items: items.filter(i => i.recipe_id === s.id) }));
					let extras = [];
					if (includeExtras) extras = await sql`SELECT id, ingredient, unit, qty_per_unit, position FROM extras_items ORDER BY position ASC, id ASC`;
					return json({ dessert, steps: grouped, extras });
				}
				// all desserts summary
				const ds = await sql`SELECT DISTINCT dessert FROM dessert_recipes ORDER BY dessert ASC`;
				return json(ds.map(r => r.dessert));
			}
			case 'POST': {
				const data = JSON.parse(event.body || '{}');
				const kind = (data.kind || '').toString();
				if (kind === 'step.upsert') {
					const dessert = (data.dessert || '').toString();
					if (!dessert) return json({ error: 'dessert requerido' }, 400);
					const stepName = (data.step_name || null);
					const position = Number(data.position || 0) || 0;
					const id = Number(data.id || 0) || 0;
					let row;
					if (id) {
						[row] = await sql`UPDATE dessert_recipes SET dessert=${dessert}, step_name=${stepName}, position=${position}, updated_at=now() WHERE id=${id} RETURNING id, dessert, step_name, position`; 
					} else {
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
					const position = Number(data.position || 0) || 0;
					const id = Number(data.id || 0) || 0;
					let row;
					if (id) {
						[row] = await sql`UPDATE dessert_recipe_items SET ingredient=${ingredient}, unit=${unit}, qty_per_unit=${qty}, position=${position}, updated_at=now() WHERE id=${id} RETURNING id, recipe_id, ingredient, unit, qty_per_unit, position`;
					} else {
						[row] = await sql`INSERT INTO dessert_recipe_items (recipe_id, ingredient, unit, qty_per_unit, position) VALUES (${recipeId}, ${ingredient}, ${unit}, ${qty}, ${position}) RETURNING id, recipe_id, ingredient, unit, qty_per_unit, position`;
					}
					return json(row, id ? 200 : 201);
				}
				if (kind === 'extras.upsert') {
					const id = Number(data.id || 0) || 0;
					const ingredient = (data.ingredient || '').toString();
					const unit = (data.unit || 'g').toString();
					const qty = Number(data.qty_per_unit || 0) || 0;
					const position = Number(data.position || 0) || 0;
					let row;
					if (id) {
						[row] = await sql`UPDATE extras_items SET ingredient=${ingredient}, unit=${unit}, qty_per_unit=${qty}, position=${position}, updated_at=now() WHERE id=${id} RETURNING id, ingredient, unit, qty_per_unit, position`;
					} else {
						[row] = await sql`INSERT INTO extras_items (ingredient, unit, qty_per_unit, position) VALUES (${ingredient}, ${unit}, ${qty}, ${position}) RETURNING id, ingredient, unit, qty_per_unit, position`;
					}
					return json(row, id ? 200 : 201);
				}
				return json({ error: 'kind inválido' }, 400);
			}
			case 'DELETE': {
				const raw = typeof event.rawQuery === 'string' ? event.rawQuery : (event.queryStringParameters ? new URLSearchParams(event.queryStringParameters).toString() : '');
				const params = new URLSearchParams(raw);
				const kind = params.get('kind');
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

