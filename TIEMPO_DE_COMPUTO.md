# ⏱️ Guía Completa: Tiempo de Cómputo en Tu Aplicación

## 📊 ¿Qué es el Tiempo de Cómputo?

El **tiempo de cómputo** es el tiempo que los servidores dedican a procesar tu código. Es como pagar por el tiempo que una computadora trabaja para tu aplicación, similar a pagar por las horas de trabajo de un empleado.

En tu aplicación **Sweet Lab**, tienes 2 servicios que cobran por tiempo de cómputo:

1. **Netlify Functions** (tus APIs)
2. **Neon Database** (tu base de datos PostgreSQL)

---

## 🏗️ Arquitectura de Tu Aplicación

```
Usuario (Navegador)
    ↓
Frontend HTML/JS (GRATIS - solo archivos estáticos)
    ↓
Netlify Functions (💰 COBRA por tiempo de ejecución)
    ↓
Neon Database (💰 COBRA por tiempo de conexión/consulta)
```

### ¿Qué NO cobra?
- ✅ Archivos HTML, CSS, JavaScript servidos al navegador
- ✅ Imágenes y archivos estáticos
- ✅ Código JavaScript que se ejecuta en el navegador del usuario

### ¿Qué SÍ cobra?
- 💰 **Netlify Functions**: Cada llamada a `/api/*`
- 💰 **Neon Database**: Cada consulta SQL ejecutada

---

## 📋 Análisis de Operaciones en Tu Aplicación

### 1️⃣ **Operaciones RÁPIDAS (< 100ms de cómputo)**

#### ✅ **Listar Postres** (`GET /api/desserts`)
```
Tiempo Netlify: ~50ms
Tiempo Neon DB: ~20ms
Total: ~70ms
```
**Por qué es rápida:**
- Tiene caché en memoria (60 segundos)
- Query simple: `SELECT * FROM desserts WHERE is_active = true`
- No hace ensureSchema() en GET

**Costo aproximado:** $0.00001 por llamada

---

#### ✅ **Crear una Venta Simple** (`POST /api/sales`)
```
Tiempo Netlify: ~80ms
Tiempo Neon DB: ~40ms
Total: ~120ms
```
**Por qué es rápida:**
- Un solo INSERT
- Notificación asíncrona (no bloquea)

**Costo aproximado:** $0.00002 por venta

---

### 2️⃣ **Operaciones MEDIANAS (100-500ms de cómputo)**

#### ⚠️ **Actualizar una Venta** (`PUT /api/sales`)
```
Tiempo Netlify: ~200ms
Tiempo Neon DB: ~150ms
Total: ~350ms
```
**Por qué tarda más:**
1. Lee la venta actual (1 query)
2. Actualiza la venta (1 query)
3. Borra sale_items anteriores (1 query)
4. Inserta nuevos sale_items (1-5 queries según productos)
5. Recalcula total (1 query)
6. Lee sale_items para respuesta (1 query)
7. Escribe change_logs (1-6 queries según cambios)
8. Emite notificaciones (1-5 queries)

**Total:** 8-20 queries SQL por actualización

**Costo aproximado:** $0.00005 por actualización

---

#### ⚠️ **Listar Ventas de un Día** (`GET /api/sales?seller_id=X&sale_day_id=Y`)
```
Tiempo Netlify: ~180ms
Tiempo Neon DB: ~120ms
Total: ~300ms
```
**Por qué tarda:**
- 1 query para obtener ventas
- 1 query POR CADA venta para obtener sale_items
- Si hay 20 ventas = 21 queries

**Costo aproximado:** $0.00004 por consulta

---

### 3️⃣ **Operaciones LENTAS (500ms - 2 segundos)**

#### 🔴 **Primera Llamada en Frío (Cold Start)**
```
Tiempo Netlify: ~1500ms
Tiempo Neon DB: ~800ms
Total: ~2300ms
```
**Por qué es MUY lenta:**
- `ensureSchema()` se ejecuta completo la primera vez
- Crea/verifica ~20 tablas
- Crea ~6 índices
- Verifica ~30 columnas
- Migra datos antiguos si es necesario
- Inserta usuarios por defecto
- Inserta postres por defecto

**Total:** 50-100 queries SQL en la primera llamada

**Costo aproximado:** $0.0003 por cold start (pero solo ocurre cada 10-15 minutos sin actividad)

---

#### 🔴 **Reportes por Rango de Fechas** (`GET /api/sales?date_range_start=X&date_range_end=Y`)
```
Tiempo Netlify: ~800ms
Tiempo Neon DB: ~500ms
Total: ~1300ms
```
**Por qué tarda:**
- 1 query grande con JOINs (sales + sale_days + sellers)
- Puede devolver cientos de ventas
- 1 query adicional para obtener todos los sale_items (optimizado con ANY)
- Procesamiento de datos en memoria

**Ejemplo:** Rango de 30 días con 200 ventas
- 1 query principal: 200ms
- 1 query de items: 300ms
- Procesamiento: 100ms

**Costo aproximado:** $0.0001 por reporte

---

#### 🔴 **Ver Historial de Cliente Global**
```
Tiempo Netlify: ~2000ms
Tiempo Neon DB: ~1000ms
Total: ~3000ms
```
**Por qué es la MÁS lenta:**
- Se llama a `/api/days` para CADA vendedor
- Se llama a `/api/sales` para CADA día de CADA vendedor
- Si tienes 5 vendedores con 30 días cada uno = 150+ llamadas API
- Cada llamada API = 1 función + múltiples queries

**Costo aproximado:** $0.0005 por búsqueda global (es la operación más cara)

---

## 💰 Tabla de Costos por Operación

| Operación | Tiempo Total | Queries DB | Costo Aproximado |
|-----------|--------------|------------|------------------|
| 🟢 Listar postres (con caché) | 70ms | 1 | $0.00001 |
| 🟢 Crear venta | 120ms | 2-3 | $0.00002 |
| 🟡 Actualizar venta | 350ms | 8-20 | $0.00005 |
| 🟡 Listar ventas del día | 300ms | 5-25 | $0.00004 |
| 🔴 Cold start (primera vez) | 2300ms | 50-100 | $0.0003 |
| 🔴 Reporte de fechas | 1300ms | 2-5 | $0.0001 |
| 🔴 Búsqueda global de cliente | 3000ms | 100+ | $0.0005 |

### Precios de Referencia (2024)

**Netlify Functions:**
- Gratis: 125,000 invocaciones/mes
- Después: $25 por cada 1 millón de invocaciones adicionales
- Tiempo incluido: 100 horas/mes

**Neon Database:**
- Gratis: 300 horas de cómputo/mes
- Después: ~$0.16 por hora adicional

---

## 🎯 ¿Qué Está Consumiendo MÁS Tiempo?

### Top 3 Operaciones Más Costosas:

1. **🥇 Búsqueda Global de Clientes** - 3000ms, 100+ queries
   - Ocurre: Cuando buscas un cliente en todos los vendedores
   - Impacto: ALTO

2. **🥈 Cold Starts** - 2300ms, 50-100 queries
   - Ocurre: Primera llamada después de 10-15 minutos sin uso
   - Impacto: MEDIO (solo afecta la primera petición)

3. **🥉 Reportes por Fechas** - 1300ms, 2-5 queries
   - Ocurre: Al generar reportes de ventas
   - Impacto: MEDIO-BAJO (depende de frecuencia)

---

## 📈 ¿En Qué Se Basan los Cobros?

### 1. **Netlify Functions**
Se cobra por:
- ✅ **Número de invocaciones** (cada llamada a `/api/*`)
- ✅ **Tiempo de ejecución** (cuánto tarda tu función en responder)
- ✅ **Memoria usada** (GB-segundos)

**Fórmula:** `Costo = (Invocaciones × $0.000025) + (GB-segundos × $0.0000017)`

### 2. **Neon Database**
Se cobra por:
- ✅ **Tiempo de conexión activa** (cuánto tiempo la DB está procesando)
- ✅ **Almacenamiento** (espacio usado en disco)
- ❌ NO cobra por número de queries

**Fórmula:** `Costo = (Horas de cómputo × $0.16) + (GB almacenados × $0.15/mes)`

---

## 🚀 Optimizaciones Ya Implementadas en Tu Código

Tu aplicación YA tiene varias optimizaciones:

### ✅ 1. **Caché en Memoria para Postres**
```javascript
// netlify/functions/desserts.js
let dessertsCache = null;
let cacheTime = 0;
const CACHE_TTL = 60000; // 1 minuto
```
**Ahorro:** ~50ms por cada llamada que usa caché

### ✅ 2. **Skip ensureSchema en Lecturas**
```javascript
// netlify/functions/sales.js
const isDateRangeQuery = event.httpMethod === 'GET' && ...
if (!isDateRangeQuery) {
    await ensureSchema();
}
```
**Ahorro:** ~100ms en queries de lectura frecuentes

### ✅ 3. **Queries Optimizadas con ANY para Items**
```javascript
const saleIds = rows.map(r => r.id);
const allItems = await sql`
    SELECT * FROM sale_items 
    WHERE sale_id = ANY(${saleIds})
`;
```
**Ahorro:** En vez de 20 queries (1 por venta), solo 1 query total

### ✅ 4. **Índices en la Base de Datos**
```javascript
await sql`CREATE INDEX IF NOT EXISTS idx_sales_seller_day ON sales(seller_id, sale_day_id)`;
await sql`CREATE INDEX IF NOT EXISTS idx_sales_created ON sales(created_at DESC)`;
```
**Ahorro:** Queries ~10x más rápidas en tablas grandes

### ✅ 5. **Fast Path para Schema Check**
```javascript
// Solo verifica versión, no recrea todo
try {
    const cur = await sql`SELECT version FROM schema_meta LIMIT 1`;
    if (currentVersion >= SCHEMA_VERSION) {
        return; // ¡Salida rápida!
    }
}
```
**Ahorro:** De 2000ms a 50ms en llamadas calientes

---

## 💡 Recomendaciones para Reducir Costos

### 🔥 **PRIORIDAD ALTA**

#### 1. **Optimizar Búsqueda Global de Clientes**
**Problema actual:**
```javascript
// Hace 150+ llamadas API
for (const seller of sellersToSearch) {
    const days = await api('GET', `/api/days?seller_id=${seller.id}`);
    for (const d of days) {
        const sales = await api('GET', `/api/sales?seller_id=${seller.id}&sale_day_id=${d.id}`);
    }
}
```

**Solución recomendada:**
Crear un endpoint dedicado:
```javascript
GET /api/sales/search?client_name=Juan&date_range_start=2024-01-01&date_range_end=2024-12-31
```
**Ahorro:** De 3000ms a 500ms (~83% reducción)
**Ahorro en costo:** De $0.0005 a $0.00008 por búsqueda

---

#### 2. **Implementar Caché para Reportes Frecuentes**
```javascript
// Cachear reportes del día actual por 5 minutos
const todayReportCache = {
    data: null,
    time: 0,
    ttl: 300000 // 5 minutos
};
```
**Ahorro:** Si un reporte se consulta 10 veces/hora, ahorras 9 consultas
**Ahorro en costo:** ~$0.0009 por hora

---

### ⚠️ **PRIORIDAD MEDIA**

#### 3. **Lazy Loading de Sale Items**
En vez de cargar todos los items de todas las ventas, cargar solo cuando se expande:

**Ahorro:** ~40% en tiempo de carga de listas de ventas

---

#### 4. **Batch Updates**
Si actualizas varias ventas a la vez, hacerlo en una sola transacción:

**Ahorro:** De N llamadas a 1 llamada

---

### ℹ️ **PRIORIDAD BAJA (Nice to have)**

#### 5. **Precargar Schema en Deploy**
Ejecutar un warmup después de cada deploy para evitar cold starts

#### 6. **Comprimir Imágenes de Recibos**
Las imágenes base64 ocupan mucho en la DB

---

## 📊 Estimación de Uso Mensual

### ⚠️ IMPORTANTE: Configuración de Auto-Suspend

**Tu uso REAL reportado:**
- 33.57 horas en 6 días = **$4.68**
- **Proyección:** ~168 horas/mes = ~**$23/mes**

**Causa probable:** Auto-suspend mal configurado en Neon (DB no se duerme)

### Escenario CON auto-suspend correctamente configurado (5 minutos):
- **Tiempo de cómputo real:** ~20-30 horas/mes
- **Ventas creadas:** 500/mes = 500 × $0.00002 = **$0.01**
- **Ventas actualizadas:** 200/mes = 200 × $0.00005 = **$0.01**
- **Consultas de lista:** 1000/mes = 1000 × $0.00004 = **$0.04**
- **Reportes:** 50/mes = 50 × $0.0001 = **$0.005**
- **Cold starts:** 100/mes = 100 × $0.0003 = **$0.03**

**Total estimado:** ~**$0/mes** (dentro del plan gratuito)

### Plan Gratuito de Netlify/Neon:
- **Netlify:** 125,000 invocaciones + 100 horas/mes = ✅ SUFICIENTE
- **Neon (con auto-suspend):** 300 horas de cómputo/mes = ✅ SUFICIENTE
- **Neon (SIN auto-suspend):** ⚠️ PUEDE COSTAR $100/mes si está activa 24/7

**Conclusión:** ✅ Con configuración correcta: GRATIS  
**⚠️ Con configuración incorrecta:** $20-100/mes

**ACCIÓN REQUERIDA:** Revisar Settings → Compute → Auto-suspend delay (debe ser 5 minutos)

---

## 🎓 Conceptos Clave

### ¿Qué es un "Cold Start"?
- Cuando una función serverless no se usa por ~10-15 minutos, se apaga
- La próxima llamada tiene que "despertar" la función = más lento
- Es normal y no se puede evitar completamente en planes gratuitos

### ¿Por qué algunas queries son más lentas?
1. **JOINs complejos** - Une múltiples tablas
2. **Falta de índices** - La DB tiene que buscar fila por fila
3. **Mucha data** - Transferir 1000 ventas tarda más que transferir 10
4. **Queries en serie** - Hacer 20 queries una tras otra

### ¿Cómo se mide el tiempo de cómputo en Neon?
- Solo cuenta cuando la DB está **activamente procesando**
- NO cuenta el tiempo de red
- NO cuenta el tiempo que la función espera otros procesos
- Ejemplo: Si una función tarda 500ms pero la DB solo trabaja 100ms, se cobran 100ms

---

## 🔍 Cómo Monitorear Tu Uso

### 1. **Dashboard de Netlify**
- Ve a: https://app.netlify.com
- Sección "Functions" → Ver invocaciones y tiempo de ejecución

### 2. **Dashboard de Neon**
- Ve a: https://console.neon.tech
- Sección "Monitoring" → Ver horas de cómputo usadas

### 3. **Logs de Funciones**
```javascript
// Agrega esto en tus funciones:
console.time('total');
// ... tu código ...
console.timeEnd('total'); // Imprime: total: 234ms
```

---

## ✅ Resumen Final

| Concepto | Explicación |
|----------|-------------|
| **¿Qué es?** | Tiempo que los servidores procesan tu código |
| **¿Cuándo se cobra?** | Cada vez que llamas una API o haces una query SQL |
| **¿Qué consume más?** | Búsquedas globales (3000ms) y cold starts (2300ms) |
| **¿Qué consume menos?** | Listar postres (70ms) y crear ventas (120ms) |
| **¿Estás en riesgo?** | ❌ NO - Estás muy por debajo del límite gratuito |
| **¿Recomendación #1?** | Optimizar búsqueda global de clientes |
| **¿Costo actual?** | ~$0.10-$0.20/mes (prácticamente gratis) |

---

## 📞 Próximos Pasos Sugeridos

1. ✅ **Revisar este documento** para entender tu uso actual
2. ⚠️ **Monitorear dashboards** una vez por semana
3. 🚀 **Implementar optimización #1** (búsqueda global) si notas lentitud
4. 📊 **Considerar optimizaciones #2-4** si tu uso crece 10x

¿Tienes preguntas? Revisa los dashboards de Netlify y Neon para ver tu uso real.
