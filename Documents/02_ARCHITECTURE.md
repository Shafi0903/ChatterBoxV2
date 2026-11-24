# ChatterBox — Technical Architecture

## 1. Technology Stack

| Layer          | Technology                                                | Rationale                                                  |
| :------------- | :-------------------------------------------------------- | :--------------------------------------------------------- |
| Monorepo       | Turborepo + pnpm workspaces                               | Single repo for 6-person team; shared TypeScript contracts |
| Frontend       | Next.js (App Router), React 19, TypeScript, Tailwind CSS  | Fast SSR/CSR hybrid, responsive desktop & mobile web       |
| State / Data   | TanStack Query (server state) + Zustand (UI/socket state) | Clean cache invalidation and optimistic updates            |
| Backend        | Node.js (20 LTS), NestJS, TypeScript                      | Enforces modular monolith structure across multiple devs   |
| Real-Time      | Socket.IO (with Redis Adapter for horizontal scaling)     | Authenticated rooms, acknowledgments, auto-reconnection    |
| Database       | PostgreSQL 16 + Prisma ORM                                | Relational integrity, migrations, full-text search for MVP |
| Cache / PubSub | Redis 7                                                   | Online presence tracking, rate limiting, Socket.IO pub/sub |
| Object Storage | S3-compatible (MinIO in local Docker, AWS S3/R2 in prod)  | Keeps binary media out of PostgreSQL                       |
| Testing        | Vitest / Jest (Unit & Integration) + Playwright (E2E)     | Automated verification for API, auth, and core user flows  |

## 2. Monorepo Directory Structure

```text
chatterbox/
├── GEMINI.md                     # Antigravity permanent workspace rules
├── docker-compose.yml            # Local Postgres, Redis, MinIO
├── package.json                  # Root scripts (dev, build, lint, test)
├── turbo.json
├── docs/                         # Product & technical specs (01 to 06)
├── packages/
│   └── shared/                   # Shared Zod schemas, DTO types, Socket event enums
│       └── src/
│           ├── types/
│           ├── events/           # Socket.IO event name & payload contracts
│           └── validation/       # Shared input validation schemas
├── apps/
│   ├── api/                      # NestJS Modular Monolith
│   │   ├── prisma/
│   │   │   ├── schema.prisma
│   │   │   └── migrations/
│   │   └── src/
│   │       ├── main.ts
│   │       ├── app.module.ts
│   │       ├── common/           # Guards, decorators, filters, logging, rate-limit
│   │       └── modules/
│   │           ├── auth/         # Phase 1
│   │           ├── users/        # Phase 1
│   │           ├── profiles/     # Phase 1
│   │           ├── conversations/# Phase 2
│   │           ├── messages/     # Phase 2
│   │           ├── realtime/     # Phase 2 (Socket.IO gateway + presence)
│   │           ├── encryption/   # Phase 3
│   │           ├── media/        # Phase 4
│   │           ├── notifications/# Phase 4
│   │           ├── communities/  # Phase 5
│   │           ├── social/       # Phase 6
│   │           ├── calls/        # Phase 7
│   │           └── ai/           # Phase 8
│   └── web/                      # Next.js App Router Frontend
│       └── src/
│           ├── app/
│           │   ├── (auth)/       # /login, /register
│           │   └── (app)/        # Authenticated shell: /messages, /communities, /profile, /settings
│           ├── components/
│           │   ├── ui/           # Reusable primitives (Button, Input, Avatar, Modal)
│           │   ├── layout/       # Sidebar, TopBar, ThemeToggle
│           │   └── features/     # Feature-specific UI (chat/, profile/, communities/)
│           ├── hooks/            # useSocket, useAuth, useConversations
│           ├── lib/              # API client, socket client, formatting utils
│           └── stores/           # Zustand stores (UI state, active presence)
```

## 3. Architectural Boundaries

- **No Circular Dependencies:** Modules in `apps/api/src/modules/` communicate through exported NestJS services or an internal EventEmitter—never by importing each other's Prisma queries directly.
- **Shared Contracts First:** Any REST request/response type or Socket.IO event payload used by both frontend and backend MUST be defined in `packages/shared`.
- **Thin Frontend Components:** Business rules, permission checks, and unread calculations belong in `apps/api`, not React components.

## 4. Local Development Infrastructure (`docker-compose.yml`)

- **postgres:** `postgres:16-alpine` on port `5432` (database: `chatterbox_dev`)
- **redis:** `redis:7-alpine` on port `6379`
- **minio:** `minio/minio` on ports `9000` (S3 API) and `9001` (Web Console) — used starting Phase 4

## 5. Required Environment Variables

### `apps/api/.env.example`

```env
NODE_ENV=development
PORT=4000
CORS_ORIGIN=http://localhost:3000

DATABASE_URL="postgresql://chatterbox:chatterbox_dev@localhost:5432/chatterbox_dev?schema=public"
REDIS_URL="redis://localhost:6379"

JWT_ACCESS_SECRET="replace-with-32-char-random-secret"
JWT_REFRESH_SECRET="replace-with-different-32-char-secret"
JWT_ACCESS_EXPIRES_IN="15m"
JWT_REFRESH_EXPIRES_IN="7d"

# Phase 4 (Media)
S3_ENDPOINT="http://localhost:9000"
S3_BUCKET="chatterbox-media"
S3_ACCESS_KEY="minioadmin"
S3_SECRET_KEY="minioadmin"
```

### `apps/web/.env.example`

```env
NEXT_PUBLIC_API_URL="http://localhost:4000/api/v1"
NEXT_PUBLIC_WS_URL="http://localhost:4000"
```
