<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import Button from 'primevue/button'
import Textarea from 'primevue/textarea'
import BaseDialog from '@/components/ui/BaseDialog.vue'
import BaseInput from '@/components/ui/BaseInput.vue'
import { getTask, updateTask, type TaskDetails } from '@/api/cards'
import { useApiClient } from '@/composables/useApiClient'
import { useApiRequest } from '@/composables/useApiRequest'
import { useAuthStore } from '@/stores/auth'
import { getTitleError } from '@/validation/title'
import type { ApiError } from '@/api/errors'

const props = defineProps<{ taskId: number }>()
const emit = defineEmits<{
  updated: [task: TaskDetails]
  removed: [id: number]
  reconcile: []
  closed: []
}>()
const visible = ref(true)
const api = useApiClient()
const auth = useAuthStore()
const { loading, error: loadError, execute: read } = useApiRequest()
const { loading: saving, error: saveError, execute: write } = useApiRequest()
const details = ref<TaskDetails | null>(null)
const title = ref('')
const description = ref('')
const titleError = ref('')
const submitted = ref(false)
const missing = ref(false)
const denied = ref(false)
const titleInput = ref<InstanceType<typeof BaseInput> | null>(null)
const controller = new AbortController()
const canEdit = computed(() => !!details.value && !missing.value && !denied.value)
const uncertain = computed(() => !!saveError.value && saveError.value.kind !== 'validation')

function handleFailure(error: ApiError | null) {
  if (error?.status === 404) {
    missing.value = true
    details.value = null
    title.value = ''
    description.value = ''
    emit('removed', props.taskId)
  } else if (error?.status === 403) {
    denied.value = true
    emit('reconcile')
  }
}

async function loadDetails() {
  if (loading.value || saving.value || controller.signal.aborted) return
  const version = auth.sessionVersion
  const result = await read(() => getTask(api, props.taskId, controller.signal))
  if (controller.signal.aborted || version !== auth.sessionVersion) return
  if (result.ok) {
    details.value = result.data
    title.value = result.data.title
    description.value = result.data.description ?? ''
    titleError.value = ''
    submitted.value = false
    denied.value = false
    saveError.value = null
    emit('updated', result.data)
    await nextTick()
    titleInput.value?.focus()
  } else handleFailure(loadError.value)
}

function validateTitle() {
  if (submitted.value) titleError.value = getTitleError(title.value)
}
async function save() {
  if (
    !canEdit.value ||
    loading.value ||
    saving.value ||
    loadError.value ||
    controller.signal.aborted
  )
    return
  submitted.value = true
  validateTitle()
  if (titleError.value) {
    titleInput.value?.focus()
    return
  }
  const version = auth.sessionVersion
  const result = await write(() =>
    updateTask(
      api,
      props.taskId,
      {
        title: title.value.trim(),
        description: description.value,
      },
      controller.signal,
    ),
  )
  if (controller.signal.aborted || version !== auth.sessionVersion) return
  if (result.ok) {
    emit('updated', result.data)
    visible.value = false
  } else {
    handleFailure(saveError.value)
    if (saveError.value?.kind === 'unavailable' || saveError.value?.kind === 'unknown')
      emit('reconcile')
  }
}

function clear() {
  controller.abort()
  details.value = null
  title.value = ''
  description.value = ''
  titleError.value = ''
  loadError.value = null
  saveError.value = null
}
watch(
  visible,
  (open) => {
    if (!open) clear()
  },
  { flush: 'sync' },
)
watch(
  () => auth.sessionVersion,
  () => {
    clear()
    visible.value = false
  },
  { flush: 'sync' },
)
onBeforeUnmount(clear)
onMounted(loadDetails)
</script>

<template>
  <BaseDialog
    v-model:visible="visible"
    title="Edit task"
    :busy="saving"
    @after-hide="emit('closed')"
  >
    <div class="space-y-4">
      <p v-if="loading" role="status">Loading task…</p>
      <p v-if="missing" role="alert">This task no longer exists.</p>
      <p v-else-if="loadError || saveError" role="alert" class="text-sm text-danger">
        {{ (loadError || saveError)?.message }}
      </p>
      <form
        v-if="canEdit && !loading"
        id="task-editor-form"
        class="space-y-4"
        novalidate
        @submit.prevent="save"
      >
        <BaseInput
          id="task-title"
          ref="titleInput"
          v-model="title"
          label="Title"
          required
          autofocus
          :error="titleError"
          @input="validateTitle"
        />
        <div class="space-y-1">
          <label for="task-description" class="block">Description (optional)</label>
          <Textarea
            id="task-description"
            v-model="description"
            name="description"
            rows="5"
            class="w-full resize-y"
          />
        </div>
      </form>
      <p v-if="uncertain && !missing && !denied" class="text-sm">
        The save could not be confirmed. Reload details to check the server. Reloading replaces your
        unsaved changes.
      </p>
      <Button
        v-if="!missing && (loadError || uncertain)"
        label="Reload details"
        severity="secondary"
        :disabled="loading || saving"
        @click="loadDetails"
      />
    </div>
    <template #footer>
      <Button label="Cancel" severity="secondary" :disabled="saving" @click="visible = false" />
      <Button
        v-if="canEdit"
        type="submit"
        form="task-editor-form"
        label="Save changes"
        :loading="saving"
        :disabled="loading || saving || !!loadError"
      />
    </template>
  </BaseDialog>
</template>
