<script setup>
import { computed, ref, reactive, watch, onMounted } from "vue";
import { useRouter } from "vue-router";
import {
  NCard,
  NForm,
  NFormItem,
  NInput,
  NInputNumber,
  NSelect,
  NSwitch,
  NButton,
  NSpace,
  NAlert,
  NUpload,
  NUploadDragger,
  NText,
  NDivider,
  NDataTable,
  useMessage,
} from "naive-ui";
import { getTool } from "../tools/registry";
import { apiPost } from "../api";
import {
  FAKE_DOCUMENTS,
  FAKE_PHONES,
  countriesFrom,
  typesForCountry,
} from "../tools/fakeDataCatalog";
import JsonDiffTool from "../components/JsonDiffTool.vue";
import CustomerLookupEditor from "../components/CustomerLookupEditor.vue";
import MarkdownPdfTool from "../components/MarkdownPdfTool.vue";

const props = defineProps({ slug: { type: String, required: true } });

const FORM_CONFIG = {
  "order-status-resender": {
    fields: [
      {
        key: "environment",
        type: "select",
        label: "Ambiente",
        default: "PROD",
        options: [
          { label: "PROD (integration.ixcomerciolabs.com)", value: "PROD" },
          { label: "UAT (integration-uat.ixcomerciolabs.com)", value: "UAT" },
        ],
      },
      {
        key: "orders",
        type: "textarea",
        label: "Órdenes (ORDEN o ORDEN,PAIS por línea)",
        rows: 10,
        placeholder: "JB-CO00177531_JBLCOWL180,CO",
      },
      {
        key: "status",
        type: "select",
        label: "Status",
        default: "READY_TO_DELIVER",
        options: [
          { label: "PACK", value: "PACK" },
          { label: "PICK", value: "PICK" },
          { label: "READY_TO_DELIVER", value: "READY_TO_DELIVER" },
          { label: "PROVIDER_ORDER_RELEASED", value: "PROVIDER_ORDER_RELEASED" },
        ],
      },
      {
        key: "eventMode",
        type: "select",
        label: "Modo",
        default: "requested",
        options: [
          { label: "requested", value: "requested" },
          { label: "changed", value: "changed" },
        ],
      },
      { key: "country", type: "text", label: "País por defecto", default: "CO" },
      { key: "threads", type: "number", label: "Threads", default: 8, min: 1, max: 50 },
      { key: "debug", type: "switch", label: "Debug (curl)", default: false },
    ],
  },
  "get-order-excel": {
    fields: [
      {
        key: "ordersText",
        type: "textarea",
        label: "Órdenes (txt)",
        rows: 8,
        placeholder: "orderNumber,customerOrderNumber,netsuiteOrderNumber",
      },
      { key: "ordersFile", type: "file", label: "O subir archivo" },
      { key: "debug", type: "switch", label: "Debug", default: false },
    ],
    multipart: true,
  },
  "customer-lookup": {
    fields: [],
    special: "customer-lookup",
  },
  "fema-consumer-order": {
    fields: [{ key: "orders", type: "textarea", label: "Order IDs (uno por línea o coma)", rows: 10 }],
  },
  "shopify-orders": {
    fields: [
      {
        key: "shopifyStore",
        type: "text",
        label: "Shopify store",
        placeholder: "mi-tienda.myshopify.com",
        persist: "ix-shopify-store",
      },
      {
        key: "shopifyToken",
        type: "password",
        label: "Access token (shpat_…)",
        placeholder: "shpat_…",
        persist: "ix-shopify-token",
      },
      { key: "ordersText", type: "textarea", label: "Números de orden Shopify", rows: 8 },
      { key: "ordersFile", type: "file", label: "O subir .txt" },
    ],
    multipart: true,
  },
  "shopify-variants": {
    fields: [
      {
        key: "shopifyStore",
        type: "text",
        label: "Shopify store",
        placeholder: "mi-tienda.myshopify.com",
        persist: "ix-shopify-store",
      },
      {
        key: "shopifyToken",
        type: "password",
        label: "Access token (shpat_…)",
        placeholder: "shpat_…",
        persist: "ix-shopify-token",
      },
    ],
  },
  "shopify-product-events": {
    fields: [
      {
        key: "shopifyStore",
        type: "text",
        label: "Shopify store",
        placeholder: "mi-tienda.myshopify.com",
        persist: "ix-shopify-store",
      },
      {
        key: "shopifyToken",
        type: "password",
        label: "Access token (shpat_…)",
        placeholder: "shpat_…",
        persist: "ix-shopify-token",
      },
      {
        key: "actions",
        type: "text",
        label: "Acciones (opcional, separadas por espacio)",
        placeholder: "create update destroy publish unpublish",
      },
    ],
  },
  "shopify-catalog-excel": {
    fields: [
      {
        key: "shopifyStore",
        type: "text",
        label: "Shopify store",
        placeholder: "mi-tienda.myshopify.com",
        persist: "ix-shopify-store",
      },
      {
        key: "shopifyToken",
        type: "password",
        label: "Access token (shpat_…)",
        placeholder: "shpat_…",
        persist: "ix-shopify-token",
      },
    ],
  },
  "shopify-shipping-metafields": {
    fields: [
      {
        key: "shopifyStore",
        type: "text",
        label: "Shopify store",
        placeholder: "mi-tienda.myshopify.com",
        persist: "ix-shopify-store",
      },
      {
        key: "shopifyToken",
        type: "password",
        label: "Access token (shpat_…)",
        placeholder: "shpat_…",
        persist: "ix-shopify-token",
      },
      { key: "dryRun", type: "switch", label: "Dry-run (recomendado)", default: true },
      { key: "confirm", type: "switch", label: "Confirmar escritura (si dry-run off)", default: false },
      { key: "allVariants", type: "switch", label: "Todas las variantes", default: false },
      { key: "variantId", type: "text", label: "Variant ID (opcional)" },
      { key: "variantsFile", type: "file", label: "JSON variantes (opcional)" },
    ],
    multipart: true,
  },
  "sku-availability": {
    fields: [
      { key: "skusText", type: "textarea", label: "SKUs", rows: 8 },
      { key: "skusFile", type: "file", label: "O subir skus.txt" },
    ],
    multipart: true,
  },
  "availability-netsuite-diff": {
    fields: [
      { key: "apiFile", type: "file", label: "Excel availability (API)", required: true },
      { key: "netsuiteFile", type: "file", label: "CSV NetSuite", required: true },
      { key: "country", type: "text", label: "Country filter (ej CR)" },
    ],
    multipart: true,
  },
  "availability-search": {
    fields: [
      {
        key: "mode",
        type: "select",
        label: "Modo",
        default: "csv",
        options: [
          { label: "Buscar en CSV locales", value: "csv" },
          { label: "Product catalog MPN", value: "product" },
        ],
      },
      { key: "column", type: "text", label: "Columna CSV (vacío = todas)" },
      { key: "query", type: "text", label: "Query CSV" },
      { key: "mpn", type: "textarea", label: "MPN(s) — uno por línea", rows: 4 },
      { key: "country", type: "text", label: "Country (product)", default: "PE" },
    ],
  },
  "json-diff": {
    fields: [],
    special: "json-diff",
  },
  "json-oneline": {
    fields: [
      { key: "text", type: "textarea", label: "JSON", rows: 12 },
      { key: "stringify", type: "switch", label: "Doble stringify", default: false },
    ],
  },
  "json-pretty": {
    fields: [
      { key: "text", type: "textarea", label: "JSON (oneline o stringificado)", rows: 12 },
      {
        key: "unwrap",
        type: "switch",
        label: "Deshacer stringify (si viene escapado como string)",
        default: true,
      },
    ],
  },
  "shipment-transform": {
    fields: [
      { key: "text", type: "textarea", label: "Shipment JSON", rows: 12 },
      { key: "asString", type: "switch", label: "Como string JSON", default: false },
    ],
  },
  "brokered-extract": {
    fields: [
      { key: "text", type: "textarea", label: "Brokered JSON", rows: 10 },
      { key: "jsonFile", type: "file", label: "O subir .json" },
    ],
    multipart: true,
  },
  "hierarchy-excel": {
    fields: [
      { key: "text", type: "textarea", label: "Hierarchy JSON", rows: 10 },
      { key: "jsonFile", type: "file", label: "O subir input.json" },
    ],
    multipart: true,
  },
  "json-to-excel": {
    fields: [
      {
        key: "text",
        type: "textarea",
        label: "JSON (array de objetos)",
        rows: 14,
        placeholder: '[\n  { "Sku": "MM900JBL96", "Mpn": "JBLT600BTNCBLUAM", "InStock": 0, "RealStockValue": true }\n]',
      },
      { key: "jsonFile", type: "file", label: "O subir .json" },
    ],
    multipart: true,
  },
  "download-images": {
    fields: [
      { key: "urlsText", type: "textarea", label: "URLs (una por línea)", rows: 8 },
      { key: "urlsFile", type: "file", label: "O subir .txt" },
      { key: "delay", type: "text", label: "Delay segundos", default: "0.5" },
    ],
    multipart: true,
  },
  "markdown-pdf": {
    fields: [],
    special: "markdown-pdf",
  },
  "fake-documents": {
    // Formulario propio (cascada kind → país → tipo) en el template
    fields: [],
    special: "fake-data",
  },
};

function defaultsFrom(config) {
  const o = {};
  for (const f of config.fields || []) {
    if (f.persist) {
      try {
        const saved = localStorage.getItem(f.persist);
        if (saved != null && saved !== "") {
          o[f.key] = saved;
          continue;
        }
      } catch {}
    }
    if (f.default !== undefined) o[f.key] = f.default;
    else if (f.type === "switch") o[f.key] = false;
    else if (f.type === "number") o[f.key] = f.min || 0;
    else o[f.key] = "";
  }
  return o;
}

function persistFormFields(config, form) {
  for (const f of config.fields || []) {
    if (!f.persist) continue;
    try {
      const v = form[f.key];
      if (v != null && String(v).trim() !== "") {
        localStorage.setItem(f.persist, String(v));
      }
    } catch {}
  }
}

const message = useMessage();
const router = useRouter();
const tool = computed(() => getTool(props.slug));
const config = computed(() => FORM_CONFIG[props.slug] || { fields: [] });
const form = reactive(defaultsFrom(config.value));
const files = reactive({});
const loading = ref(false);
const logs = ref([]);
const downloadUrl = ref(null);
const downloadName = ref("");
const resultText = ref("");
const summary = ref(null);
const tableColumns = ref([]);
const tableRows = ref([]);

const fakeForm = reactive({
  kind: "document",
  country: "CO",
  typeId: "CO_CEDULA",
  prefixMode: "both",
  count: 10,
});

const fakeCatalog = computed(() =>
  fakeForm.kind === "phone" ? FAKE_PHONES : FAKE_DOCUMENTS
);

const fakeCountryOptions = computed(() => countriesFrom(fakeCatalog.value));

const fakeTypeOptions = computed(() =>
  typesForCountry(fakeCatalog.value, fakeForm.country)
);

function syncFakeCountryAndType() {
  const countries = fakeCountryOptions.value;
  if (!countries.find((c) => c.value === fakeForm.country)) {
    fakeForm.country = countries[0]?.value || "";
  }
  const types = typesForCountry(fakeCatalog.value, fakeForm.country);
  if (!types.find((t) => t.value === fakeForm.typeId)) {
    fakeForm.typeId = types[0]?.value || "";
  }
}

watch(
  () => fakeForm.kind,
  () => {
    fakeForm.country =
      fakeForm.kind === "phone" ? "EC" : "CO";
    syncFakeCountryAndType();
  }
);

watch(
  () => fakeForm.country,
  () => {
    const types = typesForCountry(fakeCatalog.value, fakeForm.country);
    fakeForm.typeId = types[0]?.value || "";
  }
);

onMounted(() => {
  if (props.slug === "fake-documents") syncFakeCountryAndType();
});

watch(
  () => props.slug,
  () => {
    Object.keys(form).forEach((k) => delete form[k]);
    Object.assign(form, defaultsFrom(config.value));
    Object.keys(files).forEach((k) => delete files[k]);
    logs.value = [];
    downloadUrl.value = null;
    downloadName.value = "";
    resultText.value = "";
    summary.value = null;
    tableColumns.value = [];
    tableRows.value = [];
    if (props.slug === "fake-documents") syncFakeCountryAndType();
  }
);

async function run() {
  if (!tool.value) return;
  loading.value = true;
  logs.value = [];
  downloadUrl.value = null;
  downloadName.value = "";
  resultText.value = "";
  summary.value = null;
  tableColumns.value = [];
  tableRows.value = [];
  try {
    persistFormFields(config.value, form);
    let data;
    if (config.value.special === "fake-data") {
      syncFakeCountryAndType();
      if (!fakeForm.typeId) {
        message.error("Seleccioná un tipo disponible para el país");
        loading.value = false;
        return;
      }
      data = await apiPost(props.slug, {
        kind: fakeForm.kind,
        documentType: fakeForm.kind === "document" ? fakeForm.typeId : undefined,
        phoneType: fakeForm.kind === "phone" ? fakeForm.typeId : undefined,
        prefixMode: fakeForm.prefixMode,
        count: fakeForm.count,
        country: fakeForm.country,
      });
    } else if (config.value.multipart) {
      const fd = new FormData();
      for (const f of config.value.fields) {
        if (f.type === "file") {
          if (files[f.key]) fd.append(f.key, files[f.key]);
        } else if (form[f.key] !== undefined && form[f.key] !== "") {
          fd.append(f.key, String(form[f.key]));
        }
      }
      data = await apiPost(props.slug, fd, { multipart: true });
    } else {
      const body = { ...form };
      if (props.slug === "availability-search" && form.mode === "product" && form.mpn) {
        body.mpns = String(form.mpn)
          .split(/[\n,]+/)
          .map((s) => s.trim())
          .filter(Boolean);
      }
      data = await apiPost(props.slug, body);
    }
    logs.value = data.logs || [];
    downloadUrl.value = data.downloadUrl || null;
    downloadName.value = data.downloadName || "";
    summary.value = data.summary || null;
    applyTable(data.table);
    if (data.result != null) {
      resultText.value =
        typeof data.result === "string" ? data.result : JSON.stringify(data.result, null, 2);
    } else if (data.data != null && !data.table) {
      resultText.value = JSON.stringify(data.data, null, 2);
    }
    if (data.ok !== false) message.success("Listo");
    else message.warning("Completó con errores o parcialmente");
  } catch (e) {
    logs.value = e.data?.logs || [e.message];
    message.error(e.message);
  } finally {
    loading.value = false;
  }
}

function applyTable(table) {
  if (!table?.columns?.length) return;
  tableColumns.value = table.columns.map((key) => ({
    title: key,
    key,
    ellipsis: { tooltip: true },
    minWidth: key === "error" || key === "message" ? 180 : 120,
  }));
  tableRows.value = (table.rows || []).map((row, i) => ({
    ...row,
    key: String(i),
  }));
}

function onFile(key, options) {
  files[key] = options.file.file;
  options.onFinish();
}

function tableToTsv() {
  const cols = tableColumns.value.map((c) => c.key);
  const header = cols.join("\t");
  const lines = tableRows.value.map((row) =>
    cols.map((k) => String(row[k] ?? "").replace(/\t/g, " ").replace(/\r?\n/g, " ")).join("\t")
  );
  return [header, ...lines].join("\n");
}

function tableToCsv() {
  const cols = tableColumns.value.map((c) => c.key);
  const esc = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const header = cols.map(esc).join(",");
  const lines = tableRows.value.map((row) => cols.map((k) => esc(row[k])).join(","));
  return [header, ...lines].join("\n");
}

function downloadBlob(filename, content, mime = "text/plain;charset=utf-8") {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

async function copyTable() {
  if (!tableRows.value.length) return;
  try {
    await navigator.clipboard.writeText(tableToTsv());
    message.success("Tabla copiada (pegable en Excel)");
  } catch (e) {
    message.error("No se pudo copiar: " + (e.message || "permiso denegado"));
  }
}

async function copyResultText() {
  if (!resultText.value) return;
  try {
    await navigator.clipboard.writeText(resultText.value);
    message.success("Resultado copiado");
  } catch (e) {
    message.error("No se pudo copiar: " + (e.message || "permiso denegado"));
  }
}

function downloadTableCsv() {
  if (!tableRows.value.length) return;
  downloadBlob(`${props.slug || "resultado"}.csv`, tableToCsv(), "text/csv;charset=utf-8");
  message.success("CSV descargado");
}

function downloadResultText() {
  if (!resultText.value) return;
  const name = downloadName.value || `${props.slug || "resultado"}.txt`;
  downloadBlob(name, resultText.value);
}

const downloadLabel = computed(() => {
  const n = (downloadName.value || downloadUrl.value || "").toLowerCase();
  if (n.endsWith(".xlsx")) return "Descargar Excel";
  if (n.endsWith(".csv")) return "Descargar CSV";
  if (n.endsWith(".json")) return "Descargar JSON";
  if (n.endsWith(".txt")) return "Descargar TXT";
  if (downloadUrl.value) return "Descargar archivo";
  return "Descargar";
});
</script>

<template>
  <div v-if="!tool">
    <n-alert type="error">Tool no encontrada</n-alert>
    <n-button style="margin-top: 1rem" @click="router.push('/')">Volver</n-button>
  </div>
  <div v-else>
    <div style="margin-bottom: 1.25rem">
      <n-button text type="primary" @click="router.push('/')">← Todas las tools</n-button>
      <h1 style="margin: 0.5rem 0 0.35rem; font-size: 1.65rem">{{ tool.title }}</h1>
      <p style="margin: 0 0 0.75rem; color: var(--muted)">{{ tool.description }}</p>
      <n-alert v-if="tool.help" type="info" :bordered="false" style="max-width: 720px">
        <div style="font-weight: 600; margin-bottom: 0.25rem">¿Para qué sirve?</div>
        <div style="line-height: 1.45">{{ tool.help }}</div>
      </n-alert>
    </div>

    <n-card v-if="config.special === 'json-diff'">
      <JsonDiffTool />
    </n-card>

    <n-card v-else-if="config.special === 'customer-lookup'">
      <CustomerLookupEditor />
    </n-card>

    <n-card v-else-if="config.special === 'markdown-pdf'">
      <MarkdownPdfTool />
    </n-card>

    <n-card v-else>
      <n-form label-placement="top">
        <!-- Cascada: documento/teléfono → país → tipos de ese país -->
        <template v-if="config.special === 'fake-data'">
          <n-form-item label="1. Qué querés generar">
            <n-select
              v-model:value="fakeForm.kind"
              :options="[
                { label: 'Documento de identidad', value: 'document' },
                { label: 'Teléfono', value: 'phone' },
              ]"
            />
          </n-form-item>
          <n-form-item label="2. País">
            <n-select v-model:value="fakeForm.country" :options="fakeCountryOptions" />
          </n-form-item>
          <n-form-item
            :label="
              fakeForm.kind === 'phone'
                ? '3. Tipo de teléfono (habilitados en el país)'
                : '3. Tipo de documento (habilitados en el país)'
            "
          >
            <n-select
              v-model:value="fakeForm.typeId"
              :options="fakeTypeOptions"
              :disabled="!fakeTypeOptions.length"
              placeholder="Elegí un tipo"
            />
          </n-form-item>
          <n-form-item v-if="fakeForm.kind === 'phone'" label="4. Formato de salida">
            <n-select
              v-model:value="fakeForm.prefixMode"
              :options="[
                { label: 'Ambos: nacional (sin +) e internacional (con +)', value: 'both' },
                { label: 'Solo nacional (ej. EC 09…)', value: 'national' },
                { label: 'Solo internacional (ej. +593…)', value: 'international' },
              ]"
            />
          </n-form-item>
          <n-form-item label="Cantidad">
            <n-input-number v-model:value="fakeForm.count" :min="1" :max="500" style="width: 100%" />
          </n-form-item>
        </template>

        <template v-else>
          <template v-for="f in config.fields" :key="f.key">
            <n-form-item
              v-if="!f.showIf || form[f.showIf.key] === f.showIf.value"
              :label="f.label"
            >
            <n-input
              v-if="f.type === 'textarea'"
              v-model:value="form[f.key]"
              type="textarea"
              :rows="f.rows || 6"
              :placeholder="f.placeholder"
              class="mono"
            />
            <n-input
              v-else-if="f.type === 'password'"
              v-model:value="form[f.key]"
              type="password"
              show-password-on="click"
              :placeholder="f.placeholder"
            />
            <n-input
              v-else-if="f.type === 'text'"
              v-model:value="form[f.key]"
              :placeholder="f.placeholder"
            />
            <n-input-number
              v-else-if="f.type === 'number'"
              v-model:value="form[f.key]"
              :min="f.min"
              :max="f.max"
              style="width: 100%"
            />
            <n-select
              v-else-if="f.type === 'select'"
              v-model:value="form[f.key]"
              :options="f.options"
            />
            <n-switch v-else-if="f.type === 'switch'" v-model:value="form[f.key]" />
            <n-upload
              v-else-if="f.type === 'file'"
              :max="1"
              :custom-request="(opt) => onFile(f.key, opt)"
            >
              <n-upload-dragger>
                <n-text depth="3">Soltá un archivo o click para elegir</n-text>
              </n-upload-dragger>
            </n-upload>
            </n-form-item>
          </template>
        </template>

        <n-space>
          <n-button type="primary" :loading="loading" @click="run">Ejecutar</n-button>
          <n-button
            v-if="downloadUrl"
            tag="a"
            :href="downloadUrl"
            target="_blank"
            secondary
            type="success"
          >
            {{ downloadLabel }}
          </n-button>
          <n-button v-if="tableRows.length" secondary @click="copyTable">Copiar tabla</n-button>
          <n-button v-if="tableRows.length" secondary @click="downloadTableCsv">CSV tabla</n-button>
          <n-button v-if="resultText" secondary @click="copyResultText">Copiar texto</n-button>
          <n-button v-if="resultText && !downloadUrl" secondary type="success" @click="downloadResultText">
            Descargar texto
          </n-button>
        </n-space>
      </n-form>

      <n-divider v-if="summary || logs.length || resultText || tableRows.length" />

      <n-alert
        v-if="summary"
        :type="summary.errors ? 'warning' : 'success'"
        style="margin-bottom: 1rem"
      >
        OK: {{ summary.success ?? 0 }} · Errores: {{ summary.errors ?? 0 }}
        <span v-if="summary.total"> · Total: {{ summary.total }}</span>
        <span v-if="summary.seconds"> · {{ summary.seconds }}s</span>
      </n-alert>

      <div v-if="tableRows.length" style="margin-bottom: 1rem">
        <n-space align="center" justify="space-between" style="margin-bottom: 0.5rem">
          <div style="font-weight: 600">Resultados ({{ tableRows.length }})</div>
          <n-space>
            <n-button size="small" secondary @click="copyTable">Copiar</n-button>
            <n-button size="small" secondary @click="downloadTableCsv">CSV</n-button>
            <n-button
              v-if="downloadUrl"
              size="small"
              tag="a"
              :href="downloadUrl"
              target="_blank"
              secondary
              type="success"
            >
              {{ downloadLabel }}
            </n-button>
          </n-space>
        </n-space>
        <n-data-table
          :columns="tableColumns"
          :data="tableRows"
          :bordered="true"
          size="small"
          :scroll-x="Math.max(900, tableColumns.length * 130)"
          :max-height="420"
          :pagination="{ pageSize: 20 }"
        />
      </div>

      <div v-if="resultText" style="margin-bottom: 1rem">
        <n-space align="center" justify="space-between" style="margin-bottom: 0.4rem">
          <div style="font-weight: 600">Resultado</div>
          <n-space>
            <n-button size="small" secondary @click="copyResultText">Copiar</n-button>
            <n-button
              v-if="downloadUrl"
              size="small"
              tag="a"
              :href="downloadUrl"
              target="_blank"
              secondary
              type="success"
            >
              {{ downloadLabel }}
            </n-button>
            <n-button v-else size="small" secondary type="success" @click="downloadResultText">
              Descargar
            </n-button>
          </n-space>
        </n-space>
        <div class="logs-box">{{ resultText }}</div>
      </div>

      <div v-if="logs.length">
        <div style="font-weight: 600; margin-bottom: 0.4rem">Logs</div>
        <div class="logs-box">{{ logs.join("\n") }}</div>
      </div>
    </n-card>
  </div>
</template>
