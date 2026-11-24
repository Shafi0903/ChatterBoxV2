# ChatterBox — Antigravity Workspace Rules

## 1. Project Identity

- **Product:** ChatterBox (by HeartSyncOrg)
- **Repository:** `https://github.com/HeartSyncOrg/ChatterBox`
- **Mission:** Build a real, privacy-first, all-in-one social communication web application combining Discord-style communities, Instagram-style profiles/feeds, Snapchat-style ephemeral stories, and opt-in AI assistance.

## 2. Documentation Index (Read Before Coding)

Always consult the relevant spec in `docs/` before generating an Implementation Plan or modifying code:

- `@docs/01_MVP_SCOPE.md` — Phased roadmap, acceptance criteria, and strict out-of-scope rules.
- `@docs/02_ARCHITECTURE.md` — Monorepo layout, tech stack, module boundaries, and Docker setup.
- `@docs/03_DATABASE_SCHEMA.md` — PostgreSQL + Prisma models, relations, and indexes.
- `@docs/04_API_AND_EVENTS.md` — REST API contracts and Socket.IO real-time event specs.
- `@docs/05_DESIGN_SYSTEM.md` — Dark-neon UI tokens, layout rules, and component states.
- `@docs/06_SECURITY_AND_E2EE.md` — Auth, RBAC, E2EE architecture, and AI privacy boundaries.

## 3. Non-Negotiable Engineering Rules

1. **Zero Fake Production Data:** Never hardcode conversations, messages, online users, member counts, followers, likes, notifications, or call states. Every rendered metric or list must come from PostgreSQL or live backend events.
2. **Honest UI States:** Every data-driven view must handle `loading`, `empty`, `error`, and `success` states honestly. If a table is empty, render a clean empty state—never invent dummy activity.
3. **No Dead Buttons:** Every visible interactive button or link must trigger a real working flow (Frontend -> API/WebSocket -> Database) or be explicitly hidden/disabled until its phase is implemented.
4. **No Custom Crypto / No Fake E2EE:** Never claim a chat is End-to-End Encrypted unless real, verified cryptographic protocols are implemented and tested.
5. **Security & Authorization:** Validate all inputs server-side (Zod/class-validator). Enforce authentication and resource ownership/membership on every REST endpoint and Socket.IO event. Never expose secrets in `apps/web`.
6. **Modular Monolith Only:** Keep backend code organized into strict feature modules inside `apps/api`. Do not introduce microservices.
7. **Schema Discipline:** All database changes must go through tracked Prisma migrations. Never modify schemas manually.

## 4. Agent Workflow (Mandatory for Every Task)

1. **Inspect:** Read relevant existing files and `@docs/` specs first.
2. **Plan:** Produce an Implementation Plan Artifact listing exact files to create/edit, schema migrations, API endpoints, and test cases. Wait for approval on major features.
3. **Implement:** Write clean, typed TypeScript across `packages/shared`, `apps/api`, and `apps/web`.
4. **Verify:** Run type-check (`tsc`), linter, build, and automated tests (unit + integration). Never claim tests passed without running them.
5. **Report:** List exact files changed, commands run, test results, and any remaining setup steps.

## 5. Team & Git Rules (6-Member Team)

- Never push directly to `main`. Work on focused feature branches (`feat/<module>`, `fix/<issue>`).
- Do not overwrite or refactor unrelated modules outside the current task scope.
