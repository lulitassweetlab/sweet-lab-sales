# Debugging Notificaciones - Invocaciones Excesivas

## Problema Identificado
La función `notifications` está recibiendo invocaciones constantes (214497 → 214505 en 5 segundos = ~1.6 invocaciones/segundo).

## Cambios Implementados

### 1. Logging Detallado
Se agregó logging completo en `/netlify/functions/notifications.js` que registra:
- Timestamp de cada invocación
- Dirección IP del cliente
- User-Agent (navegador/herramienta)
- Referer (página de origen)
- Método HTTP (GET/POST/PATCH)
- Query parameters

### 2. Headers de Cache
Se agregaron headers para prevenir caching agresivo que podría ocultar el problema.

## Cómo Identificar la Fuente del Polling

### Paso 1: Revisar Logs de Netlify
1. Ve a tu dashboard de Netlify
2. Navega a **Functions** → **notifications**
3. Haz clic en **Function logs**
4. Busca los mensajes que comienzan con `[NOTIFICATIONS]`

Ejemplo de log:
```
[NOTIFICATIONS] 2025-11-03T23:15:42.123Z | GET | IP: 192.168.1.1 | UA: Mozilla/5.0... | Referer: https://tu-sitio.netlify.app/ | Query: limit=50
```

### Paso 2: Analizar Patrones
Busca en los logs:
- **IPs repetitivas**: Si una IP aparece constantemente, es esa fuente
- **User-Agent**: Identifica si es un navegador, bot, monitor, etc.
- **Timing**: ¿Cada cuántos segundos ocurren las llamadas?
- **Query params**: ¿Qué parámetros se están enviando?

## Posibles Causas (NO encontradas en el código)

### 1. ✅ Múltiples Pestañas/Usuarios
- **Si ves múltiples IPs diferentes**: Varios usuarios tienen la app abierta
- **Solución**: Esto es normal, no hacer nada

### 2. ⚠️ Extensión del Navegador
- **Si el User-Agent incluye extensiones**: Una extensión está haciendo polling
- **Solución**: Desactivar extensiones y probar

### 3. ⚠️ Herramienta de Monitoreo
- **Si el User-Agent es un bot**: UptimeRobot, Pingdom, etc.
- **Ejemplos de UA**: 
  - `UptimeRobot/2.0`
  - `Pingdom.com_bot`
  - `StatusCake`
- **Solución**: Cambiar la URL monitoreada o bloquear estos UAs

### 4. ⚠️ Service Worker o PWA
- **Si el Referer es vacío o service-worker**: Hay un SW activo
- **Solución**: Revisar si existe `/public/sw.js` o similar

### 5. ⚠️ Netlify Analytics/Monitoring
- **Si IP es de Netlify/AWS**: Health checks internos
- **Solución**: Revisar configuración de Netlify

### 6. ⚠️ Código Externo/CDN
- **Si User-Agent incluye "bot" o "crawler"**: Scraping/indexing
- **Solución**: Agregar `robots.txt` o rate limiting

## Verificación en el Código

✅ **Confirmado**: NO hay polling automático en:
- `/public/app.js` - Solo llamadas al hacer click
- `/public/index.html` - Sin scripts de polling
- `/public/*.html` - Sin setInterval para notifications
- `/netlify/functions/*` - Sin scheduled functions

## Próximos Pasos

1. **Espera 5-10 minutos** para que se desplieguen los cambios
2. **Revisa los logs** en Netlify Functions
3. **Identifica el patrón** en User-Agent y IP
4. **Reporta los hallazgos** para implementar rate limiting específico si es necesario

## Rate Limiting (Si se necesita)

Si identificas una fuente específica, podemos agregar:
```javascript
// En notifications.js
const RATE_LIMIT = 10; // máximo 10 requests por minuto por IP
const rateLimitMap = new Map();

// Validar rate limit por IP
const now = Date.now();
const key = ip;
const requests = rateLimitMap.get(key) || [];
const recentRequests = requests.filter(t => now - t < 60000);

if (recentRequests.length >= RATE_LIMIT) {
  console.log(`[NOTIFICATIONS] RATE LIMIT EXCEEDED for ${ip}`);
  return json({ error: 'Too many requests' }, 429);
}

recentRequests.push(now);
rateLimitMap.set(key, recentRequests);
```

## Contacto
Si necesitas ayuda para interpretar los logs, comparte un ejemplo de las líneas que aparecen.
