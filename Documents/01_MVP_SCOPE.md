# ChatterBox — MVP Scope & Phased Roadmap

## 1. Core Product Statement

ChatterBox is a privacy-first social communication platform that unifies direct/group messaging, communities, social sharing, voice/video calling, and opt-in AI assistance into one coherent web experience.

## 2. Locked Product Decisions

| Area             | Locked Decision                                                                                  |
| :--------------- | :----------------------------------------------------------------------------------------------- |
| Initial Platform | Responsive Web App (Desktop + Mobile Browser); Mobile App (React Native) comes post-MVP          |
| Architecture     | Modular Monolith (`apps/api`) + Next.js Frontend (`apps/web`) + Shared Types (`packages/shared`) |
| Authentication   | Custom Auth (Argon2id password hashing, JWT Access Token + HTTP-only Refresh Cookie)             |
| Social Graph     | One-way Follow model (`Follow` table); mutual follows are treated as Friends                     |
| Media Storage    | S3-compatible object storage (MinIO locally, S3/R2 in production) via presigned URLs             |
| MVP v1 Cutoff    | **Phase 1 + Phase 2** (Working Auth, Profiles, and Real-Time 1:1 & Group Messaging)              |

## 3. Phased Implementation Roadmap

### Phase 1: Foundation, Auth & App Shell (MVP Core — Start Here)

- **Deliverables:**
  - Turborepo setup, Docker Compose (PostgreSQL, Redis, MinIO), Prisma baseline migrations.
  - Registration, Login, Logout, Refresh Token rotation, `/auth/me` session verification.
  - User Profile view & edit (`displayName`, `username`, `bio`, `avatarUrl`).
  - Persisted User Settings (Dark/Light theme toggle, basic privacy flags).
  - Responsive ChatterBox Dark-Neon App Shell (Sidebar, Top Search Bar, User Card, Navigation).
- **Acceptance Criteria:**
  - A user can register, log in, reload the page, and remain authenticated.
  - Profile updates persist in PostgreSQL.
  - Unauthenticated requests to protected endpoints return `401 Unauthorized`.
  - Unbuilt sections (Communities, Stories, Calls) show clean "Coming in Phase X" or hidden states—no fake data.

### Phase 2: Real-Time Direct & Group Messaging (MVP Core)

- **Deliverables:**
  - Search registered users to start a 1:1 DM or create a Group chat.
  - Conversation list with `All`, `DMs`, and `Groups` filters and real unread counts.
  - Persistent message history with cursor pagination, timestamps, and delivery/read states.
  - Real-time delivery, typing indicators, message reactions, and live online/offline presence via Socket.IO.
  - Optimistic UI message sending with rollback on failure and duplicate-event protection.
- **Acceptance Criteria:**
  - Two real accounts exchange messages in real time; messages persist across browser reloads.
  - Third unauthorized users receive `403 Forbidden` when attempting to read or join a private conversation.
  - Reconnecting clients sync missed messages without rendering duplicates.

### Phase 3: Security Hardening & End-to-End Encryption (E2EE)

- **Deliverables:**
  - Device registration & public key bundle storage (`DeviceKey` table).
  - Established E2EE protocol (e.g., Signal Protocol / Olm-Megolm or WebCrypto X25519 + AES-GCM) for supported 1:1 chats.
  - Key backup/recovery warning and clear E2EE verification status in UI.
  - Backend stores only ciphertext for E2EE rooms.

### Phase 4: Media Sharing & Real-Time Notifications

- **Deliverables:**
  - Presigned upload pipeline for images, videos, files, and browser-recorded voice messages.
  - Authorized media access and file size/MIME validation.
  - Persistent `Notification` system (new messages, mentions, group invites, follows) with live unread badge and mark-as-read.

### Phase 5: Communities & Channels (Discord-Inspired)

- **Deliverables:**
  - Create/join/leave communities, invite links, category browsing (`Gaming`, `Technology`, `Education`, etc.).
  - Role-based access control (`OWNER`, `ADMIN`, `MODERATOR`, `MEMBER`).
  - Public and private text/announcement channels with backend-enforced permissions.

### Phase 6: Social Feed & Ephemeral Stories (Instagram/Snapchat-Inspired)

- **Deliverables:**
  - Follow/Unfollow users, Block/Report users, real follower/following counts.
  - Persistent Posts (text/image/video), Likes, Comments, and backend-generated Feed.
  - 24-hour expiring Stories with viewer tracking, reactions, and scheduled media cleanup.

### Phase 7: Voice & Video Calls

- **Deliverables:**
  - 1:1 WebRTC voice and video calls with Socket.IO signaling (offer/answer/ICE).
  - Call controls (mic mute, camera toggle, screen share, hang up) and real connection states.
  - Group calls via SFU (LiveKit) in a subsequent iteration.

### Phase 8: Opt-In AI Assistant

- **Deliverables:**
  - Writing assistance (rewrite, tone shift, grammar) and thread summarization.
  - Explicit per-action user consent UI; strictly blocked from silently reading E2EE plaintext.

## 4. Strictly Out of Scope for Phase 1–2

Do NOT implement the following during Phase 1 or Phase 2:

- Communities, servers, or channels
- Social feed posts or 24-hour stories
- WebRTC calling or LiveKit integration
- AI chat/summarization endpoints
- Mobile app (React Native) or push notifications (FCM/APNs)

## 5. Definition of Done

A feature is complete ONLY when:

1. Frontend UI is wired to real backend APIs/events with loading, empty, and error states.
2. Backend enforces authentication, input validation, and authorization.
3. Data persists in PostgreSQL via tracked migrations.
4. Automated unit and integration tests pass.
5. `tsc --noEmit`, lint, and production build succeed with zero errors.
