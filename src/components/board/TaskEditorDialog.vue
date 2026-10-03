<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import Button from 'primevue/button'
import Textarea from 'primevue/textarea'
import MoveTaskForm from './MoveTaskForm.vue'
import BaseDialog from '@/components/ui/BaseDialog.vue'
import BaseInput from '@/components/ui/BaseInput.vue'
import { deleteTask, getTask, updateTask, type TaskDetails } from '@/api/cards'
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
  moved: [task: TaskDetails]
  located: [task: TaskDetails]
  reconcileBoard: []
}>()
const visible = ref(true)
const moveMode = ref(false)
const moveBusy = ref(false)
const api = useApiClient()
const auth = useAuthStore()
const { loading, error: loadError, execute: read } = useApiRequest()
const { loading: saving, error: saveError, execute: write } = useApiRequest()
const { loading: deleting, error: deleteError, execute: destroy } = useApiRequest()
const confirmingDelete = ref(false)
const deleteNeedsReload = ref(false)
const deleteNotice = ref('')
const cancelControl = ref<HTMLElement | null>(null)
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
  if (loading.value || saving.value || deleting.value || controller.signal.aborted) return
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
    deleteError.value = null
    deleteNeedsReload.value = false
    deleteNotice.value = ''
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
    deleting.value ||
    confirmingDelete.value ||
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

function confirmDeletion() {
  saveError.value = null
  deleteError.value = null
  deleteNotice.value = ''
  confirmingDelete.value = true
  nextTick(() => cancelControl.value?.querySelector('button')?.focus())
}

async function reconcileDeletion() {
  if (loading.value || deleting.value || controller.signal.aborted) return
  const version = auth.sessionVersion
  const result = await read(() => getTask(api, props.taskId, controller.signal))
  if (controller.signal.aborted || version !== auth.sessionVersion) return
  if (result.ok) {
    details.value = result.data
    emit('updated', result.data)
    deleteNeedsReload.value = false
    deleteNotice.value = 'The task still exists. You can retry deletion.'
  } else if (loadError.value?.status === 404) {
    handleFailure(loadError.value)
    emit('reconcile')
  }
}

async function remove() {
  if (
    !canEdit.value ||
    !confirmingDelete.value ||
    loading.value ||
    saving.value ||
    deleting.value ||
    deleteNeedsReload.value ||
    controller.signal.aborted
  )
    return
  const version = auth.sessionVersion
  const result = await destroy(() => deleteTask(api, props.taskId, controller.signal))
  if (controller.signal.aborted || version !== auth.sessionVersion) return
  if (result.ok) {
    emit('removed', props.taskId)
    visible.value = false
  } else if (deleteError.value?.status === 404) {
    handleFailure(deleteError.value)
    emit('reconcile')
  } else if (deleteError.value?.kind === 'unavailable' || deleteError.value?.kind === 'unknown') {
    deleteNeedsReload.value = true
    deleteNotice.value =
      'The deletion could not be confirmed. Checking the task before trying again.'
    await reconcileDeletion()
  }
}

function finishMove(task: TaskDetails) {
  emit('moved', task)
  visible.value = false
}

function cancel() {
  if (moveMode.value) {
    moveMode.value = false
    nextTick(() => titleInput.value?.focus())
  } else if (confirmingDelete.value && !missing.value) {
    confirmingDelete.value = false
    deleteError.value = null
    deleteNotice.value = ''
    nextTick(() => titleInput.value?.focus())
  } else visible.value = false
}

function clear() {
  controller.abort()
  details.value = null
  title.value = ''
  description.value = ''
  titleError.value = ''
  loadError.value = null
  saveError.value = null
  deleteError.value = null
  confirmingDelete.value = false
  deleteNeedsReload.value = false
  deleteNotice.value = ''
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
    :title="moveMode ? 'Move task' : confirmingDelete ? 'Delete task' : 'Edit task'"
    :busy="saving || deleting || moveBusy"
    @after-hide="emit('closed')"
  >
    <MoveTaskForm
      v-if="moveMode"
      :task-id="taskId"
      @busy="moveBusy = $event"
      @moved="finishMove"
      @located="emit('located', $event)"
      @reconcile="emit('reconcileBoard')"
    />
    <div v-else class="space-y-4">
      <p v-if="loading" role="status">Loading task…</p>
      <p v-if="missing" role="alert">This task no longer exists.</p>
      <p v-else-if="loadError || saveError || deleteError" role="alert" class="text-sm text-danger">
        {{ (loadError || saveError || deleteError)?.message }}
      </p>
      <p v-if="confirmingDelete && !missing" class="wrap-anywhere">
        Permanently delete “{{ details?.title }}”? This cannot be undone.
      </p>
      <p v-if="confirmingDelete && deleteNotice && !missing" role="status" class="text-sm">
        {{ deleteNotice }}
      </p>
      <Button
        v-if="confirmingDelete && deleteNeedsReload && !missing"
        label="Check task"
        severity="secondary"
        :disabled="loading || deleting"
        @click="reconcileDeletion"
      />
      <form
        v-if="canEdit && !loading && !confirmingDelete"
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
      <Button
        v-if="canEdit && !confirmingDelete"
        label="Move to another column"
        severity="secondary"
        :disabled="loading || saving || deleting || !!loadError"
        @click="moveMode = true"
      />
      <p v-if="uncertain && !missing && !denied" class="text-sm">
        The save could not be confirmed. Reload details to check the server. Reloading replaces your
        unsaved changes.
      </p>
      <Button
        v-if="!missing && !confirmingDelete && (loadError || uncertain)"
        label="Reload details"
        severity="secondary"
        :disabled="loading || saving"
        @click="loadDetails"
      />
    </div>
    <template #footer>
      <Button
        v-if="canEdit && !confirmingDelete && !moveMode"
        label="Delete task"
        severity="danger"
        outlined
        :disabled="loading || saving || deleting || !!loadError"
        @click="confirmDeletion"
      />
      <span ref="cancelControl">
        <Button
          label="Cancel"
          severity="secondary"
          :disabled="saving || deleting || moveBusy"
          @click="cancel"
        />
      </span>
      <Button
        v-if="canEdit && confirmingDelete && !moveMode"
        label="Delete task"
        severity="danger"
        :loading="deleting"
        :disabled="loading || deleting || deleteNeedsReload"
        @click="remove"
      />
      <Button
        v-if="canEdit && !confirmingDelete && !moveMode"
        type="submit"
        form="task-editor-form"
        label="Save changes"
        :loading="saving"
        :disabled="loading || saving || !!loadError"
      />
    </template>
  </BaseDialog>
</template>
