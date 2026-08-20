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
				const rows = await sql`
					SELECT 
						id,
						name,
						is_base_recipe AS "isBaseRecipe",
						category,
						meal_type AS "mealType",
						image,
						servings,
						ingredients,
						steps,
						position,
						created_at
					FROM restaurant_recipes
					ORDER BY position ASC, created_at DESC
				`;
				return json(rows);
			}
			case 'POST': {
				const data = JSON.parse(event.body || '{}');
				
				// Bulk sync or single item insert/update
				if (Array.isArray(data)) {
					const results = [];
					for (const item of data) {
						if (!item || !item.name) continue;
						const id = (item.id || 'receta_' + Date.now()).toString();
						const name = (item.name || '').trim();
						const isBaseRecipe = !!item.isBaseRecipe;
						const category = (item.category || 'Comida').toString();
						const mealType = (item.mealType || 'Almuerzo').toString();
						const image = (item.image || '').toString();
						const servings = Number(item.servings) || 1;
						const ingredients = JSON.stringify(Array.isArray(item.ingredients) ? item.ingredients : []);
						const steps = JSON.stringify(Array.isArray(item.steps) ? item.steps : []);

						const [row] = await sql`
							INSERT INTO restaurant_recipes (id, name, is_base_recipe, category, meal_type, image, servings, ingredients, steps, updated_at)
							VALUES (${id}, ${name}, ${isBaseRecipe}, ${category}, ${mealType}, ${image}, ${servings}, ${ingredients}, ${steps}, now())
							ON CONFLICT (id) DO UPDATE SET
								name = EXCLUDED.name,
								is_base_recipe = EXCLUDED.is_base_recipe,
								category = EXCLUDED.category,
								meal_type = EXCLUDED.meal_type,
								image = EXCLUDED.image,
								servings = EXCLUDED.servings,
								ingredients = EXCLUDED.ingredients,
								steps = EXCLUDED.steps,
								updated_at = now()
							RETURNING id, name, is_base_recipe AS "isBaseRecipe", category, meal_type AS "mealType", image, servings, ingredients, steps
						`;
						results.push(row);
					}
					return json(results, 200);
				}

				const id = (data.id || 'receta_' + Date.now()).toString();
				const name = (data.name || '').trim();
				if (!name) return json({ error: 'El nombre es obligatorio' }, 400);

				const isBaseRecipe = !!data.isBaseRecipe;
				const category = (data.category || 'Comida').toString();
				const mealType = (data.mealType || 'Almuerzo').toString();
				const image = (data.image || '').toString();
				const servings = Number(data.servings) || 1;
				const ingredients = JSON.stringify(Array.isArray(data.ingredients) ? data.ingredients : []);
				const steps = JSON.stringify(Array.isArray(data.steps) ? data.steps : []);

				const [row] = await sql`
					INSERT INTO restaurant_recipes (id, name, is_base_recipe, category, meal_type, image, servings, ingredients, steps, updated_at)
					VALUES (${id}, ${name}, ${isBaseRecipe}, ${category}, ${mealType}, ${image}, ${servings}, ${ingredients}, ${steps}, now())
					ON CONFLICT (id) DO UPDATE SET
						name = EXCLUDED.name,
						is_base_recipe = EXCLUDED.is_base_recipe,
						category = EXCLUDED.category,
						meal_type = EXCLUDED.meal_type,
						image = EXCLUDED.image,
						servings = EXCLUDED.servings,
						ingredients = EXCLUDED.ingredients,
						steps = EXCLUDED.steps,
						updated_at = now()
					RETURNING id, name, is_base_recipe AS "isBaseRecipe", category, meal_type AS "mealType", image, servings, ingredients, steps
				`;
				return json(row, 200);
			}
			case 'DELETE': {
				const raw = typeof event.rawQuery === 'string' ? event.rawQuery : (event.queryStringParameters ? new URLSearchParams(event.queryStringParameters).toString() : '');
				const params = new URLSearchParams(raw);
				const id = (params.get('id') || '').toString();
				if (!id) return json({ error: 'ID requerido' }, 400);

				await sql`DELETE FROM restaurant_recipes WHERE id = ${id}`;
				return json({ ok: true });
			}
			default:
				return json({ error: 'Método no permitido' }, 405);
		}
	} catch (err) {
		console.error('Error in restaurant-recipes function:', err);
		return json({ error: String(err) }, 500);
	}
}
