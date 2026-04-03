<script setup lang="ts">
import { provide } from "vue";
import AppHeader from "./components/AppHeader.vue";
import { useWorkflows } from "./composables/useWorkflows";

const workflows = useWorkflows();

// Provide to child components so DashboardView doesn't need its own instance
provide("workflows", workflows);
</script>

<template>
  <AppHeader
    :rate-limit="workflows.rateLimit.value"
    :refreshing="workflows.refreshing.value"
    @refresh-all="workflows.refreshAll"
  />
  <main>
    <router-view />
  </main>
</template>
