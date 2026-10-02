<script setup lang="ts">
import { onBeforeUnmount, ref, watch } from 'vue'
import isLength from 'validator/lib/isLength'
import Button from 'primevue/button'
import BaseDialog from '@/components/ui/BaseDialog.vue'
import BaseInput from '@/components/ui/BaseInput.vue'
import { createColumn, type BoardColumn } from '@/api/lists'
import { useApiClient } from '@/composables/useApiClient'
import { useApiRequest } from '@/composables/useApiRequest'
import { useAuthStore } from '@/stores/auth'

const props = defineProps<{ position: number; canSubmit: boolean }>()
const visible = defineModel<boolean>('visible', { required: true })
const emit = defineEmits<{ created: [column: BoardColumn]; reconcile: [] }>()
const title = ref('')
const titleError = ref('')
const submitted = ref(false)
const titleInput = ref<InstanceType<typeof BaseInput> | null>(null)
const api = useApiClient()
const auth = useAuthStore()
const { loading, error, execute } = useApiRequest()
const uncertain = ref(false)
const controller = new AbortController()

function validateTitle() {
  if (!submitted.value) return
  const normalized = title.value.trim()
  titleError.value = !normalized
    ? 'Title is required.'
    : !isLength(normalized, { max: 100 })
      ? 'Title must be 100 characters or fewer.'
      : ''
}

async function submit() {
  if (loading.value || !props.canSubmit) return
  submitted.value = true
  validateTitle()
  if (titleError.value) {
    titleInput.value?.focus()
    return
  }
  const version = auth.sessionVersion
  uncertain.value = false
  const result = await execute(() =>
    createColumn(
      api,
      {
        title: title.value.trim(),
        position: props.position,
      },
      controller.signal,
    ),
  )
  if (controller.signal.aborted || version !== auth.sessionVersion) return
  if (result.ok) {
    emit('created', result.data)
    visible.value = false
  } else if (error.value?.kind === 'unavailable' || error.value?.kind === 'unknown') {
    uncertain.value = true
    emit('reconcile')
  }
}

function reset() {
  title.value = ''
  titleError.value = ''
  submitted.value = false
  error.value = null
  uncertain.value = false
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
  <BaseDialog v-model:visible="visible" title="New column" :busy="loading">
    <form id="new-column-form" class="space-y-4" novalidate @submit.prevent="submit">
      <BaseInput
        id="column-title"
        ref="titleInput"
        v-model="title"
        label="Title"
        :error="titleError"
        required
        autofocus
        @input="validateTitle"
      />
      <p v-if="error" role="alert" class="text-sm text-danger">{{ error.message }}</p>
      <p v-if="uncertain" role="status" class="text-sm">
        The request may have reached the server. Check the reloaded board before trying again.
      </p>
    </form>
    <template #footer>
      <Button label="Cancel" severity="secondary" :disabled="loading" @click="visible = false" />
      <Button
        type="submit"
        form="new-column-form"
        :label="loading ? 'Creating…' : 'Create column'"
        :loading="loading"
        :disabled="loading || !canSubmit"
      />
    </template>
  </BaseDialog>
</template>
