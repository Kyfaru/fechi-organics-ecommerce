# public/blog/

Static assets served at the `/blog/` public path for the Fechi Organics blog.

## Contents

| File | Description |
|------|-------------|
| `placeholder.webp` | Fallback image shown on any blog post that has no `featuredImage` set in the CMS |

## Where placeholder.webp came from

Copied from the Fechi Organics design resource:

```
F:\Web Design\Fechi Organics\resources\Web Folder\Blog Page\3a9a17ea8f196245abbd159f0689b6c1.webp
```

## When it is used

Both `components/blog/BlogClient.tsx` (listing page cards) and `app/blog/[slug]/page.tsx`
(article hero) fall back to `/blog/placeholder.webp` when `post.featuredImage` is `null` or
`undefined`:

```tsx
src={post.featuredImage ?? "/blog/placeholder.webp"}
```

## How to replace it

1. Prepare your new image as a `.webp` file.
2. Drop it into this directory with the exact name `placeholder.webp`.
3. No code changes are needed — both components reference the path `/blog/placeholder.webp`
   directly.

Keep the file name identical. Changing the name requires updating the fallback path in both
`components/blog/BlogClient.tsx` and `app/blog/[slug]/page.tsx`.
