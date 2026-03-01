import { ensureSchema, sql, getDesserts } from './_db.js';

function json(body, status = 200) {
	return { statusCode: status, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) };
}

// In-memory cache for desserts (lasts for function instance lifetime)
let dessertsCache = null;
let cacheTime = 0;
const CACHE_TTL = 60000; // 1 minute

function defaultCostPrice(salePrice) {
	return Math.round((Number(salePrice || 0) || 0) * 0.55);
}

function hasValue(v) {
	return v !== undefined && v !== null && String(v).trim() !== '';
}

function normalizePromotionFields({ promoQtyRaw, promoPriceRaw }) {
	const qtySet = hasValue(promoQtyRaw);
	const priceSet = hasValue(promoPriceRaw);
	if (!qtySet && !priceSet) return { promoQty: null, promoPrice: null };
	if (!qtySet || !priceSet) return { error: 'promo_qty y promo_price deben definirse juntos' };

	const promoQty = Math.floor(Number(promoQtyRaw) || 0);
	const promoPrice = Math.round(Number(promoPriceRaw) || 0);
	if (promoQty < 2) return { error: 'promo_qty debe ser mayor o igual a 2' };
	if (promoPrice < 0) return { error: 'promo_price no puede ser negativo' };
	return { promoQty, promoPrice };
}

export async function handler(event) {
	try {
		// OPTIMIZED: Skip ensureSchema for GET requests
		if (event.httpMethod !== 'GET') {
			await ensureSchema();
		}
		if (event.httpMethod === 'OPTIONS') return json({ ok: true });

		switch (event.httpMethod) {
			case 'GET': {
				// Use in-memory cache if available
				const now = Date.now();
				if (dessertsCache && (now - cacheTime) < CACHE_TTL) {
					return json(dessertsCache);
				}

				const desserts = await sql`SELECT id, name, short_code, sale_price, cost_price, promo_qty, promo_price, store_name, store_product_id, is_active, position, created_at FROM desserts ORDER BY position ASC, name ASC`;
				dessertsCache = desserts;
				cacheTime = now;
				return json(desserts);
			}
			case 'POST': {
				const data = JSON.parse(event.body || '{}');
				const name = (data.name || '').toString().trim();
				const shortCode = (data.short_code || '').toString().trim().toLowerCase();
				const salePrice = Number(data.sale_price || 0) || 0;
				const costPriceRaw = data.cost_price;
				const hasCostPrice = costPriceRaw !== undefined && costPriceRaw !== null && String(costPriceRaw).trim() !== '';
				const costPrice = Math.round(hasCostPrice ? (Number(costPriceRaw) || 0) : defaultCostPrice(salePrice));
				const promotion = normalizePromotionFields({ promoQtyRaw: data.promo_qty, promoPriceRaw: data.promo_price });
				const position = Number(data.position || 0) || 0;
				const storeName = (data.store_name || '').toString().trim();
				let storeProductId = null;

				if (!name) return json({ error: 'name requerido' }, 400);
				if (!shortCode) return json({ error: 'short_code requerido' }, 400);
				if (salePrice <= 0) return json({ error: 'sale_price debe ser mayor a 0' }, 400);
				if (costPrice < 0) return json({ error: 'cost_price no puede ser negativo' }, 400);
				if (promotion.error) return json({ error: promotion.error }, 400);

				// Handle store_products linking/creation
				if (storeName) {
					const [existingStoreProduct] = await sql`SELECT id FROM store_products WHERE name = ${storeName} LIMIT 1`;
					if (existingStoreProduct) {
						storeProductId = existingStoreProduct.id;
					} else {
						const [newStoreProduct] = await sql`
							INSERT INTO store_products (name, price, promo_qty, promo_price)
							VALUES (${storeName}, ${salePrice}, ${promotion.promoQty}, ${promotion.promoPrice})
							RETURNING id
						`;
						storeProductId = newStoreProduct.id;
					}
				}

				const [row] = await sql`
					INSERT INTO desserts (name, short_code, sale_price, cost_price, promo_qty, promo_price, store_name, store_product_id, position)
					VALUES (${name}, ${shortCode}, ${salePrice}, ${costPrice}, ${promotion.promoQty}, ${promotion.promoPrice}, ${storeName || null}, ${storeProductId}, ${position})
					RETURNING id, name, short_code, sale_price, cost_price, promo_qty, promo_price, store_name, store_product_id, is_active, position
				`;
				dessertsCache = null;
				cacheTime = 0;
				return json(row, 201);
			}
			case 'PUT': {
				const data = JSON.parse(event.body || '{}');
				const id = Number(data.id || 0) || 0;
				if (!id) return json({ error: 'id requerido' }, 400);

				const [existing] = await sql`SELECT id, cost_price, promo_qty, promo_price, store_product_id FROM desserts WHERE id = ${id}`;
				if (!existing) return json({ error: 'dessert no encontrado' }, 404);

				const name = (data.name || '').toString().trim();
				const salePrice = Number(data.sale_price || 0) || 0;
				const hasCostPrice = Object.prototype.hasOwnProperty.call(data, 'cost_price');
				let costPrice = existing.cost_price;
				if (hasCostPrice) {
					const rawCostPrice = data.cost_price;
					costPrice = (rawCostPrice !== undefined && rawCostPrice !== null && String(rawCostPrice).trim() !== '')
						? (Number(rawCostPrice) || 0)
						: null;
				}
				if (costPrice === null || costPrice === undefined) {
					costPrice = defaultCostPrice(salePrice);
				}
				costPrice = Math.round(Number(costPrice) || 0);
				const promotion = normalizePromotionFields({
					promoQtyRaw: Object.prototype.hasOwnProperty.call(data, 'promo_qty') ? data.promo_qty : existing.promo_qty,
					promoPriceRaw: Object.prototype.hasOwnProperty.call(data, 'promo_price') ? data.promo_price : existing.promo_price
				});
				const position = Number(data.position || 0) || 0;
				const isActive = data.is_active !== undefined ? Boolean(data.is_active) : true;

				const hasStoreName = Object.prototype.hasOwnProperty.call(data, 'store_name');
				const storeName = hasStoreName ? (data.store_name || '').toString().trim() : null;
				let storeProductId = existing.store_product_id;

				if (!name) return json({ error: 'name requerido' }, 400);
				if (salePrice <= 0) return json({ error: 'sale_price debe ser mayor a 0' }, 400);
				if (costPrice < 0) return json({ error: 'cost_price no puede ser negativo' }, 400);
				if (promotion.error) return json({ error: promotion.error }, 400);

				// Handle store_products linking/syncing
				if (hasStoreName && storeName) {
					if (storeProductId) {
						// Update existing linked store_product
						await sql`
							UPDATE store_products 
							SET name = ${storeName}, price = ${salePrice}, is_active = ${isActive}, updated_at = now()
							WHERE id = ${storeProductId}
						`;
					} else {
						// It doesn't have a linked ID. Does the storeName already exist independently?
						const [existingStoreProduct] = await sql`SELECT id FROM store_products WHERE name = ${storeName} LIMIT 1`;
						if (existingStoreProduct) {
							storeProductId = existingStoreProduct.id;
						} else {
							// Create new link
							const [newStoreProduct] = await sql`
								INSERT INTO store_products (name, price, promo_qty, promo_price, is_active)
								VALUES (${storeName}, ${salePrice}, ${promotion.promoQty}, ${promotion.promoPrice}, ${isActive})
								RETURNING id
							`;
							storeProductId = newStoreProduct.id;
						}
					}
				} else if (hasStoreName && !storeName) {
					// Client wants to unlink/remove store name
					storeProductId = null;
				}

				let query;
				if (hasStoreName) {
					query = sql`
						UPDATE desserts
						SET name = ${name}, sale_price = ${salePrice}, cost_price = ${costPrice}, promo_qty = ${promotion.promoQty}, promo_price = ${promotion.promoPrice}, position = ${position}, is_active = ${isActive}, store_name = ${storeName || null}, store_product_id = ${storeProductId}, updated_at = now()
						WHERE id = ${id}
						RETURNING id, name, short_code, sale_price, cost_price, promo_qty, promo_price, store_name, store_product_id, is_active, position
					`;
				} else {
					query = sql`
						UPDATE desserts
						SET name = ${name}, sale_price = ${salePrice}, cost_price = ${costPrice}, promo_qty = ${promotion.promoQty}, promo_price = ${promotion.promoPrice}, position = ${position}, is_active = ${isActive}, updated_at = now()
						WHERE id = ${id}
						RETURNING id, name, short_code, sale_price, cost_price, promo_qty, promo_price, store_name, store_product_id, is_active, position
					`;
				}

				const [row] = await query;
				dessertsCache = null;
				cacheTime = 0;
				return json(row);
			}
			case 'DELETE': {
				const raw = typeof event.rawQuery === 'string' ? event.rawQuery : (event.queryStringParameters ? new URLSearchParams(event.queryStringParameters).toString() : '');
				const params = new URLSearchParams(raw);
				const id = Number(params.get('id') || 0) || 0;

				if (!id) return json({ error: 'id requerido' }, 400);

				// Check if there are sales registered
				const [hasSales] = await sql`SELECT 1 FROM sale_items WHERE dessert_id = ${id} LIMIT 1`;
				if (hasSales) {
					return json({ error: 'No se puede eliminar de la base de datos porque ya tiene ventas históricas registradas. Si ya no lo vendes, te sugerimos usar el botón "Desactivar".' }, 400);
				}

				// Hard delete
				await sql`DELETE FROM desserts WHERE id = ${id}`;
				dessertsCache = null;
				cacheTime = 0;
				return json({ ok: true });
			}
			default:
				return json({ error: 'Método no permitido' }, 405);
		}
	} catch (err) {
		console.error('Desserts API error:', err);
		return json({ error: String(err?.message || err) }, 500);
	}
}
