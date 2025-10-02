import { neon } from '@netlify/neon';

const sql = neon(); // uses NETLIFY_DATABASE_URL
let schemaEnsured = false;
const SCHEMA_VERSION = 3; // Bump when schema changes require a migration

export async function ensureSchema() {
	if (schemaEnsured) return;

	// Lightweight schema gating: skip heavy DDL if already migrated
	// 1) Ensure schema_meta table exists (very cheap, only on cold start)
	await sql`CREATE TABLE IF NOT EXISTS schema_meta (
		version INTEGER NOT NULL DEFAULT 0,
		updated_at TIMESTAMPTZ DEFAULT now()
	)`;
	// 2) Ensure a single row exists
	await sql`INSERT INTO schema_meta (version)
		SELECT 0
		WHERE NOT EXISTS (SELECT 1 FROM schema_meta)`;
	// 3) Read current version and short-circuit if up to date
	const cur = await sql`SELECT version FROM schema_meta LIMIT 1`;
	const currentVersion = Number(cur?.[0]?.version || 0);
	if (currentVersion >= SCHEMA_VERSION) { schemaEnsured = true; return; }
	// Basic users table for authentication
	await sql`CREATE TABLE IF NOT EXISTS users (
		id SERIAL PRIMARY KEY,
		username TEXT UNIQUE NOT NULL,
		password_hash TEXT NOT NULL,
		role TEXT NOT NULL DEFAULT 'user',
		created_at TIMESTAMPTZ DEFAULT now()
	)`;
	await sql`CREATE TABLE IF NOT EXISTS sellers (
		id SERIAL PRIMARY KEY,
		name TEXT UNIQUE NOT NULL,
		bill_color TEXT,
		archived_at TIMESTAMPTZ,
		created_at TIMESTAMPTZ DEFAULT now()
	)`;
	// Ensure bill_color exists for older deployments
	await sql`DO $$ BEGIN
		IF NOT EXISTS (
			SELECT 1 FROM information_schema.columns
			WHERE table_name = 'sellers' AND column_name = 'bill_color'
		) THEN
			ALTER TABLE sellers ADD COLUMN bill_color TEXT;
		END IF;
		IF NOT EXISTS (
			SELECT 1 FROM information_schema.columns
			WHERE table_name = 'sellers' AND column_name = 'archived_at'
		) THEN
			ALTER TABLE sellers ADD COLUMN archived_at TIMESTAMPTZ;
		END IF;
	END $$;`;
	// Delegated view permissions: which users can view which sellers
	await sql`CREATE TABLE IF NOT EXISTS user_view_permissions (
		id SERIAL PRIMARY KEY,
		viewer_username TEXT NOT NULL,
		seller_id INTEGER NOT NULL REFERENCES sellers(id) ON DELETE CASCADE,
		created_at TIMESTAMPTZ DEFAULT now(),
		UNIQUE (viewer_username, seller_id)
	)`;
	// Feature permissions: grant specific features to users (e.g., 'reports')
	await sql`CREATE TABLE IF NOT EXISTS user_feature_permissions (
		id SERIAL PRIMARY KEY,
		username TEXT NOT NULL,
		feature TEXT NOT NULL,
		created_at TIMESTAMPTZ DEFAULT now(),
		UNIQUE (username, feature)
	)`;
	await sql`CREATE TABLE IF NOT EXISTS sale_days (
		id SERIAL PRIMARY KEY,
		seller_id INTEGER NOT NULL REFERENCES sellers(id) ON DELETE CASCADE,
		day DATE NOT NULL,
		is_archived BOOLEAN NOT NULL DEFAULT false,
		UNIQUE (seller_id, day)
	)`;
	// Ensure delivered columns and is_archived exist for older deployments
	await sql`DO $$ BEGIN
		IF NOT EXISTS (
			SELECT 1 FROM information_schema.columns
			WHERE table_name = 'sale_days' AND column_name = 'delivered_arco'
		) THEN
			ALTER TABLE sale_days ADD COLUMN delivered_arco INTEGER NOT NULL DEFAULT 0;
		END IF;
		IF NOT EXISTS (
			SELECT 1 FROM information_schema.columns
			WHERE table_name = 'sale_days' AND column_name = 'delivered_melo'
		) THEN
			ALTER TABLE sale_days ADD COLUMN delivered_melo INTEGER NOT NULL DEFAULT 0;
		END IF;
		IF NOT EXISTS (
			SELECT 1 FROM information_schema.columns
			WHERE table_name = 'sale_days' AND column_name = 'delivered_mara'
		) THEN
			ALTER TABLE sale_days ADD COLUMN delivered_mara INTEGER NOT NULL DEFAULT 0;
		END IF;
		IF NOT EXISTS (
			SELECT 1 FROM information_schema.columns
			WHERE table_name = 'sale_days' AND column_name = 'delivered_oreo'
		) THEN
			ALTER TABLE sale_days ADD COLUMN delivered_oreo INTEGER NOT NULL DEFAULT 0;
		END IF;
		IF NOT EXISTS (
			SELECT 1 FROM information_schema.columns
			WHERE table_name = 'sale_days' AND column_name = 'delivered_nute'
		) THEN
			ALTER TABLE sale_days ADD COLUMN delivered_nute INTEGER NOT NULL DEFAULT 0;
		END IF;
		IF NOT EXISTS (
			SELECT 1 FROM information_schema.columns
			WHERE table_name = 'sale_days' AND column_name = 'is_archived'
		) THEN
			ALTER TABLE sale_days ADD COLUMN is_archived BOOLEAN NOT NULL DEFAULT false;
		END IF;
	END $$;`;
	await sql`CREATE TABLE IF NOT EXISTS sales (
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
		comment_text TEXT DEFAULT '',
		total_cents INTEGER NOT NULL DEFAULT 0,
		created_at TIMESTAMPTZ DEFAULT now()
	)`;
	// Ensure columns exist for older deployments
	await sql`DO $$ BEGIN
		IF NOT EXISTS (
			SELECT 1 FROM information_schema.columns
			WHERE table_name = 'sales' AND column_name = 'sale_day_id'
		) THEN
			ALTER TABLE sales ADD COLUMN sale_day_id INTEGER REFERENCES sale_days(id) ON DELETE CASCADE;
		END IF;
		IF NOT EXISTS (
			SELECT 1 FROM information_schema.columns
			WHERE table_name = 'sales' AND column_name = 'is_paid'
		) THEN
			ALTER TABLE sales ADD COLUMN is_paid BOOLEAN NOT NULL DEFAULT false;
		END IF;
		IF NOT EXISTS (
			SELECT 1 FROM information_schema.columns
			WHERE table_name = 'sales' AND column_name = 'pay_method'
		) THEN
			ALTER TABLE sales ADD COLUMN pay_method TEXT;
		END IF;
		IF NOT EXISTS (
			SELECT 1 FROM information_schema.columns
			WHERE table_name = 'sales' AND column_name = 'comment_text'
		) THEN
			ALTER TABLE sales ADD COLUMN comment_text TEXT DEFAULT '';
		END IF;
		IF NOT EXISTS (
			SELECT 1 FROM information_schema.columns
			WHERE table_name = 'sales' AND column_name = 'qty_nute'
		) THEN
			ALTER TABLE sales ADD COLUMN qty_nute INTEGER NOT NULL DEFAULT 0;
		END IF;
	END $$;`;
	await sql`CREATE TABLE IF NOT EXISTS change_logs (
		id SERIAL PRIMARY KEY,
		sale_id INTEGER NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
		field TEXT NOT NULL,
		old_value TEXT,
		new_value TEXT,
		user_name TEXT,
		created_at TIMESTAMPTZ DEFAULT now()
	)`;
	// Optional receipt storage (base64) per sale
	await sql`CREATE TABLE IF NOT EXISTS sale_receipts (
		id SERIAL PRIMARY KEY,
		sale_id INTEGER NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
		image_base64 TEXT NOT NULL,
		note_text TEXT DEFAULT '',
		created_at TIMESTAMPTZ DEFAULT now()
	)`;
	// Ensure note_text column exists on older deployments
	await sql`DO $$ BEGIN
		IF NOT EXISTS (
			SELECT 1 FROM information_schema.columns
			WHERE table_name = 'sale_receipts' AND column_name = 'note_text'
		) THEN
			ALTER TABLE sale_receipts ADD COLUMN note_text TEXT DEFAULT '';
		END IF;
	END $$;`;
	await sql`CREATE TABLE IF NOT EXISTS notifications (
		id SERIAL PRIMARY KEY,
		type TEXT NOT NULL,
		seller_id INTEGER REFERENCES sellers(id) ON DELETE SET NULL,
		sale_id INTEGER REFERENCES sales(id) ON DELETE SET NULL,
		sale_day_id INTEGER REFERENCES sale_days(id) ON DELETE SET NULL,
		message TEXT NOT NULL,
		actor_name TEXT,
		icon_url TEXT,
		pay_method TEXT,
		created_at TIMESTAMPTZ DEFAULT now(),
		read_at TIMESTAMPTZ
	)`;
	// Ensure optional columns exist for older deployments
	await sql`DO $$ BEGIN
		IF NOT EXISTS (
			SELECT 1 FROM information_schema.columns
			WHERE table_name = 'notifications' AND column_name = 'icon_url'
		) THEN
			ALTER TABLE notifications ADD COLUMN icon_url TEXT;
		END IF;
		IF NOT EXISTS (
			SELECT 1 FROM information_schema.columns
			WHERE table_name = 'notifications' AND column_name = 'pay_method'
		) THEN
			ALTER TABLE notifications ADD COLUMN pay_method TEXT;
		END IF;
	END $$;`;
	// Accounting: ingresos/gastos ledger
	await sql`CREATE TABLE IF NOT EXISTS accounting_entries (
		id SERIAL PRIMARY KEY,
		kind TEXT NOT NULL, -- 'gasto' | 'ingreso'
		entry_date DATE NOT NULL,
		description TEXT NOT NULL DEFAULT '',
		amount_cents INTEGER NOT NULL DEFAULT 0,
		actor_name TEXT,
		created_at TIMESTAMPTZ DEFAULT now()
	)`;
	// Optional: attachments per accounting entry (image or file as base64)
	await sql`CREATE TABLE IF NOT EXISTS accounting_attachments (
		id SERIAL PRIMARY KEY,
		entry_id INTEGER NOT NULL REFERENCES accounting_entries(id) ON DELETE CASCADE,
		file_base64 TEXT NOT NULL,
		mime_type TEXT,
		file_name TEXT,
		created_at TIMESTAMPTZ DEFAULT now()
	)`;
	// Ensure columns exist for older deployments
	await sql`DO $$ BEGIN
		IF NOT EXISTS (
			SELECT 1 FROM information_schema.columns
			WHERE table_name = 'accounting_entries' AND column_name = 'actor_name'
		) THEN
			ALTER TABLE accounting_entries ADD COLUMN actor_name TEXT;
		END IF;
		IF NOT EXISTS (
			SELECT 1 FROM information_schema.columns
			WHERE table_name = 'accounting_entries' AND column_name = 'kind'
		) THEN
			ALTER TABLE accounting_entries ADD COLUMN kind TEXT NOT NULL DEFAULT 'gasto';
		END IF;
		IF NOT EXISTS (
			SELECT 1 FROM information_schema.columns
			WHERE table_name = 'accounting_entries' AND column_name = 'entry_date'
		) THEN
			ALTER TABLE accounting_entries ADD COLUMN entry_date DATE NOT NULL DEFAULT now();
		END IF;
		IF NOT EXISTS (
			SELECT 1 FROM information_schema.columns
			WHERE table_name = 'accounting_entries' AND column_name = 'description'
		) THEN
			ALTER TABLE accounting_entries ADD COLUMN description TEXT NOT NULL DEFAULT '';
		END IF;
		IF NOT EXISTS (
			SELECT 1 FROM information_schema.columns
			WHERE table_name = 'accounting_entries' AND column_name = 'amount_cents'
		) THEN
			ALTER TABLE accounting_entries ADD COLUMN amount_cents INTEGER NOT NULL DEFAULT 0;
		END IF;
	END $$;`;
	// Materials: per-flavor ingredient formulas
	await sql`CREATE TABLE IF NOT EXISTS ingredient_formulas (
		id SERIAL PRIMARY KEY,
		ingredient TEXT UNIQUE NOT NULL,
		unit TEXT NOT NULL DEFAULT 'g',
		per_arco NUMERIC NOT NULL DEFAULT 0,
		per_melo NUMERIC NOT NULL DEFAULT 0,
		per_mara NUMERIC NOT NULL DEFAULT 0,
		per_oreo NUMERIC NOT NULL DEFAULT 0,
		per_nute NUMERIC NOT NULL DEFAULT 0,
		created_at TIMESTAMPTZ DEFAULT now(),
		updated_at TIMESTAMPTZ DEFAULT now()
	)`;
	// Ensure all per_* columns exist for older deployments
	await sql`DO $$ BEGIN
		IF NOT EXISTS (
			SELECT 1 FROM information_schema.columns
			WHERE table_name = 'ingredient_formulas' AND column_name = 'per_nute'
		) THEN
			ALTER TABLE ingredient_formulas ADD COLUMN per_nute NUMERIC NOT NULL DEFAULT 0;
		END IF;
		IF NOT EXISTS (
			SELECT 1 FROM information_schema.columns
			WHERE table_name = 'ingredient_formulas' AND column_name = 'unit'
		) THEN
			ALTER TABLE ingredient_formulas ADD COLUMN unit TEXT NOT NULL DEFAULT 'g';
		END IF;
	END $$;`;

	// Recipes schema: steps and items per dessert + global extras
	await sql`CREATE TABLE IF NOT EXISTS dessert_recipes (
		id SERIAL PRIMARY KEY,
		dessert TEXT NOT NULL,
		step_name TEXT,
		position INTEGER NOT NULL DEFAULT 0,
		created_at TIMESTAMPTZ DEFAULT now(),
		updated_at TIMESTAMPTZ DEFAULT now()
	)`;
	// Optional: explicit dessert ordering table
	await sql`CREATE TABLE IF NOT EXISTS dessert_order (
		dessert TEXT PRIMARY KEY,
		position INTEGER NOT NULL DEFAULT 0,
		updated_at TIMESTAMPTZ DEFAULT now()
	)`;
	await sql`CREATE TABLE IF NOT EXISTS dessert_recipe_items (
		id SERIAL PRIMARY KEY,
		recipe_id INTEGER NOT NULL REFERENCES dessert_recipes(id) ON DELETE CASCADE,
		ingredient TEXT NOT NULL,
		unit TEXT NOT NULL DEFAULT 'g',
		qty_per_unit NUMERIC NOT NULL DEFAULT 0,
		adjustment NUMERIC NOT NULL DEFAULT 0,
		price NUMERIC NOT NULL DEFAULT 0,
	pack_size NUMERIC NOT NULL DEFAULT 0,
		position INTEGER NOT NULL DEFAULT 0,
		created_at TIMESTAMPTZ DEFAULT now(),
		updated_at TIMESTAMPTZ DEFAULT now()
	)`;
	// Ensure new numeric columns exist for older deployments
	await sql`DO $$ BEGIN
		IF NOT EXISTS (
			SELECT 1 FROM information_schema.columns
			WHERE table_name = 'dessert_recipe_items' AND column_name = 'adjustment'
		) THEN
			ALTER TABLE dessert_recipe_items ADD COLUMN adjustment NUMERIC NOT NULL DEFAULT 0;
		END IF;
		IF NOT EXISTS (
			SELECT 1 FROM information_schema.columns
			WHERE table_name = 'dessert_recipe_items' AND column_name = 'price'
		) THEN
			ALTER TABLE dessert_recipe_items ADD COLUMN price NUMERIC NOT NULL DEFAULT 0;
		END IF;
	IF NOT EXISTS (
		SELECT 1 FROM information_schema.columns
		WHERE table_name = 'dessert_recipe_items' AND column_name = 'pack_size'
	) THEN
		ALTER TABLE dessert_recipe_items ADD COLUMN pack_size NUMERIC NOT NULL DEFAULT 0;
	END IF;
	END $$;`;
await sql`CREATE TABLE IF NOT EXISTS extras_items (
		id SERIAL PRIMARY KEY,
		ingredient TEXT NOT NULL,
		unit TEXT NOT NULL DEFAULT 'g',
		qty_per_unit NUMERIC NOT NULL DEFAULT 0,
	price NUMERIC NOT NULL DEFAULT 0,
	pack_size NUMERIC NOT NULL DEFAULT 0,
		position INTEGER NOT NULL DEFAULT 0,
		created_at TIMESTAMPTZ DEFAULT now(),
		updated_at TIMESTAMPTZ DEFAULT now()
	)`;
// Ensure new numeric columns exist for older deployments (extras price)
await sql`DO $$ BEGIN
	IF NOT EXISTS (
		SELECT 1 FROM information_schema.columns
		WHERE table_name = 'extras_items' AND column_name = 'price'
	) THEN
		ALTER TABLE extras_items ADD COLUMN price NUMERIC NOT NULL DEFAULT 0;
	END IF;
END $$;`;
// Ensure extras pack_size
await sql`DO $$ BEGIN
	IF NOT EXISTS (
		SELECT 1 FROM information_schema.columns
		WHERE table_name = 'extras_items' AND column_name = 'pack_size'
	) THEN
		ALTER TABLE extras_items ADD COLUMN pack_size NUMERIC NOT NULL DEFAULT 0;
	END IF;
END $$;`;
	// Inventory: master items and movements ledger
	await sql`CREATE TABLE IF NOT EXISTS inventory_items (
		id SERIAL PRIMARY KEY,
		ingredient TEXT UNIQUE NOT NULL,
		unit TEXT NOT NULL DEFAULT 'g',
		created_at TIMESTAMPTZ DEFAULT now(),
		updated_at TIMESTAMPTZ DEFAULT now()
	)`;
	await sql`DO $$ BEGIN
		IF NOT EXISTS (
			SELECT 1 FROM information_schema.columns
			WHERE table_name = 'inventory_items' AND column_name = 'unit'
		) THEN
			ALTER TABLE inventory_items ADD COLUMN unit TEXT NOT NULL DEFAULT 'g';
		END IF;
	END $$;`;
	await sql`CREATE TABLE IF NOT EXISTS inventory_movements (
		id SERIAL PRIMARY KEY,
		ingredient TEXT NOT NULL,
		kind TEXT NOT NULL,
		qty NUMERIC NOT NULL,
		note TEXT DEFAULT '',
		actor_name TEXT,
		metadata JSONB DEFAULT '{}'::jsonb,
		created_at TIMESTAMPTZ DEFAULT now()
	)`;
	// Time sessions for production timings per dessert
	await sql`CREATE TABLE IF NOT EXISTS time_sessions (
		id SERIAL PRIMARY KEY,
		dessert TEXT NOT NULL,
		steps JSONB NOT NULL,
		total_elapsed_ms INTEGER NOT NULL DEFAULT 0,
		actor_name TEXT,
		created_at TIMESTAMPTZ DEFAULT now()
	)`;
	// Seed default users if table is empty
	const existing = await sql`SELECT COUNT(*)::int AS c FROM users`;
	if ((existing[0]?.c || 0) === 0) {
		// Default simple passwords; in production you'd hash. Here we store as plain for simplicity in this demo.
		await sql`INSERT INTO users (username, password_hash, role) VALUES ('jorge', 'Jorge123', 'superadmin') ON CONFLICT (username) DO NOTHING`;
		await sql`INSERT INTO users (username, password_hash, role) VALUES ('marcela', 'marcelasweet', 'admin') ON CONFLICT (username) DO NOTHING`;
		await sql`INSERT INTO users (username, password_hash, role) VALUES ('aleja', 'alejasweet', 'admin') ON CONFLICT (username) DO NOTHING`;
	}
	// Ensure Marcela has a default yellow bill color if seller exists and not set
	await sql`UPDATE sellers SET bill_color=${'#fdd835'} WHERE lower(name)='marcela' AND (bill_color IS NULL OR bill_color='')`;
	// 4) Persist target schema version so future requests short-circuit
	await sql`UPDATE schema_meta SET version=${SCHEMA_VERSION}, updated_at=now()`;
	schemaEnsured = true;
}

export function prices() {
	return { arco: 8500, melo: 9500, mara: 10500, oreo: 10500, nute: 13000 };
}

export async function recalcTotalForId(id) {
	const p = prices();
	const [row] = await sql`
		UPDATE sales SET total_cents = qty_arco * ${p.arco} + qty_melo * ${p.melo} + qty_mara * ${p.mara} + qty_oreo * ${p.oreo} + qty_nute * ${p.nute}
		WHERE id = ${id}
		RETURNING *
	`;
	return row;
}

export async function getOrCreateDayId(sellerId, day) {
	const d = day; // ISO date string 'YYYY-MM-DD'
	const rows = await sql`SELECT id FROM sale_days WHERE seller_id=${sellerId} AND day=${d}`;
	if (rows.length) return rows[0].id;
	const [created] = await sql`INSERT INTO sale_days (seller_id, day) VALUES (${sellerId}, ${d}) RETURNING id`;
	return created.id;
}

export async function notify({ type, sellerId = null, saleId = null, saleDayId = null, message = '', actorName = '', iconUrl = null, payMethod = null }) {
	await ensureSchema();
	await sql`INSERT INTO notifications (type, seller_id, sale_id, sale_day_id, message, actor_name, icon_url, pay_method) VALUES (${type}, ${sellerId}, ${saleId}, ${saleDayId}, ${message}, ${actorName}, ${iconUrl}, ${payMethod})`;
}

export function canonicalizeIngredientName(name) {
	const raw = (name || '').toString().trim();
	const low = raw.toLowerCase();
	if (!raw) return raw;
	if (low.includes('nutella')) return 'Nutella';
	if (low.startsWith('agua')) return 'Agua';
	if (low.includes('oreo')) return 'Oreo';
	// Extras common aliases
	if (low.includes('bolsa') && low.includes('cuchara')) return 'Bolsa para cuchara';
	if (low.includes('contenedor') && (low.includes('8 oz') || low.includes('8oz') || low.includes('8 onz') || low.includes('8onz'))) return 'Contenedor 8 onz';
	return raw;
}

export async function ensureInventoryItem(ingredient, unit = 'g') {
	await ensureSchema();
	const name = canonicalizeIngredientName(ingredient);
	if (!name) return null;
	const u = (unit || 'g').toString();
	const [row] = await sql`
		INSERT INTO inventory_items (ingredient, unit)
		VALUES (${name}, ${u})
		ON CONFLICT (ingredient) DO UPDATE SET
			unit = CASE WHEN EXCLUDED.unit IS NOT NULL AND EXCLUDED.unit <> '' THEN EXCLUDED.unit ELSE inventory_items.unit END,
			updated_at = now()
		RETURNING id, ingredient, unit
	`;
	return row;
}

export { sql };