import { describe, expect, it } from 'vitest'
import { validateApiBaseUrl } from '../../config/env'

describe('API environment configuration', () => {
  it.each(['http://localhost:3000/api', 'https://api.example.com/api'])('accepts %s', (value) =>
    expect(validateApiBaseUrl(value)).toBe(value),
  )

  it('trims whitespace and trailing slashes', () => {
    expect(validateApiBaseUrl('  http://localhost:3000/api/  ')).toBe('http://localhost:3000/api')
  })

  it.each([
    undefined,
    '',
    '   ',
    '/api',
    'not-a-url',
    'ftp://example.com/api',
    'https://user:password@example.com/api',
    'https://example.com/api?token=secret',
    'https://example.com/api#fragment',
  ])('rejects invalid configuration: %s', (value) => {
    expect(() => validateApiBaseUrl(value)).toThrow('VITE_API_BASE_URL')
    expect(() => validateApiBaseUrl(value)).toThrow('Copy .env.example to .env')
  })
})
