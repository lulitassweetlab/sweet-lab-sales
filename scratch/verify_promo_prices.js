import { neon } from '@netlify/neon';
import { recalcTotalForId, getDesserts } from '../netlify/functions/_db.js';

const sql = neon();

async function runTest() {
	console.log('🧪 Iniciando prueba de integración de precios mixtos por postre (Manual, Regular, Muestra, Costo)...');

	let testSaleId = null;
	try {
		// 1. Obtener lista de postres activos y un vendedor
		const desserts = await getDesserts();
		if (!desserts || desserts.length < 4) {
			throw new Error('No hay suficientes postres activos en la base de datos (se necesitan mínimo 4) para realizar la prueba.');
		}

		const [seller] = await sql`SELECT id FROM sellers LIMIT 1`;
		if (!seller) {
			throw new Error('No se encontró ningún vendedor en la base de datos.');
		}

		// Buscar un día de venta activo
		const [day] = await sql`SELECT id FROM sale_days ORDER BY id DESC LIMIT 1`;
		const dayId = day ? day.id : null;

		const dessertA = desserts[0]; // Ej: Arcoíris
		const dessertB = desserts[1]; // Ej: Melo
		const dessertC = desserts[2]; // Ej: Mara
		const dessertD = desserts[3]; // Ej: Oreo

		const costPriceD = Number(dessertD.cost_price) >= 0 
			? Math.round(Number(dessertD.cost_price)) 
			: Math.round(Number(dessertD.sale_price) * 0.55);

		console.log(`🍦 Postre A (Custom Override): ${dessertA.name} - Reg: $${dessertA.sale_price} -> Manual: $7.000`);
		console.log(`🍦 Postre B (Precio Regular): ${dessertB.name} - Reg: $${dessertB.sale_price}`);
		console.log(`🍦 Postre C (Muestra): ${dessertC.name} - Reg: $${dessertC.sale_price} -> Muestra: $0`);
		console.log(`🍦 Postre D (A Costo): ${dessertD.name} - Reg: $${dessertD.sale_price} -> Costo: $${costPriceD}`);

		// 2. Crear una venta de prueba
		const [sale] = await sql`
			INSERT INTO sales (seller_id, client_name, total_cents, special_pricing_type, sale_day_id, is_paid)
			VALUES (${seller.id}, 'MIXED PRICING TEST CLIENT', 0, NULL, ${dayId}, false)
			RETURNING *
		`;
		testSaleId = sale.id;
		console.log(`📝 Venta de prueba creada con ID: ${testSaleId}`);

		// 3. Insertar items de prueba en sale_items
		const customPriceA = 7000;
		
		// Item A: 2 unidades a $7.000 COP (Manual Override)
		await sql`
			INSERT INTO sale_items (sale_id, dessert_id, quantity, unit_price)
			VALUES (${testSaleId}, ${dessertA.id}, 2, ${customPriceA})
		`;

		// Item B: 1 unidad a precio regular
		await sql`
			INSERT INTO sale_items (sale_id, dessert_id, quantity, unit_price)
			VALUES (${testSaleId}, ${dessertB.id}, 1, ${dessertB.sale_price})
		`;

		// Item C: 1 unidad marcada como Muestra ($0 COP)
		await sql`
			INSERT INTO sale_items (sale_id, dessert_id, quantity, unit_price)
			VALUES (${testSaleId}, ${dessertC.id}, 1, 0)
		`;

		// Item D: 1 unidad a Costo de producción
		await sql`
			INSERT INTO sale_items (sale_id, dessert_id, quantity, unit_price)
			VALUES (${testSaleId}, ${dessertD.id}, 1, ${costPriceD})
		`;

		console.log('✅ Items insertados con éxito.');

		// 4. Ejecutar el recálculo
		console.log('⚙️ Ejecutando recalcTotalForId...');
		const updatedSale = await recalcTotalForId(testSaleId);
		const calculatedTotal = Number(updatedSale.total_cents);
		const expectedTotal = (2 * customPriceA) + (1 * Number(dessertB.sale_price)) + (1 * 0) + (1 * costPriceD);

		console.log(`📊 Total esperado: $${expectedTotal} COP (${2} * ${customPriceA} + ${1} * ${dessertB.sale_price} + ${1} * 0 + ${1} * ${costPriceD})`);
		console.log(`📊 Total calculado por el backend: $${calculatedTotal} COP`);

		if (calculatedTotal !== expectedTotal) {
			throw new Error(`¡Error de cálculo! Esperado: ${expectedTotal}, pero se obtuvo: ${calculatedTotal}`);
		}
		console.log('🎉 ¡Cálculo mixto por postre verificado exitosamente!');

	} catch (e) {
		console.error('❌ ERROR EN LA PRUEBA:', e.message);
		process.exit(1);
	} finally {
		// 5. Limpieza absoluta
		if (testSaleId) {
			console.log('🧹 Limpiando base de datos (eliminando registros de prueba)...');
			await sql`DELETE FROM sale_items WHERE sale_id = ${testSaleId}`;
			await sql`DELETE FROM sales WHERE id = ${testSaleId}`;
			console.log('✨ Base de datos limpia.');
		}
	}
	console.log('\n🌟 ¡TODAS LAS PRUEBAS DE INTEGRACIÓN PASARON CON 100% DE ÉXITO! 🌟');
}

runTest();
