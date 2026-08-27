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
						key,
						name,
						unit,
						stock,
						updated_at AS "updatedAt"
					FROM restaurant_inventory
					ORDER BY name ASC
				`;
				const inventoryMap = {};
				rows.forEach(r => {
					inventoryMap[r.key] = {
						name: r.name,
						unit: r.unit || 'g',
						stock: Number(r.stock) || 0
					};
				});
				return json(inventoryMap);
			}
			case 'POST': {
				const body = JSON.parse(event.body || '{}');

				// Case 1: Record purchase and update inventory
				if (body.action === 'purchase') {
					const purchaseId = 'compra_restaurante_' + Date.now();
					const supplierName = (body.supplier_name || 'Factura Escaneada IA').toString();
					const totalCost = Number(body.total_cost) || 0;
					const items = Array.isArray(body.items) ? body.items : [];

					// Record purchase in restaurant_purchases
					await sql`
						INSERT INTO restaurant_purchases (id, supplier_name, total_cost, items, created_at)
						VALUES (${purchaseId}, ${supplierName}, ${totalCost}, ${JSON.stringify(items)}, now())
					`;

					// Upsert each item in restaurant_inventory
					for (const item of items) {
						if (!item || !item.name) continue;
						const key = item.name.trim().toLowerCase();
						const name = item.name.trim();
						const unit = (item.unit || 'g').trim();
						const qty = Number(item.qty) || 0;

						await sql`
							INSERT INTO restaurant_inventory (key, name, unit, stock, updated_at)
							VALUES (${key}, ${name}, ${unit}, ${qty}, now())
							ON CONFLICT (key) DO UPDATE SET
								name = EXCLUDED.name,
								unit = EXCLUDED.unit,
								stock = restaurant_inventory.stock + EXCLUDED.stock,
								updated_at = now()
						`;
					}

					return json({ ok: true, purchaseId });
				}

				// Case 2: Bulk sync or single/dictionary inventory upsert
				const inventoryObj = body.inventory || body;
				if (typeof inventoryObj === 'object' && inventoryObj !== null) {
					const entries = Array.isArray(inventoryObj)
						? inventoryObj
						: Object.entries(inventoryObj).map(([k, v]) => ({ key: k, ...v }));

					for (const item of entries) {
						if (!item || !item.name) continue;
						const key = (item.key || item.name).trim().toLowerCase();
						const name = item.name.trim();
						const unit = (item.unit || 'g').trim();
						const stock = Number(item.stock) || 0;

						await sql`
							INSERT INTO restaurant_inventory (key, name, unit, stock, updated_at)
							VALUES (${key}, ${name}, ${unit}, ${stock}, now())
							ON CONFLICT (key) DO UPDATE SET
								name = EXCLUDED.name,
								unit = EXCLUDED.unit,
								stock = EXCLUDED.stock,
								updated_at = now()
						`;
					}
					return json({ ok: true });
				}

				return json({ error: 'Payload de inventario no válido' }, 400);
			}
			case 'DELETE': {
				const raw = typeof event.rawQuery === 'string' ? event.rawQuery : (event.queryStringParameters ? new URLSearchParams(event.queryStringParameters).toString() : '');
				const params = new URLSearchParams(raw);
				const key = (params.get('key') || '').trim().toLowerCase();
				if (!key) return json({ error: 'Key requerida' }, 400);

				await sql`DELETE FROM restaurant_inventory WHERE key = ${key}`;
				return json({ ok: true });
			}
			default:
				return json({ error: 'Método no permitido' }, 405);
		}
	} catch (err) {
		console.error('Error in restaurant-inventory function:', err);
		return json({ error: String(err) }, 500);
	}
}
