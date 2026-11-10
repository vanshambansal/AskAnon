# AskAnon local setup

## Requirements and configuration

- Node.js 22.18 or newer within Node 22, npm, PostgreSQL with pgvector, and a Clerk application with development keys.
- Cloudinary credentials enable uploads/downloads. The account must permit PDF delivery. Raw PDFs and image resources are stored differently; preserve their returned public IDs.
- A Gemini key enables embeddings, PDF search, moderation and recap generation. Redis is optional: the server uses a bounded process-local cache/cooldown fallback when it cannot connect.
- Preserve your existing `backend/.env` and `frontend/.env`. For a new checkout, copy each directory's `.env.example` into its `.env` and fill the placeholders. Never commit secrets.
- Configure Clerk to allow the localhost origin and dashboard sign-in return URL. Use the same development Clerk application on frontend/backend.
- `DATABASE_URL` is the runtime connection; `DIRECT_URL` is used by Prisma administration where provided. Supabase requires valid connectivity/pooler settings for your project. Do not substitute connection strings from another project or reset an existing database.
- `GEMINI_MODEL` and `GEMINI_MODERATION_MODEL` default to `gemini-3.1-flash-lite`. Choose a model available to your key with quota. Daily-quota exhaustion requires waiting for its reset or changing quota/billing/model; repeated immediate retries will not fix it. Errors do not imply a completed AI analysis.

```powershell
npm --prefix backend ci
npm --prefix frontend ci
Set-Location backend
npx prisma generate
Set-Location ..
```

Run `npm --prefix backend start` and `npm --prefix frontend run dev -- --host 127.0.0.1` in separate terminals. Prefer a consistent `127.0.0.1` origin for sign-in and links. API/database/Redis status appears at `/health`; Redis `fallback` is usable for one localhost backend.

## Existing database: preserve data

The historical migration folder is incomplete: its earliest file assumes `users` and `sessions` already exist. Do not run `migrate reset`, and do not assume `migrate deploy` can reconstruct the database from this history.

The completion work applied these additive files with Prisma `db execute`, without resetting records:

- `20261105_classroom_state/migration.sql`
- `20261105_storage_cleanup/migration.sql`
- `20261105_material_index_state/migration.sql`
- `20261105_moderation_sources/migration.sql`

These files are not a migration-history repair, and must not be blindly reapplied. In particular, the classroom/indexing additions are not idempotent.

Before changing an existing installation, back it up and compare its schema with `backend/prisma/schema.prisma`. An inspection command, run from `backend`, is:

```powershell
npx prisma migrate diff --from-schema-datasource prisma/schema.prisma --to-schema-datamodel prisma/schema.prisma --script
```

Review any result before applying it. PostgreSQL extensions, historical column types/defaults and foreign-key deletion actions can differ. Application deletion uses explicit transactional pruning; do not silently replace foreign keys to hide drift. This command was not applied as a schema mutation to the current database.

## New, empty database only

`backend/prisma/baseline.sql` is a full schema generated from the current Prisma 6 model. It includes pgvector and all current tables. It is a bootstrap artifact, outside the legacy incremental migration folder, and has not been executed against the user's database.

On a dedicated empty database, after configuring `.env`, run from `backend`:

```powershell
npx prisma db execute --schema prisma/schema.prisma --file prisma/baseline.sql
npx prisma generate
```

The database account needs permission to create the vector extension, or a database administrator must enable it first. Never apply this file to a database that contains AskAnon tables.

Before adopting `migrate deploy` for subsequent changes, verify schema agreement and establish a migration baseline deliberately. `migrate resolve --applied <migration-name>` only records history; it does not verify or apply schema changes. Do not mark old files applied unless every change they represent is already present. Current localhost completion does not alter `_prisma_migrations`. A bootstrap/Prisma CRUD rehearsal passed in a separate temporary schema containing 14 tables; it did not reset public data.

To regenerate the bootstrap artifact after an intentional schema change:

```powershell
npx prisma migrate diff --from-empty --to-schema-datamodel prisma/schema.prisma --script --output prisma/baseline.sql
```

## Workflow and access

- Teachers create a course or start a standalone lecture. A shared lecture code/link opens `/session/:code`; students sign in before joining. Joining a linked lecture grants course enrollment/access.
- The teacher can answer/pin questions, share notes/code/images/materials, run polls and pause intake. Ending opens `/session/:code/recap`. Course vaults and saved doubts remain available within their access rules.
- The local role switch is controlled by `ALLOW_ROLE_SWITCH=true` outside production. Student preview in an owned room (`?role=student`) changes presentation only; it does not change authenticated permissions.
- Questions omit author names in classroom views. Account profiles and vote associations exist for access/limits. Do not advertise encrypted student identities or guaranteed untraceability.
- Image-only attachments are supported, but automated moderation reads accompanying text, not image contents. Rejected text is returned to its author without publication; the teacher Review tab has been removed.
- Text PDFs expose indexing state and owner retry. A failed replacement retains the previous complete index. Unreadable pages use bounded Gemini image transcription (up to 12 scanned pages per file); retry older failed files from the vault. Images are view/download resources.
- Summary coverage is bounded and explicitly sampled. Existing legacy PDFs should be reindexed to establish ordered chunks. The app does not promise exhaustive whole-document reading or exam prediction.

## Repeatable checks

```powershell
node scripts/check.mjs
```

This runs local backend syntax checks, isolated backend tests, frontend lint and production build. It does not send fixture data to Gemini or create live database records.

Optional real database/Socket.io integration, run from `backend` with a configured disposable-capable development database:

```powershell
$env:RUN_DB_TESTS='1'
node scripts/verifyClassroom.mjs
Remove-Item Env:RUN_DB_TESTS
```

The integration harness creates isolated users, courses and lectures and deletes its fixtures. It mocks token verification only inside its loopback test process; the normal application has no test-token bypass. Do not run against a public production installation. Live Clerk, Cloudinary and Gemini browser checks are recorded separately in the completion log.

Optional bootstrap rehearsal, from `backend`: set `RUN_SCHEMA_TESTS=1`, run `node scripts/verifyBootstrap.mjs`, then remove that environment variable. It uses a guarded temporary schema and removes that schema afterward. The database account must allow schema and extension operations.

PDF export lazily loads the bundled Noto Sans fonts; their license is in `frontend/public/fonts/OFL.txt`. Comprehensive complex-script font shaping in exports is not implemented. PDF text recognition is separate from export rendering.

## Release status

This remains a localhost delivery. Final independent-account, viewport, accessibility and migration rehearsals are tracked in the completion log. Production faculty provisioning, secret rotation/hosting setup, restrictive origin configuration and deployment are separate work. Dependency audit status is recorded with its date in the work log; do not interpret the development role switch as production authorization.

## Follow-up configuration (6 November)

`PRISMA_CONNECTION_LIMIT` defaults to 4 per backend process to respect the shared database pool. Running multiple servers/test processes consumes their combined limits. This prevents the observed session-pool exhaustion; it does not remove remote network latency.

Text that cannot complete automatic checks is rejected with a retryable 503; reviewed off-topic text receives 422. The draft is retained, no question is created, and routine rejected submissions release the cooldown. Profanity penalties remain active. Historical records are retained, but there is no teacher Review tab. Classification remains probabilistic; classroom image attachments are not interpreted.

## Performance diagnostics

Run `node scripts/profileDatabase.mjs` from `backend` for a read-only database latency/query-count probe. It prints numeric durations and statement counts, without row content or credentials. Run only one probe/integration suite at a time for useful comparisons.

Create/status/delete responses include `Server-Timing` stages for browser DevTools. The integration script also reports sampled interaction durations. Cold and warm runs differ; timings recorded under test load are not production SLAs.

The Prisma generator now enables `relationJoins` (a Prisma 6 preview feature) to execute relation reads with database-side joins. Regenerate with `npx prisma generate` after installing/updating the checkout. On Windows, stop backend processes before regeneration if the engine DLL is locked. This flag requires no SQL migration. Database pool capacity and backend/database proximity still matter.

## Durable deletion and frontend feedback (7 November)

The additive `20261107_session_deletion_jobs/migration.sql` was applied to the current development database without resetting records. The updated bootstrap contains 15 tables; do not reapply either artifact blindly to an existing database. Regenerate Prisma Client after installing the updated schema.

Lecture DELETE and batch-delete return HTTP 202 with a queued job. Access is denied once queued; actual cleanup happens in the persistent backend worker using existing topological pruning. Keep at least one backend process running for cleanup. Startup and five-second ticks recover eligible jobs; an interrupted RUNNING job can be reclaimed after its two-minute lease expires. Jobs retry transient failures and expose FAILED/manual retry after repeated failures. A completed row is retained as lightweight job history. Cloudinary cleanup remains separately durable and reference-aware.

The owner dashboard tracks queued/running jobs quietly and shows a panel only for failed jobs, with Retry deletion. Existing completion socket event shapes remain unchanged. Multiple production application replicas would require a shared Socket.io event adapter in addition to the database job leases.

Frontend snapshots are memory-only, expire after 30 seconds, are bounded to 40 entries and are partitioned by account/role. Mutations/lifecycle events invalidate them. Skeletons show initial loading; stale content remains visible during refresh. Requests use 60-second HTTP waits (120 for uploads), with an eight-second explanatory message; successful persistence is not inferred from a spinner or optimistic update.

`node scripts/check.mjs` now includes frontend cache tests as well as backend tests, lint and production build. Full verification details and measured limitations are recorded in the completion log.

## Quiet feedback and scanned PDFs (7 November UI follow-up)

Only the active action shows a button spinner. Bookmark stars update optimistically without a second spinner. Background reads and running cleanup do not display persistent activity banners. The global indicator remains for operations without inline feedback and for unusually long active waits. Public landing content renders without waiting for Clerk; signing in still requires Clerk connectivity.

Scanned-page text recognition uses the configured Gemini model and quota. Native text pages skip it; successful transcriptions are cached for 24 hours. The document indexing deadline still applies. Failed replacement keeps an existing complete index. Certificate-only or blank documents cannot supply missing academic content.


## Vault overload recovery and index inspection

Vault answers and scanned-page transcription can use one lightweight fallback after a transient provider 5xx, within the same overall deadline. `GEMINI_RAG_FALLBACK_MODEL` defaults to `gemini-3.5-flash-lite`; the primary model remains `GEMINI_MODEL`. This does not retry quota errors or enable billing. The local sample environment documents this optional setting.

Run `node scripts/inspectRagIndex.mjs` from backend to inspect existing vector dimensions, chunk counts and database index metadata without changing data. Add `--material 4 --show-text` only when you want that document text displayed. The UI exposes the retrieved passages after a question. See ASKANON_AI_ARCHITECTURE.md for the full RAG flow and current limitations.

## Current resume-project policy

Use DEPLOYMENT.md for the latest production configuration. New users choose Student/Teacher exactly once; existing roles cannot be switched even in development. Earlier role-toggle/manual-approval notes below are historical. Current origin allowlists, service budgets and Redis reconnection behavior are described in DEPLOYMENT.md. No automated off-site backups or restore rehearsal are claimed.
