<script setup lang="ts">
import InputText from 'primevue/inputtext'
import { ref } from 'vue'

withDefaults(
  defineProps<{
    id: string
    label: string
    type?: 'text' | 'email' | 'password'
    autocomplete?: string
    error?: string
    required?: boolean
  }>(),
  {
    type: 'text',
    error: '',
    required: false,
  },
)

const model = defineModel<string>({ required: true })

const emit = defineEmits<{
  input: []
}>()

const fieldElement = ref<HTMLDivElement | null>(null)

function focus() {
  fieldElement.value?.querySelector('input')?.focus()
}
defineExpose({ focus })
</script>

<template>
  <div ref="fieldElement" class="space-y-1">
    <label :for="id" class="block">
      {{ label }}
    </label>

    <InputText
      :id="id"
      v-model="model"
      :name="id"
      :type="type"
      :autocomplete="autocomplete"
      :required="required"
      :invalid="!!error"
      :aria-invalid="!!error"
      :aria-describedby="error ? `${id}-error` : undefined"
      class="w-full"
      @input="emit('input')"
    />

    <p :id="`${id}-error`" aria-live="polite" class="text-sm text-danger empty:hidden">
      {{ error }}
    </p>
  </div>
</template>
