# 🚀 Instrucciones para Desplegar el Centro de Notificaciones

## ⚠️ Problema Actual

El archivo `notifications.js` existe en tu máquina local y está commiteado en la rama:
```
cursor/centro-de-notificaciones-para-superadmin-66e3
```

**PERO** Netlify solo está desplegando la rama `main`, por eso la función no aparece en el dashboard.

## ✅ Solución: Hacer Merge a Main

### Paso 1: Hacer Merge

Ejecuta estos comandos en tu terminal:

```bash
cd /workspace

# Cambiar a la rama main
git checkout main

# Actualizar main con los últimos cambios
git pull origin main

# Hacer merge de tu rama de desarrollo
git merge cursor/centro-de-notificaciones-para-superadmin-66e3 --no-edit

# Subir los cambios a GitHub
git push origin main
```

### Paso 2: Esperar el Deploy

1. Ve a tu **Netlify Dashboard**
2. Click en **"Deploys"**
3. Verás un nuevo deploy en progreso (se activa automáticamente al hacer push a main)
4. Espera 1-2 minutos hasta que diga **"Published"**

### Paso 3: Verificar

Una vez desplegado:

1. En Netlify Dashboard → **Functions**
2. Deberías ver ahora la función **"notifications"** en la lista
3. Recarga tu aplicación en el navegador
4. Login como jorge
5. Click en el botón 🔔

## 📋 Checklist Post-Deploy

- [ ] La función "notifications" aparece en Netlify Functions
- [ ] No hay errores en el último deploy
- [ ] El botón 🔔 aparece cuando estás logueado como jorge
- [ ] Al hacer click en 🔔, se abre el modal
- [ ] En la consola dice: `📬 Notificaciones recibidas: X`

## 🔍 Si Aún No Funciona Después del Deploy

### 1. Verificar que el Deploy Incluyó el Archivo

En Netlify Dashboard → Último Deploy → **"Deploy log"**, busca:
```
Functions bundling
✓ /netlify/functions/notifications.js
```

### 2. Verificar las Tablas en Neon

```sql
-- Ver schema version (debería ser 12)
SELECT version FROM schema_meta;

-- Ver si existen las tablas de notificaciones
SELECT table_name 
FROM information_schema.tables 
WHERE table_name LIKE 'notification%';
```

### 3. Forzar Recreación de Tablas

Si el schema_version es menor a 12:

```sql
-- Forzar actualización del schema
UPDATE schema_meta SET version = 11;
```

Luego recarga la app y haz cualquier acción (entrar a ver vendedores). Esto forzará `ensureSchema()` a ejecutarse y crear las tablas.

### 4. Test Manual del Endpoint

Una vez desplegado, en la consola del navegador:

```javascript
fetch('/api/notifications?test=1')
  .then(r => r.json())
  .then(d => console.log('✅', d))
  .catch(e => console.error('❌', e));
```

Debería devolver:
```json
{
  "ok": true,
  "message": "Notifications endpoint is working",
  "timestamp": "..."
}
```

## 🎯 Archivos Nuevos/Modificados en Este Deploy

### Nuevos:
- `/netlify/functions/notifications.js` - Backend del centro de notificaciones

### Modificados:
- `/netlify/functions/_db.js` - Schema v12 con nuevas tablas
- `/netlify/functions/sales.js` - Notificaciones de comentarios
- `/public/index.html` - Botón y modal de notificaciones  
- `/public/app.js` - Lógica del NotificationCenter
- `/public/styles.css` - Estilos del centro

## 💡 Alternativa: Deploy de Branch Específica

Si NO quieres hacer merge a main todavía, puedes:

1. En Netlify Dashboard → **Site settings** → **Build & deploy**
2. **Deploy contexts** → **Branch deploys**
3. Click **"Edit settings"**
4. Selecciona **"Let me add individual branches"**
5. Agrega: `cursor/centro-de-notificaciones-para-superadmin-66e3`
6. Netlify desplegará esta rama en una URL separada

Esa URL será algo como:
```
cursor-centro-de-notificaciones-para-superadmin-66e3--tu-sitio.netlify.app
```

## ⏱️ Tiempo Estimado

- Merge y push: 30 segundos
- Deploy en Netlify: 1-2 minutos
- Total: ~3 minutos

## 🆘 Si Tienes Problemas

Después de hacer el merge y deploy, si sigues teniendo problemas:

1. Comparte el log completo del deploy de Netlify
2. Comparte el resultado de las queries SQL en Neon
3. Comparte lo que dice la consola del navegador al abrir el centro

Con esa información podré ayudarte a resolver cualquier problema restante.
