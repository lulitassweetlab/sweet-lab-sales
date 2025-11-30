# Diagnóstico: Participantes no aparecen en todos los postres

## Problema
Solo algunos postres muestran participantes en la página de Entregas.

## Posibles Causas

1. **Nombres de postres no coinciden**
   - En recetas se usa: "arco", "melo", "mara", "oreo", "nute", "3lec"
   - En desserts table puede haber nombres diferentes

2. **El postre no existe en la tabla desserts**
   - Si el short_code no coincide, no se encuentra el dessert_id
   - Por tanto, no se guarda en delivery_production_users

3. **Falta sincronización**
   - Se guardó en recipe_production_users pero falló en delivery_production_users

## Query para verificar

```sql
-- Ver todos los desserts disponibles
SELECT id, name, short_code FROM desserts ORDER BY position;

-- Ver qué se guardó en delivery_production_users
SELECT 
    d.day,
    des.short_code,
    des.name,
    u.username
FROM delivery_production_users dpu
JOIN deliveries d ON d.id = dpu.delivery_id  
JOIN desserts des ON des.id = dpu.dessert_id
JOIN users u ON u.id = dpu.user_id
WHERE d.day >= CURRENT_DATE - INTERVAL '7 days'
ORDER BY d.day DESC, des.short_code;
```

## Verificar en la Consola del Navegador

En la página de Recetas, después de guardar, busca en la consola:
```
🔍 Looking for dessert 'xxx': []
❌ Dessert 'xxx' not found in desserts table!
```

Esto indicaría qué postres no se están encontrando.
