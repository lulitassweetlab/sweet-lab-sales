-- Check if 3Lec dessert exists
SELECT id, name, short_code FROM desserts WHERE short_code = '3lec' OR name ILIKE '%3lec%';

-- Check if 3Lec has any recipe steps
SELECT dr.id, dr.dessert, dr.step_name, dr.position 
FROM dessert_recipes dr 
WHERE lower(dr.dessert) = '3lec' OR dr.dessert ILIKE '%3lec%'
ORDER BY dr.position;

-- Check if 3Lec has any recipe items
SELECT dri.id, dri.recipe_step_id, dri.ingredient, dri.quantity
FROM dessert_recipe_items dri
JOIN dessert_recipes dr ON dr.id = dri.recipe_step_id
WHERE lower(dr.dessert) = '3lec' OR dr.dessert ILIKE '%3lec%';
