# Fechi Organics

A Next.js 16 e-commerce platform for Fechi Organics — pure ingredients, honest farming.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 16.2.7 (App Router) |
| Language | TypeScript 5 (strict mode) |
| Styling | Tailwind CSS v4 |
| Auth | Better Auth 1.6.14 |
| Database ORM | Prisma 7 (PostgreSQL) |
| Package manager | pnpm |
| Tests | Vitest + Testing Library |

---

## Project Structure

```
app/
  (auth)/          — Login and Signup pages (no header/footer shell)
  api/auth/[...all]/  — Better Auth catch-all handler
components/auth/   — Reusable auth form components
lib/
  auth.ts          — Server-side Better Auth config (NEVER import from client code)
  auth-client.ts   — Browser-facing Better Auth client
  db.ts            — Prisma singleton (lazy, safe for Next.js builds)
prisma/
  schema.prisma    — Database schema
  migrations/      — SQL migrations (run with prisma migrate deploy)
proxy.ts      — Edge route protection
```

---

## First-Time Setup

### 1. Install dependencies

```bash
pnpm install
```

### 2. Set environment variables

Copy the example file and fill in every value:

```bash
cp .env.example .env.local
```

Open `.env.local` and set:

| Variable | How to get it |
|---|---|
| `DATABASE_URL` | Your PostgreSQL connection string |
| `BETTER_AUTH_SECRET` | Run `openssl rand -base64 32` |
| `BETTER_AUTH_URL` | `http://localhost:3000` for dev |
| `NEXT_PUBLIC_APP_URL` | Same as `BETTER_AUTH_URL` |
| `GOOGLE_CLIENT_ID` | [Google Cloud Console](https://console.cloud.google.com/apis/credentials) |
| `GOOGLE_CLIENT_SECRET` | Same as above |
| `FACEBOOK_CLIENT_ID` | [Facebook Developers](https://developers.facebook.com/apps/) |
| `FACEBOOK_CLIENT_SECRET` | Same as above |

### 3. Set up the database

You need a running PostgreSQL instance. Once `DATABASE_URL` is set:

```bash
# Run all migrations (creates tables + company ID trigger)
npx prisma migrate deploy

# Optional: open Prisma Studio to inspect data
npx prisma studio
```

#### Company ID trigger

Every new user row is automatically assigned a `companyId` in the format `FORGC-DHHSS`:

- `D` = ISO day of week (Monday = 1, Sunday = 7)
- `HH` = hour in 24-hour format, zero-padded
- `SS` = second, zero-padded

Example: A user created Wednesday at 14:42:07 → `FORGC-31442`

This is implemented as a PostgreSQL trigger in `prisma/migrations/20260604000000_init/migration.sql` — no application code needed.

### 4. Place custom fonts (optional, degrades gracefully without them)

The design uses two custom fonts. Place the files at:

```
public/fonts/VastagoGrotesk-Bold.woff2
public/fonts/Stagnan-Regular.woff2
```

Until the files exist, the browser falls back to `serif` (Vastago Grotesk) and `sans-serif` (Stagnan). The layout will look correct; only the typeface changes.

### 5. Start the dev server

```bash
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000).

---

## OAuth App Setup

### Google

1. Go to [Google Cloud Console — Credentials](https://console.cloud.google.com/apis/credentials).
2. Create an **OAuth 2.0 Client ID** (Web application).
3. Add to **Authorised redirect URIs**:
   - `http://localhost:3000/api/auth/callback/google` (development)
   - `https://yourdomain.com/api/auth/callback/google` (production)
4. Copy the Client ID and Secret into `.env.local`.

### Facebook

1. Go to [Facebook Developers — My Apps](https://developers.facebook.com/apps/).
2. Create a new app, select **Consumer** type.
3. Add the **Facebook Login** product.
4. Under **Valid OAuth Redirect URIs** add:
   - `http://localhost:3000/api/auth/callback/facebook` (development)
   - `https://yourdomain.com/api/auth/callback/facebook` (production)
5. Copy the App ID and App Secret into `.env.local`.

---

## Running Tests

```bash
# Run all tests once
pnpm test

# Watch mode (re-runs on file changes)
pnpm test:watch
```

Tests live in `__tests__/`. Coverage:

- `components/FormInput` — label, error state, aria attributes
- `components/PasswordInput` — show/hide toggle, error state
- `integration/login` — client validation, success redirect, wrong credentials
- `integration/signup` — all validation rules, password mismatch, duplicate email

---

## Auth Architecture

```
Browser                          Server
  │                                │
  ├─ POST /api/auth/sign-in  ─────►│ Better Auth route handler
  │                                │ → Validates credentials
  │                                │ → Creates session in DB
  │                                │ → Sets signed session cookie
  │◄─ Set-Cookie ─────────────────┤
  │                                │
  ├─ GET /dashboard ──────────────►│ Edge Middleware
  │                                │ → Checks session cookie presence
  │                                │ → If missing → redirect /login
  │◄─ 307 /login ─────────────────┤ (no DB call here)
```

Session tokens are stored in the `session` table and expire after 3hrs days. The Edge middleware does a fast cookie-presence check (no DB hit). Full session validation happens inside server components and API routes.

---

## Enabling Email Verification

Email verification via OTP is configured but the sender is stubbed. To enable:

1. Choose a provider (Resend is recommended for Next.js).
2. Install: `pnpm add resend`
3. In `lib/auth.ts`, replace the `console.log` in `sendVerificationOTP` with:

```typescript
import { Resend } from "resend";
const resend = new Resend(process.env.RESEND_API_KEY);

async sendVerificationOTP({ email, otp }) {
  await resend.emails.send({
    from: process.env.EMAIL_FROM!,
    to: email,
    subject: "Your Fechi Organics verification code",
    html: `<p>Your code is: <strong>${otp}</strong>. It expires in 5 minutes.</p>`,
  });
}
```

4. Set `requireEmailVerification: true` in `emailAndPassword`.
5. Add `RESEND_API_KEY` to `.env.local`.

---

## Deployment Checklist

Before deploying to production:

- [ ] Set all environment variables in your hosting platform (Vercel / Railway / Render)
- [ ] Update `BETTER_AUTH_URL` and `NEXT_PUBLIC_APP_URL` to your production domain
- [ ] Add production OAuth redirect URIs to Google and Facebook apps
- [ ] Run `npx prisma migrate deploy` against your production database
- [ ] Verify `BETTER_AUTH_SECRET` is a long random string (at least 32 bytes)
- [ ] Place custom font files in `public/fonts/` if not already done
- [ ] Enable `requireEmailVerification: true` in `lib/auth.ts` once email is wired
