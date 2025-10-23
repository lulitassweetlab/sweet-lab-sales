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
		if (event.httpMethod === 'OPTIONS') return json({ ok: true });
		switch (event.httpMethod) {
			case 'GET': {
				let raw = '';
				if (event.rawQuery && typeof event.rawQuery === 'string') raw = event.rawQuery;
				else if (event.queryStringParameters && typeof event.queryStringParameters === 'object') {
					raw = Object.entries(event.queryStringParameters).map(([k,v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v ?? '')}`).join('&');
				}
				const params = new URLSearchParams(raw);
				
				// Check if this is a request for seller assignments
				const deliveryId = params.get('delivery_id');
				if (deliveryId) {
					// Return seller assignments for a specific delivery
					const id = Number(deliveryId) || 0;
					if (!id) return json({ error: 'delivery_id inválido' }, 400);
					
					const rows = await sql`
						SELECT 
							dsi.delivery_id,
							dsi.seller_id,
							s.name AS seller_name,
							COALESCE(SUM(CASE WHEN des.short_code='arco' THEN dsi.quantity END),0)::int AS arco,
							COALESCE(SUM(CASE WHEN des.short_code='melo' THEN dsi.quantity END),0)::int AS melo,
							COALESCE(SUM(CASE WHEN des.short_code='mara' THEN dsi.quantity END),0)::int AS mara,
							COALESCE(SUM(CASE WHEN des.short_code='oreo' THEN dsi.quantity END),0)::int AS oreo,
							COALESCE(SUM(CASE WHEN des.short_code='nute' THEN dsi.quantity END),0)::int AS nute
						FROM delivery_seller_items dsi
						JOIN sellers s ON s.id = dsi.seller_id
						JOIN desserts des ON des.id = dsi.dessert_id
						WHERE dsi.delivery_id = ${id}
						GROUP BY dsi.delivery_id, dsi.seller_id, s.name
						ORDER BY s.name ASC
					`;
					return json(rows);
				}
				
				// List deliveries with totals per dessert
				const start = (params.get('start') || '').toString().slice(0,10) || null;
				const end = (params.get('end') || '').toString().slice(0,10) || null;
				let rows;
				if (start && end) {
					rows = await sql`
						SELECT d.id, d.day,
							COALESCE(SUM(CASE WHEN di.dessert_id = (SELECT id FROM desserts WHERE short_code='arco' LIMIT 1) THEN di.quantity END),0)::int AS arco,
							COALESCE(SUM(CASE WHEN di.dessert_id = (SELECT id FROM desserts WHERE short_code='melo' LIMIT 1) THEN di.quantity END),0)::int AS melo,
							COALESCE(SUM(CASE WHEN di.dessert_id = (SELECT id FROM desserts WHERE short_code='mara' LIMIT 1) THEN di.quantity END),0)::int AS mara,
							COALESCE(SUM(CASE WHEN di.dessert_id = (SELECT id FROM desserts WHERE short_code='oreo' LIMIT 1) THEN di.quantity END),0)::int AS oreo,
							COALESCE(SUM(CASE WHEN di.dessert_id = (SELECT id FROM desserts WHERE short_code='nute' LIMIT 1) THEN di.quantity END),0)::int AS nute
						FROM deliveries d
						LEFT JOIN delivery_items di ON di.delivery_id = d.id
						WHERE d.day BETWEEN ${start} AND ${end}
						GROUP BY d.id, d.day
						ORDER BY d.day DESC, d.id DESC
					`;
				} else {
					rows = await sql`
						SELECT d.id, d.day,
							COALESCE(SUM(CASE WHEN di.dessert_id = (SELECT id FROM desserts WHERE short_code='arco' LIMIT 1) THEN di.quantity END),0)::int AS arco,
							COALESCE(SUM(CASE WHEN di.dessert_id = (SELECT id FROM desserts WHERE short_code='melo' LIMIT 1) THEN di.quantity END),0)::int AS melo,
							COALESCE(SUM(CASE WHEN di.dessert_id = (SELECT id FROM desserts WHERE short_code='mara' LIMIT 1) THEN di.quantity END),0)::int AS mara,
							COALESCE(SUM(CASE WHEN di.dessert_id = (SELECT id FROM desserts WHERE short_code='oreo' LIMIT 1) THEN di.quantity END),0)::int AS oreo,
							COALESCE(SUM(CASE WHEN di.dessert_id = (SELECT id FROM desserts WHERE short_code='nute' LIMIT 1) THEN di.quantity END),0)::int AS nute
						FROM deliveries d
						LEFT JOIN delivery_items di ON di.delivery_id = d.id
						GROUP BY d.id, d.day
						ORDER BY d.day DESC, d.id DESC
						LIMIT 200
					`;
				}
				return json(rows);
			}
			case 'POST': {
				const data = JSON.parse(event.body || '{}');
				const role = await getActorRole(event, data);
				if (role !== 'admin' && role !== 'superadmin') return json({ error: 'No autorizado' }, 403);
				const day = (data.day || '').toString().slice(0,10);
				const items = (data.items && typeof data.items === 'object') ? data.items : {};
				if (!day) return json({ error: 'day requerido' }, 400);
				const [row] = await sql`INSERT INTO deliveries (day, note, actor_name) VALUES (${day}, ${data.note || ''}, ${data.actor_name || ''}) RETURNING id, day`;
				const dmap = await sql`SELECT id, short_code FROM desserts WHERE short_code IN ('arco','melo','mara','oreo','nute')`;
				const idByCode = new Map(dmap.map(d => [String(d.short_code), d.id]));
				async function ins(code, qty){
					const id = idByCode.get(code);
					const q = Number(qty || 0) | 0;
					if (!id || q <= 0) return;
					await sql`INSERT INTO delivery_items (delivery_id, dessert_id, quantity) VALUES (${row.id}, ${id}, ${q}) ON CONFLICT (delivery_id, dessert_id) DO UPDATE SET quantity=EXCLUDED.quantity`;
				}
				await ins('arco', items.arco);
				await ins('melo', items.melo);
				await ins('mara', items.mara);
				await ins('oreo', items.oreo);
				await ins('nute', items.nute);
				return json({ ok: true, id: row.id, day: row.day }, 201);
			}
			case 'PUT': {
				// Update items or note
				const data = JSON.parse(event.body || '{}');
				const role = await getActorRole(event, data);
				if (role !== 'admin' && role !== 'superadmin') return json({ error: 'No autorizado' }, 403);
				const id = Number(data.id || 0) || 0;
				if (!id) return json({ error: 'id requerido' }, 400);
				if (data.note != null) await sql`UPDATE deliveries SET note=${String(data.note)} WHERE id=${id}`;
				if (data.items && typeof data.items === 'object') {
					const dmap = await sql`SELECT id, short_code FROM desserts WHERE short_code IN ('arco','melo','mara','oreo','nute')`;
					const idByCode = new Map(dmap.map(d => [String(d.short_code), d.id]));
					async function up(code, qty){
						const did = idByCode.get(code);
						if (!did) return;
						const q = Number(qty || 0) | 0;
						if (q <= 0) await sql`DELETE FROM delivery_items WHERE delivery_id=${id} AND dessert_id=${did}`;
						else await sql`INSERT INTO delivery_items (delivery_id, dessert_id, quantity) VALUES (${id}, ${did}, ${q}) ON CONFLICT (delivery_id, dessert_id) DO UPDATE SET quantity=EXCLUDED.quantity`;
					}
					for (const k of ['arco','melo','mara','oreo','nute']) await up(k, data.items[k]);
				}
				return json({ ok: true });
			}
			case 'PATCH': {
				// Assign seller quantities: { id, seller_id|seller_name, items: { arco, melo, mara, oreo, nute } }
				const data = JSON.parse(event.body || '{}');
				const role = await getActorRole(event, data);
				if (role !== 'admin' && role !== 'superadmin') return json({ error: 'No autorizado' }, 403);
				const id = Number(data.id || 0) || 0;
				if (!id) return json({ error: 'id requerido' }, 400);
				let sellerId = Number(data.seller_id || 0) || null;
				if (!sellerId) {
					const nm = (data.seller_name || data.seller || '').toString();
					if (!nm) return json({ error: 'seller_id o seller_name requerido' }, 400);
					const s = await sql`SELECT id FROM sellers WHERE lower(name)=lower(${nm}) LIMIT 1`;
					if (!s.length) return json({ error: 'Vendedor no encontrado' }, 404);
					sellerId = s[0].id;
				}
				const dmap = await sql`SELECT id, short_code FROM desserts WHERE short_code IN ('arco','melo','mara','oreo','nute')`;
				const idByCode = new Map(dmap.map(d => [String(d.short_code), d.id]));
				async function up(code, qty){
					const did = idByCode.get(code);
					if (!did) return;
					const q = Number(qty || 0) | 0;
					if (q <= 0) await sql`DELETE FROM delivery_seller_items WHERE delivery_id=${id} AND seller_id=${sellerId} AND dessert_id=${did}`;
					else await sql`INSERT INTO delivery_seller_items (delivery_id, seller_id, dessert_id, quantity) VALUES (${id}, ${sellerId}, ${did}, ${q}) ON CONFLICT (delivery_id, seller_id, dessert_id) DO UPDATE SET quantity=EXCLUDED.quantity`;
				}
				const items = (data.items && typeof data.items === 'object') ? data.items : {};
				for (const k of ['arco','melo','mara','oreo','nute']) await up(k, items[k]);
				return json({ ok: true });
			}
			case 'DELETE': {
				const params = new URLSearchParams(event.rawQuery || event.queryStringParameters ? event.rawQuery || '' : '');
				const role = await getActorRole(event, null);
				if (role !== 'admin' && role !== 'superadmin') return json({ error: 'No autorizado' }, 403);
				const idParam = params.get('id');
				const id = Number(idParam || 0) || 0;
				if (!id) return json({ error: 'id requerido' }, 400);
				await sql`DELETE FROM deliveries WHERE id=${id}`;
				return json({ ok: true });
			}
			default:
				return json({ error: 'Método no permitido' }, 405);
		}
	} catch (err) {
		return json({ error: String(err) }, 500);
	}
}

