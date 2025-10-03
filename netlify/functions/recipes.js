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

