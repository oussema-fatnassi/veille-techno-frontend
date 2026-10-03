<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import Button from 'primevue/button'
import { getTask, getTasks, moveTask, type TaskDetails } from '@/api/cards'
import { getColumns, type BoardColumn } from '@/api/lists'
import { useApiClient } from '@/composables/useApiClient'
import { useApiRequest } from '@/composables/useApiRequest'
import { useAuthStore } from '@/stores/auth'

const props = defineProps<{ taskId: number }>()
const emit = defineEmits<{
  moved: [task: TaskDetails]
  located: [task: TaskDetails]
  reconcile: []
  busy: [value: boolean]
}>()
const api = useApiClient()
const auth = useAuthStore()
const { loading, error: loadError, execute: read } = useApiRequest()
const { loading: moving, error: moveError, execute: write } = useApiRequest()
const columns = ref<BoardColumn[]>([])
const task = ref<TaskDetails | null>(null)
const destination = ref<number | null>(null)
const selector = ref<HTMLSelectElement | null>(null)
const controller = new AbortController()
const busy = computed(() => loading.value || moving.value)
const canMove = computed(
  () =>
    !!task.value &&
    !busy.value &&
    !loadError.value &&
    destination.value !== task.value.listId &&
    columns.value.some((column) => column.id === destination.value),
)
const hasAlternative = computed(() =>
  columns.value.some((column) => column.id !== task.value?.listId),
)

async function load() {
  if (busy.value || controller.signal.aborted) return
  const version = auth.sessionVersion
  const result = await read(async () => {
    const [current, available] = await Promise.all([
      getTask(api, props.taskId, controller.signal),
      getColumns(api, controller.signal),
    ])
    return { current, available }
  })
  if (controller.signal.aborted || version !== auth.sessionVersion) return
  if (result.ok) {
    task.value = result.data.current
    columns.value = result.data.available
    destination.value = task.value.listId
    emit('located', task.value)
  }
}

async function move() {
  if (!canMove.value || controller.signal.aborted) return
  const version = auth.sessionVersion
  const target = destination.value!
  const result = await write(async () => {
    // Read the destination immediately before the move, including gaps in its positions.
    const tasks = await getTasks(api, target, controller.signal)
    const position = tasks.length ? Math.max(...tasks.map((item) => item.position)) + 1 : 0
    return moveTask(api, props.taskId, target, position, controller.signal)
  })
  if (controller.signal.aborted || version !== auth.sessionVersion) return
  if (result.ok) emit('moved', result.data)
  else {
    emit('reconcile')
    await load()
  }
}

watch(busy, (value) => emit('busy', value), { flush: 'sync' })
watch(
  () => auth.sessionVersion,
  () => {
    controller.abort()
    task.value = null
    columns.value = []
    destination.value = null
  },
  { flush: 'sync' },
)
onBeforeUnmount(() => controller.abort())
onMounted(async () => {
  await load()
  selector.value?.focus()
})
</script>

<template>
  <div class="space-y-4">
    <p v-if="loading" role="status">Checking task location and columns…</p>
    <p v-if="moveError" role="alert" class="text-sm text-danger">
      {{ moveError.message }} The move was not confirmed. Check the current column before trying
      again.
    </p>
    <p v-if="loadError" role="alert" class="text-sm text-danger">{{ loadError.message }}</p>
    <Button v-if="loadError" label="Check task location" :disabled="busy" @click="load" />
    <template v-if="task">
      <p class="wrap-anywhere">
        Move “{{ task.title }}” to another column. Its saved title and description will stay
        unchanged.
      </p>
      <label for="task-destination" class="block">Destination column</label>
      <select
        id="task-destination"
        ref="selector"
        v-model="destination"
        class="w-full rounded border border-outline bg-surface p-2 focus-visible:outline-2 focus-visible:outline-primary"
        :disabled="busy || !!loadError || !hasAlternative"
      >
        <option v-for="column in columns" :key="column.id" :value="column.id">
          {{ column.title }}{{ column.id === task.listId ? ' (current)' : '' }}
        </option>
      </select>
      <p v-if="!loading && !loadError && !hasAlternative" role="status" class="text-sm">
        Create another column before moving this task.
      </p>
      <Button label="Move task" :loading="moving" :disabled="!canMove" @click="move" />
    </template>
  </div>
</template>
