-- Script para crear las tablas de notificaciones manualmente
-- Ejecuta esto en el SQL Editor de Neon

-- 1. Verificar schema version actual
SELECT version FROM schema_meta;

-- 2. Crear tabla de visitas al centro de notificaciones
CREATE TABLE IF NOT EXISTS notification_center_visits (
    id SERIAL PRIMARY KEY,
    username TEXT NOT NULL,
    visited_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE (username)
);

-- 3. Crear tabla de checks de notificaciones
CREATE TABLE IF NOT EXISTS notification_checks (
    id SERIAL PRIMARY KEY,
    notification_id INTEGER NOT NULL REFERENCES notifications(id) ON DELETE CASCADE,
    checked_by TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE (notification_id, checked_by)
);

-- 4. Crear índices para optimizar queries
CREATE INDEX IF NOT EXISTS idx_notifications_created ON notifications(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notification_checks_notification ON notification_checks(notification_id);

-- 5. Actualizar schema version
UPDATE schema_meta SET version = 12, updated_at = now();

-- 6. Verificar que las tablas se crearon
SELECT table_name 
FROM information_schema.tables 
WHERE table_name IN ('notification_center_visits', 'notification_checks', 'notifications')
ORDER BY table_name;

-- 7. Verificar que hay notificaciones (para probar)
SELECT COUNT(*) as total_notifications FROM notifications;

-- 8. Ver las últimas notificaciones
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
