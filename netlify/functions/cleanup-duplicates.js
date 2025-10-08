import { ensureSchema, sql } from './_db.js';

function json(body, status = 200) {
	return { statusCode: status, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) };
}

export async function handler(event) {
	try {
		await ensureSchema();
		
		if (event.httpMethod === 'OPTIONS') return json({ ok: true });
		
		if (event.httpMethod !== 'POST') {
			return json({ error: 'Método no permitido. Usar POST' }, 405);
		}
		
		// Check for superadmin permission
		const data = JSON.parse(event.body || '{}');
		const actorName = (data.actor_name || data._actor_name || '').toString();
		
		if (actorName) {
			const userRows = await sql`SELECT role FROM users WHERE lower(username)=lower(${actorName}) LIMIT 1`;
			const role = (userRows && userRows[0] && userRows[0].role) ? String(userRows[0].role) : 'user';
			if (role !== 'superadmin') {
				return json({ error: 'No autorizado. Solo superadmin puede ejecutar esta operación.' }, 403);
			}
		}
		
		// Find sales with duplicate values (have both sale_items and qty_* values)
		const duplicates = await sql`
			SELECT s.id, s.qty_arco, s.qty_melo, s.qty_mara, s.qty_oreo, s.qty_nute,
			       COUNT(si.id) AS items_count
			FROM sales s
			INNER JOIN sale_items si ON si.sale_id = s.id
			WHERE (s.qty_arco > 0 OR s.qty_melo > 0 OR s.qty_mara > 0 OR s.qty_oreo > 0 OR s.qty_nute > 0)
			GROUP BY s.id, s.qty_arco, s.qty_melo, s.qty_mara, s.qty_oreo, s.qty_nute
		`;
		
		const duplicateCount = duplicates.length;
		
		if (duplicateCount === 0) {
			return json({ 
				ok: true, 
				message: 'No se encontraron duplicados. La base de datos está limpia.',
				duplicates_found: 0,
				duplicates_fixed: 0
			});
		}
		
		// Clean up: set qty_* columns to 0 for sales that have sale_items
		const result = await sql`
			UPDATE sales
			SET qty_arco = 0, qty_melo = 0, qty_mara = 0, qty_oreo = 0, qty_nute = 0
			WHERE EXISTS (SELECT 1 FROM sale_items si WHERE si.sale_id = sales.id)
			AND (qty_arco > 0 OR qty_melo > 0 OR qty_mara > 0 OR qty_oreo > 0 OR qty_nute > 0)
		`;
		
		// Recalculate totals for affected sales
		const affectedSales = await sql`
			SELECT DISTINCT sale_id FROM sale_items
			WHERE sale_id IN (
				SELECT id FROM sales WHERE id = ANY(${duplicates.map(d => d.id)})
			)
		`;
		
		// Update totals using recalcTotalForId (imported from _db.js would be ideal, but let's do it inline)
		for (const sale of affectedSales) {
			const itemsTotal = await sql`
				SELECT COALESCE(SUM(quantity * unit_price), 0)::int AS total
				FROM sale_items
				WHERE sale_id = ${sale.sale_id}
			`;
			
			if (itemsTotal && itemsTotal[0]) {
				await sql`
					UPDATE sales SET total_cents = ${itemsTotal[0].total}
					WHERE id = ${sale.sale_id}
				`;
			}
		}
		
		return json({ 
			ok: true, 
			message: `Limpieza completada exitosamente. Se corrigieron ${duplicateCount} ventas con valores duplicados.`,
			duplicates_found: duplicateCount,
			duplicates_fixed: duplicateCount,
			sales_recalculated: affectedSales.length
		}, 200);
		
	} catch (err) {
		console.error('Error during cleanup:', err);
		return json({ error: String(err) }, 500);
	}
}
