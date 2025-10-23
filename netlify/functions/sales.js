import { ensureSchema, sql, recalcTotalForId, getOrCreateDayId, notify as notifyDb } from './_db.js';

function json(body, status = 200) {
	return { statusCode: status, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) };
}

async function syncReceiptPaymentsToSales() {
	// Sync payment_date, payment_source, and pay_method from sale_receipts to sales
	// for records that have these fields in receipts but not in sales
	try {
		const receipts = await sql`
			SELECT sr.sale_id, sr.pay_method, sr.payment_source, sr.payment_date
			FROM sale_receipts sr
			WHERE sr.pay_method IS NOT NULL OR sr.payment_source IS NOT NULL OR sr.payment_date IS NOT NULL
		`;
		
		let syncCount = 0;
		for (const receipt of receipts) {
			const saleId = receipt.sale_id;
			if (!saleId) continue;
			
			// Get current sale data
			const [sale] = await sql`SELECT id, pay_method, payment_source, payment_date FROM sales WHERE id=${saleId}`;
			if (!sale) continue;
			
			let needsUpdate = false;
			const updates = {};
			
			// Only update if the receipt has data and the sale doesn't
			if (receipt.payment_source && !sale.payment_source) {
				updates.payment_source = receipt.payment_source;
				needsUpdate = true;
			}
			
			if (receipt.payment_date && !sale.payment_date) {
				updates.payment_date = receipt.payment_date;
				needsUpdate = true;
			}
			
			// For pay_method, prioritize jorgebank from receipts if sale has transf
			if (receipt.pay_method === 'jorgebank' && (sale.pay_method === 'transf' || !sale.pay_method)) {
				updates.pay_method = receipt.pay_method;
				needsUpdate = true;
			}
			
			if (needsUpdate) {
				// Build dynamic update query
				if (updates.pay_method && updates.payment_source && updates.payment_date) {
					await sql`UPDATE sales SET pay_method=${updates.pay_method}, payment_source=${updates.payment_source}, payment_date=${updates.payment_date} WHERE id=${saleId}`;
				} else if (updates.payment_source && updates.payment_date) {
					await sql`UPDATE sales SET payment_source=${updates.payment_source}, payment_date=${updates.payment_date} WHERE id=${saleId}`;
				} else if (updates.pay_method && updates.payment_source) {
					await sql`UPDATE sales SET pay_method=${updates.pay_method}, payment_source=${updates.payment_source} WHERE id=${saleId}`;
				} else if (updates.pay_method && updates.payment_date) {
					await sql`UPDATE sales SET pay_method=${updates.pay_method}, payment_date=${updates.payment_date} WHERE id=${saleId}`;
				} else if (updates.payment_source) {
					await sql`UPDATE sales SET payment_source=${updates.payment_source} WHERE id=${saleId}`;
				} else if (updates.payment_date) {
					await sql`UPDATE sales SET payment_date=${updates.payment_date} WHERE id=${saleId}`;
				} else if (updates.pay_method) {
					await sql`UPDATE sales SET pay_method=${updates.pay_method} WHERE id=${saleId}`;
				}
				syncCount++;
			}
		}
		
		return { synced: syncCount, total: receipts.length };
	} catch (err) {
		console.error('Error syncing receipt payments:', err);
		throw err;
	}
}

export async function handler(event) {
	try {
		// Always ensure schema to allow migrations (payment_date column)
		await ensureSchema();
		
		if (event.httpMethod === 'OPTIONS') return json({ ok: true });
		switch (event.httpMethod) {
			case 'GET': {
				// Robust query parsing: support both rawQuery and queryStringParameters
				let raw = '';
				if (event.rawQuery && typeof event.rawQuery === 'string') raw = event.rawQuery;
				else if (event.queryStringParameters && typeof event.queryStringParameters === 'object') {
					raw = Object.entries(event.queryStringParameters)
						.map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v ?? '')}`)
						.join('&');
				}
				const params = new URLSearchParams(raw);
				
				// SYNC RECEIPTS ENDPOINT: Sync payment data from sale_receipts to sales
				const syncReceipts = params.get('sync_receipts');
				if (syncReceipts === 'true') {
					try {
						// Check admin permission
						const headers = (event.headers || {});
						const hActor = (headers['x-actor-name'] || headers['X-Actor-Name'] || headers['x-actor'] || '').toString();
						let qActor = '';
						try { const qs = new URLSearchParams(event.rawQuery || (event.queryStringParameters ? new URLSearchParams(event.queryStringParameters).toString() : '')); qActor = (qs.get('actor') || '').toString(); } catch {}
						const actorName = (hActor || qActor || '').toString();
						let role = 'user';
						if (actorName) {
							const r = await sql`SELECT role FROM users WHERE lower(username)=lower(${actorName}) LIMIT 1`;
							role = (r && r[0] && r[0].role) ? String(r[0].role) : 'user';
						}
						if (role !== 'admin' && role !== 'superadmin') {
							return json({ error: 'No autorizado' }, 403);
						}
						
						const result = await syncReceiptPaymentsToSales();
						return json({ ok: true, message: `Sincronizados ${result.synced} de ${result.total} recibos`, ...result });
					} catch (err) {
						return json({ error: 'Error en sincronización: ' + String(err) }, 500);
					}
				}
				
				// OPTIMIZED: Get all sales for a date range in a single query
				const dateRangeStart = params.get('date_range_start') || (event.queryStringParameters && event.queryStringParameters.date_range_start) || null;
				const dateRangeEnd = params.get('date_range_end') || (event.queryStringParameters && event.queryStringParameters.date_range_end) || null;
				if (dateRangeStart && dateRangeEnd) {
					const start = dateRangeStart.toString().slice(0,10);
					const end = dateRangeEnd.toString().slice(0,10);
					
					// Permission check for viewing sales
					try {
						const headers = (event.headers || {});
						const hActor = (headers['x-actor-name'] || headers['X-Actor-Name'] || headers['x-actor'] || '').toString();
						let qActor = '';
						try { const qs = new URLSearchParams(event.rawQuery || (event.queryStringParameters ? new URLSearchParams(event.queryStringParameters).toString() : '')); qActor = (qs.get('actor') || '').toString(); } catch {}
						const actorName = (hActor || qActor || '').toString();
						let role = 'user';
						if (actorName) {
							const r = await sql`SELECT role FROM users WHERE lower(username)=lower(${actorName}) LIMIT 1`;
							role = (r && r[0] && r[0].role) ? String(r[0].role) : 'user';
						}
						
						// Build the query based on permissions
						let rows;
						if (role === 'admin' || role === 'superadmin') {
						// Admin can see all sales - optimized query with minimal data
						rows = await sql`
							SELECT s.id, s.seller_id, s.sale_day_id, s.client_name, s.qty_arco, s.qty_melo, 
							       s.qty_mara, s.qty_oreo, s.qty_nute, s.is_paid, s.pay_method, s.payment_date, s.payment_source,
							       s.total_cents,
							       sd.day AS sale_day,
							       se.name AS seller_name
							FROM sales s
							INNER JOIN sale_days sd ON sd.id = s.sale_day_id
							INNER JOIN sellers se ON se.id = s.seller_id
							WHERE sd.day >= ${start} AND sd.day <= ${end}
							ORDER BY sd.day ASC, se.name ASC
						`;
						} else {
						// Non-admin can only see their own sales or sales they have permission to view
						rows = await sql`
							SELECT s.id, s.seller_id, s.sale_day_id, s.client_name, s.qty_arco, s.qty_melo, 
							       s.qty_mara, s.qty_oreo, s.qty_nute, s.is_paid, s.pay_method, s.payment_date, s.payment_source,
							       s.total_cents,
							       sd.day AS sale_day,
							       se.name AS seller_name
							FROM sales s
							INNER JOIN sale_days sd ON sd.id = s.sale_day_id
							INNER JOIN sellers se ON se.id = s.seller_id
							LEFT JOIN user_view_permissions uvp ON uvp.seller_id = s.seller_id 
							  AND lower(uvp.viewer_username) = lower(${actorName})
							WHERE sd.day >= ${start} AND sd.day <= ${end}
							  AND (lower(se.name) = lower(${actorName}) OR uvp.id IS NOT NULL)
							ORDER BY sd.day ASC, se.name ASC
						`;
						}
						
						// Enhance with sale_items data for each sale (optimized with a single query)
						if (rows.length > 0) {
							const saleIds = rows.map(r => r.id);
							const allItems = await sql`
								SELECT si.sale_id, si.dessert_id, si.quantity, d.short_code
								FROM sale_items si
								INNER JOIN desserts d ON d.id = si.dessert_id
								WHERE si.sale_id = ANY(${saleIds})
								ORDER BY si.sale_id, d.position ASC
							`;
							
							// Group items by sale_id (more efficient)
							const itemsBySaleId = {};
							for (const item of allItems) {
								if (!itemsBySaleId[item.sale_id]) {
									itemsBySaleId[item.sale_id] = [];
								}
								itemsBySaleId[item.sale_id].push({
									dessert_id: item.dessert_id,
									quantity: item.quantity,
									short_code: item.short_code
								});
							}
							
							// Attach items to each row
							for (const row of rows) {
								row.items = itemsBySaleId[row.id] || [];
							}
						}
						
						return json(rows);
					} catch (err) {
						return json({ error: 'Error de permisos: ' + String(err) }, 403);
					}
				}
				
				// New: list receipts across date range
				const receiptsRangeStart = params.get('receipts_start') || (event.queryStringParameters && event.queryStringParameters.receipts_start) || null;
				const receiptsRangeEnd = params.get('receipts_end') || (event.queryStringParameters && event.queryStringParameters.receipts_end) || null;
				if (receiptsRangeStart && receiptsRangeEnd) {
					const start = receiptsRangeStart.toString().slice(0,10);
					const end = receiptsRangeEnd.toString().slice(0,10);
					const rows = await sql`
						SELECT sr.id, sr.sale_id, sr.image_base64, sr.note_text, sr.created_at,
						       s.seller_id, s.sale_day_id, s.client_name, s.pay_method, s.payment_source, s.total_cents,
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
				}
				const historyFor = params.get('history_for') || (event.queryStringParameters && event.queryStringParameters.history_for);
				if (historyFor) {
					const saleId = Number(historyFor);
					if (!saleId) return json({ error: 'history_for inválido' }, 400);
					const rows = await sql`SELECT id, sale_id, field, old_value, new_value, user_name, created_at FROM change_logs WHERE sale_id=${saleId} ORDER BY created_at DESC, id DESC`;
					return json(rows);
				}
				// Fast context lookup: find seller_id and sale_day_id by sale id
				const findById = params.get('find_by_id') || (event.queryStringParameters && event.queryStringParameters.find_by_id);
				if (findById) {
					const saleId = Number(findById);
					if (!saleId) return json({ error: 'find_by_id inválido' }, 400);
					const row = (await sql`SELECT id, seller_id, sale_day_id FROM sales WHERE id=${saleId}`)[0] || null;
					return json(row || {});
				}
				const receiptFor = params.get('receipt_for') || (event.queryStringParameters && event.queryStringParameters.receipt_for);
				if (receiptFor) {
					const saleId = Number(receiptFor);
					if (!saleId) return json({ error: 'receipt_for inválido' }, 400);
					// Try to fetch with new columns, fallback to old schema if they don't exist
					let rows;
					try {
						rows = await sql`SELECT id, sale_id, image_base64, note_text, pay_method, payment_source, payment_date, created_at FROM sale_receipts WHERE sale_id=${saleId} ORDER BY created_at DESC, id DESC`;
					} catch (err) {
						// Fallback to old schema
						rows = await sql`SELECT id, sale_id, image_base64, note_text, created_at FROM sale_receipts WHERE sale_id=${saleId} ORDER BY created_at DESC, id DESC`;
					}
					return json(rows);
				}
				// Optimized client history: get all sales for a client across all days (including archived)
				const clientName = params.get('client_name') || (event.queryStringParameters && event.queryStringParameters.client_name);
				const clientSellerId = params.get('client_seller_id') || (event.queryStringParameters && event.queryStringParameters.client_seller_id);
				if (clientName && clientSellerId) {
					const sellerId = Number(clientSellerId);
					if (!sellerId) return json({ error: 'client_seller_id inválido' }, 400);
					
					// Permission check
					try {
						const headers = (event.headers || {});
						const hActor = (headers['x-actor-name'] || headers['X-Actor-Name'] || headers['x-actor'] || '').toString();
						let qActor = '';
						try { const qs = new URLSearchParams(event.rawQuery || (event.queryStringParameters ? new URLSearchParams(event.queryStringParameters).toString() : '')); qActor = (qs.get('actor') || '').toString(); } catch {}
						const actorName = (hActor || qActor || '').toString();
						let role = 'user';
						if (actorName) {
							const r = await sql`SELECT role FROM users WHERE lower(username)=lower(${actorName}) LIMIT 1`;
							role = (r && r[0] && r[0].role) ? String(r[0].role) : 'user';
						}
						if (role !== 'admin' && role !== 'superadmin') {
							const allowed = await sql`
								SELECT 1 FROM (
									SELECT s.id FROM sellers s WHERE lower(s.name)=lower(${actorName})
									UNION ALL
									SELECT uvp.seller_id FROM user_view_permissions uvp WHERE lower(uvp.viewer_username)=lower(${actorName})
								) x WHERE x.id=${sellerId} LIMIT 1`;
							if (!allowed.length) return json({ error: 'No autorizado' }, 403);
						}
					} catch {}
					
					// Single optimized query to get all sales for this client (including archived days)
					const rows = await sql`
						SELECT s.id, s.seller_id, s.sale_day_id, s.client_name, s.qty_arco, s.qty_melo, 
						       s.qty_mara, s.qty_oreo, s.qty_nute, s.is_paid, s.pay_method, s.payment_date, 
						       s.payment_source, s.comment_text, s.total_cents, s.created_at,
						       sd.day
						FROM sales s
						INNER JOIN sale_days sd ON sd.id = s.sale_day_id
						WHERE s.seller_id = ${sellerId} 
						  AND lower(s.client_name) = lower(${clientName})
						ORDER BY sd.day DESC, s.created_at DESC
					`;
					
					// Enhance with sale_items data for each sale (optimized batch query)
					if (rows.length > 0) {
						const saleIds = rows.map(r => r.id);
						const allItems = await sql`
							SELECT si.sale_id, si.id, si.dessert_id, si.quantity, si.unit_price, d.name, d.short_code
							FROM sale_items si
							JOIN desserts d ON d.id = si.dessert_id
							WHERE si.sale_id = ANY(${saleIds})
							ORDER BY si.sale_id, d.position ASC, d.id ASC
						`;
						
						// Group items by sale_id
						const itemsBySaleId = {};
						for (const item of allItems) {
							if (!itemsBySaleId[item.sale_id]) {
								itemsBySaleId[item.sale_id] = [];
							}
							itemsBySaleId[item.sale_id].push({
								id: item.id,
								dessert_id: item.dessert_id,
								quantity: item.quantity,
								unit_price: item.unit_price,
								name: item.name,
								short_code: item.short_code
							});
						}
						
						// Attach items to each row
						for (const row of rows) {
							row.items = itemsBySaleId[row.id] || [];
						}
					}
					
					return json(rows);
				}
				const sellerIdParam = params.get('seller_id') || (event.queryStringParameters && event.queryStringParameters.seller_id);
				const dayIdParam = params.get('sale_day_id') || (event.queryStringParameters && event.queryStringParameters.sale_day_id);
				const sellerId = Number(sellerIdParam);
				const saleDayId = dayIdParam ? Number(dayIdParam) : null;
				if (!sellerId) return json({ error: 'seller_id requerido' }, 400);
				// Permission check for viewing sales
				try {
					const headers = (event.headers || {});
					const hActor = (headers['x-actor-name'] || headers['X-Actor-Name'] || headers['x-actor'] || '').toString();
					let qActor = '';
					try { const qs = new URLSearchParams(event.rawQuery || (event.queryStringParameters ? new URLSearchParams(event.queryStringParameters).toString() : '')); qActor = (qs.get('actor') || '').toString(); } catch {}
					const actorName = (hActor || qActor || '').toString();
					let role = 'user';
					if (actorName) {
						const r = await sql`SELECT role FROM users WHERE lower(username)=lower(${actorName}) LIMIT 1`;
						role = (r && r[0] && r[0].role) ? String(r[0].role) : 'user';
					}
					if (role !== 'admin' && role !== 'superadmin') {
						const allowed = await sql`
							SELECT 1 FROM (
								SELECT s.id FROM sellers s WHERE lower(s.name)=lower(${actorName})
								UNION ALL
								SELECT uvp.seller_id FROM user_view_permissions uvp WHERE lower(uvp.viewer_username)=lower(${actorName})
							) x WHERE x.id=${sellerId} LIMIT 1`;
						if (!allowed.length) return json({ error: 'No autorizado' }, 403);
					}
				} catch {}
			let rows;
			if (saleDayId) {
				rows = await sql`SELECT id, seller_id, sale_day_id, client_name, qty_arco, qty_melo, qty_mara, qty_oreo, qty_nute, is_paid, pay_method, payment_date, payment_source, comment_text, total_cents, created_at FROM sales WHERE seller_id = ${sellerId} AND sale_day_id=${saleDayId} ORDER BY created_at DESC, id DESC`;
			} else {
				rows = await sql`SELECT id, seller_id, sale_day_id, client_name, qty_arco, qty_melo, qty_mara, qty_oreo, qty_nute, is_paid, pay_method, payment_date, payment_source, comment_text, total_cents, created_at FROM sales WHERE seller_id = ${sellerId} ORDER BY created_at DESC, id DESC`;
			}
				
				// Enhance with sale_items data for each sale
				for (const row of rows) {
					try {
						const items = await sql`
							SELECT si.id, si.dessert_id, si.quantity, si.unit_price, d.name, d.short_code
							FROM sale_items si
							JOIN desserts d ON d.id = si.dessert_id
							WHERE si.sale_id = ${row.id}
							ORDER BY d.position ASC, d.id ASC
						`;
						row.items = items || [];
					} catch (err) {
						// Table might not exist yet, or no items for this sale
						row.items = [];
					}
				}
				
				return json(rows);
			}
			case 'POST': {
				const data = JSON.parse(event.body || '{}');
                // Determine actor from headers/body for notification suppression logic
                let actor = '';
                try {
                    const headers = (event.headers || {});
                    const hActor = (headers['x-actor-name'] || headers['X-Actor-Name'] || headers['x-actor'] || '').toString();
                    const bActor = (data._actor_name || '').toString();
                    actor = (hActor || bActor || '').toString();
                } catch {}
                // Receipt upload flow
                if (data && data._upload_receipt_for) {
                    const sid = Number(data._upload_receipt_for);
                    const img = (data.image_base64 || '').toString();
                    const note = (data.note_text || '').toString();
                    const actor = (data._actor_name || '').toString();
                    if (!sid || !img) return json({ error: 'sale_id e imagen requeridos' }, 400);
                    
                    // Store receipt - try new columns first, fallback to old schema
                    let row;
                    try {
                        // Try with new columns - default pay_method to 'transf' for uploaded receipts
                        const payMethod = data.pay_method !== undefined ? (data.pay_method || null) : 'transf';
                        const paymentSource = data.payment_source !== undefined ? (data.payment_source || null) : null;
                        const paymentDate = data.payment_date !== undefined ? (data.payment_date || null) : null;
                        [row] = await sql`INSERT INTO sale_receipts (sale_id, image_base64, note_text, pay_method, payment_source, payment_date) VALUES (${sid}, ${img}, ${note}, ${payMethod}, ${paymentSource}, ${paymentDate}) RETURNING *`;
                        
                        // IMPORTANTE: También actualizar la tabla sales con payment_source y payment_date
                        // para que el reporte de cartera pueda mostrar esta información
                        if (paymentSource !== null || paymentDate !== null) {
                            if (paymentSource !== null && paymentDate !== null) {
                                await sql`UPDATE sales SET payment_source=${paymentSource}, payment_date=${paymentDate} WHERE id=${sid}`;
                            } else if (paymentSource !== null) {
                                await sql`UPDATE sales SET payment_source=${paymentSource} WHERE id=${sid}`;
                            } else if (paymentDate !== null) {
                                await sql`UPDATE sales SET payment_date=${paymentDate} WHERE id=${sid}`;
                            }
                        }
                    } catch (err) {
                        // Fallback to old schema without payment columns
                        console.error('New columns not available, using old schema:', err.message);
                        [row] = await sql`INSERT INTO sale_receipts (sale_id, image_base64, note_text) VALUES (${sid}, ${img}, ${note}) RETURNING *`;
                    }
                    
                    try {
                        // After uploading a receipt, mark pay_method as 'transf' on sale level if not already a bank method
                        const prev = (await sql`SELECT seller_id, sale_day_id, client_name, pay_method FROM sales WHERE id=${sid}`)[0] || null;
                        if (prev) {
                            const prevPm = (prev.pay_method || '').toString();
                            const isAlreadyBank = prevPm === 'transf' || prevPm === 'jorgebank' || prevPm === 'marce' || prevPm === 'jorge';
                            if (!isAlreadyBank) {
                                await sql`UPDATE sales SET pay_method='transf' WHERE id=${sid}`;
                                try {
                                    const msg = `${prev.client_name || 'Cliente'} pago: - → Transferencia` + (actor ? ` - ${actor}` : '');
                                    const iconUrl = '/icons/bank.svg';
                                    await notifyDb({ type: 'pay', sellerId: Number(prev.seller_id||0)||null, saleId: sid, saleDayId: Number(prev.sale_day_id||0)||null, message: msg, actorName: actor, iconUrl, payMethod: 'transf' });
                                } catch {}
                            }
                        }
                    } catch {}
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
				const [row] = await sql`INSERT INTO sales (seller_id, sale_day_id) VALUES (${sellerId}, ${saleDayId}) RETURNING id, seller_id, sale_day_id, client_name, qty_arco, qty_melo, qty_mara, qty_oreo, qty_nute, is_paid, pay_method, payment_date, payment_source, comment_text, total_cents, created_at`;
				// Note: detailed order notification is emitted after quantities are set (in PUT)
				return json(row, 201);
			}
			case 'PUT': {
			const data = JSON.parse(event.body || '{}');
			// Handle receipt payment update
			if (data._update_receipt_payment) {
				const receiptId = Number(data.receipt_id);
				if (!receiptId) return json({ error: 'receipt_id requerido' }, 400);
				
				const payMethod = data.pay_method !== undefined ? (data.pay_method || null) : undefined;
				const paymentSource = data.payment_source !== undefined ? (data.payment_source || null) : undefined;
				const paymentDate = data.payment_date !== undefined ? (data.payment_date || null) : undefined;
				
				try {
					// Try to update with new columns
					if (payMethod !== undefined && paymentSource !== undefined && paymentDate !== undefined) {
						// All three fields provided
						await sql`UPDATE sale_receipts SET pay_method=${payMethod}, payment_source=${paymentSource}, payment_date=${paymentDate} WHERE id=${receiptId}`;
					} else if (payMethod !== undefined && paymentSource === undefined && paymentDate === undefined) {
						// Only pay_method
						await sql`UPDATE sale_receipts SET pay_method=${payMethod} WHERE id=${receiptId}`;
					} else if (payMethod !== undefined && paymentSource !== undefined) {
						// pay_method and payment_source
						await sql`UPDATE sale_receipts SET pay_method=${payMethod}, payment_source=${paymentSource} WHERE id=${receiptId}`;
					} else if (payMethod !== undefined && paymentDate !== undefined) {
						// pay_method and payment_date
						await sql`UPDATE sale_receipts SET pay_method=${payMethod}, payment_date=${paymentDate} WHERE id=${receiptId}`;
					} else if (paymentSource !== undefined && paymentDate !== undefined) {
						// payment_source and payment_date
						await sql`UPDATE sale_receipts SET payment_source=${paymentSource}, payment_date=${paymentDate} WHERE id=${receiptId}`;
					} else if (paymentSource !== undefined) {
						// Only payment_source
						await sql`UPDATE sale_receipts SET payment_source=${paymentSource} WHERE id=${receiptId}`;
					} else if (paymentDate !== undefined) {
						// Only payment_date
						await sql`UPDATE sale_receipts SET payment_date=${paymentDate} WHERE id=${receiptId}`;
					}
					
					const [updated] = await sql`SELECT id, sale_id, pay_method, payment_source, payment_date FROM sale_receipts WHERE id=${receiptId}`;
					
					// IMPORTANTE: También actualizar la tabla sales con los mismos datos
					// para que el reporte de cartera pueda mostrar esta información
					if (updated && updated.sale_id) {
						const saleId = updated.sale_id;
						
						// Construir el UPDATE dinámicamente según los campos que se actualizaron
						if (payMethod !== undefined && paymentSource !== undefined && paymentDate !== undefined) {
							await sql`UPDATE sales SET pay_method=${payMethod}, payment_source=${paymentSource}, payment_date=${paymentDate} WHERE id=${saleId}`;
						} else if (paymentSource !== undefined && paymentDate !== undefined) {
							await sql`UPDATE sales SET payment_source=${paymentSource}, payment_date=${paymentDate} WHERE id=${saleId}`;
						} else if (paymentSource !== undefined) {
							await sql`UPDATE sales SET payment_source=${paymentSource} WHERE id=${saleId}`;
						} else if (paymentDate !== undefined) {
							await sql`UPDATE sales SET payment_date=${paymentDate} WHERE id=${saleId}`;
						}
						// Si solo se actualiza pay_method, ya se maneja en otro lugar del código
					}
					
					return json(updated || {});
				} catch (err) {
					// Columns might not exist yet - just return success anyway
					console.error('Error updating receipt payment (columns might not exist):', err.message);
					// Return the receipt ID so the frontend doesn't error
					return json({ id: receiptId, sale_id: data.sale_id || null, pay_method: payMethod, payment_source: paymentSource, payment_date: paymentDate });
				}
			}
			const id = Number(data.id);
			if (!id) return json({ error: 'id requerido' }, 400);
			const current = (await sql`SELECT seller_id, sale_day_id, client_name, qty_arco, qty_melo, qty_mara, qty_oreo, qty_nute, is_paid, pay_method, payment_date, payment_source, comment_text, created_at FROM sales WHERE id=${id}`)[0] || {};
			// Authorization: if sale has a pay_method already set, only admin/superadmin may edit
			try {
				const headers = (event.headers || {});
				const hActor = (headers['x-actor-name'] || headers['X-Actor-Name'] || headers['x-actor'] || '').toString();
				const bActor = (data._actor_name || '').toString();
				let qActor = '';
				try { const qs = new URLSearchParams(event.rawQuery || (event.queryStringParameters ? new URLSearchParams(event.queryStringParameters).toString() : '')); qActor = (qs.get('actor') || '').toString(); } catch {}
				const actorName = (hActor || bActor || qActor || '').toString();
				let role = 'user';
				if (actorName) {
					const r = await sql`SELECT role FROM users WHERE lower(username)=lower(${actorName}) LIMIT 1`;
					role = (r && r[0] && r[0].role) ? String(r[0].role) : 'user';
				}
				const locked = String(current.pay_method || '').trim() !== '';
				if (locked && role !== 'admin' && role !== 'superadmin') {
					// Exception: allow changing from 'entregado' to 'efectivo' for non-admins
					let allowException = false;
					try {
						const prevPm = String(current.pay_method || '').trim().toLowerCase();
						const hasPayMethodField = Object.prototype.hasOwnProperty.call(data, 'pay_method');
						const nextPm = hasPayMethodField ? String(data.pay_method || '').trim().toLowerCase() : null;
						allowException = (prevPm === 'entregado' && nextPm === 'efectivo');
					} catch {}
					if (!allowException) {
						return json({ error: 'Pedido bloqueado: solo admin/superadmin puede editar' }, 403);
					}
				}
			} catch {}
				const createdAt = current.created_at ? new Date(current.created_at) : null;
				const withinGrace = createdAt ? ((new Date()) - createdAt) < 120000 : false; // 2 minutes
				const client = (data.client_name ?? '').toString();
				const comment = (Object.prototype.hasOwnProperty.call(data, 'comment_text')) ? (data.comment_text ?? '') : current.comment_text;
				
				// Support for new dynamic items structure
				const items = Array.isArray(data.items) ? data.items : null;
				
				// Support for legacy qty columns (backward compatibility)
				const qa = Number(data.qty_arco ?? 0) || 0;
				const qm = Number(data.qty_melo ?? 0) || 0;
				const qma = Number(data.qty_mara ?? 0) || 0;
				const qo = Number(data.qty_oreo ?? 0) || 0;
			const qn = Number(data.qty_nute ?? 0) || 0;
			const paid = (data.is_paid === true || data.is_paid === 'true') ? true : (data.is_paid === false || data.is_paid === 'false') ? false : current.is_paid;
			const payMethod = (Object.prototype.hasOwnProperty.call(data, 'pay_method')) ? (data.pay_method ?? null) : current.pay_method;
			const paymentDate = (Object.prototype.hasOwnProperty.call(data, 'payment_date')) ? (data.payment_date ?? null) : current.payment_date;
			const paymentSource = (Object.prototype.hasOwnProperty.call(data, 'payment_source')) ? (data.payment_source ?? null) : current.payment_source;
			
			// Update sale basic info
			await sql`UPDATE sales SET client_name=${client}, comment_text=${comment}, qty_arco=${qa}, qty_melo=${qm}, qty_mara=${qma}, qty_oreo=${qo}, qty_nute=${qn}, is_paid=${paid}, pay_method=${payMethod}, payment_date=${paymentDate}, payment_source=${paymentSource} WHERE id=${id}`;
				
				// If items are provided, update sale_items table
				if (items !== null) {
					// Delete existing items
					await sql`DELETE FROM sale_items WHERE sale_id = ${id}`;
					
					// Insert new items
					for (const item of items) {
						const dessertId = Number(item.dessert_id || 0) || 0;
						const quantity = Number(item.quantity || 0) || 0;
						const unitPrice = Number(item.unit_price || 0) || 0;
						
						if (dessertId > 0 && quantity > 0) {
							await sql`INSERT INTO sale_items (sale_id, dessert_id, quantity, unit_price) VALUES (${id}, ${dessertId}, ${quantity}, ${unitPrice})`;
						}
					}
				}
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
					const sellerIdForNotif = Number(data.seller_id||0) || Number(current.seller_id||0) || null;
					const saleDayIdForNotif = Number(data.sale_day_id||0) || Number(current.sale_day_id||0) || null;
					await notifyDb({ type: 'qty', sellerId: sellerIdForNotif, saleId: id, saleDayId: saleDayIdForNotif, message: msg, actorName: actor });
				}
				// Detect initial creation update: all previous quantities were 0 and now there are items
				const prevSum = Number(current.qty_arco||0) + Number(current.qty_melo||0) + Number(current.qty_mara||0) + Number(current.qty_oreo||0) + Number(current.qty_nute||0);
				const nextSum = Number(qa||0) + Number(qm||0) + Number(qma||0) + Number(qo||0) + Number(qn||0);
				const isInitialCreation = withinGrace && prevSum === 0 && nextSum > 0;
				if (!isInitialCreation) {
					await emitQty('arco', current.qty_arco ?? 0, qa ?? 0);
					await emitQty('melo', current.qty_melo ?? 0, qm ?? 0);
					await emitQty('mara', current.qty_mara ?? 0, qma ?? 0);
					await emitQty('oreo', current.qty_oreo ?? 0, qo ?? 0);
					await emitQty('nute', current.qty_nute ?? 0, qn ?? 0);
				} else {
					// Emit a single detailed notification for the new order
					const parts = [];
					if (Number(qa||0) > 0) parts.push(`${qa} arco`);
					if (Number(qm||0) > 0) parts.push(`${qm} melo`);
					if (Number(qma||0) > 0) parts.push(`${qma} mara`);
					if (Number(qo||0) > 0) parts.push(`${qo} oreo`);
					if (Number(qn||0) > 0) parts.push(`${qn} nute`);
					const sellerIdForNotif = Number(data.seller_id||0) || Number(current.seller_id||0) || null;
					const saleDayIdForNotif = Number(data.sale_day_id||0) || Number(current.sale_day_id||0) || null;
					const msg = `${client || 'Cliente'}: ${parts.join(' + ')}` + (actor ? ` - ${actor}` : '');
					await notifyDb({ type: 'create', sellerId: sellerIdForNotif, saleId: id, saleDayId: saleDayIdForNotif, message: msg, actorName: actor });
				}
				// emit notification for payment method change
				try {
					const prevPm = (current.pay_method || '').toString();
					const nextPm = (payMethod || '').toString();
					if (prevPm !== nextPm) {
						const fmt = (v) => v === 'efectivo' ? 'Efectivo' : v === 'entregado' ? 'Entregado' : (v === 'transf' || v === 'jorgebank') ? 'Transferencia' : v === 'marce' ? 'Marce' : v === 'jorge' ? 'Jorge' : '-';
						const msg = `${client || 'Cliente'} pago: ${fmt(prevPm)} → ${fmt(nextPm)}` + (actor ? ` - ${actor}` : '');
					const iconUrl = nextPm === 'efectivo' ? '/icons/bill.svg' : nextPm === 'entregado' ? '/icons/delivered-pink.svg' : nextPm === 'transf' ? '/icons/bank.svg' : nextPm === 'jorgebank' ? '/icons/bank-yellow.svg' : nextPm === 'marce' ? '/icons/marce7.svg?v=1' : nextPm === 'jorge' ? '/icons/jorge7.svg?v=1' : null;
						await notifyDb({ type: 'pay', sellerId: Number(data.seller_id||0)||null, saleId: id, saleDayId: Number(data.sale_day_id||0)||null, message: msg, actorName: actor, iconUrl, payMethod: nextPm });
					}
				} catch {}
				const row = await recalcTotalForId(id);
				return json(row);
			}
			case 'DELETE': {
				const rawQs = (typeof event.rawQuery === 'string' && event.rawQuery.length)
					? event.rawQuery
					: (event.queryStringParameters ? new URLSearchParams(event.queryStringParameters).toString() : '');
				const params = new URLSearchParams(rawQs);
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
				// fetch previous data and enforce authorization for locked sales
				const prev = (await sql`SELECT seller_id, sale_day_id, client_name, qty_arco, qty_melo, qty_mara, qty_oreo, qty_nute, pay_method, payment_source FROM sales WHERE id=${id}`)[0] || null;
				try {
					const headers = (event.headers || {});
					const hActor = (headers['x-actor-name'] || headers['X-Actor-Name'] || headers['x-actor'] || '').toString();
					const actorName = (hActor || actor || '').toString();
					let role = 'user';
					if (actorName) {
						const r = await sql`SELECT role FROM users WHERE lower(username)=lower(${actorName}) LIMIT 1`;
						role = (r && r[0] && r[0].role) ? String(r[0].role) : 'user';
					}
					const locked = String(prev?.pay_method || '').trim() !== '';
					if (locked && role !== 'admin' && role !== 'superadmin') {
						return json({ error: 'Pedido bloqueado: solo admin/superadmin puede eliminar' }, 403);
					}
				} catch {}
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
					const msg = `Eliminado: ${name}${suffix}${tail}`;
					const pm = (prev?.pay_method || '').toString();
				const iconUrl = pm === 'efectivo' ? '/icons/bill.svg' : pm === 'entregado' ? '/icons/delivered-pink.svg' : pm === 'transf' ? '/icons/bank.svg' : pm === 'jorgebank' ? '/icons/bank-yellow.svg' : pm === 'marce' ? '/icons/marce7.svg?v=1' : pm === 'jorge' ? '/icons/jorge7.svg?v=1' : null;
					// Do not reference deleted sale_id to avoid FK violation
					await notifyDb({ type: 'delete', sellerId: Number(prev.seller_id||0)||null, saleId: null, saleDayId: Number(prev.sale_day_id||0)||null, message: msg, actorName: actor, iconUrl, payMethod: pm });
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