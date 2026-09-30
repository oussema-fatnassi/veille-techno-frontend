import { ref, shallowRef } from 'vue'
import { normalizeApiError, type ApiError } from '@/api/errors'

type RequestResult<T> = { ok: true; data: T } | { ok: false }

// Views own their data. A failed call returns no substitute data or false success.
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
