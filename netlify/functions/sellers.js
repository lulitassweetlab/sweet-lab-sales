import { ensureSchema, sql } from './_db.js';

function json(body, status = 200) {
	return { statusCode: status, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) };
}

export async function handler(event) {
	try {
		// OPTIMIZED: Skip ensureSchema for GET requests (read-only, performance critical)
		if (event.httpMethod !== 'GET') {
			await ensureSchema();
		}
		if (event.httpMethod === 'OPTIONS') return json({ ok: true });

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

		async function getActorName(evt, body = null) {
			try {
				const headers = (evt.headers || {});
				const hActor = (headers['x-actor-name'] || headers['X-Actor-Name'] || headers['x-actor'] || '').toString();
				let bActor = '';
				try { bActor = (body && (body.actor_name || body._actor_name || body.username)) ? String(body.actor_name || body._actor_name || body.username) : ''; } catch {}
				let qActor = '';
				try { const qs = new URLSearchParams(evt.rawQuery || (evt.queryStringParameters ? new URLSearchParams(evt.queryStringParameters).toString() : '')); qActor = (qs.get('actor') || '').toString(); } catch {}
				return (hActor || bActor || qActor || '').toString();
			} catch { return ''; }
		}
		switch (event.httpMethod) {
			case 'GET': {
				// Support include_archived=1 to include archived sellers; default excludes archived
				const params = new URLSearchParams(event.rawQuery || event.queryStringParameters ? event.rawQuery || '' : '');
				const includeArchived = (params.get('include_archived') || '').toString() === '1';
				const role = await getActorRole(event, null);
				const actorName = (await getActorName(event, null) || '').toString();
				if (role === 'admin' || role === 'superadmin') {
					let rows;
					if (includeArchived) {
						rows = await sql`SELECT id, name, bill_color, archived_at, commission_rate_low, commission_rate_mid, commission_rate_high FROM sellers ORDER BY name`;
					} else {
						rows = await sql`SELECT id, name, bill_color, archived_at, commission_rate_low, commission_rate_mid, commission_rate_high FROM sellers WHERE archived_at IS NULL ORDER BY name`;
					}
					return json(rows);
				}
				// Regular user: own seller or granted via user_view_permissions
				let rows;
				if (includeArchived) {
					rows = await sql`
						WITH grants AS (
							SELECT s.id
							FROM user_view_permissions uvp
							JOIN sellers s ON s.id = uvp.seller_id
							WHERE lower(uvp.viewer_username) = lower(${actorName})
						), own AS (
							SELECT s.id
							FROM sellers s
							WHERE lower(s.name) = lower(${actorName})
						)
						SELECT id, name, bill_color, archived_at, commission_rate_low, commission_rate_mid, commission_rate_high
						FROM sellers
						WHERE id IN (SELECT id FROM grants UNION SELECT id FROM own)
						ORDER BY name
					`;
				} else {
					rows = await sql`
						WITH grants AS (
							SELECT s.id
							FROM user_view_permissions uvp
							JOIN sellers s ON s.id = uvp.seller_id
							WHERE lower(uvp.viewer_username) = lower(${actorName})
						), own AS (
							SELECT s.id
							FROM sellers s
							WHERE lower(s.name) = lower(${actorName})
						)
						SELECT id, name, bill_color, archived_at, commission_rate_low, commission_rate_mid, commission_rate_high
						FROM sellers
						WHERE id IN (SELECT id FROM grants UNION SELECT id FROM own) AND archived_at IS NULL
						ORDER BY name
					`;
				}
				return json(rows);
			}
			case 'POST': {
				const data = JSON.parse(event.body || '{}');
				const role = await getActorRole(event, data);
				if (role !== 'superadmin') return json({ error: 'No autorizado' }, 403);
				const name = (data.name || '').trim();
				if (!name) return json({ error: 'Nombre requerido' }, 400);
				const [row] = await sql`INSERT INTO sellers (name) VALUES (${name}) ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name RETURNING id, name, bill_color, archived_at, commission_rate_low, commission_rate_mid, commission_rate_high`;
				return json(row, 201);
			}
			case 'PATCH': {
				// Update seller properties: bill_color, and logical archive/unarchive
				// Body: { id? or name?, bill_color?, action?: 'archive'|'unarchive' }
				const data = JSON.parse(event.body || '{}');
				const role = await getActorRole(event, data);
				if (role !== 'admin' && role !== 'superadmin') return json({ error: 'No autorizado' }, 403);
				const id = Number(data.id || 0) || null;
				const rawName = (data.name || '').toString().trim();
				const billColor = (data.bill_color ?? null);
				const commRateLow = (data.commission_rate_low !== undefined) ? Number(data.commission_rate_low) : null;
				const commRateMid = (data.commission_rate_mid !== undefined) ? Number(data.commission_rate_mid) : null;
				const commRateHigh = (data.commission_rate_high !== undefined) ? Number(data.commission_rate_high) : null;
				const action = (data.action || '').toString();
				if (!id && !rawName) return json({ error: 'id o name requerido' }, 400);
				if (billColor !== null && typeof billColor !== 'string') return json({ error: 'bill_color inválido' }, 400);
				let targetId = id;
				if (!targetId) {
					const found = await sql`SELECT id FROM sellers WHERE lower(name)=lower(${rawName}) LIMIT 1`;
					if (!found.length) return json({ error: 'Vendedor no encontrado' }, 404);
					targetId = found[0].id;
				}
				let row;
				if (action === 'archive') {
					[row] = await sql`UPDATE sellers SET archived_at=now() WHERE id=${targetId} RETURNING id, name, bill_color, archived_at, commission_rate_low, commission_rate_mid, commission_rate_high`;
				} else if (action === 'unarchive') {
					[row] = await sql`UPDATE sellers SET archived_at=NULL WHERE id=${targetId} RETURNING id, name, bill_color, archived_at, commission_rate_low, commission_rate_mid, commission_rate_high`;
				} else if (billColor !== null || commRateLow !== null || commRateMid !== null || commRateHigh !== null) {
					// Update any provided fields
					[row] = await sql`
						UPDATE sellers SET
							bill_color = COALESCE(${billColor}, bill_color),
							commission_rate_low = COALESCE(${commRateLow}, commission_rate_low),
							commission_rate_mid = COALESCE(${commRateMid}, commission_rate_mid),
							commission_rate_high = COALESCE(${commRateHigh}, commission_rate_high)
						WHERE id=${targetId}
						RETURNING id, name, bill_color, archived_at, commission_rate_low, commission_rate_mid, commission_rate_high
					`;
				} else {
					return json({ error: 'Sin cambios' }, 400);
				}
				return json(row);
			}
			case 'DELETE': {
				const params = new URLSearchParams(event.rawQuery || event.queryStringParameters ? event.rawQuery || '' : '');
				const role = await getActorRole(event, null);
				if (role !== 'superadmin') return json({ error: 'No autorizado' }, 403);
				const idParam = params.get('id');
				const nameParam = params.get('name');
				if (!idParam && !nameParam) return json({ error: 'id o name requerido' }, 400);
				if (idParam) {
					const id = Number(idParam);
					if (!id) return json({ error: 'id inválido' }, 400);
					await sql`UPDATE sellers SET archived_at=now() WHERE id=${id}`;
					return json({ ok: true, archived_id: id });
				}
				// If deleting by name, keep the oldest (smallest id) and delete the rest (case-insensitive)
				const nm = (nameParam || '').toString();
				if (!nm.trim()) return json({ error: 'name inválido' }, 400);
				const rows = await sql`SELECT id, name FROM sellers WHERE lower(name)=lower(${nm}) ORDER BY id ASC`;
				if (rows.length <= 1) return json({ ok: true, kept_id: rows[0]?.id || null, deleted: 0 });
				const keepId = rows[0].id;
				const toArchive = rows.slice(1).map(r => r.id);
				await sql`UPDATE sellers SET archived_at=now() WHERE id = ANY(${toArchive})`;
				return json({ ok: true, kept_id: keepId, archived: toArchive.length });
			}
			default:
				return json({ error: 'Método no permitido' }, 405);
		}
	} catch (err) {
		return json({ error: String(err) }, 500);
	}
}