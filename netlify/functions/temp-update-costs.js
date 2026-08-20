import { sql, recalculateAllDessertCosts, ensureSchema } from './_db.js';

export const handler = async (event) => {
	if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' };
	
	try {
		await ensureSchema();
		const items = [
			{ name: 'Aceite', price: 15.75, pack: 1000, cat: 'ingrediente' },
			{ name: 'Azucar', price: 3.78, pack: 2500, cat: 'ingrediente' },
			{ name: 'Azucar xxx', price: 6.89, pack: 2500, cat: 'ingrediente' },
			{ name: 'Canela', price: 39.38, pack: 400, cat: 'ingrediente' },
			{ name: 'Caramelo', price: 64.02, pack: 620, cat: 'ingrediente' },
			{ name: 'Chips ahoy', price: 428.75, pack: 24, cat: 'ingrediente' },
			{ name: 'Chocolate blanco', price: 104.58, pack: 1000, cat: 'ingrediente' },
			{ name: 'Cocoa', price: 74.55, pack: 1000, cat: 'ingrediente' },
			{ name: 'Crema de leche Colanta', price: 23.35, pack: 760, cat: 'ingrediente' },
			{ name: 'Crema de montar', price: 21.42, pack: 4800, cat: 'ingrediente' },
			{ name: 'Esencia de vainilla', price: 37.59, pack: 500, cat: 'ingrediente' },
			{ name: 'Ferrero', price: 2415.00, pack: 3, cat: 'ingrediente' },
			{ name: 'Gelatina amarilla', price: 36.44, pack: 1000, cat: 'ingrediente' },
			{ name: 'Gelatina morada', price: 36.44, pack: 1000, cat: 'ingrediente' },
			{ name: 'Gelatina roja', price: 36.44, pack: 1000, cat: 'ingrediente' },
			{ name: 'Gelatina sin sabor', price: 49.98, pack: 500, cat: 'ingrediente' },
			{ name: 'Harina', price: 4.33, pack: 2500, cat: 'ingrediente' },
			{ name: 'Huevo', price: 10.50, pack: 1560, cat: 'ingrediente' },
			{ name: 'Leche', price: 4.62, pack: 1000, cat: 'ingrediente' },
			{ name: 'Lechera', price: 20.77, pack: 4500, cat: 'ingrediente' },
			{ name: 'Lluvia de chocolate', price: 31.97, pack: 1000, cat: 'ingrediente' },
			{ name: 'Lluvia de colores', price: 34.55, pack: 1000, cat: 'ingrediente' },
			{ name: 'Mango', price: 75.00, pack: 70, cat: 'ingrediente' },
			{ name: 'Mantequilla', price: 115.92, pack: 125, cat: 'ingrediente' },
			{ name: 'Maracuyá', price: 75.00, pack: 70, cat: 'ingrediente' },
			{ name: 'Melocotón', price: 22.34, pack: 470, cat: 'ingrediente' },
			{ name: 'Nutella', price: 70.00, pack: 750, cat: 'ingrediente' },
			{ name: 'Oreo', price: 28.61, pack: 4000, cat: 'ingrediente' },
			{ name: 'Polvo de hornear', price: 13.60, pack: 1000, cat: 'ingrediente' },
			{ name: 'Quesocrema', price: 21.37, pack: 4000, cat: 'ingrediente' },
			{ name: 'Sal', price: 3.36, pack: 500, cat: 'ingrediente' },
			{ name: 'Pudin de vainilla', price: 25.41, pack: 1000, cat: 'ingrediente' },
			{ name: 'Vinagre', price: 4.20, pack: 500, cat: 'ingrediente' },
			{ name: 'Contenedor Grande (12)', price: 14.70, pack: 5000, cat: 'empaque' },
			{ name: 'Bolsa para cuchara', price: 21.00, pack: 100, cat: 'empaque' },
			{ name: 'Contenedor 8 onz', price: 306.60, pack: 25, cat: 'empaque' },
			{ name: 'Contenedor 8 onz blanco', price: 306.60, pack: 25, cat: 'empaque' },
			{ name: 'Cuchara', price: 105.00, pack: 100, cat: 'empaque' },
			{ name: 'Tapas 8 onz blanco', price: 275.10, pack: 25, cat: 'empaque' },
			{ name: 'Capacillo', price: 183.75, pack: 60, cat: 'empaque' },
			{ name: 'Bolsa brig individual', price: 15.12, pack: 500, cat: 'empaque' },
			{ name: 'Cinta de papel', price: 14.70, pack: 500, cat: 'empaque' },
			{ name: 'Caja x 5', price: 525.00, pack: 20, cat: 'empaque' },
			{ name: 'Sticker', price: 233.33, pack: 360, cat: 'empaque' }
		];

		const norm = (s) => (s || '').toLowerCase().trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
		const existingItems = await sql`SELECT id, ingredient FROM inventory_items`;
		
		let updatedCount = 0;
		let createdCount = 0;

		for (const item of items) {
			const canon = norm(item.name);
			const found = existingItems.find(it => norm(it.ingredient) === canon);
			
			if (found) {
				await sql`
					UPDATE inventory_items 
					SET 
						ingredient = ${item.name},
						price = ${item.price}, 
						pack_size = ${item.pack},
						category = ${item.cat},
						updated_at = now()
					WHERE id = ${found.id}
				`;
				updatedCount++;
			} else {
				await sql`
					INSERT INTO inventory_items (ingredient, price, pack_size, category, unit)
					VALUES (${item.name}, ${item.price}, ${item.pack}, ${item.cat}, 'g')
				`;
				createdCount++;
			}
		}
		
		await recalculateAllDessertCosts();

		return {
			statusCode: 200,
			body: JSON.stringify({ 
				message: 'Inventory costs updated successfully', 
				updated: updatedCount, 
				created: createdCount 
			})
		};
	} catch (err) {
		console.error(err);
		return {
			statusCode: 500,
			body: JSON.stringify({ error: err.message })
		};
	}
};
