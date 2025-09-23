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
				const rows = await sql`SELECT id, day, delivered_arco, delivered_melo, delivered_mara, delivered_oreo, delivered_nute FROM sale_days WHERE seller_id=${sellerId} ORDER BY day DESC`;
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
				let dayToUse = day;
				if (!dayToUse) {
					try {
						const cur = await sql`SELECT day FROM sale_days WHERE id=${id} LIMIT 1`;
						if (cur && cur[0] && cur[0].day) dayToUse = String(cur[0].day);
					} catch {}
				}
				const [row] = await sql`
					UPDATE sale_days SET
						day=${dayToUse}
						${role === 'superadmin' && !Number.isNaN(da) ? sql`, delivered_arco=${Math.max(0, da|0)}` : sql``}
						${role === 'superadmin' && !Number.isNaN(dm) ? sql`, delivered_melo=${Math.max(0, dm|0)}` : sql``}
						${role === 'superadmin' && !Number.isNaN(dma) ? sql`, delivered_mara=${Math.max(0, dma|0)}` : sql``}
						${role === 'superadmin' && !Number.isNaN(dor) ? sql`, delivered_oreo=${Math.max(0, dor|0)}` : sql``}
						${role === 'superadmin' && !Number.isNaN(dnu) ? sql`, delivered_nute=${Math.max(0, dnu|0)}` : sql``}
					WHERE id=${id}
					RETURNING id, day, delivered_arco, delivered_melo, delivered_mara, delivered_oreo, delivered_nute
				`;
				return json(row || { id, day });
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