#!/usr/bin/env node
import { neon } from '@netlify/neon';

// Get SQL client
const databaseUrl = process.env.DATABASE_URL || process.env.NEON_DATABASE_URL;
if (!databaseUrl) {
	console.error('❌ ERROR: DATABASE_URL or NEON_DATABASE_URL not set');
	process.exit(1);
}

const sql = neon(databaseUrl);

async function seedDefaults() {
	console.log('🌱 Starting recipe seed...');
	
	// Seed the five desserts with provided recipes and extras; idempotent-ish by clearing first
	console.log('🗑️  Clearing existing recipe data...');
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
	console.log('📦 Seeding Arco...');
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
	console.log('📦 Seeding Melo...');
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
	console.log('📦 Seeding Mara...');
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
	console.log('📦 Seeding Oreo...');
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
	console.log('📦 Seeding Nute...');
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
	
	// 3Lec (Tres Leches) - the dessert the user mentioned
	console.log('📦 Seeding 3Lec (Tres Leches)...');
	{
		const [s] = await step('3Lec', null, 1);
		await items(s.id, [
			{ ingredient: 'Bizcocho', unit: 'g', qty: 40 },
			{ ingredient: 'Lechera', unit: 'g', qty: 50 },
			{ ingredient: 'Leche evaporada', unit: 'g', qty: 50 },
			{ ingredient: 'Crema de leche', unit: 'g', qty: 50 },
			{ ingredient: 'Arequipe', unit: 'g', qty: 20 },
		]);
	}
	
	// Ensure 3Lec is in desserts table
	console.log('📦 Ensuring 3Lec is in desserts table...');
	await sql`
		INSERT INTO desserts (name, short_code, sale_price, position)
		VALUES ('3Lec', '3lec', 9000, 6)
		ON CONFLICT (name) DO UPDATE SET 
			short_code = EXCLUDED.short_code,
			sale_price = EXCLUDED.sale_price,
			is_active = true
	`;
	
	// Extras
	console.log('📦 Seeding Extras...');
	await sql`INSERT INTO extras_items (ingredient, unit, qty_per_unit, position) VALUES ('Cuchara', 'unidad', 1, 1), ('Bolsa cuchara', 'unidad', 1, 2), ('Contenedor 8 oz', 'unidad', 1, 3), ('Sticker', 'unidad', 1, 4)`;
	
	console.log('✅ Seed complete!');
}

// Run the seed
try {
	await seedDefaults();
	console.log('\n🎉 All recipe steps have been restored successfully!');
	process.exit(0);
} catch (error) {
	console.error('\n❌ Error restoring recipe steps:', error);
	process.exit(1);
}
