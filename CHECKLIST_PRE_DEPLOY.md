# ✅ Checklist Pre-Deploy - Restauración de Recetas

Usa este checklist para verificar que todos los cambios estén correctos antes de hacer deploy.

## 📋 Verificaciones de Código

### ✅ Archivo: `netlify/functions/recipes.js`

- [ ] La función `seedDefaults()` incluye el postre **3Lec**
- [ ] El postre 3Lec tiene 5 ingredientes:
  - [ ] Bizcocho (40g)
  - [ ] Lechera (50g)
  - [ ] Leche evaporada (50g)
  - [ ] Crema de leche (50g)
  - [ ] Arequipe (20g)
- [ ] El código está después de Nute y antes de Extras
- [ ] No hay errores de sintaxis

**Verificar manualmente:**
```bash
grep -A 10 "3Lec" netlify/functions/recipes.js
```

### ✅ Archivo: `netlify/functions/_db.js`

- [ ] La tabla `desserts` incluye 3Lec en `defaultDesserts`:
  - [ ] name: '3Lec'
  - [ ] short_code: '3lec'
  - [ ] sale_price: 9000
  - [ ] position: 6
- [ ] La función `prices()` incluye `'3lec': 9000`
- [ ] No hay errores de sintaxis

**Verificar manualmente:**
```bash
grep "3lec" netlify/functions/_db.js
```

### ✅ Archivo: `public/receta.html`

- [ ] La función `normalizeKey()` incluye:
  - [ ] `if (k.startsWith('3lec') || k.includes('tres leches')) return '3lec';`
- [ ] Está después de las verificaciones de nute
- [ ] No hay errores de sintaxis

**Verificar manualmente:**
```bash
grep "3lec" public/receta.html
```

## 🧪 Verificaciones Locales (Opcional)

### ✅ Test Local con Netlify Dev

```bash
# 1. Iniciar servidor
npm run dev

# 2. En otra terminal, probar el seed
curl http://localhost:8888/api/recipes?seed=1

# 3. Verificar respuesta
# Debe mostrar: {"ok":true}

# 4. Verificar que las recetas se crearon
curl http://localhost:8888/api/recipes?dessert=3Lec

# 5. Debe mostrar los pasos y ingredientes de 3Lec
```

**Resultados esperados:**
- [ ] El seed responde con `{"ok":true}`
- [ ] La query de 3Lec devuelve datos
- [ ] Los 5 ingredientes están presentes

## 📝 Verificaciones de Git

### ✅ Archivos Modificados

```bash
git status
```

**Debe mostrar:**
- [ ] `modified: netlify/functions/recipes.js`
- [ ] `modified: netlify/functions/_db.js`
- [ ] `modified: public/receta.html`
- [ ] `modified: restore-recipe-steps.js`

**Archivos nuevos (opcionales):**
- [ ] `INSTRUCCIONES_RAPIDAS.md`
- [ ] `RESUMEN_ARREGLO_RECETAS.md`
- [ ] `COMO_RESTAURAR_PASOS_RECETAS.md`
- [ ] Y otros archivos de documentación

### ✅ Revisar Diferencias

```bash
# Ver cambios en recipes.js
git diff netlify/functions/recipes.js

# Ver cambios en _db.js
git diff netlify/functions/_db.js

# Ver cambios en receta.html
git diff public/receta.html
```

**Verificar que:**
- [ ] Solo se agregó código de 3Lec
- [ ] No se eliminó código existente
- [ ] No hay cambios no intencionales

## 🚀 Verificaciones de Configuración

### ✅ Netlify Configuration

```bash
# Verificar que existe netlify.toml
cat netlify.toml

# Verificar que package.json tiene los scripts correctos
cat package.json
```

**Debe tener:**
- [ ] `functions = "netlify/functions"` en netlify.toml
- [ ] Script `dev` en package.json
- [ ] Dependencia `@netlify/neon` en package.json

### ✅ Variables de Entorno

**En Netlify Dashboard:**
- [ ] `NETLIFY_DATABASE_URL` está configurada
- [ ] La URL apunta a tu base de datos Neon

**Verificar:**
```bash
netlify env:list
```

## 📦 Preparación para Deploy

### ✅ Limpieza

```bash
# Verificar que no hay archivos temporales
ls -la | grep "~\|.swp\|.tmp"

# Verificar que node_modules está en .gitignore
cat .gitignore | grep node_modules
```

**Debe estar limpio:**
- [ ] No hay archivos temporales
- [ ] node_modules está ignorado
- [ ] No hay archivos sensibles (*.env, *.key)

### ✅ Commit Message

```bash
# Preparar commit con mensaje claro
git add netlify/functions/recipes.js
git add netlify/functions/_db.js
git add public/receta.html
git add *.md
git add restore-recipe-steps.js

# Commit con mensaje descriptivo
git commit -m "fix: Restaurar pasos de recetas y agregar postre 3Lec (Tres Leches)

- Agregar receta completa de 3Lec con 5 ingredientes
- Incluir 3Lec en tabla desserts con precio $9,000
- Actualizar función de precios para incluir 3Lec
- Actualizar normalización de nombres para reconocer 3Lec
- Crear scripts y documentación de restauración
"
```

**Verificar:**
- [ ] El mensaje de commit es claro
- [ ] Describe todos los cambios principales
- [ ] Incluye el propósito (restaurar recetas)

## 🎯 Pre-Push Checklist

Antes de hacer `git push`:

- [ ] ✅ Todos los archivos modificados están en el commit
- [ ] ✅ El mensaje de commit es descriptivo
- [ ] ✅ No hay errores de sintaxis en los archivos modificados
- [ ] ✅ Los cambios fueron probados localmente (opcional pero recomendado)
- [ ] ✅ No hay archivos sensibles en el commit
- [ ] ✅ La documentación está incluida

## 🚢 Deploy

```bash
# 1. Push a repositorio
git push origin main  # o tu rama principal

# 2. Ver el deploy en Netlify
netlify open:site

# 3. Verificar el deploy en el dashboard
# https://app.netlify.com → Tu sitio → Deploys
```

**Esperar:**
- [ ] Deploy se completa sin errores
- [ ] Build time es normal (1-3 minutos)
- [ ] No hay warnings críticos

## 🔍 Post-Deploy Verification

Después del deploy:

```bash
# 1. Ejecutar el seed de recetas
curl https://TU-SITIO.netlify.app/api/recipes?seed=1

# 2. Verificar 3Lec
curl https://TU-SITIO.netlify.app/api/recipes?dessert=3Lec

# 3. Verificar lista de postres
curl https://TU-SITIO.netlify.app/api/recipes
```

**Verificar en la app:**
- [ ] La página de Recetas carga correctamente
- [ ] Aparecen los 6 postres (incluyendo 3Lec)
- [ ] 3Lec tiene sus 5 ingredientes
- [ ] Los otros postres mantienen sus recetas

## ✅ Checklist Completo

Una vez que todos los checkboxes estén marcados:

```
✅ Código verificado
✅ Git preparado
✅ Configuración correcta
✅ Commit creado
✅ Deploy exitoso
✅ Verificación post-deploy completada
```

**¡Listo para usar!** 🎉

---

**Importante:** Si algún checkbox no se puede marcar, **NO hagas deploy** hasta resolver el problema.

**Fecha:** $(date +%Y-%m-%d)
