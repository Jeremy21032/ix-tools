export const CATEGORIES = [
  { id: "orders", label: "Órdenes / IXC" },
  { id: "shopify", label: "Shopify" },
  { id: "inventory", label: "Inventario" },
  { id: "json", label: "JSON / Transform" },
  { id: "utils", label: "Utilidades" },
];

/**
 * description = texto corto en la card del home
 * help = para qué sirve (página del tool)
 */
export const tools = [
  {
    slug: "order-status-resender",
    title: "Reenvio de estados",
    description:
      "Reenvía eventos de fulfillment (PACK, PICK, etc.) cuando una orden quedó trabada o no notificó a IXC.",
    help: "Usalo cuando una orden no avanzó de estado en el ecosistema IXC (por timeout, 429 o fallo de integración). Publica orderStatusRequested/Changed a APIM en PROD o UAT: PACK, PICK, READY_TO_DELIVER o PROVIDER_ORDER_RELEASED. Pegá la lista de order IDs (opcionalmente con país) y elegí status + modo.",
    category: "orders",
    icon: "Send",
  },
  {
    slug: "get-order-excel",
    title: "GetOrder → Excel",
    description:
      "Consulta getOrder firmado por customer: Pick/Pack, fechas y status. Tabla en pantalla + Excel.",
    help: "Para armar o validar reportes de facturación / seguimiento. Con la lista de órdenes y el customer_lookup genera firma (iws-keys), llama getOrder de Apigee y te muestra PickNumber, PackNumber, StatusCode, etc. Útil frente a “¿tiene pack? ¿qué status tiene en IWS?”. Editá el lookup en la tool Customer lookup.",
    category: "orders",
    icon: "DocumentText",
  },
  {
    slug: "customer-lookup",
    title: "Customer lookup",
    description:
      "Editá el diccionario customer → country / customerId / type / channel usado por GetOrder.",
    help: "Mantiene server/data/customer_lookup.json. Cada clave es el código de customer (sufijo del order id, ej. JBLCOWL180). type es el ID de iws-keys para firmar getOrder. Cambios se aplican de inmediato a GetOrder → Excel en esta instancia.",
    category: "orders",
    icon: "People",
  },
  {
    slug: "fema-consumer-order",
    title: "FEMA Consumer Order",
    description:
      "Cruza IDs IXC → customerOrder / NetSuite. Tabla en pantalla, copiar o Excel.",
    help: "Consulta la API consumerOrder del orquestador FEMA (Azure). Sirve cuando tenés el ID de fulfillment (ej. JB-CO00…_JBL…) y necesitás el número de orden del cliente y/o el de NetSuite para cruzar con facturación, ERP o tickets. Ves la tabla, podés copiarla al portapapeles (pega en Excel) o descargar el .xlsx. No reemplaza getOrder: solo resuelve ese trío de identificadores.",
    category: "orders",
    icon: "Search",
  },
  {
    slug: "shopify-orders",
    title: "Shopify: detalle órdenes",
    description:
      "Baja el detalle completo de órdenes Shopify (JSON/CSV) de cualquier tienda.",
    help: "Dado un listado de números de orden Admin (ej. 4076), obtiene el detalle GraphQL (líneas, fulfillments, transacciones) y lo exporta. Store + token van en el form porque trabajás con muchas tiendas.",
    category: "shopify",
    icon: "Cart",
  },
  {
    slug: "shopify-variants",
    title: "Shopify: listar variantes",
    description:
      "Catálogo de variantes: SKU, barcode, location y stock por ubicación.",
    help: "Recorre el catálogo Admin y lista cada variante con barcode, SKU y el stock disponible por location (una fila por variante×ubicación). Ves la tabla en pantalla y podés descargar Excel (.xlsx) o JSON. Credenciales por formulario. El token necesita scopes read_products y read_inventory.",
    category: "shopify",
    icon: "List",
  },
  {
    slug: "shopify-catalog-excel",
    title: "Shopify: catálogo Excel",
    description:
      "Export comercial: productos/variantes + metafields IXC de shipping a Excel.",
    help: "Genera un Excel del catálogo con columnas de metafields de envío IXC (largo, ancho, peso, etc.). Ideal para revisar o auditar qué tiene cargado cada variante en la tienda.",
    category: "shopify",
    icon: "Grid",
  },
  {
    slug: "shopify-shipping-metafields",
    title: "Shopify: metafields shipping",
    description:
      "Carga/actualiza metafields IXC de dimensiones y peso en variantes (con dry-run).",
    help: "Escribe metafields del namespace IXC (shipping_LengthEach, weightEach, etc.). Por defecto corre en dry-run: no cambia nada hasta que desactives dry-run y confirmes. Pedí store/token en el form.",
    category: "shopify",
    icon: "Create",
  },
  {
    slug: "sku-availability",
    title: "Disponibilidad SKUs",
    description:
      "Consulta stock IXC por lista de SKUs y genera Excel multi-hoja (país/ubicación).",
    help: "Llama la API de availability con tu lista de SKUs y arma un Excel con resumen, stock por país y por ubicación. Útil para chequear AFS/OH antes de campañas o para armar el input del diff vs NetSuite.",
    category: "inventory",
    icon: "Cube",
  },
  {
    slug: "availability-netsuite-diff",
    title: "Diff Availability vs NetSuite",
    description:
      "Compara el Excel de availability API contra el CSV exportado de NetSuite.",
    help: "Detecta diferencias de cantidades (OH, OS, AFS, etc.) entre lo que responde la API IXC y lo que tiene NetSuite. Subís el xlsx de disponibilidad y el csv de NS; opcionalmente filtrás por país.",
    category: "inventory",
    icon: "GitCompare",
  },
  {
    slug: "availability-search",
    title: "Buscar availability / MPN",
    description:
      "Busca en CSV locales de availability o resuelve MPN vía product-catalog IXC.",
    help: "Dos modos: (1) buscar texto en los CSV que pongas en server/data/availability/; (2) consultar product-catalog por MPN para ver identificadores del producto. No descarga stock en vivo: es búsqueda local + lookup de catálogo.",
    category: "inventory",
    icon: "SearchCircle",
  },
  {
    slug: "json-diff",
    title: "JSON Diff",
    description:
      "Compara dos JSON lado a lado (estilo Beyond Compare): added / removed / changed por path.",
    help: "Pegá o subí Left (A) y Right (B). Ordena keys para ignorar el orden de propiedades, opcionalmente ignora el orden de arrays. Ves el pretty side-by-side con colores y la lista de paths distintos — útil para payloads, responses de API o dumps de órdenes.",
    category: "json",
    icon: "GitCompare",
  },
  {
    slug: "json-oneline",
    title: "JSON oneline",
    description:
      "Deja el JSON en una sola línea; opcional para pegarlo como campo data escapado.",
    help: "Minifica JSON multilínea. Con “doble stringify” queda listo para usarlo como valor string de un campo data dentro de otro envelope JSON ( típico en payloads de eventos).",
    category: "json",
    icon: "CodeSlash",
  },
  {
    slug: "json-pretty",
    title: "JSON pretty",
    description:
      "Formatea un JSON minificado o stringificado a multilínea legible (indent).",
    help: "Contrario de JSON oneline: pegá un one-liner o un valor con doble stringify (\"{\\\"a\\\":1}\") y obtenés JSON pretty con indentación. Con “Deshacer stringify” activo, desempaqueta strings JSON anidados hasta llegar al objeto real.",
    category: "json",
    icon: "CodeWorking",
  },
  {
    slug: "shipment-transform",
    title: "Shipment JSON transform",
    description: "Reduce un JSON grande de shipment al sobre { shipmentDetails } limpio.",
    help: "Saca ruido de respuestas de shipping y deja solo los campos útiles de shipmentDetails. Sirve para armar payloads más chicos o depurar integraciones de envío.",
    category: "json",
    icon: "SwapHorizontal",
  },
  {
    slug: "brokered-extract",
    title: "Brokered message extract",
    description:
      "De un dump de Service Bus, saca Order / Pick / Pack / CustomerId a CSV.",
    help: "Parsea exports de BrokeredMessage (JSON) y tabula OrderNumber, PickNumber, PackNumber, CustomerId y fordNotification. Ideal cuando necesitás cruzar mensajes de cola sin abrir uno por uno.",
    category: "json",
    icon: "Download",
  },
  {
    slug: "hierarchy-excel",
    title: "Hierarchy → Excel",
    description: "Aplana la jerarquía geográfica JSON (países/estados/ciudades) a Excel.",
    help: "Convierte un JSON de hierarchy (level1/level2/level3) en filas de Excel para México u otros países. Sirve para validar o compartir catálogos geográficos con negocio.",
    category: "json",
    icon: "GitNetwork",
  },
  {
    slug: "download-images",
    title: "Descargar imágenes",
    description: "Baja un lote de imágenes desde una lista de URLs a disco del server.",
    help: "Leés un .txt con URLs (una por línea) y descarga los archivos al job del server. Útil para respaldar assets de galerías o listados sin abrir cada link a mano.",
    category: "utils",
    icon: "Images",
  },
  {
    slug: "markdown-pdf",
    title: "Markdown → PDF",
    description: "Cargá un .md, previsualizalo y exportalo a PDF (A4).",
    help: "Utilidad para README, runbooks o notas. Pegá o subí Markdown (GFM), ves el preview en vivo y generás un PDF descargable. También podés bajar el .md editado.",
    category: "utils",
    icon: "Reader",
  },
  {
    slug: "fake-documents",
    title: "Datos de prueba",
    description:
      "Genera documentos (RUT, NIT, DNI…) y teléfonos con formato válido (+593 / 09…, etc.).",
    help: "Flujo: 1) Documento o teléfono → 2) País → 3) Solo los tipos habilitados de ese país (ej. Colombia: Cédula y NIT). Teléfonos: nacional (09… EC) e internacional (+593). Sintéticos para QA de formularios.",
    category: "utils",
    icon: "IdCard",
  },
];

export function getTool(slug) {
  return tools.find((t) => t.slug === slug);
}
