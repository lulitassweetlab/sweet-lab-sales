import { ensureSchema, sql } from './_db.js';

function json(body, status = 200) {
    return { statusCode: status, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) };
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
        await ensureSchema();
        if (event.httpMethod === 'OPTIONS') return json({ ok: true });

        switch (event.httpMethod) {
            case 'GET': {
                // EMERGENCY RESCUE: AWS API Gateway drops connections (502) if response > 6MB.
                // If a user uploaded a massive video, the DB stores it, but reading it crashes the API.
                // We purge oversized media directly from the DB before querying to guarantee recovery.
                await sql`UPDATE store_products SET media = '[]'::jsonb WHERE length(media::text) > 4500000`;
                await sql`UPDATE store_products SET image_base64 = null WHERE length(image_base64::text) > 4500000`;

                const products = await sql`
					SELECT id, name, description, price, promo_qty, promo_price, image_base64, media, is_promo, is_new, is_active, position
					FROM store_products
					ORDER BY position ASC, name ASC
				`;
                // Parse media JSONB if needed (Neon returns objects for JSONB usually, but just in case)
                return json(products.map(p => ({
                    ...p,
                    media: typeof p.media === 'string' ? JSON.parse(p.media || '[]') : (p.media || [])
                })));
            }
            case 'POST': {
                const data = JSON.parse(event.body || '{}');
                const name = (data.name || '').toString().trim();
                const description = (data.description || '').toString().trim();
                const price = Number(data.price || 0) || 0;
                const image_base64 = data.image_base64 || null;
                const rawMedia = Array.isArray(data.media) ? data.media : [];
                const mediaJson = JSON.stringify(rawMedia);
                const promotion = normalizePromotionFields({ promoQtyRaw: data.promo_qty, promoPriceRaw: data.promo_price });
                const position = Number(data.position || 0) || 0;

                const isPromo = data.is_promo !== undefined ? Boolean(data.is_promo) : false;
                const isNew = data.is_new !== undefined ? Boolean(data.is_new) : false;

                if (!name) return json({ error: 'name requerido' }, 400);
                if (price <= 0) return json({ error: 'price debe ser mayor a 0' }, 400);
                if (promotion.error) return json({ error: promotion.error }, 400);
                if (mediaJson.length > 4500000) return json({ error: 'Los archivos multimedia son demasiado pesados (Máximo 4.5MB en total). Por favor, reduce la duración del video o el número de imágenes.' }, 413);
                if (image_base64 && image_base64.length > 4500000) return json({ error: 'La imagen principal es demasiado pesada (Máximo 4.5MB).' }, 413);

                const [row] = await sql`
					INSERT INTO store_products (name, description, price, promo_qty, promo_price, image_base64, media, is_promo, is_new, position)
					VALUES (${name}, ${description}, ${price}, ${promotion.promoQty}, ${promotion.promoPrice}, ${image_base64}, ${mediaJson}::jsonb, ${isPromo}, ${isNew}, ${position})
					RETURNING id, name, description, price, promo_qty, promo_price, image_base64, media, is_promo, is_new, is_active, position
				`;
                return json({ ...row, media: typeof row.media === 'string' ? JSON.parse(row.media) : (row.media || []) }, 201);
            }
            case 'PUT': {
                const data = JSON.parse(event.body || '{}');
                const id = Number(data.id || 0) || 0;
                if (!id) return json({ error: 'id requerido' }, 400);

                const [existing] = await sql`SELECT id, promo_qty, promo_price FROM store_products WHERE id = ${id}`;
                if (!existing) return json({ error: 'producto no encontrado' }, 404);

                const name = (data.name || '').toString().trim();
                const description = (data.description || '').toString().trim();
                const price = Number(data.price || 0) || 0;
                const image_base64 = data.image_base64 !== undefined ? data.image_base64 : null;
                const rawMedia = data.media !== undefined ? (Array.isArray(data.media) ? data.media : []) : null;

                const promotion = normalizePromotionFields({
                    promoQtyRaw: Object.prototype.hasOwnProperty.call(data, 'promo_qty') ? data.promo_qty : existing.promo_qty,
                    promoPriceRaw: Object.prototype.hasOwnProperty.call(data, 'promo_price') ? data.promo_price : existing.promo_price
                });
                const isPromo = data.is_promo !== undefined ? Boolean(data.is_promo) : false;
                const isNew = data.is_new !== undefined ? Boolean(data.is_new) : false;
                const position = Number(data.position || 0) || 0;
                const isActive = data.is_active !== undefined ? Boolean(data.is_active) : true;

                if (!name) return json({ error: 'name requerido' }, 400);
                if (price <= 0) return json({ error: 'price debe ser mayor a 0' }, 400);
                if (promotion.error) return json({ error: promotion.error }, 400);
                if (image_base64 && image_base64.length > 4500000) return json({ error: 'La imagen principal es demasiado pesada (Máximo 4.5MB).' }, 413);

                let row;
                if (rawMedia !== null) {
                    const mediaJson = JSON.stringify(rawMedia);
                    if (mediaJson.length > 4500000) return json({ error: 'Los archivos multimedia son demasiado pesados (Máximo 4.5MB en total). Por favor, reduce la duración del video o el número de imágenes.' }, 413);
                    [row] = await sql`
                        UPDATE store_products
                        SET name = ${name}, description = ${description}, price = ${price}, promo_qty = ${promotion.promoQty}, promo_price = ${promotion.promoPrice}, image_base64 = ${image_base64}, media = ${mediaJson}::jsonb, is_promo = ${isPromo}, is_new = ${isNew}, position = ${position}, is_active = ${isActive}, updated_at = now()
                        WHERE id = ${id}
                        RETURNING id, name, description, price, promo_qty, promo_price, image_base64, media, is_promo, is_new, is_active, position
                    `;
                } else {
                    [row] = await sql`
                        UPDATE store_products
                        SET name = ${name}, description = ${description}, price = ${price}, promo_qty = ${promotion.promoQty}, promo_price = ${promotion.promoPrice}, image_base64 = ${image_base64}, is_promo = ${isPromo}, is_new = ${isNew}, position = ${position}, is_active = ${isActive}, updated_at = now()
                        WHERE id = ${id}
                        RETURNING id, name, description, price, promo_qty, promo_price, image_base64, media, is_promo, is_new, is_active, position
                    `;
                }
                return json({ ...row, media: typeof row.media === 'string' ? JSON.parse(row.media) : (row.media || []) });
            }
            case 'DELETE': {
                const raw = typeof event.rawQuery === 'string' ? event.rawQuery : (event.queryStringParameters ? new URLSearchParams(event.queryStringParameters).toString() : '');
                const params = new URLSearchParams(raw);
                const id = Number(params.get('id') || 0) || 0;

                if (!id) return json({ error: 'id requerido' }, 400);

                // Optional: Hard delete for store products as they are separate from sales reporting
                await sql`DELETE FROM store_products WHERE id = ${id}`;
                return json({ ok: true });
            }
            default:
                return json({ error: 'Método no permitido' }, 405);
        }
    } catch (err) {
        console.error('Store Products API error:', err);
        return json({ error: String(err?.message || err) }, 500);
    }
}
