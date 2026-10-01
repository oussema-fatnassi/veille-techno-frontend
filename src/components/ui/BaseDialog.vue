<script setup lang="ts">
import Dialog from 'primevue/dialog'

defineProps<{ title: string }>()
const visible = defineModel<boolean>('visible', { required: true })
</script>

<template>
  <Dialog
    v-model:visible="visible"
    :header="title"
    modal
    :close-on-escape="true"
    class="w-[calc(100%-2rem)] max-w-md"
  >
    <slot />
    <template #footer>
      <slot name="footer" />
    </template>
  </Dialog>
</template>
