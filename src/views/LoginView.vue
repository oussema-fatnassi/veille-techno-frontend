<script setup lang="ts">
import { ref } from 'vue'
import isEmail from 'validator/lib/isEmail'
import BaseInput from '@/components/ui/BaseInput.vue'
import Button from 'primevue/button'
import { RouterLink, useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { useApiRequest } from '@/composables/useApiRequest'

const router = useRouter()
const auth = useAuthStore()
const { loading, error, execute } = useApiRequest()

const registeredEmail = auth.takeRegistrationEmail()
const registrationMessage = ref(auth.takeRegistrationMessage())
const email = ref(registeredEmail ?? '')
const password = ref('')
const emailInput = ref<InstanceType<typeof BaseInput> | null>(null)
const passwordInput = ref<InstanceType<typeof BaseInput> | null>(null)
const submitted = ref(false)
const emailError = ref('')
const passwordError = ref('')

function validateEmail() {
  if (!submitted.value) return
  if (!email.value.trim()) {
    emailError.value = 'Email is required.'
  } else if (!isEmail(email.value)) {
    emailError.value = 'Enter a valid email address, for example name@example.com.'
  } else {
    emailError.value = ''
  }
}

function validatePassword() {
  if (!submitted.value) return
  passwordError.value = password.value.length === 0 ? 'Password is required.' : ''
}

async function handleSubmit() {
  if (loading.value) return

  registrationMessage.value = ''
  submitted.value = true
  validateEmail()
  validatePassword()

  if (emailError.value) {
    emailInput.value?.focus()
    return
  }

  if (passwordError.value) {
    passwordInput.value?.focus()
    return
  }

  const result = await execute(() =>
    auth.signIn({
      email: email.value,
      password: password.value,
    }),
  )

  if (!result.ok) return

  password.value = ''
  submitted.value = false

  await router.replace({ name: 'board' })
}
</script>

<template>
  <main class="min-h-screen bg-surface p-6">
    <section aria-labelledby="login-title" class="max-w-sm">
      <h1 id="login-title" class="text-2xl font-bold">Log in</h1>
      <p class="mt-2">Sign in to access your board.</p>

      <p v-if="auth.sessionMessage" role="alert" class="mt-4 text-danger">
        {{ auth.sessionMessage }}
      </p>

      <p v-if="registrationMessage" role="status" class="mt-4 text-success">
        {{ registrationMessage }}
      </p>

      <form class="mt-6 space-y-4" novalidate @submit.prevent="handleSubmit">
        <BaseInput
          id="email"
          ref="emailInput"
          v-model="email"
          label="Email"
          type="email"
          autocomplete="username"
          :error="emailError"
          required
          @input="validateEmail"
        />

        <BaseInput
          id="password"
          ref="passwordInput"
          v-model="password"
          label="Password"
          type="password"
          autocomplete="current-password"
          :error="passwordError"
          required
          @input="validatePassword"
        />

        <p v-if="error" role="alert" class="text-sm text-danger">
          {{ error.message }}
        </p>

        <Button
          type="submit"
          :label="loading ? 'Logging in…' : 'Log in'"
          :loading="loading"
          :disabled="loading"
        />

        <p class="mt-4">
          Don’t have an account?
          <RouterLink :to="{ name: 'register' }" class="text-primary underline">
            Create an account
          </RouterLink>
        </p>
      </form>
    </section>
  </main>
</template>
