# ⚠️ IMPORTANTE: Cómo Probar las Notificaciones

## 🚨 El Problema Común

Si ves "No hay notificaciones nuevas", es probablemente porque:

### ❌ ERROR: Creaste el pedido como JORGE (superadmin)
**Los pedidos del superadmin NO generan notificaciones** (esto es intencional para evitar ruido).

## ✅ Procedimiento CORRECTO:

### Paso 1: Crear Pedido como VENDEDOR
1. **Cierra sesión** (si estás logueado como jorge)
2. **Inicia sesión como vendedor**:
   - Usuario: `marcela`
   - Contraseña: `marcelasweet`
3. Selecciona el vendedor (marcela)
4. **Crea un pedido nuevo**:
   - Click "Nuevo pedido"
   - Cliente: `Test Notificaciones`
   - Cantidades: ej. 2 arco, 1 melo
   - Espera unos segundos a que se guarde

### Paso 2: Ver las Notificaciones como Jorge
1. **Cierra sesión de marcela**
2. **Inicia sesión como jorge**:
   - Usuario: `jorge`
   - Contraseña: `Jorge123`
3. **Click en el botón 🔔**
4. Deberías ver:
   ```
   Test Notificaciones: 2 arco + 1 melo
   ✨ Nuevo pedido
   04/11/2024, 23:00 • marcela
   ```

## 🔍 Verificar en la Base de Datos

Si no aparecen notificaciones, ejecuta este SQL en Neon:

```sql
-- Ver todas las notificaciones
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

-- Ver cuántas hay
SELECT COUNT(*) as total FROM notifications;
```

**Si COUNT es 0:** No hay notificaciones creadas todavía.
**Si COUNT > 0:** Hay notificaciones, pero están ocultas.

## 🔄 Resetear y Ver Todas las Notificaciones

Si quieres ver TODAS las notificaciones desde el inicio:

```sql
-- Ejecuta esto en Neon SQL Editor
DELETE FROM notification_center_visits WHERE username = 'jorge';
```

Luego recarga la app, login como jorge, y click en 🔔.

## 📊 La Última Visita

El sistema guarda cuándo fue la última vez que abriste el centro:

```sql
SELECT * FROM notification_center_visits WHERE username = 'jorge';
```

Solo muestra notificaciones **DESPUÉS** de esa fecha.

## 💡 Regla de Oro

**SIEMPRE:**
1. ✅ Crea pedidos como **VENDEDOR** (marcela, aleja, etc.)
2. ✅ Cierra sesión del vendedor
3. ✅ Entra como **JORGE** para ver las notificaciones
4. ❌ NO crees pedidos como jorge si quieres que generen notificaciones

## 🎯 Test Rápido

En la consola del navegador (F12), ejecuta:

```javascript
// Ver cuántas notificaciones hay
fetch('/api/notifications?test=1&actor=jorge')
  .then(r => r.json())
  .then(d => console.log('Test OK:', d));

// Después de crear un pedido como vendedor, verifica:
fetch('/api/notifications?actor=jorge', {
  headers: { 'X-Actor-Name': 'jorge' }
})
.then(r => r.json())
.then(d => console.log('Notificaciones:', d.length, d));
```

Si el segundo fetch devuelve `[]` (array vacío), significa:
- No hay notificaciones nuevas DESDE la última visita
- O no se han creado notificaciones

## 🆘 Si Sigue sin Funcionar

1. Ejecuta el SQL de verificación en Neon
2. Comparte el resultado aquí
3. También comparte el resultado del test de la consola

Con esa información puedo ayudarte específicamente.
