# Visual Database Designer

A browser-based database designer where the schema is **written as YAML in an
embedded VSCode (Monaco) editor** and rendered as an **automatically arranged**
ER diagram. The code is the single source of truth — the diagram is display-only
and re-lays out (via [ELK](https://github.com/kieler/elkjs)) on every change.

Access is gated behind **email + password authentication** (self-service
registration). The app is an **npm-workspaces monorepo**:

- **`frontend/`** — Vite + React UI (designer + auth screens). UI only, no business logic.
- **`backend/`** — Fastify + PostgreSQL API owning auth and persistence. In production
  it also serves the built frontend, so the whole app is one Node process.

## Run it (development)

```bash
npm install                 # installs both workspaces

# 1. Start Postgres (compose) and export config for the backend:
docker compose up -d db
export DATABASE_URL="postgres://designer:designer@localhost:5432/designer"
export JWT_SECRET="a-long-random-dev-secret-value"

# 2. Run the two dev servers (separate terminals):
npm run dev:backend         # Fastify API on :3000 (runs migrations on boot)
npm run dev:frontend        # Vite on :5173, proxies /api -> :3000

# Quality gates (run across both workspaces):
npm test                    # unit tests (frontend parser + backend auth)
npm run test:coverage       # tests + enforced coverage gates
npm run lint                # ESLint
npm run typecheck           # tsc --noEmit
npm run format:check        # Prettier
npm run build               # build frontend + compile backend
```

## Run it (full stack, Docker)

```bash
cp .env.example .env        # set JWT_SECRET (>=16 chars) and POSTGRES_PASSWORD
docker compose up --build   # app on http://localhost:3000 + Postgres
```

The backend serves both the API (`/api/...`) and the static frontend. Register a new
account on first visit. Sessions are an httpOnly JWT cookie; passwords are hashed with
argon2. No email verification (MVP).

## CI/CD

GitHub Actions (`.github/workflows/ci.yml`) is split into small single-purpose jobs
wired into a dependency graph (shared setup lives in `.github/actions/setup`):

```
verify-formatting → verify-compilation ┬→ verify-typecheck ─────────────┐
                                       ├→ verify-lint ──────────────────┤
                                       └→ verify-tests ┬→ verify-coverage → verify-sonar ┤
                                                       └→ build-image ────────────────────┤
                                                                                          → publish-image
```

- **verify-formatting** — Prettier (`format:check`).
- **verify-compilation** — `npm run build` (TypeScript compiles + Vite bundles).
- **verify-typecheck** — `tsc --noEmit`.
- **verify-lint** — ESLint.
- **verify-tests** — vitest.
- **verify-coverage** — vitest with **enforced coverage gates** for both workspaces
  (frontend `vite.config.ts`, backend `vitest.config.ts`); uploads coverage as an artifact.
- **verify-sonar** — SonarQube/SonarCloud scan ingesting `coverage/lcov.info`. This is
  a **required gate**: it **fails** (and blocks `publish-image`) unless a `SONAR_TOKEN`
  secret is configured and `sonar.projectKey`/`sonar.organization` are set in
  `sonar-project.properties`.
- **build-image** — builds the Docker image to a tarball artifact (no registry push),
  so the Dockerfile is verified on every push/PR.
- **publish-image** — only on `main` and `v*` tags: loads the built image and
  **publishes to GHCR** at `ghcr.io/pgatzka/designer` (tags: semver, `sha-<commit>`,
  and `latest` on the default branch) using the built-in `GITHUB_TOKEN`. Runs only
  after build-image, verify-sonar, verify-lint and verify-typecheck all pass.

### Docker

Multi-stage build (`Dockerfile`): builds the frontend (Vite) and the backend (tsc),
then a `node:24-alpine` runtime runs the backend, which serves the API **and** the
static frontend. The image needs Postgres + `JWT_SECRET` at runtime — use
`docker compose up` (see "Run it, full stack") rather than running the image alone.

### One-time setup

- **GHCR**: no extra secret needed — the workflow's `packages: write` permission on
  `GITHUB_TOKEN` is enough. The first publish creates the package; set its visibility
  / link it to the repo in the GitHub package settings.
- **Sonar**: create the project on SonarCloud (or a self-hosted SonarQube), set
  `sonar.projectKey` and `sonar.organization` in `sonar-project.properties`, and add a
  repo secret `SONAR_TOKEN` (plus `SONAR_HOST_URL` if self-hosted). Until then the
  Sonar job is a no-op.

## The YAML format

```yaml
database:
  schemas:
    public:
      tables:
        user:
          columns:
            id:
              type: integer
              nullable: false
            username:
              type: varchar
              length: 25
              nullable: false
          constraints:
            pk_user__id:
              type: primary-key
              columns:
                - id
        address:
          columns:
            id:
              type: integer
              nullable: false
            user_id:
              type: integer
              nullable: false
          constraints:
            pk_address__id:
              type: primary-key
              columns:
                - id
          foreign-keys:
            fk_address__user_id:
              source-column: user_id
              table: user
              target-columns: id
```

- **columns** — `type` (required), `length` (optional), `nullable` (default `true`).
- **constraints** — each has `type` (`primary-key` | `unique` | `index`) and a
  `columns` list. `indices` is accepted as an alias.
- **foreign-keys** — `source-column`, `table` (target), `target-columns`. The
  column fields accept a single value or a list. Each FK draws a relationship edge.

Columns are annotated in the diagram with **PK / FK / UQ / IX** badges and a
not-null marker. Validation errors (bad YAML, unknown columns/tables, etc.) appear
in a bar over the canvas while the last valid diagram stays on screen.

## Architecture

Frontend (`frontend/src/`):

- `schema/parse.ts` — YAML → typed `Database` with collected validation errors.
- `graph/toReactFlow.ts` — `Database` → React Flow nodes/edges + column badges.
- `layout/elkLayout.ts` — ELK layered auto-arrangement.
- `components/` — Monaco `Editor`, React Flow `Canvas`, `TableNode`, `ErrorBar`, `AuthScreen`.
- `auth/` — `AuthContext` (session state) + `api.ts` (calls `/api/auth/*`).

Backend (`backend/src/`):

- `auth/` — `validation` (zod), `password` (argon2), `service` (register/login over a
  `UserRepository`), `routes` (`/api/auth/register|login|logout|me`, JWT cookie).
- `db/` — `pool`, `migrate` (idempotent `users` table), `userRepository` (pg).
- `app.ts` — Fastify factory (DI'd repository, so logic is tested without a DB);
  `static.ts` serves the frontend in production; `index.ts` boots it all.
