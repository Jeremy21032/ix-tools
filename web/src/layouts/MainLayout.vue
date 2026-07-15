<script setup>
import { inject, watch, onMounted } from "vue";
import { useRoute, useRouter } from "vue-router";
import {
  NLayout,
  NLayoutHeader,
  NLayoutContent,
  NSpace,
  NButton,
  NIcon,
  NInput,
} from "naive-ui";
import { SunnyOutline, MoonOutline, HomeOutline } from "@vicons/ionicons5";

const isDark = inject("isDark");
const toggleTheme = inject("toggleTheme");
const route = useRoute();
const router = useRouter();

const syncHtmlClass = () => {
  document.documentElement.classList.toggle("dark", isDark.value);
};
onMounted(syncHtmlClass);
watch(isDark, syncHtmlClass);

const onSearch = (v) => {
  if (route.name !== "home") router.push({ name: "home", query: { q: v } });
  else router.replace({ query: { ...route.query, q: v || undefined } });
};
</script>

<template>
  <n-layout style="min-height: 100vh; background: var(--bg)">
    <n-layout-header
      bordered
      style="
        height: 64px;
        padding: 0 1.25rem;
        display: flex;
        align-items: center;
        background: var(--bg-elevated);
      "
    >
      <n-space align="center" justify="space-between" style="width: 100%">
        <router-link to="/" style="display: flex; align-items: center; gap: 10px">
          <div
            style="
              width: 32px;
              height: 32px;
              border-radius: 9px;
              background: linear-gradient(135deg, #0d9488, #0ea5e9);
              display: flex;
              align-items: center;
              justify-content: center;
              color: #fff;
              font-weight: 700;
              font-size: 13px;
            "
          >
            IX
          </div>
          <div>
            <div style="font-weight: 700; font-size: 1.1rem; line-height: 1.1">IX Tools</div>
            <div style="font-size: 11px; color: var(--muted)">Ops utilities</div>
          </div>
        </router-link>
        <n-space align="center">
          <n-input
            v-if="route.name === 'home'"
            clearable
            placeholder="Buscar tools..."
            style="width: min(320px, 40vw)"
            :default-value="route.query.q || ''"
            @update:value="onSearch"
          />
          <n-button quaternary circle @click="router.push('/')">
            <template #icon><n-icon :component="HomeOutline" /></template>
          </n-button>
          <n-button quaternary circle @click="toggleTheme()">
            <template #icon>
              <n-icon :component="isDark ? SunnyOutline : MoonOutline" />
            </template>
          </n-button>
        </n-space>
      </n-space>
    </n-layout-header>
    <n-layout-content
      style="padding: 1.5rem 1.25rem 3rem; max-width: 1100px; margin: 0 auto; width: 100%"
    >
      <RouterView />
    </n-layout-content>
  </n-layout>
</template>
