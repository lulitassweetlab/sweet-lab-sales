# Centro de Notificaciones - Guía de Debugging

## Problema: "Error al cargar notificaciones"

### Pasos para Diagnosticar

1. **Abrir la Consola del Navegador** (F12)
   - Buscar mensajes de error específicos
   - Buscar el mensaje detallado que ahora se muestra

2. **Verificar los Logs de Netlify**
   - Ir a Netlify Dashboard → Functions → notifications
   - Buscar logs con:
     - `Fetching notifications for:` → Debería mostrar el nombre de usuario
     - `Tables do not exist` → Las tablas aún no se crearon
     - `Error fetching notifications:` → Error específico de la base de datos

3. **Verificar que las Tablas Existen**
   
   Ejecutar en la consola SQL de Neon:
   ```sql
   SELECT * FROM notification_center_visits LIMIT 1;
   SELECT * FROM notification_checks LIMIT 1;
   SELECT * FROM notifications LIMIT 5;
   ```

4. **Forzar Recreación del Schema**
   
   Si las tablas no existen, el schema debería crearlas automáticamente en el próximo request.
   Para forzarlo:
   - Hacer cualquier request a `/api/sales` o `/api/sellers`
   - Esto ejecutará `ensureSchema()` y creará las tablas

### Soluciones Comunes

#### Problema: Las tablas no existen
**Solución:** 
- Esperar 30 segundos y recargar la página
- Las tablas se crearán automáticamente en el primer request después del deploy
- Verificar en Neon que `SCHEMA_VERSION = 12`

#### Problema: Error 403 "No autorizado"
**Solución:** 
- Asegurarse de estar logueado como `jorge` (superadmin)
- Verificar en la consola que `state.currentUser.role === 'superadmin'`

#### Problema: El botón 🔔 no aparece
**Solución:**
- Verificar que estás logueado como superadmin
- Abrir consola y ejecutar: `state.currentUser`
- Debería mostrar `role: 'superadmin'` o `isSuperAdmin: true`

### Código de Test en la Consola

```javascript
// Verificar usuario actual
console.log('User:', state.currentUser);

// Probar el endpoint manualmente
fetch('/api/notifications?actor=jorge', {
  headers: { 'X-Actor-Name': 'jorge' }
})
.then(r => r.json())
.then(d => console.log('Notifications:', d))
.catch(e => console.error('Error:', e));

// Verificar que el NotificationCenter está inicializado
console.log('NotificationCenter:', NotificationCenter);
```

### Verificar Schema Version

En Neon SQL:
```sql
SELECT version FROM schema_meta;
```

Debería devolver `12`. Si devuelve menos, ejecutar:
```sql
UPDATE schema_meta SET version = 11;
```

Y luego hacer un request a cualquier endpoint para forzar la migración.

### Flujo Normal Esperado

1. Usuario hace login como superadmin → Botón 🔔 aparece
2. Click en 🔔 → Modal se abre, muestra "Cargando..."
3. Backend verifica tablas → Si no existen, devuelve `[]`
4. Frontend muestra "No hay notificaciones nuevas"
5. En background, el schema se actualiza
6. Próxima vez que se abre el centro, las notificaciones aparecen

### Notas

- Las tablas se crean automáticamente en el primer request después del deploy
- Si el schema_version es menor a 12, las tablas no existen aún
- El código ahora maneja gracefully el caso de tablas no existentes
- Los logs en Netlify Functions son la mejor fuente de información para debugging
