# Guía para Hacer Deploy Manual en Netlify

## Si No Ves el Deploy Automático

### Opción 1: Esperar un Momento
A veces Netlify tarda 30-60 segundos en detectar el push. Espera un minuto y refresca la página de Netlify.

### Opción 2: Trigger Manual del Deploy

1. Ve a tu **Netlify Dashboard**: https://app.netlify.com
2. Selecciona tu sitio
3. Ve a la pestaña **"Deploys"** (arriba)
4. Click en el botón **"Trigger deploy"** (botón verde arriba a la derecha)
5. Selecciona **"Deploy site"**
6. Netlify empezará a construir desde la rama `main`

### Opción 3: Verificar Configuración de Auto-Deploy

Si los deploys automáticos no funcionan:

1. En Netlify Dashboard → Tu sitio
2. **Site settings** → **Build & deploy** → **Continuous deployment**
3. Verifica que **"Build hooks"** o **"GitHub integration"** estén activos
4. En **"Deploy contexts"**, verifica que la rama principal sea `main`

### Opción 4: Verificar en GitHub

1. Ve a tu repositorio en GitHub: https://github.com/lulitassweetlab/sweet-lab-sales
2. Ve a la pestaña **"Actions"** o **"Commits"**
3. Verifica que el último commit aparezca (el del merge)
4. Deberías ver algo como: `Merge branch 'cursor/centro-de-notificaciones...'`

### Opción 5: Re-push (Si es Necesario)

Si nada funciona, puedes forzar un nuevo push:

```bash
cd /workspace
git commit --allow-empty -m "Trigger Netlify deploy"
git push origin main
```

Esto creará un commit vacío que forzará a Netlify a hacer deploy.

## 🔍 Cómo Saber Si el Deploy Está en Progreso

En Netlify Dashboard → Deploys, deberías ver:

### Deploy en Progreso:
```
🟡 Building    Branch: main
   2 seconds ago
   Building your site...
```

### Deploy Completado:
```
🟢 Published   Branch: main
   2 minutes ago
   https://tu-sitio.netlify.app
```

### Deploy Fallido:
```
🔴 Failed      Branch: main
   1 minute ago
   See error log
```

## ⏱️ Tiempos Normales

- Detección del push: 0-60 segundos
- Build del sitio: 1-3 minutos
- Total: 2-4 minutos desde el push

## 🆘 Si No Aparece Nada

1. **Verifica que estás en el sitio correcto** en Netlify
2. **Verifica la integración con GitHub**: Site settings → Build & deploy → Link repository
3. **Haz el trigger manual** (Opción 2 arriba)

## ✅ Una Vez que el Deploy Complete

1. Verás **"Published"** en verde
2. Click en el deploy para ver los detalles
3. Busca en el log:
   ```
   Functions bundling
   ✓ /netlify/functions/notifications.js
   ```
4. Ve a **Functions** en el menú lateral
5. Deberías ver **"notifications"** en la lista

## 🎯 Próximo Paso Después del Deploy

Una vez que veas "Published":

1. Recarga tu aplicación (Ctrl+Shift+R)
2. Login como jorge
3. Deberías ver el botón 🔔
4. Click en el botón para abrir el centro de notificaciones

## 💡 Debug: Ver el Estado Actual

En la consola del navegador:

```javascript
// Ver si el endpoint ya está disponible
fetch('/api/notifications?test=1')
  .then(r => {
    console.log('Status:', r.status);
    return r.json();
  })
  .then(d => console.log('Respuesta:', d))
  .catch(e => console.error('Error:', e));
```

Si el deploy completó, esto debería devolver:
```json
{
  "ok": true,
  "message": "Notifications endpoint is working",
  "timestamp": "..."
}
```

Si aún da 404, el deploy no ha completado o no incluyó el archivo.
