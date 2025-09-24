import { ensureSchema, sql } from './_db.js';

function json(body, status = 200) {
	return { statusCode: status, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) };
}

async function getActorRole(evt, body = null) {
	try {
		const headers = (evt.headers || {});
		const hActor = (headers['x-actor-name'] || headers['X-Actor-Name'] || headers['x-actor'] || '').toString();
		let bActor = '';
		try { bActor = (body && (body.actor_name || body._actor_name || body.username)) ? String(body.actor_name || body._actor_name || body.username) : ''; } catch {}
		let qActor = '';
		try { const qs = new URLSearchParams(evt.rawQuery || (evt.queryStringParameters ? new URLSearchParams(evt.queryStringParameters).toString() : '')); qActor = (qs.get('actor') || '').toString(); } catch {}
		const actor = (hActor || bActor || qActor || '').trim();
		if (!actor) return 'user';
		const rows = await sql`SELECT role FROM users WHERE lower(username)=lower(${actor}) LIMIT 1`;
		return (rows && rows[0] && rows[0].role) ? String(rows[0].role) : 'user';
	} catch { return 'user'; }
}

export async function handler(event) {
	try {
		await ensureSchema();
		// Harden: ensure accounting table exists even if ensureSchema was previously cached
		await sql`CREATE TABLE IF NOT EXISTS accounting_entries (
			id SERIAL PRIMARY KEY,
			kind TEXT NOT NULL,
			entry_date DATE NOT NULL,
			description TEXT NOT NULL DEFAULT '',
			amount_cents INTEGER NOT NULL DEFAULT 0,
			actor_name TEXT,
			created_at TIMESTAMPTZ DEFAULT now()
		)`;
		await sql`DO $$ BEGIN
			IF NOT EXISTS (
				SELECT 1 FROM information_schema.columns
				WHERE table_name = 'accounting_entries' AND column_name = 'amount_cents'
			) THEN
				ALTER TABLE accounting_entries ADD COLUMN amount_cents INTEGER NOT NULL DEFAULT 0;
			END IF;
			IF NOT EXISTS (
				SELECT 1 FROM information_schema.columns
				WHERE table_name = 'accounting_entries' AND column_name = 'description'
			) THEN
				ALTER TABLE accounting_entries ADD COLUMN description TEXT NOT NULL DEFAULT '';
			END IF;
			IF NOT EXISTS (
				SELECT 1 FROM information_schema.columns
				WHERE table_name = 'accounting_entries' AND column_name = 'entry_date'
			) THEN
				ALTER TABLE accounting_entries ADD COLUMN entry_date DATE NOT NULL DEFAULT now();
			END IF;
			IF NOT EXISTS (
				SELECT 1 FROM information_schema.columns
				WHERE table_name = 'accounting_entries' AND column_name = 'kind'
			) THEN
				ALTER TABLE accounting_entries ADD COLUMN kind TEXT NOT NULL DEFAULT 'gasto';
			END IF;
		END $$;`;
		if (event.httpMethod === 'OPTIONS') return json({ ok: true });
		switch (event.httpMethod) {
			case 'GET': {
				// Optional filters: start, end (robust parsing like sales.js)
				let raw = '';
				if (event.rawQuery && typeof event.rawQuery === 'string') raw = event.rawQuery;
				else if (event.queryStringParameters && typeof event.queryStringParameters === 'object') {
					raw = Object.entries(event.queryStringParameters).map(([k,v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v ?? '')}`).join('&');
				}
				const params = new URLSearchParams(raw);
				const start = (params.get('start') || '').toString().slice(0,10) || null;
				const end = (params.get('end') || '').toString().slice(0,10) || null;
				let rows;
				if (start && end) {
					rows = await sql`SELECT id, kind, entry_date, description, amount_cents, actor_name, created_at FROM accounting_entries WHERE entry_date BETWEEN ${start} AND ${end} ORDER BY entry_date DESC, id DESC`;
				} else {
					rows = await sql`SELECT id, kind, entry_date, description, amount_cents, actor_name, created_at FROM accounting_entries ORDER BY entry_date DESC, id DESC LIMIT 200`;
				}
				return json(rows);
			}
			case 'POST': {
				const data = JSON.parse(event.body || '{}');
				const role = await getActorRole(event, data);
				if (role !== 'superadmin') return json({ error: 'No autorizado' }, 403);
				const kind = (data.kind || data.type || '').toString();
				const entryDate = (data.entry_date || data.date || '').toString().slice(0,10);
				const description = (data.description || data.desc || '').toString();
				const amountCents = Number(data.amount_cents ?? data.value_cents ?? data.amount ?? 0) | 0;
				const actorName = (data.actor_name || data._actor_name || '').toString();
				if (!kind || (kind !== 'gasto' && kind !== 'ingreso')) return json({ error: 'kind inválido' }, 400);
				if (!entryDate) return json({ error: 'entry_date requerido' }, 400);
				if (!description) return json({ error: 'description requerido' }, 400);
				if (!Number.isFinite(amountCents) || amountCents <= 0) return json({ error: 'amount_cents inválido' }, 400);
				const [row] = await sql`INSERT INTO accounting_entries (kind, entry_date, description, amount_cents, actor_name) VALUES (${kind}, ${entryDate}, ${description}, ${amountCents}, ${actorName}) RETURNING id, kind, entry_date, description, amount_cents, actor_name, created_at`;
				return json(row, 201);
			}
			case 'DELETE': {
				const params = new URLSearchParams(event.rawQuery || event.queryStringParameters ? event.rawQuery || '' : '');
				const role = await getActorRole(event, null);
				if (role !== 'superadmin') return json({ error: 'No autorizado' }, 403);
				const idParam = params.get('id');
				const id = Number(idParam);
				if (!id) return json({ error: 'id requerido' }, 400);
				await sql`DELETE FROM accounting_entries WHERE id=${id}`;
				return json({ ok: true });
			}
			default:
				return json({ error: 'Método no permitido' }, 405);
		}
	} catch (err) {
		return json({ error: String(err) }, 500);
	}
}

