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

export interface RegistrationCredentials extends LoginCredentials {
  name: string
}

export interface RegistrationResponse {
  message: string
}

export async function register(
  credentials: RegistrationCredentials,
  signal?: AbortSignal,
): Promise<RegistrationResponse> {
  const response = await client.post<RegistrationResponse>('/auth/register', credentials, {
    signal,
  })
  if (!response || typeof response.message !== 'string' || !response.message.trim()) {
    throw new ApiError('unknown', 'The registration response is invalid. Please try again.')
  }
  return response
}
