<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import Button from 'primevue/button'
import { getTasks, type BoardTask } from '@/api/cards'
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

async function loadTasks(retry = false) {
  if (loading.value || controller.signal.aborted) return
  const version = auth.sessionVersion
  const result = await execute(() => getTasks(api, props.columnId, controller.signal))
  if (controller.signal.aborted || version !== auth.sessionVersion) return
  if (result.ok) tasks.value = result.data
  await nextTick()
  if (retry && document.activeElement === document.body) region.value?.focus()
}

watch(
  () => auth.sessionVersion,
  () => {
    tasks.value = null
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
      <li
        v-for="task in tasks"
        :key="task.id"
        class="rounded border border-outline p-3 text-sm whitespace-pre-wrap wrap-anywhere"
      >
        {{ task.title }}
      </li>
    </ul>
  </section>
</template>
