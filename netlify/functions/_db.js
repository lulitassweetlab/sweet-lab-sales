import { neon } from '@netlify/neon';

const sql = neon(); // uses NETLIFY_DATABASE_URL
let schemaEnsured = false;
let schemaCheckPromise = null; // Deduplicate concurrent schema checks
const SCHEMA_VERSION = 56; // 56: added position to sellers

export async function ensureSchema() {
	if (schemaEnsured) return;
	if (schemaCheckPromise) return schemaCheckPromise;

	schemaCheckPromise = (async () => {
		try {
			let meta = [];
			try {
				meta = await sql`SELECT version FROM schema_meta LIMIT 1`;
				if (meta.length > 0 && Number(meta[0].version) >= SCHEMA_VERSION) {
					schemaEnsured = true;
					return;
				}
			} catch (err) { /* proceed */ }
			if (!meta.length) meta = [{ version: 0 }];

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
					display_order INTEGER DEFAULT 0,
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
					order_index INTEGER DEFAULT 0,
					days_threshold INTEGER DEFAULT 0,
					count_threshold INTEGER DEFAULT 0,
					threshold_type VARCHAR(20) DEFAULT 'orders', -- 'orders' or 'items'
					is_automatic BOOLEAN DEFAULT false,
					is_active BOOLEAN DEFAULT true
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

			// 40: Inventory Master and Movements
			await sql`
				CREATE TABLE IF NOT EXISTS inventory_items (
					id SERIAL PRIMARY KEY,
					ingredient TEXT UNIQUE NOT NULL,
					unit TEXT NOT NULL DEFAULT 'g',
					category VARCHAR(20) DEFAULT 'ingrediente',
					price INTEGER DEFAULT 0,
					pack_size INTEGER DEFAULT 0,
					updated_at TIMESTAMPTZ DEFAULT now()
				)
			`;
			await sql`
				CREATE TABLE IF NOT EXISTS inventory_movements (
					id SERIAL PRIMARY KEY,
					ingredient TEXT NOT NULL,
					kind TEXT NOT NULL, -- ingreso, ajuste, produccion
					qty NUMERIC NOT NULL,
					note TEXT,
					actor_name TEXT,
					metadata JSONB DEFAULT '{}'::jsonb,
					created_at TIMESTAMPTZ DEFAULT now()
				)
			`;

			// 41: Recipes System
			await sql`
				CREATE TABLE IF NOT EXISTS dessert_recipes (
					id SERIAL PRIMARY KEY,
					dessert TEXT NOT NULL,
					step_name TEXT NOT NULL,
					position INTEGER DEFAULT 0,
					produces_ingredient TEXT,
					produces_unit TEXT,
					created_at TIMESTAMPTZ DEFAULT now()
				)
			`;
			await sql`
				CREATE TABLE IF NOT EXISTS dessert_recipe_items (
					id SERIAL PRIMARY KEY,
					recipe_id INTEGER REFERENCES dessert_recipes(id) ON DELETE CASCADE,
					ingredient TEXT NOT NULL,
					unit TEXT NOT NULL DEFAULT 'g',
					qty_per_unit NUMERIC NOT NULL DEFAULT 0,
					price INTEGER DEFAULT 0,
					pack_size INTEGER DEFAULT 0,
					adjustment NUMERIC DEFAULT 0,
					position INTEGER DEFAULT 0
				)
			`;
			await sql`
				CREATE TABLE IF NOT EXISTS extras_items (
					id SERIAL PRIMARY KEY,
					ingredient TEXT NOT NULL,
					unit TEXT NOT NULL DEFAULT 'g',
					qty_per_unit NUMERIC NOT NULL DEFAULT 0,
					price INTEGER DEFAULT 0,
					pack_size INTEGER DEFAULT 0,
					position INTEGER DEFAULT 0
				)
			`;
			await sql`CREATE TABLE IF NOT EXISTS dessert_order (dessert TEXT PRIMARY KEY, position INTEGER)`;

			// 53: Accounting
			await sql`CREATE TABLE IF NOT EXISTS accounting_entries (
				id SERIAL PRIMARY KEY,
				kind TEXT NOT NULL,
				entry_date DATE NOT NULL,
				description TEXT NOT NULL DEFAULT '',
				amount_cents INTEGER NOT NULL DEFAULT 0,
				actor_name TEXT,
				created_at TIMESTAMPTZ DEFAULT now()
			)`;
			await sql`CREATE TABLE IF NOT EXISTS accounting_attachments (
				id SERIAL PRIMARY KEY,
				entry_id INTEGER NOT NULL REFERENCES accounting_entries(id) ON DELETE CASCADE,
				file_base64 TEXT NOT NULL,
				mime_type TEXT,
				file_name TEXT,
				created_at TIMESTAMPTZ DEFAULT now()
			)`;

			await sql`CREATE TABLE IF NOT EXISTS inventory_alias (
				id SERIAL PRIMARY KEY,
				alias TEXT NOT NULL,
				ingredient_name TEXT NOT NULL,
				vendor TEXT,
				created_at TIMESTAMPTZ DEFAULT now(),
				UNIQUE(alias, vendor)
			)`;

			await sql`CREATE TABLE IF NOT EXISTS inventory_conversions (
				id SERIAL PRIMARY KEY,
				ingredient_name TEXT UNIQUE NOT NULL,
				factor NUMERIC DEFAULT 1
			)`;
			
			await sql`CREATE TABLE IF NOT EXISTS production_logs (
				id SERIAL PRIMARY KEY,
				step_id INTEGER REFERENCES dessert_recipes(id) ON DELETE CASCADE,
				qty NUMERIC NOT NULL,
				duration_seconds INTEGER NOT NULL,
				actor_name TEXT,
				metadata JSONB DEFAULT '{}'::jsonb,
				created_at TIMESTAMPTZ DEFAULT now()
			)`;

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
					INSERT INTO crm_stages (name, color, order_index, is_automatic, days_threshold, count_threshold, threshold_type) VALUES 
					('Prospecto', '#94a3b8', 1, false, 0, 0, 'orders'),
					('Cliente nuevo', '#10b981', 2, true, 0, 1, 'orders'),
					('Cliente activo', '#3b82f6', 3, true, 30, 1, 'orders'),
					('Cliente frecuente', '#8b5cf6', 4, true, 30, 2, 'orders'),
					('VIP', '#eab308', 5, true, 30, 5, 'items'),
					('Inactivo', '#64748b', 6, true, 31, 0, 'orders'),
					('Riesgo', '#f59e0b', 7, true, 61, 0, 'orders'),
					('Perdido', '#ef4444', 8, true, 91, 0, 'orders')
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
				await sql`ALTER TABLE sale_days ADD COLUMN IF NOT EXISTS is_reviewed BOOLEAN NOT NULL DEFAULT false`;
				
				// CRM Stages new columns migration
				await sql`ALTER TABLE crm_stages ADD COLUMN IF NOT EXISTS order_index INTEGER DEFAULT 0`;
				await sql`ALTER TABLE crm_stages ADD COLUMN IF NOT EXISTS days_threshold INTEGER DEFAULT 0`;
				await sql`ALTER TABLE crm_stages ADD COLUMN IF NOT EXISTS count_threshold INTEGER DEFAULT 0`;
				await sql`ALTER TABLE crm_stages ADD COLUMN IF NOT EXISTS threshold_type VARCHAR(20) DEFAULT 'orders'`;
				await sql`ALTER TABLE crm_stages ADD COLUMN IF NOT EXISTS is_automatic BOOLEAN DEFAULT false`;
				await sql`ALTER TABLE crm_stages ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true`;
				await sql`ALTER TABLE clients ADD COLUMN IF NOT EXISTS last_dashboard_check TIMESTAMPTZ`;
				await sql`ALTER TABLE crm_tags ADD COLUMN IF NOT EXISTS display_order INTEGER DEFAULT 0`;
				if (Number(meta[0].version) < 48) {
					console.log('Migrating to v48: parent_id...');
					await sql`ALTER TABLE sellers ADD COLUMN IF NOT EXISTS parent_id INTEGER`;
					await sql`UPDATE schema_meta SET version = 48`;
				}

				if (Number(meta[0].version) < 49) {
					console.log('Migrating to v49: financial_snapshots...');
					await sql`
						CREATE TABLE IF NOT EXISTS financial_snapshots (
							month TEXT PRIMARY KEY,
							data JSONB NOT NULL,
							calculated_at TIMESTAMPTZ DEFAULT now()
						)
					`;
					await sql`UPDATE schema_meta SET version = 49`;
				}

				// Dynamic columns (keep them fast)
				await sql`ALTER TABLE sellers ADD COLUMN IF NOT EXISTS whatsapp TEXT`;
				await sql`ALTER TABLE sellers ADD COLUMN IF NOT EXISTS game_enabled BOOLEAN DEFAULT TRUE`;

				// Migration 39: Activate automation for existing stages by name
				const autoStages = [
					{ name: 'VIP', color: '#eab308', order_index: 1, is_automatic: true, days_threshold: 30, count_threshold: 5, threshold_type: 'items' },
					{ name: 'Cliente frecuente', color: '#8b5cf6', order_index: 2, is_automatic: true, days_threshold: 30, count_threshold: 2, threshold_type: 'orders' },
					{ name: 'Cliente activo', color: '#3b82f6', order_index: 3, is_automatic: true, days_threshold: 30, count_threshold: 1, threshold_type: 'orders' },
					{ name: 'Cliente nuevo', color: '#10b981', order_index: 4, is_automatic: true, days_threshold: 0, count_threshold: 1, threshold_type: 'orders' },
					{ name: 'Inactivo', color: '#64748b', order_index: 5, is_automatic: true, days_threshold: 31, count_threshold: 0, threshold_type: 'orders' },
					{ name: 'Riesgo', color: '#f59e0b', order_index: 6, is_automatic: true, days_threshold: 61, count_threshold: 0, threshold_type: 'orders' },
					{ name: 'Perdido', color: '#ef4444', order_index: 7, is_automatic: true, days_threshold: 91, count_threshold: 0, threshold_type: 'orders' },
					{ name: 'Prospecto', color: '#94a3b8', order_index: 8, is_automatic: false, days_threshold: 0, count_threshold: 0, threshold_type: 'orders' }
				];
				for (const s of autoStages) {
					await sql`
						UPDATE crm_stages SET 
							is_automatic = ${s.is_automatic},
							days_threshold = ${s.days_threshold},
							count_threshold = ${s.count_threshold},
							threshold_type = ${s.threshold_type},
							order_index = ${s.order_index}
						WHERE name ILIKE ${s.name} OR name ILIKE ${s.name + '%'}
					`;
				}
			} catch (mErr) { console.error('Migration error for dynamic columns:', mErr); }

			// Migration 47: Definitive sweep for historical prices (April 13th and earlier)
			try {
				const dList = await sql`SELECT id, short_code FROM desserts`;
				const dMap = {}; dList.forEach(d => dMap[d.short_code] = d.id);
				const histMap = { arco: 8500, melo: 9500, mara: 10500, oreo: 10500, nute: 13000 };
				const nuteId = dMap['nute'];

				if (nuteId) {
					// 1. Force-migrate legacy column sales on or before April 13th
					const legacyToMigrate = await sql`
						SELECT s.id, s.qty_arco, s.qty_melo, s.qty_mara, s.qty_oreo, s.qty_nute 
						FROM sales s
						JOIN sale_days sd ON sd.id = s.sale_day_id
						WHERE sd.day <= '2026-04-13'
						  AND (s.qty_arco > 0 OR s.qty_melo > 0 OR s.qty_mara > 0 OR s.qty_oreo > 0 OR s.qty_nute > 0)
						  AND NOT EXISTS (SELECT 1 FROM sale_items si WHERE si.sale_id = s.id)
					`;

					if (legacyToMigrate.length > 0) {
						console.log(`DATABASE FIX 47: Migrating ${legacyToMigrate.length} legacy rows with historical $13k Nute price.`);
						for (const s of legacyToMigrate) {
							for (const k of ['arco', 'melo', 'mara', 'oreo', 'nute']) {
								const q = Number(s[`qty_${k}`] || 0);
								if (q > 0 && dMap[k]) {
									await sql`INSERT INTO sale_items (sale_id, dessert_id, quantity, unit_price) VALUES (${s.id}, ${dMap[k]}, ${q}, ${histMap[k]})`;
								}
							}
							await sql`UPDATE sales SET qty_arco=0, qty_melo=0, qty_mara=0, qty_oreo=0, qty_nute=0 WHERE id=${s.id}`;
							await recalcTotalForId(s.id);
						}
					}

					// 2. Correct any sale_items already created with 14000 on or before April 13th
					const wrongPriceItems = await sql`
						SELECT si.id, si.sale_id 
						FROM sale_items si
						JOIN sales s ON s.id = si.sale_id
						JOIN sale_days sd ON sd.id = s.sale_day_id
						WHERE si.dessert_id = ${nuteId} 
						  AND si.unit_price = 14000 
						  AND sd.day <= '2026-04-13'
					`;
					
					if (wrongPriceItems.length > 0) {
						console.log(`DATABASE FIX 47: Correcting ${wrongPriceItems.length} items from $14k to $13k.`);
						const sids = [...new Set(wrongPriceItems.map(i => i.sale_id))];
						await sql`UPDATE sale_items SET unit_price = 13000 WHERE id = ANY(${wrongPriceItems.map(i => i.id)})`;
						for (const sid of sids) {
							await recalcTotalForId(sid);
						}
					}
				}
			} catch (err) { console.error('Migration 47 error:', err); }

				if (Number(meta[0].version) < 50) {
					console.log('Migrating to v50: Unified Inventory schema...');
					
					// 1. Ensure inventory_items columns
					await sql`ALTER TABLE inventory_items ADD COLUMN IF NOT EXISTS category VARCHAR(20) DEFAULT 'ingrediente'`;
					await sql`ALTER TABLE inventory_items ADD COLUMN IF NOT EXISTS price INTEGER DEFAULT 0`;
					await sql`ALTER TABLE inventory_items ADD COLUMN IF NOT EXISTS pack_size INTEGER DEFAULT 0`;
					await sql`ALTER TABLE inventory_items ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now()`;

					// 2. Populate from recipes (Max price found)
					await sql`
						WITH recipe_prices AS (
							SELECT lower(trim(ingredient)) as ing, MAX(price) as max_p, MAX(pack_size) as max_pk
							FROM dessert_recipe_items
							GROUP BY lower(trim(ingredient))
						)
						UPDATE inventory_items ii
						SET price = COALESCE(rp.max_p, ii.price),
							pack_size = COALESCE(rp.max_pk, ii.pack_size),
							category = 'ingrediente'
						FROM recipe_prices rp
						WHERE lower(trim(ii.ingredient)) = rp.ing
					`;

					// 3. Populate from extras (Categorize as 'empaque' by default for extras, as they usually are)
					await sql`
						WITH extra_prices AS (
							SELECT lower(trim(ingredient)) as ing, MAX(price) as max_p, MAX(pack_size) as max_pk
							FROM extras_items
							GROUP BY lower(trim(ingredient))
						)
						UPDATE inventory_items ii
						SET price = COALESCE(ep.max_p, ii.price),
							pack_size = COALESCE(ep.max_pk, ii.pack_size),
							category = 'empaque'
						FROM extra_prices ep
						WHERE lower(trim(ii.ingredient)) = ep.ing
					`;

					// 4. Upsert any missing ingredients that are in recipes but not in inventory_items
					await sql`
						INSERT INTO inventory_items (ingredient, unit, price, pack_size, category)
						SELECT DISTINCT ON (lower(trim(ingredient))) ingredient, unit, price, pack_size, 'ingrediente'
						FROM dessert_recipe_items
						ORDER BY lower(trim(ingredient))
						ON CONFLICT (ingredient) DO NOTHING
					`;
					await sql`
						INSERT INTO inventory_items (ingredient, unit, price, pack_size, category)
						SELECT DISTINCT ON (lower(trim(ingredient))) ingredient, unit, price, pack_size, 'empaque'
						FROM extras_items
						ORDER BY lower(trim(ingredient))
						ON CONFLICT (ingredient) DO NOTHING
					`;

					await sql`UPDATE schema_meta SET version = 50`;
				}

				if (Number(meta[0].version) < 51) {
					console.log('Migrating to v51: Allowing decimals in inventory prices...');
					await sql`ALTER TABLE inventory_items ALTER COLUMN price TYPE NUMERIC(12,2)`;
					await sql`ALTER TABLE inventory_items ALTER COLUMN pack_size TYPE NUMERIC(12,2)`;
					await sql`ALTER TABLE dessert_recipe_items ALTER COLUMN price TYPE NUMERIC(12,2)`;
					await sql`ALTER TABLE dessert_recipe_items ALTER COLUMN pack_size TYPE NUMERIC(12,2)`;
					await sql`ALTER TABLE extras_items ALTER COLUMN price TYPE NUMERIC(12,2)`;
					await sql`ALTER TABLE extras_items ALTER COLUMN pack_size TYPE NUMERIC(12,2)`;
					await sql`ALTER TABLE desserts ALTER COLUMN cost_price TYPE NUMERIC(12,2)`;
					await sql`UPDATE schema_meta SET version = 51`;
				}

				if (Number(meta[0].version) < 52) {
					console.log('Migrating to v52: Moving global extras to per-dessert recipes...');
					const desserts = await sql`SELECT DISTINCT name FROM desserts`;
					const extras = await sql`SELECT * FROM extras_items`;
					
					for (const d of desserts) {
						if (!d.name) continue;
						// Create 'Empaque' step for this dessert 
						const [step] = await sql`
							INSERT INTO dessert_recipes (dessert, step_name, position)
							VALUES (${d.name}, 'Empaque', 99)
							RETURNING id
						`;
						// Copy all extras to this step
						for (const ex of extras) {
							await sql`
								INSERT INTO dessert_recipe_items (recipe_id, ingredient, unit, qty_per_unit, position)
								VALUES (${step.id}, ${ex.ingredient}, ${ex.unit}, ${ex.qty_per_unit}, ${ex.position})
							`;
						}
					}
					await sql`UPDATE schema_meta SET version = 52`;
				}

				if (Number(meta[0].version) < 53) {
					console.log('Migrating to v53: Creating inventory_conversions table...');
					await sql`
						CREATE TABLE IF NOT EXISTS inventory_conversions (
							id SERIAL PRIMARY KEY,
							ingredient_name TEXT UNIQUE NOT NULL,
							factor NUMERIC DEFAULT 1
						)
					`;
					await sql`UPDATE schema_meta SET version = 53`;
				}
				
				if (Number(meta[0].version) < 54) {
					console.log('Migrating to v54: Adding production output columns to dessert_recipes...');
					await sql`ALTER TABLE dessert_recipes ADD COLUMN IF NOT EXISTS produces_ingredient TEXT`;
					await sql`ALTER TABLE dessert_recipes ADD COLUMN IF NOT EXISTS produces_unit TEXT`;
					await sql`UPDATE schema_meta SET version = 54`;
				}

				if (Number(meta[0].version) < 55) {
					console.log('Migrating to v55: Creating production_logs table...');
					await sql`
						CREATE TABLE IF NOT EXISTS production_logs (
							id SERIAL PRIMARY KEY,
							step_id INTEGER REFERENCES dessert_recipes(id) ON DELETE CASCADE,
							qty NUMERIC NOT NULL,
							duration_seconds INTEGER NOT NULL,
							actor_name TEXT,
							metadata JSONB DEFAULT '{}'::jsonb,
							created_at TIMESTAMPTZ DEFAULT now()
						)
					`;
					await sql`UPDATE schema_meta SET version = 55`;
				}

				if (Number(meta[0].version) < 56) {
					console.log('Migrating to v56: Adding position to sellers...');
					await sql`ALTER TABLE sellers ADD COLUMN IF NOT EXISTS position INTEGER DEFAULT 0`;
					await sql`UPDATE schema_meta SET version = 56`;
				}

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

	const allItems = await sql`SELECT id, dessert_id, quantity, unit_price FROM sale_items WHERE sale_id = ${id}`;
	const hasItems = Array.isArray(allItems) && allItems.length > 0;

	let row;
	if (hasItems) {
		if (specialPricing) {
			for (const item of allItems) {
				const dessert = dessertsById[item.dessert_id];
				const newPrice = dessert ? getDessertUnitPriceForSpecialPricing(dessert, specialPricing) : 0;
				await sql`UPDATE sale_items SET unit_price = ${newPrice} WHERE id = ${item.id}`;
				item.unit_price = newPrice;
			}
		}

		let total = 0;
		for (const item of allItems) {
			const d = dessertsById[item.dessert_id];
			if (!d) continue;

			const qty = Number(item.quantity || 0);
			if (qty <= 0) continue;

			if (specialPricing) {
				total += qty * Number(item.unit_price || 0);
			} else {
				// Si no hay precio especial, verificar si el unit_price en BD es personalizado (manual)
				const isCustomPrice = Number(item.unit_price || 0) !== Number(d.sale_price || 0);
				if (isCustomPrice) {
					total += qty * Number(item.unit_price || 0);
				} else {
					total += getDessertLineTotalForPricing(d, qty, specialPricing);
				}
			}
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
	if (low.includes('bolsa') && low.includes('cuchara')) return 'Bolsa cuchara';
	return raw;
}

export function normalizeClientName(name) {
	if (!name) return '';
	// Replace NBSP (\u00A0) and all other whitespace with standard space, collapse multiple spaces, and trim
	return name.toString().replace(/\s+/g, ' ').trim();
}

export async function ensureInventoryItem(ingredient, unit = 'g') {
	await ensureSchema();
	const name = canonicalizeIngredientName(ingredient);
	if (!name) return null;
	const [row] = await sql`
		INSERT INTO inventory_items (ingredient, unit) VALUES (${name}, ${unit})
		ON CONFLICT (ingredient) DO UPDATE SET unit = EXCLUDED.unit, updated_at = now()
		RETURNING id, ingredient, unit, category, price, pack_size
	`;
	return row;
}

export async function recalculateAllDessertCosts() {
	await ensureSchema();
	const materials = await sql`SELECT lower(trim(ingredient)) as ing, price FROM inventory_items`;
	const pricesMap = new Map();
	materials.forEach(m => pricesMap.set(m.ing, Number(m.price || 0)));

	const dessertsList = await sql`SELECT id, name, short_code FROM desserts`;
	const recipes = await sql`SELECT id, dessert FROM dessert_recipes`;
	const items = await sql`SELECT recipe_id, lower(trim(ingredient)) as ing, qty_per_unit FROM dessert_recipe_items`;

	for (const d of dessertsList) {
		let total = 0;
		const dSteps = recipes.filter(r => {
			if (!r.dessert) return false;
			return r.dessert.toLowerCase() === d.name.toLowerCase() || r.dessert.toLowerCase() === d.short_code.toLowerCase();
		});
		const stepIds = dSteps.map(s => s.id);
		const dItems = items.filter(i => stepIds.includes(i.recipe_id));
		for (const it of dItems) {
			const p = pricesMap.get(it.ing) || 0;
			total += (p * Number(it.qty_per_unit || 0));
		}
		await sql`UPDATE desserts SET cost_price = ${total}, updated_at = now() WHERE id = ${d.id}`;
	}
	console.log('All dessert cost_prices recalculated.');
}

/**
 * Calcula y actualiza el Precio Medio Ponderado (PMP) tras una compra.
 * Formula: (Saldo Actual * Precio Actual + Cantidad Nueva * Precio Nuevo) / (Saldo Actual + Cantidad Nueva)
 */
export async function updateIngredientPMP(ingredientName, newQty, newUnitPrice) {
	await ensureSchema();
	const name = canonicalizeIngredientName(ingredientName);
	if (!name) return null;

	// 1. Obtener precio actual y saldo actual
	const [item] = await sql`SELECT price FROM inventory_items WHERE lower(trim(ingredient)) = lower(trim(${name}))`;
	const [movs] = await sql`SELECT SUM(qty)::numeric as balance FROM inventory_movements WHERE lower(trim(ingredient)) = lower(trim(${name}))`;
	
	const currentPrice = Number(item?.price || 0);
	const currentBalance = Math.max(0, Number(movs?.balance || 0)); // No promediamos saldos negativos previos

	const totalValue = (currentBalance * currentPrice) + (newQty * newUnitPrice);
	const totalQty = currentBalance + newQty;

	const newPMP = totalQty > 0 ? (totalValue / totalQty) : newUnitPrice;

	// 2. Actualizar inventory_items
	await sql`UPDATE inventory_items SET price = ${newPMP}, updated_at = now() WHERE lower(trim(ingredient)) = lower(trim(${name}))`;

	// 3. Recalcular costos de postres
	await recalculateAllDessertCosts();

	return newPMP;
}

export { sql };