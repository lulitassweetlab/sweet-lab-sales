import { sql } from './_db.js';

/**
 * Re-evaluates a client's stage based on their purchase history.
 * Logic:
 * - Prospecto: 0 orders.
 * - Nuevo: 1st order.
 * - Activo/Frecuente/VIP: Based on 30-day thresholds.
 * - Inactivo/Riesgo/Perdido: Based on days since last order.
 */
export async function evaluateClientStage(clientId, userId = null) {
    if (!clientId) return null;

    // 1. Get Metrics (Last 30 days and Totals)
    const metricsRes = await sql`
        SELECT 
            c.seller_id,
            (SELECT COUNT(s2.id) FROM sales s2 
             JOIN crm_client_sales cs2 ON s2.id = cs2.sale_id 
             WHERE cs2.client_id = ${clientId}) as orders_count,
            (SELECT MAX(s.created_at) FROM sales s 
             JOIN crm_client_sales cs ON s.id = cs.sale_id 
             WHERE cs.client_id = ${clientId}) as last_order_at,
            (SELECT COUNT(s3.id) FROM sales s3 
             JOIN crm_client_sales cs3 ON s3.id = cs3.sale_id 
             WHERE cs3.client_id = ${clientId} AND s3.created_at >= now() - interval '30 days') as orders_30d,
            (SELECT COALESCE(SUM(si.quantity), 0) FROM sale_items si 
             JOIN crm_client_sales cs4 ON si.sale_id = cs4.sale_id 
             WHERE cs4.client_id = ${clientId} AND si.created_at >= now() - interval '30 days') as items_30d
        FROM clients c
        WHERE c.id = ${clientId}
    `;
    const m = metricsRes[0] || { orders_count: 0, last_order_at: null, orders_30d: 0, items_30d: 0 };
    const totalOrders = Number(m.orders_count);
    const orders30d = Number(m.orders_30d);
    const items30d = Number(m.items_30d);
    
    // Days since last order (using 9999 if never ordered)
    let daysSinceLast = 9999;
    if (m.last_order_at) {
        const lastDate = new Date(m.last_order_at);
        daysSinceLast = Math.floor((new Date() - lastDate) / (1000 * 60 * 60 * 24));
    }

    // 2. Fetch Active Automatic Stages (ordered by priority/order_index)
    const stages = await sql`SELECT * FROM crm_stages WHERE is_active = true AND is_automatic = true ORDER BY order_index ASC`;

    // 3. Find Best Match
    let targetStageId = null;
    for (const st of stages) {
        let match = false;
        const dT = Number(st.days_threshold);
        const cT = Number(st.count_threshold);

        if (st.threshold_type === 'items') {
            // VIP style: Count by items in last 30 days
            if (items30d >= cT && totalOrders > 0 && daysSinceLast < 31) match = true;
        } else {
            // Count by orders
            if (cT > 0) {
                // Potential "Positive" stage: Nuevo, Activo, Frecuente
                if (dT === 0) {
                    // LIFE-TOTAL stages (like 'Nuevo'): Matches if the total count is EXACTLY or AT LEAST the threshold
                    // For 'Nuevo' (cT=1), we want it to match only if they have exactly 1 order OR if it's the very first match.
                    if (totalOrders === cT) match = true;
                } else {
                    // FREQUENCY stages (like 'Activo', 'Frecuente'): Matches if orders in last X days >= threshold
                    // These should only apply if they have MORE than 1 order (recurring behavior)
                    if (totalOrders > 1 && orders30d >= cT && daysSinceLast < dT) match = true;
                }
            } else if (dT > 0) {
                // Potential "Negative" stage: Inactivo, Riesgo, Perdido (0 orders in X days)
                // IMPORTANT: These only apply if they have at least 1 order in their history.
                if (totalOrders > 0 && daysSinceLast >= dT) match = true;
            }
        }

        if (match) {
            targetStageId = st.id;
            break;
        }
    }

    // Fallback: If no automatic match and 0 orders, it's a Prospecto
    if (!targetStageId && totalOrders === 0) {
        const prospecto = await sql`SELECT id FROM crm_stages WHERE name ILIKE 'Prospecto' OR name ILIKE 'Prospecto%' LIMIT 1`;
        if (prospecto.length) targetStageId = prospecto[0].id;
    }

    if (!targetStageId) return null;

    // 4. Update if changed
    const currentRes = await sql`SELECT stage_id FROM crm_client_stage WHERE client_id = ${clientId}`;
    const oldStageId = currentRes.length > 0 ? currentRes[0].stage_id : null;

    if (oldStageId != targetStageId) {
         // Insert into history
         await sql`
            INSERT INTO crm_stage_history (client_id, old_stage_id, new_stage_id, note, changed_by)
            VALUES (${clientId}, ${oldStageId}, ${targetStageId}, 'Actualización automática por comportamiento de compra', ${userId})
         `;

         // --- AUTOMATION: POST-SALE REMIDER ---
         // If they became "Nuevo" (usually 1st purchase), create a reminder for 2 days from now
         const targetStageNameRes = await sql`SELECT name FROM crm_stages WHERE id = ${targetStageId}`;
         const stName = targetStageNameRes[0]?.name || '';
         if (stName.toLowerCase().includes('nuevo')) {
             await sql`
                INSERT INTO crm_reminders (seller_id, client_id, reminder_type, title, description, due_date)
                VALUES (${m.seller_id}, ${clientId}, 'post_sale', '💬 Enviar mensaje postventa', 'Automático: 2 días después de primer pedido', now() + interval '2 days')
                ON CONFLICT DO NOTHING
             `;
         }

         // Upsert current stage
         await sql`
            INSERT INTO crm_client_stage (client_id, stage_id, updated_by, updated_at)
            VALUES (${clientId}, ${targetStageId}, ${userId}, now())
            ON CONFLICT (client_id) 
            DO UPDATE SET 
                stage_id = EXCLUDED.stage_id, 
                updated_by = EXCLUDED.updated_by,
                updated_at = EXCLUDED.updated_at
         `;
         return targetStageId;
    }

    return null;
}

/**
 * Re-evaluates all clients for a given seller.
 */
export async function syncSellerStages(sellerId) {
    if (!sellerId) return;
    const clients = await sql`SELECT id FROM clients WHERE seller_id = ${sellerId}`;
    for (const c of clients) {
        await evaluateClientStage(c.id);
    }
}
