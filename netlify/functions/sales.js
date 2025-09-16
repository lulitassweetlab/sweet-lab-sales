import { ensureSchema, sql, recalcTotalForId, getOrCreateDayId, notify as notifyDb } from './_db.js';

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
				// New: list receipts across date range
				const receiptsRangeStart = params.get('receipts_start');
				const receiptsRangeEnd = params.get('receipts_end');
				if (receiptsRangeStart && receiptsRangeEnd) {
					const start = receiptsRangeStart.toString().slice(0,10);
					const end = receiptsRangeEnd.toString().slice(0,10);
					const rows = await sql`
						SELECT sr.id, sr.sale_id, sr.image_base64, sr.note_text, sr.created_at,
						       s.seller_id, s.sale_day_id, s.client_name, s.pay_method, s.total_cents,
						       sd.day AS sale_day, se.name AS seller_name
						FROM sale_receipts sr
						JOIN sales s ON s.id = sr.sale_id
						LEFT JOIN sale_days sd ON sd.id = s.sale_day_id
						LEFT JOIN sellers se ON se.id = s.seller_id
						WHERE (sd.day BETWEEN ${start} AND ${end})
						   OR (DATE(sr.created_at) BETWEEN ${start} AND ${end})
						   OR (DATE(s.created_at) BETWEEN ${start} AND ${end})
						ORDER BY sr.created_at DESC, sr.id DESC
					`;
					return json(rows);
				}
				const historyFor = params.get('history_for');
				if (historyFor) {
					const saleId = Number(historyFor);
					if (!saleId) return json({ error: 'history_for inválido' }, 400);
					const rows = await sql`SELECT id, sale_id, field, old_value, new_value, user_name, created_at FROM change_logs WHERE sale_id=${saleId} ORDER BY created_at DESC, id DESC`;
					return json(rows);
				}
				const receiptFor = params.get('receipt_for');
				if (receiptFor) {
					const saleId = Number(receiptFor);
					if (!saleId) return json({ error: 'receipt_for inválido' }, 400);
					const rows = await sql`SELECT id, sale_id, image_base64, note_text, created_at FROM sale_receipts WHERE sale_id=${saleId} ORDER BY created_at DESC, id DESC`;
					return json(rows);
				}
				const sellerIdParam = params.get('seller_id') || (event.queryStringParameters && event.queryStringParameters.seller_id);
				const dayIdParam = params.get('sale_day_id') || (event.queryStringParameters && event.queryStringParameters.sale_day_id);
				const sellerId = Number(sellerIdParam);
				const saleDayId = dayIdParam ? Number(dayIdParam) : null;
				if (!sellerId) return json({ error: 'seller_id requerido' }, 400);
				let rows;
				if (saleDayId) {
					rows = await sql`SELECT id, seller_id, sale_day_id, client_name, qty_arco, qty_melo, qty_mara, qty_oreo, qty_nute, is_paid, pay_method, comment_text, total_cents, created_at FROM sales WHERE seller_id = ${sellerId} AND sale_day_id=${saleDayId} ORDER BY created_at DESC, id DESC`;
				} else {
					rows = await sql`SELECT id, seller_id, sale_day_id, client_name, qty_arco, qty_melo, qty_mara, qty_oreo, qty_nute, is_paid, pay_method, comment_text, total_cents, created_at FROM sales WHERE seller_id = ${sellerId} ORDER BY created_at DESC, id DESC`;
				}
				return json(rows);
			}
			case 'POST': {
				const data = JSON.parse(event.body || '{}');
				// Receipt upload flow
				if (data && data._upload_receipt_for) {
					const sid = Number(data._upload_receipt_for);
					const img = (data.image_base64 || '').toString();
					const note = (data.note_text || '').toString();
					if (!sid || !img) return json({ error: 'sale_id e imagen requeridos' }, 400);
					const [row] = await sql`INSERT INTO sale_receipts (sale_id, image_base64, note_text) VALUES (${sid}, ${img}, ${note}) RETURNING id, sale_id, note_text, created_at`;
					return json(row, 201);
				}
				const sellerId = Number(data.seller_id);
				let saleDayId = data.sale_day_id ? Number(data.sale_day_id) : null;
				if (!sellerId) return json({ error: 'seller_id requerido' }, 400);
				if (!saleDayId) {
					const now = new Date();
					const iso = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())).toISOString().slice(0,10);
					saleDayId = await getOrCreateDayId(sellerId, iso);
				}
				const [row] = await sql`INSERT INTO sales (seller_id, sale_day_id) VALUES (${sellerId}, ${saleDayId}) RETURNING id, seller_id, sale_day_id, client_name, qty_arco, qty_melo, qty_mara, qty_oreo, qty_nute, is_paid, pay_method, comment_text, total_cents, created_at`;
				return json(row, 201);
			}
			case 'PUT': {
				const data = JSON.parse(event.body || '{}');
				const id = Number(data.id);
				if (!id) return json({ error: 'id requerido' }, 400);
				const current = (await sql`SELECT client_name, qty_arco, qty_melo, qty_mara, qty_oreo, qty_nute, is_paid, pay_method, comment_text, created_at FROM sales WHERE id=${id}`)[0] || {};
				const createdAt = current.created_at ? new Date(current.created_at) : null;
				const withinGrace = createdAt ? ((new Date()) - createdAt) < 120000 : false; // 2 minutes
				const client = (data.client_name ?? '').toString();
				const comment = (Object.prototype.hasOwnProperty.call(data, 'comment_text')) ? (data.comment_text ?? '') : current.comment_text;
				const qa = Number(data.qty_arco ?? 0) || 0;
				const qm = Number(data.qty_melo ?? 0) || 0;
				const qma = Number(data.qty_mara ?? 0) || 0;
				const qo = Number(data.qty_oreo ?? 0) || 0;
				const qn = Number(data.qty_nute ?? 0) || 0;
				const paid = (data.is_paid === true || data.is_paid === 'true') ? true : (data.is_paid === false || data.is_paid === 'false') ? false : current.is_paid;
				const payMethod = (Object.prototype.hasOwnProperty.call(data, 'pay_method')) ? (data.pay_method ?? null) : current.pay_method;
				await sql`UPDATE sales SET client_name=${client}, comment_text=${comment}, qty_arco=${qa}, qty_melo=${qm}, qty_mara=${qma}, qty_oreo=${qo}, qty_nute=${qn}, is_paid=${paid}, pay_method=${payMethod} WHERE id=${id}`;
				// write change logs
				const actor = (data._actor_name ?? '').toString();
				async function write(field, oldVal, newVal) {
					if (String(oldVal) === String(newVal)) return;
					// Suppress all logs during initial grace period after row creation
					if (withinGrace) return;
					// Coalesce rapid edits (20s)
					const recent = await sql`SELECT id, created_at FROM change_logs WHERE sale_id=${id} AND field=${field} AND user_name=${actor} ORDER BY created_at DESC LIMIT 1`;
					if (recent.length && (new Date() - new Date(recent[0].created_at)) < 20000) {
						await sql`UPDATE change_logs SET new_value=${newVal?.toString() ?? ''}, created_at=now() WHERE id=${recent[0].id}`;
					} else {
						await sql`INSERT INTO change_logs (sale_id, field, old_value, new_value, user_name) VALUES (${id}, ${field}, ${oldVal?.toString() ?? ''}, ${newVal?.toString() ?? ''}, ${actor})`;
					}
				}
				await write('client_name', current.client_name ?? '', client ?? '');
				await write('qty_arco', current.qty_arco ?? 0, qa ?? 0);
				await write('qty_melo', current.qty_melo ?? 0, qm ?? 0);
				await write('qty_mara', current.qty_mara ?? 0, qma ?? 0);
				await write('qty_oreo', current.qty_oreo ?? 0, qo ?? 0);
				await write('qty_nute', current.qty_nute ?? 0, qn ?? 0);
				await write('pay_method', current.pay_method ?? '', payMethod ?? '');
				// emit realtime notifications for qty changes
				async function emitQty(name, prev, next) {
					if (String(prev) === String(next)) return;
					const prevNote = (Number(prev||0) > 0) ? ` (antes ${prev})` : '';
					const msg = `${client || 'Cliente'} + ${next} ${name}${prevNote}` + (actor ? ` - ${actor}` : '');
					await notifyDb({ type: 'qty', sellerId: Number(data.seller_id||0)||null, saleId: id, saleDayId: Number(data.sale_day_id||0)||null, message: msg, actorName: actor });
				}
				await emitQty('arco', current.qty_arco ?? 0, qa ?? 0);
				await emitQty('melo', current.qty_melo ?? 0, qm ?? 0);
				await emitQty('mara', current.qty_mara ?? 0, qma ?? 0);
				await emitQty('oreo', current.qty_oreo ?? 0, qo ?? 0);
				await emitQty('nute', current.qty_nute ?? 0, qn ?? 0);
				const row = await recalcTotalForId(id);
				return json(row);
			}
			case 'DELETE': {
				const params = new URLSearchParams(event.rawQuery || event.queryStringParameters ? event.rawQuery || '' : '');
				const idParam = params.get('id') || (event.queryStringParameters && event.queryStringParameters.id);
				const actor = (params.get('actor') || '').toString();
				const id = Number(idParam);
				const receiptIdParam = params.get('receipt_id');
				if (receiptIdParam) {
					const receiptId = Number(receiptIdParam);
					if (!receiptId) return json({ error: 'receipt_id requerido' }, 400);
					await sql`DELETE FROM sale_receipts WHERE id=${receiptId}`;
					return json({ ok: true });
				}
				if (!id) return json({ error: 'id requerido' }, 400);
				// fetch previous data for notification content
				const prev = (await sql`SELECT seller_id, sale_day_id, client_name, qty_arco, qty_melo, qty_mara, qty_oreo, qty_nute FROM sales WHERE id=${id}`)[0] || null;
				await sql`DELETE FROM sales WHERE id=${id}`;
				// emit deletion notification with client, quantities, and seller name
				if (prev) {
					const name = (prev.client_name || '') || 'Cliente';
					const parts = [];
					const ar = Number(prev.qty_arco||0); if (ar) parts.push(`${ar} arco`);
					const me = Number(prev.qty_melo||0); if (me) parts.push(`${me} melo`);
					const ma = Number(prev.qty_mara||0); if (ma) parts.push(`${ma} mara`);
					const or = Number(prev.qty_oreo||0); if (or) parts.push(`${or} oreo`);
					const nu = Number(prev.qty_nute||0); if (nu) parts.push(`${nu} nute`);
					const suffix = parts.length ? (' + ' + parts.join(' + ')) : '';
					let sellerName = '';
					try {
						const s = await sql`SELECT name FROM sellers WHERE id=${Number(prev.seller_id||0)}`;
						sellerName = (s && s[0] && s[0].name) ? String(s[0].name) : '';
					} catch {}
					const tail = sellerName ? ` - ${sellerName}` : '';
					const msg = `Eliminada: ${name}${suffix}${tail}`;
					// Do not reference deleted sale_id to avoid FK violation
					await notifyDb({ type: 'delete', sellerId: Number(prev.seller_id||0)||null, saleId: null, saleDayId: Number(prev.sale_day_id||0)||null, message: msg, actorName: actor });
				}
				return json({ ok: true });
			}
			default:
				return json({ error: 'Método no permitido' }, 405);
		}
	} catch (err) {
		return json({ error: String(err) }, 500);
	}
}