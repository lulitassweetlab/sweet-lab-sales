# Sweet Lab - Ventas (Netlify + Neon + Vanilla JS)

Aplicación web para registrar ventas por vendedor y verlas desde múltiples computadores.

## Estructura
- `public/` front-end (HTML, CSS, JS)
- `netlify/functions/` API serverless (sellers, sales)
- `netlify.toml` configuración de Netlify, redirect `/api/*`

## Precios
- Arco: $8.500
- Melo: $9.500
- Mara: $10.500
- Oreo: $10.500

## Deploy (gratis)
1) GitHub
   - Crea (o usa) el repo `sweet-lab-data` en la cuenta `lulitassweetlab`.
   - Sube este proyecto al repositorio.

2) Netlify (hosting + funciones)
   - Conecta el sitio a tu repositorio de GitHub.
   - Build command: vacío (static). Publish directory: `public`. Functions directory: `netlify/functions`.
   - En Site settings > Environment variables agrega `NETLIFY_DATABASE_URL` con la URL de tu base de datos Neon (Netlify Database/Neon: `red-leaf-55646944`).

3) Base de datos (Neon)
   - No necesitas migraciones manuales. La app crea las tablas `sellers` y `sales` automáticamente en el primer request.

4) Uso
   - Abre el sitio en Netlify.
   - Agrega vendedores desde la página inicial.
   - Selecciona un vendedor y registra ventas. Cada celda es editable. Eliminar con el ícono 🗑️.
   - Botón “Inicio” regresa a selección de vendedor.

## Desarrollo local
- Requisitos: Node 18+
- Instala dependencias y ejecuta servidor local:

```bash
npm install
npx netlify dev
```

- Define `NETLIFY_DATABASE_URL` en tu entorno local para probar.

## Funcionalidades

### Exportación a Excel
- **Botón "📄 Excel" en cada vendedor**: Permite exportar todas las ventas del vendedor a un archivo Excel.
- **Botón "📄 Exportar Excel" en la página de ventas**: Exporta las ventas del vendedor actual.
- **Contenido del archivo Excel**:
  - Cliente
  - Cantidad de cada producto (Arco, Melo, Mara, Oreo)
  - Total por venta
  - Fecha y hora de la venta
  - Fila de totales al final
- **Nombre del archivo**: `Ventas_[NombreVendedor]_[Fecha].xlsx`