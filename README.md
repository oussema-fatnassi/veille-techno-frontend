# Veille Techno Frontend - Kanban

Kanban frontend built with Vue 3, TypeScript, Vite, and Tailwind CSS, connected to the NestJS backend.

## Requirements

- Node.js **22.22.2** (see `.nvmrc`)
- npm **11.20.0**
- The [backend API](https://github.com/oussema-fatnassi/veille-techno-backend) running for real API requests

For VS Code, install the **Vue - Official** extension.

## Install Dependencies

From the project root:

```bash
nvm install
nvm use
npx --yes npm@11.20.0 ci
```

The `nvm` commands are optional if the required Node.js version is already installed. You can use `npm ci` directly if npm 11.20.0 is active.

## Environment Setup

Copy the example environment file:

```bash
cp .env.example .env
```

Configure the backend address:

```dotenv
VITE_API_BASE_URL=http://localhost:3000/api
```

| Variable            | Required | Description                                          |
| ------------------- | -------- | ---------------------------------------------------- |
| `VITE_API_BASE_URL` | Yes      | Backend URL for the local proxy; `/api` is optional. |

The `.env` file is local only and must not be committed. Values prefixed with `VITE_` are public: do not put passwords or secrets in them. Restart Vite after changing `.env`.

## Run the App in Development

Start the backend by following its [setup instructions](https://github.com/oussema-fatnassi/veille-techno-backend#environment-setup), then run:

```bash
npm run dev
```

Open the URL printed in the terminal, normally **http://localhost:5173**.

Sessions are kept in memory: refreshing the page requires login again. Use **Log out** to clear the current session.

Vite forwards `/api` requests to the configured backend, so no backend CORS change is needed for local development. If requests fail, check that the backend and its database are running and that `.env` uses the correct port.

## Tests

Keep `.env` configured when running tests.

### Unit and Component Tests

```bash
npm run test:unit:run  # run once
npm run test:unit      # watch mode
npm run test:coverage  # generate coverage reports
```

Coverage reports are saved in `coverage/`. The minimum coverage is **80% per file** for lines, branches, functions, and statements.

### Browser Tests

Install Chromium once:

```bash
npx playwright install chromium
```

Run the browser tests:

```bash
npm run test:e2e  # login, sessions, navigation, and shared UI
npm run test:api  # API proxy tests with a test server
```

These tests do not need the real backend. Keep ports **4173**, **4174**, **4180**, and **43123** available.

To check login, protected requests, and account switching against the real backend:

```bash
API_SMOKE_REAL=1 npm run test:api
```

Run this against a local development database. It creates and leaves dedicated test accounts. Set both `API_TEST_EMAIL` and `API_TEST_PASSWORD` to reuse an account for the login smoke test; the account-switching test still creates two isolated accounts. API test traces and screenshots are disabled to avoid saving credentials.

## Quality Checks

Before opening a pull request:

```bash
npm run check
npm run test:e2e
npm run test:api
```

`npm run check` runs formatting, lint, type checks, unit tests with coverage, and the build. Use `npm run format` or `npm run lint` to apply automatic fixes.

GitHub Actions runs these checks on pull requests to `main` and `dev`, pushes to `main`, and manual runs. CI does not require the real backend.

## Production Build

```bash
npm run build
npm run preview
```

The build is saved in `dist/`. Preview serves it locally, normally at **http://localhost:4173**, using the configured API proxy.

For deployment, use HTTPS and configure the hosting server to forward `/api` requests to the backend **before** the SPA fallback. Setting `VITE_API_BASE_URL` alone does not configure production routing. `npm run preview` is for local verification, not production hosting.
