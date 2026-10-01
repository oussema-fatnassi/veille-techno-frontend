import { createApiClient } from './client'
import { ApiError } from './errors'

export interface LoginCredentials {
  email: string
  password: string
}

export interface LoginResponse {
  accessToken: string
}

const client = createApiClient()

export async function login(credentials: LoginCredentials): Promise<LoginResponse> {
  const response = await client.post<LoginResponse>('/auth/login', credentials)

  if (!response || typeof response.accessToken !== 'string' || !response.accessToken.trim()) {
    throw new ApiError('unknown', 'The login response is invalid. Please try again.')
  }

  return response
}
