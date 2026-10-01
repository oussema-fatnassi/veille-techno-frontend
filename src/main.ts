import { createApp } from 'vue'
import { createPinia } from 'pinia'
import PrimeVue from 'primevue/config'
import { primeVueOptions } from '../config/primevue'

import './assets/main.css'
import App from './App.vue'
import router from './router'
import { installSessionNavigation } from './router/session'

const app = createApp(App)

const pinia = createPinia()
app.use(pinia)
installSessionNavigation(router, pinia)
app.use(router)

app.use(PrimeVue, primeVueOptions)

app.mount('#app')
