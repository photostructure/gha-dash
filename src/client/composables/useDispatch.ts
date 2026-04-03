import { ref } from "vue";
import type { WorkflowDispatchInfo } from "../../types.js";

export interface DispatchInfo extends WorkflowDispatchInfo {
  defaultBranch: string;
}

export interface DispatchResult {
  success: boolean;
  message: string;
  runUrl?: string;
}

export function useDispatch() {
  const loading = ref(false);
  const submitting = ref(false);
  const info = ref<DispatchInfo | null>(null);
  const result = ref<DispatchResult | null>(null);
  const error = ref<string | null>(null);

  async function loadInfo(owner: string, repo: string, workflowId: number) {
    loading.value = true;
    info.value = null;
    result.value = null;
    error.value = null;
    try {
      const res = await fetch(`/api/dispatch/${owner}/${repo}/${workflowId}`);
      if (!res.ok) {
        const body = await res.json();
        error.value = body.error ?? "Failed to load dispatch info";
        return;
      }
      info.value = await res.json();
    } catch (err) {
      error.value = (err as Error).message;
    } finally {
      loading.value = false;
    }
  }

  async function trigger(
    owner: string,
    repo: string,
    workflowId: number,
    ref_: string,
    inputs: Record<string, string>,
  ) {
    submitting.value = true;
    result.value = null;
    try {
      const res = await fetch(`/api/dispatch/${owner}/${repo}/${workflowId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ref: ref_, ...inputs }),
      });
      result.value = await res.json();
    } catch (err) {
      result.value = { success: false, message: (err as Error).message };
    } finally {
      submitting.value = false;
    }
  }

  return { loading, submitting, info, result, error, loadInfo, trigger };
}
