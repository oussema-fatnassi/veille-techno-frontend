import axios from 'axios'
import { ApiError, normalizeApiError } from './errors'

type RequestOptions = { signal?: AbortSignal }
type ClientOptions = {
  getAccessToken?: () => string | null
  onUnauthorized?: () => void
  timeout?: number
}

// Only known API routes can receive a token. Full URLs and caller-supplied headers are not accepted.
function route(path: string) {
  const publicRoute = /^\/auth\/(login|register)$/.test(path)
  const protectedRoute =
    /^\/(users\/(me|[1-9]\d*)|lists(?:\/[1-9]\d*(?:\/cards)?)?|cards\/[1-9]\d*)$/.test(path)
  if (!publicRoute && !protectedRoute) {
    throw new ApiError(
      'configuration',
      'Invalid API route. Use a supported path without the /api prefix.',
    )
  }
  return { publicRoute }
}

export function createApiClient(options: ClientOptions = {}) {
  const transport = axios.create({ baseURL: '/api', timeout: options.timeout ?? 10_000 })
  const getAccessToken = options.getAccessToken ?? (() => null)
  let rejectedToken: string | null = null

  transport.interceptors.request.use((config) => {
    const { publicRoute } = route(config.url!)
    const token = getAccessToken()
    if (!publicRoute && token) config.headers.set('Authorization', `Bearer ${token}`)
    return config
  })

  transport.interceptors.response.use(
    (response) => response,
    (error: unknown) => {
      const config = axios.isAxiosError(error) ? error.config : undefined
      const normalized = normalizeApiError(error, config?.url === '/auth/login')
      const authorization = config?.headers.get('Authorization')
      const token = getAccessToken()
      if (
        normalized.status === 401 &&
        token &&
        authorization === `Bearer ${token}` &&
        rejectedToken !== token
      ) {
        rejectedToken = token
        options.onUnauthorized?.()
      }
      return Promise.reject(normalized)
    },
  )

  async function request<T>(
    method: 'get' | 'post' | 'patch' | 'delete',
    path: string,
    data?: unknown,
    requestOptions?: RequestOptions,
  ): Promise<T> {
    // Reject unsupported destinations before dispatch, including absolute URLs and path traversal.
    route(path)
    const response = await transport.request<T>({
      method,
      url: path,
      data,
      signal: requestOptions?.signal,
    })
    if (response.status === 204) return undefined as T
    if (!String(response.headers['content-type']).includes('application/json')) {
      throw new ApiError(
        'configuration',
        'Unexpected API response. Check that /api is forwarded to the backend instead of the frontend page.',
      )
    }
    return response.data
  }

  return {
    get: <T>(path: string, options?: RequestOptions) => request<T>('get', path, undefined, options),
    post: <T>(path: string, data: unknown, options?: RequestOptions) =>
      request<T>('post', path, data, options),
    patch: <T>(path: string, data: unknown, options?: RequestOptions) =>
      request<T>('patch', path, data, options),
    delete: (path: string, options?: RequestOptions) =>
      request<void>('delete', path, undefined, options),
  }
}
