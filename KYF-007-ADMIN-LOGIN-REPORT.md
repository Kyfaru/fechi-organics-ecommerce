# KYF-007 — Admin Login Silent Failure + Phantom Deactivation
Investigation report. Read-only findings — no code changed in this pass.

## 1 · Confirmation table

| Finding | Status | Evidence | Notes |
|---|---|---|---|
| A — bare catch in admin login | **Confirmed** | `app/admin/login/page.tsx:223-225` | Bare `catch {`, no param, no logging, no Sentry import in file |
| B — `logActivity` not awaited (staff ban/unban) | **Confirmed** | `app/api/admin/staff/[id]/route.ts:158-162,222` | All 4 call sites in this file un-awaited; systemic repo-wide (16/16 call sites in the codebase are un-awaited) |
| C — orphaned `/api/admin/users` route, weak gate, no logging | **Confirmed, worse than described** | `app/api/admin/users/[id]/route.ts` (PATCH 113-153, DELETE 225-253); `app/api/admin/users/route.ts` (GET 18, POST 129) | Gates on `customers:*` not `staff:*`; **zero** `logActivity` calls in either file (not just un-awaited — never attempted). UI page (`app/admin/(protected)/users/page.tsx`) is a bare redirect; `AdminUsersClient.tsx` is unreferenced by any other file, but the API routes are still live over HTTP for anyone holding `customers:update` |

## 2 · Exact code excerpts

### Finding A — `app/admin/login/page.tsx:223-227`
```ts
223    } catch {
224      toast.error("Sign-in failed. Please try again.");
225    } finally {
226      setIsLoading(false);
227    }
```
No `Sentry` import anywhere in this file. Sentry *is* wired project-wide (`instrumentation.ts`, `sentry.server.config.ts`, `sentry.edge.config.ts`, `lib/api.ts:3,28`) — just not on this page. Calls inside the preceding `try` block (`handleCredentialsSubmit`, lines 158-228) that can fall into this catch:
- `checkPortalMatch(email, "admin")` — line 173 (fails open internally, so unlikely in practice)
- `authClient.signIn.email(...)` — line 183
- `authClient.signOut()` — lines 194 and 202
- `meRes.json()` — line 206, on a malformed error body from `/api/admin/me`

At least four distinct failure causes collapse into one indistinguishable toast with zero diagnostic trail.

### Finding B — `app/api/admin/staff/[id]/route.ts:158-162`
```ts
158    if (isBanChange) {
159      logActivity(ctx.id, typeof body.banned === "boolean" ? (body.banned ? "Deactivated staff member" : "Reactivated staff member") : "Updated ban reason", "staff", id, req);
160    }
161    if (isDetailsChange) logActivity(ctx.id, "Updated staff details", "staff", id, req);
162    if (isRoleChange || isPermissionChange) logActivity(ctx.id, "Changed staff role/permissions", "staff", id, req, { role: body.role, permissions: body.permissions });
```
Also un-awaited at line 222 (`DELETE`). `lib/admin-activity.ts:19-50` — `logActivity` is `async`, returns `Promise<void>`, and internally swallows all errors:
```ts
46    } catch (err) {
47      // Non-blocking: log to console but do not propagate
48      console.warn("[logActivity] Failed to write audit log:", err);
49    }
```
by explicit design ("audit logging is best-effort and must not break the primary request path" — file header comment, lines 11-12). So even an *awaited* call has no retry/alert on failure — but un-awaited is strictly worse on a serverless runtime, since the function can freeze mid-flight before the write is even attempted.

### Finding C — `app/api/admin/users/[id]/route.ts`
Permission gates (all `customers:*`, never `staff:*`):
```ts
64:   const denied = await requirePermission(req, { customers: ["view"] });     // GET
113:  const denied = await requirePermission(req, { customers: ["update"] });   // PATCH
225:  const denied = await requirePermission(req, { customers: ["update"] });   // DELETE
```
Ban/unban (PATCH, lines 148-153):
```ts
148  // --- Ban / unban via Better Auth admin plugin ---
149  if (banned === true && !target.banned) {
150    await auth.api.banUser({ headers: req.headers, body: { userId: id } });
151  } else if (banned === false && target.banned) {
152    await auth.api.unbanUser({ headers: req.headers, body: { userId: id } });
153  }
```
Deactivate (DELETE, lines 242-253):
```ts
242  // Ban via Better Auth so all active sessions are invalidated
243  if (!target.banned) {
244    await auth.api.banUser({ body: { userId: id } });
245  }
246
247  // Mark adminProfile inactive if this is an admin user
248  if (target.role === "admin" && target.adminProfile) {
249    await db.adminProfile.update({
250      where: { userId: id },
251      data: { isActive: false },
252    });
253  }
```
No `logActivity` import or call anywhere in either `app/api/admin/users/route.ts` or `app/api/admin/users/[id]/route.ts` — grep returns zero matches in both files. A comment at line 215 of `[id]/route.ts` claims the DELETE handler "does NOT remove the row — preserves audit history"; this is misleading, since no audit record is ever created for the deactivation event itself.

**Contrast with the correct pattern** — `app/api/admin/staff/[id]/route.ts` gates on `staff:update` (line 52), `staff:assign_roles` (line 56), `staff:delete` (line 179); logs (un-awaited, per Finding B) on every mutating branch; and has extra guards this route lacks: self-modification guard (62), super-admin-only promotion (98-100), super-admin-only hard delete (184-186), deactivate-before-delete invariant (196-198). `lib/permissions.ts:129-135` shows the `customer_care` role has `customers: ["view","update"]` but **no `staff` grants at all** — meaning a `customer_care`-level admin can ban/deactivate a `super_admin` through the orphaned route today.

**Reachability**: the only caller of `/api/admin/users*` anywhere in `app/` or `components/` is `components/admin/AdminUsersClient.tsx` (fetch calls at lines 577, 588, 603, 625, 647, 669), and that component is not imported/rendered by anything else in the repo. `app/admin/(protected)/users/page.tsx` is a 4-line bare `redirect("/admin/staff")`. So the routes are dead from the UI's link graph, but still live and directly reachable over HTTP (curl, stale bookmark, script, Postman) by anyone holding a `customers:update`-granting admin session.

## 3 · Audit-log forensics

No dev/staging DB connection was available in this session — no queries were run against any database. SQL for Jefferson to run himself (replace placeholders):

```sql
SELECT "createdAt", "adminProfileId", action, resource, "resourceId", "ipAddress", path
FROM "admin"."auditLog"
WHERE "resourceId" = '<AFFECTED_USER_ID>'
ORDER BY "createdAt" DESC;

SELECT u.id, u.email, u.banned, u."banReason", u."banExpires", u."updatedAt",
       ap."isActive", ap.role, ap."accessExpiresAt", ap."updatedAt" AS profile_updated
FROM "public"."user" u
LEFT JOIN "admin"."adminProfile" ap ON ap."userId" = u.id
WHERE u.email = '<AFFECTED_EMAIL>';
```

If `adminProfile.updatedAt` shows a deactivation timestamp with no matching `auditLog` row within a few seconds of it, that is direct proof the deactivation went through a non-logging path — consistent with either Finding C (route never logs at all) or a lost un-awaited promise per Finding B. Correlating the `path` column of the nearest surrounding `auditLog` rows (`/api/admin/staff/*` vs. never seeing `/api/admin/users/*` in server/edge access logs) can disambiguate which route was actually hit.

## 4 · Grep results (Task 5)

- **Bare `catch {}`** (no identifier): 100+ hits repo-wide — JSON-parse guards (e.g. `app/api/admin/staff/[id]/route.ts:36`), SSE stream cleanup, and similar. None wrap ban/unban logic or a `logActivity` call directly. Representative sample: `app/api/admin/zoho/organizations/[id]/route.ts:50`, `app/api/admin/faqs/[id]/route.ts:24`, `app/api/admin/blog/[id]/route.ts:58`, `app/api/admin/banners/[id]/route.ts:24`, `app/api/admin/campaigns/route.ts:67`, `app/api/admin/promotions/route.ts:51`, `app/api/admin/profile/route.ts:55`, `app/api/admin/suppliers/route.ts:54`, `app/api/admin/settings/route.ts:57`.
- **`catch (_)` / `catch (_e)`**: zero matches anywhere in the repo.
- **`logActivity(` calls not preceded by `await`**: every one of the 16 real call sites in the codebase is un-awaited. Full list: `app/api/admin/campaigns/[id]/send/route.ts:60`, `app/api/admin/campaigns/route.ts:85`, `app/api/admin/branches/[id]/zoho/route.ts:74`, `app/api/admin/blog/[id]/route.ts:84`, `app/api/admin/blog/[id]/publish/route.ts:55`, `app/api/admin/approvals/[id]/decide/route.ts:80`, `app/api/admin/faqs/route.ts:62`, `app/api/admin/testimonials/route.ts:99`, `app/api/admin/promotions/route.ts:70`, `app/api/admin/products/route.ts:103,176`, `app/api/admin/settings/route.ts:80`, `app/api/admin/products/[id]/permanent/route.ts:75`, `app/api/admin/staff/[id]/route.ts:159,161,162,222`, `app/api/admin/staff/set-password/route.ts:41`. The only `await logActivity(` hit anywhere is a doc-comment example in `lib/admin-activity.ts:9`, not a real call. This is a systemic pattern, not staff-specific.
- **`auth.api.banUser` / `auth.api.unbanUser` callers**: exactly one file — `app/api/admin/users/[id]/route.ts:150,152` (PATCH) and `:244` (DELETE). All three are properly awaited, but this file has zero `logActivity` calls, so these bans/deactivations produce no audit record at all, awaited or not.
- **Writers of `adminProfile.isActive: false`**: exactly one site — `app/api/admin/users/[id]/route.ts:249-252`. (`app/api/admin/users/route.ts:51` has a *read* filter on `isActive: false`, not a write.) Other `isActive: false` hits elsewhere in the repo (`prisma/seed.ts:87`, `components/admin/AdminShippingClient.tsx:43`, `components/admin/AdminProductsClient.tsx:1841`, `app/api/admin/products/[id]/route.ts:188`) are unrelated to `adminProfile` — seed data, shipping-zone mocks, and product soft-delete respectively.
- **Adjacent files checked**: `app/api/admin/staff/route.ts` is GET-only, no `logActivity` calls (not applicable — no mutations here). `app/api/admin/staff/invite/route.ts` creates new admin invites via `db.adminProfile.upsert` but also has zero `logActivity` calls — outside KYF-007's specific symptom (creation, not deactivation) but worth noting as the same systemic gap.

## 5 · Middleware / layout guard analysis (Task 6)

- No `middleware.ts` at repo root. `proxy.ts` handles `/admin/*` but only checks **session-cookie presence** (`hasSessionCookie`, line 172; redirect logic lines 198-205) — no DB call, no role or `isActive` check. This is by explicit design, per the file's own comments (lines 7-17, 26-33): full verification is deferred to `auth.api.getSession()` in server components/route handlers.
- `app/admin/(protected)/layout.tsx` (`AdminGuard`, lines 40-74): role check is a hard, direct gate — `user.role !== "admin"` → `redirect("/403")` (lines 51-52). `isActive` is checked only **indirectly**, via `checkPermissionPage()` → `lib/require-permission.ts:49` (`if (!profile?.isActive) return { denied: "inactive" }`), and only for pages that map to a registered permission `resource` (lines 58-65). A denied/inactive result redirects to `/admin` (line 64) — not a distinct "your account was deactivated" page or message.
  - **Gap not in the original brief**: pages with no registered resource (`isNoResourcePath`, lines 66-73) fall through to `return <>{children}</>;` with **no `isActive` check performed at all**. A deactivated admin can still load whichever pages are configured as no-resource-required.
- **No login-attempt-counter or automatic-lockout logic exists anywhere**, confirmed by: (a) `prisma/schema.prisma` — `user` model has `banned`/`banReason`/`banExpires`/`loginCount` (a lifetime counter, not attempt-based) and no `failedLoginAttempts`/`lockedUntil` field; `adminProfile` has `isActive`/`accessExpiresAt` and nothing lockout-related; (b) a repo-wide grep for `loginAttempt|failedLogin|lockout|lockedUntil|maxAttempts|LOGIN_ATTEMPT` returns zero matches.
- `lib/auth.ts:111-117` configures a generic Better Auth `rateLimit: { window: 60, max: 10 }` — global request throttling across all auth routes, not admin-specific, not an attempt counter, and does not touch `isActive`/`banned`.
  - **Doc/code mismatch found**: `lib/auth.ts:112-114`'s comment claims "Admin gets additional rate limiting enforced at the API route level (`app/api/auth/[...all]/route.ts`)". Reading that file shows it is only `export const { GET, POST } = toNextJsHandler(auth);` with a repeated comment — **no additional/admin-specific rate limiting logic actually exists there.**
- `lib/portal-check.ts` (`checkPortalMatch`) and `app/api/auth/portal-check/route.ts` both fail open by design in every error path (network failure, malformed body, DB error, rate-limit hit all resolve `{ ok: true }` / `true`) — confirmed this cannot itself be the source of the bare-catch failures in Finding A under normal conditions.
- `app/api/admin/me/route.ts` has no try/catch of its own; a DB exception here would surface as a 500, which the login page's `fetch` sees as `!meRes.ok` (handled explicitly, not via the catch) — unless the response body is non-JSON, in which case `meRes.json()` (page.tsx:206) throws into the bare catch.

## 6 · Ranked hypothesis

For the specific incident (generic toast on sign-in, then later found deactivated with no trail):

1. **Finding A** explains why the failed sign-in itself left no diagnostic trail — near-certain given the bare catch swallows every possible exception in that flow.
2. For the deactivation itself, **Finding B is the more likely mechanism for an accidental/normal-workflow deactivation**: the Staff page's ban toggle is reachable through ordinary UI use, and on a serverless runtime (Vercel) the un-awaited `logActivity` promise can be dropped when the function freezes right after the response is sent — producing exactly "deactivated, zero trail" without anyone doing anything unusual.
3. **Finding C is a real, arguably worse vulnerability** (never attempts to log at all; weaker permission gate letting `customer_care`-level staff deactivate a `super_admin`), but since `AdminUsersClient` is unreachable from any current UI navigation path, it likely requires an out-of-band caller (script, stale bookmark, Postman collection) to be the mechanism for *this particular* incident — plausible, but less likely than B unless something is still hitting that route directly.
4. Recommend running the Task 4 SQL against the real affected account to disambiguate B vs. C definitively before scoping the fix PR further.

## 7 · Proposed fix scope (no code — pending Jefferson's approval)

- **`app/admin/login/page.tsx`**: change the bare `catch` to `catch (err)`, add `console.error`, leave room/a marker for Sentry to hook in later. *Risk: none, purely additive.*
- **`app/api/admin/staff/[id]/route.ts`**: add `await` to all 4 `logActivity` calls (lines 159, 161, 162, 222). *Risk: none — purely additive ordering fix, negligible latency increase.*
- **`app/api/admin/users/route.ts` + `[id]/route.ts` + `AdminUsersClient.tsx` + its page**: either **delete** (dead UI, functionally redundant with `staff/[id]`, removes the weaker attack surface entirely) or **harden** to match `staff/[id]` (gate on `staff:*`, add awaited `logActivity`, add the missing safety guards). *Risk — deletion: must confirm nothing external (ops scripts, monitoring, Postman collections) still calls these routes before removing. Risk — hardening: touches permission checks on a currently-live route, higher regression risk if anything unexpectedly depends on today's looser `customers:update` gate.* **This choice is explicitly Jefferson's call**, not mine, per the brief.
- *(Optional, flagged not scoped)* Fix the misleading "preserves audit history" comment at `app/api/admin/users/[id]/route.ts:215` once that route's fate is decided.
- *(Optional, flagged not scoped)* Correct the `lib/auth.ts` doc-comment mismatch about admin-specific rate limiting. `lib/auth.ts` is on the deny-list, so this needs explicit "Jefferson approves editing lib/auth.ts" even for a comment-only change.
- *(Optional, flagged not scoped)* The `isNoResourcePath` gap in `app/admin/(protected)/layout.tsx` that skips the `isActive` check — separate from the three named findings; worth a decision on whether it's intentional before touching it.

## 8 · Open questions for Jefferson

1. Delete vs. harden the orphaned `/api/admin/users*` routes and `AdminUsersClient.tsx` — which do you want?
2. Is the `isNoResourcePath` bypass of the `isActive` check in `app/admin/(protected)/layout.tsx` intentional, or should it be closed alongside this fix?
3. Do you want the `lib/auth.ts` rate-limiting doc-comment corrected in the same PR (requires your explicit sign-off to touch a deny-listed file), or filed separately?
4. Can you run the Task 4 SQL (or grant a scoped read-only dev DB connection) so the ranked hypothesis (B vs. C) can be confirmed against the actual affected account before the fix PR is scoped further?
