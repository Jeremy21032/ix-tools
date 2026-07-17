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

const PDF_CSS = `
  :root { color-scheme: light; }
  * { box-sizing: border-box; }
  html, body {
    margin: 0;
    padding: 0;
    background: #ffffff !important;
    color: #111111 !important;
  }
  body {
    font-family: Georgia, "Times New Roman", serif;
    font-size: 14px;
    line-height: 1.55;
    padding: 24px 28px;
    max-width: 800px;
  }
  h1, h2, h3 {
    font-family: system-ui, -apple-system, Segoe UI, sans-serif;
    line-height: 1.25;
    margin: 1.1em 0 0.45em;
    color: #111 !important;
  }
  h1 {
    font-size: 22px;
    border-bottom: 1px solid #ddd;
    padding-bottom: 6px;
    margin-top: 0;
  }
  h2 { font-size: 18px; }
  h3 { font-size: 15px; }
  p, ul, ol { margin: 0.55em 0; }
  ul, ol { padding-left: 1.4em; }
  code {
    font-family: ui-monospace, Consolas, monospace;
    font-size: 0.88em;
    background: #f1f5f9;
    padding: 0.1em 0.35em;
    border-radius: 4px;
    color: #111 !important;
  }
  pre {
    background: #0f172a;
    color: #e2e8f0 !important;
    padding: 12px 14px;
    border-radius: 8px;
    overflow: visible;
    white-space: pre-wrap;
    word-break: break-word;
    font-size: 11px;
  }
  pre code {
    background: transparent;
    padding: 0;
    color: inherit !important;
  }
  blockquote {
    margin: 0.75em 0;
    padding-left: 12px;
    border-left: 3px solid #94a3b8;
    color: #334155 !important;
  }
  table {
    border-collapse: collapse;
    width: 100%;
    margin: 0.75em 0;
    font-size: 12px;
  }
  th, td {
    border: 1px solid #cbd5e1;
    padding: 6px 8px;
    text-align: left;
    color: #111 !important;
    background: #fff !important;
  }
  th { background: #f8fafc !important; }
  a { color: #1d4ed8 !important; }
  hr {
    border: none;
    border-top: 1px solid #e5e7eb;
    margin: 1.25em 0;
  }
  img { max-width: 100%; height: auto; }
  @media print {
    body { padding: 0; max-width: none; }
    a[href]::after { content: ""; }
  }
`;

function buildPrintDocument(html) {
  const title = (fileName.value || "documento").replace(/\.md$/i, "");
  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <meta name="color-scheme" content="light" />
  <title>${title}</title>
  <style>${PDF_CSS}</style>
</head>
<body>${html}</body>
</html>`;
}

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

function canvasLooksBlank(canvas) {
  try {
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    const w = Math.min(canvas.width, 240);
    const h = Math.min(canvas.height, 240);
    if (w < 2 || h < 2) return true;
    const { data } = ctx.getImageData(0, 0, w, h);
    // Any non-near-white / non-transparent pixel counts as content
    for (let i = 0; i < data.length; i += 16) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      const a = data[i + 3];
      if (a > 8 && (r < 250 || g < 250 || b < 250)) return false;
    }
    return true;
  } catch {
    return false;
  }
}

function addCanvasToPdf(pdf, canvas) {
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const margin = 10;
  const usableW = pageWidth - margin * 2;
  const usableH = pageHeight - margin * 2;
  const imgW = usableW;
  const imgH = (canvas.height * imgW) / canvas.width;
  const imgData = canvas.toDataURL("image/jpeg", 0.95);

  let heightLeft = imgH;
  let position = margin;
  pdf.addImage(imgData, "JPEG", margin, position, imgW, imgH);
  heightLeft -= usableH;

  while (heightLeft > 1) {
    position = margin - (imgH - heightLeft);
    pdf.addPage();
    pdf.addImage(imgData, "JPEG", margin, position, imgW, imgH);
    heightLeft -= usableH;
  }
}

/** Fallback fiable: diálogo de impresión → Guardar como PDF */
function exportViaPrintDialog(html) {
  const docHtml = buildPrintDocument(html);
  const blob = new Blob([docHtml], { type: "text/html;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const win = window.open(url, "_blank", "noopener,noreferrer");
  if (!win) {
    URL.revokeObjectURL(url);
    throw new Error("El navegador bloqueó la ventana. Permití popups e intentá de nuevo.");
  }
  const trigger = () => {
    try {
      win.focus();
      win.print();
    } catch (e) {
      console.error(e);
    }
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  };
  // Esperar a que el documento cargue
  if (win.document.readyState === "complete") {
    setTimeout(trigger, 300);
  } else {
    win.addEventListener("load", () => setTimeout(trigger, 300));
    // Safari / algunos Chromium no disparan load en blob windows
    setTimeout(trigger, 800);
  }
  message.info('En el diálogo elegí impresora "Guardar como PDF" / "Microsoft Print to PDF"');
}

async function exportPdf() {
  if (!hasContent.value) {
    message.warning("Pegá o cargá un Markdown primero");
    return;
  }
  exporting.value = true;
  let iframe = null;
  try {
    await nextTick();
    const html = previewHtml.value;
    if (!html.trim()) throw new Error("No hay HTML para exportar");

    const outName = `${fileName.value.replace(/\.md$/i, "") || "documento"}.pdf`;
    const docHtml = buildPrintDocument(html);

    // Iframe visible (opacity 1): html2canvas falla con opacity baja / off-screen
    iframe = document.createElement("iframe");
    iframe.setAttribute("title", "md-pdf-export");
    iframe.style.cssText = [
      "position:fixed",
      "top:0",
      "left:0",
      "width:820px",
      "height:1100px",
      "border:0",
      "opacity:1",
      "background:#fff",
      "z-index:2147483646",
      "pointer-events:none",
    ].join(";");
    document.body.appendChild(iframe);

    const idoc = iframe.contentDocument || iframe.contentWindow?.document;
    if (!idoc) throw new Error("No se pudo crear el documento de exportación");

    idoc.open();
    idoc.write(docHtml);
    idoc.close();

    await new Promise((r) => setTimeout(r, 200));
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));

    const target = idoc.body;
    const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
      import("html2canvas"),
      import("jspdf"),
    ]);

    const canvas = await html2canvas(target, {
      scale: 2,
      useCORS: true,
      allowTaint: true,
      backgroundColor: "#ffffff",
      logging: false,
      windowWidth: 820,
      scrollX: 0,
      scrollY: 0,
      onclone: (clonedDoc) => {
        clonedDoc.documentElement.style.colorScheme = "light";
        clonedDoc.body.style.background = "#ffffff";
        clonedDoc.body.style.color = "#111111";
      },
    });

    if (canvasLooksBlank(canvas)) {
      // Fallback que sí funciona en dark mode / Render
      exportViaPrintDialog(html);
      return;
    }

    const pdf = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" });
    addCanvasToPdf(pdf, canvas);
    pdf.save(outName);
    message.success(`PDF: ${outName}`);
  } catch (e) {
    console.error(e);
    try {
      exportViaPrintDialog(previewHtml.value);
    } catch (e2) {
      message.error(e.message || e2.message || "No se pudo exportar el PDF");
    }
  } finally {
    if (iframe?.parentNode) iframe.parentNode.removeChild(iframe);
    exporting.value = false;
  }
}

function exportPdfPrintOnly() {
  if (!hasContent.value) {
    message.warning("Pegá o cargá un Markdown primero");
    return;
  }
  try {
    exportViaPrintDialog(previewHtml.value);
  } catch (e) {
    message.error(e.message || "No se pudo abrir la impresión");
  }
}
</script>

<template>
  <div class="md-tool">
    <n-alert type="info" :bordered="false" style="margin-bottom: 1rem">
      Cargá o pegá Markdown (GFM) y previsualizá a la derecha.
      <strong>Exportar PDF</strong> genera el archivo; si el navegador lo deja en blanco,
      usá <strong>Imprimir / Guardar PDF</strong> (elegí “Guardar como PDF” en el diálogo).
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
      <n-button secondary :disabled="!hasContent" @click="exportPdfPrintOnly">
        Imprimir / Guardar PDF
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
        <div v-else class="md-preview" v-html="previewHtml" />
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
