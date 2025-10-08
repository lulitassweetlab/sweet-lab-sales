import { ensureSchema, sql, recalcTotalForId } from './_db.js';

function json(body, status = 200) {
	return { statusCode: status, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) };
}

export async function handler(event) {
	try {
		await ensureSchema();
		
		if (event.httpMethod === 'OPTIONS') return json({ ok: true });
		
		if (event.httpMethod !== 'POST') {
			return json({ error: 'Method not allowed. Use POST to recalculate all totals.' }, 405);
		}
		
		// Get optional filters from query params
		const params = new URLSearchParams(event.rawQuery || '');
		const saleId = params.get('sale_id');
		const startDate = params.get('start_date');
		const endDate = params.get('end_date');
		
		let salesToRecalc = [];
		
		if (saleId) {
			// Recalculate single sale
			const sale = await sql`SELECT id FROM sales WHERE id = ${Number(saleId)}`;
			if (sale.length === 0) {
				return json({ error: 'Sale not found' }, 404);
			}
			salesToRecalc = sale;
		} else if (startDate && endDate) {
			// Recalculate sales in date range
			salesToRecalc = await sql`
				SELECT s.id
				FROM sales s
				INNER JOIN sale_days sd ON sd.id = s.sale_day_id
				WHERE sd.day >= ${startDate} AND sd.day <= ${endDate}
				ORDER BY s.id ASC
			`;
		} else {
			// Recalculate ALL sales (use with caution!)
			salesToRecalc = await sql`SELECT id FROM sales ORDER BY id ASC`;
		}
		
		console.log(`Recalculating ${salesToRecalc.length} sales...`);
		
		let recalculated = 0;
		let errors = 0;
		const errorDetails = [];
		
		for (const sale of salesToRecalc) {
			try {
				await recalcTotalForId(sale.id);
				recalculated++;
			} catch (err) {
				errors++;
				errorDetails.push({ sale_id: sale.id, error: String(err) });
				console.error(`Error recalculating sale ${sale.id}:`, err);
			}
		}
		
		return json({
			success: true,
			message: `Recalculated ${recalculated} sales`,
			total_processed: salesToRecalc.length,
			recalculated,
			errors,
			error_details: errorDetails.length > 0 ? errorDetails.slice(0, 10) : undefined
		});
		
	} catch (err) {
		console.error('Recalculate totals error:', err);
		return json({ error: String(err) }, 500);
	}
}
