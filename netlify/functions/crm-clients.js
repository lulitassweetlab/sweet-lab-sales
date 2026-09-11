import { ensureSchema, sql, normalizeClientName } from './_db.js';

function json(body, status = 200) {
    return { statusCode: status, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) };
}

function getQueryParams(event) {
    const params = new URLSearchParams(event.rawQuery || '');
    const fallback = event.queryStringParameters || {};
    for (const [key, value] of Object.entries(fallback)) {
        if (value === undefined || value === null) continue;
        if (!params.has(key)) params.set(key, String(value));
    }
    return params;
}

export async function handler(event) {
    try {
        await ensureSchema();
        if (event.httpMethod === 'OPTIONS') return json({ ok: true });

        if (event.httpMethod === 'POST') {
            const data = JSON.parse(event.body || '{}');
            const params = getQueryParams(event);
            const action = data.action || params.get('action');

            if (action === 'merge') {
                const sellerId = Number(data.seller_id);
                if (!sellerId) return json({ error: 'Falta seller_id' }, 400);

                const sourceNames = (data.source_names || []).map(n => normalizeClientName(n));
                if (!Array.isArray(sourceNames) || sourceNames.length === 0) {
                    return json({ error: 'Se requiere una lista de nombres para fusionar' }, 400);
                }

                const name = normalizeClientName(data.name);
                const shortName = data.short_name;
                const whatsapp = data.whatsapp;
                const birthDate = data.birth_date;
                const description = data.description;
                const address = data.address;
                const latitude = data.latitude;
                const longitude = data.longitude;

                // 1. Ensure/Update the target client profile (Manual Upsert to avoid ON CONFLICT errors)
                let targetClient;
                const existingTargetRes = await sql`SELECT * FROM clients WHERE name = ${name} AND seller_id = ${sellerId} LIMIT 1`;
                
                if (existingTargetRes.length > 0) {
                    const row = existingTargetRes[0];
                    const [updated] = await sql`
                        UPDATE clients SET
                            short_name = COALESCE(clients.short_name, ${shortName}),
                            whatsapp = COALESCE(clients.whatsapp, ${whatsapp}),
                            birth_date = COALESCE(clients.birth_date, ${birthDate}),
                            description = COALESCE(clients.description, ${description}),
                            address = COALESCE(clients.address, ${address}),
                            latitude = COALESCE(clients.latitude, ${latitude}),
                            longitude = COALESCE(clients.longitude, ${longitude})
                        WHERE id = ${row.id}
                        RETURNING *
                    `;
                    targetClient = updated;
                } else {
                    const [inserted] = await sql`
                        INSERT INTO clients (seller_id, name, short_name, whatsapp, birth_date, description, address, latitude, longitude)
                        VALUES (${sellerId}, ${name}, ${shortName}, ${whatsapp}, ${birthDate}, ${description}, ${address}, ${latitude}, ${longitude})
                        RETURNING *
                    `;
                    targetClient = inserted;
                }

                // 2. Identify all Source IDs
                const lowerNames = sourceNames.map(n => n.toLowerCase());
                const sourceClients = await sql`
                    SELECT id FROM clients 
                    WHERE seller_id = ${sellerId} AND LOWER(name) = ANY(${lowerNames})
                      AND id != ${targetClient.id}
                `;
                const sourceIds = sourceClients.map(c => c.id);

                if (sourceIds.length > 0) {
                    // Update Sales records (String-based link)
                    await sql`
                        UPDATE sales 
                        SET client_name = ${targetClient.name}
                        WHERE seller_id = ${sellerId} AND LOWER(client_name) = ANY(${lowerNames})
                    `;

                    // REBIND ALL RELATED TABLES
                    // A) Sales Bridge (crm_client_sales) - Handle unique sale_id
                    await sql`
                        UPDATE crm_client_sales 
                        SET client_id = ${targetClient.id}
                        WHERE client_id = ANY(${sourceIds})
                          AND sale_id NOT IN (SELECT sale_id FROM crm_client_sales WHERE client_id = ${targetClient.id})
                    `;
                    await sql`DELETE FROM crm_client_sales WHERE client_id = ANY(${sourceIds})`;

                    // B) Tags (crm_client_tags) - Handle unique (client_id, tag_id)
                    await sql`
                        INSERT INTO crm_client_tags (client_id, tag_id)
                        SELECT ${targetClient.id}, tag_id FROM crm_client_tags
                        WHERE client_id = ANY(${sourceIds})
                        ON CONFLICT DO NOTHING
                    `;
                    await sql`DELETE FROM crm_client_tags WHERE client_id = ANY(${sourceIds})`;

                    // C) Stages (crm_client_stage) - Handle unique client_id
                    const [targetStage] = await sql`SELECT 1 FROM crm_client_stage WHERE client_id = ${targetClient.id}`;
                    if (targetStage) {
                        await sql`DELETE FROM crm_client_stage WHERE client_id = ANY(${sourceIds})`;
                    } else {
                        const [srcStage] = await sql`SELECT * FROM crm_client_stage WHERE client_id = ANY(${sourceIds}) ORDER BY updated_at DESC LIMIT 1`;
                        if (srcStage) {
                            await sql`DELETE FROM crm_client_stage WHERE client_id = ANY(${sourceIds})`;
                            await sql`INSERT INTO crm_client_stage (client_id, stage_id, updated_by, updated_at) 
                                     VALUES (${targetClient.id}, ${srcStage.stage_id}, ${srcStage.updated_by}, ${srcStage.updated_at}) 
                                     ON CONFLICT DO NOTHING`;
                        }
                    }

                    // D) Simple Move
                    await sql`UPDATE crm_activities SET client_id = ${targetClient.id} WHERE client_id = ANY(${sourceIds})`;
                    await sql`UPDATE crm_reminders SET client_id = ${targetClient.id} WHERE client_id = ANY(${sourceIds})`;
                    await sql`UPDATE crm_whatsapp_logs SET client_id = ${targetClient.id} WHERE client_id = ANY(${sourceIds})`;
                    await sql`UPDATE crm_stage_history SET client_id = ${targetClient.id} WHERE client_id = ANY(${sourceIds})`;
                    await sql`UPDATE crm_stage_actions SET client_id = ${targetClient.id} WHERE client_id = ANY(${sourceIds})`;

                    // E) Final Cleanup
                    await sql`DELETE FROM clients WHERE id = ANY(${sourceIds})`;
                }

                return json({ success: true, target_client: targetClient });
            }

            if (action === 'mark_dashboard_check') {
                const clientId = Number(data.client_id);
                const type = data.type; // 'birthday', 'inactive'
                const sellerName = data.seller_name || 'Vendedor';
                if (!clientId) return json({ error: 'Falta client_id' }, 400);

                // Fetch seller_id from the client record
                const clientRes = await sql`SELECT seller_id FROM clients WHERE id = ${clientId}`;
                const sellerId = clientRes[0]?.seller_id;
                if (!sellerId) return json({ error: 'Vendedor no encontrado para este cliente' }, 404);

                await sql`UPDATE clients SET last_dashboard_check = now() WHERE id = ${clientId}`;
                
                let note = 'Dashboard task completada';
                if (type === 'birthday') note = '✅ Se felicitó al cliente por su cumpleaños';
                else if (type === 'inactive') note = '✅ Se contactó al cliente inactivo para reactivación';

                await sql`
                    INSERT INTO crm_activities (client_id, seller_id, activity_type, description, created_by)
                    VALUES (${clientId}, ${sellerId}, 'note', ${note}, ${sellerName})
                `;
                return json({ ok: true });
            }

            if (action === 'transfer') {
                const actorName = (data.actor_name || event.headers?.['x-actor-name'] || event.headers?.['X-Actor-Name'] || '').toString().trim();
                let isAuthorized = false;
                if (['jorge', 'marcela'].includes(actorName.toLowerCase())) {
                    isAuthorized = true;
                } else if (actorName) {
                    const [actorRow] = await sql`SELECT role FROM users WHERE lower(username) = lower(${actorName}) LIMIT 1`;
                    if (actorRow && (actorRow.role === 'superadmin' || actorRow.role === 'admin')) {
                        isAuthorized = true;
                    }
                }
                if (!isAuthorized) {
                    return json({ error: 'Solo superadmin puede transferir clientes' }, 403);
                }

                const targetSellerId = Number(data.target_seller_id);
                if (!targetSellerId) return json({ error: 'Falta target_seller_id' }, 400);

                const [targetSeller] = await sql`SELECT id, name FROM sellers WHERE id = ${targetSellerId} LIMIT 1`;
                if (!targetSeller) return json({ error: 'Vendedor destino no encontrado' }, 404);

                let clientIds = data.client_ids;
                if (!Array.isArray(clientIds) && data.client_id) {
                    clientIds = [Number(data.client_id)];
                }
                clientIds = (clientIds || []).map(id => Number(id)).filter(id => !isNaN(id) && id > 0);
                if (clientIds.length === 0) {
                    return json({ error: 'No se seleccionaron clientes para transferir' }, 400);
                }

                const originClients = await sql`
                    SELECT c.*, s.name as origin_seller_name 
                    FROM clients c 
                    LEFT JOIN sellers s ON c.seller_id = s.id 
                    WHERE c.id = ANY(${clientIds})
                `;

                if (originClients.length === 0) {
                    return json({ error: 'Ningún cliente encontrado' }, 404);
                }

                let transferredCount = 0;
                for (const c of originClients) {
                    if (c.seller_id === targetSellerId) continue;

                    // 1. Check if target seller already has a client with the same name
                    const existingTarget = await sql`
                        SELECT * FROM clients 
                        WHERE seller_id = ${targetSellerId} AND LOWER(name) = LOWER(${c.name})
                        LIMIT 1
                    `;

                    if (existingTarget.length > 0) {
                        // MERGE SCENARIO
                        const targetClient = existingTarget[0];
                        await sql`
                            UPDATE clients SET
                                short_name = COALESCE(clients.short_name, ${c.short_name}),
                                whatsapp = COALESCE(clients.whatsapp, ${c.whatsapp}),
                                birth_date = COALESCE(clients.birth_date, ${c.birth_date}),
                                description = COALESCE(clients.description, ${c.description}),
                                address = COALESCE(clients.address, ${c.address}),
                                latitude = COALESCE(clients.latitude, ${c.latitude}),
                                longitude = COALESCE(clients.longitude, ${c.longitude})
                            WHERE id = ${targetClient.id}
                        `;

                        // Rebind sales bridge
                        await sql`
                            UPDATE crm_client_sales
                            SET client_id = ${targetClient.id}, seller_id = ${targetSellerId}
                            WHERE client_id = ${c.id}
                              AND sale_id NOT IN (SELECT sale_id FROM crm_client_sales WHERE client_id = ${targetClient.id})
                        `;
                        await sql`DELETE FROM crm_client_sales WHERE client_id = ${c.id}`;

                        // Rebind activities
                        await sql`UPDATE crm_activities SET client_id = ${targetClient.id}, seller_id = ${targetSellerId} WHERE client_id = ${c.id}`;

                        // Rebind reminders
                        await sql`UPDATE crm_reminders SET client_id = ${targetClient.id}, seller_id = ${targetSellerId} WHERE client_id = ${c.id}`;

                        // Rebind whatsapp logs
                        await sql`UPDATE crm_whatsapp_logs SET client_id = ${targetClient.id} WHERE client_id = ${c.id}`;

                        // Rebind tags
                        const originTags = await sql`SELECT tag_id FROM crm_client_tags WHERE client_id = ${c.id}`;
                        for (const ot of originTags) {
                            const [tagInfo] = await sql`SELECT name, color FROM crm_tags WHERE id = ${ot.tag_id}`;
                            if (tagInfo) {
                                let [tTag] = await sql`SELECT id FROM crm_tags WHERE seller_id = ${targetSellerId} AND lower(name) = lower(${tagInfo.name}) LIMIT 1`;
                                if (!tTag) {
                                    [tTag] = await sql`INSERT INTO crm_tags (seller_id, name, color) VALUES (${targetSellerId}, ${tagInfo.name}, ${tagInfo.color}) RETURNING id`;
                                }
                                if (tTag && tTag.id) {
                                    await sql`INSERT INTO crm_client_tags (client_id, tag_id) VALUES (${targetClient.id}, ${tTag.id}) ON CONFLICT DO NOTHING`;
                                }
                            }
                        }
                        await sql`DELETE FROM crm_client_tags WHERE client_id = ${c.id}`;

                        // Delete merged origin client
                        await sql`DELETE FROM clients WHERE id = ${c.id}`;

                        // Audit activity note
                        await sql`
                            INSERT INTO crm_activities (client_id, seller_id, activity_type, description, created_by)
                            VALUES (${targetClient.id}, ${targetSellerId}, 'note', ${'🔄 Cliente fusionado y transferido desde ' + (c.origin_seller_name || 'vendedor anterior') + ' por ' + (actorName || 'Superadmin')}, ${actorName || 'Superadmin'})
                        `;
                    } else {
                        // DIRECT TRANSFER SCENARIO
                        await sql`UPDATE clients SET seller_id = ${targetSellerId} WHERE id = ${c.id}`;
                        await sql`UPDATE crm_client_sales SET seller_id = ${targetSellerId} WHERE client_id = ${c.id}`;
                        await sql`UPDATE crm_reminders SET seller_id = ${targetSellerId} WHERE client_id = ${c.id}`;
                        await sql`UPDATE crm_activities SET seller_id = ${targetSellerId} WHERE client_id = ${c.id}`;

                        // Replicate tags to target seller
                        const originTags = await sql`SELECT tag_id FROM crm_client_tags WHERE client_id = ${c.id}`;
                        for (const ot of originTags) {
                            const [tagInfo] = await sql`SELECT name, color FROM crm_tags WHERE id = ${ot.tag_id}`;
                            if (tagInfo) {
                                let [tTag] = await sql`SELECT id FROM crm_tags WHERE seller_id = ${targetSellerId} AND lower(name) = lower(${tagInfo.name}) LIMIT 1`;
                                if (!tTag) {
                                    [tTag] = await sql`INSERT INTO crm_tags (seller_id, name, color) VALUES (${targetSellerId}, ${tagInfo.name}, ${tagInfo.color}) RETURNING id`;
                                }
                                if (tTag && tTag.id && tTag.id !== ot.tag_id) {
                                    await sql`DELETE FROM crm_client_tags WHERE client_id = ${c.id} AND tag_id = ${ot.tag_id}`;
                                    await sql`INSERT INTO crm_client_tags (client_id, tag_id) VALUES (${c.id}, ${tTag.id}) ON CONFLICT DO NOTHING`;
                                }
                            }
                        }

                        // Audit activity note
                        await sql`
                            INSERT INTO crm_activities (client_id, seller_id, activity_type, description, created_by)
                            VALUES (${c.id}, ${targetSellerId}, 'note', ${'🔄 Cliente transferido desde ' + (c.origin_seller_name || 'vendedor anterior') + ' por ' + (actorName || 'Superadmin')}, ${actorName || 'Superadmin'})
                        `;
                    }
                    transferredCount++;
                }

                return json({
                    success: true,
                    count: transferredCount,
                    transferred_count: transferredCount,
                    target_seller_name: targetSeller.name
                });
            }

            return json({ error: 'Acción no válida' }, 400);
        }

        const params = getQueryParams(event);
        const sellerId = Number(params.get('seller_id'));
        if (!sellerId) return json({ error: 'Falta seller_id' }, 400);

        if (event.httpMethod === 'GET') {
            const id = Number(params.get('id'));

            // If an ID is provided, return the "Client 360° Profile"
            if (id) {
                // 1. Basic client info + advanced metrics
                const clientQuery = await sql`
                    SELECT 
                        c.id, c.name, c.short_name, c.whatsapp, c.birth_date, c.description,
                        c.address, c.latitude, c.longitude,
                        COUNT(s.id) as total_orders,
                        COALESCE(SUM(s.total_cents), 0) as lifetime_value_cents,
                        MAX(sd.day)::text as last_purchase_date,
                        COALESCE(SUM(CASE WHEN s.pay_method IS NULL OR s.pay_method = '' OR s.pay_method = '-' OR s.pay_method = 'entregado' THEN s.total_cents ELSE 0 END), 0) as total_debt_cents,
                        (
                            SELECT json_agg(json_build_object('id', t.id, 'name', t.name, 'color', t.color))
                            FROM crm_client_tags ct
                            JOIN crm_tags t ON ct.tag_id = t.id
                            WHERE ct.client_id = c.id
                        ) as custom_tags
                    FROM clients c
                    LEFT JOIN crm_client_sales cs ON c.id = cs.client_id
                    LEFT JOIN sales s ON cs.sale_id = s.id
                    LEFT JOIN sale_days sd ON s.sale_day_id = sd.id
                    WHERE c.seller_id = ${sellerId} AND c.id = ${id}
                    GROUP BY c.id, c.name, c.short_name, c.whatsapp, c.birth_date, c.description, c.address, c.latitude, c.longitude
                `;
                if (!clientQuery.length) return json({ error: 'Cliente no encontrado' }, 404);
                const profile = clientQuery[0];

                // 2. Sales History (Read-only directly from sales table via bridge)
                const sales = await sql`
                    SELECT s.id, sd.day::text as created_at, s.total_cents, s.is_paid, s.pay_method,
                           s.qty_arco, s.qty_melo, s.qty_mara, s.qty_oreo, s.qty_nute,
                           (
                               SELECT json_agg(json_build_object('name', d.short_code, 'name_full', d.name, 'qty', i.quantity))
                               FROM sale_items i
                               JOIN desserts d ON d.id = i.dessert_id
                               WHERE i.sale_id = s.id
                           ) as dynamic_items
                    FROM sales s
                    JOIN crm_client_sales cs ON s.id = cs.sale_id
                    JOIN sale_days sd ON s.sale_day_id = sd.id
                    WHERE cs.client_id = ${id}
                    ORDER BY sd.day DESC
                `;
                
                // 3. Activity History
                const activities = await sql`
                    SELECT id, activity_type, description, metadata, created_by, created_at, related_sale_id
                    FROM crm_activities
                    WHERE client_id = ${id}
                    ORDER BY created_at DESC
                `;

                // 4. Pending Reminders specifically for this client
                const reminders = await sql`
                    SELECT id, title, description, due_date, reminder_type, priority, completed, completed_at
                    FROM crm_reminders
                    WHERE client_id = ${id}
                    ORDER BY priority DESC, due_date ASC
                `;

                return json({
                    profile,
                    sales: sales || [],
                    activities: activities || [],
                    reminders: reminders || []
                });
            }

            // Otherwise, return the specific directory of clients for list views
            const directory = await sql`
                SELECT 
                    c.id, c.name, c.short_name, c.whatsapp,
                    c.address, c.latitude, c.longitude,
                    st.name as stage_name, st.color as stage_color,
                    COUNT(s.id)::int as total_orders,
                    COALESCE(SUM(s.total_cents), 0)::int as lifetime_value_cents,
                    MAX(sd.day)::text as last_purchase_date,
                    COALESCE(SUM(CASE WHEN s.pay_method IS NULL OR s.pay_method = '' OR s.pay_method = '-' OR s.pay_method = 'entregado' THEN s.total_cents ELSE 0 END), 0)::int as total_debt_cents,
                    COALESCE((
                        SELECT json_agg(json_build_object('id', t.id, 'name', t.name, 'color', t.color))
                        FROM crm_client_tags ct
                        JOIN crm_tags t ON ct.tag_id = t.id
                        WHERE ct.client_id = c.id
                    ), '[]'::json) as custom_tags
                FROM clients c
                LEFT JOIN crm_client_sales cs ON c.id = cs.client_id
                LEFT JOIN sales s ON cs.sale_id = s.id
                LEFT JOIN sale_days sd ON s.sale_day_id = sd.id
                LEFT JOIN crm_client_stage cst ON c.id = cst.client_id
                LEFT JOIN crm_stages st ON cst.stage_id = st.id
                WHERE c.seller_id = ${sellerId}
                GROUP BY c.id, c.name, c.short_name, c.whatsapp, c.address, c.latitude, c.longitude, st.name, st.color, st.id
                ORDER BY MAX(sd.day) DESC NULLS LAST, c.name ASC
            `;
            return json(directory);

            return json(directory);

        }

        return json({ error: 'Método no permitido' }, 405);

    } catch (err) {
        console.error('Error in crm-clients:', err);
        return json({ error: String(err) }, 500);
    }
}
