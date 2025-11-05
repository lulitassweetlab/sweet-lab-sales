# Fix de Emergencia para Notificaciones

## 🚨 Error 500 - Necesitamos Ver los Logs

El error 500 significa que algo falla en el servidor, pero necesitamos ver QUÉ exactamente.

## Paso 1: Probar el Endpoint de Test

Abre la **consola del navegador** (F12) y ejecuta:

```javascript
fetch('/api/notifications?test=1&actor=jorge', {
  headers: { 'X-Actor-Name': 'jorge' }
})
.then(r => r.json())
.then(d => console.log('✅ Respuesta:', d))
.catch(e => console.error('❌ Error:', e));
```

Esto debería devolver:
```json
{
  "ok": true,
  "message": "Notifications endpoint is working",
  "timestamp": "..."
}
```

Si este test falla con 500, el problema es más profundo.

## Paso 2: Ver los Logs de Netlify Functions

### Opción A: Netlify Dashboard (Recomendado)
1. Ve a https://app.netlify.com
2. Selecciona tu sitio
3. Click en **Functions** en el menú lateral
4. Click en la función **notifications**
5. Verás una lista de invocaciones
6. Click en la más reciente
7. Copia TODOS los logs y pégalos aquí

### Opción B: Netlify CLI (si tienes acceso)
```bash
netlify functions:log notifications
```

## Paso 3: Verificar las Tablas en Neon

Ejecuta en el SQL Editor de Neon:

```sql
-- Ver schema version
SELECT version FROM schema_meta;

-- Ver tablas de notificaciones
SELECT table_name 
FROM information_schema.tables 
WHERE table_name LIKE 'notification%';

-- Si no existen las tablas, forzar creación
-- (Esto ya debería hacerse automáticamente, pero por si acaso)
```

## Paso 4: Verificar que el Deploy Funcionó

En la consola del navegador:

```javascript
// Verificar que el archivo existe
fetch('/api/notifications?test=1')
.then(r => {
  console.log('Status:', r.status);
  console.log('Headers:', [...r.headers.entries()]);
  return r.text();
})
.then(text => console.log('Response:', text));
```

## Paso 5: Solución Temporal - Resetear Todo

Si nada funciona, ejecuta esto en **Neon SQL**:

```sql
-- Backup de notificaciones existentes (por si acaso)
CREATE TABLE notifications_backup AS SELECT * FROM notifications;

-- Resetear schema version para forzar recreación
UPDATE schema_meta SET version = 11;

-- Las tablas se recrearán en el próximo request
```

Luego recarga la página y vuelve a intentar.

## Paso 6: Logs Esperados

Cuando funcione correctamente, deberías ver en Netlify Logs:

```
=== Notifications Handler Start ===
Method: GET
Raw query: actor=jorge
Query params: { actor: 'jorge' }
Calling ensureSchema...
✓ ensureSchema completed
Getting actor role...
Actor role: superadmin
Getting actor name...
Actor name: jorge
Fetching notifications for: jorge
Querying last visit...
✓ Last visit query completed: not found
First visit - fetching all notifications
✓ Notifications query completed: X rows
Enriching notifications with sale details...
✓ Returning enriched notifications: X
```

## 🆘 Si Sigue sin Funcionar

Necesito que me proporciones:

1. **Los logs completos de Netlify Functions** (desde el dashboard de Netlify)
2. **El resultado del test**: `fetch('/api/notifications?test=1&actor=jorge')`
3. **El schema_version actual**: `SELECT version FROM schema_meta`
4. **Si las tablas existen**: El resultado de la query de tablas arriba

Con esa información podré identificar exactamente qué está fallando.

## 💡 Posibles Causas del Error 500

1. **Las tablas no existen** → El código debería manejar esto ahora
2. **Error en ensureSchema()** → El test endpoint lo detectará
3. **Error en las queries SQL** → Los logs lo mostrarán
4. **Timeout de la función** → Incrementa el timeout en netlify.toml
5. **Error de permisos en la DB** → Verifica la conexión en Neon

## Alternativa: Deshabilitar Temporalmente

Si necesitas deshabilitarlo temporalmente:

```javascript
// En public/app.js, línea ~8497
updateButtonVisibility() {
  if (!this.btn) return;
  this.btn.style.display = 'none'; // Ocultar temporalmente
},
```
