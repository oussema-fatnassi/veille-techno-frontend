<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch, computed } from 'vue'
import Button from 'primevue/button'
import NewColumnDialog from './NewColumnDialog.vue'
import ColumnActionsDialog from './ColumnActionsDialog.vue'
import ColumnTasks from './ColumnTasks.vue'
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
const actionVisible = ref(false)
const selectedColumn = ref<BoardColumn | null>(null)
const action = ref<'rename' | 'delete'>('rename')
const heading = ref<HTMLElement | null>(null)
const canCreate = computed(() => columns.value !== null && !loading.value && !error.value)
const canModify = computed(
  () =>
    canCreate.value && !!columns.value?.some((column) => column.id === selectedColumn.value?.id),
)
const nextPosition = computed(() =>
  columns.value?.length ? Math.max(...columns.value.map((column) => column.position)) + 1 : 0,
)
function addColumn(column: BoardColumn) {
  columns.value = [...(columns.value ?? []).filter((item) => item.id !== column.id), column].sort(
    (a, b) => a.position - b.position || a.id - b.id,
  )
}

function openAction(column: BoardColumn, mode: 'rename' | 'delete') {
  selectedColumn.value = column
  action.value = mode
  actionVisible.value = true
}
function updateColumn(updated: BoardColumn) {
  const column = columns.value?.find((item) => item.id === updated.id)
  if (column) column.title = updated.title
}
function removeColumn(id: number) {
  columns.value = columns.value!.filter((column) => column.id !== id)
}
function restoreFocus() {
  // Deletion or a refetch may have removed the button that opened the dialog.
  if (document.activeElement === document.body) heading.value?.querySelector('button')?.focus()
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
    actionVisible.value = false
    selectedColumn.value = null
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
    <div ref="heading" class="mb-3 flex flex-wrap items-center justify-between gap-3">
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
    <ColumnActionsDialog
      v-model:visible="actionVisible"
      :column="columns?.find((column) => column.id === selectedColumn?.id) ?? selectedColumn"
      :action="action"
      :can-submit="canModify"
      :refreshing="loading"
      :reload-failed="!!error"
      @renamed="updateColumn"
      @deleted="removeColumn"
      @reconcile="loadColumns"
      @closed="restoreFocus"
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
        <div class="mt-3 flex gap-2">
          <Button
            label="Rename"
            :aria-label="`Rename ${column.title}`"
            size="small"
            severity="secondary"
            @click="openAction(column, 'rename')"
          />
          <Button
            label="Delete"
            :aria-label="`Delete ${column.title}`"
            size="small"
            severity="danger"
            outlined
            @click="openAction(column, 'delete')"
          />
        </div>
        <ColumnTasks :column-id="column.id" :column-title="column.title" />
      </section>
    </div>
  </section>
</template>
