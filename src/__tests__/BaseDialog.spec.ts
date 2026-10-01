import { mount, flushPromises } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import BaseDialog from '../components/ui/BaseDialog.vue'
import { primeVueOptions } from '../../config/primevue'

describe('shared dialog', () => {
  it('renders the title and slots and emits visibility changes on close', async () => {
    const wrapper = mount(BaseDialog, {
      props: { title: 'Example dialog', visible: true },
      slots: { default: '<p>Shared content</p>', footer: '<button>Cancel</button>' },
      global: { stubs: { teleport: true } },
    })
    await flushPromises()
    expect(wrapper.get('[role="dialog"]').attributes('aria-modal')).toBe('true')
    expect(wrapper.text()).toContain('Example dialog')
    expect(wrapper.text()).toContain('Shared content')
    expect(wrapper.text()).toContain('Cancel')
    await wrapper.get('button[aria-label="Close"]').trigger('click')
    expect(wrapper.emitted('update:visible')?.[0]).toEqual([false])
    await wrapper.setProps({ visible: false })
    expect(wrapper.find('[role="dialog"]').exists()).toBe(false)
  })

  it('uses a class-controlled dark theme', () => {
    expect(primeVueOptions.theme.options.darkModeSelector).toBe('.app-dark')
  })
})
