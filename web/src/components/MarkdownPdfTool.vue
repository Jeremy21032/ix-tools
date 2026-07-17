<script setup>
import { computed, nextTick, ref } from "vue";
import {
  NButton,
  NSpace,
  NInput,
  NUpload,
  NAlert,
  useMessage,
} from "naive-ui";
import { marked } from "marked";
import DOMPurify from "dompurify";

const message = useMessage();

const SOURCE_PLACEHOLDER = `# Título

Pegá o subí un \`.md\`…

## Lista
- item A
- item B

\`\`\`js
console.log("hola");
\`\`\`
`;

const markdown = ref("");
const fileName = ref("documento.md");
const exporting = ref(false);
const previewEl = ref(null);

marked.setOptions({
  gfm: true,
  breaks: true,
});

const previewHtml = computed(() => {
  const raw = markdown.value.trim() ? marked.parse(markdown.value) : "";
  return DOMPurify.sanitize(typeof raw === "string" ? raw : String(raw), {
    USE_PROFILES: { html: true },
  });
});

const hasContent = computed(() => Boolean(markdown.value.trim()));

async function loadFile(options) {
  const file = options.file.file;
  try {
    const text = await file.text();
    markdown.value = text;
    fileName.value = file.name?.replace(/\.md$/i, "") || "documento";
    options.onFinish();
    message.success(`Cargado ${file.name}`);
  } catch (e) {
    options.onError();
    message.error(e.message || "No se pudo leer el archivo");
  }
}

function clearAll() {
  markdown.value = "";
  fileName.value = "documento";
}

function downloadMd() {
  if (!hasContent.value) return;
  const name = fileName.value.endsWith(".md") ? fileName.value : `${fileName.value}.md`;
  const blob = new Blob([markdown.value], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

async function exportPdf() {
  if (!hasContent.value) {
    message.warning("Pegá o cargá un Markdown primero");
    return;
  }
  exporting.value = true;
  try {
    await nextTick();
    const el = previewEl.value;
    if (!el) throw new Error("Preview no disponible");

    const html2pdf = (await import("html2pdf.js")).default;
    const outName = `${fileName.value.replace(/\.md$/i, "") || "documento"}.pdf`;

    // Clone into offscreen container so page chrome doesn't appear in PDF
    const clone = el.cloneNode(true);
    clone.classList.add("md-pdf-export");
    const wrap = document.createElement("div");
    wrap.style.cssText =
      "position:fixed;left:-10000px;top:0;width:794px;padding:24px;background:#fff;color:#111;";
    wrap.appendChild(clone);
    document.body.appendChild(wrap);

    await html2pdf()
      .set({
        margin: [12, 12, 12, 12],
        filename: outName,
        image: { type: "jpeg", quality: 0.96 },
        html2canvas: { scale: 2, useCORS: true, logging: false },
        jsPDF: { unit: "mm", format: "a4", orientation: "portrait" },
        pagebreak: { mode: ["css", "legacy"] },
      })
      .from(wrap)
      .save();

    document.body.removeChild(wrap);
    message.success(`PDF: ${outName}`);
  } catch (e) {
    console.error(e);
    message.error(e.message || "No se pudo exportar el PDF");
  } finally {
    exporting.value = false;
  }
}
</script>

<template>
  <div class="md-tool">
    <n-alert type="info" :bordered="false" style="margin-bottom: 1rem">
      Cargá o pegá Markdown (GFM), previsualizá a la derecha y exportá a PDF (A4).
      Ideal para README, runbooks o notas de release.
    </n-alert>

    <n-space style="margin-bottom: 0.85rem" :wrap="true" align="center">
      <n-upload
        :max="1"
        accept=".md,.markdown,text/markdown,text/plain"
        :show-file-list="false"
        :custom-request="loadFile"
      >
        <n-button secondary>Subir .md</n-button>
      </n-upload>
      <n-input
        v-model:value="fileName"
        placeholder="nombre-archivo"
        style="width: 200px"
        size="small"
      />
      <n-button type="primary" :loading="exporting" :disabled="!hasContent" @click="exportPdf">
        Exportar PDF
      </n-button>
      <n-button secondary :disabled="!hasContent" @click="downloadMd">Descargar .md</n-button>
      <n-button quaternary @click="clearAll">Limpiar</n-button>
    </n-space>

    <div class="md-split">
      <div class="md-pane">
        <div class="md-pane-head">Markdown</div>
        <n-input
          v-model:value="markdown"
          type="textarea"
          :placeholder="SOURCE_PLACEHOLDER"
          :rows="22"
          class="mono md-editor"
        />
      </div>
      <div class="md-pane">
        <div class="md-pane-head">Preview</div>
        <div v-if="!hasContent" class="md-preview md-preview--empty">
          La vista previa aparece acá.
        </div>
        <div v-else ref="previewEl" class="md-preview" v-html="previewHtml" />
      </div>
    </div>
  </div>
</template>

<style scoped>
.md-tool {
  width: 100%;
}
.md-split {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 1rem;
  align-items: stretch;
}
@media (max-width: 960px) {
  .md-split {
    grid-template-columns: 1fr;
  }
}
.md-pane-head {
  font-size: 0.75rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--muted, #667);
  margin-bottom: 0.4rem;
}
.md-editor :deep(textarea) {
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 13px;
  line-height: 1.45;
}
.md-preview {
  min-height: 420px;
  max-height: min(70vh, 640px);
  overflow: auto;
  padding: 1rem 1.15rem;
  border: 1px solid var(--border, #e5e7eb);
  border-radius: 8px;
  background: #fff;
  color: #1a1a1a;
  line-height: 1.55;
  font-size: 0.95rem;
}
.md-preview--empty {
  color: #94a3b8;
  display: flex;
  align-items: flex-start;
}
.md-preview :deep(h1),
.md-preview :deep(h2),
.md-preview :deep(h3) {
  margin: 1.1em 0 0.45em;
  line-height: 1.25;
  font-weight: 700;
}
.md-preview :deep(h1) {
  font-size: 1.55rem;
  border-bottom: 1px solid #e5e7eb;
  padding-bottom: 0.3rem;
}
.md-preview :deep(h2) {
  font-size: 1.25rem;
}
.md-preview :deep(h3) {
  font-size: 1.05rem;
}
.md-preview :deep(p),
.md-preview :deep(ul),
.md-preview :deep(ol) {
  margin: 0.55em 0;
}
.md-preview :deep(ul),
.md-preview :deep(ol) {
  padding-left: 1.4em;
}
.md-preview :deep(code) {
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 0.88em;
  background: #f1f5f9;
  padding: 0.1em 0.35em;
  border-radius: 4px;
}
.md-preview :deep(pre) {
  background: #0f172a;
  color: #e2e8f0;
  padding: 0.85rem 1rem;
  border-radius: 8px;
  overflow: auto;
  font-size: 0.82rem;
}
.md-preview :deep(pre code) {
  background: transparent;
  padding: 0;
  color: inherit;
}
.md-preview :deep(blockquote) {
  margin: 0.75em 0;
  padding: 0.25em 0 0.25em 0.9em;
  border-left: 3px solid #94a3b8;
  color: #475569;
}
.md-preview :deep(table) {
  border-collapse: collapse;
  width: 100%;
  margin: 0.75em 0;
  font-size: 0.9rem;
}
.md-preview :deep(th),
.md-preview :deep(td) {
  border: 1px solid #e2e8f0;
  padding: 0.4rem 0.6rem;
  text-align: left;
}
.md-preview :deep(th) {
  background: #f8fafc;
}
.md-preview :deep(a) {
  color: #2563eb;
}
.md-preview :deep(hr) {
  border: none;
  border-top: 1px solid #e5e7eb;
  margin: 1.25em 0;
}
.md-preview :deep(img) {
  max-width: 100%;
  height: auto;
}
</style>
