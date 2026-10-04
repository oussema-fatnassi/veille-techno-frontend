<script setup lang="ts">
import { onBeforeUnmount, ref, watch } from 'vue'
import Button from 'primevue/button'
import Textarea from 'primevue/textarea'
import BaseDialog from '@/components/ui/BaseDialog.vue'
import BaseInput from '@/components/ui/BaseInput.vue'
import { createTask, type TaskDetails } from '@/api/cards'
import { useApiClient } from '@/composables/useApiClient'
import { useApiRequest } from '@/composables/useApiRequest'
import { useAuthStore } from '@/stores/auth'
import { getTitleError } from '@/validation/title'

const props = defineProps<{
  columnId: number
  columnTitle: string
  position: number
  canSubmit: boolean
  refreshing: boolean
  reloadFailed: boolean
}>()
const visible = defineModel<boolean>('visible', { required: true })
const emit = defineEmits<{ created: [task: TaskDetails]; reconcile: []; columnMissing: [] }>()
const title = ref('')
const description = ref('')
const titleError = ref('')
const submitted = ref(false)
const uncertain = ref(false)
const titleInput = ref<InstanceType<typeof BaseInput> | null>(null)
const api = useApiClient()
const auth = useAuthStore()
const { loading, error, execute } = useApiRequest()
const controller = new AbortController()

function validateTitle() {
  if (submitted.value) titleError.value = getTitleError(title.value)
}
async function submit() {
  if (loading.value || !props.canSubmit || controller.signal.aborted) return
  submitted.value = true
  validateTitle()
  if (titleError.value) {
    titleInput.value?.focus()
    return
  }
  const version = auth.sessionVersion
  uncertain.value = false
  const result = await execute(() =>
    createTask(
      api,
      props.columnId,
      {
        title: title.value.trim(),
        description: description.value,
        position: props.position,
      },
      controller.signal,
    ),
  )
  if (controller.signal.aborted || version !== auth.sessionVersion) return
  if (result.ok) {
    emit('created', result.data)
    visible.value = false
  } else if (error.value?.status === 404) {
    visible.value = false
    emit('columnMissing')
  } else if (error.value?.kind === 'unavailable' || error.value?.kind === 'unknown') {
    uncertain.value = true
    emit('reconcile')
  }
}
function reset() {
  title.value = ''
  description.value = ''
  titleError.value = ''
  submitted.value = false
  uncertain.value = false
  error.value = null
}
watch(visible, (open) => {
  if (!open) reset()
})
watch(
  () => auth.sessionVersion,
  () => {
    controller.abort()
    reset()
    visible.value = false
  },
  { flush: 'sync' },
)
onBeforeUnmount(() => {
  controller.abort()
  reset()
})
</script>

<template>
  <BaseDialog v-model:visible="visible" title="New task" :busy="loading">
    <form :id="`new-task-form-${columnId}`" class="space-y-4" novalidate @submit.prevent="submit">
      <p class="text-sm wrap-anywhere">Column: {{ columnTitle }}</p>
      <BaseInput
        :id="`new-task-title-${columnId}`"
        ref="titleInput"
        v-model="title"
        label="Title"
        :error="titleError"
        required
        autofocus
        @input="validateTitle"
      />
      <div class="space-y-1">
        <label :for="`new-task-description-${columnId}`" class="block"
          >Description (optional)</label
        >
        <Textarea
          :id="`new-task-description-${columnId}`"
          v-model="description"
          name="description"
          rows="4"
          class="w-full resize-y"
        />
      </div>
      <p v-if="error" role="alert" class="text-sm text-danger">{{ error.message }}</p>
      <p v-if="uncertain" role="status" class="text-sm">
        The request may have reached the server. Check the reloaded column before trying again.
      </p>
      <p v-if="refreshing" role="status">Reloading tasks…</p>
      <div v-else-if="reloadFailed" class="space-y-2">
        <p role="alert">Could not reload the column. Reload its tasks before trying again.</p>
        <Button label="Reload tasks" severity="secondary" @click="emit('reconcile')" />
      </div>
    </form>
    <template #footer>
      <Button label="Cancel" severity="secondary" :disabled="loading" @click="visible = false" />
      <Button
        type="submit"
        :form="`new-task-form-${columnId}`"
        label="Create task"
        :loading="loading"
        :disabled="loading || !canSubmit"
      />
    </template>
  </BaseDialog>
</template>
