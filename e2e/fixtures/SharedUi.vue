<script setup lang="ts">
import { ref } from 'vue'
import Button from 'primevue/button'
import Message from 'primevue/message'
import BaseInput from '../../src/components/ui/BaseInput.vue'
import BaseDialog from '../../src/components/ui/BaseDialog.vue'

const visible = ref(false)
const value = ref('')
const dialogValue = ref('')
</script>

<template>
  <main class="min-h-screen space-y-6 bg-page p-6">
    <h1 class="text-2xl font-bold">Shared UI reference</h1>
    <div class="max-w-sm space-y-4">
      <BaseInput id="example" v-model="value" label="Example field" />
      <BaseInput id="invalid" v-model="value" label="Invalid field" error="Enter a value." />
      <Message severity="success">Example success message</Message>
      <Message severity="error">Example error message</Message>
      <div class="flex flex-wrap gap-2">
        <Button label="Disabled action" disabled />
        <Button label="Open dialog" aria-haspopup="dialog" @click="visible = true" />
      </div>
    </div>
    <BaseDialog v-model:visible="visible" title="Example dialog">
      <BaseInput id="dialog-field" v-model="dialogValue" label="Dialog field" />
      <template #footer>
        <Button label="Cancel" severity="secondary" @click="visible = false" />
      </template>
    </BaseDialog>
  </main>
</template>
