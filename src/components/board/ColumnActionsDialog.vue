<script setup lang="ts">
import { onBeforeUnmount, ref, watch } from 'vue'
import Button from 'primevue/button'
import BaseDialog from '@/components/ui/BaseDialog.vue'
import BaseInput from '@/components/ui/BaseInput.vue'
import { deleteColumn, renameColumn, type BoardColumn } from '@/api/lists'
import { useApiClient } from '@/composables/useApiClient'
import { useApiRequest } from '@/composables/useApiRequest'
import { useAuthStore } from '@/stores/auth'
import { columnTitleError } from '@/validation/column'

const props = defineProps<{
  column: BoardColumn | null
  action: 'rename' | 'delete'
  canSubmit: boolean
  refreshing: boolean
  reloadFailed: boolean
}>()
const visible = defineModel<boolean>('visible', { required: true })
const emit = defineEmits<{
  renamed: [column: BoardColumn]
  deleted: [id: number]
  reconcile: []
  closed: []
}>()
const api = useApiClient()
const auth = useAuthStore()
const { loading, error, execute } = useApiRequest()
const title = ref('')
const titleError = ref('')
const submitted = ref(false)
const titleInput = ref<InstanceType<typeof BaseInput> | null>(null)
const controller = new AbortController()

function validateTitle() {
  if (submitted.value) titleError.value = columnTitleError(title.value)
}

async function submit() {
  if (loading.value || !props.canSubmit || !props.column) return
  submitted.value = true
  if (props.action === 'rename') {
    validateTitle()
    if (titleError.value) {
      titleInput.value?.focus()
      return
    }
  }
  const id = props.column.id
  const version = auth.sessionVersion
  const result = await execute<BoardColumn | void>(() =>
    props.action === 'rename'
      ? renameColumn(api, id, title.value.trim(), controller.signal)
      : deleteColumn(api, id, controller.signal),
  )
  if (controller.signal.aborted || version !== auth.sessionVersion) return
  if (result.ok) {
    if (result.data) emit('renamed', result.data)
    else emit('deleted', id)
    visible.value = false
  } else if (error.value && error.value.kind !== 'validation') {
    // A failed response may hide a completed write or a column deleted elsewhere.
    emit('reconcile')
  }
}

function reset() {
  title.value = ''
  titleError.value = ''
  submitted.value = false
  error.value = null
}
watch(visible, (open) => {
  reset()
  if (open) title.value = props.column!.title
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
  <BaseDialog
    v-model:visible="visible"
    :title="action === 'rename' ? 'Rename column' : 'Delete column'"
    :busy="loading"
    @after-hide="emit('closed')"
  >
    <form id="column-action-form" class="space-y-4" novalidate @submit.prevent="submit">
      <BaseInput
        v-if="action === 'rename'"
        id="rename-column-title"
        ref="titleInput"
        v-model="title"
        label="Title"
        :error="titleError"
        required
        autofocus
        @input="validateTitle"
      />
      <p v-else class="wrap-anywhere">
        Delete “{{ column?.title }}”? All its tasks will be permanently deleted. This cannot be
        undone.
      </p>
      <p v-if="error" role="alert" class="text-sm text-danger">{{ error.message }}</p>
      <p v-if="refreshing" role="status">Reloading columns to check the latest state…</p>
      <div v-else-if="reloadFailed" class="space-y-2">
        <p role="alert">Could not reload the board. Check its state before trying again.</p>
        <Button label="Reload board" severity="secondary" @click="emit('reconcile')" />
      </div>
      <p v-else-if="!canSubmit" role="status">
        This column is no longer available. Close this dialog to see the updated board.
      </p>
      <p v-else-if="error && error.kind !== 'validation'" role="status">
        The board has been reloaded. Check it before trying again; your request may have reached the
        server.
      </p>
    </form>
    <template #footer>
      <Button
        label="Cancel"
        severity="secondary"
        :autofocus="action === 'delete'"
        :disabled="loading"
        @click="visible = false"
      />
      <Button
        type="submit"
        form="column-action-form"
        :label="action === 'rename' ? 'Save changes' : 'Delete column'"
        :severity="action === 'delete' ? 'danger' : undefined"
        :loading="loading"
        :disabled="loading || !canSubmit"
      />
    </template>
  </BaseDialog>
</template>
