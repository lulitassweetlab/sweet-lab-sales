# 🔧 Cómo Restaurar los Pasos de las Recetas

## Problema
Los pasos de las recetas (incluyendo 3Lec) se han perdido o borrado de la base de datos.

## Solución

He actualizado el código para incluir el postre **3Lec** (Tres Leches) que faltaba en la función de restauración.

### Método 1: Desde el Sitio Web Desplegado (MÁS FÁCIL) ✅

1. **Abre tu navegador** y ve a tu sitio web de Netlify
2. **Agrega al final de la URL**: `api/recipes?seed=1`
   
   Por ejemplo:
   - Si tu sitio es: `https://tu-sitio.netlify.app`
   - Visita: `https://tu-sitio.netlify.app/api/recipes?seed=1`

3. **Espera** unos segundos hasta que veas el mensaje: `{"ok":true}`

4. **¡Listo!** Todos los pasos de las recetas han sido restaurados, incluyendo:
   - ✅ **Arco** (1 paso con 8 ingredientes)
   - ✅ **Melo** (1 paso con 7 ingredientes)
   - ✅ **Mara** (4 pasos: Fondo, Mezcla, Mascarpone, Cubierta)
   - ✅ **Oreo** (4 pasos: Fondo, Crema de vainilla, Mezcla, Cubierta)
   - ✅ **Nute** (1 paso con 9 ingredientes)
   - ✅ **3Lec** (1 paso con 5 ingredientes) ← **NUEVO**

### Método 2: Desde Netlify Dev (Local)

Si estás desarrollando localmente:

```bash
# 1. Inicia el servidor de desarrollo
npm run dev

# 2. En otra terminal, ejecuta:
curl http://localhost:8888/api/recipes?seed=1

# 3. Deberías ver: {"ok":true}
```

### Método 3: Usando el Script de Restauración

Si prefieres usar un script Node.js:

```bash
# 1. Asegúrate de tener las variables de entorno configuradas
# En Netlify: NETLIFY_DATABASE_URL debe estar configurada

# 2. Ejecuta el script:
node restore-recipe-steps.js
```

## Recetas Restauradas

### Postre 3Lec (Tres Leches) - NUEVO ✨
**Pasos:** 1 paso (sin nombre específico)

**Ingredientes:**
- Bizcocho: 40g por unidad
- Lechera: 50g por unidad
- Leche evaporada: 50g por unidad
- Crema de leche: 50g por unidad
- Arequipe: 20g por unidad

### Otros Postres

Todos los demás postres (Arco, Melo, Mara, Oreo, Nute) también fueron restaurados con sus recetas completas.

## Verificación

Para verificar que las recetas se restauraron correctamente:

1. Ve a la página de **Recetas** en tu aplicación
2. Deberías ver todos los pasos e ingredientes para cada postre
3. Para 3Lec específicamente, verifica que aparezcan los 5 ingredientes listados arriba

## Prevención

Para evitar que esto vuelva a suceder:

⚠️ **NUNCA** accedas a la URL `api/recipes?seed=1` sin querer, ya que esto borra y restaura todas las recetas a sus valores por defecto.

## ¿Necesitas Ayuda?

Si después de seguir estos pasos aún no ves los pasos de las recetas:

1. Verifica que tengas conexión a internet
2. Verifica que la variable `NETLIFY_DATABASE_URL` esté configurada en Netlify
3. Revisa los logs de Netlify Functions para ver si hay errores
4. Contacta al soporte técnico con los logs

---

**Fecha de actualización:** $(date +%Y-%m-%d)
**Última modificación:** Se agregó el postre 3Lec a la función seed
