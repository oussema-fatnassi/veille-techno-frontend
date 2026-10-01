import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import RegisterView from '../views/RegisterView.vue'

describe('registration form scaffold', () => {
  it('shows missing fields, checks invalid values, and clears corrected errors', async () => {
    const wrapper = mount(RegisterView, {
      attachTo: document.body,
      global: { stubs: { RouterLink: true } },
    })
    await wrapper.get('#name').setValue('Draft')
    await wrapper.get('#email').setValue('draft')
    await wrapper.get('#password').setValue('draft')
    expect(wrapper.get('#name-error').text()).toBe('')
    expect(wrapper.get('#email-error').text()).toBe('')
    expect(wrapper.get('#password-error').text()).toBe('')
    await wrapper.get('#name').setValue('')
    await wrapper.get('#email').setValue('')
    await wrapper.get('#password').setValue('')
    await wrapper.get('form').trigger('submit')
    expect(wrapper.get('#name-error').text()).toBe('Name is required.')
    expect(wrapper.get('#email-error').text()).toBe('Email is required.')
    expect(wrapper.get('#password-error').text()).toBe('Password is required.')
    expect(document.activeElement?.id).toBe('name')
    await wrapper.get('#name').setValue('a'.repeat(33))
    expect(wrapper.get('#name-error').text()).toContain('32')
    await wrapper.get('#name').setValue('Learner')
    await wrapper.get('#email').setValue('invalid')
    await wrapper.get('form').trigger('submit')
    expect(document.activeElement?.id).toBe('email')
    expect(wrapper.get('#email-error').text()).toContain('valid email')
    await wrapper.get('#email').setValue('learner@example.com')
    await wrapper.get('#password').setValue('weak')
    await wrapper.get('form').trigger('submit')
    expect(document.activeElement?.id).toBe('password')
    expect(wrapper.get('#password-error').text()).toContain('8 to 20')
    await wrapper.get('#password').setValue('Learning1!')
    await wrapper.get('form').trigger('submit')
    expect(wrapper.get('#name-error').text()).toBe('')
    expect(wrapper.get('#email-error').text()).toBe('')
    expect(wrapper.get('#password-error').text()).toBe('')
  })
})
