<script setup lang="ts">
import Dialog from 'primevue/dialog'

withDefaults(defineProps<{ title: string; busy?: boolean }>(), { busy: false })
const visible = defineModel<boolean>('visible', { required: true })
</script>

<template>
  <Dialog
    v-model:visible="visible"
    :header="title"
    modal
    :close-on-escape="!busy"
    :closable="!busy"
    class="w-[calc(100%-2rem)] max-w-md"
  >
    <slot />
    <template #footer>
      <slot name="footer" />
    </template>
  </Dialog>
</template>
