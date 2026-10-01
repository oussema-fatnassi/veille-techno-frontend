import { useAuthStore } from '@/stores/auth'

export function useApiClient() {
  return useAuthStore().createSessionClient()
}
