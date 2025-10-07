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
		// Ensure attachments table exists
		await sql`CREATE TABLE IF NOT EXISTS accounting_attachments (
			id SERIAL PRIMARY KEY,
			entry_id INTEGER NOT NULL REFERENCES accounting_entries(id) ON DELETE CASCADE,
			file_base64 TEXT NOT NULL,
			mime_type TEXT,
			file_name TEXT,
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
					// Attachment fetch by entry id
					const attFor = params.get('attachment_for');
					if (attFor) {
						const entryId = Number(attFor);
						if (!entryId) return json({ error: 'attachment_for inválido' }, 400);
						const rows = await sql`SELECT id, entry_id, file_base64, mime_type, file_name, created_at FROM accounting_attachments WHERE entry_id=${entryId} ORDER BY created_at DESC, id DESC LIMIT 1`;
						if (!rows.length) return json({ error: 'No encontrado' }, 404);
						return json(rows[0]);
					}
					// Range params reused in multiple branches
					const start = (params.get('start') || '').toString().slice(0,10) || null;
					const end = (params.get('end') || '').toString().slice(0,10) || null;
					// All attachments for a date range
					if (params.has('attachments_for_range')) {
						if (!start || !end) return json({ error: 'start y end requeridos' }, 400);
						const rows = await sql`SELECT a.id, a.entry_id, a.file_base64, a.mime_type, a.file_name, a.created_at
							FROM accounting_attachments a
							JOIN accounting_entries e ON e.id = a.entry_id
							WHERE e.entry_date BETWEEN ${start} AND ${end}
							ORDER BY e.entry_date ASC, a.id ASC`;
						return json(rows);
					}
				let rows;
					if (start && end) {
						rows = await sql`SELECT e.id, e.kind, e.entry_date, e.description, e.amount_cents, e.actor_name, e.created_at,
							EXISTS(SELECT 1 FROM accounting_attachments a WHERE a.entry_id = e.id) AS has_attachment
							FROM accounting_entries e
							WHERE e.entry_date BETWEEN ${start} AND ${end}
							ORDER BY e.entry_date DESC, e.id DESC`;
					} else {
						rows = await sql`SELECT e.id, e.kind, e.entry_date, e.description, e.amount_cents, e.actor_name, e.created_at,
							EXISTS(SELECT 1 FROM accounting_attachments a WHERE a.entry_id = e.id) AS has_attachment
							FROM accounting_entries e
							ORDER BY e.entry_date DESC, e.id DESC LIMIT 200`;
					}
				return json(rows);
			}
			case 'POST': {
				const data = JSON.parse(event.body || '{}');
					// Special case: upload attachment for an entry
					if (data && (data._upload_attachment_for || data.entry_id) && (data.file_base64 || data.image_base64)) {
						const role = await getActorRole(event, data);
						if (role !== 'superadmin') return json({ error: 'No autorizado' }, 403);
						const entryId = Number(data._upload_attachment_for ?? data.entry_id);
						const base64 = (data.file_base64 || data.image_base64 || '').toString();
						const mime = (data.mime_type || '').toString() || null;
						const fname = (data.file_name || '').toString() || null;
						if (!entryId || !base64) return json({ error: 'entry_id y file_base64 requeridos' }, 400);
						await sql`INSERT INTO accounting_attachments (entry_id, file_base64, mime_type, file_name) VALUES (${entryId}, ${base64}, ${mime}, ${fname})`;
						return json({ ok: true });
					}
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
				case 'PUT': {
					const data = JSON.parse(event.body || '{}');
					const role = await getActorRole(event, data);
					if (role !== 'superadmin') return json({ error: 'No autorizado' }, 403);
					const id = Number(data.id);
					if (!id) return json({ error: 'id requerido' }, 400);
					
					// Build update parts dynamically
					const updates = {};
					if (data.kind && (data.kind === 'gasto' || data.kind === 'ingreso')) updates.kind = data.kind;
					if (data.entry_date) updates.entry_date = String(data.entry_date).slice(0,10);
					if (typeof data.description === 'string') updates.description = data.description;
					if (data.amount_cents != null) {
						const ac = Number(data.amount_cents) | 0;
						if (!Number.isFinite(ac) || ac <= 0) return json({ error: 'amount_cents inválido' }, 400);
						updates.amount_cents = ac;
					}
					
					if (!Object.keys(updates).length) return json({ error: 'Nada para actualizar' }, 400);
					
					// Build SET clause manually
					const setClause = Object.keys(updates).map((key, idx) => `${key} = $${idx + 1}`).join(', ');
					const values = Object.values(updates);
					
					// Execute with proper parameter binding
					const query = `UPDATE accounting_entries SET ${setClause} WHERE id = $${values.length + 1} RETURNING id, kind, entry_date, description, amount_cents, actor_name, created_at`;
					const [row] = await sql(query, [...values, id]);
					return json(row);
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

