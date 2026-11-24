# ChatterBox — REST API & Real-Time Events Specification

## 1. Global API Conventions

- **Base URL:** `/api/v1`
- **Content-Type:** `application/json`
- **Authentication:**
  - `Authorization: Bearer <accessToken>` header (15-minute expiry).
  - `refreshToken` stored in an `HttpOnly`, `Secure`, `SameSite=Lax` cookie scoped to `/api/v1/auth`.
- **Standard Success Response:**
  ```json
  {
    "data": { ... },
    "meta": { "nextCursor": "...", "hasMore": true }
  }
  ```
- **Standard Error Response:**
  ```json
  {
    "error": {
      "code": "FORBIDDEN",
      "message": "You are not a member of this conversation.",
      "details": []
    }
  }
  ```
- **HTTP Status Codes:** `200 OK`, `201 Created`, `204 No Content`, `400 Bad Request` (validation), `401 Unauthorized` (unauthenticated/expired), `403 Forbidden` (not a member/no permission), `404 Not Found`, `409 Conflict` (duplicate email/username), `429 Too Many Requests`.

---

## 2. Phase 1 REST Endpoints (Auth, Profiles & Settings)

### Authentication (`/api/v1/auth`)

| Method | Route            | Auth   | Request Body                                     | Response                                            |
| :----- | :--------------- | :----- | :----------------------------------------------- | :-------------------------------------------------- |
| `POST` | `/auth/register` | Public | `{ email, username, displayName, password }`     | `201` `{ user, accessToken }` + sets refresh cookie |
| `POST` | `/auth/login`    | Public | `{ identifier, password }` _(email or username)_ | `200` `{ user, accessToken }` + sets refresh cookie |
| `POST` | `/auth/refresh`  | Cookie | _(none — reads HttpOnly cookie)_                 | `200` `{ accessToken }` + rotates refresh cookie    |
| `POST` | `/auth/logout`   | Bearer | _(none)_                                         | `204` revokes session & clears cookie               |
| `GET`  | `/auth/me`       | Bearer | _(none)_                                         | `200` `{ user, profile, settings }`                 |

### Users, Profiles & Settings

| Method  | Route                 | Auth   | Request Body / Query                                                                         | Response                                                                  |
| :------ | :-------------------- | :----- | :------------------------------------------------------------------------------------------- | :------------------------------------------------------------------------ |
| `GET`   | `/users/search`       | Bearer | `?q=<query>&limit=20`                                                                        | `200` list of matching users (excludes blocked/self)                      |
| `GET`   | `/profiles/:username` | Bearer | _(none)_                                                                                     | `200` public profile + real post/follower/following counts (0 in Phase 1) |
| `PATCH` | `/profiles/me`        | Bearer | `{ displayName?, bio?, avatarUrl?, location?, tags? }`                                       | `200` updated `Profile`                                                   |
| `GET`   | `/settings/me`        | Bearer | _(none)_                                                                                     | `200` current `UserSettings`                                              |
| `PATCH` | `/settings/me`        | Bearer | `{ theme?, profileVisibility?, showOnlineStatus?, showReadReceipts?, allowDirectMessages? }` | `200` updated `UserSettings`                                              |

---

## 3. Phase 2 REST Endpoints (Conversations & Messages)

### Conversations (`/api/v1/conversations`)

All endpoints below **must verify** that `req.user.id` is a `ConversationMember` (else return `403 Forbidden`).

| Method   | Route                                | Request Body / Query                    | Behavior & Response                                                                                                                                                 |
| :------- | :----------------------------------- | :-------------------------------------- | :------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `GET`    | `/conversations`                     | `?filter=all\|dm\|group&archived=false` | Returns user's conversations sorted by `lastMessageAt DESC`, each with `lastMessage`, `unreadCount` (computed from `lastReadAt`), and `members` with live presence. |
| `POST`   | `/conversations/dm`                  | `{ targetUserId }`                      | Idempotent via `dmKey`: returns existing 1:1 DM if found, else creates and returns `201`.                                                                           |
| `POST`   | `/conversations/group`               | `{ name, memberIds: string[] }`         | Creates `GROUP` conversation with creator as `OWNER` and valid members as `MEMBER`.                                                                                 |
| `GET`    | `/conversations/:id`                 | _(none)_                                | Returns conversation details and full member list with roles and live presence.                                                                                     |
| `PATCH`  | `/conversations/:id`                 | `{ name?, avatarUrl? }`                 | `OWNER`/`ADMIN` only (for groups). Updates group metadata.                                                                                                          |
| `POST`   | `/conversations/:id/members`         | `{ userIds: string[] }`                 | `OWNER`/`ADMIN` only. Adds members to group.                                                                                                                        |
| `DELETE` | `/conversations/:id/members/:userId` | _(none)_                                | Self can leave; `OWNER`/`ADMIN` can remove others.                                                                                                                  |
| `POST`   | `/conversations/:id/read`            | `{ lastReadMessageId }`                 | Updates member's `lastReadMessageId` & `lastReadAt`, emits `message:status` event.                                                                                  |

### Messages (`/api/v1/conversations/:id/messages` & `/api/v1/messages`)

| Method   | Route                            | Request Body / Query                              | Behavior & Response                                                                                                             |
| :------- | :------------------------------- | :------------------------------------------------ | :------------------------------------------------------------------------------------------------------------------------------ |
| `GET`    | `/conversations/:id/messages`    | `?cursor=<messageId>&limit=50`                    | Cursor-paginated history ordered newest-first, including `sender`, `reactions`, and `replyTo` preview.                          |
| `POST`   | `/conversations/:id/messages`    | `{ clientMessageId, content, type?, replyToId? }` | Persists message (idempotent on `senderId + clientMessageId`), updates `lastMessageAt`, broadcasts `message:new` via Socket.IO. |
| `PATCH`  | `/messages/:id`                  | `{ content }`                                     | Sender only. Updates `content` and sets `editedAt`; broadcasts `message:updated`.                                               |
| `DELETE` | `/messages/:id`                  | _(none)_                                          | Sender or Group `OWNER`/`ADMIN`. Sets `deletedAt` and clears `content`; broadcasts `message:deleted`.                           |
| `POST`   | `/messages/:id/reactions`        | `{ emoji }`                                       | Toggles/adds reaction for member; broadcasts `message:reaction`.                                                                |
| `DELETE` | `/messages/:id/reactions/:emoji` | _(none)_                                          | Removes current user's reaction; broadcasts `message:reaction`.                                                                 |

---

## 4. Phase 2 Real-Time Specification (Socket.IO)

### Connection & Authentication

- **Endpoint:** `NEXT_PUBLIC_WS_URL` (same NestJS server, `/socket.io`)
- **Handshake:** Client passes `{ auth: { token: accessToken } }`.
- **Server Verification:** Middleware verifies JWT on `connection`. Invalid or expired tokens are immediately disconnected with `AUTH_ERROR`.
- **Automatic Rooms:** Upon verified connection, the server joins the socket to:
  - `user:<userId>` (personal events, new conversation invites, notifications)
  - `conversation:<conversationId>` for every conversation the user belongs to in PostgreSQL.

### Message Delivery Lifecycle (Never Confuse States)

1. **`SENDING` (Client-only):** Optimistic UI state before server ack. Shows subtle pending indicator; rolls back or shows retry button on error/timeout.
2. **`SENT` (Single check):** Server validated membership and persisted the row in PostgreSQL.
3. **`DELIVERED` (Double grey check):** At least one recipient's active socket acknowledged receipt (`message:delivered`).
4. **`READ` (Double purple/blue check):** Recipient's `lastReadAt >= message.createdAt` (via `message:read` or `POST /conversations/:id/read`).

### Presence Rules (Redis-Backed, Zero Fake Indicators)

- Track active socket IDs per user in a Redis Set (`presence:sockets:<userId>`).
- User becomes `ONLINE` when Set size goes `0 -> 1` (if `settings.showOnlineStatus === true`).
- User becomes `OFFLINE` when Set size goes `1 -> 0` (after a 5-second grace period to avoid flicker on page reload).
- Broadcast `presence:changed` **only** to rooms/users who share a conversation with that user.

### Client -> Server Events

| Event               | Payload                                                    | Server Action & Ack                                                                                                                  |
| :------------------ | :--------------------------------------------------------- | :----------------------------------------------------------------------------------------------------------------------------------- |
| `conversation:join` | `{ conversationId }`                                       | Verifies membership in DB; joins socket room. Ack: `{ ok: boolean }`.                                                                |
| `message:send`      | `{ conversationId, clientMessageId, content, replyToId? }` | Validates membership, persists message (idempotent on `clientMessageId`), emits `message:new` to room. Ack: `{ ok: true, message }`. |
| `message:delivered` | `{ conversationId, messageId }`                            | Records `deliveredAt` in `MessageReceipt`; emits `message:status` to sender.                                                         |
| `message:read`      | `{ conversationId, lastReadMessageId }`                    | Updates `ConversationMember.lastReadAt` & `MessageReceipt.readAt`; emits `message:status` to room.                                   |
| `typing:start`      | `{ conversationId }`                                       | Broadcasts `typing:update` (`isTyping: true`) to other room members (auto-expires client-side after 4s).                             |
| `typing:stop`       | `{ conversationId }`                                       | Broadcasts `typing:update` (`isTyping: false`) to other room members.                                                                |

### Server -> Client Events

| Event                  | Payload                                                    | Frontend Handling                                                                                                                    |
| :--------------------- | :--------------------------------------------------------- | :----------------------------------------------------------------------------------------------------------------------------------- |
| `message:new`          | `{ message }`                                              | Deduplicate by `id` or `clientMessageId`; replace optimistic message or append; increment unread count if conversation isn't active. |
| `message:updated`      | `{ messageId, conversationId, content, editedAt }`         | Update message text and show `(edited)` indicator.                                                                                   |
| `message:deleted`      | `{ messageId, conversationId, deletedAt }`                 | Replace message body with _"This message was deleted"_.                                                                              |
| `message:reaction`     | `{ messageId, conversationId, reactions }`                 | Update reaction pill counts in place.                                                                                                |
| `message:status`       | `{ conversationId, messageId, userId, status, timestamp }` | Update checkmarks (`DELIVERED` / `READ`).                                                                                            |
| `typing:update`        | `{ conversationId, userId, displayName, isTyping }`        | Show/hide `"<Name> is typing..."` in active chat footer.                                                                             |
| `presence:changed`     | `{ userId, status }`                                       | Update green/amber/grey status dot in conversation list & Group Members panel.                                                       |
| `conversation:updated` | `{ conversation }`                                         | Refresh conversation list ordering, name, or member list.                                                                            |

### Reconnection & Catch-Up Protocol

When Socket.IO fires `reconnect`:

1. Client re-authenticates with a fresh access token if needed.
2. Client calls `GET /conversations` to sync unread counts and latest messages.
3. For the currently open conversation, client fetches messages newer than its last known `messageId` and merges them by `id` / `clientMessageId` so **zero duplicates** are rendered.
