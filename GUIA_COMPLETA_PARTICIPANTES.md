# 📚 Guía Completa: Participantes en Producción

## 🎯 Cómo Usar el Sistema (Paso a Paso)

### 1️⃣ Seleccionar Participantes en la Página de Recetas

1. **Navegar a Recetas:**
   - Desde inicio, click en "Ventas"
   - Selecciona una fecha en el calendario (ej: 30 Nov 2024)
   - Click en "Ingredientes necesarios"
   - Click en "Receta"

2. **Verás una nueva sección rosa en la parte superior:**
   ```
   ┌──────────────────────────────────────────────────┐
   │ 📅 Fecha de producción: [30/11/2024]            │
   │      [💾 Guardar Todo]  [📋 Ver Registros]      │
   └──────────────────────────────────────────────────┘
   ```

3. **La fecha se pre-llena automáticamente** con la fecha que seleccionaste en el calendario

4. **Seleccionar participantes:**
   - Desplázate por cada tipo de postre (Arco, Melo, Mara, Oreo, Nute)
   - A la derecha de cada postre verás botones de usuarios
   - Click en los nombres de las personas que participaron
   - Los botones se ponen rosados cuando están seleccionados
   - **IMPORTANTE:** Los cambios NO se guardan automáticamente

5. **Guardar:**
   - Cuando termines de seleccionar todos los participantes
   - Click en el botón **"💾 Guardar Todo"** en la parte superior
   - Verás un mensaje verde: "✅ Todo guardado correctamente (X postres)"

6. **Navegación:**
   - **🏠 Inicio:** Botón nuevo en el header para volver al inicio
   - **Volver:** Vuelve a la página anterior (ingredientes)
   - **📋 Ver Registros:** Abre directamente la página de entregas

### 2️⃣ Ver Participantes en la Página de Entregas

1. **Navegar a Entregas:**
   - Desde inicio, click en "Entregas"
   - O desde Recetas, click en "📋 Ver Registros"

2. **Encontrar los participantes:**
   - Busca la fecha que seleccionaste (ej: 30 Noviembre 2024)
   - Inmediatamente después de la fecha (fila azul) verás:
   ```
   ┌─────────────────────────────────────────────────┐
   │  30 Noviembre 2024                             │ ← Azul
   ├─────────────────────────────────────────────────┤
   │  👥 Participantes:  Marcela, Aleja | Jorge | - │ ← Rosa (NUEVA FILA)
   ├─────────────────────────────────────────────────┤
   │  Vendedor           Arco    Melo    Mara  ...  │
   │  Marcela            50      30      25    ...  │
   └─────────────────────────────────────────────────┘
   ```

3. **Interpretación:**
   - Cada columna corresponde a un postre
   - Los nombres separados por comas son los participantes
   - Si no hay participantes, se muestra "-"

## 🔧 Cambios Implementados

### Página de Recetas (`receta.html`)

#### ✅ Nuevos Elementos UI:
1. **Botón "🏠 Inicio"** en el header (arriba a la izquierda)
2. **Panel de control rosa** con:
   - Selector de fecha de producción (pre-llenado con fecha seleccionada)
   - Botón "💾 Guardar Todo"
   - Botón "📋 Ver Registros"
3. **Barra de estado** (muestra mensajes de éxito/error)

#### ✅ Funcionalidad:
- Los participantes se almacenan localmente hasta que des click en "Guardar"
- El selector de fecha usa la fecha que seleccionaste en ventas
- Guardado batch: todos los postres se guardan de una vez
- Feedback visual con mensajes de estado

### API de Entregas (`netlify/functions/deliveries.js`)

#### ✅ Nuevas Queries:
```javascript
// Obtiene participantes de delivery_production_users
SELECT 
    d.day,
    des.short_code,
    u.username
FROM delivery_production_users dpu
JOIN deliveries d ON d.id = dpu.delivery_id
JOIN desserts des ON des.id = dpu.dessert_id
JOIN users u ON u.id = dpu.user_id
ORDER BY d.day, des.short_code, u.username
```

#### ✅ Estructura de Datos:
```json
{
  "day": "2024-11-30",
  "sellers": [...],
  "production_users": {
    "arco": ["Marcela", "Aleja"],
    "melo": ["Jorge"],
    "mara": [],
    "oreo": ["Marcela"],
    "nute": []
  }
}
```

### Página de Entregas (`deliveries.html`)

#### ✅ Nueva Fila:
- Se renderiza después del encabezado de fecha
- Fondo rosa suave: `rgba(244, 166, 183, 0.08)`
- Solo aparece si hay al menos un participante
- Formato: `👥 Participantes: [nombres por columna]`

## 🧪 Cómo Verificar que Funciona

### Test 1: Flujo Completo

```
1. Inicio → Ventas
2. Seleccionar fecha: 30 Nov 2024
3. Ingredientes → Receta
4. Verificar que la fecha muestra "30/11/2024"
5. Seleccionar participantes en cada postre
6. Click en "💾 Guardar Todo"
7. Mensaje verde: "✅ Todo guardado correctamente"
8. Click en "📋 Ver Registros"
9. Buscar la fecha "30 Noviembre 2024"
10. Ver la fila "👥 Participantes:" con los nombres
```

### Test 2: Consola del Navegador

**En página de Recetas (después de seleccionar):**
```javascript
// Debería mostrar logs como:
// ✏️ Updated selection for arco: [1, 2]
// ✏️ Updated selection for melo: [3]
```

**Después de guardar:**
```javascript
// Debería mostrar:
// 💾 Saving users for arco on 2024-11-30: [1, 2]
// ✅ Saved successfully: {ok: true, saved: 2}
```

**En página de Entregas:**
```javascript
fetch('/api/deliveries?sales_consolidated=true')
  .then(r => r.json())
  .then(d => {
    console.log('Datos:', d);
    console.log('Participantes:', d[0].production_users);
  });
```

### Test 3: Verificación Visual

**Recetas:**
- [ ] Hay un botón "🏠 Inicio" en el header
- [ ] Hay un panel rosa con selector de fecha
- [ ] La fecha está pre-llenada
- [ ] Los botones de usuarios se ponen rosados al seleccionar
- [ ] Al click en "Guardar" aparece mensaje verde
- [ ] El botón "Ver Registros" abre entregas

**Entregas:**
- [ ] Hay una fila rosa después de cada fecha
- [ ] La fila dice "👥 Participantes:"
- [ ] Los nombres aparecen en la columna del postre correcto
- [ ] Los postres sin participantes muestran "-"

## 🐛 Solución de Problemas

### Problema: "No veo la fila de participantes en Entregas"

**Diagnóstico:**
```javascript
// En consola de Entregas
fetch('/api/deliveries?sales_consolidated=true')
  .then(r => r.json())
  .then(d => {
    if (!d[0]?.production_users) {
      console.error('❌ production_users no está en los datos');
    } else {
      console.log('✅ production_users encontrado:', d[0].production_users);
    }
  });
```

**Soluciones:**
1. Refresca la página con Ctrl+F5
2. Verifica que guardaste con el botón "Guardar Todo"
3. Verifica que la fecha coincide con la que seleccionaste
4. Usa `/test_participantes.html` para verificar los datos

### Problema: "La fecha no coincide con la que seleccioné"

**Causa:** La fecha puede haber sido modificada manualmente

**Solución:**
1. Verifica la fecha en el selector rosa de la página Recetas
2. Cambia la fecha manualmente si es necesario
3. Vuelve a guardar

### Problema: "No aparece el mensaje de guardado"

**Causa:** Error en la API o no hay selecciones

**Diagnóstico:**
```javascript
// En consola de Recetas después de seleccionar
console.log(selectedUsersByDessert);
// Debería mostrar: { arco: [1, 2], melo: [3], ... }
```

**Solución:**
1. Abre la consola del navegador (F12)
2. Busca errores en rojo
3. Verifica que seleccionaste al menos un participante
4. Intenta guardar de nuevo

### Problema: "No veo usuarios para seleccionar"

**Causa:** No hay usuarios en la base de datos

**Solución:**
1. Abre `/diagnostico-usuarios.html`
2. Click en "Test Get Users"
3. Si no hay usuarios, se usarán los "sellers" automáticamente
4. Verifica que existan registros en la tabla `sellers`

## 📊 Estructura de Datos

### Base de Datos

**Tabla `recipe_production_users`:**
```sql
CREATE TABLE recipe_production_users (
    id SERIAL PRIMARY KEY,
    dessert TEXT NOT NULL,
    user_id INTEGER NOT NULL REFERENCES users(id),
    session_date DATE NOT NULL DEFAULT CURRENT_DATE,
    created_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE (dessert, user_id, session_date)
);
```

**Tabla `delivery_production_users`:**
```sql
CREATE TABLE delivery_production_users (
    id SERIAL PRIMARY KEY,
    delivery_id INTEGER NOT NULL REFERENCES deliveries(id),
    dessert_id INTEGER NOT NULL REFERENCES desserts(id),
    user_id INTEGER NOT NULL REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE (delivery_id, dessert_id, user_id)
);
```

### Sincronización Automática

Cuando guardas participantes en Recetas, el sistema:

1. **Guarda en `recipe_production_users`:**
   - dessert: "arco", "melo", etc.
   - user_id: IDs de usuarios seleccionados
   - session_date: Fecha del selector

2. **Busca o crea delivery:**
   - Busca un delivery con `day = session_date`
   - Si no existe, crea uno nuevo

3. **Guarda en `delivery_production_users`:**
   - delivery_id: ID del delivery encontrado/creado
   - dessert_id: ID del dessert en la tabla `desserts`
   - user_id: IDs de usuarios seleccionados

## 🚀 Mejoras Futuras Sugeridas

1. **Edición en Entregas:**
   - Permitir editar participantes directamente en la página de entregas
   - Botón "✏️ Editar" junto a "👥 Participantes:"

2. **Historial:**
   - Modal con historial de participaciones por usuario
   - Estadísticas de participación

3. **Auto-sugerencias:**
   - Pre-seleccionar participantes basado en historial
   - "Usar participantes de la última vez"

4. **Notificaciones:**
   - Recordatorio si no se han registrado participantes
   - Confirmación por WhatsApp/email a los participantes

## 📞 Soporte

Si encuentras problemas:

1. **Verifica la consola del navegador (F12)**
2. **Usa las páginas de diagnóstico:**
   - `/test_participantes.html`
   - `/diagnostico-usuarios.html`
3. **Revisa este documento**
4. **Verifica los datos en la base de datos** con las queries SQL de arriba

---

✅ **Sistema completamente funcional y probado**
📅 Implementado: 30 Noviembre 2024
