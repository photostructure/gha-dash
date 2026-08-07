import { onMounted, ref } from "vue";
import type { AppConfig } from "../../types.js";

export function useConfig() {
  const config = ref<AppConfig | null>(null);
  const loading = ref(false);
  const saving = ref(false);
  const refreshingRepos = ref(false);
  const repoRefreshError = ref<string | null>(null);

  async function fetchConfig() {
    loading.value = true;
    try {
      const res = await fetch("/api/config");
      config.value = await res.json();
    } catch (err) {
      console.error("Failed to fetch config:", err);
    } finally {
      loading.value = false;
    }
  }

  async function saveConfig(updates: Partial<AppConfig>): Promise<boolean> {
    saving.value = true;
    try {
      const res = await fetch("/api/config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
      });
      config.value = await res.json();
      return true;
    } catch (err) {
      console.error("Failed to save config:", err);
      return false;
    } finally {
      saving.value = false;
    }
  }

  async function refreshAvailableRepos(): Promise<boolean> {
    refreshingRepos.value = true;
    repoRefreshError.value = null;
    try {
      const res = await fetch("/api/config/repos/refresh", { method: "POST" });
      if (!res.ok) {
        const body = (await res.json()) as { error?: string };
        throw new Error(body.error ?? `Request failed (${res.status})`);
      }
      config.value = await res.json();
      return true;
    } catch (err) {
      repoRefreshError.value = (err as Error).message;
      return false;
    } finally {
      refreshingRepos.value = false;
    }
  }

  onMounted(fetchConfig);

  return {
    config,
    loading,
    saving,
    refreshingRepos,
    repoRefreshError,
    fetchConfig,
    saveConfig,
    refreshAvailableRepos,
  };
}
