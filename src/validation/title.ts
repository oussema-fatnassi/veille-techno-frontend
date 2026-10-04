import isLength from 'validator/lib/isLength'

export function getTitleError(title: string): string {
  const normalized = title.trim()
  if (!normalized) return 'Title is required.'
  return isLength(normalized, { max: 100 }) ? '' : 'Title must be 100 characters or fewer.'
}
