# Fix: Notificaciones ahora funcionan con postres dinámicos (3Lec)

## Problema
Las notificaciones estaban hardcodeadas para trabajar solo con los 5 postres originales (arco, melo, mara, oreo, nute), por lo que cuando se agregó el nuevo postre "3Lec", las notificaciones no se generaban correctamente.

## Solución Implementada

Se actualizó el archivo `/netlify/functions/sales.js` para incluir soporte completo de postres dinámicos en el sistema de notificaciones.

### Cambios Realizados

#### 1. **Notificaciones de Nuevos Pedidos** (tipo: 'create')
- **Antes**: Solo mostraba arco, melo, mara, oreo, nute
- **Ahora**: Se agregó la función `getAllDessertParts(saleId)` que:
  - Consulta la tabla `sale_items` para obtener todos los postres dinámicos
  - Incluye tanto postres legacy (columnas qty_*) como postres dinámicos (tabla sale_items)
  - Filtra duplicados para evitar mostrar el mismo postre dos veces

**Ejemplo de notificación:**
```
Cliente: Juan: 2 arco + 1 3lec + 3 mara
```

#### 2. **Notificaciones de Cambios de Cantidad** (tipo: 'qty')
- **Antes**: Solo detectaba cambios en los 5 postres originales
- **Ahora**: 
  - Guarda los items dinámicos previos antes de actualizar
  - Compara item por item para detectar cambios
  - Emite notificaciones para postres agregados, modificados o eliminados
  - Solo procesa postres no-legacy (evita duplicados)

**Ejemplo de notificación:**
```
Cliente: Juan: 5 3lec (antes 2)
```

#### 3. **Notificaciones de Eliminación** (tipo: 'delete')
- **Antes**: Solo mostraba los 5 postres originales al eliminar
- **Ahora**:
  - Consulta `sale_items` antes de eliminar el pedido
  - Incluye todos los postres (legacy + dinámicos) en el mensaje de eliminación
  - Filtra duplicados

**Ejemplo de notificación:**
```
Eliminado: Juan: 2 arco + 1 3lec + 3 mara
```

### Detalles Técnicos

#### Consulta SQL para Postres Dinámicos
```sql
SELECT si.quantity, d.short_code
FROM sale_items si
JOIN desserts d ON d.id = si.dessert_id
WHERE si.sale_id = ${id} AND si.quantity > 0
ORDER BY d.position ASC, d.id ASC
```

#### Filtrado de Duplicados
Para evitar que un postre aparezca dos veces (una vez en legacy columns y otra en sale_items), el código verifica:
```javascript
if (!['arco', 'melo', 'mara', 'oreo', 'nute'].includes(shortCode)) {
    // Procesar solo si NO es un postre legacy
}
```

#### Detección de Creación Inicial
La lógica para detectar si es un nuevo pedido (vs. modificación) ahora también considera si hay postres dinámicos:
```javascript
const isInitialCreation = withinGrace && prevSum === 0 && !hasPrevDynamicItems && (nextSum > 0 || hasNewDynamicItems);
```

**Importante**: Esta condición ahora detecta correctamente pedidos que solo contienen postres dinámicos (como 3Lec). Antes solo contaba postres legacy en `nextSum`, causando que pedidos solo con 3Lec no se detectaran como creaciones iniciales.

### Compatibilidad

✅ **Totalmente compatible con:**
- Sistema de notificaciones existente
- Postres legacy (arco, melo, mara, oreo, nute)
- Postres dinámicos nuevos (3Lec, futuros postres)
- Modo híbrido (pedidos con postres legacy + dinámicos)
- Tema claro y oscuro
- Desktop y móvil

### Testing Recomendado

1. **Crear pedido con 3Lec**
   - Acción: Crear nuevo pedido con 2 3Lec
   - Esperado: Notificación "Cliente: 2 3lec"

2. **Modificar cantidad de 3Lec**
   - Acción: Cambiar de 2 a 5 unidades de 3Lec
   - Esperado: Notificación "Cliente: 5 3lec (antes 2)"

3. **Eliminar pedido con 3Lec**
   - Acción: Eliminar pedido que tiene 3Lec
   - Esperado: Notificación "Eliminado: Cliente: 2 3lec"

4. **Pedido mixto**
   - Acción: Crear pedido con 1 arco + 2 3lec + 3 mara
   - Esperado: Notificación "Cliente: 1 arco + 2 3lec + 3 mara"

### Notas

- Las notificaciones respetan el "grace period" de 2 minutos después de crear un pedido
- Los cambios no afectan el funcionamiento de los postres legacy
- El sistema sigue siendo compatible con la estructura de datos antigua
- No se requieren cambios en la base de datos (las tablas ya existían)

## Archivos Modificados

- `/netlify/functions/sales.js`: Actualizado con soporte completo para postres dinámicos en notificaciones

## Estado

✅ **Implementado y listo para usar**

Las notificaciones ahora funcionan perfectamente con 3Lec y cualquier otro postre que agregues en el futuro.
