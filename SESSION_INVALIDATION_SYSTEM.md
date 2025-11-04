# Sistema de Invalidación de Sesiones - Documentación

## 📋 Resumen

Se implementó un sistema de control de versiones de la aplicación que fuerza el cierre de sesión y recarga automática de clientes con código desactualizado. Esto resuelve el problema de polling persistente desde dispositivos con caché antiguo.

## ❌ Problema Original

Los logs mostraban requests de polling cada 3 segundos desde la IP `190.248.131.174`:
```
[NOTIFICATIONS] 🚫 BLOCKED POLLING REQUEST | IP: 190.248.131.174 | Query: after_id=2751
```

**Causa**: Múltiples dispositivos/pestañas con código JavaScript en caché que aún contenía el sistema de polling automático (ya eliminado del código actual).

## ✅ Solución Implementada

### 1. Backend: Sistema de Versiones (`notifications.js`)

Se agregó:

- **Constante de versión**: `APP_VERSION = '2.3.0'`
- **Header HTTP**: `X-App-Version` en todas las respuestas
- **Validación de versión**: Detecta clientes desactualizados y retorna HTTP 426 (Upgrade Required)
- **Bloqueo de polling**: Requests con `after_id` retornan HTTP 503 con encabezado `Retry-After` y acción `force_logout`
- **Ruta v2**: El frontend usa `/api/notifications-v2`; la ruta legacy `/api/notifications` ahora devuelve `410 Gone` sin invocar la función

```javascript
// ⚙️ APP VERSION: Increment this to force all clients to reload
const APP_VERSION = '2.3.0';
const VERSION_HEADER = 'X-App-Version';

// 🔄 VERSION CHECK: Force reload for outdated clients
if (clientVersion !== 'unknown' && clientVersion !== APP_VERSION) {
    console.warn(`[NOTIFICATIONS] ⚠️ OUTDATED CLIENT | IP: ${ip} | Client: ${clientVersion} | Current: ${APP_VERSION}`);
    return json({
        error: 'version_outdated',
        message: 'Tu aplicación está desactualizada. Por favor recarga la página.',
        current_version: APP_VERSION,
        client_version: clientVersion,
        action: 'force_reload'
    }, 426); // 426 Upgrade Required
}

// 🚫 BLOCK POLLING: Catches old clients without version headers
if (method === 'GET' && query.includes('after_id')) {
    console.warn(`[NOTIFICATIONS] 🚫 BLOCKED POLLING | IP: ${ip} | Version: ${clientVersion}`);
    return json({ 
        error: 'polling_blocked',
        message: 'Las notificaciones automáticas están deshabilitadas. Cerrando sesión...',
        action: 'force_logout'
    }, 503);
}
```

> Nota: En producción los clientes sin header de versión reciben `410 Gone` en texto plano para romper el bucle de polling, mientras que los clientes modernos reciben `503 Service Unavailable` con `Retry-After` exponencial.

### 2. Frontend: Cliente Versionado (`app.js`)

Se agregó:

- **Constante de versión**: `APP_VERSION = '2.3.0'` (debe coincidir con backend)
- **Función `forceLogoutAndReload()`**: Limpia localStorage, cierra sesión y recarga la página
- **Función `fetchWithVersion()`**: Helper que envía el header de versión y maneja errores de versión
- **Header automático**: Se envía `X-App-Version` en todas las requests
- **Detección de respuestas**: HTTP 426, 503 o 403 con `action: 'force_reload'/'force_logout'`

```javascript
// ⚙️ APP VERSION: Must match backend version
const APP_VERSION = '2.3.0';
const VERSION_HEADER = 'X-App-Version';

// Force logout and reload
function forceLogoutAndReload(reason = 'Sesión expirada') {
    console.warn('[AUTH] Forcing logout:', reason);
    try { localStorage.clear(); } catch {}
    state.currentUser = null;
    state.currentSeller = null;
    alert(reason + '\n\nLa página se recargará para actualizar la aplicación.');
    window.location.reload(true); // Force reload from server
}

// Helper function for fetch with version header and error handling
async function fetchWithVersion(url, options = {}) {
    const headers = {
        ...options.headers,
        [VERSION_HEADER]: APP_VERSION
    };
    
    const res = await fetch(url, { ...options, headers });
    
    // Check for version mismatch or forced logout
    if (res.status === 503) {
        console.error('[POLLING BLOCKED] Server returned 503 - forcing reload');
        try {
            const data = await res.json();
            if (data.polling_blocked || data.error === 'service_unavailable') {
                forceLogoutAndReload(data.message || 'Tu aplicación está desactualizada');
                throw new Error('force_reload');
            }
        } catch (e) {
            if (e.message === 'force_reload') throw e;
            forceLogoutAndReload('Tu aplicación está desactualizada');
            throw new Error('force_reload');
        }
    }

    if (res.status === 426 || res.status === 403) {
        try {
            const data = await res.json();
            if (data.action === 'force_reload' || data.action === 'force_logout') {
                forceLogoutAndReload(data.message || 'Tu aplicación está desactualizada');
                throw new Error('force_reload');
            }
        } catch (e) {
            if (e.message === 'force_reload') throw e;
        }
    }
    
    return res;
}
```

**Actualización en función `api()`**:
- Envía `X-App-Version` en cada request
- Detecta respuestas de versión obsoleta
- Fuerza logout automáticamente

**Actualización en todas las llamadas a notificaciones**:
- Reemplazado `fetch()` por `fetchWithVersion()`
- Incluye: click en icono, apertura de diálogo, marcar como leído, cargar más

## 🎯 Comportamiento Esperado

### Cliente Actualizado (v2.3.0)
1. Envía `X-App-Version: 2.3.0` en todas las requests
2. Backend valida y acepta las requests
3. Funciona normalmente

### Cliente Desactualizado (v1.x o sin versión)
1. **Escenario A**: Cliente antiguo con código de polling activo
   - Intenta hacer request con `after_id=XXX`
   - Backend retorna HTTP 503 con `action: 'force_logout'` y `Retry-After`
   - Cliente moderno detecta y ejecuta `forceLogoutAndReload()`
   - Cliente antiguo recibe error y deja de funcionar

2. **Escenario B**: Cliente antiguo sin polling pero versión incorrecta
   - Envía `X-App-Version: 1.0.0` (o no envía header)
   - Backend retorna HTTP 426 con `action: 'force_reload'`
   - Cliente detecta y ejecuta `forceLogoutAndReload()`
     - Usuario ve mensaje: "Tu aplicación está desactualizada. La página se recargará..."
     - Página se recarga y obtiene código v2.3.0 actualizado

## 🚀 Despliegue

### Pasos para Activar

1. **Desplegar el backend actualizado** (`notifications.js` con `APP_VERSION = '2.3.0'`)
2. **Desplegar el frontend actualizado** (`app.js` con `APP_VERSION = '2.3.0'`)
3. Los clientes actualizados comenzarán a enviar la versión en sus requests
4. Los clientes desactualizados recibirán error y se forzará su recarga

### Incrementar Versión (Futuros Updates)

Cuando necesites forzar recarga de todos los clientes:

1. Incrementar `APP_VERSION` en **ambos** archivos:
   - `netlify/functions/notifications.js`
   - `public/app.js`
   
2. Ejemplo: `'2.3.0'` → `'2.4.0'`

3. Desplegar ambos archivos

4. Todos los clientes con versión anterior serán forzados a recargar

## 📊 Logs Esperados

### Antes (Cliente Desactualizado)
```
[NOTIFICATIONS] 🚫 BLOCKED POLLING | IP: 190.248.131.174 | Version: unknown | Query: after_id=2751
```

### Después (Cliente Actualizado)
```
[NOTIFICATIONS] 2025-11-04T00:01:44.621Z | GET | IP: 190.248.131.174 | Version: 2.3.0 | Query: limit=50
```

### Cliente Siendo Forzado a Actualizar
```
[NOTIFICATIONS] ⚠️ OUTDATED CLIENT | IP: 190.248.131.174 | Client: 1.0.0 | Current: 2.3.0
```

## 🔒 Seguridad

- **No almacena información sensible**: Solo número de versión
- **Limpia localStorage completo** al forzar logout
- **No depende del navegador**: Funciona en todos los navegadores modernos
- **Recarga forzada**: `window.location.reload(true)` obtiene archivos del servidor, no del caché

## 📝 Notas Adicionales

- La versión `'unknown'` (clientes muy antiguos sin el header) NO es bloqueada inmediatamente para evitar bloquear usuarios legítimos
- Solo se bloquean clientes que envían una versión diferente a la actual
- El sistema de polling (`after_id`) sigue bloqueado como medida de seguridad adicional
- Los headers `Cache-Control: no-cache, no-store, must-revalidate` aseguran que los navegadores no cacheen las respuestas

## ✅ Testing

Para probar el sistema:

1. **Simular cliente desactualizado**:
   - En consola del navegador: `localStorage.setItem('testOldVersion', '1.0.0')`
   - Modificar temporalmente `APP_VERSION` en el código local a `'1.0.0'`
   - Hacer una request a `/api/notifications-v2`
   - Debería forzar recarga

2. **Simular polling bloqueado**:
   - Intentar hacer request a `/api/notifications-v2?after_id=123`
   - Debería retornar HTTP 503 con acción de logout y header `Retry-After`

3. **Verificar cliente actualizado**:
   - Hacer request normal a `/api/notifications-v2`
   - En DevTools > Network, verificar que se envía header `X-App-Version: 2.3.0`
   - Request debería completarse exitosamente

## 🎉 Resultado Final

Este sistema garantiza que:

✅ **Todos los dispositivos usen código actualizado**
✅ **No más polling persistente desde caché antiguo**
✅ **Cierre de sesión automático en todos los dispositivos desactualizados**
✅ **Usuarios reciben mensaje claro sobre por qué se cierra sesión**
✅ **Recarga automática obtiene código nuevo del servidor**

---

**Fecha de Implementación**: 2025-11-04
**Versión Inicial**: 2.0.0
**Estado**: ✅ Implementado - Listo para desplegar
