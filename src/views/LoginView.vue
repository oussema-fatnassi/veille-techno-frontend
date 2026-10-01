<script setup lang="ts">
import { ref } from 'vue'
import isEmail from 'validator/lib/isEmail'
import BaseInput from '@/components/ui/BaseInput.vue'
import Button from 'primevue/button'
import { RouterLink } from 'vue-router'

const email = ref('')
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

function handleSubmit() {
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
}
</script>

<template>
  <main class="min-h-screen bg-surface p-6">
    <section aria-labelledby="login-title" class="max-w-sm">
      <h1 id="login-title" class="text-2xl font-bold">Log in</h1>
      <p class="mt-2">Sign in to access your board.</p>

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

        <Button type="submit" label="Log in" />

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
