# Veille Techno Frontend

A Kanban frontend built with Vue 3, TypeScript, and Vite, using the existing NestJS API.

Current scope: project initialization (F03) and tests/CI infrastructure (F04). The Vue screen and Tailwind setup work; authentication and Kanban features are not implemented yet. Vue has been selected so development can start; the technology comparison report will be completed before submission. F01 research does not block the initialization work.

## Requirements

- Node.js **22.22.2**, recorded in `.nvmrc`.
- npm **11.20.0**, recorded in `package.json`.
- VS Code with **Vue - Official** (`Vue.volar`) for Vue/TypeScript support.

The lockfile records the exact installed dependency versions. Use the same Node and npm versions locally and in CI. The GitHub Actions workflow uses these versions too. CI invokes npm through `npx --yes npm@11.20.0` to avoid replacing the runner's global npm installation.

## Install and run

From the repository root:

```bash
# If you use nvm:
nvm install
nvm use

# Use npm 11 without changing your global npm installation:
npx --yes npm@11.20.0 ci
cp .env.example .env
npm run dev
```

Open the local URL printed by Vite, normally `http://localhost:5173`.

If npm 11.20.0 is already your active npm version, you can use `npm ci` directly. Commit changes to both `package.json` and `package-lock.json` when adding dependencies. To add a dependency with the pinned npm version:

```bash
npx --yes npm@11.20.0 install <package-name>
```

npm 10.9.7 failed to resolve this project's dependency graph with `Cannot read properties of null (reading 'edgesOut')`. Using npm 11.20.0 resolved the installation; bypassing peer checks is not required.

## Environment

Copy `.env.example` to `.env` and configure:

```dotenv
VITE_API_BASE_URL=http://localhost:3000/api
```

Use the full backend API base URL, including `/api`. Development startup and production builds reject missing or invalid values with a clear error. HTTP and HTTPS URLs are accepted; credentials, query strings, fragments, and relative URLs are rejected. There is no default production URL.

All `VITE_*` values are public and may be bundled into the browser application. Never place database credentials, JWT signing secrets, or passwords in them. Local `.env` and `.env.*` files are ignored; `.env.example` is versioned. Restart Vite after changing environment variables.

The default URL is for local development. The initial screen does not contact the API, so the backend is not needed to check F03. API requests, proxy/CORS configuration, and interceptors are covered by F05. Backend setup is documented in [veille-techno-backend](https://github.com/oussema-fatnassi/veille-techno-backend).

For a production build, supply the intended public API URL through the build environment or a local `.env.production` file before building. Use HTTPS for a deployed application and API. Vite preview is a local build check, not a production hosting setup.

## Checks

```bash
npm run check          # formatting, lint, application/E2E types, coverage, build
npm run test:unit:run  # unit/component tests once, without coverage
npm run test:coverage # tests with coverage thresholds
npm run build
npm run preview
```

`build` runs type checking and produces `dist/`. `preview` serves that build locally. `lint:check` and `format:check` do not edit files; `npm run lint` and `npm run format` apply fixes. `npm run test:unit` without `--run` starts watch mode.

For the generated browser smoke test:

```bash
npx playwright install chromium
npm run test:e2e
```

Keep `.env` configured for tests because Vitest shares the Vite configuration. Alternatively, provide `VITE_API_BASE_URL` through the environment, as CI does. The browser test builds the app, starts its own preview server on port 4173, and runs headless Chromium. It fails if that port is already occupied instead of testing a stale server. Application workflows against the real backend come in F15.

### HTTP mocks

`tests/mocks/` contains an MSW server, a sample list response, and reusable error handlers. `tests/setup.ts` starts interception for unit/component tests and resets overrides after every test. Unexpected requests fail instead of reaching a real backend.

```ts
import { server } from '../../tests/mocks/server'
import { listsError } from '../../tests/mocks/handlers'

server.use(listsError(403))
```

Supported fixtures: success, 400 validation (message array), 401 unauthenticated, 403 denied access, 404 missing resource, 500/503 server unavailability, and network failure (`listsNetworkError`). The test API base is `http://kanban.test/api`. Use per-test overrides for errors; never import these mocks into application code. The HTTP infrastructure tests use Axios to verify that responses and errors pass through the transport. They do not yet test an application API client or interceptors; those belong to F05.

### Coverage

`npm run test:coverage` writes HTML, LCOV, and JSON summaries to `coverage/`. Every included file must meet **80% lines, branches, functions, and statements**. Thresholds are already enforced, including for new untested files under `src/` or `config/`.

Coverage excludes tests, type declarations, and the application/router bootstrap (`src/main.ts`, `src/router/index.ts`). The browser smoke test exercises startup. Keep business logic out of those bootstrap files; new services, stores, components, and configuration logic remain subject to coverage. Mock infrastructure is outside the application coverage scope and has its own verification tests.

### GitHub Actions

`.github/workflows/ci.yml` runs on pull requests, pushes to `main`, and manual dispatch. It installs from the lockfile, checks formatting/lint/types, runs unit/component tests with coverage, builds, and runs the Chromium smoke test. A failed step fails the job. Coverage and browser reports are retained for seven days, including on failures when reports exist. The workflow needs no backend secrets or running database.

Run `npm run check` followed by `npm run test:e2e` before opening a PR. These are local checks; a successful GitHub-hosted run can only be confirmed after the workflow is committed and pushed.

To verify the failure gate, temporarily make a test assertion fail, run `npm run test:coverage`, and check that it exits nonzero. Restore the assertion and rerun before committing. Do not commit an intentionally failing test. To check coverage enforcement separately, temporarily add an untested function under `src/` and verify that the same command fails its thresholds.

## Stack and organization

- Vue 3 with Composition API and `<script setup lang="ts">`.
- Vue Router for navigation and Pinia for shared state.
- Tailwind CSS with its Vite plugin; Headless UI and Heroicons are installed for UI work.
- Axios is installed for the API client planned in F05.
- Vitest / Vue Test Utils, Playwright, ESLint, Oxlint, and Prettier.

```text
config/                 # build-time environment validation
src/
  assets/               # shared CSS, including the Tailwind import
  router/               # routes and navigation rules
  stores/               # Pinia stores
  __tests__/            # unit and component tests
  App.vue               # root component
  main.ts               # application entry point
tests/                  # shared unit-test setup and HTTP mocks
e2e/                    # browser tests
.github/workflows/      # GitHub Actions checks
```

Add `components/`, `views/`, and `services/` as the corresponding features are implemented. Keep API calls in services rather than repeating them in components. The generated counter store is a scaffold example, not Kanban functionality.

Conventions:

- Use English for code, comments, UI text, documentation, and tickets.
- Vue component filenames use PascalCase, for example `TaskCard.vue`.
- Functions and variables use camelCase; types/interfaces use PascalCase.
- Use descriptive filenames for services and stores, for example `auth.ts`.
- Keep TypeScript types explicit at API boundaries; avoid `any` as a workaround.
- Let Prettier handle formatting and ESLint/Oxlint check code quality.
- Use short branches such as `feat/F10-add-column`; link PRs to their issue.

## Tracking

[GitHub Project](https://github.com/users/oussema-fatnassi/projects/11) · [F03 initialization ticket](https://github.com/oussema-fatnassi/veille-techno-frontend/issues/3)

The required final report filename is `rapport-veille-front.pdf`; it will be added before submission.
