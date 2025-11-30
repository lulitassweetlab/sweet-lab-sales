# DEBUG: Special Pricing Issue

## Problema
Cuando se sube un archivo de pago para una venta con precio especial (muestra o a costo), el total en la columna cambia al precio normal.

## Cambios realizados (10 commits):
1. ✅ `calcRowTotal()` ahora prioriza `total_cents` de la base de datos
2. ✅ `recalcTotalForId()` aplica precios especiales correctamente
3. ✅ Backend incluye `unit_price` en los items
4. ✅ Logging agregado para debug

## Para probar:
1. Abre la consola del navegador (F12)
2. Busca una venta con precio especial
3. Sube un archivo
4. Observa los logs:
   - En el navegador: busca `💰 calcRowTotal` o `⚠️ calcRowTotal`
   - En Netlify Functions: busca `🔄 recalcTotalForId`

## Lo que DEBERÍA pasar:
1. Se sube archivo → `/api/sales` recibe POST con `_upload_receipt_for`
2. Backend llama `recalcTotalForId(saleId)` que calcula el total respetando `special_pricing_type`
3. Frontend llama `loadSales()` que trae ventas con `total_cents` correcto
4. `calcRowTotal()` usa `total_cents` directamente
5. Tabla muestra el total correcto

## Próximo paso de diagnóstico:
Verificar si el problema está en:
- [ ] Backend no está guardando el total correcto en `total_cents`
- [ ] Frontend no está usando el `total_cents` de la base de datos
- [ ] Hay algún otro código que sobrescribe el total después
