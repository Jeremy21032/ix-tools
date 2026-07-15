<script setup>
import { computed, ref, watch, provide } from "vue";
import {
  NConfigProvider,
  NMessageProvider,
  NDialogProvider,
  NGlobalStyle,
  darkTheme,
} from "naive-ui";
import MainLayout from "./layouts/MainLayout.vue";

const isDark = ref(
  localStorage.getItem("ix-theme") === "dark" ||
    (!localStorage.getItem("ix-theme") &&
      window.matchMedia("(prefers-color-scheme: dark)").matches)
);

watch(isDark, (v) => localStorage.setItem("ix-theme", v ? "dark" : "light"));
provide("isDark", isDark);
provide("toggleTheme", () => {
  isDark.value = !isDark.value;
});

const theme = computed(() => (isDark.value ? darkTheme : null));
const themeOverrides = {
  common: {
    fontFamily: "'DM Sans', system-ui, sans-serif",
    fontFamilyMono: "'JetBrains Mono', monospace",
    primaryColor: "#0d9488",
    primaryColorHover: "#14b8a6",
    primaryColorPressed: "#0f766e",
    borderRadius: "10px",
  },
};
</script>

<template>
  <n-config-provider :theme="theme" :theme-overrides="themeOverrides">
    <n-global-style />
    <n-message-provider>
      <n-dialog-provider>
        <MainLayout />
      </n-dialog-provider>
    </n-message-provider>
  </n-config-provider>
</template>
