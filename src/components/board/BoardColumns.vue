<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref, watch, computed } from 'vue'
import Button from 'primevue/button'
import { PencilSquareIcon, TrashIcon } from '@heroicons/vue/24/outline'
import { VueDraggable, type DraggableEvent } from 'vue-draggable-plus'
import NewColumnDialog from './NewColumnDialog.vue'
import ColumnActionsDialog from './ColumnActionsDialog.vue'
import ColumnTasks from './ColumnTasks.vue'
import { getColumns, reorderColumns, type BoardColumn } from '@/api/lists'
import { placeTask, type TaskDetails } from '@/api/cards'
import { useApiClient } from '@/composables/useApiClient'
import { useApiRequest } from '@/composables/useApiRequest'
import { useAuthStore } from '@/stores/auth'
import { ApiError } from '@/api/errors'

const api = useApiClient()
const auth = useAuthStore()
const columns = ref<BoardColumn[] | null>(null)
const movedTask = ref<TaskDetails | null>(null)
const taskRefreshVersion = ref(0)
const { loading, error, execute } = useApiRequest()
const { loading: reordering, error: reorderError, execute: reorder } = useApiRequest()
const { loading: movingTask, error: moveError, execute: saveTaskMove } = useApiRequest()
const controller = new AbortController()
const newColumnVisible = ref(false)
const actionVisible = ref(false)
const selectedColumn = ref<BoardColumn | null>(null)
const action = ref<'rename' | 'delete'>('rename')
const heading = ref<HTMLElement | null>(null)
const boardRoot = ref<HTMLElement | null>(null)
const movedColumnId = ref<number | null>(null)
const canCreate = computed(
  () =>
    columns.value !== null &&
    !loading.value &&
    !error.value &&
    !reordering.value &&
    !movingTask.value,
)
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

function focusMovedColumn() {
  const target =
    boardRoot.value?.querySelector<HTMLElement>(`#column-${movedColumnId.value}`) ??
    boardRoot.value?.querySelector<HTMLElement>('button:not(:disabled)')
  target?.focus()
}

async function retryColumns() {
  await loadColumns()
  await nextTick()
  focusMovedColumn()
}

async function moveColumnTo(id: number, destination: number) {
  if (
    !canCreate.value ||
    controller.signal.aborted ||
    newColumnVisible.value ||
    actionVisible.value
  )
    return
  const ordered = [...columns.value!]
  const index = ordered.findIndex((column) => column.id === id)
  if (index < 0 || destination < 0 || destination >= ordered.length || destination === index) return
  const [column] = ordered.splice(index, 1)
  ordered.splice(destination, 0, column!)
  const version = auth.sessionVersion
  movedColumnId.value = id
  const result = await reorder(() => reorderColumns(api, ordered, controller.signal))
  if (controller.signal.aborted || version !== auth.sessionVersion) return
  if (result.ok) columns.value = result.data
  else await loadColumns()
  if (controller.signal.aborted || version !== auth.sessionVersion) return
  await nextTick()
  focusMovedColumn()
}

// Keep the model unchanged during the preview; display the order confirmed by the API.
function reorderDraggedColumn(event: DraggableEvent<BoardColumn>) {
  if (event.newDraggableIndex === undefined) return
  void moveColumnTo(event.data.id, event.newDraggableIndex)
}

async function dropTask(id: number, targetId: number, position: number) {
  if (!canCreate.value || controller.signal.aborted) return
  const version = auth.sessionVersion
  await saveTaskMove(() => placeTask(api, id, targetId, position, controller.signal))
  if (controller.signal.aborted || version !== auth.sessionVersion) return
  // A sort can update several positions; all columns must read the confirmed server order.
  taskRefreshVersion.value++
}

async function handleMissingColumn(title: string) {
  reorderError.value = new ApiError('not-found', `The column “${title}” no longer exists.`)
  await loadColumns()
  await nextTick()
  restoreFocus()
}

watch(
  () => auth.sessionVersion,
  () => {
    moveError.value = null
    columns.value = null
    movedTask.value = null
    newColumnVisible.value = false
    actionVisible.value = false
    selectedColumn.value = null
    reorderError.value = null
    movedColumnId.value = null
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
  <section ref="boardRoot" aria-labelledby="columns-title" class="mt-8 min-w-0">
    <div ref="heading" class="mb-3 flex flex-wrap items-center justify-between gap-3">
      <h2 id="columns-title" class="text-xl font-semibold">Columns</h2>
      <Button
        label="New column"
        :disabled="!canCreate"
        class="cursor-pointer"
        @click="newColumnVisible = true"
      />
    </div>
    <p class="mb-3 text-sm text-muted">
      Drag tasks to change their column or position. Drag column headings to reorder.
    </p>
    <p v-if="movingTask" role="status" class="mb-3">Moving task…</p>
    <p v-if="moveError" role="alert" class="mb-3 text-danger">
      {{ moveError.message }} The move was not confirmed. Check the reloaded tasks before trying
      again.
    </p>
    <p v-if="reordering" role="status" class="mb-3">Saving column order…</p>
    <p v-if="reorderError" role="alert" class="mb-3 text-danger">
      {{ reorderError.message }} The reorder was not confirmed. Check the reloaded order before
      trying again.
    </p>
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
      <Button label="Retry columns" class="cursor-pointer" @click="retryColumns" />
    </div>
    <p v-else-if="columns?.length === 0">
      No columns yet. Create your first column to organize your work.
    </p>
    <div
      v-else-if="columns"
      role="region"
      aria-label="Board columns"
      tabindex="0"
      class="board-scroll min-w-0 overflow-x-auto pb-4 focus-visible:outline-2 focus-visible:outline-primary"
    >
      <VueDraggable
        :model-value="columns"
        handle=".column-handle"
        draggable=".board-column"
        direction="horizontal"
        :animation="150"
        :disabled="!canCreate || newColumnVisible || actionVisible"
        :delay="150"
        :delay-on-touch-only="true"
        :touch-start-threshold="4"
        ghost-class="drag-ghost"
        class="flex w-max min-w-full gap-4"
        @update="reorderDraggedColumn"
      >
        <section
          v-for="column in columns"
          :key="column.id"
          :aria-labelledby="`column-${column.id}`"
          class="board-column min-h-40 w-72 max-w-full shrink-0 rounded-lg border border-outline bg-surface p-4"
        >
          <h3
            :id="`column-${column.id}`"
            tabindex="-1"
            title="Drag to reorder this column"
            class="column-handle cursor-grab active:cursor-grabbing select-none font-semibold wrap-anywhere focus-visible:outline-2 focus-visible:outline-primary"
          >
            {{ column.title }}
          </h3>
          <div class="mt-3 flex gap-2 pr-12">
            <button
              type="button"
              :aria-label="`Rename ${column.title}`"
              :title="`Rename ${column.title}`"
              :disabled="!canCreate"
              class="cursor-pointer rounded border border-outline p-2 text-muted hover:bg-black/10 hover:text-content disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-primary"
              @click="openAction(column, 'rename')"
            >
              <PencilSquareIcon class="size-4" aria-hidden="true" />
            </button>
            <button
              type="button"
              :aria-label="`Delete ${column.title}`"
              :title="`Delete ${column.title}`"
              :disabled="!canCreate"
              class="cursor-pointer rounded border border-outline p-2 text-danger hover:bg-black/10 disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-primary"
              @click="openAction(column, 'delete')"
            >
              <TrashIcon class="size-4" aria-hidden="true" />
            </button>
          </div>
          <ColumnTasks
            :column-id="column.id"
            :column-title="column.title"
            :moved-task="movedTask"
            :refresh-version="taskRefreshVersion"
            :interaction-disabled="!canCreate"
            @drop-task="dropTask"
            @moved="movedTask = $event"
            @reconcile-board="taskRefreshVersion++"
            @column-missing="handleMissingColumn(column.title)"
          />
        </section>
      </VueDraggable>
    </div>
  </section>
</template>
