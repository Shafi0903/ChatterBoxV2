# ChatterBox — Design System & UI Specification

## 1. Visual Direction

ChatterBox uses a **dark-first, neon-accented interface** built for long daily communication sessions, paired with a persisted Dark/Light theme toggle.

- **Reference Mockup:** `docs/assets/ChatterBox Neon Social Dashboard.png` (visual styling reference ONLY—never copy its sample users, chats, or numbers into production code).
- **Styling Engine:** Tailwind CSS with CSS custom properties (`variables.css`) so Light and Dark themes switch cleanly without hardcoding hex values inside components.

---

## 2. Color Tokens

### Dark Theme (Default)

| Token              | Hex                         | Usage                                                   |
| :----------------- | :-------------------------- | :------------------------------------------------------ |
| `--bg-canvas`      | `#0B0B12`                   | App outer background                                    |
| `--bg-surface`     | `#13131F`                   | Sidebar, conversation list, right panel                 |
| `--bg-elevated`    | `#1B1B2B`                   | Cards, received message bubbles, search bar, modals     |
| `--bg-hover`       | `#232338`                   | Hover states on list rows and icon buttons              |
| `--border-subtle`  | `rgba(255, 255, 255, 0.08)` | Panel dividers and card outlines                        |
| `--text-primary`   | `#F8FAFC`                   | Headings, usernames, primary message text               |
| `--text-secondary` | `#94A3B8`                   | Message previews, timestamps, metadata                  |
| `--text-muted`     | `#64748B`                   | Placeholders, offline labels                            |
| `--accent-primary` | `#7C3AED`                   | Active nav pill, primary CTAs, sent message bubble base |
| `--accent-bright`  | `#8B5CF6`                   | Hover state, gradient highlight, story rings            |
| `--status-online`  | `#22C55E`                   | Online dot, "Join" community CTA                        |
| `--status-away`    | `#F59E0B`                   | Away indicator                                          |
| `--status-busy`    | `#EF4444`                   | In-a-call indicator, unread badge, end-call button      |
| `--status-offline` | `#6B7280`                   | Offline indicator                                       |

### Light Theme (Persisted via `UserSettings.theme`)

- `--bg-canvas`: `#F4F5F9` | `--bg-surface`: `#FFFFFF` | `--bg-elevated`: `#F1F5F9`
- `--border-subtle`: `#E2E8F0` | `--text-primary`: `#0F172A` | `--text-secondary`: `#475569`
- Retain `--accent-primary` (`#7C3AED`) and status colors for brand consistency.

---

## 3. Typography & Spacing

- **Font Family:** `Inter` (primary UI & messages), `JetBrains Mono` (code blocks / shortcuts like `⌘ K`).
- **Scale:**
  - Page / Panel Title: `18px–20px`, `font-semibold` (`600`)
  - Section / Chat Header: `15px–16px`, `font-semibold` (`600`)
  - Body / Message Text: `14px`, `font-normal` (`400`), `leading-relaxed`
  - Metadata / Timestamps / Badges: `11px–12px`, `font-medium` (`500`)
- **Radius:** `16px` (`rounded-2xl`) for panels/cards and message bubbles; `12px` (`rounded-xl`) for nav items and inputs; `9999px` (`rounded-full`) for avatars, pills, and icon buttons.

---

## 4. Application Layout & Responsive Breakpoints

### Desktop (`>= 1280px`)

1. **Left Navigation Sidebar (`220px` fixed):**
   - Brand header: Purple speech-bubble logo + `ChatterBox` + tagline `Connect · Chat · Share · Belong`.
   - Primary Nav: `Home`, `Messages` (with live unread badge only when `count > 0`), `Calls`, `Communities`, `Stories`, `Discover`, `Profile`, `Settings`.
   - Bottom User Card: Logged-in user avatar, display name, live presence dot, and quick status/logout menu.
2. **Top Header Bar (`64px` height):**
   - Centered global search trigger (`Search users, messages, or communities...` with `⌘ K` hint).
   - Right utility group: Theme toggle pill, Notifications bell (with live unread badge only when `count > 0`), and Profile avatar shortcut.
3. **Workspace Area (route-dependent — do NOT force 3 columns on every page):**
   - **Messages (`/messages`):** 3-pane split — Conversation List (`300px`, `+` new chat button, `All / DMs / Groups` filter pills) + Active Chat Window (flex-1) + collapsible Right Members/Details Panel (`260px`).
   - **Profile (`/profile/:username`):** Centered header (avatar, display name, `@username`, bio, interest tags, real `Posts / Followers / Following` counters, `Edit Profile` or `Follow / Message` CTA) + tabbed 3-column media grid (`Posts`, `Stories`, `Saved`).
   - **Communities (`/communities` — Phase 5):** Category filter rail (`All`, `Gaming`, `Technology`, `Education`, `Music`, `Art`, `Sports`) + Featured hero banner + `Popular / Trending / Yours` tabs.
   - **Stories (`/stories` — Phase 6):** Horizontal story ring strip (`Your Story` + followed users) + vertical 9:16 story viewer cards.
   - **Calls (`/calls` — Phase 7):** Full-bleed remote video, corner Picture-in-Picture local video, floating bottom control bar (Mic, Camera, Screen Share, Red Hang-Up, Participants).

### Tablet (`768px–1279px`) & Mobile (`< 768px`)

- Collapse Left Sidebar into a slide-over drawer or bottom navigation bar (`Home`, `Messages`, `Communities`, `Discover`, `Profile`).
- On `/messages` mobile, show either the Conversation List OR the Active Chat Window with a clear back arrow—never squash both panes side-by-side.
- Minimum interactive touch target: `44px × 44px`. No horizontal overflow on `360px` viewports.

---

## 5. Mandatory UI States (Honest UX Rule)

Every data-driven component MUST implement all four states:

1. **Loading:** Subtle pulsing skeleton matching final layout geometry (no blank white flashes).
2. **Empty:** Clear icon + concise message + single primary action (e.g., _"No conversations yet. Start a direct message or create a group."_).
3. **Error:** Non-destructive inline banner or toast with a working `Retry` button.
4. **Optimistic / Pending:** Pending messages render at `70%` opacity with a clock/spinner icon; if the API/socket fails, show a red `Failed — Retry` control.
