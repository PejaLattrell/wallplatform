# The Wall

A little piece of 2008, built with React 19, Next.js, TypeScript, Tailwind CSS, shadcn/ui, and Supabase. Visitors can share messages without signing in. The public feed shows every post newest first and receives new posts through Supabase Realtime.

## Run locally

This workspace is already connected to the **Wall** project in your **Personal Projects** Supabase organization. The local public credentials are in the ignored `.env.local` file. Start it with `npm run dev`; do not overwrite that file with the example.

For a fresh clone:

```powershell
npm ci
Copy-Item .env.example .env.local
```

Add your Supabase project URL and **public anon or publishable key** to `.env.local`, then run:

```powershell
npm run dev
```

Open http://localhost:3000. Restart the development server after changing environment variables.

Without both environment variables, the app runs in a clearly labeled **local preview** mode. Preview posts are saved only in this browser's local storage and sync between its tabs. They are not stored in Supabase and are not shared with other visitors. Adding Supabase configuration switches to the real database feed; preview posts are not uploaded.

## Configure Supabase

1. Create a Supabase project or choose an existing project.
2. Run [`supabase/setup.sql`](supabase/setup.sql) in the project's SQL Editor. It creates the `posts` table, enables row level security, permits public reads and validated inserts, and enables Realtime. Public visitors cannot update or delete posts.
3. Copy the project URL and a publishable key from the Supabase project settings into `.env.local`. `NEXT_PUBLIC_SUPABASE_ANON_KEY` accepts either the legacy anon key or a modern publishable key. `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` is also supported and takes precedence.
4. Restart the app. The connection indicator should change to live.

Only public keys belong in `NEXT_PUBLIC_` variables. Do not use a service-role or secret key. This app intentionally allows anyone to read and create posts; production moderation and abuse protection would be separate extensions.

Messages are limited to 280 Unicode code points and cannot contain only whitespace. These rules are enforced in both the client and the database. All visitors post with the same display name, and no authentication is required.

The hook subscribes before fetching and fetches again when the subscription becomes ready or reconnects, merges posts by ID, and reloads the feed when the browser comes back online or the tab becomes visible. Loading and posting errors are shown without discarding the draft.

## Deploy to Vercel

1. Push this project to a GitHub repository.
2. Import the repository at https://vercel.com/new. Vercel detects Next.js automatically; use the repository root.
3. Add `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` to the Vercel project's **Production** environment using the same public values as `.env.local`.
4. Deploy. If you add or change environment variables later, redeploy because Next.js includes public variables at build time.
5. Open the production `https://your-project.vercel.app` domain and confirm the indicator says live.

A public production deployment requires importing the repository into your Vercel account and setting the public environment variables before building.

For this workspace, the database setup has been applied to project `uuaydckpqxrtowyderuq` in Singapore. In Vercel, use `https://uuaydckpqxrtowyderuq.supabase.co` as the project URL and copy the public key from `.env.local`. This repository has not been deployed or submitted to the application site.

Likes, saves, and the “My posts” list are browser preferences. The public post text and timestamps are stored in Supabase. The five community profiles and local SVG portraits are illustrative; all real posts share the name Alex Morgan.

## Verify the submission

- Open the production URL in two separate browser windows.
- Share a unique message in one window. It should appear in both without refreshing.
- Refresh the page and confirm the message remains and posts are ordered newest first.
- Check the Supabase Table Editor for the saved row.
- Check that an empty or whitespace-only message cannot be shared and input is limited to 280 characters.
- Submit the production domain, rather than a preview deployment URL, at https://apply.capm.us.

## Checks

```powershell
npm test
npm run typecheck
npm run build
```

With the app running, `node scripts/smoke.mjs` checks the real browser-to-Supabase flow, including cross-tab Realtime. It creates uniquely labeled test posts and reports their IDs in `artifacts/smoke-report.json`; remove those test rows in the Supabase dashboard afterward.

`node scripts/smoke.mjs --mock` tests browser interactions with an in-memory HTTP mock. It explicitly skips real Supabase persistence and Realtime verification. Screenshots and reports go into the ignored `artifacts/` directory.

Validation in this environment: production build, TypeScript, seven data tests, and seventeen mocked browser interaction checks passed. The connected database also passed anonymous insert/read-back, 280-emoji acceptance, length and blank-message rejection, and update/delete denial checks. Realtime publication and row security are enabled, and the Supabase security advisor returned no findings. The sandbox blocks external browser requests, so genuine browser-to-Supabase persistence and live delivery remain to be verified in an unrestricted browser.

## References

- [Supabase Postgres Changes](https://supabase.com/docs/guides/realtime/postgres-changes)
- [Supabase row level security](https://supabase.com/docs/guides/database/postgres/row-level-security)
- [Next.js environment variables](https://nextjs.org/docs/app/guides/environment-variables)
