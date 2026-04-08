<script setup lang="ts">
import { onMounted, ref } from "vue";
import type { WorkflowRun } from "../../types.js";
import { useDispatch } from "../composables/useDispatch";

const props = defineProps<{ run: WorkflowRun }>();
const emit = defineEmits<{ close: [] }>();

const dispatch = useDispatch();
const [owner, repo] = props.run.repo.split("/");
const formRef = ref<string>("");
const formInputs = ref<Record<string, string>>({});

onMounted(async () => {
  await dispatch.loadInfo(owner, repo, props.run.workflowId);
  if (dispatch.info.value) {
    formRef.value = dispatch.info.value.defaultBranch;
    for (const input of dispatch.info.value.inputs) {
      formInputs.value[input.name] = input.default;
    }
  }
});

async function submit() {
  // For booleans, unchecked checkboxes won't be in formInputs as "true",
  // so set them to "false" explicitly
  const inputs = { ...formInputs.value };
  if (dispatch.info.value) {
    for (const input of dispatch.info.value.inputs) {
      if (input.type === "boolean" && !inputs[input.name]) {
        inputs[input.name] = "false";
      }
    }
  }
  await dispatch.trigger(
    owner,
    repo,
    props.run.workflowId,
    formRef.value,
    inputs,
  );
}
</script>

<template>
  <div class="dispatch-form">
    <template v-if="dispatch.loading.value">Loading...</template>
    <template v-else-if="dispatch.error.value">
      <div class="dispatch-result dispatch-error">
        {{ dispatch.error.value }}
      </div>
      <button type="button" class="btn" @click="emit('close')">Close</button>
    </template>
    <template v-else-if="dispatch.info.value">
      <h4>Run {{ dispatch.info.value.workflowName }}</h4>

      <template v-if="!dispatch.result.value">
        <div class="form-field">
          <label for="dispatch-ref"
            >Branch / tag <span class="required">*</span></label
          >
          <input
            id="dispatch-ref"
            type="text"
            v-model="formRef"
            aria-required="true"
          />
        </div>

        <div
          v-for="input in dispatch.info.value.inputs"
          :key="input.name"
          class="form-field"
        >
          <label :for="`input-${input.name}`">
            {{ input.name }}
            <span v-if="input.required" class="required">*</span>
          </label>

          <template v-if="input.type === 'choice'">
            <select
              :id="`input-${input.name}`"
              v-model="formInputs[input.name]"
              :aria-required="input.required"
            >
              <option v-for="opt in input.options" :key="opt" :value="opt">
                {{ opt }}
              </option>
            </select>
          </template>
          <template v-else-if="input.type === 'boolean'">
            <label>
              <input
                type="checkbox"
                :checked="formInputs[input.name] === 'true'"
                @change="
                  formInputs[input.name] = ($event.target as HTMLInputElement)
                    .checked
                    ? 'true'
                    : 'false'
                "
              />
            </label>
          </template>
          <template v-else>
            <input
              :id="`input-${input.name}`"
              type="text"
              v-model="formInputs[input.name]"
              :aria-required="input.required"
            />
          </template>

          <span v-if="input.description" class="field-help">{{
            input.description
          }}</span>
        </div>

        <div class="form-actions">
          <button
            type="button"
            class="btn btn-primary"
            @click="submit"
            :disabled="dispatch.submitting.value"
          >
            {{ dispatch.submitting.value ? "Dispatching..." : "Run workflow" }}
          </button>
          <button type="button" class="btn" @click="emit('close')">
            Cancel
          </button>
        </div>
      </template>

      <template v-else>
        <div
          class="dispatch-result"
          :class="
            dispatch.result.value.success
              ? 'dispatch-success'
              : 'dispatch-error'
          "
        >
          {{ dispatch.result.value.message }}
          <template
            v-if="dispatch.result.value.success && dispatch.result.value.runUrl"
          >
            &mdash;
            <a
              :href="dispatch.result.value.runUrl"
              target="_blank"
              rel="noopener"
              >View runs</a
            >
          </template>
        </div>
        <button
          type="button"
          class="btn"
          @click="emit('close')"
          style="margin-top: 8px"
        >
          Close
        </button>
      </template>
    </template>
  </div>
</template>
