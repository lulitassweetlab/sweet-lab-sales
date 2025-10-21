import { ensureSchema, sql } from './_db.js';

function json(body, status = 200) {
	return { statusCode: status, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) };
}

export async function handler(event) {
	try {
		await ensureSchema();
		if (event.httpMethod === 'OPTIONS') return json({ ok: true });
		if (event.httpMethod !== 'GET') return json({ error: 'Método no permitido' }, 405);
		let raw = '';
		if (event.rawQuery && typeof event.rawQuery === 'string') raw = event.rawQuery;
		else if (event.queryStringParameters && typeof event.queryStringParameters === 'object') {
			raw = Object.entries(event.queryStringParameters)
				.map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v ?? '')}`)
				.join('&');
		}
		const params = new URLSearchParams(raw);
		const startParam = params.get('start') || (event.queryStringParameters && event.queryStringParameters.start) || '';
		const endParam = params.get('end') || (event.queryStringParameters && event.queryStringParameters.end) || '';
		const start = String(startParam).slice(0, 10);
		const end = String(endParam).slice(0, 10);
		if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(end)) {
			return json({ error: 'start y end requeridos (YYYY-MM-DD)' }, 400);
		}
		const rows = await sql`
			SELECT sr.id, sr.sale_id, sr.image_base64, sr.note_text,
			       sr.bank_method, sr.payment_date, sr.payment_source,
			       sr.created_at,
			       s.seller_id, s.sale_day_id, s.client_name, s.pay_method, s.payment_source AS sale_payment_source, s.total_cents,
			       sd.day AS sale_day, se.name AS seller_name,
			       COALESCE(sd.day, sr.created_at::date, s.created_at::date) AS effective_day
			FROM sale_receipts sr
			JOIN sales s ON s.id = sr.sale_id
			LEFT JOIN sale_days sd ON sd.id = s.sale_day_id
			LEFT JOIN sellers se ON se.id = s.seller_id
			WHERE COALESCE(sd.day, sr.created_at::date, s.created_at::date) BETWEEN ${start} AND ${end}
			ORDER BY sr.created_at DESC, sr.id DESC
		`;
		return json(rows);
	} catch (err) {
		return json({ error: String(err) }, 500);
	}
}

