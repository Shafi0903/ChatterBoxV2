# ChatterBox

ChatterBox is a real, privacy-first, all-in-one social communication web application combining Discord-style communities and channels, Instagram-style profiles and media feeds, Snapchat-style 24-hour ephemeral stories, WebRTC peer-to-peer audio/video calls, and Signal-inspired End-to-End Encrypted (E2EE) messaging.

Developed by **HeartSyncOrg**, ChatterBox is built as a modular monolith with strict security boundaries, zero fake data, honest UI states, and robust concurrency control.

---

## 1. Architecture & Tech Stack

```text
ChatterboxV2/
├── docs/                         # Architecture, API specifications, and security documentation
├── packages/
│   └── shared/                   # Shared TypeScript types, Zod schemas, Socket.IO contracts
├── apps/
│   ├── api/                      # NestJS modular monolith backend (Prisma, Socket.IO, Redis, S3)
│   └── web/                      # Next.js 15 App Router frontend (React 19, Tailwind CSS, Zustand)
├── docker-compose.yml            # Local development infrastructure (Postgres, Redis, RustFS S3)
├── docker-compose.prod.yml       # Production-hardened container stack with network isolation
├── Dockerfile.api                # Production multi-stage Docker build for NestJS backend
├── Dockerfile.web                # Production multi-stage Docker build for Next.js frontend
├── turbo.json                    # Turborepo task pipeline configuration
└── pnpm-workspace.yaml           # pnpm monorepo workspace definition
```

### Core Technologies

| Domain | Technology | Purpose |
| :--- | :--- | :--- |
| **Monorepo** | Turborepo + pnpm workspaces | Unified TypeScript types and shared contracts across web and API |
| **Backend** | NestJS, TypeScript, Express | Modular monolith with strict feature isolation and RBAC guards |
| **Database** | PostgreSQL 16 + Prisma ORM | Relational integrity, transactional concurrency, migrations |
| **Cache & Pub/Sub**| Redis 7 (`ioredis`) | Session tracking, Socket.IO multi-instance pub/sub, presence, rate limiting |
| **Real-Time** | Socket.IO | Bi-directional messaging, WebRTC signaling, typing & presence events |
| **Object Storage**| RustFS / MinIO / AWS S3 | S3-compatible media storage with pre-signed uploads & magic-byte validation |
| **Calling** | WebRTC (Mesh / P2P) | Direct peer-to-peer audio and video calls with STUN/TURN support |
| **Frontend** | Next.js 15, React 19, Tailwind CSS | Responsive web UI, Zustand stores, TanStack Query |
| **E2EE** | Web Crypto API (SubtleCrypto) | In-browser key pair generation, ECDH key exchange, AES-GCM-256 payload encryption |

---

## 2. Environment Configuration

Copy the example configuration file to get started:

```bash
cp .env.example .env
```

### Environment Variables Reference

| Variable | Required | Default / Example | Purpose |
| :--- | :---: | :--- | :--- |
| `NODE_ENV` | Yes | `development` / `production` | Execution environment |
| `PORT` | No | `4000` | Backend API port |
| `CORS_ORIGIN` | Yes | `http://localhost:3000` | Allowed CORS origins for REST and WebSockets |
| `TRUST_PROXY` | No | `true` (prod behind reverse proxy) | Set `true` only when behind a trusted reverse proxy (e.g. Nginx/Cloudflare) to safely evaluate `X-Forwarded-For` for rate limiting |
| `POSTGRES_USER` | Yes | `chatterbox` | PostgreSQL database username |
| `POSTGRES_PASSWORD` | Yes | *(secure password)* | PostgreSQL database password |
| `POSTGRES_DB` | Yes | `chatterbox_dev` (dev) / `chatterbox_prod` | PostgreSQL database name |
| `DATABASE_URL` | Yes | `postgresql://user:pass@localhost:5432/dbname?schema=public` | Prisma database connection string |
| `REDIS_PASSWORD` | Yes (prod) | *(secure password)* | Redis password authentication (`--requirepass`) |
| `REDIS_URL` | Yes | `redis://:password@localhost:6379` | Redis connection URL |
| `JWT_ACCESS_SECRET` | Yes | *(min 32 characters)* | Secret used to sign short-lived access JWTs (15m) |
| `JWT_REFRESH_SECRET` | Yes | *(min 32 characters)* | Secret used to hash and sign refresh tokens (7d) |
| `JWT_ACCESS_EXPIRES_IN` | No | `15m` | Lifetime of access tokens |
| `JWT_REFRESH_EXPIRES_IN`| No | `7d` | Lifetime of refresh tokens |
| `S3_ENDPOINT` | Yes | `http://localhost:9000` | S3 API endpoint URL (RustFS, MinIO, or AWS S3 internal) |
| `S3_PUBLIC_ENDPOINT` | No | `http://localhost:9000` | Public browser-accessible S3 endpoint for presigned direct browser uploads/downloads |
| `API_PUBLIC_URL` | No | `http://localhost:4000` | Public API base URL used for media proxy and short-lived media tokens |
| `S3_BUCKET` | Yes | `chatterbox-media` | Bucket name for avatars, banners, attachments, stories |
| `S3_ACCESS_KEY` | Yes | *(S3 key / rustfs key)* | S3 access key ID |
| `S3_SECRET_KEY` | Yes | *(S3 secret / rustfs secret)* | S3 secret access key |
| `THROTTLE_DISABLED` | No | `false` | Disables Throttler rate limiting (permitted strictly in non-production environments) |
| `STUN_URLS` | No | `stun:stun.l.google.com:19302` | STUN servers for WebRTC NAT traversal |
| `TURN_URL` | No | `turn:turn.example.com:3478` | Optional TURN relay server |
| `TURN_USERNAME` | No | *(TURN user)* | TURN authentication username |
| `TURN_CREDENTIAL` | No | *(TURN password)* | TURN authentication credential |
| `NEXT_PUBLIC_API_URL` | Yes | `http://localhost:4000/api/v1` | Public API base URL consumed by web app |
| `NEXT_PUBLIC_WS_URL` | Yes | `http://localhost:4000` | Public WebSocket URL consumed by web app |

---

## 3. Local Development Setup

### Prerequisites

- **Node.js**: `v20.x` or `v22.x` (LTS recommended)
- **pnpm**: `v9.x` or `v12.x` (corepack enabled)
- **Docker & Docker Compose**: for local PostgreSQL, Redis, and RustFS services

### Quick Start

1. **Install Dependencies:**
   ```bash
   pnpm install
   ```

2. **Start Infrastructure Services:**
   ```bash
   pnpm docker:up
   ```
   This starts:
   - PostgreSQL 16 on port `5432`
   - Redis 7 on port `6379`
   - RustFS S3 storage on port `9000` (API) and `9001` (Web Console)

3. **Generate Prisma Client & Run Migrations:**
   ```bash
   pnpm db:generate
   pnpm db:migrate
   ```

4. **Start Development Servers:**
   ```bash
   pnpm dev
   ```
   - Web application: [http://localhost:3000](http://localhost:3000)
   - Backend API: [http://localhost:4000/api/v1](http://localhost:4000/api/v1)
   - API Health Endpoint: [http://localhost:4000/api/v1/health](http://localhost:4000/api/v1/health)

---

## 4. Production Deployment

The project provides a hardened `docker-compose.prod.yml` configuration:

```bash
# Configure production secrets in .env
cp .env.example .env

# Build and start all production containers in isolated network
docker compose -f docker-compose.prod.yml up --build -d
```

### Production Security & Network Hardening

- **Internal Service Isolation:** PostgreSQL, Redis, and S3 are attached to the internal Docker network via `expose` (not published to host ports), preventing direct external access.
- **Redis Authentication:** Redis enforces `--requirepass ${REDIS_PASSWORD}`.
- **Reverse Proxy & Rate Limiting:**
  - When running behind an edge reverse proxy / load balancer (e.g. Nginx, Cloudflare), set `TRUST_PROXY=true`.
  - When exposing the API directly to the public internet without a reverse proxy, set `TRUST_PROXY=false` to prevent spoofing of `X-Forwarded-For` headers.
- **Health Checks & Dependency Ordering:** Containers define rigorous health check scripts to ensure database migrations and S3 bucket initialization complete before the API accepts traffic.

---

## 5. Testing & Quality Verification

All tests can be executed using standard pnpm and Turborepo commands:

```bash
# Run all unit tests across the monorepo
pnpm test

# Run API unit tests specifically
pnpm --filter @chatterbox/api test

# Run API End-to-End (E2E) integration tests (requires running PostgreSQL/Redis)
pnpm --filter @chatterbox/api test:e2e

# Run type-checking across all packages and apps
pnpm typecheck

# Lint all packages and apps
pnpm lint

# Build all applications for production
pnpm build
```

> [!NOTE]
> `apps/web` currently relies on TypeScript (`tsc --noEmit`), Next.js production build (`next build`), and backend E2E suites for validation, without an integrated frontend test runner configured in `package.json`. Comprehensive automated coverage for real-time signaling, E2EE cryptography, and backend business logic is provided in `apps/api/test/**` and `apps/api/src/**/*.spec.ts`.

---

## 6. Security Guarantees & Non-Negotiable Rules

1. **Zero Fake Data:** Every user, message, follower count, like count, community member count, and call state originates from PostgreSQL or live Redis/Socket.IO events.
2. **Strict Broken Access Control (BAC / IDOR) Defense:**
   - Channel management (`PATCH` / `DELETE`) requires `ADMIN` or `OWNER` community role.
   - Message deletions and edits verify authorship or moderator/admin roles.
   - Emoji reactions cannot be removed by non-members, and attempting to remove reactions on nonexistent messages returns clean `404 Not Found`.
   - Media downloads verify conversation or channel membership; sensitive media URLs cannot be accessed via unauthorized query parameter tokens.
3. **Magic-Byte Media Validation:**
   - Upload relays strictly inspect the first bytes (magic numbers) of uploaded files against claimed MIME types (JPEG, PNG, GIF, WebP, MP4, WebM, OGG, MP3, PDF) to prevent malicious executable uploads.
4. **End-to-End Encryption (E2EE):**
   - E2EE direct messages encrypt plaintext locally in the client browser before network transmission.
   - The backend server processes, stores, and relays only encrypted ciphertext (`isEncrypted: true`, initialization vectors, and key exchange headers). Plaintext is never stored or processed on the server.
5. **Session Revocation & Cleanup:**
   - Account deletion revokes all active JWT refresh tokens, terminates database sessions, and immediately evicts connected Socket.IO sockets.
   - Leaving or getting removed from groups instantly triggers socket room eviction.

---

## 7. License

Private repository owned and maintained by HeartSyncOrg.
