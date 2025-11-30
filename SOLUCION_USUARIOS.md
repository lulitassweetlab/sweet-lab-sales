# 🔧 Solución: No Hay Usuarios Disponibles

## ✅ Cambios Realizados

He actualizado el código para que **siempre encuentre usuarios** disponibles:

### 1. **API Mejorada** (`netlify/functions/recipes.js`)

Ahora la API obtiene usuarios de **dos fuentes**:

```javascript
// Primero busca en tabla 'users'
SELECT id, username FROM users

// Si no encuentra, busca en tabla 'sellers'
SELECT id, name as username FROM sellers
```

Esto garantiza que SIEMPRE haya usuarios para seleccionar.

### 2. **Guardado Inteligente**

Cuando guardas participantes, el sistema:
- ✅ Verifica si el usuario existe en `users`
- ✅ Si no existe, lo crea automáticamente desde `sellers`
- ✅ Guarda la participación

### 3. **Página de Diagnóstico**

Creé una página para verificar el estado: **`/diagnostico-usuarios.html`**

## 🧪 Cómo Probar

### Paso 1: Abre la Página de Diagnóstico

```
http://localhost:8888/diagnostico-usuarios.html
```

o en producción:

```
https://tu-sitio.netlify.app/diagnostico-usuarios.html
```

### Paso 2: Verifica los Tests

La página ejecuta automáticamente:

1. ✅ **Cargar Usuarios** - Muestra usuarios de la tabla `users`
2. ✅ **Cargar Vendedores** - Muestra vendedores disponibles
3. ✅ **Test API** - Verifica que `/api/recipes?production_users=1` funcione
4. ✅ **Test Guardar** - Prueba guardar participantes

### Paso 3: Ve a la Página de Recetas

Si los tests pasan, ve a:

```
Reporte de Ventas → Ingredientes Necesarios → Receta
```

**Ahora DEBERÍAS ver:**

```
┌─────────────────────────────────────┐
│  🍰 Arco × 50                      │
├─────────────────────────────────────┤
│  👥 Participantes en producción    │
│                                     │
│  [Marcela] [Aleja] [Jorge] ...     │
│                                     │
│  [✓ Todos] [✕ Limpiar]            │
└─────────────────────────────────────┘
```

## 🎯 ¿Qué Esperar?

### Si hay usuarios en `users` o `sellers`:
- ✅ Verás botones con todos los nombres
- ✅ Podrás hacer click para seleccionar
- ✅ Se guardará automáticamente
- ✅ Los más frecuentes aparecerán primero (con badges)

### Si NO hay usuarios ni vendedores:
- ⚠️ Verás el mensaje: "No hay usuarios disponibles"
- 📝 Necesitarás crear usuarios o vendedores primero

## 🔧 Crear Usuarios Manualmente (si es necesario)

Si la tabla `users` está vacía Y la tabla `sellers` está vacía, ejecuta:

```sql
-- Crear usuarios de ejemplo
INSERT INTO users (username, password_hash, role) 
VALUES 
  ('marcela', 'marcelasweet', 'admin'),
  ('aleja', 'alejasweet', 'admin'),
  ('jorge', 'Jorge123', 'superadmin')
ON CONFLICT (username) DO NOTHING;
```

O crea vendedores:

```sql
-- Crear vendedores
INSERT INTO sellers (name) 
VALUES ('Marcela'), ('Aleja'), ('Jorge')
ON CONFLICT (name) DO NOTHING;
```

## 📊 Verificar en Base de Datos

```sql
-- Ver usuarios disponibles
SELECT id, username, role FROM users ORDER BY username;

-- Ver vendedores disponibles
SELECT id, name FROM sellers WHERE archived_at IS NULL ORDER BY name;

-- Ver participaciones guardadas
SELECT 
    dessert, 
    user_id, 
    session_date,
    u.username
FROM recipe_production_users rpu
JOIN users u ON u.id = rpu.user_id
ORDER BY session_date DESC, dessert;
```

## 🎬 Flujo Completo

1. **Cargas la página de recetas**
   - API consulta `users` y `sellers`
   - Retorna lista combinada

2. **Ves los botones de usuarios**
   - Nombres de usuarios/vendedores disponibles
   - Badges con número de participaciones

3. **Haces click en nombres**
   - Botón cambia a rosado
   - Checkmark ✓ aparece
   - Se guarda en `recipe_production_users`

4. **Próxima vez**
   - Los usuarios que más participan aparecen primero
   - Badges muestran el conteo

## 🚨 Si Aún No Funciona

1. **Verifica la consola del navegador (F12)**
   - Busca mensajes tipo "📥 Loading users..."
   - Busca errores en rojo

2. **Usa la página de diagnóstico**
   - `/diagnostico-usuarios.html`
   - Revisa cada sección

3. **Verifica que los cambios se aplicaron**
   ```bash
   grep -n "Get explicit users" netlify/functions/recipes.js
   ```
   Debería encontrar la línea

4. **Refresca con Ctrl+F5** (hard refresh)

## ✅ Resumen

Con estos cambios:
- ✅ La API SIEMPRE encuentra usuarios (de `users` o `sellers`)
- ✅ El guardado funciona automáticamente
- ✅ Los usuarios se crean si es necesario
- ✅ La página de diagnóstico ayuda a depurar

**Prueba ahora la página de diagnóstico primero**, luego ve a la página de recetas!
