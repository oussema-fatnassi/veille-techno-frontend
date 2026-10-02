<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import Button from 'primevue/button'
import { getColumns, type BoardColumn } from '@/api/lists'
import { useApiClient } from '@/composables/useApiClient'
import { useApiRequest } from '@/composables/useApiRequest'
import { useAuthStore } from '@/stores/auth'

const api = useApiClient()
const auth = useAuthStore()
const columns = ref<BoardColumn[] | null>(null)
const { loading, error, execute } = useApiRequest()
const controller = new AbortController()

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
    <h2 id="columns-title" class="mb-3 text-xl font-semibold">Columns</h2>
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
