-- SOLUCIÓN: Ver todas las notificaciones de nuevo
-- Esto NO elimina las notificaciones, solo resetea cuándo las viste por última vez

-- Opción 1: Cambiar la fecha de última visita a una fecha muy antigua
UPDATE notification_center_visits 
SET visited_at = '2024-01-01 00:00:00'
WHERE username = 'jorge';

-- Opción 2 (alternativa): Eliminar solo el registro de visita (NO las notificaciones)
-- DELETE FROM notification_center_visits WHERE username = 'jorge';

-- Verificar que funcionó:
SELECT * FROM notification_center_visits WHERE username = 'jorge';

-- Ver que las notificaciones siguen ahí:
SELECT COUNT(*) as total_notificaciones FROM notifications;
