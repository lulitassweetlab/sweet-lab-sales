import { neon } from '@netlify/neon';

const sql = neon(); // uses NETLIFY_DATABASE_URL
let schemaEnsured = false;

export async function ensureSchema() {
	if (schemaEnsured) return;
	await sql`CREATE TABLE IF NOT EXISTS sellers (
		id SERIAL PRIMARY KEY,
		name TEXT UNIQUE NOT NULL,
		created_at TIMESTAMPTZ DEFAULT now()
	)`;
	await sql`CREATE TABLE IF NOT EXISTS sale_days (
		id SERIAL PRIMARY KEY,
		seller_id INTEGER NOT NULL REFERENCES sellers(id) ON DELETE CASCADE,
		day DATE NOT NULL,
		UNIQUE (seller_id, day)
	)`;
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
		created_at TIMESTAMPTZ DEFAULT now()
	)`;
	await sql`CREATE TABLE IF NOT EXISTS notifications (
		id SERIAL PRIMARY KEY,
		type TEXT NOT NULL,
		seller_id INTEGER REFERENCES sellers(id) ON DELETE SET NULL,
		sale_id INTEGER REFERENCES sales(id) ON DELETE SET NULL,
		sale_day_id INTEGER REFERENCES sale_days(id) ON DELETE SET NULL,
		message TEXT NOT NULL,
		actor_name TEXT,
		created_at TIMESTAMPTZ DEFAULT now(),
		read_at TIMESTAMPTZ
	)`;
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

export async function notify({ type, sellerId = null, saleId = null, saleDayId = null, message = '', actorName = '' }) {
	await ensureSchema();
	await sql`INSERT INTO notifications (type, seller_id, sale_id, sale_day_id, message, actor_name) VALUES (${type}, ${sellerId}, ${saleId}, ${saleDayId}, ${message}, ${actorName})`;
}

export { sql };