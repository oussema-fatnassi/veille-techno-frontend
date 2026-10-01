import { createApp } from 'vue'
import PrimeVue from 'primevue/config'
import { primeVueOptions } from '../../config/primevue'
import '../../src/assets/main.css'
import SharedUi from './SharedUi.vue'

createApp(SharedUi).use(PrimeVue, primeVueOptions).mount('#app')
