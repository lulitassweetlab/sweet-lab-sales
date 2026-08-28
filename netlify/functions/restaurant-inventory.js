import { ensureSchema, sql } from './_db.js';

function json(body, status = 200) {
	return { statusCode: status, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) };
}

function formatExpiryDate(dateVal) {
	if (!dateVal) return null;
	try {
		const d = new Date(dateVal);
		if (isNaN(d.getTime())) return null;
		return d.toISOString().split('T')[0];
	} catch (e) {
		return null;
	}
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

				if (action === 'daily_spending_history') {
					const purchases = await sql`
						SELECT id, supplier_name, total_cost, items, created_at
						FROM restaurant_purchases
						ORDER BY created_at DESC
						LIMIT 300
					`;
					const daysMap = {};
					purchases.forEach(p => {
						const dateStr = p.created_at ? new Date(p.created_at).toISOString().split('T')[0] : 'Desconocida';
						if (!daysMap[dateStr]) {
							daysMap[dateStr] = {
								date: dateStr,
								totalCost: 0,
								purchaseCount: 0,
								purchases: []
							};
						}
						const cost = Number(p.total_cost) || 0;
						daysMap[dateStr].totalCost += cost;
						daysMap[dateStr].purchaseCount += 1;
						daysMap[dateStr].purchases.push({
							id: p.id,
							supplierName: p.supplier_name || 'Sin especificar',
							totalCost: cost,
							items: Array.isArray(p.items) ? p.items : [],
							createdAt: p.created_at
						});
					});
					const sortedDays = Object.values(daysMap).sort((a, b) => b.date.localeCompare(a.date));
					return json(sortedDays);
				}

				if (action === 'item_history') {
					const itemKey = (params.get('key') || '').trim().toLowerCase();
					const purchases = await sql`
						SELECT id, supplier_name, total_cost, items, created_at
						FROM restaurant_purchases
						ORDER BY created_at DESC
						LIMIT 50
					`;
					const history = [];
					purchases.forEach(p => {
						const itemsArr = Array.isArray(p.items) ? p.items : [];
						const match = itemsArr.find(it => it && it.name && (it.name.trim().toLowerCase() === itemKey || itemKey.includes(it.name.trim().toLowerCase()) || it.name.trim().toLowerCase().includes(itemKey)));
						if (match) {
							const qty = Number(match.qty) || 1;
							const totalCost = Number(match.cost) || 0;
							const unitCost = qty > 0 ? (totalCost / qty) : 0;
							history.push({
								id: p.id,
								supplierName: match.supplierName || match.supplier_name || p.supplier_name || 'Sin especificar',
								qty,
								unit: match.unit || 'u',
								cost: totalCost,
								unitCost,
								createdAt: p.created_at
							});
						}
					});
					return json(history);
				}

				const cleanSupplier = (s) => {
					if (!s) return '';
					const low = String(s).trim().toLowerCase();
					if (low.includes('factura escaneada') || low.includes('escaneada por ia') || low.includes('escaneada ia') || low === 'factura') return '';
					return s.trim();
				};

				const rows = await sql`
					SELECT 
						key,
						name,
						category,
						unit,
						stock,
						portion_grams AS "portionGrams",
						supplier_name AS "supplierName",
						last_unit_cost AS "lastUnitCost",
						prev_unit_cost AS "prevUnitCost",
						last_pkg_cost AS "lastPkgCost",
						last_pkg_qty AS "lastPkgQty",
						last_purchased_at AS "lastPurchasedAt",
						expiry_days AS "expiryDays",
						expiry_date AS "expiryDate",
						updated_at AS "updatedAt"
					FROM restaurant_inventory
					ORDER BY name ASC
				`;
				const inventoryMap = {};
				rows.forEach(r => {
					const cat = (r.category || '').trim();
					const cleanCat = (cat === 'Otros' || cat === 'otros') ? '' : cat;
					const normKey = (r.key || r.name).trim().toLowerCase();
					inventoryMap[normKey] = {
						name: r.name,
						category: cleanCat,
						unit: r.unit || 'g',
						stock: Number(r.stock) || 0,
						portionGrams: Number(r.portionGrams) || 0,
						supplierName: cleanSupplier(r.supplierName),
						lastUnitCost: Number(r.lastUnitCost) || 0,
						prevUnitCost: Number(r.prevUnitCost) || 0,
						lastPkgCost: Number(r.lastPkgCost) || 0,
						lastPkgQty: Number(r.lastPkgQty) || 1,
						lastPurchasedAt: r.lastPurchasedAt || r.updatedAt,
						expiryDays: Number(r.expiryDays) || 14,
						expiryDate: formatExpiryDate(r.expiryDate)
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
					const supplierName = (body.supplier_name || '').toString().trim();
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
						const category = (item.category || '').trim();
						const portionGrams = Number(item.portionGrams || item.portion_grams) || 0;
						const expiryDays = Number(item.expiryDays || item.expiry_days) || 14;
						const expiryDate = formatExpiryDate(item.expiryDate || item.expiry_date);

						await sql`
							INSERT INTO restaurant_inventory (key, name, category, unit, stock, portion_grams, supplier_name, last_unit_cost, prev_unit_cost, last_pkg_cost, last_pkg_qty, last_purchased_at, expiry_days, expiry_date, updated_at)
							VALUES (${key}, ${name}, ${category}, ${unit}, ${qty}, ${portionGrams}, ${itemSupplier}, ${unitCost}, 0, ${itemCost}, ${qty}, now(), ${expiryDays}, ${expiryDate}, now())
							ON CONFLICT (key) DO UPDATE SET
								name = EXCLUDED.name,
								category = CASE WHEN EXCLUDED.category <> '' THEN EXCLUDED.category ELSE restaurant_inventory.category END,
								unit = EXCLUDED.unit,
								stock = restaurant_inventory.stock + EXCLUDED.stock,
								portion_grams = CASE WHEN EXCLUDED.portion_grams > 0 THEN EXCLUDED.portion_grams ELSE restaurant_inventory.portion_grams END,
								supplier_name = CASE WHEN EXCLUDED.supplier_name <> '' THEN EXCLUDED.supplier_name ELSE restaurant_inventory.supplier_name END,
								prev_unit_cost = CASE WHEN EXCLUDED.last_unit_cost > 0 THEN restaurant_inventory.last_unit_cost ELSE restaurant_inventory.prev_unit_cost END,
								last_unit_cost = CASE WHEN EXCLUDED.last_unit_cost > 0 THEN EXCLUDED.last_unit_cost ELSE restaurant_inventory.last_unit_cost END,
								last_pkg_cost = CASE WHEN EXCLUDED.last_pkg_cost > 0 THEN EXCLUDED.last_pkg_cost ELSE restaurant_inventory.last_pkg_cost END,
								last_pkg_qty = CASE WHEN EXCLUDED.last_pkg_qty > 0 THEN EXCLUDED.last_pkg_qty ELSE restaurant_inventory.last_pkg_qty END,
								last_purchased_at = now(),
								expiry_days = COALESCE(EXCLUDED.expiry_days, restaurant_inventory.expiry_days),
								expiry_date = COALESCE(EXCLUDED.expiry_date, restaurant_inventory.expiry_date),
								updated_at = now()
						`;
					}

					return json({ ok: true, purchaseId });
				}

				// Case 1: Fast single item update
				if (body.action === 'update_item' || body.item) {
					const item = body.item;
					if (item && item.name) {
						const key = (item.key || item.name).trim().toLowerCase();
						const name = item.name.trim();
						const category = (item.category || '').trim();
						const unit = (item.unit || 'g').trim();
						const stock = Number(item.stock) || 0;
						const portionGrams = Number(item.portionGrams || item.portion_grams) || 0;
						const supplierName = (item.supplierName || item.supplier_name || '').trim();
						const lastUnitCost = Number(item.lastUnitCost || item.last_unit_cost) || 0;
						const prevUnitCost = Number(item.prevUnitCost || item.prev_unit_cost) || 0;
						const lastPkgCost = Number(item.lastPkgCost || item.last_pkg_cost) || 0;
						const lastPkgQty = Number(item.lastPkgQty || item.last_pkg_qty) || 1;
						const expiryDays = Number(item.expiryDays || item.expiry_days) || 14;
						const expiryDate = formatExpiryDate(item.expiryDate || item.expiry_date);
						const lastPurchasedAt = item.lastPurchasedAt || item.last_purchased_at || null;

						await sql`
							INSERT INTO restaurant_inventory (key, name, category, unit, stock, portion_grams, supplier_name, last_unit_cost, prev_unit_cost, last_pkg_cost, last_pkg_qty, last_purchased_at, expiry_days, expiry_date, updated_at)
							VALUES (${key}, ${name}, ${category}, ${unit}, ${stock}, ${portionGrams}, ${supplierName}, ${lastUnitCost}, ${prevUnitCost}, ${lastPkgCost}, ${lastPkgQty}, COALESCE(${lastPurchasedAt}::timestamptz, now()), ${expiryDays}, ${expiryDate}, now())
							ON CONFLICT (key) DO UPDATE SET
								name = EXCLUDED.name,
								category = EXCLUDED.category,
								unit = EXCLUDED.unit,
								stock = EXCLUDED.stock,
								portion_grams = EXCLUDED.portion_grams,
								supplier_name = EXCLUDED.supplier_name,
								last_unit_cost = EXCLUDED.last_unit_cost,
								prev_unit_cost = EXCLUDED.prev_unit_cost,
								last_pkg_cost = EXCLUDED.last_pkg_cost,
								last_pkg_qty = EXCLUDED.last_pkg_qty,
								expiry_days = EXCLUDED.expiry_days,
								expiry_date = EXCLUDED.expiry_date,
								last_purchased_at = COALESCE(EXCLUDED.last_purchased_at, restaurant_inventory.last_purchased_at),
								updated_at = now()
						`;
						return json({ ok: true, key });
					}
				}

				// Case 2: Bulk sync or single/dictionary inventory upsert
				const inventoryObj = body.inventory || body;
				if (typeof inventoryObj === 'object' && inventoryObj !== null) {
					const entries = Array.isArray(inventoryObj)
						? inventoryObj
						: Object.entries(inventoryObj).map(([k, v]) => ({ key: k, ...v }));

					const upsertPromises = entries.map(async (item) => {
						if (!item || !item.name) return;
						const key = (item.key || item.name).trim().toLowerCase();
						const name = item.name.trim();
						const category = (item.category || '').trim();
						const unit = (item.unit || 'g').trim();
						const stock = Number(item.stock) || 0;
						const portionGrams = Number(item.portionGrams || item.portion_grams) || 0;
						const supplierName = (item.supplierName || item.supplier_name || '').trim();
						const lastUnitCost = Number(item.lastUnitCost || item.last_unit_cost) || 0;
						const prevUnitCost = Number(item.prevUnitCost || item.prev_unit_cost) || 0;
						const lastPkgCost = Number(item.lastPkgCost || item.last_pkg_cost) || 0;
						const lastPkgQty = Number(item.lastPkgQty || item.last_pkg_qty) || 1;
						const expiryDays = Number(item.expiryDays || item.expiry_days) || 14;
						const expiryDate = formatExpiryDate(item.expiryDate || item.expiry_date);
						const lastPurchasedAt = item.lastPurchasedAt || item.last_purchased_at || null;

						await sql`
							INSERT INTO restaurant_inventory (key, name, category, unit, stock, portion_grams, supplier_name, last_unit_cost, prev_unit_cost, last_pkg_cost, last_pkg_qty, last_purchased_at, expiry_days, expiry_date, updated_at)
							VALUES (${key}, ${name}, ${category}, ${unit}, ${stock}, ${portionGrams}, ${supplierName}, ${lastUnitCost}, ${prevUnitCost}, ${lastPkgCost}, ${lastPkgQty}, COALESCE(${lastPurchasedAt}::timestamptz, now()), ${expiryDays}, ${expiryDate}, now())
							ON CONFLICT (key) DO UPDATE SET
								name = EXCLUDED.name,
								category = EXCLUDED.category,
								unit = EXCLUDED.unit,
								stock = EXCLUDED.stock,
								portion_grams = EXCLUDED.portion_grams,
								supplier_name = EXCLUDED.supplier_name,
								last_unit_cost = EXCLUDED.last_unit_cost,
								prev_unit_cost = EXCLUDED.prev_unit_cost,
								last_pkg_cost = EXCLUDED.last_pkg_cost,
								last_pkg_qty = EXCLUDED.last_pkg_qty,
								expiry_days = EXCLUDED.expiry_days,
								expiry_date = EXCLUDED.expiry_date,
								last_purchased_at = COALESCE(EXCLUDED.last_purchased_at, restaurant_inventory.last_purchased_at),
								updated_at = now()
						`;
					});

					await Promise.all(upsertPromises);
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
