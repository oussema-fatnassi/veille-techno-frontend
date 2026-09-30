import axios from 'axios'

export type ApiErrorKind =
  | 'validation'
  | 'unauthorized'
  | 'forbidden'
  | 'not-found'
  | 'conflict'
  | 'unavailable'
  | 'cancelled'
  | 'configuration'
  | 'unknown'

export class ApiError extends Error {
  constructor(
    public readonly kind: ApiErrorKind,
    message: string,
    public readonly status?: number,
    public readonly details: string[] = [],
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

export function normalizeApiError(error: unknown, login = false): ApiError {
  if (error instanceof ApiError) return error
  if (axios.isCancel(error)) return new ApiError('cancelled', 'Request cancelled.')
  if (!axios.isAxiosError(error)) {
    return new ApiError('unknown', 'Something went wrong. Please try again.')
  }

  const status = error.response?.status
  if (!status || status >= 500) {
    return new ApiError(
      'unavailable',
      'Cannot reach the service. Check your connection and try again. If it continues, check that the API and proxy are running.',
      status,
    )
  }
  if (status === 400) {
    const data: unknown = error.response?.data
    const message = data && typeof data === 'object' && 'message' in data ? data.message : undefined
    const details = (Array.isArray(message) ? message : [message]).filter(
      (item): item is string => typeof item === 'string' && item.trim().length > 0,
    )
    return new ApiError(
      'validation',
      details.join(' ') || 'Check the entered values.',
      status,
      details,
    )
  }
  if (status === 401) {
    return new ApiError(
      'unauthorized',
      login ? 'Invalid credentials.' : 'Your session has expired. Please log in again.',
      status,
    )
  }
  if (status === 403)
    return new ApiError('forbidden', 'You do not have access to this resource.', status)
  if (status === 404)
    return new ApiError('not-found', 'This resource no longer exists. Refresh the data.', status)
  if (status === 409)
    return new ApiError('conflict', 'This email address is already in use.', status)
  return new ApiError('unknown', 'The request failed. Please try again.', status)
}
