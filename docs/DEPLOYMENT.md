# Deploying the resume-project edition

## Product policy

No institution, administrator or teacher-verification service is required. A new signed-in identity chooses Student or Teacher once. The server accepts either role for initial registration and preserves it atomically. Existing accounts cannot change roles through profile sync, including when an old development flag is present. Existing accounts in the current database retain their role; no automatic data migration or promotion is performed.

Teachers manage only their own lectures/courses. Students join by code and gain the corresponding course access. Public/sample PDFs are the intended demo content; Cloudinary file URLs are not claimed to be private. Do not upload confidential files to a public demo.

## Small deployment topology

- Build and serve the frontend using a static host.
- Run **one persistent backend** using `npm start`, not `npm run dev`. It needs WebSocket support and background execution; request-only serverless hosting is not the intended backend target.
- Keep PostgreSQL/pgvector, Cloudinary, Clerk and optional Redis configured on that backend. Choose a backend region near the existing database where practical.
- Use a real production Clerk instance for a public deployment. Set frontend API URL and Clerk key before building the frontend.

No paid service, hosting deployment, database relocation or automatic backup schedule has been enabled by this repository update.

## Configuration

Copy each `.env.example` to its local `.env` for a new checkout. Existing local `.env` files should be retained. Backend secrets must never use a VITE_ prefix. `.env` files, local backups, scratch scripts, logs and audit downloads are ignored by Git.

Production backend:

```text
NODE_ENV=production
ALLOWED_ORIGINS=https://YOUR-FRONTEND-HOST
DATABASE_URL=YOUR-RUNTIME-POSTGRES-URL
DIRECT_URL=YOUR-DIRECT-POSTGRES-URL
CLERK_SECRET_KEY=YOUR-PRODUCTION-CLERK-SECRET
CLOUDINARY_CLOUD_NAME=YOUR-CLOUD
CLOUDINARY_API_KEY=YOUR-KEY
CLOUDINARY_API_SECRET=YOUR-SECRET
GEMINI_API_KEY=YOUR-KEY
REDIS_URL=YOUR-OPTIONAL-REDIS-URL
```

The origins list is comma-separated, exact origins with no paths/trailing slash. Public production origins must use HTTPS. Missing required identity/database/storage configuration fails startup. Gemini/Redis can be unavailable without preventing HTTP startup; their affected features report errors or use documented fallback behavior. Local development accepts localhost and 127.0.0.1 port 5173.

The origin allowlist applies to HTTP CORS and Socket.io browser connections. It does not replace authentication/ownership checks or prevent non-browser callers.

## Basic protection already implemented

- Existing-account roles are immutable; role switches are disabled server-side and absent from the dashboard.
- HTTP JSON bodies are limited to 64 KB; image uploads to 5 MB and course PDFs/images to 25 MB.
- Shared application budgets per authenticated user: 20 AI/recap requests per hour, 20 uploads per hour, 6 manual index requests per hour, 60 duplicate checks per minute. Limits return 429/Retry-After. They are application limits, separate from provider quota/billing.
- AI and upload HTTP requests have two-per-user concurrency limits and an eight-request per-process ceiling for those guarded requests. At most two PDF indexing jobs run in a process; excess PDFs show a retryable busy status instead of entering an unbounded queue. An upload can succeed even if its background index needs retry.
- Redis counters/caches have a bounded single-server memory fallback. Redis reconnects in the background with capped backoff. In-memory fallback resets on restart and is not a distributed quota service; run one backend for this edition.
- Vault generation/OCR can try one configured Gemini fallback model for transient 5xx, within a total deadline. 429/incomplete results do not trigger endless retries. Both models use the same provider, so a full Gemini outage can still affect both.
- Moderation fails closed: failed checking keeps the draft but blocks publishing unchecked text. Existing discussion, polls and teacher controls do not acquire an AI dependency solely because vault generation is unavailable.
- Deletion/storage jobs persist and retry with reference checks; interrupted indexing is retryable. Graceful termination closes sockets/database/Redis with a 15-second outer bound. Indexing is not a durable resumable multi-worker queue.

These are small-project safeguards, not a claim of DoS resistance or unlimited classroom capacity. Provider budgets and alert settings must still be checked in their dashboards.

## Backup and recovery

1. Keep the local .env files and securely record deployment configuration outside Git. This update preserved local copies under ignored `.local-backups/pre-push`; they are plain local copies, not encrypted off-site backups.
2. Install PostgreSQL client tools matching the server's supported pg_dump version.
3. From `backend`, run `node scripts/backupDatabase.mjs` before deployment and major schema changes. It performs a read-only custom-format dump into ignored `.local-backups/database`. Passwords are passed in the child environment, not CLI arguments. Failed `.partial` files are not valid backups.
4. Copy completed archives to secure storage outside the computer. For a demo, a scheduled daily backup plus copies before major changes can be a practical starting policy; schedule/retention are operator setup, not automatically installed by this script.
5. Keep original demo PDFs/images separately. A database dump contains file references, not Cloudinary originals or Clerk account records.
6. Rehearse restore into a separate database. Never test restore by overwriting the live database. Keep workers stopped until restored file references/job state are reviewed, then test identity mapping, a lecture, a PDF and vector search.

This environment did not have pg_dump on PATH during preparation. No completed database backup or restore rehearsal is claimed. The command reports that missing prerequisite clearly. Do not treat Git commits, Redis caches or a backup script alone as successful data recovery.

## Release sequence

1. Run local checks and inspect the current docs. Ensure real secrets and generated artifacts are excluded.
2. Prepare a separate staging database and validate migration state. Existing migrations/DDL must not be blindly re-applied or reset; see LOCAL_SETUP.md and the isolated bootstrap verifier.
3. Configure hosting environments/origins and build the frontend. Start one persistent backend with npm start and check /health.
4. Register two genuinely separate test identities, one choosing Teacher and one Student. Verify immutable roles, create/join/enrollment, controls, material delivery, AI/error cases, recap/export and deletion.
5. Test backend restart, Redis/provider unavailability, quotas and a backup restore in staging. Run a modest classroom-sized load rehearsal rather than claiming an unmeasured user capacity.
6. Keep the previously deployed version available for code rollback. Rollback code does not undo destructive database migrations; prefer compatible additive migrations.
7. Publish a limited demo with sample data. Add provider/uptime/cost alerts and retain the recovery instructions.

## Deliberately deferred

Institutional verification, protected private document delivery, second AI-provider integration, multi-replica sockets, approximate vector indexing, persistent chat history, a large job platform and elaborate operational automation are outside this simple edition. Revisit them only if real usage justifies the complexity. Unknown deployment credentials/domains, backup execution and actual provider-account settings remain external release steps.

## Manual deployment walkthrough (Vercel frontend + Railway backend)

The owner can perform these steps manually; no hosting purchase or deployment was performed by this change.

1. Choose a frontend project name in Vercel and use its stable production URL (not a changing preview URL). A custom domain is optional. Configure Clerk production authentication for that URL and its Google sign-in requirements; keep backend secret and frontend publishable keys from the same Clerk instance. A different Clerk instance has different identity IDs; do not assume accounts migrate automatically.
2. Back up the existing database and rehearse restore separately before changing production data. Keep Cloudinary originals separately. Confirm migration history and pgvector compatibility on the target database; do not run reset or blindly deploy historical migrations to an already-populated schema.
3. Import this GitHub repository into Railway as one backend service with root directory backend. Build: npm ci && npx prisma generate. Start: npm start. Use Node 22. Keep one replica and disable service sleeping for a reliable live demo. Choose the region nearest the current database, not just the browser. Generate an HTTPS public domain.
4. Add backend environment variables from backend/.env.example privately in the hosting dashboard. Set NODE_ENV=production and FRONTEND_URL/ALLOWED_ORIGINS to the exact stable Vercel HTTPS origin. Set database URLs, Clerk secret, Cloudinary credentials and Gemini/Redis configuration. Never put backend secrets into VITE variables. Set provider spending caps/alerts. Rotate credentials previously shared outside secret storage before public launch.
5. Import the same repository into Vercel with root directory frontend and Vite preset. Build: npm run build; output: dist. Set VITE_API_URL to the backend HTTPS origin without /api and VITE_CLERK_PUBLISHABLE_KEY to the matching Clerk key. The included vercel.json serves client-side routes on direct navigation. Rebuild after changing frontend environment variables.
6. Check backend /health and frontend direct routes. Use the stable production frontend domain; previews need explicit authorization configuration before being used for authenticated tests. Inspect deployment logs without publishing secrets.
7. Use two accounts: new teacher registration, return sign-in, create lecture/course, student join/enrollment, questions/pinning/polls, upload/index/cited AI answer, recap and deletion. Test mobile layout and both direct route reloads and reconnect after backend restart. Confirm quota/provider errors leave useful retry states.
8. Only share the demo after these checks. Keep sample documents public-safe, retain an off-computer backup and set a modest hosting/provider budget. GitHub checks and local tests do not replace this deployed rehearsal.
