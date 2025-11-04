# Solución al Problema de Polling Infinito de Notificaciones

## Problema Identificado
Un cliente con código antiguo en caché (IP: 190.248.131.174) está haciendo requests cada 3 segundos a la función de notificaciones con el parámetro `after_id=2751`, generando invocaciones excesivas de la función serverless.

## Causa Raíz
- El cliente tiene una versión antigua del código JavaScript en caché del navegador
- Esta versión incluía código de polling automático que hace requests cada 3 segundos
- El cliente no envía el header `X-App-Version`, indicando que tiene código muy antiguo
- El navegador del usuario no ha recargado la página para obtener el código nuevo sin polling

## Solución Implementada

### 1. Detección de Polling
La función de notificaciones ahora detecta automáticamente requests de polling buscando el parámetro `after_id` en la query string.

### 2. Exponential Backoff
Cuando se detecta polling, el servidor:
- Devuelve código de estado **503 Service Unavailable**
- Incluye el header `Retry-After` con tiempo exponencial:
  - 1ra request: 30 segundos
  - 2da request: 60 segundos  
  - 3ra request: 120 segundos (2 minutos)
  - 4ta request: 240 segundos (4 minutos)
  - 5ta request: 480 segundos (8 minutos)
  - 6ta+ requests: 600 segundos (10 minutos máximo)

### 3. Tracking de Clientes
El servidor mantiene un contador por IP para clientes que hacen polling, permitiendo:
- Identificar clientes problemáticos
- Aplicar backoff progresivo
- Monitorear la efectividad de la solución

### 4. Mensajes Claros
Las respuestas incluyen:
- Mensaje en español explicando que el sistema cambió
- Instrucciones para recargar con `Ctrl+Shift+R` (o `Cmd+Shift+R` en Mac)
- Headers informativos (`X-Polling-Blocked`, `X-Block-Count`, `X-Message`)

## Resultado Esperado

### Reducción Inmediata
Después de 5 intentos de polling (aproximadamente 15 segundos), las invocaciones se reducirán de:
- **Antes**: 1 invocación cada 3 segundos = 20 invocaciones por minuto
- **Después**: 1 invocación cada 10 minutos = máximo 6 invocaciones por hora

### Reducción Total
El número de invocaciones por hora se reducirá de **1,200** a aproximadamente **6**, una reducción del **99.5%**.

## Acción Requerida del Usuario

El usuario con la IP afectada debe:
1. Abrir la aplicación en su navegador
2. Presionar `Ctrl+Shift+R` (Windows/Linux) o `Cmd+Shift+R` (Mac) para forzar recarga completa
3. Esto limpiará el caché y cargará el código nuevo sin polling

## Monitoreo

Los logs ahora mostrarán:
```
[NOTIFICATIONS] 🚫🛑 POLLING BLOCKED #N | IP: xxx.xxx.xxx.xxx | Backoff: Xs | Query: after_id=2751
```

Donde:
- `#N` es el número de intentos del cliente
- `Backoff: Xs` es el tiempo que debe esperar antes del próximo intento

## Código del Cliente Actualizado

El código actual en `app.js` NO incluye polling automático. Las notificaciones solo se obtienen cuando:
1. El usuario hace clic en el icono de notificaciones (single click)
2. El usuario hace doble clic para abrir el centro de notificaciones

Todo el código usa `fetchWithVersion()` que envía el header `X-App-Version: 2.3.0` y consume la ruta segura `/api/notifications-v2`, permitiendo al servidor identificar clientes actualizados y mantener el path legacy bloqueado (`410 Gone`).

## Archivos Modificados
- `netlify/functions/notifications.js`: Implementa detección y exponential backoff

## Fecha de Implementación
2025-11-04
