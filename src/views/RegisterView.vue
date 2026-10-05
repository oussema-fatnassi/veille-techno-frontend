<script setup lang="ts">
import { onBeforeUnmount, ref } from 'vue'
import { RouterLink, useRouter } from 'vue-router'
import { register } from '@/api/auth'
import { useAuthStore } from '@/stores/auth'
import { useApiRequest } from '@/composables/useApiRequest'
import Button from 'primevue/button'
import BaseInput from '@/components/ui/BaseInput.vue'

import isEmail from 'validator/lib/isEmail'
import isLength from 'validator/lib/isLength'
import { validateRegistrationPassword } from '@/validation/auth'

const router = useRouter()
const auth = useAuthStore()
const { loading, error, execute } = useApiRequest()
const controller = new AbortController()
onBeforeUnmount(() => controller.abort())

const name = ref('')
const email = ref('')
const password = ref('')

const submitted = ref(false)

const nameError = ref('')
const emailError = ref('')
const passwordError = ref('')

const nameInput = ref<InstanceType<typeof BaseInput> | null>(null)
const emailInput = ref<InstanceType<typeof BaseInput> | null>(null)
const passwordInput = ref<InstanceType<typeof BaseInput> | null>(null)

function validateName() {
  if (!submitted.value) return

  if (!name.value.trim()) {
    nameError.value = 'Name is required.'
  } else if (!isLength(name.value, { min: 1, max: 32 })) {
    nameError.value = 'Name must be between 1 and 32 characters.'
  } else {
    nameError.value = ''
  }
}

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

  passwordError.value = validateRegistrationPassword(password.value)
}

async function handleSubmit() {
  if (loading.value) return
  submitted.value = true

  validateName()
  validateEmail()
  validatePassword()

  if (nameError.value) {
    nameInput.value?.focus()
    return
  }

  if (emailError.value) {
    emailInput.value?.focus()
    return
  }

  if (passwordError.value) {
    passwordInput.value?.focus()
    return
  }

  const credentials = { name: name.value, email: email.value, password: password.value }
  const result = await execute(() => register(credentials, controller.signal))
  if (!result.ok || controller.signal.aborted) return

  password.value = ''
  submitted.value = false
  auth.clearSession()
  auth.registrationEmail = credentials.email
  auth.registrationMessage = result.data.message
  await router.replace({ name: 'login' })
}
</script>

<template>
  <main class="flex min-h-screen items-center justify-center bg-surface p-6">
    <div class="grid w-full max-w-5xl items-center gap-10 md:grid-cols-2">
      <section aria-labelledby="app-title" class="space-y-5">
        <img
          src="/KanbanBoardIcon.png"
          alt="Kanban board logo"
          class="mx-auto h-40 w-40 object-contain md:h-56 md:w-56"
        />
        <div class="space-y-2">
          <h1 id="app-title" class="text-center text-3xl font-bold">Veille Techno Board</h1>
          <p class="max-w-md text-muted">
            Create a workspace for tasks, columns, and project progress.
          </p>
          <p class="text-sm text-muted">Plan it. Move it. Finish it.</p>
        </div>
      </section>

      <section aria-labelledby="register-title" class="w-full max-w-sm md:justify-self-end">
        <h2 id="register-title" class="text-2xl font-bold">Create an account</h2>

        <form class="mt-6 space-y-4" novalidate @submit.prevent="handleSubmit">
          <BaseInput
            id="name"
            ref="nameInput"
            v-model="name"
            label="Name"
            :error="nameError"
            autocomplete="name"
            required
            @input="validateName"
          />

          <BaseInput
            id="email"
            ref="emailInput"
            v-model="email"
            :error="emailError"
            label="Email"
            type="email"
            autocomplete="email"
            required
            @input="validateEmail"
          />

          <BaseInput
            id="password"
            ref="passwordInput"
            v-model="password"
            label="Password"
            type="password"
            autocomplete="new-password"
            :error="passwordError"
            required
            @input="validatePassword"
          />

          <p v-if="error" role="alert" class="text-sm text-danger">{{ error.message }}</p>
          <Button
            type="submit"
            :label="loading ? 'Creating account…' : 'Create account'"
            :loading="loading"
            :disabled="loading"
            class="w-full cursor-pointer"
          />
        </form>

        <p class="mt-4">
          Already have an account?
          <RouterLink :to="{ name: 'login' }" class="text-primary underline"> Log in </RouterLink>
        </p>
      </section>
    </div>
  </main>
</template>
