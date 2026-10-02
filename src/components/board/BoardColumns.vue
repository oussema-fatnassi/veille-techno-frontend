<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch, computed } from 'vue'
import Button from 'primevue/button'
import NewColumnDialog from './NewColumnDialog.vue'
import { getColumns, type BoardColumn } from '@/api/lists'
import { useApiClient } from '@/composables/useApiClient'
import { useApiRequest } from '@/composables/useApiRequest'
import { useAuthStore } from '@/stores/auth'

const api = useApiClient()
const auth = useAuthStore()
const columns = ref<BoardColumn[] | null>(null)
const { loading, error, execute } = useApiRequest()
const controller = new AbortController()
const newColumnVisible = ref(false)
const canCreate = computed(() => columns.value !== null && !loading.value && !error.value)
const nextPosition = computed(() =>
  columns.value?.length ? Math.max(...columns.value.map((column) => column.position)) + 1 : 0,
)
function addColumn(column: BoardColumn) {
  columns.value = [...(columns.value ?? []).filter((item) => item.id !== column.id), column].sort(
    (a, b) => a.position - b.position || a.id - b.id,
  )
}

async function loadColumns() {
  const version = auth.sessionVersion
  const result = await execute(() => getColumns(api, controller.signal))
  if (result.ok && !controller.signal.aborted && version === auth.sessionVersion) {
    columns.value = result.data
  }
}

watch(
  () => auth.sessionVersion,
  () => {
    columns.value = null
    newColumnVisible.value = false
    controller.abort()
  },
  { flush: 'sync' },
)
onBeforeUnmount(() => {
  columns.value = null
  controller.abort()
})
onMounted(loadColumns)
</script>

<template>
  <section aria-labelledby="columns-title" class="mt-8 min-w-0">
    <div class="mb-3 flex flex-wrap items-center justify-between gap-3">
      <h2 id="columns-title" class="text-xl font-semibold">Columns</h2>
      <Button label="New column" :disabled="!canCreate" @click="newColumnVisible = true" />
    </div>
    <NewColumnDialog
      v-model:visible="newColumnVisible"
      :position="nextPosition"
      :can-submit="canCreate"
      @created="addColumn"
      @reconcile="loadColumns"
    />
    <p v-if="loading" role="status">Loading columns…</p>
    <div v-else-if="error" class="space-y-3">
      <p role="alert" class="text-danger">{{ error.message }}</p>
      <Button label="Retry columns" @click="loadColumns" />
    </div>
    <p v-else-if="columns?.length === 0">
      No columns yet. Create your first column to organize your work.
    </p>
    <div
      v-else-if="columns"
      role="region"
      aria-label="Board columns"
      tabindex="0"
      class="flex gap-4 overflow-x-auto pb-4 focus-visible:outline-2 focus-visible:outline-primary"
    >
      <section
        v-for="column in columns"
        :key="column.id"
        :aria-labelledby="`column-${column.id}`"
        class="min-h-40 w-72 max-w-full shrink-0 rounded-lg border border-outline bg-surface p-4"
      >
        <h3 :id="`column-${column.id}`" class="font-semibold wrap-anywhere">{{ column.title }}</h3>
      </section>
    </div>
  </section>
</template>
