# Veille Techno Frontend - Kanban Board

A Kanban application built with **Vue 3 and TypeScript** for a frontend technology watch project. It connects to a NestJS API to store each user's columns and tasks.

The assignment's core features are creating columns, adding tasks, editing task titles and descriptions, and deleting tasks. This implementation also includes authentication, column management, task moves, and column reordering.

[Backend repository](https://github.com/oussema-fatnassi/veille-techno-backend) · [Project board](https://github.com/users/oussema-fatnassi/projects/11) · [Technology watch report](rapport-veille-front.md)

## Contents

- [Features](#features)
- [Technology](#technology)
- [Requirements](#requirements)
- [Installation](#installation)
- [Environment variables](#environment-variables)
- [Using the application](#using-the-application)
- [Tests](#tests)
- [Quality checks and CI](#quality-checks-and-ci)
- [Build and deployment](#build-and-deployment)
- [Troubleshooting](#troubleshooting)

## Features

- Register, log in, and log out.
- Access a personal board through protected routes.
- Create, rename, and delete columns.
- Reorder columns with **Move left** and **Move right** controls.
- Create tasks with a title and an optional description.
- Edit task titles and descriptions, including clearing a description.
- Move tasks to another column using a destination selector.
- Delete tasks after confirmation.
- Display loading, empty, validation, and API error states.
- Use the interface with a keyboard or touch input, with horizontal board scrolling on small screens.

Changes are stored by the backend. Deleting a column permanently deletes its tasks as well.

Drag-and-drop, search/filtering, due dates, and categories are not currently implemented.

## Technology

| Purpose                      | Tools                              |
| ---------------------------- | ---------------------------------- |
| Interface                    | Vue 3, TypeScript                  |
| Development and build        | Vite                               |
| Navigation and session state | Vue Router, Pinia                  |
| Components and styling       | PrimeVue, Aura theme, Tailwind CSS |
| HTTP requests                | Axios                              |
| Unit and component tests     | Vitest, Vue Test Utils, MSW        |
| Browser tests                | Playwright with Chromium           |
| Code checks                  | ESLint, Oxlint, Prettier, vue-tsc  |
| Continuous integration       | GitHub Actions                     |

Dependency versions are recorded in [package.json](package.json) and [package-lock.json](package-lock.json). Use the lockfile when installing dependencies.

## Requirements

- **Node.js 22.22.2**, the version used by [.nvmrc](.nvmrc) and frontend CI.
- **npm 11.20.0**, the version declared by the project.
- Git to clone the repositories.
- The [backend API](https://github.com/oussema-fatnassi/veille-techno-backend) and its PostgreSQL database for normal application use.
- Docker for the backend's local database and for isolated real API tests.

The backend has its own runtime and setup requirements. Follow its README in a separate terminal when starting it.

For VS Code, use **Vue - Official** for Vue and TypeScript support. Disable Vetur in this workspace to avoid conflicting Vue diagnostics.

## Installation

### 1. Clone and install the frontend

```bash
git clone https://github.com/oussema-fatnassi/veille-techno-frontend.git
cd veille-techno-frontend
nvm install
nvm use
npx --yes npm@11.20.0 ci
```

Skip the `nvm` commands if the required Node.js version is already installed. If npm 11.20.0 is active, `npm ci` can be used directly. The `npx` command runs the specified npm version without replacing your global installation.

### 2. Prepare the backend

Follow the [backend setup instructions](https://github.com/oussema-fatnassi/veille-techno-backend#requirements) to configure its environment, install dependencies, start PostgreSQL, and apply migrations. Then start the API from the backend repository:

```bash
npm run start:dev
```

With the backend's default port:

| Address                                | Purpose               |
| -------------------------------------- | --------------------- |
| `http://localhost:3000`                | API server            |
| `http://localhost:3000/api`            | Swagger documentation |
| `http://localhost:3000/api/auth/login` | Login endpoint        |

Use a backend revision supporting the current registration contract: `POST /api/auth/register` returns **202** with a `message`, including when the email already exists. The frontend does not expect a user record or a duplicate-email `409` response.

You can create an account through the frontend; seeding is not required. The backend's optional seed command deletes existing development data, so it should not be used just to obtain login credentials for an existing database.

### 3. Configure the frontend

From the frontend root, copy the example file if `.env` does not already exist:

```bash
cp .env.example .env
```

Set the API address:

```dotenv
VITE_API_BASE_URL=http://localhost:3000/api
```

### 4. Start the frontend

```bash
npm run dev
```

Open the URL printed by Vite, normally **http://localhost:5173**. Keep the backend running in its own terminal. Stop either development server with `Ctrl+C` in its terminal.

## Environment variables

| Variable               | Required                         | Example                     | Purpose                                                    |
| ---------------------- | -------------------------------- | --------------------------- | ---------------------------------------------------------- |
| `VITE_API_BASE_URL`    | Yes                              | `http://localhost:3000/api` | Backend target for the development and preview API proxy   |
| `API_TEST_BACKEND_DIR` | Only if the backend is elsewhere | `../veille-techno-backend`  | Backend checkout used by the isolated real API test runner |

`VITE_API_BASE_URL` must be an absolute HTTP or HTTPS origin, optionally followed by `/api`. Credentials, query strings, fragments, and other path prefixes are rejected. The Vite configuration validates it for development, builds, and tests, so keep `.env` configured even when testing with mocked responses.

The browser sends requests to `/api` on the frontend origin. In development and preview, Vite forwards them to the configured backend and keeps the `/api` path. Seeing `http://localhost:5173/api/...` in the browser's Network panel is therefore expected.

If the backend runs on port 3001, change the value to `http://localhost:3001/api` and restart Vite. Direct browser-to-backend requests are not needed for this local setup.

`.env` is ignored by Git. **All `VITE_` values must be treated as public:** do not place database passwords, JWT secrets, or private API keys in them. Backend secrets belong in the backend environment.

## Using the application

1. Open **Create an account** and enter your name, email, and password. The form displays the password requirements and validation errors.
2. After registration, log in with those credentials. The registration message is intentionally the same for new and existing email addresses; it does not confirm that a new account was created.
3. Select **New column** to add a workflow stage, then **New task** in that column.
4. Open a task to edit its title or description, move it to another column, or delete it.
5. Use a column's **Rename**, **Delete**, **Move left**, or **Move right** controls to manage the board.
6. Select **Log out** when finished.

Task moves append the task after the destination's existing tasks. Column reordering preserves the tasks and their order within each column. The API updates column positions individually; if a reorder is only partly saved, the frontend reports the failure and reloads the server's order before another attempt.

Sessions are kept **in memory**. Refreshing the page or reopening the app requires logging in again, but saved columns and tasks remain in the database. An expired session also returns you to login. An account's board is loaded again after login.

## Tests

### Unit and component tests

These tests use mocked HTTP responses and do not need PostgreSQL or the real API.

```bash
npm run test:unit:run
npm run test:unit
npm run test:coverage
```

The commands run the tests once, start watch mode, and generate coverage respectively. Coverage reports are written to `coverage/`; open `coverage/index.html` for the HTML report. The configured minimum is **80% per file** for statements, branches, functions, and lines.

### Browser and proxy tests

Install the Chromium browser used by Playwright:

```bash
npx playwright install chromium
```

Then run:

```bash
npm run test:e2e
npm run test:api
```

`test:e2e` builds and previews the application, checks user workflows at desktop and mobile widths, then runs shared UI checks. `test:api` checks the frontend proxy against a controlled test server. Neither command requires your development backend. Real-backend-only scenarios are skipped by `test:api`.

The test commands start and stop their own frontend servers. Keep these ports available and run the suites one at a time:

| Port  | Used by                                                 |
| ----- | ------------------------------------------------------- |
| 4173  | Application browser tests and the default local preview |
| 4180  | Shared UI browser tests                                 |
| 4174  | API browser tests                                       |
| 43123 | Controlled API test server                              |

On Linux, Playwright may also need system dependencies; CI installs them with `npx playwright install --with-deps chromium`.

The application browser suite writes an HTML report to `playwright-report/`. Open it with:

```bash
npx playwright show-report
```

Failure artifacts are written under `test-results/`. Some UI tests also save screenshots under `docs/ui/`. These generated directories are ignored by Git. The API suite disables traces, screenshots, and video so credentials and authorization headers are not captured in those artifacts.

### Isolated tests against the real API

Use this command to check persistence, account separation, and complete board operations against NestJS and PostgreSQL:

```bash
npm run test:api:real
```

Requirements: Docker is running, Chromium is installed, and a compatible backend checkout has its dependencies installed.

By default, the runner looks for the backend at `../../3 - Veille_Back_end/veille-techno-backend`, relative to the frontend root. If you cloned both repositories next to each other, use:

```bash
API_TEST_BACKEND_DIR="../veille-techno-backend" npm run test:api:real
```

An absolute path is also accepted; quote paths containing spaces. This variable is read from the shell environment, not the frontend `.env` file.

The runner creates a disposable PostgreSQL container, applies migrations, starts a separate backend on a free local port, runs the browser tests, and removes the temporary services and database afterward. It does **not** use your development database or the backend address configured in `.env`. Port 4174 must still be available for the test frontend.

Use this runner rather than setting `API_SMOKE_REAL` or `API_TEST_BACKEND_URL` manually. The runner manages the isolated target and test accounts.

## Quality checks and CI

Before opening a pull request, run:

```bash
npm run check
npm run test:e2e
npm run test:api
```

`npm run check` verifies formatting, lint, application and browser-test types, unit/component tests with coverage, and the production build. It does not run the browser suites or isolated real API tests.

Useful individual commands:

| Command                  | Purpose                                 |
| ------------------------ | --------------------------------------- |
| `npm run format:check`   | Check formatting without changing files |
| `npm run format`         | Apply Prettier formatting               |
| `npm run lint:check`     | Check ESLint and Oxlint rules           |
| `npm run lint`           | Apply supported automatic lint fixes    |
| `npm run type-check`     | Check Vue and application TypeScript    |
| `npm run type-check:e2e` | Check browser-test TypeScript           |

[GitHub Actions](.github/workflows/ci.yml) runs on pull requests targeting `main` or `dev`, pushes to `main`, and manual runs. It installs locked dependencies, runs the checks and controlled browser/proxy tests, and retains available test reports for seven days. CI does not provision the real backend; run `test:api:real` locally when validating API integration changes.

## Build and deployment

Create and inspect the production build locally:

```bash
npm run build
npm run preview
```

`build` checks application types and generates static files in `dist/`. Preview normally serves them at **http://localhost:4173**, using the same configured API proxy. It is a local verification server, not the production hosting setup.

For deployment:

- Serve `dist/` over HTTPS.
- Forward `/api` requests to the backend, preserving the path.
- Serve `index.html` for frontend routes such as `/login`, `/register`, and `/board` so direct navigation works.
- Handle `/api` before the frontend fallback, so failed API requests do not return the app's HTML.

Setting `VITE_API_BASE_URL` does not create a proxy on your production host. Configure that routing on the hosting server or platform. Keep the backend and database running independently of the static frontend.

## Troubleshooting

| Problem                                              | What to check                                                                                                                       |
| ---------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| Vite reports an invalid `VITE_API_BASE_URL`          | Create `.env` from `.env.example`, use an absolute HTTP(S) origin with an optional `/api` suffix, then restart Vite.                |
| Login or board requests fail with a connection error | Check that the backend and its database are running and that the configured backend port is correct.                                |
| Login returns `401` / “Invalid credentials”          | Check the email and password. An existing email shown in the database does not confirm that the supplied password matches.          |
| Registration returns `429`                           | Wait before retrying; the backend limits registration attempts.                                                                     |
| Registration reports an invalid response             | Check that the backend supports the generic `202` response containing a `message`.                                                  |
| Refreshing the page returns to login                 | This is expected: the session token is held in memory. Log in again to reload saved data.                                           |
| Tests fail because a port is occupied                | Stop the preview or another test run using the ports listed above; the suites require their own servers.                            |
| Playwright cannot find its browser                   | Run `npx playwright install chromium`.                                                                                              |
| Real API tests cannot find the backend               | Set `API_TEST_BACKEND_DIR` to the checkout containing the backend's `package.json` and installed `node_modules`.                    |
| Docker connection fails during isolated tests        | Start Docker and retry `npm run test:api:real`.                                                                                     |
| Vue imports show Vetur errors in VS Code             | Enable Vue - Official, disable Vetur for the workspace, and reload the editor. Check `npm run type-check` for compiler diagnostics. |
| A deployed API request returns HTML                  | Check that the hosting proxy handles `/api` before the SPA fallback.                                                                |

## Technology watch report

The comparison of Vue, Angular, and React and the justification for choosing Vue are in [rapport-veille-front.md](rapport-veille-front.md). The assignment's final PDF must be exported as `rapport-veille-front.pdf`; the Markdown file is its editable source.
