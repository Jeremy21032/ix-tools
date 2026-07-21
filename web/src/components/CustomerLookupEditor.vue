<script setup>
import { computed, h, onMounted, ref } from "vue";
import {
  NButton,
  NSpace,
  NAlert,
  NInput,
  NSelect,
  NDataTable,
  NPopconfirm,
  NFormItem,
  useMessage,
} from "naive-ui";
import { apiGet, apiPost } from "../api";

const message = useMessage();
const loading = ref(false);
const saving = ref(false);
const rows = ref([]);
const dirty = ref(false);
const pathHint = ref("");
const jsonMode = ref(false);
const jsonText = ref("");
const meta = ref({ updatedAt: null, note: "", count: null, source: null });
const note = ref("");
const environment = ref("PROD");

const envOptions = [
  { label: "PROD", value: "PROD" },
  { label: "UAT", value: "UAT" },
];

function blankRow() {
  return { key: `new-${Date.now()}-${Math.random()}`, code: "", country: "", customerId: "", type: "", channel: "" };
}

function markDirty() {
  dirty.value = true;
}

function cellInput(row, field, placeholder = "") {
  return h(NInput, {
    value: row[field],
    size: "small",
    placeholder,
    onUpdateValue: (v) => {
      row[field] = v;
      markDirty();
    },
  });
}

const columns = [
  {
    title: "Customer code",
    key: "code",
    minWidth: 150,
    render: (row) => cellInput(row, "code", "JBLCOWL180"),
  },
  {
    title: "country",
    key: "country",
    width: 100,
    render: (row) => cellInput(row, "country", "CO"),
  },
  {
    title: "customerId",
    key: "customerId",
    minWidth: 120,
    render: (row) => cellInput(row, "customerId", "JBL / Crocs"),
  },
  {
    title: "type (iws-keys)",
    key: "type",
    minWidth: 120,
    render: (row) => cellInput(row, "type", "ID00216"),
  },
  {
    title: "channel",
    key: "channel",
    width: 110,
    render: (row) => cellInput(row, "channel", "WL180"),
  },
  {
    title: "",
    key: "actions",
    width: 90,
    render: (row) =>
      h(
        NPopconfirm,
        {
          onPositiveClick: () => {
            rows.value = rows.value.filter((r) => r.key !== row.key);
            markDirty();
          },
        },
        {
          trigger: () =>
            h(NButton, { size: "tiny", quaternary: true, type: "error" }, { default: () => "Borrar" }),
          default: () => "¿Eliminar esta fila?",
        }
      ),
  },
];

const count = computed(() => rows.value.length);

const freshness = computed(() => {
  const iso = meta.value?.updatedAt;
  if (!iso) {
    return {
      type: "warning",
      title: `[${environment.value}] Sin fecha de actualización`,
      detail: "Todavía no se guardó desde la UI (o no hay metadata). Guardá una vez para empezar a trackear.",
    };
  }
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) {
    return { type: "warning", title: "Fecha inválida", detail: String(iso) };
  }
  const days = Math.floor((Date.now() - t) / 86400000);
  const local = new Date(iso).toLocaleString();
  let type = "success";
  let ageLabel = "hoy";
  if (days === 1) ageLabel = "hace 1 día";
  else if (days > 1) ageLabel = `hace ${days} días`;
  if (days >= 30) type = "warning";
  if (days >= 90) type = "error";
  return {
    type,
    title: `[${environment.value}] Última actualización: ${ageLabel}`,
    detail: `${local}${meta.value.source ? ` · origen: ${meta.value.source}` : ""}${
      meta.value.count != null ? ` · ${meta.value.count} customers` : ""
    }`,
  };
});

async function load() {
  loading.value = true;
  try {
    const data = await apiGet(`customer-lookup?environment=${encodeURIComponent(environment.value)}`);
    if (data.ok === false) throw new Error(data.error || "No se pudo cargar");
    rows.value = (data.rows || []).map((r, i) => ({
      key: `${r.code}-${i}`,
      code: r.code || "",
      country: r.country || "",
      customerId: r.customerId || "",
      type: r.type || "",
      channel: r.channel || "",
    }));
    pathHint.value = data.path || "";
    meta.value = data.meta || {};
    note.value = data.meta?.note || "";
    jsonText.value = JSON.stringify(data.data || {}, null, 2);
    dirty.value = false;
    message.success(`[${environment.value}] ${data.count ?? rows.value.length} customer(s)`);
  } catch (e) {
    message.error(e.message || "Error al cargar");
  } finally {
    loading.value = false;
  }
}

async function onEnvChange(value) {
  if (dirty.value) {
    const ok = window.confirm("Hay cambios sin guardar. ¿Cambiar de ambiente y descartarlos?");
    if (!ok) return;
  }
  environment.value = value;
  jsonMode.value = false;
  await load();
}

function addRow() {
  rows.value = [...rows.value, blankRow()];
  markDirty();
}

function applyJsonToRows() {
  try {
    const parsed = JSON.parse(jsonText.value || "{}");
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("Debe ser un objeto { código: { country, customerId, type, channel } }");
    }
    rows.value = Object.keys(parsed)
      .sort((a, b) => a.localeCompare(b))
      .map((code, i) => ({
        key: `${code}-${i}`,
        code,
        country: parsed[code]?.country ?? "",
        customerId: parsed[code]?.customerId ?? "",
        type: parsed[code]?.type ?? "",
        channel: parsed[code]?.channel ?? "",
      }));
    markDirty();
    jsonMode.value = false;
    message.success("JSON aplicado a la tabla");
  } catch (e) {
    message.error(e.message || "JSON inválido");
  }
}

function syncJsonFromRows() {
  const obj = {};
  for (const r of rows.value) {
    const code = String(r.code || "").trim();
    if (!code) continue;
    obj[code] = {
      country: r.country ?? "",
      customerId: r.customerId ?? "",
      type: r.type ?? "",
      channel: r.channel ?? "",
    };
  }
  jsonText.value = JSON.stringify(obj, null, 2);
}

function toggleJson() {
  if (!jsonMode.value) {
    syncJsonFromRows();
    jsonMode.value = true;
  } else {
    applyJsonToRows();
  }
}

async function save() {
  saving.value = true;
  try {
    if (jsonMode.value) {
      applyJsonToRows();
    }
    const payloadRows = rows.value.map((r) => ({
      code: String(r.code || "").trim(),
      country: r.country,
      customerId: r.customerId,
      type: r.type,
      channel: r.channel,
    }));
    const empty = payloadRows.filter((r) => !r.code);
    if (empty.length) {
      message.error("Hay filas sin customer code");
      saving.value = false;
      return;
    }
    const codes = payloadRows.map((r) => r.code);
    const dup = codes.find((c, i) => codes.indexOf(c) !== i);
    if (dup) {
      message.error(`Código duplicado: ${dup}`);
      saving.value = false;
      return;
    }
    const data = await apiPost("customer-lookup", {
      environment: environment.value,
      rows: payloadRows,
      note: note.value,
      source: "ui",
    });
    rows.value = (data.rows || []).map((r, i) => ({
      key: `${r.code}-${i}`,
      ...r,
    }));
    meta.value = data.meta || {};
    note.value = data.meta?.note || note.value;
    pathHint.value = data.path || pathHint.value;
    syncJsonFromRows();
    dirty.value = false;
    message.success(`[${environment.value}] Guardado (${data.count} customers)`);
  } catch (e) {
    message.error(e.message || "No se pudo guardar");
  } finally {
    saving.value = false;
  }
}

function downloadJson() {
  syncJsonFromRows();
  const blob = new Blob([jsonText.value + "\n"], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `customer_lookup_${environment.value.toLowerCase()}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

onMounted(load);
</script>

<template>
  <div>
    <n-form-item label="Ambiente" style="margin-bottom: 0.75rem; max-width: 280px">
      <n-select
        :value="environment"
        :options="envOptions"
        @update:value="onEnvChange"
      />
    </n-form-item>

    <n-alert :type="freshness.type" :bordered="false" style="margin-bottom: 0.75rem">
      <div style="font-weight: 600">{{ freshness.title }}</div>
      <div style="margin-top: 0.2rem; line-height: 1.4">{{ freshness.detail }}</div>
      <div v-if="meta.note" style="margin-top: 0.35rem; opacity: 0.9">
        Nota: {{ meta.note }}
      </div>
    </n-alert>

    <n-alert type="info" :bordered="false" style="margin-bottom: 1rem">
      Hay un lookup por ambiente. <strong>GetOrder → Excel</strong> usa el archivo del ambiente
      que elijas ahí (PROD o UAT). El <em>customer code</em> es el sufijo del order id (ej. JBLCOWL180).
      <span v-if="pathHint" style="display: block; margin-top: 0.35rem; opacity: 0.85; font-size: 0.85rem">
        Archivo: {{ pathHint }}
      </span>
    </n-alert>

    <n-form-item label="Nota del cambio (opcional)" style="margin-bottom: 0.75rem">
      <n-input
        v-model:value="note"
        placeholder="Ej. Agregado JBLECB2B UAT — Julio 2026"
        @update:value="markDirty"
      />
    </n-form-item>

    <n-space style="margin-bottom: 0.85rem" :wrap="true">
      <n-button :loading="loading" secondary @click="load">Recargar</n-button>
      <n-button type="primary" :loading="saving" :disabled="!dirty && !jsonMode" @click="save">
        Guardar {{ environment }}{{ dirty ? " *" : "" }}
      </n-button>
      <n-button secondary @click="addRow">Agregar fila</n-button>
      <n-button secondary @click="toggleJson">
        {{ jsonMode ? "Volver a tabla" : "Editar JSON" }}
      </n-button>
      <n-button secondary @click="downloadJson">Descargar JSON</n-button>
      <span style="align-self: center; color: var(--muted, #667); font-size: 0.875rem">
        {{ environment }} · {{ count }} customer(s){{ dirty ? " · sin guardar" : "" }}
      </span>
    </n-space>

    <template v-if="jsonMode">
      <n-input
        v-model:value="jsonText"
        type="textarea"
        :rows="18"
        class="mono"
        @update:value="markDirty"
      />
      <n-space style="margin-top: 0.75rem">
        <n-button secondary @click="applyJsonToRows">Aplicar JSON → tabla</n-button>
      </n-space>
    </template>

    <n-data-table
      v-else
      :columns="columns"
      :data="rows"
      :bordered="true"
      size="small"
      :loading="loading"
      :scroll-x="900"
      :max-height="480"
      :pagination="false"
    />
  </div>
</template>
