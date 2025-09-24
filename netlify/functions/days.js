import { ensureSchema, sql, getOrCreateDayId } from './_db.js';

function json(body, status = 200) {
	return { statusCode: status, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) };
}

export async function handler(event) {
	try {
		await ensureSchema();
		if (event.httpMethod === 'OPTIONS') return json({ ok: true });
		switch (event.httpMethod) {
			case 'GET': {
				const params = new URLSearchParams(event.rawQuery || event.queryStringParameters ? event.rawQuery || '' : '');
				const sellerIdParam = params.get('seller_id') || (event.queryStringParameters && event.queryStringParameters.seller_id);
				const sellerId = Number(sellerIdParam);
				if (!sellerId) return json({ error: 'seller_id requerido' }, 400);
				const archivedParam = (params.get('archived') || '').toString().toLowerCase();
				const includeArchivedParam = (params.get('include_archived') || '').toString().toLowerCase();
				let rows;
				if (archivedParam === 'true' || archivedParam === '1') {
					rows = await sql`SELECT id, day, delivered_arco, delivered_melo, delivered_mara, delivered_oreo, delivered_nute, is_archived FROM sale_days WHERE seller_id=${sellerId} AND is_archived=true ORDER BY day DESC`;
				} else if (includeArchivedParam === 'true' || includeArchivedParam === '1') {
					rows = await sql`SELECT id, day, delivered_arco, delivered_melo, delivered_mara, delivered_oreo, delivered_nute, is_archived FROM sale_days WHERE seller_id=${sellerId} ORDER BY day DESC`;
				} else {
					rows = await sql`SELECT id, day, delivered_arco, delivered_melo, delivered_mara, delivered_oreo, delivered_nute, is_archived FROM sale_days WHERE seller_id=${sellerId} AND is_archived=false ORDER BY day DESC`;
				}
				return json(rows);
			}
			case 'POST': {
				const data = JSON.parse(event.body || '{}');
				const sellerId = Number(data.seller_id);
				let day = (data.day || '').toString();
				if (!sellerId) return json({ error: 'seller_id requerido' }, 400);
				if (!day) {
					const now = new Date();
					const iso = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())).toISOString().slice(0,10);
					day = iso;
				}
				const id = await getOrCreateDayId(sellerId, day);
				return json({ id, day }, 201);
			}
			case 'PUT': {
				const data = JSON.parse(event.body || '{}');
				const id = Number(data.id);
				const day = (data.day || '').toString();
				if (!id) return json({ error: 'id requerido' }, 400);
				// Optional: delivered_* updates allowed only for superadmin. If day missing, backfill from DB.
				const da = Number(data.delivered_arco ?? NaN);
				const dm = Number(data.delivered_melo ?? NaN);
				const dma = Number(data.delivered_mara ?? NaN);
				const dor = Number(data.delivered_oreo ?? NaN);
				const dnu = Number(data.delivered_nute ?? NaN);
				const actor = (data.actor_name || data._actor_name || '').toString();
				let role = 'user';
				if (actor) {
					try {
						const r = await sql`SELECT role FROM users WHERE lower(username)=lower(${actor}) LIMIT 1`;
						if (r && r[0] && r[0].role) role = String(r[0].role);
					} catch {}
				}
				const dayParam = day && day.length ? day : null;
				const daVal = (role === 'superadmin' && !Number.isNaN(da)) ? Math.max(0, da|0) : null;
				const dmVal = (role === 'superadmin' && !Number.isNaN(dm)) ? Math.max(0, dm|0) : null;
				const dmaVal = (role === 'superadmin' && !Number.isNaN(dma)) ? Math.max(0, dma|0) : null;
				const dorVal = (role === 'superadmin' && !Number.isNaN(dor)) ? Math.max(0, dor|0) : null;
				const dnuVal = (role === 'superadmin' && !Number.isNaN(dnu)) ? Math.max(0, dnu|0) : null;
				const [row] = await sql`
					UPDATE sale_days SET
						day = COALESCE(${dayParam}, day),
						delivered_arco = COALESCE(${daVal}, delivered_arco),
						delivered_melo = COALESCE(${dmVal}, delivered_melo),
						delivered_mara = COALESCE(${dmaVal}, delivered_mara),
						delivered_oreo = COALESCE(${dorVal}, delivered_oreo),
						delivered_nute = COALESCE(${dnuVal}, delivered_nute)
					WHERE id=${id}
					RETURNING id, day, delivered_arco, delivered_melo, delivered_mara, delivered_oreo, delivered_nute
				`;
				return json(row || { id, day });
			}
			case 'PATCH': {
				// Update archive state for one or many days
				// Body: { id?, ids?, is_archived }
				const data = JSON.parse(event.body || '{}');
				const isArchived = !!data.is_archived;
				const id = Number(data.id || 0) || null;
				let ids = Array.isArray(data.ids) ? data.ids.map(n => Number(n)).filter(n => Number.isInteger(n) && n > 0) : [];
				if (!id && (!ids || ids.length === 0)) return json({ error: 'id o ids requerido' }, 400);
				if (id && !ids.length) ids = [id];
				await sql`UPDATE sale_days SET is_archived=${isArchived} WHERE id = ANY(${ids})`;
				return json({ ok: true, updated: ids.length, is_archived: isArchived });
			}
			case 'DELETE': {
				const params = new URLSearchParams(event.rawQuery || event.queryStringParameters ? event.rawQuery || '' : '');
				const idParam = params.get('id') || (event.queryStringParameters && event.queryStringParameters.id);
				const id = Number(idParam);
				if (!id) return json({ error: 'id requerido' }, 400);
				await sql`DELETE FROM sale_days WHERE id=${id}`;
				return json({ ok: true });
			}
			default:
				return json({ error: 'Método no permitido' }, 405);
		}
	} catch (err) {
		return json({ error: String(err) }, 500);
	}
}