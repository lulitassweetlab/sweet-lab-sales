# Pasos para Probar el Centro de Notificaciones

## ⚠️ IMPORTANTE: El Superadmin NO Genera Notificaciones

Por diseño, cuando el **superadmin (jorge)** realiza acciones (crear pedidos, modificar, etc.), **NO se generan notificaciones** para evitar ruido.

## ✅ Pasos Correctos para Probar

### 1. **Crear un Pedido como VENDEDOR (no como jorge)**

1. **Cierra sesión** si estás logueado como jorge
2. **Inicia sesión como un vendedor** (por ejemplo: marcela, aleja, etc.)
   - Usuario: `marcela`
   - Contraseña: `marcelasweet`
3. Selecciona el vendedor marcela
4. Crea un nuevo pedido:
   - Click en "Nuevo pedido"
   - Agrega un cliente: `Test Cliente`
   - Agrega cantidades: 2 arco, 1 melo
   - (El sistema automáticamente guardará los cambios)

### 2. **Ver las Notificaciones como SUPERADMIN**

1. **Cierra sesión**
2. **Inicia sesión como jorge**
   - Usuario: `jorge`
   - Contraseña: `Jorge123`
3. Verás la pantalla de vendedores
4. **Haz click en el botón 🔔** (Centro de Notificaciones)
5. Deberías ver:
   ```
   Test Cliente: 2 arco + 1 melo - marcela
   [fecha] • marcela
   ```

### 3. **Verificar en la Consola del Navegador**

Abre la consola (F12) y busca:
```
📬 Notificaciones recibidas: 1 [...]
```

Esto te dirá cuántas notificaciones se encontraron.

## 🔍 Si No Aparecen Notificaciones

### Opción 1: Verificar que el Pedido se Creó

1. Como jorge, entra a ver los pedidos de marcela
2. Verifica que el pedido aparece en la lista

### Opción 2: Verificar en la Base de Datos (Neon)

Ejecuta este SQL en Neon:

```sql
-- Ver todas las notificaciones
SELECT * FROM notifications ORDER BY created_at DESC LIMIT 10;

-- Ver notificaciones no leídas
SELECT 
  n.id,
  n.type,
  n.message,
  n.actor_name,
  n.created_at,
  s.name as seller_name
FROM notifications n
LEFT JOIN sellers s ON s.id = n.seller_id
ORDER BY n.created_at DESC;
```

### Opción 3: Verificar la Última Visita

```sql
-- Ver última visita de jorge
SELECT * FROM notification_center_visits WHERE username = 'jorge';

-- Si quieres resetear (ver todas las notificaciones de nuevo)
DELETE FROM notification_center_visits WHERE username = 'jorge';
```

## 🐛 Debugging Adicional

### En la Consola del Navegador:

```javascript
// Verificar tu usuario actual
console.log('Usuario:', state.currentUser);
// Debe mostrar: { name: 'jorge', role: 'superadmin', ... }

// Forzar actualización y ver todas las notificaciones
fetch('/api/notifications?actor=jorge', {
  method: 'POST',
  headers: { 
    'Content-Type': 'application/json',
    'X-Actor-Name': 'jorge'
  },
  body: JSON.stringify({ 
    action: 'visit'
  })
}).then(() => {
  // Ahora resetear la última visita en SQL para ver todo:
  // DELETE FROM notification_center_visits WHERE username = 'jorge';
  console.log('Timestamp actualizado. Resetea en SQL para ver todas.');
});
```

## 📋 Checklist de Verificación

- [ ] Creé el pedido como **vendedor** (NO como jorge)
- [ ] Cerré sesión después de crear el pedido
- [ ] Inicié sesión como **jorge** (superadmin)
- [ ] Abrí la consola del navegador (F12)
- [ ] Hice click en el botón 🔔
- [ ] Revisé los logs en la consola que dicen: `📬 Notificaciones recibidas: X`
- [ ] Verifiqué en Neon que las notificaciones existen en la tabla

## 💡 Comportamiento Esperado

### Primera Vez:
- Abres el centro → Ves todas las notificaciones históricas
- El sistema marca el timestamp actual

### Segunda Vez (y siguientes):
- Solo verás las notificaciones **nuevas** desde la última vez que abriste el centro
- Las notificaciones anteriores **NO** desaparecen (a menos que las elimines manualmente)

### Para Ver Todas de Nuevo:
Ejecuta en Neon SQL:
```sql
DELETE FROM notification_center_visits WHERE username = 'jorge';
```

Luego vuelve a abrir el centro de notificaciones.
