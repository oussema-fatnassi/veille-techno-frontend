import { createApiClient } from '@/api/client'
import { useAuthStore } from '@/stores/auth'

export function useApiClient() {
  const auth = useAuthStore()

  return createApiClient({
    getAccessToken: () => auth.accessToken,
  })
}