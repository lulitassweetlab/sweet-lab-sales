-- Script para verificar notificaciones y diagnosticar el problema
-- Ejecuta esto en el SQL Editor de Neon

-- 1. Ver cuántas notificaciones existen
SELECT COUNT(*) as total_notifications FROM notifications;

-- 2. Ver las últimas 10 notificaciones
SELECT 
    n.id,
    n.type,
    n.message,
    n.actor_name,
    n.created_at,
    s.name as seller_name
FROM notifications n
LEFT JOIN sellers s ON s.id = n.seller_id
ORDER BY n.created_at DESC
LIMIT 10;

-- 3. Ver la última visita de jorge al centro
SELECT * FROM notification_center_visits WHERE username = 'jorge';

-- 4. Ver notificaciones DESPUÉS de la última visita de jorge
SELECT 
    n.id,
    n.type,
    n.message,
    n.created_at,
    ncv.visited_at as jorge_last_visit
FROM notifications n
CROSS JOIN (
    SELECT visited_at FROM notification_center_visits WHERE username = 'jorge'
) ncv
WHERE n.created_at >= ncv.visited_at
ORDER BY n.created_at DESC;

-- 5. SOLUCIÓN: Si quieres ver TODAS las notificaciones de nuevo
-- Descomenta y ejecuta esta línea:
-- DELETE FROM notification_center_visits WHERE username = 'jorge';
