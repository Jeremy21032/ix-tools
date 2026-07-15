<script setup>
import { computed, h, ref, watch } from "vue";
import {
  NSpace,
  NButton,
  NSwitch,
  NAlert,
  NTag,
  NUpload,
  NDataTable,
  NInput,
  useMessage,
} from "naive-ui";
import { compareJsonTexts } from "../tools/jsonDiff";

const message = useMessage();

const leftText = ref("");
const rightText = ref("");
const sortKeys = ref(true);
const ignoreArrayOrder = ref(false);
const result = ref(null);
const error = ref("");

const counts = computed(() => result.value?.summary || { added: 0, removed: 0, changed: 0, total: 0 });

const KIND_META = {
  added: { type: "success", label: "Added" },
  removed: { type: "error", label: "Removed" },
  changed: { type: "warning", label: "Changed" },
};

const tableColumns = [
  {
    title: "Tipo",
    key: "kind",
    width: 110,
    render(row) {
      const m = KIND_META[row.kind] || { type: "default", label: row.kind };
      return h(NTag, { type: m.type, size: "small", bordered: false }, { default: () => m.label });
    },
  },
  { title: "Path", key: "path", ellipsis: { tooltip: true }, minWidth: 180 },
  { title: "Left (A)", key: "left", ellipsis: { tooltip: true }, minWidth: 160 },
  { title: "Right (B)", key: "right", ellipsis: { tooltip: true }, minWidth: 160 },
];

const tableRows = computed(() =>
  (result.value?.diffs || []).map((d, i) => ({
    key: String(i),
    ...d,
  }))
);

function compare() {
  error.value = "";
  result.value = null;
  if (!leftText.value.trim() || !rightText.value.trim()) {
    error.value = "Pegá o subí JSON en ambos lados (A y B).";
    return;
  }
  const r = compareJsonTexts(leftText.value, rightText.value, {
    sortKeys: sortKeys.value,
    ignoreArrayOrder: ignoreArrayOrder.value,
  });
  if (!r.ok) {
    error.value = r.error;
    message.error(r.error);
    return;
  }
  result.value = r;
  if (r.summary.total === 0) message.success("Sin diferencias");
  else message.info(`${r.summary.total} diferencia(s)`);
}

async function loadFile(side, options) {
  const file = options.file.file;
  try {
    const text = await file.text();
    if (side === "left") leftText.value = text;
    else rightText.value = text;
    options.onFinish();
    message.success(`Cargado ${file.name}`);
  } catch (e) {
    options.onError();
    message.error(e.message || "No se pudo leer el archivo");
  }
}

function swap() {
  const t = leftText.value;
  leftText.value = rightText.value;
  rightText.value = t;
  if (result.value) compare();
}

function clearAll() {
  leftText.value = "";
  rightText.value = "";
  result.value = null;
  error.value = "";
}

function downloadReport() {
  if (!result.value) return;
  const lines = [
    "kind\tpath\tleft\tright",
    ...result.value.diffs.map(
      (d) =>
        `${d.kind}\t${d.path}\t${String(d.left).replace(/\t/g, " ")}\t${String(d.right).replace(/\t/g, " ")}`
    ),
  ];
  const blob = new Blob([lines.join("\n")], { type: "text/tab-separated-values;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "json-diff.tsv";
  a.click();
  URL.revokeObjectURL(url);
}

async function copyDiffs() {
  if (!result.value?.diffs?.length) return;
  const text = result.value.diffs
    .map((d) => `${d.kind}\t${d.path}\t${d.left}\t${d.right}`)
    .join("\n");
  try {
    await navigator.clipboard.writeText(text);
    message.success("Diffs copiados");
  } catch (e) {
    message.error(e.message || "No se pudo copiar");
  }
}

watch([sortKeys, ignoreArrayOrder], () => {
  if (result.value && leftText.value.trim() && rightText.value.trim()) compare();
});

const kindClass = {
  same: "jd-same",
  added: "jd-added",
  removed: "jd-removed",
  changed: "jd-changed",
};
</script>

<template>
  <div class="json-diff">
    <n-space align="center" style="margin-bottom: 1rem" :wrap="true">
      <n-space align="center">
        <span class="opt-label">Ordenar keys</span>
        <n-switch v-model:value="sortKeys" />
      </n-space>
      <n-space align="center">
        <span class="opt-label">Ignorar orden de arrays</span>
        <n-switch v-model:value="ignoreArrayOrder" />
      </n-space>
      <n-button type="primary" @click="compare">Comparar</n-button>
      <n-button secondary @click="swap">Intercambiar A ↔ B</n-button>
      <n-button quaternary @click="clearAll">Limpiar</n-button>
    </n-space>

    <div class="panels">
      <div class="panel">
        <div class="panel-head">
          <strong>Left (A)</strong>
          <n-upload :max="1" accept=".json,application/json,text/plain" :custom-request="(o) => loadFile('left', o)">
            <n-button size="tiny" secondary>Subir .json</n-button>
          </n-upload>
        </div>
        <n-input
          v-model:value="leftText"
          type="textarea"
          :rows="14"
          placeholder='Pegá JSON aquí…&#10;{ "a": 1 }'
          class="mono"
        />
      </div>
      <div class="panel">
        <div class="panel-head">
          <strong>Right (B)</strong>
          <n-upload :max="1" accept=".json,application/json,text/plain" :custom-request="(o) => loadFile('right', o)">
            <n-button size="tiny" secondary>Subir .json</n-button>
          </n-upload>
        </div>
        <n-input
          v-model:value="rightText"
          type="textarea"
          :rows="14"
          placeholder='Pegá JSON aquí…&#10;{ "a": 2 }'
          class="mono"
        />
      </div>
    </div>

    <n-alert v-if="error" type="error" style="margin-top: 1rem" :bordered="false">
      {{ error }}
    </n-alert>

    <template v-if="result">
      <n-space style="margin: 1.25rem 0 0.75rem" :wrap="true" align="center">
        <n-tag :type="counts.total === 0 ? 'success' : 'warning'" round>
          {{ counts.total === 0 ? "Idénticos" : `${counts.total} diferencia(s)` }}
        </n-tag>
        <n-tag type="error" :bordered="false">− {{ counts.removed }} removed</n-tag>
        <n-tag type="success" :bordered="false">+ {{ counts.added }} added</n-tag>
        <n-tag type="warning" :bordered="false">~ {{ counts.changed }} changed</n-tag>
        <n-button v-if="counts.total" size="small" secondary @click="copyDiffs">Copiar lista</n-button>
        <n-button v-if="counts.total" size="small" secondary type="success" @click="downloadReport">
          Descargar TSV
        </n-button>
      </n-space>

      <div class="legend">
        <span class="lg jd-removed">removed</span>
        <span class="lg jd-added">added</span>
        <span class="lg jd-changed">changed</span>
      </div>

      <div class="side-by-side">
        <div class="side-head">
          <span>A (pretty)</span>
          <span>B (pretty)</span>
        </div>
        <!-- Un solo scroll: ambas columnas avanzan siempre juntas -->
        <div class="side-scroll">
          <div
            v-for="(row, idx) in result.rows"
            :key="'R' + idx"
            class="pair"
            :class="kindClass[row.kind]"
          >
            <div class="cell" :class="{ empty: row.left == null }">
              <span class="ln">{{ row.left != null ? idx + 1 : "" }}</span>
              <code>{{ row.left ?? "" }}</code>
            </div>
            <div class="cell" :class="{ empty: row.right == null }">
              <span class="ln">{{ row.right != null ? idx + 1 : "" }}</span>
              <code>{{ row.right ?? "" }}</code>
            </div>
          </div>
        </div>
      </div>

      <div v-if="tableRows.length" style="margin-top: 1.25rem">
        <div style="font-weight: 600; margin-bottom: 0.5rem">Lista de paths</div>
        <n-data-table
          :columns="tableColumns"
          :data="tableRows"
          size="small"
          :bordered="true"
          :max-height="360"
          :scroll-x="900"
          :pagination="{ pageSize: 25 }"
        />
      </div>
    </template>
  </div>
</template>

<style scoped>
.json-diff {
  width: 100%;
}
.opt-label {
  font-size: 0.875rem;
  color: var(--muted, #667);
}
.panels {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 1rem;
}
@media (max-width: 900px) {
  .panels {
    grid-template-columns: 1fr;
  }
}
.panel-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 0.4rem;
}
.legend {
  display: flex;
  gap: 0.75rem;
  margin-bottom: 0.5rem;
  font-size: 0.75rem;
}
.lg {
  padding: 0.15rem 0.45rem;
  border-radius: 4px;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
}
.side-by-side {
  border: 1px solid var(--border, #e5e7eb);
  border-radius: 8px;
  overflow: hidden;
  background: #0f1419;
}
.side-head {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 1px;
  background: #1a2332;
  color: #9aa4b2;
  font-size: 0.75rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}
.side-head span {
  padding: 0.45rem 0.75rem;
}
.side-scroll {
  overflow: auto;
  max-height: min(60vh, 560px);
  background: #0f1419;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 12px;
  line-height: 1.45;
}
.pair {
  display: grid;
  grid-template-columns: 1fr 1fr;
  min-height: 1.45em;
  border-bottom: 1px solid rgba(26, 35, 50, 0.6);
}
.pair .cell:first-child {
  border-right: 1px solid #1a2332;
}
.cell {
  display: flex;
  white-space: pre;
  min-width: 0;
  background: inherit;
}
.cell.empty {
  opacity: 0.35;
}
.cell .ln {
  flex: 0 0 3rem;
  text-align: right;
  padding: 0 0.65rem 0 0.35rem;
  color: #5c6b7a;
  user-select: none;
  border-right: 1px solid #1a2332;
}
.cell code {
  flex: 1;
  padding: 0 0.5rem;
  color: #d7dee8;
  font-family: inherit;
  font-size: inherit;
  overflow: visible;
}
.jd-same {
  background: transparent;
}
.jd-removed {
  background: rgba(239, 68, 68, 0.22);
}
.jd-removed code {
  color: #fecaca;
}
.jd-added {
  background: rgba(34, 197, 94, 0.2);
}
.jd-added code {
  color: #bbf7d0;
}
.jd-changed {
  background: rgba(234, 179, 8, 0.22);
}
.jd-changed code {
  color: #fef08a;
}
.lg.jd-removed {
  background: rgba(239, 68, 68, 0.25);
  color: #991b1b;
}
.lg.jd-added {
  background: rgba(34, 197, 94, 0.25);
  color: #166534;
}
.lg.jd-changed {
  background: rgba(234, 179, 8, 0.3);
  color: #854d0e;
}
</style>
