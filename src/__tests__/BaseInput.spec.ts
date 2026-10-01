import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import BaseInput from '../components/ui/BaseInput.vue'

describe('shared input', () => {
  it('binds values, emits input, and connects the label and error', async () => {
    const wrapper = mount(BaseInput, {
      props: { id: 'email', label: 'Email', modelValue: '', error: 'Enter an email.' },
    })
    expect(wrapper.get('label').attributes('for')).toBe('email')
    expect(wrapper.get('input').attributes('aria-describedby')).toBe('email-error')
    expect(wrapper.get('#email-error').text()).toBe('Enter an email.')
    await wrapper.get('input').setValue('person@example.com')
    expect(wrapper.emitted('update:modelValue')?.[0]).toEqual(['person@example.com'])
    expect(wrapper.emitted('input')).toHaveLength(1)
    await wrapper.setProps({ modelValue: 'updated@example.com', error: '' })
    expect(wrapper.get('input').element.value).toBe('updated@example.com')
    expect(wrapper.get('input').attributes('aria-describedby')).toBeUndefined()
  })

  it('exposes focus for the parent form', () => {
    const wrapper = mount(BaseInput, {
      attachTo: document.body,
      props: { id: 'name', label: 'Name', modelValue: '' },
    })
    wrapper.vm.focus()
    expect(document.activeElement).toBe(wrapper.get('input').element)
  })
})
