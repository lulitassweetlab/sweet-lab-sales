# 👥 Guía Visual - Selector de Participantes

## 🎨 Cómo se ve en la página

```
╔═══════════════════════════════════════════════════════════╗
║                     🍰 Arco × 50                         ║
║         (Título del postre con fondo rosa)               ║
╠═══════════════════════════════════════════════════════════╣
║  👥 Participantes en producción    [Click para seleccionar]║
║ ╔══════════════════════════════════════════════════════╗ ║
║ ║                                                      ║ ║
║ ║  ┌────────────┐ ┌────────────┐ ┌────────────┐      ║ ║
║ ║  │ Marcela 15 │ │  Aleja 8   │ │  Jorge 5   │      ║ ║
║ ║  │  (rosado)  │ │  (blanco)  │ │  (blanco)  │      ║ ║
║ ║  └────────────┘ └────────────┘ └────────────┘      ║ ║
║ ║                                                      ║ ║
║ ║                        [✓ Todos] [✕ Limpiar]        ║ ║
║ ╚══════════════════════════════════════════════════════╝ ║
╠═══════════════════════════════════════════════════════════╣
║              ───────────────────                         ║
║                  (Separador)                             ║
╠═══════════════════════════════════════════════════════════╣
║  Paso 1: Mezclar                    [▶ Timer]           ║
║  ┌──────────────────────────────────────────┐           ║
║  │ Ingrediente 1                     100g   │           ║
║  │ Ingrediente 2                     200g   │           ║
║  └──────────────────────────────────────────┘           ║
╚═══════════════════════════════════════════════════════════╝
```

## 🖱️ Interacciones

### 1. Usuario NO Seleccionado (Estado Inicial)
```
┌──────────────┐
│  Marcela 15  │  ← Badge con número de participaciones
│   (blanco)   │  ← Fondo blanco, borde gris
└──────────────┘
```

### 2. Usuario Seleccionado (Después del Click)
```
┌──────────────┐
│  Marcela ✓   │  ← Checkmark temporal (800ms)
│   (rosado)   │  ← Fondo gradiente rosado
└──────────────┘
   Con sombra y efecto de escala
```

### 3. Hover (Mouse sobre botón no seleccionado)
```
┌──────────────┐
│  Marcela 15  │
│  (elevado)   │  ← Se eleva 2px con sombra
└──────────────┘
   Borde cambia a rosado
```

## 📊 Badge de Participaciones

```
        ┌──────┐
        │  15  │  ← Número en círculo rosado
        └──────┘
    ┌────────────────┐
    │    Marcela     │
    └────────────────┘
```

**Tooltip:** "Ha participado 15 veces"

## 🎬 Animaciones

### Click en Usuario
1. **Escala:** 1.0 → 1.05 → 1.0 (150ms)
2. **Color:** Blanco → Rosado gradiente
3. **Sombra:** Pequeña → Grande con blur rosado
4. **Checkmark:** Aparece ✓ por 800ms

### Hover
- **Elevación:** 0 → 2px (250ms ease)
- **Borde:** Gris → Rosado (250ms ease)

## 🎨 Colores Usados

- **Primario:** `#f4a6b7` (Rosa suave)
- **Primario Intenso:** `#ff69b4` (Rosa fuerte)
- **Fondo Selector:** Gradiente `rgba(244, 166, 183, 0.12)` → `rgba(255, 182, 193, 0.08)`
- **Borde:** `rgba(244, 166, 183, 0.4)`
- **Badge:** Gradiente `#f4a6b7` → `#ff69b4`

## 🔄 Flujo de Uso

```
1. Usuario carga página de recetas
   ↓
2. Se cargan usuarios del servidor (ordenados por frecuencia)
   ↓
3. Se muestra selector con badges de participación
   ↓
4. Usuario hace click en nombre
   ↓
5. Botón cambia a rosado + animación
   ↓
6. Auto-guardado en servidor
   ↓
7. Checkmark aparece brevemente (✓)
   ↓
8. Selección guardada para ese día
```

## 📱 Responsive

Los botones se adaptan automáticamente:
- `display: flex` con `flex-wrap: wrap`
- `gap: 8px` entre botones
- Se reorganizan en filas según el ancho disponible

## 🎯 Ubicación en el Flujo

```
Inicio
  ↓
Reporte de Ventas
  ↓
Ingredientes Necesarios
  ↓
RECETA (receta.html)
  ↓
[Selector de Participantes] ← AQUÍ
  ↓
Lista de Ingredientes
```
