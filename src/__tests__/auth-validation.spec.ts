import { describe, expect, it } from 'vitest'
import { validateRegistrationPassword } from '../validation/auth'

describe('registration password validation', () => {
  it('requires a password', () => {
    expect(validateRegistrationPassword('')).toBe('Password is required.')
  })

  it.each(['Test1234', 'Password!', 'Abcdefg1', 'Aa1!' + 'a'.repeat(16)])(
    'accepts %s',
    (password) => {
      expect(validateRegistrationPassword(password)).toBe('')
    },
  )

  it.each(['Test12!', 'Aa1!' + 'a'.repeat(17), 'password1', 'PASSWORD1', 'Password', '12345678'])(
    'rejects %s',
    (password) => {
      expect(validateRegistrationPassword(password)).toContain('8 to 20 characters')
    },
  )
})
