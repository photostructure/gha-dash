<script setup lang="ts">
import { ref } from "vue";
import type { WorkflowRun } from "../../types.js";
import { formatDuration, relativeTime } from "../../types.js";
import DispatchForm from "./DispatchForm.vue";
import StatusBadge from "./StatusBadge.vue";

defineProps<{ run: WorkflowRun; canPush: boolean }>();

const showDispatch = ref(false);

function workflowUrl(run: WorkflowRun): string {
  const file = run.workflowPath.split("/").pop();
  return `https://github.com/${run.repo}/actions/workflows/${file}`;
}
</script>

<template>
  <tr :data-repo="run.repo">
    <td>
      <a :href="workflowUrl(run)" target="_blank" rel="noopener">{{
        run.workflowName
      }}</a>
    </td>
    <td>
      <code>{{ run.branch }}</code>
    </td>
    <td><StatusBadge :run="run" /></td>
    <td>
      <code>{{ run.commitSha }}</code>
    </td>
    <td class="message-col">
      <a :href="run.htmlUrl" target="_blank" rel="noopener">{{
        run.commitMessage
      }}</a>
    </td>
    <td :title="new Date(run.createdAt).toLocaleString()">
      {{ relativeTime(run.createdAt) }}
    </td>
    <td>{{ formatDuration(run.duration) }}</td>
    <td class="actions-col">
      <button
        type="button"
        class="btn-dispatch"
        :title="showDispatch ? 'Close dispatch' : 'Run workflow'"
        :aria-label="`Run ${run.workflowName}`"
        @click="showDispatch = !showDispatch"
      >
        &#x25B6;
      </button>
    </td>
  </tr>
  <tr v-if="showDispatch" class="dispatch-row" :data-repo="run.repo">
    <td colspan="8">
      <DispatchForm v-if="canPush" :run="run" @close="showDispatch = false" />
      <div v-else class="dispatch-form">
        <div class="dispatch-result dispatch-error">
          Your <code>gh</code> CLI token does not have write access to
          <strong>{{ run.repo }}</strong
          >. Run <code>gh auth refresh -s workflow</code> to add the workflow
          scope.
        </div>
        <button
          type="button"
          class="btn"
          @click="showDispatch = false"
          style="margin-top: 8px"
        >
          Close
        </button>
      </div>
    </td>
  </tr>
</template>
