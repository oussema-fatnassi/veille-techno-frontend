<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import Button from 'primevue/button'
import { getTasks, type BoardTask, type TaskDetails } from '@/api/cards'
import TaskEditorDialog from './TaskEditorDialog.vue'
import NewTaskDialog from './NewTaskDialog.vue'
import { useApiClient } from '@/composables/useApiClient'
import { useApiRequest } from '@/composables/useApiRequest'
import { useAuthStore } from '@/stores/auth'

const props = defineProps<{
  columnId: number
  columnTitle: string
  movedTask?: TaskDetails | null
  refreshVersion?: number
}>()
const emit = defineEmits<{ columnMissing: []; moved: [task: TaskDetails]; reconcileBoard: [] }>()
const api = useApiClient()
const auth = useAuthStore()
const tasks = ref<BoardTask[] | null>(null)
const { loading, error, execute } = useApiRequest()
const controller = new AbortController()
const region = ref<HTMLElement | null>(null)
const selectedTaskId = ref<number | null>(null)
const newTaskVisible = ref(false)
const canCreate = computed(() => tasks.value !== null && !loading.value && !error.value)
const nextPosition = computed(() =>
  tasks.value?.length ? Math.max(...tasks.value.map((task) => task.position)) + 1 : 0,
)
let taskRevision = 0
let refreshPending = false

function addTask(task: TaskDetails) {
  taskRevision++
  tasks.value = [...(tasks.value ?? []).filter((item) => item.id !== task.id), task].sort(
    (a, b) => a.position - b.position || a.id - b.id,
  )
}

function updateTask(task: TaskDetails) {
  if (task.listId !== props.columnId) {
    removeTask(task.id)
    return
  }
  taskRevision++
  tasks.value =
    tasks.value
      ?.map((item) => (item.id === task.id ? task : item))
      .sort((a, b) => a.position - b.position || a.id - b.id) ?? null
}
function removeTask(id: number) {
  taskRevision++
  tasks.value = tasks.value?.filter((task) => task.id !== id) ?? null
}
function closeEditor() {
  selectedTaskId.value = null
  if (document.activeElement === document.body) region.value?.focus()
}

async function loadTasks(retry = false) {
  if (controller.signal.aborted) return
  if (loading.value) {
    refreshPending = true
    return
  }
  const version = auth.sessionVersion
  const revision = taskRevision
  const result = await execute(() => getTasks(api, props.columnId, controller.signal))
  if (controller.signal.aborted || version !== auth.sessionVersion) return
  // A refresh started before an edit must not overwrite its confirmed result.
  if (result.ok && revision === taskRevision) tasks.value = result.data
  await nextTick()
  if (retry && document.activeElement === document.body) region.value?.focus()
  if (refreshPending) {
    refreshPending = false
    await loadTasks()
  }
}

watch(
  () => props.refreshVersion,
  () => loadTasks(),
)
watch(
  () => props.movedTask,
  (task) => {
    if (!task) return
    removeTask(task.id)
    if (task.listId === props.columnId) {
      if (tasks.value !== null) addTask(task)
      else void loadTasks()
    }
  },
)

watch(
  () => auth.sessionVersion,
  () => {
    tasks.value = null
    selectedTaskId.value = null
    newTaskVisible.value = false
    controller.abort()
  },
  { flush: 'sync' },
)
onBeforeUnmount(() => {
  tasks.value = null
  controller.abort()
})
onMounted(() => loadTasks())
</script>

<template>
  <section
    ref="region"
    :aria-label="`Tasks in ${columnTitle}`"
    :aria-busy="loading"
    tabindex="-1"
    class="mt-4 min-w-0 focus-visible:outline-2 focus-visible:outline-primary"
  >
    <p v-if="loading" role="status" class="text-sm">Loading tasks…</p>
    <div v-else-if="error" class="space-y-2">
      <p role="alert" class="text-sm text-danger">{{ error.message }}</p>
      <Button
        label="Retry tasks"
        :aria-label="`Retry tasks in ${columnTitle}`"
        size="small"
        severity="secondary"
        @click="loadTasks(true)"
      />
    </div>
    <p v-else-if="tasks?.length === 0" class="text-sm">No tasks yet.</p>
    <ul v-else-if="tasks" class="space-y-2">
      <li v-for="task in tasks" :key="task.id">
        <button
          type="button"
          class="w-full cursor-pointer rounded border border-outline p-3 text-left text-sm whitespace-pre-wrap wrap-anywhere hover:bg-black/10 focus-visible:outline-2 focus-visible:outline-primary"
          @click="selectedTaskId = task.id"
        >
          {{ task.title }}
        </button>
      </li>
    </ul>
    <Button
      label="New task"
      :aria-label="`New task in ${columnTitle}`"
      severity="secondary"
      size="small"
      class="mt-3"
      :disabled="!canCreate"
      @click="newTaskVisible = true"
    />
    <NewTaskDialog
      v-model:visible="newTaskVisible"
      :column-id="columnId"
      :column-title="columnTitle"
      :position="nextPosition"
      :can-submit="canCreate"
      :refreshing="loading"
      :reload-failed="!!error"
      @created="addTask"
      @reconcile="loadTasks()"
      @column-missing="emit('columnMissing')"
    />
    <TaskEditorDialog
      v-if="selectedTaskId !== null"
      :key="selectedTaskId"
      :task-id="selectedTaskId"
      @updated="updateTask"
      @removed="removeTask"
      @reconcile="loadTasks()"
      @closed="closeEditor"
      @moved="emit('moved', $event)"
      @located="emit('moved', $event)"
      @reconcile-board="emit('reconcileBoard')"
    />
  </section>
</template>
