# 🎛️ Guía Práctica: Monitoreo y Optimización de Tiempo de Cómputo

## 🎯 Objetivo

Esta guía te ayudará a:
1. ✅ Monitorear tu uso de tiempo de cómputo en tiempo real
2. ✅ Identificar cuándo implementar optimizaciones
3. ✅ Entender las alertas de los dashboards
4. ✅ Tomar decisiones basadas en datos

---

## 📊 Dashboard de Netlify - Cómo Leerlo

### Acceso:
1. Ve a https://app.netlify.com
2. Selecciona tu sitio: **sweet-lab-app**
3. Ve a la pestaña **"Functions"**

### Métricas Clave:

#### 1. **Function Invocations (Invocaciones)**
```
Este mes: 12,450 / 125,000
Porcentaje usado: 10%
```
**¿Qué significa?**
- Has llamado tus APIs 12,450 veces este mes
- Tienes 112,550 invocaciones restantes (90%)
- **Estado:** 🟢 Excelente - Muy por debajo del límite

**¿Cuándo preocuparse?**
- 🟡 70-85%: Monitorear de cerca
- 🟠 85-95%: Preparar optimizaciones
- 🔴 95-100%: Implementar optimizaciones urgentes

---

#### 2. **Function Runtime (Tiempo de Ejecución)**
```
Este mes: 2.5 horas / 100 horas
Porcentaje usado: 2.5%
```
**¿Qué significa?**
- Tus funciones han ejecutado durante 2.5 horas acumuladas
- Tienes 97.5 horas restantes (97.5%)
- **Estado:** 🟢 Excelente - Muy por debajo del límite

**Cálculo:**
```
12,450 invocaciones × 0.35 segundos promedio = 4,357 segundos = 1.2 horas
```

**¿Cuándo preocuparse?**
- 🟡 70-85%: Revisar funciones lentas
- 🟠 85-95%: Optimizar funciones críticas
- 🔴 95-100%: Urgente - implementar todas las optimizaciones

---

#### 3. **Top Functions by Invocations**
```
1. sales.js        8,500 calls (68%)
2. desserts.js     2,100 calls (17%)
3. notifications.js 1,200 calls (10%)
4. sellers.js        400 calls (3%)
5. days.js           250 calls (2%)
```

**¿Qué hacer?**
- Enfócate en optimizar las top 3 (85% del tráfico)
- Ignora las funciones con < 1% de uso

---

#### 4. **Top Functions by Runtime**
```
1. sales.js        1.8 hours (72%)
2. accounting.js   0.3 hours (12%)
3. inventory.js    0.2 hours (8%)
4. recipes.js      0.1 hours (4%)
5. desserts.js     0.1 hours (4%)
```

**¿Qué hacer?**
- Si `sales.js` domina: optimizar GET de ventas (batch items)
- Si `accounting.js` crece: revisar queries pesadas

---

## 🐘 Dashboard de Neon - Cómo Leerlo

### Acceso:
1. Ve a https://console.neon.tech
2. Selecciona tu proyecto
3. Ve a **"Monitoring"** → **"Compute"**

### Métricas Clave:

#### 1. **Compute Hours Used**
```
Este mes: 8.5 hours / 300 hours
Porcentaje usado: 2.8%
```
**¿Qué significa?**
- Tu base de datos ha estado activa 8.5 horas este mes
- Tienes 291.5 horas restantes (97.2%)
- **Estado:** 🟢 Excelente

**Nota:** Neon solo cuenta tiempo de procesamiento activo, NO tiempo idle

**¿Cuándo preocuparse?**
- 🟡 70-85%: Revisar queries lentas
- 🟠 85-95%: Optimizar urgentemente
- 🔴 95-100%: Considerar plan de pago

---

#### 2. **Storage Used**
```
Base de datos: 45 MB / 3 GB
Porcentaje usado: 1.5%
```
**¿Qué significa?**
- Tu base de datos ocupa 45MB
- Tienes 2.955 GB restantes
- **Estado:** 🟢 Excelente

**¿Qué ocupa espacio?**
- Tablas de ventas (~20 MB)
- Recibos/imágenes base64 (~15 MB) ⚠️ Crece rápido
- Logs y notificaciones (~10 MB)

**¿Cuándo preocuparse?**
- 🟡 70-85% (2.1 GB): Limpiar logs antiguos
- 🟠 85-95% (2.6 GB): Archivar/eliminar datos
- 🔴 95-100%: Urgente - limpiar o pagar

---

#### 3. **Query Performance**
Neon no muestra queries específicas en plan gratuito, pero puedes:
- Ver tiempo promedio de conexión
- Ver picos de uso (horario)
- Identificar slow queries con logs

---

## 🔬 Monitoreo Manual con Logs

### Agregar Timing a tus Funciones

Edita cualquier función (ej: `sales.js`) y agrega:

```javascript
export async function handler(event) {
    const startTime = Date.now();
    
    try {
        // ... tu código normal ...
        
        const duration = Date.now() - startTime;
        console.log(`[TIMING] ${event.httpMethod} /api/sales - ${duration}ms`);
        
        return json(result);
    } catch (err) {
        const duration = Date.now() - startTime;
        console.log(`[TIMING] ${event.httpMethod} /api/sales - ${duration}ms (ERROR)`);
        return json({ error: String(err) }, 500);
    }
}
```

### Ver Logs en Netlify

1. Ve a tu sitio en Netlify
2. **Functions** → **Logs** (tab superior)
3. Busca `[TIMING]` en el filtro

**Ejemplo de logs:**
```
[TIMING] GET /api/sales - 340ms
[TIMING] POST /api/sales - 120ms
[TIMING] PUT /api/sales - 450ms
[TIMING] GET /api/desserts - 15ms (cached)
```

---

## 📈 Cuándo Implementar Cada Optimización

### 🟢 AHORA (Impacto Alto, Esfuerzo Bajo)

#### 1. **Agregar Caché a Sellers**
**Si:** `sellers.js` aparece en top 5 de invocaciones
**Código:**
```javascript
// netlify/functions/sellers.js
let sellersCache = null;
let cacheTime = 0;
const CACHE_TTL = 60000; // 1 minuto

export async function handler(event) {
    if (event.httpMethod === 'GET') {
        const now = Date.now();
        if (sellersCache && (now - cacheTime) < CACHE_TTL) {
            return json(sellersCache);
        }
        
        const sellers = await sql`SELECT * FROM sellers WHERE archived_at IS NULL ORDER BY name`;
        sellersCache = sellers;
        cacheTime = now;
        return json(sellers);
    }
    // ... resto del código
}
```
**Ahorro:** 80-100ms por llamada cacheada

---

#### 2. **Agregar Logs de Timing**
**Si:** Quieres datos precisos de rendimiento
**Código:** Ver sección anterior
**Esfuerzo:** 5 minutos
**Beneficio:** Datos precisos para optimizar

---

### 🟡 PRONTO (Impacto Alto, Esfuerzo Medio)

#### 3. **Batch Items Query en Sales GET**
**Si:** 
- `sales.js` runtime > 30% del total
- Tienes > 50 ventas por día

**Código:**
```javascript
// REEMPLAZAR ESTE BLOQUE en sales.js (líneas 199-212):

// ANTES:
for (const row of rows) {
    try {
        const items = await sql`
            SELECT si.id, si.dessert_id, si.quantity, si.unit_price, d.name, d.short_code
            FROM sale_items si
            JOIN desserts d ON d.id = si.dessert_id
            WHERE si.sale_id = ${row.id}
            ORDER BY d.position ASC, d.id ASC
        `;
        row.items = items || [];
    } catch (err) {
        row.items = [];
    }
}

// DESPUÉS:
if (rows.length > 0) {
    const saleIds = rows.map(r => r.id);
    const allItems = await sql`
        SELECT si.sale_id, si.dessert_id, si.quantity, si.unit_price, d.name, d.short_code
        FROM sale_items si
        INNER JOIN desserts d ON d.id = si.dessert_id
        WHERE si.sale_id = ANY(${saleIds})
        ORDER BY si.sale_id, d.position ASC
    `;
    
    const itemsBySaleId = {};
    for (const item of allItems) {
        if (!itemsBySaleId[item.sale_id]) {
            itemsBySaleId[item.sale_id] = [];
        }
        itemsBySaleId[item.sale_id].push({
            id: item.id,
            dessert_id: item.dessert_id,
            quantity: item.quantity,
            unit_price: item.unit_price,
            name: item.name,
            short_code: item.short_code
        });
    }
    
    for (const row of rows) {
        row.items = itemsBySaleId[row.id] || [];
    }
}
```

**Ahorro:** 40-60% en tiempo de respuesta con 20+ ventas

---

### 🟠 SOLO SI ES NECESARIO (Impacto Medio, Esfuerzo Alto)

#### 4. **Crear Endpoint de Búsqueda Global**
**Si:** 
- Uso > 80% del plan gratuito
- Reportes frecuentes (> 100/día)

**Crear:** `netlify/functions/client-search.js`
```javascript
import { ensureSchema, sql } from './_db.js';

function json(body, status = 200) {
    return { 
        statusCode: status, 
        headers: { 'Content-Type': 'application/json' }, 
        body: JSON.stringify(body) 
    };
}

export async function handler(event) {
    if (event.httpMethod !== 'GET') {
        return json({ error: 'Solo GET permitido' }, 405);
    }
    
    const params = new URLSearchParams(event.rawQuery || '');
    const clientName = params.get('client_name') || '';
    const startDate = params.get('start_date') || '2024-01-01';
    const endDate = params.get('end_date') || '2024-12-31';
    const actorName = params.get('actor') || '';
    
    if (!clientName) {
        return json({ error: 'client_name requerido' }, 400);
    }
    
    try {
        // Verificar permisos
        let role = 'user';
        if (actorName) {
            const r = await sql`SELECT role FROM users WHERE lower(username)=lower(${actorName}) LIMIT 1`;
            role = (r && r[0] && r[0].role) ? String(r[0].role) : 'user';
        }
        
        // Query única optimizada
        let rows;
        if (role === 'admin' || role === 'superadmin') {
            rows = await sql`
                SELECT 
                    s.id,
                    sd.day AS day_iso,
                    se.name AS seller_name,
                    s.client_name,
                    s.qty_arco, s.qty_melo, s.qty_mara, s.qty_oreo, s.qty_nute,
                    s.pay_method,
                    s.is_paid,
                    s.total_cents
                FROM sales s
                INNER JOIN sale_days sd ON sd.id = s.sale_day_id
                INNER JOIN sellers se ON se.id = s.seller_id
                WHERE sd.day BETWEEN ${startDate} AND ${endDate}
                  AND lower(s.client_name) LIKE lower(${'%' + clientName + '%'})
                ORDER BY sd.day DESC
                LIMIT 1000
            `;
        } else {
            rows = await sql`
                SELECT 
                    s.id,
                    sd.day AS day_iso,
                    se.name AS seller_name,
                    s.client_name,
                    s.qty_arco, s.qty_melo, s.qty_mara, s.qty_oreo, s.qty_nute,
                    s.pay_method,
                    s.is_paid,
                    s.total_cents
                FROM sales s
                INNER JOIN sale_days sd ON sd.id = s.sale_day_id
                INNER JOIN sellers se ON se.id = s.seller_id
                WHERE sd.day BETWEEN ${startDate} AND ${endDate}
                  AND lower(s.client_name) LIKE lower(${'%' + clientName + '%'})
                  AND lower(se.name) = lower(${actorName})
                ORDER BY sd.day DESC
                LIMIT 1000
            `;
        }
        
        return json(rows);
    } catch (err) {
        return json({ error: String(err) }, 500);
    }
}
```

**En el frontend (public/app.js):**
```javascript
// REEMPLAZAR loadGlobalClientDetailRows():
async function loadGlobalClientDetailRows(clientName) {
    const now = new Date();
    const start = new Date(now.getFullYear(), 0, 1).toISOString().slice(0,10); // Inicio del año
    const end = now.toISOString().slice(0,10);
    
    const params = new URLSearchParams({
        client_name: clientName,
        start_date: start,
        end_date: end,
        actor: state.currentUser?.name || ''
    });
    
    const rows = await api('GET', `/api/client-search?${params.toString()}`);
    
    const formattedRows = rows.map(r => ({
        id: r.id,
        dayIso: r.day_iso,
        sellerName: r.seller_name,
        qty_arco: Number(r.qty_arco || 0),
        qty_melo: Number(r.qty_melo || 0),
        qty_mara: Number(r.qty_mara || 0),
        qty_oreo: Number(r.qty_oreo || 0),
        qty_nute: Number(r.qty_nute || 0),
        pay_method: r.pay_method || '',
        is_paid: !!r.is_paid
    }));
    
    renderClientDetailTable(formattedRows);
}
```

**Ahorro:** De 3000ms (150+ queries) a 500ms (1 query) = 83% reducción

---

## 🚨 Alertas y Umbrales

### Configurar Alertas en Netlify

1. Ve a **Site Settings** → **Notifications**
2. Agrega webhook o email
3. Configura:
   - **Function invocations** > 100,000 (80%)
   - **Function runtime** > 80 hours (80%)

### Umbrales Recomendados:

| Métrica | 🟢 Ok | 🟡 Alerta | 🟠 Crítico |
|---------|-------|-----------|------------|
| Invocaciones | < 85K | 85-105K | > 105K |
| Runtime | < 70h | 70-85h | > 85h |
| Neon Compute | < 210h | 210-270h | > 270h |
| Neon Storage | < 2GB | 2-2.5GB | > 2.5GB |

---

## 📊 Ejemplo de Análisis Mensual

### Mes de Enero 2024:

```
📈 RESUMEN DE USO

Netlify Functions:
  - Invocaciones: 45,230 / 125,000 (36%) 🟢
  - Runtime: 18.5h / 100h (18.5%) 🟢
  - Función más usada: sales.js (68%)
  - Promedio por invocación: 1.47 segundos
  
Neon Database:
  - Compute: 32h / 300h (10.6%) 🟢
  - Storage: 125MB / 3GB (4.1%) 🟢
  - Crecimiento: +15MB vs. mes anterior
  
💰 Costos:
  - Plan: Gratis ✅
  - Facturado: $0.00
  
🎯 Recomendaciones:
  - Estado general: EXCELENTE 🟢
  - Sin necesidad de optimizaciones
  - Margen de crecimiento: 10x antes de preocuparse
```

---

## 🛠️ Herramientas de Debugging

### 1. **Medir Tiempo de Queries Específicas**

```javascript
async function measureQuery(name, queryFn) {
    const start = Date.now();
    const result = await queryFn();
    const duration = Date.now() - start;
    console.log(`[QUERY] ${name} - ${duration}ms`);
    return result;
}

// Uso:
const sales = await measureQuery('Get Sales', () => 
    sql`SELECT * FROM sales WHERE seller_id = ${sellerId}`
);
```

---

### 2. **Analizar ensureSchema Performance**

```javascript
// Agregar en _db.js después de línea 564:
export async function ensureSchema() {
    const overallStart = Date.now();
    
    if (schemaEnsured) {
        console.log('[SCHEMA] Fast path - already ensured');
        return;
    }
    
    if (schemaCheckPromise) {
        console.log('[SCHEMA] Waiting for concurrent check');
        return schemaCheckPromise;
    }
    
    schemaCheckPromise = (async () => {
        try {
            const checkStart = Date.now();
            try {
                const cur = await sql`SELECT version FROM schema_meta LIMIT 1`;
                const currentVersion = Number(cur?.[0]?.version || 0);
                
                console.log(`[SCHEMA] Version check: ${Date.now() - checkStart}ms`);
                
                if (currentVersion >= SCHEMA_VERSION) {
                    schemaEnsured = true;
                    console.log('[SCHEMA] Up to date - skipping DDL');
                    return;
                }
            } catch (err) {
                console.log('[SCHEMA] Table not found - full setup needed');
            }
            
            console.log('[SCHEMA] Running migrations...');
            const migrateStart = Date.now();
            
            // ... resto del código ...
            
            console.log(`[SCHEMA] Migrations completed: ${Date.now() - migrateStart}ms`);
            console.log(`[SCHEMA] Total time: ${Date.now() - overallStart}ms`);
            
            schemaEnsured = true;
        } finally {
            schemaCheckPromise = null;
        }
    })();
    
    return schemaCheckPromise;
}
```

**Ver en logs:**
```
[SCHEMA] Fast path - already ensured
[SCHEMA] Version check: 45ms
[SCHEMA] Up to date - skipping DDL
[SCHEMA] Running migrations...
[SCHEMA] Migrations completed: 1850ms
[SCHEMA] Total time: 1895ms
```

---

## 📋 Checklist de Mantenimiento Mensual

### Cada Mes:

- [ ] Revisar dashboard de Netlify
  - [ ] Verificar invocaciones < 80%
  - [ ] Verificar runtime < 70%
  - [ ] Identificar función más usada
  
- [ ] Revisar dashboard de Neon
  - [ ] Verificar compute < 70%
  - [ ] Verificar storage < 70%
  - [ ] Revisar crecimiento de datos
  
- [ ] Analizar logs (si agregaste timing)
  - [ ] Identificar queries > 500ms
  - [ ] Buscar errores frecuentes
  
- [ ] Limpiar datos antiguos (opcional)
  - [ ] Notificaciones > 90 días
  - [ ] Logs de cambios > 180 días
  
- [ ] Revisar imágenes de recibos
  - [ ] Contar cantidad
  - [ ] Estimar tamaño total
  - [ ] Considerar archivo si > 1GB

---

## 🎓 FAQ - Preguntas Frecuentes

### ¿Por qué algunas llamadas son mucho más lentas?

**Respuesta:** Probablemente sea un "cold start". Después de 10-15 minutos sin uso, la función se apaga y tarda ~2 segundos en volver a arrancar.

**Solución:** Es normal. Si es muy frecuente, considera Netlify Pro que tiene "always-on" functions.

---

### ¿Cómo sé si estoy cerca del límite?

**Respuesta:** 
- Netlify y Neon te envían emails al 80% y 95%
- Dashboard muestra porcentajes claramente
- Si estás < 70% → tranquilo 🟢
- Si estás > 85% → revisar optimizaciones 🟡
- Si estás > 95% → urgente 🔴

---

### ¿Vale la pena optimizar si estoy al 20%?

**Respuesta:** NO. Solo optimiza si:
- Estás > 70% de uso
- Notas lentitud real (> 1 segundo)
- Planeas crecer 5x en el corto plazo

**Razón:** Tiempo de desarrollo es más valioso que $2-5/mes de ahorro.

---

### ¿Qué pasa si me paso del límite gratuito?

**Respuesta:** 
- **Netlify:** Te cobra automáticamente el exceso (~$25 por cada 1M de invocaciones adicionales)
- **Neon:** Tu base de datos se PAUSA hasta el próximo mes (o pagas $0.16/hora adicional)

**Recomendación:** Configura alertas al 80% para tener tiempo de reaccionar.

---

### ¿Debo preocuparme por cold starts?

**Respuesta:** Solo si:
- Tu app es crítica (tiempo real)
- Usuarios se quejan de lentitud
- Tienes tráfico 24/7

**En tu caso:** NO. Es una app interna con uso diurno. Los cold starts son aceptables.

---

## ✅ Resumen Ejecutivo

### Estado Actual: 🟢 EXCELENTE

**Métricas:**
- Uso Netlify: ~10-20% ✅
- Uso Neon: ~5-10% ✅
- Costo: $0/mes (plan gratuito) ✅

**Recomendación Principal:**
> **NO hagas nada ahora.** Tu aplicación está bien optimizada y muy por debajo de los límites. Solo revisa los dashboards una vez al mes y considera optimizaciones cuando llegues al 70% de uso.

**Próximos Pasos:**
1. ✅ Leer y entender este documento
2. ✅ Guardar URLs de dashboards (Netlify + Neon)
3. ✅ Configurar calendario: revisar 1er día de cada mes
4. ⏸️ Esperar a que el uso crezca antes de optimizar

---

**Última actualización:** 2025-10-06
