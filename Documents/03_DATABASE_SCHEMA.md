# ChatterBox — Database Schema Specification

## 1. Database & ORM Rules

- **Engine:** PostgreSQL 16
- **ORM:** Prisma (`apps/api/prisma/schema.prisma`)
- **Primary Keys:** Use `@id @default(cuid())` (or `uuid()`) for all public-facing IDs—never expose sequential integer IDs in URLs.
- **Migrations:** Every schema change must be applied via `pnpm --filter api prisma migrate dev --name <descriptive_name>`. Never alter tables manually.
- **Data Separation:** Keep authentication secrets (`passwordHash`, `refreshTokenHash`) strictly separated from public `Profile` queries so sensitive fields are never accidentally serialized in API responses.
- **Phase Discipline:** Only add models to `schema.prisma` when starting their corresponding phase. Do NOT create Phase 5–8 tables during Phase 1–2.

---

## 2. Phase 1 Schema — Identity, Profiles & Settings

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

enum ThemePreference {
  DARK
  LIGHT
  SYSTEM
}

enum PresenceStatus {
  ONLINE
  AWAY
  IN_CALL
  OFFLINE
}

enum ProfileVisibility {
  PUBLIC
  FOLLOWERS_ONLY
  PRIVATE
}

model User {
  id              String         @id @default(cuid())
  email           String         @unique
  username        String         @unique
  passwordHash    String
  emailVerifiedAt DateTime?
  isActive        Boolean        @default(true)
  deletedAt       DateTime?
  createdAt       DateTime       @default(now())
  updatedAt       DateTime       @updatedAt

  profile         Profile?
  settings        UserSettings?
  sessions        Session[]

  // Phase 2 Relations (uncomment in Phase 2)
  // memberships     ConversationMember[]
  // messages        Message[]
  // reactions       MessageReaction[]

  @@index([email])
  @@index([username])
}

model Profile {
  id          String   @id @default(cuid())
  userId      String   @unique
  displayName String
  bio         String?  @db.VarChar(280)
  avatarUrl   String?
  bannerUrl   String?
  location    String?  @db.VarChar(100)
  tags        String[] @default([])
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  user        User     @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([displayName])
}

model UserSettings {
  id                  String            @id @default(cuid())
  userId              String            @unique
  theme               ThemePreference   @default(DARK)
  profileVisibility   ProfileVisibility @default(PUBLIC)
  showOnlineStatus    Boolean           @default(true)
  showReadReceipts    Boolean           @default(true)
  allowDirectMessages Boolean           @default(true)
  notifyNewMessages   Boolean           @default(true)
  notifyMentions      Boolean           @default(true)
  updatedAt           DateTime          @updatedAt

  user                User              @relation(fields: [userId], references: [id], onDelete: Cascade)
}

model Session {
  id               String    @id @default(cuid())
  userId           String
  refreshTokenHash String    @unique
  userAgent        String?
  ipAddress        String?
  expiresAt        DateTime
  revokedAt        DateTime?
  createdAt        DateTime  @default(now())

  user             User      @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId])
  @@index([expiresAt])
}
```
