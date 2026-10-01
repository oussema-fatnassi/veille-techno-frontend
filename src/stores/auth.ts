import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import { login, type LoginCredentials } from '@/api/auth'
import { createApiClient } from '@/api/client'
import { ApiError } from '@/api/errors'

export interface UserProfile {
  id: number
  name: string
  email: string
}

export const useAuthStore = defineStore('auth', () => {
  const accessToken = ref<string | null>(null)
  const profile = ref<UserProfile | null>(null)
  const sessionVersion = ref(0)
  const sessionMessage = ref('')
  const isAuthenticated = computed(() => accessToken.value !== null)

  function clearSession() {
    accessToken.value = null
    profile.value = null
    sessionMessage.value = ''
    sessionVersion.value++
  }

  function expireSession() {
    if (!accessToken.value) return
    clearSession()
    sessionMessage.value = 'Your session has expired. Please log in again.'
  }

  function createSessionClient() {
    return createApiClient({
      getAccessToken: () => accessToken.value,
      getSessionVersion: () => sessionVersion.value,
      onUnauthorized: expireSession,
    })
  }

  async function signIn(credentials: LoginCredentials) {
    clearSession()
    const version = sessionVersion.value
    const response = await login(credentials)
    if (version !== sessionVersion.value) throw new ApiError('cancelled', 'Session changed.')
    accessToken.value = response.accessToken
  }

  async function loadProfile() {
    const version = sessionVersion.value
    const user = await createSessionClient().get<UserProfile>('/users/me')
    if (version !== sessionVersion.value) throw new ApiError('cancelled', 'Session changed.')
    profile.value = { id: user.id, name: user.name, email: user.email }
  }

  return {
    accessToken,
    profile,
    sessionVersion,
    sessionMessage,
    isAuthenticated,
    signIn,
    clearSession,
    expireSession,
    createSessionClient,
    loadProfile,
  }
})
