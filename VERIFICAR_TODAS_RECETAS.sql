-- ============================================
-- Script para verificar el estado de todas las recetas
-- ============================================

-- 1. Verificar todos los postres en la tabla desserts
SELECT '=== POSTRES EN LA TABLA DESSERTS ===' as titulo;
SELECT id, name, short_code, sale_price, is_active, position 
FROM desserts 
ORDER BY position, id;

-- 2. Verificar si 3Lec existe en desserts
SELECT '=== VERIFICAR SI 3LEC EXISTE ===' as titulo;
SELECT id, name, short_code, sale_price 
FROM desserts 
WHERE LOWER(short_code) = '3lec' OR LOWER(name) LIKE '%3lec%' OR LOWER(name) LIKE '%tres leches%';

-- 3. Contar cuántos pasos tiene cada postre
SELECT '=== PASOS POR POSTRE ===' as titulo;
SELECT dessert, COUNT(*) as num_pasos
FROM dessert_recipes
GROUP BY dessert
ORDER BY dessert;

-- 4. Ver todos los pasos de todas las recetas
SELECT '=== TODOS LOS PASOS DE RECETAS ===' as titulo;
SELECT dr.dessert, dr.step_name, dr.position, COUNT(dri.id) as num_items
FROM dessert_recipes dr
LEFT JOIN dessert_recipe_items dri ON dri.recipe_id = dr.id
GROUP BY dr.id, dr.dessert, dr.step_name, dr.position
ORDER BY dr.dessert, dr.position;

-- 5. Verificar pasos específicos de 3Lec
SELECT '=== PASOS DE 3LEC ===' as titulo;
SELECT dr.id, dr.dessert, dr.step_name, dr.position 
FROM dessert_recipes dr 
WHERE LOWER(dr.dessert) = '3lec'
ORDER BY dr.position;

-- 6. Verificar ingredientes de 3Lec
SELECT '=== INGREDIENTES DE 3LEC ===' as titulo;
SELECT dri.id, dr.step_name, dri.ingredient, dri.unit, dri.qty_per_unit
FROM dessert_recipe_items dri
JOIN dessert_recipes dr ON dr.id = dri.recipe_id
WHERE LOWER(dr.dessert) = '3lec'
ORDER BY dri.position;

-- 7. Verificar si hay pasos sin ingredientes
SELECT '=== PASOS SIN INGREDIENTES (PROBLEMAS) ===' as titulo;
SELECT dr.dessert, dr.step_name, dr.position
FROM dessert_recipes dr
LEFT JOIN dessert_recipe_items dri ON dri.recipe_id = dr.id
WHERE dri.id IS NULL
ORDER BY dr.dessert, dr.position;

-- 8. Resumen general
SELECT '=== RESUMEN GENERAL ===' as titulo;
SELECT 
    (SELECT COUNT(*) FROM desserts WHERE is_active = true) as total_desserts_activos,
    (SELECT COUNT(*) FROM dessert_recipes) as total_pasos,
    (SELECT COUNT(*) FROM dessert_recipe_items) as total_items,
    (SELECT COUNT(*) FROM extras_items) as total_extras;
