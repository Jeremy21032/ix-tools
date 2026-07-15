import { createRouter, createWebHistory } from "vue-router";
import HomeView from "../views/HomeView.vue";
import ToolView from "../views/ToolView.vue";

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: "/", name: "home", component: HomeView },
    { path: "/tools/:slug", name: "tool", component: ToolView, props: true },
  ],
  scrollBehavior() {
    return { top: 0 };
  },
});

export default router;
