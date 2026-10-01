import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import { login, type LoginCredentials } from '@/api/auth'

export const useAuthStore = defineStore('auth', () => {
  const accessToken = ref<string | null>(null)

  const isAuthenticated = computed(() => accessToken.value !== null)

  async function signIn(credentials: LoginCredentials) {
    const response = await login(credentials)
    accessToken.value = response.accessToken
  }

  function clearSession() {
    accessToken.value = null
  }

  return {
    accessToken,
    isAuthenticated,
    signIn,
    clearSession,
  }
})
