# ✅ Cómo Verificar el Selector de Participantes

## 🎯 Lo que DEBERÍAS ver

Cuando vayas a **Reporte de Ventas → Ingredientes Necesarios → Receta**, justo después del título de cada postre (ej: "Arco × 50"), deberías ver:

```
┌─────────────────────────────────────────────────┐
│  🍰 Arco × 50                                  │
├─────────────────────────────────────────────────┤
│                                                 │
│  👥 Participantes en producción                │
│                                                 │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐      │
│  │Marcela 15│ │ Aleja 8  │ │ Jorge 5  │      │
│  └──────────┘ └──────────┘ └──────────┘      │
│                                                 │
│            [✓ Todos] [✕ Limpiar]               │
└─────────────────────────────────────────────────┘
         (línea separadora gris)
┌─────────────────────────────────────────────────┐
│  Paso 1: Mezclar                                │
│  ...ingredientes...                             │
└─────────────────────────────────────────────────┘
```

## 🔍 Pasos de Verificación

### 1. Abre la Consola del Navegador (F12)

Antes de ir a la página, abre la consola del navegador (presiona F12).

### 2. Ve a la Página de Recetas

Ruta: **Reporte de Ventas → Ingredientes Necesarios → Receta**

### 3. Verifica los Logs en Consola

Deberías ver algo como:

```
📥 Loading users for dessert: Arco
✅ Loaded 3 users: [...]
🔧 Building user selector for Arco, users: [...]
🎨 Rendering user selector for Arco, found 3 users
```

### 4. Busca el Selector Visualmente

Después del título de cada postre, busca:
- Una caja con fondo rosa suave
- Texto "👥 Participantes en producción"
- Botones redondeados con nombres de usuarios
- Números en círculos rosados (badges de participación)

## ⚠️ Si NO ves nada

### Caso 1: No hay usuarios en la base de datos

**Síntoma:** Mensaje "⚠️ No hay usuarios disponibles"

**Solución:** Los usuarios deberían crearse automáticamente. Verifica en la consola que la tabla `users` tenga datos.

### Caso 2: Error en la API

**Síntoma:** Logs en consola mostrando "❌ Error loading users"

**Solución:** 
1. Verifica que `/api/recipes?production_users=1` esté respondiendo
2. Usa la página de prueba: abre `/test_user_selector.html`
3. Click en "Test Get Users"

### Caso 3: JavaScript no se está ejecutando

**Síntoma:** No hay logs en consola en absoluto

**Solución:**
1. Verifica que no haya errores de JavaScript en consola (errores en rojo)
2. Refresca la página con Ctrl+F5 (hard refresh)
3. Verifica que receta.html se haya guardado correctamente

## 🧪 Página de Prueba

Si no ves el selector en la página principal, prueba primero con:

```
/test_user_selector.html
```

Esta página tiene dos botones:
1. **Test Get Users** - Verifica que el endpoint devuelva usuarios
2. **Test Save Users** - Verifica que se puedan guardar selecciones

## 📸 Aspecto Visual Esperado

### Botón No Seleccionado
- Fondo: **Blanco**
- Borde: **Gris claro**
- Texto: **Negro**
- Badge (círculo con número): **Rosa con gradiente**

### Botón Seleccionado
- Fondo: **Rosa con gradiente** (#f4a6b7 → #ff69b4)
- Borde: **Rosa**
- Texto: **Blanco**
- Sombra: **Rosada con blur**

### Al hacer Hover
- Se eleva 2px
- Borde cambia a rosa
- Sombra más pronunciada

### Al hacer Click
- Animación de escala (1.0 → 1.05 → 1.0)
- Checkmark temporal "✓" aparece por 800ms
- Auto-guardado en segundo plano

## 🎬 Comportamiento Esperado

1. **Al cargar la página:**
   - Se cargan todos los usuarios del sistema
   - Se ordenan por número de participaciones en ese postre
   - Aparecen badges con el número

2. **Al hacer click en un usuario:**
   - Botón cambia de blanco a rosado (o viceversa)
   - Aparece checkmark ✓ brevemente
   - Se guarda automáticamente en el servidor
   - No necesitas hacer nada más

3. **Botones de acción:**
   - **✓ Todos:** Selecciona todos los usuarios de golpe
   - **✕ Limpiar:** Deselecciona todos

## 📊 Datos de Ejemplo

Si todo funciona, deberías poder:

1. Seleccionar "Marcela" y "Aleja" para Arco
2. Cerrar la página
3. Volver a abrir la página de recetas
4. Ver que Marcela y Aleja aparecen con un número de participación más alto
5. Ver que aparecen primero en la lista (por tener más participaciones)

## 🐛 Debugging Avanzado

### Ver datos en la base de datos:

```sql
-- Ver usuarios
SELECT id, username FROM users ORDER BY username;

-- Ver participaciones registradas
SELECT 
    rpu.dessert,
    u.username,
    rpu.session_date,
    COUNT(*) OVER (PARTITION BY rpu.dessert, rpu.user_id) as total
FROM recipe_production_users rpu
JOIN users u ON u.id = rpu.user_id
ORDER BY rpu.dessert, total DESC;
```

### Verificar API directamente:

```bash
# En terminal o con curl
curl http://localhost:8888/api/recipes?production_users=1
```

Debería retornar JSON con usuarios.

## 📞 Si Aún No Funciona

Verifica que los siguientes archivos tengan los cambios:

1. ✅ `netlify/functions/_db.js` - Tabla `recipe_production_users`
2. ✅ `netlify/functions/recipes.js` - Endpoints GET/POST
3. ✅ `public/receta.html` - Funciones `loadUsers`, `buildUserSelector`, `saveProductionUsers`

Busca en los archivos:
```bash
grep -n "recipe_production_users" netlify/functions/_db.js
grep -n "buildUserSelector" public/receta.html
grep -n "production_users" netlify/functions/recipes.js
```

Si encuentras esas líneas, el código está ahí. El problema sería de ejecución o configuración.
