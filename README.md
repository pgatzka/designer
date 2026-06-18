# Visual Database Designer

A browser-based database designer where the schema is **written as YAML in an
embedded VSCode (Monaco) editor** and rendered as an **automatically arranged**
ER diagram. The code is the single source of truth — the diagram is display-only
and re-lays out (via [ELK](https://github.com/kieler/elkjs)) on every change.

## Run it

```bash
npm install
npm run dev      # start the dev server
npm test         # run parser/validation unit tests
npm run build    # typecheck + production build
```

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
