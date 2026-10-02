import { spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { access } from 'node:fs/promises'
import { createServer } from 'node:net'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { setTimeout as delay } from 'node:timers/promises'

const frontend = fileURLToPath(new URL('../', import.meta.url))
const backend = resolve(
  frontend,
  process.env.API_TEST_BACKEND_DIR || '../../3 - Veille_Back_end/veille-techno-backend',
)
const container = `veille-frontend-test-${randomUUID()}`
const database = 'veille_frontend_test'
const password = randomUUID()
let api
let tests
let stopping = false

function run(command, args, options = {}) {
  return new Promise((resolveRun, reject) => {
    const child = spawn(command, args, {
      cwd: frontend,
      ...options,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (data) => {
      stdout += data
    })
    child.stderr.on('data', (data) => {
      stderr += data
    })
    child.on('error', reject)
    child.on('exit', (code) =>
      code === 0
        ? resolveRun(stdout.trim())
        : reject(new Error(`${command} failed (${code}): ${stderr}`)),
    )
  })
}

async function stop(child) {
  if (!child || child.exitCode !== null || child.signalCode !== null) return
  const exited = new Promise((resolveStop) => child.once('exit', resolveStop))
  child.kill('SIGTERM')
  const timer = setTimeout(() => child.kill('SIGKILL'), 5000)
  await exited
  clearTimeout(timer)
}

async function cleanup() {
  if (stopping) return
  stopping = true
  await stop(tests)
  await stop(api)
  // Only the uniquely named container created by this run is removed.
  await run('docker', ['rm', '--force', '--volumes', container]).catch(() => {})
}
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.once(signal, () => {
    void cleanup().finally(() => process.exit(130))
  })
}

async function freePort() {
  const server = createServer()
  await new Promise((resolvePort, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolvePort)
  })
  const port = server.address().port
  await new Promise((resolveClose) => server.close(resolveClose))
  return port
}

try {
  await access(resolve(backend, 'node_modules/ts-node/register/transpile-only.js'))
  const port = await freePort()
  console.log('Starting disposable PostgreSQL and an isolated backend…')
  await run('docker', [
    'run',
    '--detach',
    '--rm',
    '--name',
    container,
    '--publish',
    '127.0.0.1::5432',
    '--tmpfs',
    '/var/lib/postgresql/data',
    '--env',
    'POSTGRES_USER=postgres',
    '--env',
    `POSTGRES_PASSWORD=${password}`,
    '--env',
    `POSTGRES_DB=${database}`,
    'postgres:17-alpine',
  ])
  let ready = false
  for (let attempt = 0; attempt < 60; attempt++) {
    try {
      await run('docker', ['exec', container, 'pg_isready', '-U', 'postgres', '-d', database])
      ready = true
      break
    } catch {
      await delay(500)
    }
  }
  if (!ready) throw new Error('Test PostgreSQL did not start.')
  const mapping = await run('docker', ['port', container, '5432/tcp'])
  const dbPort = Number(mapping.split(':').at(-1))
  if (!Number.isInteger(dbPort) || dbPort <= 0) throw new Error('Invalid test database port.')
  const env = {
    ...process.env,
    NODE_ENV: 'test',
    PORT: String(port),
    DB_HOST: '127.0.0.1',
    DB_PORT: String(dbPort),
    DB_USER: 'postgres',
    DB_PASSWORD: password,
    DB_NAME: database,
    DATABASE_URL: `postgresql://postgres:${password}@127.0.0.1:${dbPort}/${database}?schema=public`,
    JWT_SECRET: randomUUID(),
    JWT_EXPIRES_IN: '1h',
  }
  await run(process.execPath, ['node_modules/prisma/build/index.js', 'migrate', 'deploy'], {
    cwd: backend,
    env,
  })
  api = spawn(process.execPath, ['-r', 'ts-node/register/transpile-only', 'src/main.ts'], {
    cwd: backend,
    env,
    stdio: ['ignore', 'ignore', 'pipe'],
  })
  let apiError = ''
  api.stderr.on('data', (data) => {
    apiError += data
  })
  api.on('error', (error) => {
    apiError = error.message
  })
  const url = `http://127.0.0.1:${port}/api`
  ready = false
  for (let attempt = 0; attempt < 60; attempt++) {
    if (api.exitCode !== null || api.signalCode !== null)
      throw new Error(`Test API stopped: ${apiError}`)
    try {
      const response = await fetch(`${url}/users/me`)
      if (response.status === 401) {
        ready = true
        break
      }
    } catch {
      /* Wait for Nest to start. */
    }
    await delay(500)
  }
  if (!ready) throw new Error(`Test API did not start: ${apiError}`)
  const testEnv = { ...process.env, API_SMOKE_REAL: '1', API_TEST_BACKEND_URL: url }
  delete testEnv.API_TEST_EMAIL
  delete testEnv.API_TEST_PASSWORD
  tests = spawn(
    process.execPath,
    ['node_modules/@playwright/test/cli.js', 'test', '--config', 'playwright.api.config.ts'],
    { cwd: frontend, env: testEnv, stdio: 'inherit' },
  )
  process.exitCode = await new Promise((resolveTests, reject) => {
    tests.once('error', reject)
    tests.once('exit', (code) => resolveTests(code ?? 1))
  })
} catch (error) {
  console.error(error.message.replaceAll(password, '[redacted]'))
  process.exitCode = 1
} finally {
  await cleanup()
  console.log('Disposable API and database stopped. Development database was not used.')
}
