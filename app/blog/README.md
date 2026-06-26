# app/blog/

Server-side routes that power "The Fechi Journal" blog section of Fechi Organics.

## Routes

### `page.tsx` — listing page at `/blog`

A Next.js 15 async server component. It:

1. Calls `getPublishedPosts()` from `lib/queries/blog.ts` to fetch all posts with
   `status === PUBLISHED`, ordered by `publishedAt` descending.
2. Passes the result to `BlogClient` — the client component at
   `components/blog/BlogClient.tsx` — which handles search, category filtering, and
   all rendering.

The server component does no filtering itself. Filtering happens entirely in the
client via `useMemo` so there are no extra API calls when the user types in the
search box or picks a category.

### `[slug]/page.tsx` — article detail page at `/blog/[slug]`

A Next.js 15 async server component. It:

1. Calls `getPostBySlug(slug)` from `lib/queries/blog.ts`.
2. Returns `notFound()` if the post is missing or its status is not `PUBLISHED`.
3. Increments the `views` counter on `blogPost` as a fire-and-forget Prisma update —
   the render does not wait for it to finish:
   ```ts
   db.blogPost
     .update({ where: { slug }, data: { views: { increment: 1 } } })
     .catch(() => {});
   ```
4. Formats `publishedAt` using the `en-KE` locale (e.g. "24 June 2026") via
   `Intl.DateTimeFormat`.
5. Renders the article body via `dangerouslySetInnerHTML`. Content must be trusted
   HTML produced by the admin CMS — do not allow arbitrary user input here.

`generateMetadata` runs the same `getPostBySlug` call so Next.js can set the page
`<title>` and meta description for SEO. It prefers `seoTitle` / `metaDesc` fields
when present, falling back to `title` and `excerpt`.

## Data flow

```
Prisma (admin schema, blogPost table)
  → getPublishedPosts() / getPostBySlug()   [lib/queries/blog.ts]
  → BlogPage (server component)              [app/blog/page.tsx]
  → BlogClient (client component)            [components/blog/BlogClient.tsx]
```

The `BlogClient` receives the full post list once at render time. Client-side search
and category filtering operate on that in-memory list — no subsequent network requests.

## How to publish a new article

1. Go to the Admin CMS at `/admin/blog`.
2. Click "New Post".
3. Fill in: title, slug (URL-safe, lowercase, hyphenated), excerpt, content (HTML),
   category, and optionally a `featuredImage` URL.
4. Set **status** to `PUBLISHED` and set a `publishedAt` date.
5. Save. The post appears immediately at `/blog` on the next page load — there is no
   build step or cache invalidation required.

If `featuredImage` is left blank, both the listing card and the article hero fall back
to `/blog/placeholder.webp`. See `public/blog/README.md` for details.

## Design notes

- **Animations** — `FadeUp` and `ScaleIn` are Framer Motion wrappers defined inline in
  `BlogClient.tsx`. They trigger once when the element scrolls into view (`useInView`
  with `once: true`). They are not shared utilities.
- **Brand color** — `#27731e` (green-800) is the primary green used throughout. The
  hover state deepens to `#045a03` (green-900).
- **Layout** — the listing page uses a featured-post hero (first result) and a
  responsive card grid for the rest: 1 column on mobile, 2 on sm, 3 on lg.
- **Filtering** — search matches against `title` and `excerpt`. Category filtering
  matches the `category` field exactly. Both filters compose (AND logic).
