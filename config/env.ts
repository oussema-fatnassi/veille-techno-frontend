export function validateApiBaseUrl(value: string | undefined): string {
  const message =
    'VITE_API_BASE_URL must be an absolute HTTP(S) backend origin, optionally ending in /api, without credentials, a query, or a fragment. Copy .env.example to .env and set the API address.'

  if (!value?.trim()) throw new Error(message)

  let url: URL
  try {
    url = new URL(value.trim())
  } catch {
    throw new Error(message)
  }

  if (
    !['http:', 'https:'].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    !['', '/', '/api', '/api/'].includes(url.pathname)
  ) {
    throw new Error(message)
  }

  return `${url.origin}/api`
}
