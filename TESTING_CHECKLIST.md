# ✅ Checklist para Probar Deploy Preview

## 🔍 Estado Actual
La rama `feature/dynamic-desserts` ya está en GitHub y Netlify debería estar creando el deploy preview automáticamente.

## 📍 Cómo Encontrar el Deploy Preview

### Opción 1: GitHub (Recomendado)
1. Ve a: https://github.com/lulitassweetlab/sweet-lab-sales
2. Ve a la pestaña "Pull requests"
3. Si no hay PR, créalo haciendo clic en "Compare & pull request" o:
   - Ve a: https://github.com/lulitassweetlab/sweet-lab-sales/compare/main...feature/dynamic-desserts
4. Una vez creado el PR, Netlify comentará con el link del deploy preview

### Opción 2: Netlify Dashboard
1. Ve a: https://app.netlify.com
2. Selecciona tu sitio "sweet-lab-sales"
3. Ve a "Deploys"
4. Busca el deploy de la rama `feature/dynamic-desserts`
5. Haz clic para ver la URL del preview

## ✅ Tests Básicos (DEBE Funcionar)

### 1. Sistema Actual NO DEBE Cambiar
- [ ] Login funciona igual
- [ ] Crear nuevo pedido funciona igual que antes
- [ ] Tabla de ventas se ve igual
- [ ] Editar pedidos funciona igual
- [ ] Los 5 postres aparecen en sus columnas (Arco, Melo, Mara, Oreo, Nute)

### 2. Nueva Funcionalidad: Administrar Postres
- [ ] Iniciar sesión como `jorge` o `marcela` o `aleja`
- [ ] En el menú principal, buscar botón "Postres"
- [ ] Hacer clic en "Postres"
- [ ] Debería abrir `/manage-desserts.html`
- [ ] Debería mostrar tabla con 5 postres:
  - Arco - arco - $8,500
  - Melo - melo - $9,500
  - Mara - mara - $10,500
  - Oreo - oreo - $10,500
  - Nute - nute - $13,000

### 3. Crear Nuevo Postre
- [ ] En `/manage-desserts.html`, hacer clic en "+ Nuevo Postre"
- [ ] Llenar formulario:
  - Nombre: `Cheesecake`
  - Código: `chee` (4 letras minúsculas)
  - Precio de Venta: `15000`
  - Posición: `6`
- [ ] Hacer clic en "Crear"
- [ ] Debería aparecer mensaje de éxito
- [ ] Debería aparecer en la tabla

### 4. Editar Postre
- [ ] Hacer clic en "Editar" junto a cualquier postre
- [ ] Cambiar el precio (ej: de 15000 a 16000)
- [ ] Hacer clic en "Guardar"
- [ ] Debería actualizarse en la tabla

### 5. Desactivar Postre
- [ ] Hacer clic en "Desactivar" junto al postre de prueba
- [ ] Debería cambiar a estado "Inactivo"
- [ ] Hacer clic en "Activar" para volver a activarlo

## 🚫 Lo Que NO va a Funcionar (Por Diseño)

### ❌ Los postres nuevos NO aparecen en la tabla de ventas
**Esto es ESPERADO.** El frontend de ventas aún usa columnas fijas. Para ver los postres nuevos en la tabla de ventas se necesita Fase 2 (refactorización del frontend).

Por ahora, esta fase solo permite:
- ✅ Crear/editar/gestionar postres
- ✅ Sistema backend completamente listo
- ✅ Migración de datos existentes
- ✅ APIs funcionando
- ⏸️ Frontend de ventas sigue usando 5 columnas fijas

## 🐛 Posibles Problemas y Soluciones

### Problema: No veo el botón "Postres"
**Solución**: Solo usuarios superadmin (jorge, marcela, aleja) pueden verlo. Verifica que estés logueado correctamente.

### Problema: Error al crear postre
**Posibles causas**:
1. Código ya existe (debe ser único)
2. Código no tiene exactamente 4 letras
3. Precio es 0 o negativo

### Problema: Error al cargar `/manage-desserts.html`
**Verificar**:
1. Logs de Netlify Functions
2. Console del navegador (F12)
3. Si hay error "table does not exist", significa que la migración aún no corrió

### Problema: Pedidos nuevos no se crean
**Verificar**:
1. Console del navegador (F12) - buscar errores
2. Network tab - ver qué responde `/api/sales`
3. Netlify Functions logs

## 📊 Verificación de Base de Datos (Avanzado)

Si tienes acceso a la base de datos de Neon:

```sql
-- Verificar que tablas existen
SELECT table_name FROM information_schema.tables 
WHERE table_schema = 'public' AND table_name IN ('desserts', 'sale_items');

-- Ver postres creados
SELECT * FROM desserts ORDER BY position;

-- Ver si hay sale_items
SELECT COUNT(*) FROM sale_items;

-- Verificar schema version
SELECT * FROM schema_meta;
```

## 📝 Reportar Problemas

Si encuentras algún error, por favor reporta:

1. **URL exacta** donde ocurre
2. **Pasos para reproducir**
3. **Error en console** (F12 → Console tab)
4. **Screenshot** si es visual
5. **Usuario** con el que estás logueado

## ✨ Siguiente Paso

Una vez que verifiques que:
- ✅ Sistema actual funciona igual
- ✅ Puedes crear/editar postres
- ✅ No hay errores en console

Entonces estaremos listos para:
1. Hacer merge si quieres usar esto en producción
2. O planear Fase 2 para integrar postres dinámicos en tabla de ventas

---

**Última actualización**: 2025-10-03  
**Commits en la rama**: 3
- feat: Sistema de postres dinámicos
- docs: Documentación completa
- fix: Manejo de errores en migraciones
