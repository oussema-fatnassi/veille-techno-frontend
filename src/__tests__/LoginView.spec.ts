import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import LoginView from '../views/LoginView.vue'

describe('login form validation', () => {
  it('starts without errors and replaces browser popups with inline messages on submit', async () => {
    const wrapper = mount(LoginView, { global: { stubs: { RouterLink: true } } })
    expect(wrapper.get('form').attributes()).toHaveProperty('novalidate')
    expect(wrapper.get('#email-error').text()).toBe('')
    expect(wrapper.get('#password-error').text()).toBe('')

    await wrapper.get('form').trigger('submit')

    expect(wrapper.get('#email-error').text()).toBe('Email is required.')
    expect(wrapper.get('#password-error').text()).toBe('Password is required.')
    expect(wrapper.get('#email').attributes('aria-describedby')).toBe('email-error')
    expect(wrapper.get('#password').attributes('aria-invalid')).toBe('true')
  })

  it('explains invalid email format and clears errors as fields are corrected', async () => {
    const wrapper = mount(LoginView, { global: { stubs: { RouterLink: true } } })
    await wrapper.get('#email').setValue('invalid-email')
    await wrapper.get('form').trigger('submit')
    expect(wrapper.get('#email-error').text()).toContain('name@example.com')

    await wrapper.get('#email').setValue('name@example.com')
    await wrapper.get('#password').setValue('existing-password')

    expect(wrapper.get('#email-error').text()).toBe('')
    expect(wrapper.get('#password-error').text()).toBe('')
    expect(wrapper.get('#email').attributes('aria-invalid')).toBe('false')
    expect(wrapper.get('#email').attributes('aria-describedby')).toBeUndefined()
  })

  it.each(['name@localhost', 'name@example.c', 'name..surname@example.com'])(
    'rejects %s using the backend email rules',
    async (email) => {
      const wrapper = mount(LoginView, { global: { stubs: { RouterLink: true } } })
      await wrapper.get('#email').setValue(email)
      await wrapper.get('form').trigger('submit')
      expect(wrapper.get('#email-error').text()).toContain('Enter a valid email address')
    },
  )

  it.each(['name+board@example.com', 'élise@example.com'])(
    'accepts %s using the backend email rules',
    async (email) => {
      const wrapper = mount(LoginView, { global: { stubs: { RouterLink: true } } })
      await wrapper.get('#email').setValue(email)
      await wrapper.get('#password').setValue('existing-password')
      await wrapper.get('form').trigger('submit')
      expect(wrapper.get('#email-error').text()).toBe('')
    },
  )

  it('rejects blank email but does not apply registration strength rules to login passwords', async () => {
    const wrapper = mount(LoginView, { global: { stubs: { RouterLink: true } } })
    await wrapper.get('#email').setValue('   ')
    await wrapper.get('#password').setValue('a')
    await wrapper.get('form').trigger('submit')
    expect(wrapper.get('#email-error').text()).toBe('Email is required.')
    expect(wrapper.get('#password-error').text()).toBe('')

    await wrapper.get('#email').setValue('name@example.com')
    await wrapper.get('form').trigger('submit')
    expect(wrapper.get('#email-error').text()).toBe('')
  })
})
