# ⚡ Instrucciones Rápidas - Restaurar Pasos de Recetas

## 🎯 ¿Qué se arregló?

Los pasos de todas las recetas (Arco, Melo, Mara, Oreo, Nute, **3Lec**) se han actualizado y están listos para restaurar.

## 🚀 Pasos para Restaurar (2 MINUTOS)

### Paso 1: Hacer Deploy de los Cambios

Los cambios ya están en tu código. Solo necesitas:

```bash
# 1. Hacer commit de los cambios
git add .
git commit -m "fix: Restaurar pasos de recetas y agregar 3Lec"

# 2. Hacer push (esto activará el auto-deploy de Netlify)
git push
```

**Espera 1-2 minutos** mientras Netlify hace el deploy.

### Paso 2: Ejecutar la Restauración

Una vez que el deploy termine:

1. **Abre tu navegador**
2. **Ve a esta URL** (reemplaza con tu dominio):
   ```
   https://TU-SITIO.netlify.app/api/recipes?seed=1
   ```

3. **Espera** unos segundos hasta ver:
   ```json
   {"ok":true}
   ```

4. **¡Listo!** 🎉 Todos los pasos están restaurados

### Paso 3: Verificar

1. Ve a tu aplicación
2. Navega a la página de **Recetas**
3. Verifica que veas:
   - ✅ Arco con sus ingredientes
   - ✅ Melo con sus ingredientes
   - ✅ Mara con sus 4 pasos
   - ✅ Oreo con sus 4 pasos
   - ✅ Nute con sus ingredientes
   - ✅ **3Lec con 5 ingredientes** ← NUEVO

## 📝 ¿Qué incluye 3Lec?

El nuevo postre **3Lec (Tres Leches)** tiene:

- **Precio:** $9,000
- **Paso único** con 5 ingredientes:
  - Bizcocho: 40g
  - Lechera: 50g
  - Leche evaporada: 50g
  - Crema de leche: 50g
  - Arequipe: 20g

## ⚠️ Importante

- La URL `/api/recipes?seed=1` **borra y restaura** todas las recetas
- Solo ejecútala cuando necesites restaurar los pasos
- Si tienes cambios personalizados, guárdalos antes

## 🆘 ¿Problemas?

Si algo no funciona:

1. **Verifica el deploy:**
   ```bash
   netlify status
   ```

2. **Verifica los logs:**
   - Ve a: https://app.netlify.com
   - Abre tu sitio
   - Ve a "Functions" → "recipes" → Ver logs

3. **Prueba localmente:**
   ```bash
   npm run dev
   # En otra terminal:
   curl http://localhost:8888/api/recipes?seed=1
   ```

## 📚 Documentación Completa

Para más detalles, consulta:
- `RESUMEN_ARREGLO_RECETAS.md` - Resumen completo de cambios
- `COMO_RESTAURAR_PASOS_RECETAS.md` - Guía detallada de restauración
- `VERIFICAR_TODAS_RECETAS.sql` - Script para verificar en DB

---

**¡Todo listo en 2 minutos!** ⏱️
