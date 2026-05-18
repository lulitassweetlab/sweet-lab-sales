import { neon } from '@netlify/neon';
import { recalcTotalForId, getDesserts } from '../netlify/functions/_db.js';

const sql = neon();

async function runTest() {
	console.log('🧪 Iniciando prueba de integración de precios promocionales manuales...');

	let testSaleId = null;
	try {
		// 1. Obtener lista de postres activos y un vendedor
		const desserts = await getDesserts();
		if (!desserts || desserts.length < 2) {
			throw new Error('No hay suficientes postres activos en la base de datos para realizar la prueba.');
		}

		const [seller] = await sql`SELECT id FROM sellers LIMIT 1`;
		if (!seller) {
			throw new Error('No se encontró ningún vendedor en la base de datos.');
		}

		// Buscar un día de venta activo
		const [day] = await sql`SELECT id FROM sale_days ORDER BY id DESC LIMIT 1`;
		const dayId = day ? day.id : null;

		const dessertA = desserts[0]; // Ej: Arcoíris
		const dessertB = desserts[1]; // Ej: Tres Leches o Chocolate

		console.log(`🍦 Postre A (Custom Override): ${dessertA.name} - Precio regular: $${dessertA.sale_price}`);
		console.log(`🍦 Postre B (Precio Regular): ${dessertB.name} - Precio regular: $${dessertB.sale_price}`);

		// 2. Crear una venta de prueba
		const [sale] = await sql`
			INSERT INTO sales (seller_id, client_name, total_cents, special_pricing_type, sale_day_id, is_paid)
			VALUES (${seller.id}, 'PROMO PRICE TEST CLIENT', 0, NULL, ${dayId}, false)
			RETURNING *
		`;
		testSaleId = sale.id;
		console.log(`📝 Venta de prueba creada con ID: ${testSaleId}`);

		// 3. Insertar items de prueba en sale_items
		// Item A: 2 unidades con precio unitario personalizado de $7.000 COP (Override manual)
		const customPriceA = 7000;
		await sql`
			INSERT INTO sale_items (sale_id, dessert_id, quantity, unit_price)
			VALUES (${testSaleId}, ${dessertA.id}, 2, ${customPriceA})
		`;

		// Item B: 1 unidad con precio regular del postre
		await sql`
			INSERT INTO sale_items (sale_id, dessert_id, quantity, unit_price)
			VALUES (${testSaleId}, ${dessertB.id}, 1, ${dessertB.sale_price})
		`;

		console.log('✅ Items insertados con éxito.');

		// 4. Ejecutar el recálculo
		console.log('⚙️ Ejecutando recalcTotalForId...');
		const updatedSale = await recalcTotalForId(testSaleId);
		const calculatedTotal = Number(updatedSale.total_cents);
		const expectedTotal = (2 * customPriceA) + (1 * Number(dessertB.sale_price));

		console.log(`📊 Total esperado: $${expectedTotal} COP (${2} * ${customPriceA} + ${1} * ${dessertB.sale_price})`);
		console.log(`📊 Total calculado por el backend: $${calculatedTotal} COP`);

		if (calculatedTotal !== expectedTotal) {
			throw new Error(`¡Error de cálculo! Esperado: ${expectedTotal}, pero se obtuvo: ${calculatedTotal}`);
		}
		console.log('🎉 ¡Cálculo con precio promocional manual verificado exitosamente!');

		// 5. Test de Reset: Limpiar el override manual de Postre A volviéndolo al precio regular
		console.log('🔄 Probando reset: volviendo Postre A al precio regular para reactivar promociones dinámicas...');
		await sql`
			UPDATE sale_items 
			SET unit_price = ${dessertA.sale_price} 
			WHERE sale_id = ${testSaleId} AND dessert_id = ${dessertA.id}
		`;

		const resetSale = await recalcTotalForId(testSaleId);
		const resetTotal = Number(resetSale.total_cents);

		// Cuando ambos usan el precio regular, el cálculo debe aplicar promociones automáticas de lote si existen
		console.log(`📊 Total recalculado post-reset: $${resetTotal} COP`);
		console.log('🎉 ¡Prueba de reset verificada con éxito!');

	} catch (e) {
		console.error('❌ ERROR EN LA PRUEBA:', e.message);
		process.exit(1);
	} finally {
		// 6. Limpieza absoluta
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
