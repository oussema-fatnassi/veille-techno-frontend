import isLength from 'validator/lib/isLength'

// Keep aligned with RegisterDto in veille-techno-backend.
export const REGISTRATION_PASSWORD_REGEX = /((?=.*\d)|(?=.*\W+))(?![.\n])(?=.*[A-Z])(?=.*[a-z]).*$/

export function validateRegistrationPassword(password: string): string {
  if (password.length === 0) return 'Password is required.'

  if (!isLength(password, { min: 8, max: 20 }) || !REGISTRATION_PASSWORD_REGEX.test(password)) {
    return 'Password must be 8 to 20 characters long and contain at least one uppercase letter, one lowercase letter, and one number or special character.'
  }

  return ''
}
