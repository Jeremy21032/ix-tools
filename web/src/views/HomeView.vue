<script setup>
import { computed } from "vue";
import { useRoute, RouterLink } from "vue-router";
import { NSpace, NTag, NEmpty, NIcon } from "naive-ui";
import {
  PaperPlaneOutline,
  DocumentTextOutline,
  SearchOutline,
  CartOutline,
  ListOutline,
  GridOutline,
  CreateOutline,
  CubeOutline,
  GitCompareOutline,
  SearchCircleOutline,
  CodeSlashOutline,
  SwapHorizontalOutline,
  DownloadOutline,
  GitNetworkOutline,
  ImagesOutline,
  IdCardOutline,
} from "@vicons/ionicons5";
import { tools, CATEGORIES } from "../tools/registry";

const ICONS = {
  Send: PaperPlaneOutline,
  DocumentText: DocumentTextOutline,
  Search: SearchOutline,
  Cart: CartOutline,
  List: ListOutline,
  Grid: GridOutline,
  Create: CreateOutline,
  Cube: CubeOutline,
  GitCompare: GitCompareOutline,
  SearchCircle: SearchCircleOutline,
  CodeSlash: CodeSlashOutline,
  SwapHorizontal: SwapHorizontalOutline,
  Download: DownloadOutline,
  GitNetwork: GitNetworkOutline,
  Images: ImagesOutline,
  IdCard: IdCardOutline,
};

const route = useRoute();
const q = computed(() => String(route.query.q || "").toLowerCase().trim());
const category = computed(() => String(route.query.cat || ""));

const filtered = computed(() =>
  tools.filter((t) => {
    if (category.value && t.category !== category.value) return false;
    if (!q.value) return true;
    return `${t.title} ${t.description} ${t.help || ""} ${t.slug}`.toLowerCase().includes(q.value);
  })
);

const byCategory = computed(() =>
  CATEGORIES.map((c) => ({
    ...c,
    tools: filtered.value.filter((t) => t.category === c.id),
  })).filter((c) => c.tools.length)
);
</script>

<template>
  <div>
    <div style="margin-bottom: 1.75rem">
      <h1 style="margin: 0 0 0.4rem; font-size: clamp(1.6rem, 3vw, 2.1rem); font-weight: 700">
        All the tools
      </h1>
      <p style="margin: 0; color: var(--muted); max-width: 640px">
        Kit interno IXC. Cada card resume para qué sirve; al entrar ves el detalle completo.
      </p>
    </div>

    <n-space style="margin-bottom: 1.5rem" :wrap="true">
      <router-link :to="{ query: { q: route.query.q } }">
        <n-tag :type="!category ? 'success' : 'default'" round :bordered="false">Todas</n-tag>
      </router-link>
      <router-link
        v-for="c in CATEGORIES"
        :key="c.id"
        :to="{ query: { cat: c.id, q: route.query.q } }"
      >
        <n-tag :type="category === c.id ? 'success' : 'default'" round :bordered="false">
          {{ c.label }}
        </n-tag>
      </router-link>
    </n-space>

    <n-empty v-if="!byCategory.length" description="Sin resultados" />

    <section v-for="group in byCategory" :key="group.id" style="margin-bottom: 2rem">
      <h2
        style="
          font-size: 0.8rem;
          text-transform: uppercase;
          letter-spacing: 0.06em;
          color: var(--muted);
          margin: 0 0 0.85rem;
        "
      >
        {{ group.label }}
      </h2>
      <div
        style="display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 1rem"
      >
        <RouterLink
          v-for="t in group.tools"
          :key="t.slug"
          :to="'/tools/' + t.slug"
          class="tool-card"
        >
          <div class="tool-card__icon">
            <n-icon :component="ICONS[t.icon] || DocumentTextOutline" :size="22" />
          </div>
          <h3 class="tool-card__title">{{ t.title }}</h3>
          <p class="tool-card__desc">{{ t.description }}</p>
        </RouterLink>
      </div>
    </section>
  </div>
</template>
