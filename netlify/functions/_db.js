import { neon } from '@netlify/neon';

const sql = neon(); // uses NETLIFY_DATABASE_URL
let schemaEnsured = false;
let schemaCheckPromise = null; // Deduplicate concurrent schema checks
const SCHEMA_VERSION = 35; // 35: Added is_reviewed to sale_days for Admin workflow

export async function ensureSchema() {
	if (schemaEnsured) return;
	if (schemaCheckPromise) return schemaCheckPromise;

	schemaCheckPromise = (async () => {
		try {
			// 1) FAST PATH: Version Check
			try {
				const meta = await sql`SELECT version FROM schema_meta LIMIT 1`;
				if (meta.length > 0 && Number(meta[0].version) >= SCHEMA_VERSION) {
					schemaEnsured = true;
					return;
				}
			} catch (err) { /* schema_meta may not exist, proceed */ }

			// 2) SLOW PATH: Full Migration
			await sql`

				CREATE TABLE IF NOT EXISTS schema_meta (
					version INTEGER NOT NULL DEFAULT 0,
					updated_at TIMESTAMPTZ DEFAULT now()
				)
			`;
			await sql`INSERT INTO schema_meta (version) SELECT 0 WHERE NOT EXISTS (SELECT 1 FROM schema_meta)`;

			await sql`
				CREATE TABLE IF NOT EXISTS users (
					id SERIAL PRIMARY KEY,
					username TEXT UNIQUE NOT NULL,
					password_hash TEXT NOT NULL,
					role TEXT NOT NULL DEFAULT 'user',
					created_at TIMESTAMPTZ DEFAULT now()
				)
			`;

			await sql`
				CREATE TABLE IF NOT EXISTS sellers (
					id SERIAL PRIMARY KEY,
					name TEXT UNIQUE NOT NULL,
					bill_color TEXT,
					archived_at TIMESTAMPTZ,
					commission_rate_low INTEGER NOT NULL DEFAULT 1000,
					commission_rate_mid INTEGER NOT NULL DEFAULT 1300,
					commission_rate_high INTEGER NOT NULL DEFAULT 1500,
					require_whatsapp BOOLEAN NOT NULL DEFAULT false,
					created_at TIMESTAMPTZ DEFAULT now()
				)
			`;

			await sql`
				CREATE TABLE IF NOT EXISTS sale_days (
					id SERIAL PRIMARY KEY,
					seller_id INTEGER NOT NULL REFERENCES sellers(id) ON DELETE CASCADE,
					day DATE NOT NULL,
					is_archived BOOLEAN NOT NULL DEFAULT false,
					is_reviewed BOOLEAN NOT NULL DEFAULT false,
					delivered_arco INTEGER NOT NULL DEFAULT 0,
					delivered_melo INTEGER NOT NULL DEFAULT 0,
					delivered_mara INTEGER NOT NULL DEFAULT 0,
					delivered_oreo INTEGER NOT NULL DEFAULT 0,
					delivered_nute INTEGER NOT NULL DEFAULT 0,
					commissions_paid INTEGER NOT NULL DEFAULT 0,
					delivered_counts JSONB NOT NULL DEFAULT '{}'::jsonb,
					UNIQUE (seller_id, day)
				)
			`;

			await sql`
				CREATE TABLE IF NOT EXISTS sales (
					id SERIAL PRIMARY KEY,
					seller_id INTEGER NOT NULL REFERENCES sellers(id) ON DELETE CASCADE,
					sale_day_id INTEGER REFERENCES sale_days(id) ON DELETE CASCADE,
					client_name TEXT DEFAULT '',
					qty_arco INTEGER NOT NULL DEFAULT 0,
					qty_melo INTEGER NOT NULL DEFAULT 0,
					qty_mara INTEGER NOT NULL DEFAULT 0,
					qty_oreo INTEGER NOT NULL DEFAULT 0,
					qty_nute INTEGER NOT NULL DEFAULT 0,
					is_paid BOOLEAN NOT NULL DEFAULT false,
					pay_method TEXT,
					payment_date DATE,
					payment_source TEXT,
					comment_text TEXT DEFAULT '',
					special_pricing_type TEXT,
					total_cents INTEGER NOT NULL DEFAULT 0,
					created_at TIMESTAMPTZ DEFAULT now()
				)
			`;

			await sql`
				CREATE TABLE IF NOT EXISTS desserts (
					id SERIAL PRIMARY KEY,
					name TEXT UNIQUE NOT NULL,
					short_code TEXT UNIQUE NOT NULL,
					sale_price INTEGER NOT NULL DEFAULT 0,
					cost_price INTEGER,
					promo_qty INTEGER,
					promo_price INTEGER,
					store_name TEXT,
					store_product_id INTEGER,
					is_active BOOLEAN NOT NULL DEFAULT true,
					position INTEGER NOT NULL DEFAULT 0,
					created_at TIMESTAMPTZ DEFAULT now(),
					updated_at TIMESTAMPTZ DEFAULT now()
				)
			`;

			await sql`
				CREATE TABLE IF NOT EXISTS sale_items (
					id SERIAL PRIMARY KEY,
					sale_id INTEGER NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
					dessert_id INTEGER NOT NULL REFERENCES desserts(id) ON DELETE CASCADE,
					quantity INTEGER NOT NULL DEFAULT 0,
					unit_price INTEGER NOT NULL DEFAULT 0,
					created_at TIMESTAMPTZ DEFAULT now(),
					updated_at TIMESTAMPTZ DEFAULT now()
				)
			`;

			await sql`
				CREATE TABLE IF NOT EXISTS notifications (
					id SERIAL PRIMARY KEY,
					type VARCHAR(50) NOT NULL,
					seller_id INTEGER REFERENCES sellers(id) ON DELETE SET NULL,
					sale_id INTEGER REFERENCES sales(id) ON DELETE SET NULL,
					sale_day_id INTEGER REFERENCES sale_days(id) ON DELETE SET NULL,
					message TEXT NOT NULL,
					actor_name TEXT,
					icon_url TEXT,
					pay_method TEXT,
					is_read BOOLEAN DEFAULT false,
					created_at TIMESTAMPTZ DEFAULT now()
				)
			`;

			await sql`
				CREATE TABLE IF NOT EXISTS clients (
					id SERIAL PRIMARY KEY,
					name VARCHAR(255) NOT NULL,
					short_name VARCHAR(100),
					whatsapp VARCHAR(20),
					birth_date DATE,
					description TEXT,
					address TEXT,
					latitude DECIMAL(12, 9),
					longitude DECIMAL(12, 9),
					seller_id INTEGER NOT NULL REFERENCES sellers(id) ON DELETE CASCADE,
					created_at TIMESTAMPTZ DEFAULT now(),
					UNIQUE (name, seller_id)
				)
			`;

			await sql`
				CREATE TABLE IF NOT EXISTS store_products (
					id SERIAL PRIMARY KEY,
					name TEXT NOT NULL,
					description TEXT DEFAULT '',
					price INTEGER NOT NULL DEFAULT 0,
					promo_qty INTEGER,
					promo_price INTEGER,
					image_base64 TEXT,
					media JSONB DEFAULT '[]'::jsonb,
					is_promo BOOLEAN NOT NULL DEFAULT false,
					is_new BOOLEAN NOT NULL DEFAULT false,
					is_active BOOLEAN NOT NULL DEFAULT true,
					position INTEGER NOT NULL DEFAULT 0,
					created_at TIMESTAMPTZ DEFAULT now(),
					updated_at TIMESTAMPTZ DEFAULT now()
				)
			`;

			await sql`
				CREATE TABLE IF NOT EXISTS store_settings (
					key TEXT PRIMARY KEY,
					value TEXT NOT NULL,
					updated_at TIMESTAMPTZ DEFAULT now()
				)
			`;

			await sql`CREATE INDEX IF NOT EXISTS idx_sales_day ON sales(sale_day_id)`;
			await sql`CREATE INDEX IF NOT EXISTS idx_sales_seller ON sales(seller_id)`;
			await sql`CREATE INDEX IF NOT EXISTS idx_sale_items_sale ON sale_items(sale_id)`;
			await sql`CREATE INDEX IF NOT EXISTS idx_clients_seller ON clients(seller_id)`;
 
			await sql`
				CREATE TABLE IF NOT EXISTS crm_tags (
					id SERIAL PRIMARY KEY,
					seller_id INTEGER NOT NULL REFERENCES sellers(id) ON DELETE CASCADE,
					name TEXT NOT NULL,
					color TEXT DEFAULT '#818cf8',
					created_at TIMESTAMPTZ DEFAULT now(),
					UNIQUE (seller_id, name)
				)
			`;
			await sql`
				CREATE TABLE IF NOT EXISTS crm_client_tags (
					client_id INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
					tag_id INTEGER NOT NULL REFERENCES crm_tags(id) ON DELETE CASCADE,
					PRIMARY KEY (client_id, tag_id)
				)
			`;
			await sql`CREATE INDEX IF NOT EXISTS idx_crm_client_tags_client ON crm_client_tags(client_id)`;
			await sql`CREATE INDEX IF NOT EXISTS idx_crm_client_tags_tag ON crm_client_tags(tag_id)`;

			// 34: CRM Activities (Timeline), Stages and Sales Link
			await sql`
				CREATE TABLE IF NOT EXISTS crm_stages (
					id SERIAL PRIMARY KEY,
					name VARCHAR(50) UNIQUE NOT NULL,
					color VARCHAR(20) DEFAULT '#818cf8',
					position INTEGER DEFAULT 0
				)
			`;
			await sql`
				CREATE TABLE IF NOT EXISTS crm_client_stage (
					client_id INTEGER PRIMARY KEY REFERENCES clients(id) ON DELETE CASCADE,
					stage_id INTEGER REFERENCES crm_stages(id) ON DELETE SET NULL,
					updated_by INTEGER,
					updated_at TIMESTAMPTZ DEFAULT now()
				)
			`;
			await sql`
				CREATE TABLE IF NOT EXISTS crm_stage_history (
					id SERIAL PRIMARY KEY,
					client_id INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
					old_stage_id INTEGER,
					new_stage_id INTEGER,
					note TEXT,
					changed_by INTEGER,
					changed_at TIMESTAMPTZ DEFAULT now()
				)
			`;
			await sql`
				CREATE TABLE IF NOT EXISTS crm_activities (
					id SERIAL PRIMARY KEY,
					seller_id INTEGER REFERENCES sellers(id) ON DELETE CASCADE,
					client_id INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
					related_sale_id INTEGER REFERENCES sales(id) ON DELETE SET NULL,
					activity_type VARCHAR(50) DEFAULT 'note', -- 'note', 'call', 'order', etc.
					description TEXT,
					created_by TEXT,
					created_at TIMESTAMPTZ DEFAULT now()
				)
			`;
			await sql`
				CREATE TABLE IF NOT EXISTS crm_client_sales (
					id SERIAL PRIMARY KEY,
					client_id INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
					sale_id INTEGER UNIQUE NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
					seller_id INTEGER NOT NULL REFERENCES sellers(id) ON DELETE CASCADE,
					linked_at TIMESTAMPTZ DEFAULT now()
				)
			`;
			await sql`CREATE INDEX IF NOT EXISTS idx_crm_activities_client ON crm_activities(client_id)`;
			await sql`CREATE INDEX IF NOT EXISTS idx_crm_activities_sale ON crm_activities(related_sale_id)`;
			await sql`CREATE INDEX IF NOT EXISTS idx_crm_client_sales_client ON crm_client_sales(client_id)`;



			// Seed default desserts if empty
			const dessertCount = await sql`SELECT COUNT(*)::int AS c FROM desserts`;
			if ((dessertCount[0]?.c || 0) === 0) {
				const ds = [
					{ name: 'Arco', short_code: 'arco', sale_price: 8500, cost_price: 4675, position: 1 },
					{ name: 'Melo', short_code: 'melo', sale_price: 9500, cost_price: 5225, position: 2 },
					{ name: 'Mara', short_code: 'mara', sale_price: 10500, cost_price: 5775, position: 3 },
					{ name: 'Oreo', short_code: 'oreo', sale_price: 10500, cost_price: 5775, position: 4 },
					{ name: 'Nute', short_code: 'nute', sale_price: 13000, cost_price: 7150, position: 5 }
				];
				for (const d of ds) {
					await sql`INSERT INTO desserts (name, short_code, sale_price, cost_price, position) VALUES (${d.name}, ${d.short_code}, ${d.sale_price}, ${d.cost_price}, ${d.position}) ON CONFLICT (name) DO NOTHING`;
				}
			}

			// Seed default users if empty
			const userCount = await sql`SELECT COUNT(*)::int AS c FROM users`;
			if ((userCount[0]?.c || 0) === 0) {
				await sql`INSERT INTO users (username, password_hash, role) VALUES ('jorge', 'Jorge123', 'superadmin'), ('marcela', 'marcelasweet', 'admin'), ('aleja', 'alejasweet', 'admin')`;
			}

			// Seed default CRM stages
			const stageCount = await sql`SELECT COUNT(*)::int AS c FROM crm_stages`;
			if ((stageCount[0]?.c || 0) === 0) {
				await sql`
					INSERT INTO crm_stages (name, color, position) VALUES 
					('Prospecto', '#94a3b8', 1),
					('Cliente nuevo', '#22c55e', 2),
					('Cliente recurrente', '#3b82f6', 3),
					('Cliente VIP', '#eab308', 4),
					('Perdido', '#f43f5e', 5)
				`;
			}

			// Migration: Migrate old sales columns to sale_items
			try {
				const needsMigration = await sql`SELECT id FROM sales s WHERE (s.qty_arco > 0 OR s.qty_melo > 0 OR s.qty_mara > 0 OR s.qty_oreo > 0 OR s.qty_nute > 0) AND NOT EXISTS (SELECT 1 FROM sale_items si WHERE si.sale_id = s.id) LIMIT 50`;
				if (needsMigration.length > 0) {
					const dessertsList = await sql`SELECT id, short_code FROM desserts` || [];
					const dMap = {}; dessertsList.forEach(d => dMap[d.short_code] = d.id);
					const pricesMap = { arco: 8500, melo: 9500, mara: 10500, oreo: 10500, nute: 13000 };
					for (const s of needsMigration) {
						const [sale] = await sql`SELECT * FROM sales WHERE id = ${s.id}`;
						for (const k of ['arco', 'melo', 'mara', 'oreo', 'nute']) {
							const q = sale[`qty_${k}`];
							if (q > 0 && dMap[k]) {
								await sql`INSERT INTO sale_items (sale_id, dessert_id, quantity, unit_price) VALUES (${s.id}, ${dMap[k]}, ${q}, ${pricesMap[k]})`;
							}
						}
					}
				}
			} catch (mErr) { console.error('Migration error:', mErr); }

			// Final Version Bump and Dynamic Migrations
			try {
				await sql`ALTER TABLE sellers ADD COLUMN IF NOT EXISTS require_whatsapp BOOLEAN NOT NULL DEFAULT false`;
				await sql`ALTER TABLE sale_days ADD COLUMN IF NOT EXISTS delivered_counts JSONB NOT NULL DEFAULT '{}'::jsonb`;
			} catch (mErr) { console.error('Migration error for dynamic columns:', mErr); }

			await sql`UPDATE schema_meta SET version = ${SCHEMA_VERSION}, updated_at = now()`;
			schemaEnsured = true;
		} catch (err) {
			console.error('CRITICAL: ensureSchema failed', err);
			throw err;
		} finally {
			schemaCheckPromise = null;
		}
	})();

	return schemaCheckPromise;
}

export function prices() {
	return { arco: 8500, melo: 9500, mara: 10500, oreo: 10500, nute: 13000 };
}

function fallbackCostPrice(salePrice) {
	return Math.round((Number(salePrice || 0) || 0) * 0.55);
}

function getDessertUnitPriceForSpecialPricing(dessert, specialPricing) {
	if (specialPricing === 'muestra') return 0;
	if (specialPricing === 'a_costo') {
		const configuredCost = Number(dessert?.cost_price);
		if (Number.isFinite(configuredCost) && configuredCost >= 0) return Math.round(configuredCost);
		return fallbackCostPrice(dessert?.sale_price);
	}
	return Number(dessert?.sale_price || 0) || 0;
}

function normalizePromotionQty(value) {
	const n = Number(value);
	if (!Number.isFinite(n)) return null;
	const i = Math.floor(n);
	if (i < 2) return null;
	return i;
}

function normalizePromotionPrice(value) {
	const n = Number(value);
	if (!Number.isFinite(n)) return null;
	const i = Math.round(n);
	if (i < 0) return null;
	return i;
}

function getPromotionForDessert(dessert) {
	const qty = normalizePromotionQty(dessert?.promo_qty);
	const price = normalizePromotionPrice(dessert?.promo_price);
	if (!qty || price === null) return null;
	return { qty, price };
}

function getDessertLineTotalForPricing(dessert, qty, specialPricing) {
	const quantity = Math.max(0, Math.floor(Number(qty || 0) || 0));
	if (!quantity) return 0;

	const unitPrice = getDessertUnitPriceForSpecialPricing(dessert, specialPricing);
	if (specialPricing === 'muestra' || specialPricing === 'a_costo') {
		return quantity * unitPrice;
	}

	const promotion = getPromotionForDessert(dessert);
	if (!promotion) return quantity * unitPrice;

	const bundleCount = Math.floor(quantity / promotion.qty);
	const remainder = quantity % promotion.qty;
	return (bundleCount * promotion.price) + (remainder * unitPrice);
}

export async function getDesserts() {
	await ensureSchema();
	try {
		return await sql`SELECT id, name, short_code, sale_price, cost_price, promo_qty, promo_price, is_active, position FROM desserts WHERE is_active = true ORDER BY position ASC, id ASC`;
	} catch (err) {
		console.error('Error getting desserts:', err);
		return [];
	}
}

export async function recalcTotalForId(id) {
	await ensureSchema();
	const [sale] = await sql`SELECT * FROM sales WHERE id = ${id}`;
	if (!sale) throw new Error(`Sale ${id} not found`);

	const specialPricing = sale.special_pricing_type || null;
	const dessertsList = await getDesserts();
	const dessertsById = {};
	for (const d of dessertsList) dessertsById[d.id] = d;

	const allItems = await sql`SELECT id, dessert_id, quantity FROM sale_items WHERE sale_id = ${id}`;
	const hasItems = Array.isArray(allItems) && allItems.length > 0;

	let row;
	if (hasItems) {
		if (specialPricing) {
			for (const item of allItems) {
				const dessert = dessertsById[item.dessert_id];
				const newPrice = dessert ? getDessertUnitPriceForSpecialPricing(dessert, specialPricing) : 0;
				await sql`UPDATE sale_items SET unit_price = ${newPrice} WHERE id = ${item.id}`;
			}
		}

		const qtyByDessertId = {};
		for (const item of allItems) {
			const did = Number(item.dessert_id || 0);
			if (did) qtyByDessertId[did] = (qtyByDessertId[did] || 0) + (Number(item.quantity || 0));
		}
		let total = 0;
		for (const [didRaw, qt] of Object.entries(qtyByDessertId)) {
			const d = dessertsById[didRaw];
			if (d) total += getDessertLineTotalForPricing(d, qt, specialPricing);
		}

		[row] = await sql`UPDATE sales SET total_cents = ${total} WHERE id = ${id} RETURNING *`;
	} else {
		let total = 0;
		for (const d of dessertsList) {
			const q = Number(sale[`qty_${d.short_code}`] || 0);
			if (q > 0) total += getDessertLineTotalForPricing(d, q, specialPricing);
		}
		[row] = await sql`UPDATE sales SET total_cents = ${total} WHERE id = ${id} RETURNING *`;
	}

	try {
		row.items = await sql`
			SELECT si.id, si.dessert_id, si.quantity, si.unit_price, d.name, d.short_code
			FROM sale_items si
			JOIN desserts d ON d.id = si.dessert_id
			WHERE si.sale_id = ${id}
			ORDER BY d.position ASC
		`;
	} catch (e) { row.items = []; }

	return row;
}

export async function getOrCreateDayId(sellerId, day) {
	const rows = await sql`SELECT id FROM sale_days WHERE seller_id=${sellerId} AND day=${day}`;
	if (rows.length) return rows[0].id;
	const [created] = await sql`INSERT INTO sale_days (seller_id, day) VALUES (${sellerId}, ${day}) RETURNING id`;
	return created.id;
}

export async function notify({ type, sellerId = null, saleId = null, saleDayId = null, message = '', actorName = '', iconUrl = null, payMethod = null }) {
	await ensureSchema();
	try {
		const r = await sql`SELECT role FROM users WHERE lower(username)=lower(${actorName || ''}) LIMIT 1`;
		if (r?.[0]?.role === 'superadmin') return;
	} catch { }
	await sql`INSERT INTO notifications (type, seller_id, sale_id, sale_day_id, message, actor_name, icon_url, pay_method) VALUES (${type}, ${sellerId}, ${saleId}, ${saleDayId}, ${message}, ${actorName}, ${iconUrl}, ${payMethod})`;
}

export function canonicalizeIngredientName(name) {
	const raw = (name || '').trim();
	const low = raw.toLowerCase();
	if (low.includes('nutella')) return 'Nutella';
	if (low.startsWith('agua')) return 'Agua';
	if (low.includes('oreo')) return 'Oreo';
	if (low.includes('bolsa') && low.includes('cuchara')) return 'Bolsa para cuchara';
	return raw;
}

export async function ensureInventoryItem(ingredient, unit = 'g') {
	await ensureSchema();
	const name = canonicalizeIngredientName(ingredient);
	if (!name) return null;
	const [row] = await sql`
		INSERT INTO inventory_items (ingredient, unit) VALUES (${name}, ${unit})
		ON CONFLICT (ingredient) DO UPDATE SET unit = EXCLUDED.unit, updated_at = now()
		RETURNING id, ingredient, unit
	`;
	return row;
}

export { sql };