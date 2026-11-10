# AskAnon pre-production review - 10 November 2026

This is a source review plus targeted browser, automated HTTP and real database/Socket.io checks. It is not a claim that every button has been manually tested in every browser. A subsequent signed-in audit exercised the student workspace and teacher controls using the enabled local role switch on the same real account. That account was restored to Student mode afterward. Independent production teacher/student identity rehearsal remains a release requirement. Existing personal courses, PDFs, questions and earlier uncommitted changes are retained.

## Reported details fixed

| Issue | Finding and fix | Evidence |
| --- | --- | --- |
| Header/footer order | The demo precedes Why on the page, while the links were reversed. The shared navigation array is now Live Experience, Why AskAnon, Features, For Faculty, FAQ. | Actual public page navigation inspected. |
| Course cards all expand on Attach PDF | A form was inside one grid card; grid stretch enlarged its neighbors. Attach material now opens a body-level dialog outside the grid. Cards align at their own height. | Three fixture cards stayed 181 px tall before and after opening. Dialog fit 320/390/768/1440 px. |
| Diagram opens unstyled/breaks vault | Shared Lightbox depended on SessionRoom.css, absent on a direct vault/recap visit. Component now imports its own styles and portals to document.body. | Fresh public-page component check without importing SessionRoom; fixed viewport overlay at 320-1440 px, zoom/reset and Escape passed. |
| Zoom clips part of image | Transform scaling did not enlarge scroll layout. Viewer now fits measured image dimensions to the stage and grows actual dimensions for zoom, allowing scrolling. | Image stayed within viewport at reset, 130% zoom and reset verified. |
| Missing author/repository credit | Git remote confirms github.com/vanshambansal/AskAnon. Footer adds Made with care by Vansham Bansal and profile/repository links. | Local repository metadata; no guessed account. |
| Production role switch | Backend already blocks role changes in production. UI now renders plain workspace text when switching is unavailable. | Existing production role/auth tests, plus source review. Local testing switch remains available when explicitly enabled. |

## No course selected: exact workflow

1. Create a lecture with No course - standalone lecture. The database initially stores course_id = null; creating a lecture does not automatically create a general course.
2. Sharing a live diagram in the gallery alone keeps it in that lecture. Uploading a resource through Slides & Notes, or choosing Save to Vault for a diagram, needs a course vault.
3. That operation creates or reuses a General Lectures & Sessions vault owned by the host, then links the lecture to it. The file has both course_id and session_id. Later resources reuse that vault.
4. The material/session socket events refresh connected room bundles. Students joining or refreshing a linked live room are enrolled in its course through the existing verified join workflow.
5. Uploading from a course card or course page uses that selected course directly; it does not invent a new lecture association.
6. Existing older GEN100 and newer GEN-* general vaults can coexist. The resolver now recognizes both and deterministically reuses the oldest matching vault owned by that teacher. It does not merge/delete existing vaults or move old material.

The create dialog now explains this behavior. This preserves the current lightweight workflow. A future Rename/Organize action could improve naming, but is not required to create lectures or upload files.

## Audit coverage and boundaries

| Area | Verification in this pass |
| --- | --- |
| Landing | Shared link order, footer identity, existing anchors and responsive source reviewed; public page loaded in Playwright. |
| Course upload UI | Actual component rendered with browser-only fixture data; attach/cancel, unchanged card heights and narrow viewport dialog bounds checked. No personal file uploaded for this UI check. |
| Image viewer | Actual shared component mounted on a fresh page, local image fixture loaded; direct CSS dependency, dimensions, zoom/reset, keyboard close and page overflow checked. |
| Auth and ownership | Automated HTTP tests cover invalid/anonymous tokens, cross-owner deletion, role escalation, course enrollment and bookmark identity. |
| Standalone/general vault | New tests cover legacy vault reuse, first general vault creation, lecture linking and non-owner rejection. |
| Live Q&A and polls | Isolated real database/Socket.io regression covers question publication/isolation, unavailable moderation, pause, pin persistence, concurrent votes, polls and restart recovery. |
| Lifecycle and storage | Regression covers written answers/end, transactional pruning/rollback, queued deletion recovery, batch completion and shared-asset retention/removal. |
| AI and PDF pipeline | Automated tests cover vectors, structured companion responses, bounded conversation, scoped neighboring passages, OCR bounds/cache, quota/fallback, source evidence and no fabricated answers on failure. Real paid-provider generation was not repeated merely for these UI fixes. |
| Signed-in dashboard/recap/vault pages | Student tabs/vault image, teacher create/course assignment, standalone upload, pin/unpin, written answers, bookmark, polls, gallery save/remove, export, recap, PDF attachment/index retry/AI/download and deletion were exercised with disposable records. Original role restored; see signed-in addendum below. |

Final command results and live regression completion are recorded in the completion log. A passing check is evidence for the covered behavior, not proof of zero bugs.

## Required before a public release

### Release blockers

1. **Choose a controlled teacher approval method.** The production backend correctly defaults new accounts to student and blocks self-service promotion. The current Professor onboarding choice cannot itself grant teacher rights in production. Use a small operator approval/invitation process; do not infer teacher status solely from an email that lacks a roll number. An admin CLI is sufficient for a first release; no university management system is needed.
2. **Use production identity/configuration.** Set NODE_ENV=production and ALLOW_ROLE_SWITCH=false. Configure the real Clerk production instance and allowed frontend/sign-in redirect origins. Rehearse a genuine teacher account and a separate student account with switching disabled. Retain local preview only for development.
3. **Restrict HTTP and socket origins.** app.js currently uses permissive cors() and Socket.io origin '*'. Add a configured allowlist for the deployed frontend before public exposure. Keep authenticated per-resource authorization; CORS is not a substitute for it.
4. **Bound expensive work.** Question posting has a cooldown, but AI queries/indexing/uploads and duplicate checks need deliberate per-user quotas, concurrency limits and request-size budgets for public traffic. Account-level AI usage limits and clear quota messaging protect the shared model budget. The current in-memory indexing map is not a durable multi-worker queue.
5. **Rehearse the database and deletion workers in hosting.** Verify the additive migrations on a fresh staging database, recover from a backup, and keep one persistent backend running for durable deletion/storage cleanup. Do not deploy this Socket.io/worker process into an environment that suspends it after each HTTP request. Do not reset the current database to repair migration history.
6. **Decide resource privacy.** Course access is checked by the API, but Cloudinary delivery URLs can be publicly reachable. If PDFs/diagrams must be private, use protected delivery or short-lived authorized download URLs. Do not promise that a publicly delivered URL becomes private simply because the course UI is authenticated.
7. **Finish release acceptance with real identities.** Create/join, no-course upload, material PDF/image upload, direct vault image viewing, polls, save/notebook, recap/export, end and delete must be rehearsed with two real signed-in roles, including a phone viewport. This pass does not certify that missing authenticated browser rehearsal.

### Important operational polish

- Use HTTPS, correct frontend API URL, startup health/readiness checks and explicit environment validation; never put service secrets in Vite variables or commit .env files.
- Place backend and database close enough to meet a measured latency target; retain optimistic UI, bounded waits and feedback. CDN caching helps static files, not database write latency.
- Log request durations, failed jobs, indexing outcomes and provider errors without tokens or private document text. Track API/Socket.io errors after deployment and provide an operator path for retrying failed cleanup/indexing.
- Verify upload contents as well as client-provided MIME types; add scanning if untrusted public uploads are allowed. Maintain file-size limits and reference-aware cleanup.
- Write a short privacy/retention explanation: names are hidden on classroom question cards, while accounts and vote associations still exist. Explain what PDF excerpts go to Gemini. Classroom images are not automatically moderated.
- Revisit the course-wide sharing rule: joining one live course lecture grants access to that course vault. This is intentional lightweight enrollment; instructors should understand it.
- Keep a staging/demo data policy. Do not ship disposable QA names, stale demo records, stack traces or developer toggles in screenshots. Existing QA courses were not deleted in this task.
- Check AI citations and refusal behavior on a small representative academic PDF set; short/scanned/mislabeled documents cannot support every question. Do not force long answers when the evidence is thin.

### Later, only when needed

- Add server-side pagination when collections grow; current progressive rendering does not reduce all response sizes.
- Add an approximate vector index and retrieval evaluation when measured collection size/latency justify it; current pgvector search is exact.
- Add shared Socket.io event delivery before running multiple application replicas. Database job leases alone do not synchronize socket audiences across processes.
- Offer instructor-friendly rename/organize controls for general vaults and a controlled account approval tool. A full institution/student-management hierarchy is unnecessary for this product.

## Suggested release sequence

First finish the two-account staging rehearsal and the release blockers above. Then deploy one persistent backend with the frontend and validate health, sockets, upload delivery and worker recovery. Only after those pass should public users be invited. The repository credit is now present; it is not a substitute for operational readiness.


## Signed-in browser addendum - 10 November 2026

The user signed in after the initial report. The following additional checks completed on the real localhost application:

- Student: Course Vaults, Past Lectures and Study Notebook opened. An existing course image opened from its vault with a fixed overlay; real image loading, zoom and Escape worked. The course lecture list opened.
- Teacher: enabled local switching entered the teacher workspace. Created an audit-only course and a standalone lecture (HTTP 201, initial course_id null). Pause/resume worked.
- Standalone materials: uploading an audit image returned HTTP 201, created an owned general vault and linked the lecture; the room header updated to its GEN-* code. This confirms the no-course explanation against the running application.
- Classroom actions: note broadcast, unpin/repin, written answer publication and bookmark toggling worked. A True/False poll launched, ended and was removed from the live view. Poll history remained in the recap, which is expected archival behavior.
- Images: shared a separate audit diagram to the live gallery, saved it to the vault, then removed it from the live screen without deleting the vault reference.
- Export/lifecycle: Q&A PDF export downloaded successfully. Concluding the lecture opened its recap. Overview, Discussion, Interactive Polls and Materials & Slides tabs opened; both resources were labeled as images rather than PDFs. Session search filtered to the audit lecture, reassignment to the audit course returned HTTP 200, and UI deletion completed through the durable queue.
- Course upload: the real Attach material dialog uploaded the generated audit transcript PDF (HTTP 201), closed on success, and did not resize the surrounding course cards. The backend development watch process restarted during its first indexing attempt; the UI correctly exposed interrupted indexing. Retry indexing reached Ready for AI search. A real AI request returned HTTP 200 with one source and retrieved passage. This was a thin test transcript, so a short factual answer was appropriate. Authorized PDF download also succeeded.
- Cleanup: removed only this audit's three materials, two newly created courses and one lecture. The lecture bundle returned 404 after worker completion; the audit courses no longer appeared. Existing courses/PDFs/lectures were retained. The account's original Student role was restored and the browser returned to its student dashboard.

No further product code change was required by these additional checks. Some automation waits initially used the wrong accessible name/endpoint or observed a mutation before its network response completed; those were corrected and were not treated as application defects. Transient browser socket errors around the observed development-server restart recovered. A separate two-account production-mode browser rehearsal, mobile hardware/browser variations, student question posting/upvoting in that real two-identity setup and long-running load/security evaluation remain outside this single-account audit; multi-user server behavior is covered separately by the 13-scenario regression.

## Release decision and failure-handling plan - 10 November 2026

Current assessment: functional locally and substantially tested, but not approved for unrestricted public release. Passing tests and handled exceptions do not establish backups, capacity, alerting or recovery guarantees. No production backup schedule or restore rehearsal has been verified for the actual service accounts.

The footer credit is now exactly Crafted by Vansham Bansal, with only Vansham Bansal linking to github.com/vanshambansal and no GitHub icon/repository text. The visible dashboard role switch and its client handler were removed entirely. This supersedes earlier statements about retaining a local UI toggle. Backend development-only role capability was not silently reconfigured; production must explicitly set NODE_ENV=production and ALLOW_ROLE_SWITCH=false. Removing a button is not authorization enforcement.

### Current behavior versus work still required

| Failure | What exists | Remaining release work |
| --- | --- | --- |
| Gemini generation 5xx overload | Vault/OCR may try one lightweight fallback within the same deadline. Explicit errors retain drafts; retrieved evidence is available when retrieval already succeeded. | Both models use Gemini, so this is not independent-provider redundancy. Add service health/alerts and a brief circuit breaker; decide whether a second provider is worth its added configuration. |
| AI quota/rate limit | 429/daily-quota codes and Retry-After; no unlimited retry or quota-bypass loop. | Per-account request budgets, concurrency caps and owner budget alerts. A second model is not assumed to have independent available quota. |
| Embedding service outage | Stored vectors remain; a failed new embedding returns an explicit search error. | Optionally provide clearly labelled keyword/source search for accessible PDFs when semantic retrieval is unavailable. Do not fabricate a generated answer. |
| Moderation unavailable | Text submission fails closed with a retryable error and retains the draft. Local abusive-text filters remain, but are not equivalent to contextual review. | Explicitly accept this availability tradeoff for launch or design an instructor-controlled fallback. Do not silently publish unchecked text during an outage. Vault fallback does not imply moderation fallback. |
| Malformed/incomplete AI result | Validation rejects incomplete output; it is not cached as a successful answer. | Include failure counts in alerts and provider regression probes. Source citations are inspectable, not guarantees of factual accuracy. |
| Redis unavailable | Local bounded cache and posting-cooldown fallback; API startup does not wait for Redis. Database remains authoritative. | Reconnect attempts currently stop after three retries; automatic longer-term recovery/alerts need work. Local limits/cache state are not shared across multiple replicas and reset on restart. |
| PostgreSQL unavailable | Many Prisma connection errors become 503; health reports unavailable. Serializable transaction conflicts retry up to three times and transactional pruning rolls back on failure. | Database backups/restore tests, query/readiness bounds, monitoring, pool/load checks and honest failure UX. Cached screens are not a database failover or backup. |
| HTTP timeout after a committed write | UI guards repeated clicks; several optimistic operations reconcile/roll back. Some operations are naturally idempotent, votes are unique, queued deletions reuse jobs. | Add idempotency keys for create/upload requests and desired-state bookmark writes. A lost response must not create duplicate rooms/files or flip a bookmark twice on retry. |
| Backend restart | Persisted pause/poll state and durable deletion/storage jobs recover. Interrupted indexing is retryable. Conversation memory is page-local. | Graceful shutdown/draining, persistent single-instance hosting and supervised restart. Indexing itself is not yet a durable resumable job queue. |
| Cloudinary outage/upload failure | File-size/type filters and some compensating asset cleanup; UI retains failed upload inputs. | Verify bytes rather than trusting MIME alone; bound upload stalls, alert on failed cleanup, and reconcile uploaded-but-unsaved orphan files after DB outages. Asset backups are separate from database metadata. |
| Deletion cleanup failure | Persistent owner-scoped job, leased execution, retries then visible manual retry; shared references are checked. | Monitor stuck/failed jobs and asset cleanup age/attempts. Keep workers running. This is not protection against an authorized user mistakenly deleting the wrong lecture. |
| Socket/internet interruption | Authenticated room joins, reconnection notices, snapshot reconciliation and bounded acknowledgements. | Test reconnect storms and deployment restarts with two real roles; no offline-write mode is promised. Multiple replicas additionally require shared event delivery. |
| Authentication provider outage | Protected operations require valid authentication; existing token verification may continue where supported, but new sign-in depends on Clerk. | Confirm production configuration and alerts. Do not bypass authentication as an outage workaround. |

### Four ordered release passes

1. **Access and production configuration.** Choose manual teacher approval/invitations initially, remove any remaining self-service promotion path from production onboarding, validate production-only environment/URLs/Clerk settings at startup, restrict HTTP and socket origins, add sensible request/concurrency budgets and keep one persistent application instance. Decide private versus publicly delivered course files. Completion gate: two real accounts cannot cross roles or ownership boundaries with role-switching disabled.
2. **Failure behavior and cost controls.** Finish bounded Redis recovery, AI quotas/circuit behavior, clear service-specific messages, upload error handling and idempotent create/bookmark operations. Retain fail-closed moderation unless an alternative policy is explicitly agreed. Provide useful non-generated source access when AI is down. Completion gate: deliberately injected provider/Redis/storage/timeouts show the expected UI, do not lose drafts or duplicate writes, and recover after service restoration.
3. **Backups, recovery and deployment operations.** Verify actual provider account backup settings, schedule encrypted off-site database exports/retention where needed, cover original Cloudinary assets, protect secrets/configuration separately and test restore into a separate staging database. Pause cleanup workers during restore until restored file references are checked: old metadata may otherwise reference assets already physically deleted. Add health/uptime/error/job/cost alerts, graceful shutdown and a known-good deployment rollback. Completion gate: restore a chosen backup, sign in, retrieve a lecture/PDF and verify pgvector/query behavior and job state without touching the live database.
4. **Staging rehearsal and limited launch.** Apply migrations to staging, exercise the full teacher/student flow without developer toggles, test realistic classroom concurrency/reconnects and verify backup/alerts. Use representative academic PDFs and ensure provider quotas support the expected class. Launch to a small pilot before unrestricted access. Completion gate: critical flows pass and the operator knows how to recover from the fault drills, not merely that the homepage loads.

Backup targets must be agreed rather than assumed. For a demo/pilot, daily off-site database backups and at least seven retained copies can be a starting proposal, but they may lose up to a day's writes. Real teaching usage may require a much smaller acceptable loss window. Define acceptable data loss (RPO) and restoration time (RTO), then choose/test a backup mechanism that meets them. Neither goal is currently a measured guarantee.

Supabase's current backup documentation distinguishes plan-provided daily backups from manual off-site exports and explains that restoring the database does not restore file objects. Our original files are in Cloudinary, outside the Supabase database. Confirm actual plan/settings rather than assuming automatic backups exist: https://supabase.com/docs/guides/platform/backups . Database, asset, identity-provider and deployment/configuration recovery must be considered separately.

Information needed to finalize this sequence: intended hosting/domain and region; initial teacher-approval approach; whether course PDFs must be private; and the operating budget/acceptable data-loss window. Recommended simple starting architecture remains one frontend, one persistent backend/worker process, the existing PostgreSQL+pgvector database, optional Redis and Cloudinary. No microservice split is required.

This is the proposed hardening sequence for discussion, not a claim that these operational changes have already been implemented. Only the requested footer and visible switch removal were implemented in this update; frontend lint/build and signed-in/public browser checks passed. The prior 52 automated tests and 13 integration scenarios were not rerun for these presentation changes.
