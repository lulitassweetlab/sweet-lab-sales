-- ============================================
-- Script para agregar el postre 3Lec a la tabla desserts
-- Ejecuta esto manualmente en tu base de datos si es necesario
-- ============================================

-- 1. Verificar si 3Lec ya existe
SELECT 'Verificando si 3Lec existe...' as mensaje;
SELECT id, name, short_code, sale_price, is_active, position 
FROM desserts 
WHERE LOWER(short_code) = '3lec' OR LOWER(name) = '3lec';

-- 2. Insertar o actualizar 3Lec en la tabla desserts
SELECT 'Agregando/actualizando 3Lec...' as mensaje;
INSERT INTO desserts (name, short_code, sale_price, is_active, position)
VALUES ('3Lec', '3lec', 9000, true, 6)
ON CONFLICT (name) DO UPDATE SET 
    short_code = EXCLUDED.short_code,
    sale_price = EXCLUDED.sale_price,
    is_active = true,
    position = EXCLUDED.position,
    updated_at = now();

-- 3. Verificar que se agregó correctamente
SELECT 'Verificación final...' as mensaje;
SELECT id, name, short_code, sale_price, is_active, position 
FROM desserts 
WHERE LOWER(short_code) = '3lec';

-- 4. Ver todos los postres ordenados por posición
SELECT '=== TODOS LOS POSTRES ===' as titulo;
SELECT id, name, short_code, sale_price, is_active, position 
FROM desserts 
ORDER BY position, id;
