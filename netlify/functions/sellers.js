import { ensureSchema, sql } from './_db.js';

function json(body, status = 200) {
	return { statusCode: status, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) };
}

export async function handler(event) {
	try {
		// Ensure schema runs to apply migrations (e.g., adding whatsapp column)
		await ensureSchema();
		
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
				let role = (rows && rows[0] && rows[0].role) ? String(rows[0].role) : 'user';
				// FALLBACK: Sincronización con las reglas de app.js
				const u = actor.toLowerCase();
				if (role === 'user') {
					if (u === 'jorge' || u === 'jorgecordoba' || u === 'admin' || u === 'sweetlab') role = 'superadmin';
					else if (u === 'marcela' || u === 'aleja' || u === 'lulitas' || u === 'lab') role = 'admin';
				}
				console.log(`[API Sellers] Actor: ${actor}, Assigned Role: ${role}`);
				return role;
			} catch (err) { 
				console.error('[API Sellers] getActorRole error:', err);
				return 'user'; 
			}
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
				const includeArchived = (event.queryStringParameters?.include_archived || '') === '1';
				const rows = await sql`
					SELECT id, name, bill_color, archived_at, commission_rate_low, commission_rate_mid, commission_rate_high, require_whatsapp, whatsapp, game_enabled, parent_id 
					FROM sellers 
					WHERE archived_at IS NULL OR ${includeArchived}
					ORDER BY name
				`;
				return json(rows);
			}
			case 'POST': {
				const data = JSON.parse(event.body || '{}');
				const role = await getActorRole(event, data);
				if (role !== 'superadmin') return json({ error: 'No autorizado' }, 403);
				const name = (data.name || '').trim();
				if (!name) return json({ error: 'Nombre requerido' }, 400);
				const [row] = await sql`INSERT INTO sellers (name) VALUES (${name}) ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name RETURNING id, name, bill_color, archived_at, commission_rate_low, commission_rate_mid, commission_rate_high, require_whatsapp, whatsapp, game_enabled, parent_id`;
				return json(row, 201);
			}
			case 'PATCH': {
				const data = JSON.parse(event.body || '{}');
				const role = await getActorRole(event, data);
				if (role !== 'admin' && role !== 'superadmin') return json({ error: 'No autorizado' }, 403);
				
				const id = Number(data.id || 0) || null;
				const rawName = (data.name || '').toString().trim();
				const billColor = (data.bill_color ?? null);
				const commRateLow = (data.commission_rate_low !== undefined) ? Number(data.commission_rate_low) : null;
				const commRateMid = (data.commission_rate_mid !== undefined) ? Number(data.commission_rate_mid) : null;
				const commRateHigh = (data.commission_rate_high !== undefined) ? Number(data.commission_rate_high) : null;
				const reqWhatsappPassed = data.require_whatsapp !== undefined;
				const reqWhatsappValue = !!data.require_whatsapp;
				const whatsappPassed = data.whatsapp !== undefined;
				const whatsappValue = data.whatsapp === null ? null : String(data.whatsapp || '').trim();
				const gameEnabledPassed = data.game_enabled !== undefined;
				const gameEnabledValue = !!data.game_enabled;
				const parentIdPassed = data.parent_id !== undefined;
				const parentIdValue = data.parent_id === null ? null : Number(data.parent_id);
				const action = (data.action || '').toString();

				if (!id && !rawName) return json({ error: 'id o name requerido' }, 400);
				
				let targetId = id;
				if (!targetId) {
					const found = await sql`SELECT id FROM sellers WHERE lower(name)=lower(${rawName}) LIMIT 1`;
					if (!found.length) return json({ error: 'Vendedor no encontrado' }, 404);
					targetId = found[0].id;
				}

				let row;
				if (action === 'archive') {
					[row] = await sql`UPDATE sellers SET archived_at=now() WHERE id=${targetId} RETURNING id, name, bill_color, archived_at, commission_rate_low, commission_rate_mid, commission_rate_high, require_whatsapp, whatsapp, game_enabled, parent_id`;
				} else if (action === 'unarchive') {
					[row] = await sql`UPDATE sellers SET archived_at=NULL WHERE id=${targetId} RETURNING id, name, bill_color, archived_at, commission_rate_low, commission_rate_mid, commission_rate_high, require_whatsapp, whatsapp, game_enabled, parent_id`;
				} else if (billColor !== null || commRateLow !== null || commRateMid !== null || commRateHigh !== null || reqWhatsappPassed || whatsappPassed || gameEnabledPassed || parentIdPassed) {
					[row] = await sql`
						UPDATE sellers SET
							bill_color = COALESCE(${billColor}, bill_color),
							commission_rate_low = COALESCE(${commRateLow}, commission_rate_low),
							commission_rate_mid = COALESCE(${commRateMid}, commission_rate_mid),
							commission_rate_high = COALESCE(${commRateHigh}, commission_rate_high),
							require_whatsapp = CASE WHEN ${reqWhatsappPassed} THEN ${reqWhatsappValue} ELSE require_whatsapp END,
							whatsapp = CASE WHEN ${whatsappPassed} THEN ${whatsappValue} ELSE whatsapp END,
							game_enabled = CASE WHEN ${gameEnabledPassed} THEN ${gameEnabledValue} ELSE game_enabled END,
							parent_id = CASE WHEN ${parentIdPassed} THEN ${parentIdValue} ELSE parent_id END
						WHERE id=${targetId}
						RETURNING id, name, bill_color, archived_at, commission_rate_low, commission_rate_mid, commission_rate_high, require_whatsapp, whatsapp, game_enabled, parent_id
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
		console.error('API Sellers Error:', err);
		return json({ error: String(err) }, 500);
	}
}