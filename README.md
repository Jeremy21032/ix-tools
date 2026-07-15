# IX Tools

Utilidades ops internas estilo [it-tools.tech](https://it-tools.tech/): reenvio de estados IXC, Shopify, availability, transforms JSON.

## Requisitos

- Node.js 20+
- Python 3.10+ (`pip install -r requirements.txt`)

## Setup local

```bash
cd C:\Users\Usuario\Documents\IXCOMERCIO\ix-tools
cp .env.example .env
# Completar keys en .env

pip install -r requirements.txt
npm install
npm run dev
```

- Frontend: http://localhost:5173  
- API: http://localhost:3000 (`/api/health`)

En producción el server sirve también `web/dist`.

## Tools

| Categoría | Tools |
|-----------|--------|
| Órdenes / IXC | Reenvio estados, GetOrder Excel, FEMA Consumer Order |
| Shopify | Órdenes, variantes, catálogo Excel, metafields shipping |
| Inventario | Disponibilidad SKUs, Diff NetSuite, búsqueda CSV / MPN |
| JSON | Oneline, shipment transform, brokered extract, hierarchy Excel |
| Utilidades | Descargar imágenes, Datos de prueba (docs + teléfonos) |

CSV de availability locales: `server/data/availability/*.csv`

## Reenvio de estados (PROD / UAT)

En el formulario elegís **Ambiente: PROD o UAT**. Las keys viven en `.env`:

| Variable | Uso |
|----------|-----|
| `EVENT_PUBLISH_URL_PROD` / `_UAT` | URL event-publish |
| `OCP_APIM_SUBSCRIPTION_KEY_PROD` / `_UAT` | Ocp-Apim-Subscription-Key |
| `OCP_APIM_SUBSCRIPTION_KEY_PROVIDER_RELEASED_PROD` / `_UAT` | Key alternativa para `PROVIDER_ORDER_RELEASED` |

## Shopify (multi-tienda)

Las 4 tools de Shopify piden **store** (`*.myshopify.com`) y **access token** en el formulario. No dependen del `.env` (podés usar muchas tiendas). El navegador recuerda el último valor en `localStorage` para no reescribirlo cada vez.

1. Subir el repo a GitHub/GitLab.
2. New → Blueprint → `render.yaml`, o Web Service con Docker.
3. Configurar env vars (mismas que `.env.example`).
4. Definir `BASIC_AUTH_USER` y `BASIC_AUTH_PASSWORD` antes de exponerlo en público.

Build: Docker (`Dockerfile`). Health check: `/api/health`.

## Estructura

```
ix-tools/
  web/       # Vue 3 + Naive UI
  server/    # Express + reenvio + pythonRunner
  requirements.txt
  Dockerfile
  render.yaml
```
