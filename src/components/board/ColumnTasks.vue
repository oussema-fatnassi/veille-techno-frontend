<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import Button from 'primevue/button'
import { getTasks, type BoardTask, type TaskDetails } from '@/api/cards'
import TaskEditorDialog from './TaskEditorDialog.vue'
import { useApiClient } from '@/composables/useApiClient'
import { useApiRequest } from '@/composables/useApiRequest'
import { useAuthStore } from '@/stores/auth'

const props = defineProps<{ columnId: number; columnTitle: string }>()
const api = useApiClient()
const auth = useAuthStore()
const tasks = ref<BoardTask[] | null>(null)
const { loading, error, execute } = useApiRequest()
const controller = new AbortController()
const region = ref<HTMLElement | null>(null)
const selectedTaskId = ref<number | null>(null)
let taskRevision = 0

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
  if (loading.value || controller.signal.aborted) return
  const version = auth.sessionVersion
  const revision = taskRevision
  const result = await execute(() => getTasks(api, props.columnId, controller.signal))
  if (controller.signal.aborted || version !== auth.sessionVersion) return
  // A refresh started before an edit must not overwrite its confirmed result.
  if (result.ok && revision === taskRevision) tasks.value = result.data
  await nextTick()
  if (retry && document.activeElement === document.body) region.value?.focus()
}

watch(
  () => auth.sessionVersion,
  () => {
    tasks.value = null
    selectedTaskId.value = null
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
    <TaskEditorDialog
      v-if="selectedTaskId !== null"
      :key="selectedTaskId"
      :task-id="selectedTaskId"
      @updated="updateTask"
      @removed="removeTask"
      @reconcile="loadTasks()"
      @closed="closeEditor"
    />
  </section>
</template>
