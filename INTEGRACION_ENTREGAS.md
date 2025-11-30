# 🔗 Integración: Recetas → Entregas

## ✅ Cambios Implementados

### 1. **Selector Alineado a la Derecha** ✨
El selector de participantes ahora está alineado a la derecha en la página de recetas.

```css
justify-content: flex-end;
```

**Antes:**
```
[Marcela] [Aleja] [Jorge] [▼ +2]
```

**Ahora:**
```
                [Marcela] [Aleja] [Jorge] [▼ +2]
```

### 2. **Sincronización Automática con Entregas** 🔄

Cuando guardas participantes en la página **Recetas**, ahora se guardan **automáticamente** en dos lugares:

#### a) `recipe_production_users`
```sql
INSERT INTO recipe_production_users (dessert, user_id, session_date)
VALUES ('Arco', 1, '2024-11-30')
```

#### b) `delivery_production_users`
```sql
INSERT INTO delivery_production_users (delivery_id, dessert_id, user_id)
VALUES (123, 1, 1)
```

## 🔧 Cómo Funciona

### Flujo Automático

```
┌─────────────────────────────────────────────────────┐
│  Página RECETAS                                     │
│  Usuario selecciona participantes:                  │
│  [Marcela ✓] [Aleja ✓] [Jorge]                    │
└─────────────────────┬───────────────────────────────┘
                      │
                      │ 1. Guarda en recipe_production_users
                      ↓
            ┌─────────────────────┐
            │  API: POST /recipes │
            │  kind: production.  │
            │        users        │
            └──────────┬──────────┘
                      │
            ┌─────────┴──────────┐
            │                    │
            ↓                    ↓
  ┌─────────────────┐   ┌────────────────────┐
  │ Guarda en       │   │ Busca/crea         │
  │ recipe_         │   │ delivery para      │
  │ production_     │   │ esa fecha          │
  │ users           │   │                    │
  └─────────────────┘   └─────────┬──────────┘
                                  │
                                  ↓
                        ┌──────────────────────┐
                        │ Guarda en            │
                        │ delivery_production_ │
                        │ users                │
                        └──────────────────────┘
                                  │
                                  ↓
                    ┌──────────────────────────────┐
                    │  Página ENTREGAS             │
                    │  Los participantes aparecen  │
                    │  automáticamente             │
                    └──────────────────────────────┘
```

## 📅 Auto-Creación de Deliveries

Si no existe un delivery para la fecha seleccionada, **se crea automáticamente**:

```sql
INSERT INTO deliveries (day, note, actor_name)
VALUES ('2024-11-30', 'Auto-creado desde recetas', '')
```

## 📊 Ver Participantes en Entregas

Los participantes guardados desde Recetas aparecen automáticamente en:

### API de Entregas
```
GET /api/deliveries?production_users=123
```

Retorna:
```json
["Marcela", "Aleja"]
```

### Reporte de Producción
```
GET /api/deliveries?report=production&start=2024-11-01&end=2024-11-30
```

Retorna:
```json
{
  "Marcela": {
    "arco": 50,
    "melo": 30
  },
  "Aleja": {
    "arco": 40,
    "mara": 25
  }
}
```

## 🎯 Casos de Uso

### Caso 1: Usuario Registra Participantes en Recetas
1. Va a: **Reporte → Ingredientes → Receta**
2. Selecciona fecha: `30 Nov 2024`
3. Selecciona participantes para Arco: `[Marcela] [Aleja]`
4. Sistema guarda automáticamente

**Resultado:**
- ✅ Guardado en `recipe_production_users` con fecha 30-Nov
- ✅ Guardado en `delivery_production_users` para delivery del 30-Nov
- ✅ Si no existía delivery del 30-Nov, se crea automáticamente

### Caso 2: Usuario Consulta Entregas
1. Va a: **Entregas**
2. Ve la fecha `30 Nov 2024`
3. API retorna participantes: `Marcela, Aleja`

### Caso 3: Reporte de Producción por Usuario
```
GET /api/deliveries?report=production&start=2024-11-01&end=2024-11-30
```

Muestra cuánto produjo cada usuario en el mes.

## 🔑 Tablas Involucradas

### `recipe_production_users`
```sql
CREATE TABLE recipe_production_users (
    id SERIAL PRIMARY KEY,
    dessert TEXT NOT NULL,              -- Nombre del postre
    user_id INTEGER REFERENCES users(id),
    session_date DATE NOT NULL,         -- Fecha de producción
    created_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE (dessert, user_id, session_date)
);
```

### `delivery_production_users`
```sql
CREATE TABLE delivery_production_users (
    id SERIAL PRIMARY KEY,
    delivery_id INTEGER REFERENCES deliveries(id),
    dessert_id INTEGER REFERENCES desserts(id),
    user_id INTEGER REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE (delivery_id, dessert_id, user_id)
);
```

### Relación
```
recipe_production_users (por fecha y nombre)
           ↓
   Vincula automáticamente
           ↓
delivery_production_users (por delivery_id)
```

## ⚙️ Sincronización Inteligente

### Si el usuario cambia los participantes

1. **Escenario:**
   - Día 1: Usuario selecciona `[Marcela] [Aleja]` para Arco
   - Día 2: Usuario cambia a `[Marcela] [Jorge]`

2. **Resultado:**
   - Se **eliminan** las entradas anteriores
   - Se **insertan** las nuevas
   - En **ambas tablas** (`recipe_production_users` y `delivery_production_users`)

3. **SQL ejecutado:**
```sql
-- Elimina anteriores
DELETE FROM recipe_production_users 
WHERE dessert = 'Arco' AND session_date = '2024-11-30';

DELETE FROM delivery_production_users 
WHERE delivery_id = 123 AND dessert_id = 1;

-- Inserta nuevos
INSERT INTO recipe_production_users (dessert, user_id, session_date)
VALUES ('Arco', 1, '2024-11-30'), ('Arco', 3, '2024-11-30');

INSERT INTO delivery_production_users (delivery_id, dessert_id, user_id)
VALUES (123, 1, 1), (123, 1, 3);
```

## 🚀 Ventajas

1. **✅ Sincronización Automática:** No necesitas registrar en dos lugares
2. **✅ Consistencia:** Los datos siempre están sincronizados
3. **✅ Simplicidad:** El usuario solo ve una interfaz
4. **✅ Reportes Unificados:** Los reportes de entregas incluyen participantes
5. **✅ Historial:** Se mantiene registro en ambas tablas

## 📍 Páginas Afectadas

### Recetas (`receta.html`)
- **Cambio:** Selector alineado a la derecha
- **Nueva Funcionalidad:** Sincroniza con entregas automáticamente

### Entregas (`deliveries.html`)
- **Sin cambios visuales**
- **Nueva Funcionalidad:** Recibe datos de participantes desde recetas

## 🔍 Debugging

### Ver Participantes Guardados

```sql
-- Desde recetas
SELECT * FROM recipe_production_users 
WHERE session_date = '2024-11-30';

-- Desde entregas
SELECT 
    d.day,
    des.name as dessert,
    u.username
FROM delivery_production_users dpu
JOIN deliveries d ON d.id = dpu.delivery_id
JOIN desserts des ON des.id = dpu.dessert_id
JOIN users u ON u.id = dpu.user_id
WHERE d.day = '2024-11-30'
ORDER BY des.name, u.username;
```

### Verificar Sincronización

```sql
-- Comparar ambas tablas para una fecha
SELECT 
    'recipe' as source,
    dessert,
    u.username,
    session_date as date
FROM recipe_production_users rpu
JOIN users u ON u.id = rpu.user_id
WHERE session_date = '2024-11-30'

UNION ALL

SELECT 
    'delivery' as source,
    des.name,
    u.username,
    d.day
FROM delivery_production_users dpu
JOIN deliveries d ON d.id = dpu.delivery_id
JOIN desserts des ON des.id = dpu.dessert_id
JOIN users u ON u.id = dpu.user_id
WHERE d.day = '2024-11-30'

ORDER BY dessert, username, source;
```

## ✨ Resumen

- ✅ Selector alineado a la derecha
- ✅ Datos guardados en `recipe_production_users`
- ✅ Datos guardados en `delivery_production_users`
- ✅ Auto-creación de deliveries si no existen
- ✅ Sincronización bidireccional automática
- ✅ Sin cambios necesarios en la UI de entregas

**¡Todo funciona automáticamente!** 🎉
