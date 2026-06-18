# Visual Database Designer

A browser-based database designer where the schema is **written as YAML in an
embedded VSCode (Monaco) editor** and rendered as an **automatically arranged**
ER diagram. The code is the single source of truth — the diagram is display-only
and re-lays out (via [ELK](https://github.com/kieler/elkjs)) on every change.

## Run it

```bash
npm install
npm run dev            # start the dev server
npm test               # run parser/validation unit tests
npm run test:coverage  # tests + enforced coverage gate
npm run lint           # ESLint
npm run typecheck      # tsc --noEmit
npm run format:check   # Prettier
npm run build          # typecheck + production build
```

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
- **verify-coverage** — vitest with the **enforced coverage gate** (thresholds in
  `vite.config.ts`); uploads `coverage/` as an artifact.
- **verify-sonar** — SonarQube/SonarCloud scan ingesting `coverage/lcov.info`; runs
  only when a `SONAR_TOKEN` secret is configured (skips cleanly otherwise).
- **build-image** — builds the Docker image to a tarball artifact (no registry push),
  so the Dockerfile is verified on every push/PR.
- **publish-image** — only on `main` and `v*` tags: loads the built image and
  **publishes to GHCR** at `ghcr.io/pgatzka/designer` (tags: semver, `sha-<commit>`,
  and `latest` on the default branch) using the built-in `GITHUB_TOKEN`. Runs only
  after build-image, verify-sonar, verify-lint and verify-typecheck all pass.

### Docker

Multi-stage build (`Dockerfile`): Node builds the SPA, nginx serves the static files
(`docker/nginx.conf`, with SPA history fallback + gzip).

```bash
docker build -t designer .
docker run --rm -p 8080:80 designer   # http://localhost:8080
```

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

- `src/schema/parse.ts` — YAML → typed `Database` with collected validation errors.
- `src/graph/toReactFlow.ts` — `Database` → React Flow nodes/edges + column badges.
- `src/layout/elkLayout.ts` — ELK layered auto-arrangement.
- `src/components/` — Monaco `Editor`, React Flow `Canvas`, `TableNode`, `ErrorBar`.
