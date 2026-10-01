import { ref, shallowRef } from 'vue'
import { normalizeApiError, type ApiError } from '@/api/errors'
import { createApiClient } from '@/api/client'
import { useAuthStore } from '@/stores/auth'

type RequestResult<T> = { ok: true; data: T } | { ok: false }

export function useApiClient() {
  const auth = useAuthStore()
  
  return createApiClient({
    getAccessToken: () => auth.accessToken,
  })
}

export function useApiRequest() {
  const loading = ref(false)
  const error = shallowRef<ApiError | null>(null)

  async function execute<T>(operation: () => Promise<T>): Promise<RequestResult<T>> {
    if (loading.value) return { ok: false }
    loading.value = true
    error.value = null
    try {
      return { ok: true, data: await operation() }
    } catch (cause) {
      const failure = normalizeApiError(cause)
      if (failure.kind !== 'cancelled') error.value = failure
      return { ok: false }
    } finally {
      loading.value = false
    }
  }

  return { loading, error, execute }
}
