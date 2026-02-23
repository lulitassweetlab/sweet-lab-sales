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
				
				const desserts = await getDesserts();
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
				
				if (!name) return json({ error: 'name requerido' }, 400);
				if (!shortCode) return json({ error: 'short_code requerido' }, 400);
				if (salePrice <= 0) return json({ error: 'sale_price debe ser mayor a 0' }, 400);
				if (costPrice < 0) return json({ error: 'cost_price no puede ser negativo' }, 400);
				if (promotion.error) return json({ error: promotion.error }, 400);
				
				const [row] = await sql`
					INSERT INTO desserts (name, short_code, sale_price, cost_price, promo_qty, promo_price, position)
					VALUES (${name}, ${shortCode}, ${salePrice}, ${costPrice}, ${promotion.promoQty}, ${promotion.promoPrice}, ${position})
					RETURNING id, name, short_code, sale_price, cost_price, promo_qty, promo_price, is_active, position
				`;
				dessertsCache = null;
				cacheTime = 0;
				return json(row, 201);
			}
			case 'PUT': {
				const data = JSON.parse(event.body || '{}');
				const id = Number(data.id || 0) || 0;
				if (!id) return json({ error: 'id requerido' }, 400);
				
				const [existing] = await sql`SELECT id, cost_price, promo_qty, promo_price FROM desserts WHERE id = ${id}`;
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
				
				if (!name) return json({ error: 'name requerido' }, 400);
				if (salePrice <= 0) return json({ error: 'sale_price debe ser mayor a 0' }, 400);
				if (costPrice < 0) return json({ error: 'cost_price no puede ser negativo' }, 400);
				if (promotion.error) return json({ error: promotion.error }, 400);
				
				const [row] = await sql`
					UPDATE desserts
					SET name = ${name}, sale_price = ${salePrice}, cost_price = ${costPrice}, promo_qty = ${promotion.promoQty}, promo_price = ${promotion.promoPrice}, position = ${position}, is_active = ${isActive}, updated_at = now()
					WHERE id = ${id}
					RETURNING id, name, short_code, sale_price, cost_price, promo_qty, promo_price, is_active, position
				`;
				dessertsCache = null;
				cacheTime = 0;
				return json(row);
			}
			case 'DELETE': {
				const raw = typeof event.rawQuery === 'string' ? event.rawQuery : (event.queryStringParameters ? new URLSearchParams(event.queryStringParameters).toString() : '');
				const params = new URLSearchParams(raw);
				const id = Number(params.get('id') || 0) || 0;
				
				if (!id) return json({ error: 'id requerido' }, 400);
				
				// Soft delete: just mark as inactive
				await sql`UPDATE desserts SET is_active = false, updated_at = now() WHERE id = ${id}`;
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
