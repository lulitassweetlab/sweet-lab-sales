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
	await sql`CREATE TABLE IF NOT EXISTS sales (
		id SERIAL PRIMARY KEY,
		seller_id INTEGER NOT NULL REFERENCES sellers(id) ON DELETE CASCADE,
		client_name TEXT DEFAULT '',
		qty_arco INTEGER NOT NULL DEFAULT 0,
		qty_melo INTEGER NOT NULL DEFAULT 0,
		qty_mara INTEGER NOT NULL DEFAULT 0,
		qty_oreo INTEGER NOT NULL DEFAULT 0,
		total_cents INTEGER NOT NULL DEFAULT 0,
		created_at TIMESTAMPTZ DEFAULT now()
	)`;
	schemaEnsured = true;
}

export function prices() {
	return { arco: 8500, melo: 9500, mara: 10500, oreo: 10500 };
}

export async function recalcTotalForId(id) {
	const p = prices();
	const [row] = await sql`
		UPDATE sales SET total_cents = qty_arco * ${p.arco} + qty_melo * ${p.melo} + qty_mara * ${p.mara} + qty_oreo * ${p.oreo}
		WHERE id = ${id}
		RETURNING *
	`;
	return row;
}

export { sql };