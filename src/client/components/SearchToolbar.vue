<script setup lang="ts">
defineProps<{
  searchQuery: string;
  failuresOnly: boolean;
}>();

const emit = defineEmits<{
  "update:searchQuery": [value: string];
  "update:failuresOnly": [value: boolean];
  expandAll: [];
  collapseAll: [];
}>();
</script>

<template>
  <div class="toolbar">
    <input
      type="text"
      placeholder="Search workflows..."
      aria-label="Search workflows"
      :value="searchQuery"
      @input="
        emit('update:searchQuery', ($event.target as HTMLInputElement).value)
      "
    />
    <label class="filter-toggle">
      <input
        type="checkbox"
        :checked="failuresOnly"
        @change="
          emit(
            'update:failuresOnly',
            ($event.target as HTMLInputElement).checked,
          )
        "
      />
      Failures only
    </label>
    <div class="checkbox-helpers">
      <button type="button" @click="emit('expandAll')">Expand</button>
      <button type="button" @click="emit('collapseAll')">Collapse</button>
    </div>
  </div>
</template>
