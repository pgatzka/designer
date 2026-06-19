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

## Self-host with Docker (published image)

No clone or build required — pull the published image and run it with Postgres using
the example Compose file:

```bash
# 1. Grab the example compose file and env template
curl -O https://raw.githubusercontent.com/pgatzka/designer/main/docker-compose.example.yml
curl -o .env https://raw.githubusercontent.com/pgatzka/designer/main/.env.example

# 2. Edit .env — set a strong JWT_SECRET (>=16 chars) and POSTGRES_PASSWORD
#    (tip: openssl rand -hex 32)

# 3. Start it
docker compose -f docker-compose.example.yml --env-file .env up -d
```

Open <http://localhost:3000> and register an account. The image (`ghcr.io/pgatzka/designer`)
serves the API and the SPA, and runs its database migrations on startup. Data persists in
the `pgdata` volume. Configure via `.env`: `JWT_SECRET`, `POSTGRES_PASSWORD`,
`IMAGE_TAG` (default `latest`), `APP_PORT` (default `3000`). Upgrade with
`docker compose -f docker-compose.example.yml --env-file .env pull && … up -d`.

## Run it (full stack from source)

```bash
cp .env.example .env        # set JWT_SECRET (>=16 chars) and POSTGRES_PASSWORD
docker compose up --build   # builds locally; app on http://localhost:3000 + Postgres
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
              target-column: id
```

- **columns** — `type` (required), `length` (optional), `nullable` (default `true`).
- **constraints** — each has `type` (`primary-key` | `unique` | `index`) and a
  `columns` list. `indices` is accepted as an alias.
- **foreign-keys** — `table` (target) plus the columns. Use the **singular**
  `source-column` / `target-column` for a single column (a scalar value), or the
  **plural** `source-columns` / `target-columns` for a list (composite keys). Each FK
  draws a relationship edge.

Tables, columns, constraints and foreign keys can also be edited from the canvas —
**right-click** a table (Add ▸ Column / Primary key / Unique / Index / Foreign key,
Rename, Delete), a **column** (Edit / Delete / Move), or the empty canvas (Add table,
Manage schemas).

Columns are annotated in the diagram with **PK / FK / UQ / IX** badges and a
not-null marker. Validation errors (bad YAML, unknown columns/tables, etc.) appear
in a bar over the canvas while the last valid diagram stays on screen.

## Architecture

### Designs & persistence

Each user can keep **multiple database designs**, listed in the left **explorer**
(create / select / rename / delete). The active design **auto-saves** (debounced) when
the YAML parses cleanly. Designs are **not stored as a YAML blob** — the YAML is parsed
into objects and persisted **normalized** (`designs → design_schemas → design_tables →
design_columns / design_constraints / design_foreign_keys`). On load the structure is
read back and serialized to canonical YAML for the editor.

Each design has a **flavor** — **PostgreSQL**, **MySQL** or **SQL Server** — chosen in
the **New design** dialog and **fixed for the life of the design** (it is design
metadata, not part of the editable YAML; the header shows it read-only). The flavor
drives **strict column-type validation**: a column whose `type` is not in the flavor's
catalog, or whose `length` violates the type's rule (e.g. MySQL `varchar` _requires_ a
length, PostgreSQL `integer` _forbids_ one), is a parse error in the error bar and is
**not saved**. The catalog lives in `frontend/src/schema/flavors.ts`.

Frontend (`frontend/src/`):

- `schema/parse.ts` — YAML → typed `Database`; `schema/serialize.ts` — `Database` → YAML.
- `graph/toReactFlow.ts` — `Database` → React Flow nodes/edges + column badges.
- `layout/elkLayout.ts` — ELK layered auto-arrangement.
- `components/` — Monaco `Editor`, React Flow `Canvas`, `TableNode`, `ErrorBar`,
  `AuthScreen`, `Explorer`.
- `auth/` — session state + `/api/auth/*` client; `designs/` — `/api/designs` client.

Backend (`backend/src/`):

- `auth/` — `validation` (zod), `password` (argon2), `service` (register/login over a
  `UserRepository`), `routes` (`/api/auth/register|login|logout|me`, JWT cookie).
- `designs/` — `schema` (zod), `routes` (`/api/designs` CRUD over a `DesignRepository`).
- `db/` — `pool`, `migrate` (idempotent tables), `userRepository`, `designRepository`
  (transactional, normalized read/write).
- `app.ts` — Fastify factory (DI'd repositories, so logic is tested without a DB);
  `static.ts` serves the frontend in production; `index.ts` boots it all.
