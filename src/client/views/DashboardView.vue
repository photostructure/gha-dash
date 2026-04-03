<script setup lang="ts">
import { inject } from "vue";
import type { useWorkflows } from "../composables/useWorkflows";
import ErrorBanner from "../components/ErrorBanner.vue";
import WorkflowTable from "../components/WorkflowTable.vue";

const workflows = inject<ReturnType<typeof useWorkflows>>("workflows")!;
</script>

<template>
  <div class="dashboard">
    <ErrorBanner :errors="workflows.errors.value" />
    <WorkflowTable
      :groups="workflows.groups.value"
      :refreshing-repo="workflows.refreshingRepo.value"
      @refresh-repo="workflows.refreshRepo"
    />
  </div>
</template>
