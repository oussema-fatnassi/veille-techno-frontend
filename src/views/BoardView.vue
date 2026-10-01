<script setup lang="ts">
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
  <main class="min-h-screen bg-page p-6">
    <header class="space-y-3">
      <h1 class="text-2xl font-bold">My board</h1>
      <p v-if="loading" role="status">Loading your profile…</p>
      <p v-else-if="auth.profile">
        Signed in as {{ auth.profile.name }} ({{ auth.profile.email }})
      </p>
      <div v-if="error" class="space-y-2">
        <p role="alert" class="text-danger">{{ error.message }}</p>
        <Button label="Retry" :disabled="loading" @click="loadProfile" />
      </div>
      <Button label="Log out" @click="logout" />
    </header>
  </main>
</template>
