<script setup lang="ts">
import { useRoute } from "vue-router";
import RateLimitBadge from "./RateLimitBadge.vue";
import RefreshIcon from "./RefreshIcon.vue";
import type { RateLimitInfo } from "../composables/useWorkflows";

defineProps<{
  rateLimit?: RateLimitInfo | null;
  refreshing?: boolean;
}>();

const emit = defineEmits<{ refreshAll: [] }>();
const route = useRoute();
</script>

<template>
  <header>
    <h1><router-link to="/">gha-dash</router-link></h1>
    <nav>
      <template v-if="route.path === '/settings'">
        <router-link to="/">&larr; Dashboard</router-link>
      </template>
      <template v-else>
        <RateLimitBadge :rate-limit="rateLimit ?? null" />
        <button
          type="button"
          class="btn-refresh-all"
          :class="{ spinning: refreshing }"
          title="Refresh all repos"
          @click="emit('refreshAll')"
        >
          <RefreshIcon />
          Refresh
        </button>
        <router-link to="/settings">&#9881; Settings</router-link>
      </template>
    </nav>
  </header>
</template>
