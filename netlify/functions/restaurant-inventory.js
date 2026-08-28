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
				const action = (params.get('action') || '').trim();

				if (action === 'memory') {
					const memRows = await sql`
						SELECT key, name, unit, qty
						FROM restaurant_product_memory
						ORDER BY name ASC
					`;
					const memoryMap = {};
					memRows.forEach(r => {
						memoryMap[r.key] = {
							name: r.name,
							unit: r.unit || 'und',
							qty: Number(r.qty) || 1
						};
					});
					return json(memoryMap);
				}

				const rows = await sql`
					SELECT 
						key,
						name,
						unit,
						stock,
						portion_grams AS "portionGrams",
						supplier_name AS "supplierName",
						last_unit_cost AS "lastUnitCost",
						prev_unit_cost AS "prevUnitCost",
						last_purchased_at AS "lastPurchasedAt",
						expiry_days AS "expiryDays",
						expiry_date AS "expiryDate",
						updated_at AS "updatedAt"
					FROM restaurant_inventory
					ORDER BY name ASC
				`;
				const inventoryMap = {};
				rows.forEach(r => {
					inventoryMap[r.key] = {
						name: r.name,
						unit: r.unit || 'g',
						stock: Number(r.stock) || 0,
						portionGrams: Number(r.portionGrams) || 0,
						supplierName: r.supplierName || '',
						lastUnitCost: Number(r.lastUnitCost) || 0,
						prevUnitCost: Number(r.prevUnitCost) || 0,
						lastPurchasedAt: r.lastPurchasedAt || r.updatedAt,
						expiryDays: Number(r.expiryDays) || 14,
						expiryDate: r.expiryDate ? r.expiryDate.toString().split('T')[0] : null
					};
				});
				return json(inventoryMap);
			}
			case 'POST': {
				const body = JSON.parse(event.body || '{}');

				// Case 0: Save learned product memory rules
				if (body.action === 'learn_product_memory') {
					const items = Array.isArray(body.items) ? body.items : (body.item ? [body.item] : []);
					for (const item of items) {
						if (!item || !item.name) continue;
						const key = item.name.trim().toLowerCase();
						const name = item.name.trim();
						const unit = (item.unit || 'und').trim();
						const qty = Number(item.qty) || 1;

						await sql`
							INSERT INTO restaurant_product_memory (key, name, unit, qty, updated_at)
							VALUES (${key}, ${name}, ${unit}, ${qty}, now())
							ON CONFLICT (key) DO UPDATE SET
								name = EXCLUDED.name,
								unit = EXCLUDED.unit,
								qty = EXCLUDED.qty,
								updated_at = now()
						`;
					}
					return json({ ok: true });
				}
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
						const itemCost = Number(item.cost) || 0;
						const unitCost = qty > 0 ? (itemCost / qty) : 0;
						const itemSupplier = (item.supplierName || item.supplier_name || supplierName || '').trim();
						const portionGrams = Number(item.portionGrams || item.portion_grams) || 0;
						const expiryDays = Number(item.expiryDays || item.expiry_days) || 14;
						const expiryDate = item.expiryDate || item.expiry_date || null;

						await sql`
							INSERT INTO restaurant_inventory (key, name, unit, stock, portion_grams, supplier_name, last_unit_cost, prev_unit_cost, last_purchased_at, expiry_days, expiry_date, updated_at)
							VALUES (${key}, ${name}, ${unit}, ${qty}, ${portionGrams}, ${itemSupplier}, ${unitCost}, 0, now(), ${expiryDays}, ${expiryDate}, now())
							ON CONFLICT (key) DO UPDATE SET
								name = EXCLUDED.name,
								unit = EXCLUDED.unit,
								stock = restaurant_inventory.stock + EXCLUDED.stock,
								portion_grams = CASE WHEN EXCLUDED.portion_grams > 0 THEN EXCLUDED.portion_grams ELSE restaurant_inventory.portion_grams END,
								supplier_name = CASE WHEN EXCLUDED.supplier_name <> '' THEN EXCLUDED.supplier_name ELSE restaurant_inventory.supplier_name END,
								prev_unit_cost = CASE WHEN EXCLUDED.last_unit_cost > 0 THEN restaurant_inventory.last_unit_cost ELSE restaurant_inventory.prev_unit_cost END,
								last_unit_cost = CASE WHEN EXCLUDED.last_unit_cost > 0 THEN EXCLUDED.last_unit_cost ELSE restaurant_inventory.last_unit_cost END,
								last_purchased_at = now(),
								expiry_days = COALESCE(EXCLUDED.expiry_days, restaurant_inventory.expiry_days),
								expiry_date = COALESCE(EXCLUDED.expiry_date, restaurant_inventory.expiry_date),
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
						const portionGrams = Number(item.portionGrams || item.portion_grams) || 0;
						const supplierName = (item.supplierName || item.supplier_name || '').trim();
						const lastUnitCost = Number(item.lastUnitCost || item.last_unit_cost) || 0;
						const prevUnitCost = Number(item.prevUnitCost || item.prev_unit_cost) || 0;
						const expiryDays = Number(item.expiryDays || item.expiry_days) || 14;
						const expiryDate = item.expiryDate || item.expiry_date || null;
						const lastPurchasedAt = item.lastPurchasedAt || item.last_purchased_at || null;

						await sql`
							INSERT INTO restaurant_inventory (key, name, unit, stock, portion_grams, supplier_name, last_unit_cost, prev_unit_cost, last_purchased_at, expiry_days, expiry_date, updated_at)
							VALUES (${key}, ${name}, ${unit}, ${stock}, ${portionGrams}, ${supplierName}, ${lastUnitCost}, ${prevUnitCost}, COALESCE(${lastPurchasedAt}::timestamptz, now()), ${expiryDays}, ${expiryDate}, now())
							ON CONFLICT (key) DO UPDATE SET
								name = EXCLUDED.name,
								unit = EXCLUDED.unit,
								stock = EXCLUDED.stock,
								portion_grams = EXCLUDED.portion_grams,
								supplier_name = EXCLUDED.supplier_name,
								last_unit_cost = EXCLUDED.last_unit_cost,
								prev_unit_cost = EXCLUDED.prev_unit_cost,
								expiry_days = EXCLUDED.expiry_days,
								expiry_date = EXCLUDED.expiry_date,
								last_purchased_at = COALESCE(EXCLUDED.last_purchased_at, restaurant_inventory.last_purchased_at),
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
