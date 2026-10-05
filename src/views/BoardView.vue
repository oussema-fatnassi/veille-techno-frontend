<script setup lang="ts">
import BoardColumns from '@/components/board/BoardColumns.vue'
import { onMounted } from 'vue'
import { useRouter } from 'vue-router'
import Button from 'primevue/button'
import { useAuthStore } from '@/stores/auth'
import { useApiRequest } from '@/composables/useApiRequest'

const auth = useAuthStore()
const router = useRouter()
const { loading, error, execute } = useApiRequest()
function loadProfile() {
  return execute(() => auth.loadProfile())
}
async function logout() {
  auth.clearSession()
  await router.replace({ name: 'login' })
}
onMounted(loadProfile)
</script>

<template>
  <main class="min-h-screen min-w-0 overflow-hidden bg-page p-4 sm:p-6">
    <header class="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
      <div class="space-y-3">
        <h1 class="text-2xl font-bold">My board</h1>
        <p v-if="loading" role="status">Loading your profile…</p>
        <div v-if="error" class="space-y-2">
          <p role="alert" class="text-danger">{{ error.message }}</p>
          <Button label="Retry" :disabled="loading" class="cursor-pointer" @click="loadProfile" />
        </div>
      </div>
      <div class="flex flex-wrap items-center gap-3 sm:justify-end">
        <p v-if="auth.profile" class="text-sm text-muted wrap-anywhere">
          {{ auth.profile.email }}
        </p>
        <Button label="Log out" class="cursor-pointer" @click="logout" />
      </div>
    </header>
    <BoardColumns />
  </main>
</template>
