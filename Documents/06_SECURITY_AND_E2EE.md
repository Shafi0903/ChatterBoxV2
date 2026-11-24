# ChatterBox — Security, Authorization & E2EE Specification

## 1. Core Security Principles

- **Defense in Depth:** Frontend route guards improve UX, but **every security boundary must be enforced in `apps/api`**.
- **Least Privilege:** Users can only read or mutate conversations, groups, communities, media, and settings they are explicitly authorized for.
- **No Secret Leakage:** Never commit `.env` files, JWT secrets, database URLs, or AI/S3 keys. Never pass `passwordHash` or `refreshTokenHash` in any API response or WebSocket payload.

---

## 2. Authentication & Session Security (Phase 1)

- **Password Hashing:** `argon2id` (minimum 64 MiB memory, 3 iterations). Reject passwords under 8 characters.
- **Token Architecture:**
  - **Access Token:** Short-lived JWT (`15m`), signed with `JWT_ACCESS_SECRET`, sent in `Authorization: Bearer <token>`.
  - **Refresh Token:** Long-lived opaque/JWT token (`7d`), stored **hashed** in PostgreSQL (`Session.refreshTokenHash`) and delivered exclusively via `HttpOnly`, `Secure` (in prod), `SameSite=Lax` cookie.
- **Refresh Rotation & Reuse Detection:** Every `/auth/refresh` call revokes the old session token and issues a new pair. If a previously revoked refresh token is reused, revoke all active sessions for that user.
- **Auth Error Hygiene:** Return generic `"Invalid credentials"` on login failures—never reveal whether an email/username exists.
- **Rate Limiting:** Apply Redis-backed throttling on `/auth/login`, `/auth/register`, and `/auth/refresh` (e.g., 10 requests / minute per IP).

---

## 3. Backend Authorization Matrix (Enforced via NestJS Guards)

| Resource / Action                                                         | Required Check                                                                               | Failure Code            |
| :------------------------------------------------------------------------ | :------------------------------------------------------------------------------------------- | :---------------------- |
| Any `/api/v1/*` (except `/auth/login`, `/auth/register`, `/auth/refresh`) | Valid, non-expired Access JWT                                                                | `401 Unauthorized`      |
| Read/Send messages in `conversationId`                                    | `ConversationMember` row exists for `(conversationId, req.user.id)`                          | `403 Forbidden`         |
| Edit message                                                              | `message.senderId === req.user.id`                                                           | `403 Forbidden`         |
| Delete message                                                            | `message.senderId === req.user.id` OR Group `OWNER`/`ADMIN`                                  | `403 Forbidden`         |
| Add/Remove group members or rename group                                  | Caller's `ConversationMember.role` is `OWNER` or `ADMIN`                                     | `403 Forbidden`         |
| Join Socket.IO room `conversation:<id>`                                   | DB check confirms `ConversationMember` exists before `socket.join()`                         | Reject with `FORBIDDEN` |
| Access private media (Phase 4)                                            | Verify caller has access to parent message/post before issuing short-lived presigned GET URL | `403 Forbidden`         |

---

## 4. Input Validation & Application Hardening

- Validate all REST bodies, query params, and Socket.IO payloads using shared Zod schemas (`packages/shared`).
- Strip unknown fields (`whitelist: true`).
- Prevent XSS: Never use `dangerouslySetInnerHTML` for user messages, bios, or posts; sanitize any link previews.
- File Uploads (Phase 4): Validate MIME type via magic bytes (not just filename extension), enforce max size limits (e.g., 10 MB images, 50 MB video/files), and store with randomized S3 object keys.
- Security Headers: Enable `helmet` in NestJS and strict CORS allowing only `CORS_ORIGIN`.

---

## 5. End-to-End Encryption (E2EE) Architecture (Phase 3)

- **Honesty Rule:** Until Phase 3 is implemented and verified by automated cryptographic tests, `Conversation.isEncrypted` MUST remain `false` and the UI MUST NOT display "End-to-End Encrypted" badges on chats.
- **Protocol Direction:** Use an established, audited cryptographic library (e.g., Signal Protocol / `@privacyresearch/libsignal-protocol-typescript` or Matrix `vodozemac`/Olm-Megolm via WebAssembly). **Never invent custom encryption.**
- **Key Lifecycle:**
  - Private identity/session keys are generated client-side and stored only on the user's device (IndexedDB with WebCrypto non-extractable keys where supported).
  - Server stores only **public key bundles** (`identityPublicKey`, `signedPreKey`, `oneTimePreKeys`) per registered device.
  - For E2EE conversations, `Message.content` stores only base64 ciphertext + nonce/header. The backend must have zero access to plaintext.
- **Account Recovery:** Explicitly warn users that clearing device storage without an encrypted key backup will make past E2EE history unreadable.

---

## 6. AI Privacy & Consent Boundaries (Phase 8)

- **Zero Silent Processing:** The backend must never automatically send private or E2EE conversations to an external LLM API.
- **Explicit Per-Action Consent:** AI features (writing assistant, thread summary) trigger only when the user explicitly clicks an AI action and sees a clear disclosure of what text is being sent.
- **E2EE Boundary:** For E2EE chats, any AI feature must decrypt client-side on the user's device and submit only the user-selected excerpt with explicit consent—never bypass encryption on the server.
- **Transparency:** Clearly badge all AI-generated suggestions/summaries in the UI and document the external AI provider and its data-retention policy in Settings.
