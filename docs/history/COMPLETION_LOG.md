# AskAnon V2 â€” completion plan and progress log

Created: 5 November 2026 (Asia/Kolkata)
Current status: Phases 1-3 core fixes and the main Phase 4 localhost polish/acceptance pass are implemented and checked, including a real two-account classroom rehearsal. Final release gaps remain explicitly listed: backend dependency majors, empty-database rehearsal, broader Unicode/export stress and a complete route/accessibility sweep. Preserve the existing Student/Teacher workflow and localhost role switch.
Evidence: [Project review](./ASKANON_V2_REVIEW.md), [development changelog](./CHANGELOG.md), [development archive](./ASKANON_V2_DEVELOPMENT_ARCHIVE.md).

## Objective

Deliver a complete, coherent classroom participation product: a professor creates a lecture; students join, ask and prioritize questions; the professor answers, broadcasts, shares resources and runs polls; the lecture concludes into a useful recap and course archive. Existing AI features must work with truthful loading/error states and grounded outputs. Every supported action must behave consistently across browsers, reloads and reconnects.

The target is the existing React/Vite, Express, Prisma/PostgreSQL, Socket.io, Cloudinary, Redis and Gemini application. Preserve the custom CSS design system and all unrelated uncommitted work. No framework rewrite or unrelated feature expansion is planned.

## Final scope â€” takes precedence over earlier proposals

- Keep the current Student and Teacher dashboards, onboarding, course vaults, automatic course enrollment, lecture links and recap flow. Do not replace them with Joined/Hosted navigation or retire `User.role`.
- Keep the role switch for localhost testing. Enforce authenticated roles and lecture/course ownership on the backend. Isolate role switching behind an explicit development-only setting; public role changes must not be possible when that setting is disabled.
- Complete the existing feature set. Add only the state, constraints and controls necessary to make those features correct. Defer new session-membership/attendance models, room-mute features, course-code redesign and other optional extensions unless a reproduced blocker requires them.
- Questions remain anonymous in teacher/student views. Preserve existing privacy behavior; do not introduce identity-reveal functionality. Any private author association needed for enforcement must stay out of public payloads and be documented explicitly.
- Visual improvements may be substantial, but must serve the existing workflow. Use consistent icons, typography, spacing and clear controls; reduce excessive emojis, ornamental badges and clutter.
- Public deployment, faculty-email/passkey verification, university administration, scheduling and OCR are outside this localhost completion. Production role assignment will be chosen separately; do not infer faculty status from an email naming pattern.
- Protect the current database and uncommitted work. Apply only necessary, recorded migrations without resetting data.

## How work will proceed

- Four phases, in order. Each includes functional work, relevant UI fixes and verification; final polish does not postpone obvious UI blockers.
- Start each phase with a short explanation of the work. Record changes, decisions, checks and remaining issues here as work proceeds.
- Make small reviewable changes. Preserve the working tree; do not reset, stash away or overwrite the user's existing work.
- Use disposable test courses, lectures, questions and files for mutation tests. Do not delete existing academic records to prove deletion works.
- Ordinary database access remains Prisma-based. Keep the existing pgvector-specific adapter isolated and parameterized; do not spread raw SQL into CRUD controllers. Document any necessary vector-specific exception.
- Keep existing event payloads compatible while migrating emitters/listeners together. Make server-side authorization and persisted state authoritative.
- A successful production build is necessary but insufficient. Verify actual workflows, failure paths and browser behavior.
- Keep credentials in local environment configuration only. Never copy connection passwords, tokens or private document contents into this log.
- Existing authorization permits Gemini testing with existing materials. Prefer small dedicated academic test PDFs for repeatable quality checks.
- Complete the currently agreed phase before expanding scope. Newly discovered bugs enter the feature matrix and issue log rather than causing an unbounded redesign.

## Phase 1 â€” restore reliable access and repair immediate blockers

**Outcome:** users can sign in, load their workspace, create/join lectures and use course uploads without crashes; privileged actions are protected on the server.

### Work

1. Replace the obsolete Redis connection using the replacement supplied by the user. Test connection, PING, expiry and atomic posting cooldowns without printing the URL/password. Make startup tolerate Redis failure promptly and make fallback behavior explicit.
2. Validate environment requirements and add a secret-free environment example and service/readiness diagnostics. Distinguish an unavailable API, database, storage or AI provider in errors. The earlier Supabase failure was a sandbox restriction, not a confirmed database outage.
3. Standardize Clerk authentication/profile synchronization across dashboard, room, vault and recap. Derive identity from verified tokens; stop trusting caller-provided identity fields. Remove the implicit first-user development bypass from normal execution.
4. Enforce authenticated Student/Teacher roles and ownership/access rules on session/course/material/question/bookmark operations and sockets. Keep the localhost role switch explicitly development-only. A teacher can manage their own lectures; changing roles locally does not grant access to another teacher's data. Preserve the existing room-code joining workflow.
5. Fix the CourseDetail upload crash, wrong upload endpoint and profile-sync/storage-key mismatches. Validate files before upload where possible and clean up failed uploads.
6. Fix the Doubts session filter and missing code-only question fields. Standardize six-character room-code validation and useful join errors.
7. Constrain the download proxy to authorized stored assets and normalize expected validation/authentication errors.
8. Repair loading/retry states and form errors affected by these paths; ensure dialogs can open, close and submit without losing drafts on failure.

### Acceptance checks

- Fresh sign-in and page reload load the correct profile; direct vault/room links work with an initially empty profile cache.
- Session and course creation work; invalid room codes produce actionable feedback.
- Course upload works from both dashboard and course detail; cancelled/failed uploads do not crash the app.
- Doubts filters retain the correct questions; text-, code- and image-only questions have appropriate labels.
- Anonymous, forged-identity and non-owner requests fail appropriately; normal teacher/student requests still succeed.
- Redis works when available; unavailable Redis does not prevent startup or remove the posting cooldown.

## Phase 2 â€” make the live classroom and data lifecycle correct

**Outcome:** live actions persist once and reach the correct viewers; end/delete/reconnect behavior is consistent everywhere.

### Work

1. Resolve global lecture-end broadcasts and conflicting end/delete semantics. Use session-scoped lifecycle payloads and validate session identity in listeners. End goes to recap; deletion goes to a clear unavailable-room state/dashboard. Other rooms are unaffected.
2. Emit authoritative updates after successful server mutations, replacing client-supplied fabricated question/answer/media payloads. Avoid duplicate updates in the initiating browser.
3. Verify submission, upvote uniqueness, sorting, pin/unpin, answer/unanswer where supported, written answers, dismissal and removal. Persist instructor broadcasts with an explicit content type/state rather than inferring authority from a text prefix.
4. Enforce pause/resume on the server and synchronize it to late joiners. Reauthenticate/rejoin on reconnect, then refresh full room state and lifecycle information.
5. Make polls use verified voters, transactional vote persistence and recoverable active state. Close polls when lectures end; restore the right state after restart or reconnect.
6. Centralize cache invalidation for questions, sessions, courses, enrollments, counts, histories, materials and bookmarks. Correct double-decrement and stale-list behavior. Include live creation/start updates where students' live feeds need them.
7. Apply synchronization to dashboard, course detail and recap, including batch deletion and saved-question removal. Reconcile after missed events/reconnect rather than relying exclusively on messages arriving once.
8. Make session/course deletion prune dependencies safely and atomically where practical. Preserve vault materials intentionally. Track file ownership/references so deleting a gallery item does not break a saved vault asset, and reclaim storage only when safe.
9. Resolve per-teacher fallback-course uniqueness and enrollment/leave-course effects. Keep room/material associations coherent when courses are reassigned or removed.
10. Improve connection status, pending controls, poll layout, spotlight/answer hierarchy and confirmation copy alongside these changes.

### Acceptance checks

- Two authenticated browser contexts see matching questions, votes, pins, answers, broadcasts, materials and polls without refreshing.
- A third context in a different lecture is unaffected by changes in the first lecture.
- A late join/reload sees paused state, the active poll, pin and correct vote state; a network disconnect/reconnect resumes updates.
- End routes participants to the correct recap and updates student history; delete and batch delete remove records/counts/bookmarks consistently across open views and subsequent reloads.
- Deletion preserves intended vault resources, does not break retained file links and leaves no test-owned database/file orphans.
- Warm Redis caches return the same post-mutation state as uncached reads.

## Phase 3 â€” finish materials, AI and revision workflows

**Outcome:** uploaded resources are usable, AI outputs are grounded and failures are visible/retryable, and recaps/exports faithfully reflect the lecture.

### Work

1. Verify PDF/image upload, previews, downloads, zoom and Save to Vault across dashboard, classroom, course and recap. Use consistent file validation, categories and download behavior; verify Cloudinary delivery settings with a small test PDF.
2. Correct moderation treatment: hide/quarantine flagged content appropriately, expose understandable teacher controls and ensure dismissed/flagged items do not leak into normal streams or AI recaps. Include lecture context in moderation cache keys. State any unsupported attachment moderation clearly.
3. Test duplicate detection using a small representative academic set: paraphrases, distinct questions, exact repeats, code/image-only content and provider failure. Preserve drafts and the user's choice to post anyway; do not show similarity as a probability.
4. Reduce unnecessary sequential AI retries, configure the chosen model consistently and enforce a bounded overall wait. Distinguish provider failure, empty lecture, queued/running generation and genuine successful results. Do not save generic fallback advice as completed AI analysis.
5. Prevent duplicate recap jobs, validate generated fields and include written teacher answers and useful code/question context within size limits. Keep role-specific presentation and a transparent generation status.
6. Add durable document indexing state, retry/recovery and bounded chunking. Preserve the last valid index during replacement. Show actual ready/failed counts; identify scanned/unsupported files honestly.
7. Improve topical retrieval relevance and summary coverage across documents. Supply source references and decline unsupported answers. A request for all-material summary must not silently mean the first paragraph of four files.
8. Render AI answers with safe formatting, readable headings/lists and links to referenced materials. Avoid displaying vector/database implementation terms in the student flow.
9. Verify recap questions, code, written answers, polls, diagrams and materials; make PDF export readable and paginated. Keep exports explicitly available; avoid surprise automatic downloads on lecture termination.

### Acceptance checks

- A small academic PDF uploads, becomes ready, downloads and answers a known content question with the correct source; unrelated questions are declined.
- A multi-document summary reflects representative content rather than a few initial paragraphs.
- Duplicate suggestions recognize intended paraphrases and do not block posting during provider failures.
- Local/AI moderation, cooldown penalties and teacher actions produce the intended visible state.
- Recap generation succeeds, persists and reuses the result; a simulated failure is visible and retryable; refresh is owner-controlled.
- Student and faculty recap views show the appropriate guidance. PDF contents and page layout are inspected, including long answers/code and empty lectures.

## Phase 4 â€” complete the UI and verify release readiness

**Outcome:** a cohesive, responsive interface and a repeatable, documented working product.

### Work

1. Walk every page as both roles: landing, onboarding, dashboard tabs, Join, live room, course vault and recap. Retain the warm-paper/crimson student styling and dark faculty theme while fixing spacing, contrast, alignment, overflow and inconsistent controls.
2. Standardize forms, buttons, cards, tabs, spotlight answers, upload drawers, AI outputs, error/empty states and confirmations. Add descriptive labels and clear pending/success/failure feedback; eliminate dead or misleading controls.
3. Verify at approximately 390 px mobile, 768 px tablet and 1440 px desktop widths, including long titles, long code, many materials, multiple rooms and empty states. Check keyboard navigation, focus visibility, accessible dialogs, Escape and reduced-motion preferences.
4. Align public copy with actual sign-in, anonymity, moderation and duplicate behavior. Remove unsupported statistics. Keep scheduling, university administration and projector mode outside scope; keep PDF export as the primary export, and expose CSV only if it has a useful verified path.
5. Lazy-load pages and heavyweight export code where useful. Measure representative requests; improve avoidable waterfalls/payloads without claiming artificial latency targets or adding distributed infrastructure.
6. Clear lint errors/warnings meaningfully, remove verified dead code and document a reproducible Prisma migration/baseline process without resetting the existing database.
7. Add focused API/integration tests for identity, lifecycle, votes, cache invalidation and file references, plus Playwright journeys for teacher/student classroom and vault/recap flows. Stub provider failures in automated tests; use a limited live provider smoke test separately.
8. Add repeatable local check scripts, secret-free setup documentation and a clear known-limitations list. Add lightweight CI if useful without delaying the local completion. Record future deployment requirements separately; hosting configuration and publication are outside this delivery.

### Acceptance checks

- Build, lint and the agreed automated suites pass; essential flows produce no unexpected browser errors.
- Full disposable-data journey passes in two authenticated contexts: create course/lecture, join/enroll, submit/upvote/answer, poll, share/save/download, end, recap/export, delete and leave course.
- UI evidence exists at mobile/tablet/desktop widths, including relevant modals and failure states.
- Restart/reconnect, expired authentication, Redis outage, provider timeout and failed upload have usable recovery paths.
- Setup and migration instructions can reproduce the app; all incomplete items have an explicit status, not an unsupported completion claim.

## Feature verification matrix

Status definitions: **Audited** = inspected, not fully verified; **Reproduced bug** = observed in browser; **Partial** = some path passed; **Pending** = not yet tested under this plan; **Verified** = acceptance checks recorded with evidence.

| Feature group | Main phase | Baseline status | Evidence needed for completion |
|---|---|---|---|
| Sign-in, profile sync, roles/access | 1 | Partial; authorization gaps | Fresh/direct-entry, token expiry and ownership checks |
| Redis/cache/cooldown | 1â€“2 | Replacement supplied; not yet tested | Connection/TTL, outage, atomic cooldown and warm-cache mutation checks |
| Create/join lecture, code errors | 1 | Audited | Teacher/student browser journey |
| Dashboard tabs/search/filters | 1, 4 | Search passed; Doubts filter bug reproduced | All filters, counts, empty states and responsive checks |
| Course create/assignment/enrollment/leave | 1â€“2 | Audited | Correct visibility, reassignment and cache updates |
| Material upload | 1, 3 | Course-detail crash reproduced | Dashboard/course/room upload and failure recovery |
| Q&A text/image/code and upvotes | 2 | Audited | Two-context updates and durable duplicate-vote prevention |
| Pin, answer, explanation, dismiss/delete | 2 | Audited | Owner-only controls, persistence and stream/recap consistency |
| Instructor note/code broadcast | 2 | Persistence gap confirmed in code | Spotlight persists after reload |
| Pause and reconnect | 2 | Gaps confirmed in code | Late join, direct API enforcement and reconnect recovery |
| Poll launch/vote/end/history | 2 | Saved history passed | Verified voters, reload/restart and close-on-end |
| Session/course deletion and files | 2 | Gaps confirmed in code | Single/batch, safe cascades, cross-view and storage cleanup |
| Bookmarks/notebook/history | 2 | Audited | User isolation and deletion/end/leave synchronization |
| Gallery/lightbox/Save to Vault/download | 2â€“3 | Audited | Shared-reference safety and actual downloads |
| Duplicate detection/moderation | 3 | Audited | Representative cases, visibility and provider failures |
| Lecture AI synthesis | 3 | Cached display passed | Fresh generation, concurrent requests, failure/retry and persistence |
| Course/material RAG | 3 | Course summary passed once in 45.4 s | Topical retrieval, coverage, grounding, indexing/retry and latency |
| Recap and PDF export | 3â€“4 | Existing recap/poll rendering passed | Fresh end-to-recap, long/empty exports and visual PDF QA |
| Responsive/accessibility/public copy | 4 | Partial landing checks | Full route/role/viewport and keyboard review |
| Tests, migration and deployment docs | 4 | Incomplete | Repeatable checks and clean setup rehearsal |

## Scope decisions and information needed

### Working assumptions

- Localhost-first delivery is confirmed. The user authorizes substantial visual changes where useful, retaining pure CSS. Prefer restrained typography, consistent line icons and deliberate layouts; remove excessive emojis, ornamental badges and redundant dashboard statistics.
- Preserve Student/Teacher workspaces and the localhost role switch for demonstrations. Only authenticated teachers may manage lectures/courses they own. Production faculty verification is deferred; public self-service role switching must be disabled.
- Support text PDFs and images. OCR for scanned PDFs is outside this completion scope; show a clear unsupported/no-text state.
- Preserve existing course-enrollment-based lecture history. Do not call it individual attendance unless an attendance feature is intentionally added.
- No separate admin portal, scheduling system, new vector database or microservice/queue platform is needed for this completion pass.
- Use minimal persistent job/index states and bounded in-process work for the single-backend target; document restart retry behavior instead of implying a distributed worker system exists.

### Inputs

1. **Redis:** replacement connection supplied on 5 November; update local backend configuration and test during Phase 1. Credentials intentionally omitted here.
2. **Role policy:** settled for this delivery: preserve existing Student/Teacher workflows, development-only switching and backend ownership checks. Do not implement the earlier Joined/Hosted redesign. No university administration portal is required.
3. **Release target:** complete localhost first (confirmed). Public hosting remains outside the immediate delivery.
4. **Accounts:** a second Clerk test identity may be needed for independent student/professor verification. The user may need to complete Google/OTP sign-in; do not ask for passwords.
5. **External settings:** ask only if checks demonstrate a Cloudinary delivery restriction, Gemini quota/model access issue or hosting/account action the agent cannot perform. Do not request new services preemptively.

## Final product clarification â€” 5 November 2026

The earlier Joined/Hosted dashboard and removal of permanent account roles were discussion proposals and are superseded. The user explained that role switching exists for localhost testing and chose to preserve the existing workflow to finish sooner.

Teacher journey: sign in, open Teacher dashboard, create/select a course, create a lecture, share its code/link, manage the classroom, end into recap and review course resources/history. Student journey: sign in, open Student dashboard, join by code/link, automatically access the associated course vault, ask/upvote/bookmark/vote and revisit recaps/materials. Both roles use the existing session route; no URL redesign is required. The development role switch enables both views from one test account.

Privacy: preserve anonymous question presentation to teachers and students. Authentication, cooldowns, local filtering, contextual AI checks and host moderation work together; AI is not the sole abuse-prevention mechanism. Avoid strict relevance rules that suppress legitimate prerequisite questions. Do not add an identity-reveal workflow.

Schema: retain the existing entities and `User.role`. Make only changes needed by the agreed fixes, such as persisted pause, explicit broadcast/moderation state, AI/index status and file metadata/constraints. Evaluate relational corrections against existing data and record migrations. The broader session-membership model, new room restrictions, course-code redesign and optional private-author changes are not automatic deliverables of this plan. No schema/database changes have been made during planning.

## Progress and decision log

### Phase 1 implementation â€” 5 November 2026

Implemented:

- Connected the replacement Redis instance through ignored local `.env`; enabled explicit local `ALLOW_ROLE_SWITCH=true`. Redis starts asynchronously, uses ready-state checks and does not queue commands while offline. Added bounded local database-response caching and atomic Redis cooldown claims with a process-local fallback.
- Replaced the first-database-user test-token bypass with verified Clerk identity. New profiles use Clerk's verified primary email; existing profile sync binds to the signed-in identity. `/users/me` no longer accepts another account ID. Local role switching remains available; production ignores the development switch flag.
- Added shared role, owner, course enrollment and resource-ID guards across session, course, question, bookmark, material, upload and analytics routes. Code-based joins preserve automatic course enrollment. Standalone lectures use bounded temporary code-access grants rather than introducing an attendance schema.
- Authenticated socket connections, checked room membership/host privileges, bound poll voter IDs to the verified account and hydrated relayed question/media/material records from the database. Full authoritative event publication, lifecycle scoping and reconnect recovery remain Phase 2.
- Repaired CourseDetail's undefined upload handler, wrong endpoint and cold-profile sync; restricted management controls to the owning teacher. Put multipart context fields before files so validation/ownership happens before Cloudinary upload. Failed material insertion cleans up its new asset.
- Repaired Doubts session filtering and selected missing code/session fields in teacher data. Standardized six-character code validation, authenticated previously unauthenticated gallery calls and retained localhost role switching in the UI.
- Restricted downloads to this application's stored Cloudinary resources with signed-in resource access, timeout, redirect rejection and size limits. Added a shared authenticated token provider for the existing download utility.
- Added API/service health and role-switch capability endpoints, a secret-free backend environment example and more useful workspace/API errors. Added targeted course-parent cache invalidation after resource changes so successful uploads do not disappear on reload.

Verification:

- Frontend production build passed; existing large-chunk warning remains.
- Backend JavaScript syntax checks passed (28 source files at this checkpoint).
- `npm test --prefix backend`: 13 tests passed, covering anonymous/invalid-token rejection, ID validation, ownership, batch authorization before deletion, role enforcement, identity spoofing, production role-switch lockout, bookmark isolation, download host rejection, local cooldown concurrency, lecture creation identity, code-join enrollment and memory-cache invalidation. Database/Clerk calls are mocked only inside the test process.
- Live Redis: PONG, first NX claim succeeded, simultaneous second claim rejected, TTL and expiry passed using a temporary key.
- Signed-in browser: Teacher dashboard loaded; Doubts session filter returned the expected 3 of 4 questions; localhost Student/Faculty switching worked; Student create-lecture request returned 403; original Faculty role restored.
- Course upload dialog opened without crashing and submitted a disposable image through the actual UI. Cloudinary upload returned 201 and authenticated download returned 200 with expected bytes. Course read after material deletion showed the correct remaining material and lecture.
- Direct course navigation worked after clearing cached `db_user`. Own test classroom loaded with authenticated sockets; anonymous socket connections were rejected. Attempts to read other teachers' dashboards returned 403.
- Temporary course 6, session 39 and materials 6/7 were created solely for verification, then removed through the authorized application APIs. Existing academic records were preserved.
- Lint is improved from 36 to 34 errors, with 4 existing hook warnings remaining. Broad cleanup is scheduled for Phase 4; this checkpoint is not lint-clean.

Remaining verification / Phase 2 follow-up:

- Independent teacher/student identities, full socket mutation tests, restart/reconnect and event isolation remain unverified end to end. A single account's role-switch preview is not equivalent to two independent users.
- Complete cache invalidation for all lifecycle/enrollment/deletion paths, server-owned event publication, StrictMode async socket cleanup, end/delete event separation, durable pause/poll state and shared-file lifecycle remain Phase 2.
- AI/indexing correctness, PDF-specific upload/download/export QA and the visual/accessibility pass remain Phases 3â€“4. No schema migrations or broad visual redesign were applied in Phase 1.

Test harness notes: initial Node mock-method setup did not support Prisma's proxy methods; replaced it with test-scoped function mocks. A GET-with-body test helper was corrected. Application checks were repeated after corrections; the final 13-test suite passed.

Append entries with: date/time (Asia/Kolkata), phase, change or decision, reason, affected files, verification result, remaining issue/next action. Keep failed checks and corrective actions visible; never mark a feature verified from a build alone.

| Date | Phase | Entry | Verification / next action |
|---|---|---|---|
| 2026-11-05 | Baseline | Completed project audit and saved `ASKANON_V2_REVIEW.md`. Preserved existing uncommitted application work. | Build passed; backend syntax 27/27; lint 36 errors/4 warnings. This is the baseline, not completion status. |
| 2026-11-05 | Baseline | Reproduced CourseDetail upload crash and Doubts session-filter bug; inspected faculty dashboard, vault, existing recap and saved poll results. | Repair in Phases 1â€“2; use disposable data for mutation tests. |
| 2026-11-05 | Baseline | Supabase connectivity restored by running the backend with permitted network access; old Redis hostname did not resolve. | Do not diagnose the earlier sandbox denial as a database outage. |
| 2026-11-05 | Baseline | User-approved Gemini course-summary test succeeded with three document sources after two first-model timeouts. | One request took 45.4 s; raw Markdown in UI. Other AI paths remain unverified. |
| 2026-11-05 | Planning | User supplied replacement Redis connection and requested a small phased completion plan before implementation. | Store secrets only in local configuration. No connection test or environment edit performed in this planning turn. |
| 2026-11-05 | Planning | Created this four-phase plan, feature matrix, acceptance checks and continuing log. | Implementation pending; begin with Phase 1 once the plan is accepted. |
| 2026-11-05 | Product discussion | User confirmed localhost-first delivery, ownership-based platform direction and permission for substantial visual cleanup with fewer emojis. Re-read the Prisma schema and current routing/auth rules. | Recorded confirmed constraints separately from proposed navigation, anonymity and targeted schema changes. No application or database changes. |
| 2026-11-05 | Final planning decision | User clarified the development-only reason for role switching and requested preservation of the existing workflow. Finalized four repair/verification phases without a role/navigation redesign. | Earlier Joined/Hosted and role-retirement proposals superseded. Preserve Student/Teacher dashboards and localhost switch; repair backend permissions and ownership. No application code or environment changes in this turn. |
| 2026-11-05 | Phase 1 | Implemented Redis/auth/access/upload/filter/download repairs and executed the checks recorded above. | 13 backend tests and frontend build pass; remaining phases and lint debt explicitly recorded. Test-owned course/lecture/material records cleaned up. |

### Phase 2 implementation â€” 5 November 2026

Implemented:

- Moved question, vote, answer, pin, deletion, media and material notifications to the backend after successful writes. Removed browser relays that could duplicate or fabricate updates. Workspace notifications target owner/enrollment rooms rather than broadcasting lecture lifecycle events globally.
- Ending emits `session-ended` only to the affected classroom; deletion emits `session-closed`. Both carry the session code. Removed the legacy end-to-delete relay and automatic PDF download on end. Dashboard, course and recap views now refresh after relevant private notifications; delete/batch-delete prune visible records and bookmarks without double-decrementing course counts.
- Added serializable Prisma transaction/retry helpers for question state, upvotes, polls, lecture/course pruning, media and materials. Single/batch lecture deletion explicitly handles poll votes/options, bookmarks, question votes, related-question links and gallery rows; course materials are detached and preserved. Course deletion retains its lectures without the removed course and cleans associated resources/enrollments.
- Persisted lecture intake pause, instructor content type, question-image storage metadata and poll visibility. Broadcasts now persist their pin/type and do not share the student cooldown. Paused/ended state is checked on the server, including direct API requests.
- Replaced the active-poll memory map with database-backed state. Poll identity comes from the verified account; vote record and counter update commit together; option membership is checked. Late joins/restarts restore the visible poll and the caller's saved vote. Ending a lecture closes its active polls.
- Rejoin rooms on every socket connection and refresh the full bundle with fresh auth: session lifecycle, questions, materials, gallery, bookmarks, question votes, pause and poll state. Guard async initialization and resource reloads against stale responses/StrictMode cleanup; show connection recovery feedback.
- Added course/resource workspace subscriptions, enrollment room updates and focus/reconnect refreshes. Expanded cache invalidation across lifecycle, course history, materials and teacher lists. Added a cache revision guard so an in-flight read cannot repopulate a just-invalidated cache.
- Fixed general-resource course collisions using per-owner lookup and unique generated fallback codes while retaining the existing general-vault workflow. Save to Vault is idempotent and only accepts media from the owning lecture.
- Added reference-aware storage cleanup with a persistent retry table. Gallery removal preserves saved vault references; the last reference queues physical cleanup. New question-image uploads have signed, account-bound receipts, stored public IDs and delayed cleanup of abandoned uploads. Legacy question images without a recorded public ID are left untouched rather than guessing which asset to destroy.

Schema / migration notes:

- Applied additive SQL files `20261105_classroom_state/migration.sql` and `20261105_storage_cleanup/migration.sql` with Prisma `db execute --schema prisma/schema.prisma --file ...`; regenerated Prisma Client 6.19.3. Existing records were retained. The repository's earlier incomplete migration baseline still requires Phase 4 documentation; these checks do not imply a full `migrate deploy` history has been reconstructed.
- Windows initially prevented Prisma engine replacement while the previous backend held its DLL open. Stopped that process and generation succeeded. The first execute invocation lacked `--schema`; corrected it before applying either migration.

Verification:

- Frontend production build passed. Backend source syntax checks passed (34 files). `npm test --prefix backend`: **16 tests passed**. Lint now reports **32 errors / 4 warnings**, down from the Phase 1 checkpoint; remaining broad cleanup is Phase 4.
- Added opt-in `backend/scripts/verifyClassroom.mjs`. Run from backend with `RUN_DB_TESTS=1` (PowerShell: `$env:RUN_DB_TESTS='1'; node scripts/verifyClassroom.mjs`). It uses real disposable Supabase rows, actual HTTP routes and Socket.io clients. Clerk verification is mocked only inside its isolated loopback test server, not in the running application; external AI is disabled for this persistence test.
- Expanded integration run: **11 scenarios passed**, using three independent disposable database identities. Verified one question notification, unrelated-room isolation, warm-cache refresh, pause/direct-submission enforcement, persistent broadcasts, concurrent duplicate upvotes/poll votes, voter spoof rejection, saved-vote/pause recovery after server restart, written-answer publication, end/history/poll consistency, transactional pruning and rollback, single batch notification, bookmark pruning, shared-file retention and last-reference cleanup.
- Signed-in Playwright UI: new lectures appeared in the dashboard without manual reload; pause survived page reload; ending disposable lecture A opened its recap while lecture B remained live in the other tab. No surprise export download occurred.
- Actual whiteboard upload returned 201; Save to Vault succeeded; removing the gallery image retained its vault copy, which downloaded with HTTP 200. Batch deletion redirected the live tab to dashboard, showed a deletion notice in the recap, and updated the open vault to zero lectures with its resource preserved. Course deletion updated the open course page to its unavailable state.
- Verified cleanup: browser course 9, lectures 46/47 and material 9 were removed; no `qa-phase2-` users or pending storage jobs remained. Integration fixtures were also removed. Original academic records and the user's Teacher role were preserved; extra test tabs were closed and the browser returned to dashboard.

Limits / next phase:

- Multi-user persistence/event integration uses test-scoped verification mocks; the browser checks used the user's existing Clerk session across tabs. A final real-Clerk two-account release rehearsal remains useful in Phase 4.
- AI quality/indexing status, moderation review UX, PDF-specific QA, comprehensive visual cleanup and the existing lint debt remain Phases 3â€“4. These were not marked complete by the Phase 2 build or socket tests.
- Cleanup retries target the single-backend localhost setup. Historical assets lacking stored metadata and distributed multi-server coordination are not claimed as solved by this phase.

## Handoff / resume notes

Read this file and `ASKANON_V2_REVIEW.md` before resuming. Check Git status and the latest log entries, then continue the unfinished phase. Historical markdown describes intent and past work; current source and recorded checks determine actual behavior. Never assume a running process, authentication session, Redis connection or AI feature is healthy without checking it.


## Phase 3 checkpoint - materials, AI, moderation and recaps (5 November 2026)

### Implemented

- Added one bounded Gemini generation client (`geminiClient.js`), configurable through `GEMINI_MODEL` (default: the existing `gemini-3.6-flash`). Each generation attempt has a 15-second provider timeout and no sequential model/retry waterfall. JSON parsing, empty responses and truncated output fail explicitly. HTTP errors are returned as errors rather than successful fabricated answers.
- Replaced generic recap fallbacks with validated, versioned results. Empty lectures report insufficient evidence without calling Gemini. Recap evidence includes instructor notes, code, written answers and ordered poll results; flagged/dismissed records are excluded. Background generation, visitor loads and owner refresh share a single in-process job. A failed refresh preserves the last valid result. Legacy unversioned summaries are regenerated rather than displayed as verified analysis.
- Added durable PDF indexing status/error/timestamp and ordered chunks using additive migration `20261105_material_index_state/migration.sql`. Applied with Prisma `db execute`; regenerated Prisma Client. No existing records were reset. The earlier migration-baseline caveat still applies.
- PDF indexing now bounds downloads (25 MB/15 seconds), splits long paragraphs into bounded chunks, validates finite 768-dimensional vectors, limits provider concurrency to three and uses a two-minute embedding deadline. All replacement embeddings must exist before a Prisma transaction replaces the old chunks. Vector-field assignment/search remain isolated, parameterized pgvector operations; ordinary CRUD uses Prisma.
- Added owner-only `POST /api/materials/:id/index`, shared in-process indexing jobs, restart interruption recovery, status notifications/cache invalidation and UI retry controls. Scanned/no-text PDFs receive an explicit OCR limitation. Images remain view/download resources, not purported searchable PDFs. A previous complete index remains usable after failed replacement.
- Summaries use up to three distributed ordered excerpts per PDF, across up to 12 PDFs. Responses expose document coverage and explicitly describe sampled excerpts. Topical retrieval filters low-similarity matches, supplies source labels and instructs the model to decline unsupported questions. This is retrieval assistance, not a guarantee of factual correctness or exhaustive document review. Existing legacy chunks should be reindexed to establish reliable document ordering.
- Added safe Markdown rendering through `react-markdown`, with raw HTML ignored, external model-provided links rendered as text and remote images suppressed. Source cards remain derived from actual stored materials. Removed the misleading materials-count-as-pgvector-index indicator. Fixed inherited whitespace that otherwise created oversized gaps around Markdown lists.
- Moderation cache keys include lecture title/subject; provider failures are explicitly unreviewed and not cached as successful checks. Removed ambiguous local terms such as `dumb`, `rubbish`, `mc` and `bc` that blocked legitimate academic text. AI review is conservative about uncertain topic relevance; only pending questions can be flagged, preserving teacher decisions. Automated AI flags no longer impose a two-minute penalty; local explicit abuse still does.
- Added an instructor Review filter with Restore/Dismiss controls. Normal unanswered/answered feeds and recaps exclude flagged/dismissed records. Attachment composition/review copy states that images are not moderated. This does not make moderation comprehensive or anonymous users accountable across devices.
- Duplicate candidates now exclude instructor broadcasts and code/image questions, use deterministic recent ordering, and use a consistent 0.82 threshold. Failed embedding requests are no longer cached as 24-hour null results. Upvoting a duplicate clears the draft only after success/already-voted confirmation. Failed upload and answer forms retain their drafts/selections.
- Recap load failures no longer masquerade as empty resource lists. Only the actual lecture owner sees faculty controls/guidance; cold-profile entry synchronizes the authenticated profile. Analysis failure/empty/retry states are visible, and export ignores legacy generic AI summaries. Instructor broadcasts are labelled separately and excluded from student-question statistics.
- PDF export now paginates full code and written answers, includes poll results and links to shared images/materials, omits quarantined records, distinguishes broadcasts, and respects the faculty/student presentation option. The existing print palette/header were retained. Export remains a deliberate action; lecture end does not trigger downloads.

### Verification and evidence

- `npm test` in backend: **24 passed**. New isolated provider fixtures cover rate limits, truncated JSON/text, empty/quarantined lectures, evidence inclusion, context-sensitive moderation caches, failed checks, bounded long-paragraph chunking, malformed vectors, single-flight recap/index jobs, failed reindex retention, exact/semantic/distinct duplicate cases and provider failure. Semantic unit vectors exercise selection logic; they are not a real-model accuracy benchmark.
- Reran `RUN_DB_TESTS=1 node scripts/verifyClassroom.mjs`: **11 scenarios passed**, including isolated audiences, persisted pause/broadcast/polls, atomic votes, backend restart, written answers, end/history, cascade rollback, shared storage retention and batch deletion. Disposable identities/records were cleaned up.
- Real signed-in Playwright course upload: a two-page synthetic binary-search PDF uploaded successfully to Cloudinary and reached `ready` with real Gemini embeddings. Course status/count updated over the workspace socket without reload.
- Real course summary returned HTTP 200 in **8.03 seconds**, cited the fixture document and covered the sorted-input invariant, logarithmic comparisons and the second-page worked example. The actual summary button also succeeded; Markdown list/emphasis output rendered safely with source cards and explicit coverage text.
- An unrelated chlorophyll/photosynthesis question returned an explicit refusal grounded in the supplied document's lack of biology coverage.
- Simulated storage failure against only the disposable PDF: chunk count stayed **1 before / 1 after**, status became `failed`, and the previous indexed timestamp remained. The owner retry endpoint returned 202 and restored `ready` using the real provider.
- Real lecture end/recap: created a disposable lecture with a note, code and written explanation. Gemini initially returned HTTP 503 `UNAVAILABLE` (high demand); the UI showed a retryable error and saved no generic analysis. Clicking Retry analysis later succeeded and displayed the actual code/answer concepts. The configured key/model work, but provider availability is intermittent.
- Browser PDF download succeeded. Inspected its rendered page, including generated analysis, instructor broadcast and written answer. Also generated, extracted and visually inspected a four-page stress export containing 95 code lines, a long answer, polls and resource links. End markers were present and quarantined text was absent.
- Frontend production build passed. **36 backend source files** passed syntax checks. Latest lint checkpoint: **30 errors / 4 warnings** (existing broader cleanup remains Phase 4). Main bundle is approximately 1.10 MB before gzip; route/export splitting remains planned.
- Installed `react-markdown`. npm's install-time audit reports 28 findings across the frontend dependency tree; dependency triage is pending final release checks. No blind dependency-wide upgrade was applied.
- Disposable browser fixtures: course 11, lecture 52 and material 11 were deleted through authorized APIs; final database/storage cleanup is checked separately below. The original courses/lectures and user's uncommitted work were retained.

### Remaining verification / limits

- Do not mark the entire product complete at this checkpoint. Finish a real multi-PDF coverage rehearsal, teacher/student moderation Restore/Dismiss rehearsal and attachment-only/provider-outage journey in the final acceptance pass. Automated duplicate fixtures do not establish real-model paraphrase precision.
- Full viewport/keyboard/dialog review, lightbox reset behavior, category consistency, broader UI polish, dependency/lint cleanup and migration-baseline/setup documentation remain Phase 4 work.
- The single-backend job maps avoid duplicate work in this localhost process; they are not distributed job locks. Index statuses persist and interrupted work is retried by the owner. Recap failures are request errors; they do not overwrite stored valid analysis.
- Scanned-PDF OCR and image interpretation/moderation remain unsupported. Summaries cover sampled excerpts and bounded document counts, with those limits shown to users.
- PDF stress verification covered English/ASCII code and long prose. Broader Unicode font support and very long metadata titles require final export checks.
- Independent real-Clerk teacher/student accounts and public deployment have not been verified in this checkpoint. Local role switching and existing workflow remain intact.

Final disposable-data check: course 11 = 0, lecture 52 = 0, material 11 = 0, pending storage cleanup jobs = 0. Browser returned to the original Teacher dashboard.



## Phase 4 checkpoint - interface, dependencies and real-account acceptance (5 November 2026)

### Interface and maintainability

- Preserved the existing dashboard component split and all ownership/role workflows. No navigation redesign or university administration layer was introduced.
- Replaced 103 rendered emoji groups with a small consistent SVG icon set. Kept the paper/crimson student theme and dark faculty workspace. Reduced the oversized empty-room card and improved compact control hit areas.
- Fixed reproduced 390 px overflow/clipping in the dashboard topbar/actions, teacher/student room headers, student composer, teacher question controls and recap topbar/tabs/analysis controls. Tab rows scroll inside their containers; resource cards wrap without increasing page width. Checked dashboard tabs, course vault, teacher room, student room and recap at 390, 768 and 1440 px; see verification limits below.
- Added visible keyboard focus and reduced-motion support. Standardized existing dialog/drawer/lightbox keyboard handling: named dialog roles, form-label association, focus containment, Escape dismissal, background scroll lock and focus return. Verified create-lecture dialog keyboard behavior in Playwright.
- Lightbox zoom resets both when an image changes and when the same image is closed/reopened. Added accessible zoom labels; the observed 130% -> reopen 100% sequence passed.
- Added native keyboard-operable poll choice buttons, accessible FAQ buttons and the resolved-question accordion's expanded state. Public copy now states sign-in requirements and actual anonymity/moderation limits, and removes unsupported 4.8x/zero-friction/100% archive metrics.
- Cleared frontend lint without disabling rules: removed unused props/state/dead CSV code, corrected optional catch bindings, moved time reads to a ticking hook and used React 19.2 effect events for initialization closures. The latest full check is lint-clean (zero errors/warnings).
- Lazy-loaded workspace routes and PDF generation, added a real not-found page and loading feedback. The prior roughly 1.10 MB single main chunk is now split: main entry about 344 kB, export about 392 kB, with route-specific code/CSS. Production build has no 500 kB chunk warning.
- Fixed a newly reproduced upload response/socket refresh race that inserted duplicate resource IDs. Course detail, room and dashboard now merge by material ID; course creation also deduplicates. Fixed the dashboard inline upload appending `file` twice and before its required metadata, which could fail authorization/multipart parsing. A real dashboard inline image upload returned 201 after the fix.
- Added `Problem Sheet` to the room drawer's category/filter options, consistent with course upload. Recap with no lecture-specific attachments now offers a course-vault link rather than implying the entire course has no resources.

### Dependencies and setup

- Applied `npm audit fix --ignore-scripts` within existing compatible version ranges in both packages, then regenerated Prisma Client and reran checks. No forced major upgrade was used; Prisma remains 6.19.3.
- Frontend audit after updates: **0 findings**, down from 28. Vite is 7.3.7; existing React/Clerk integration still passed live sign-in and socket journeys after updating compatible packages.
- Backend audit after compatible updates: **13 findings** (9 high, 2 moderate, 2 low; no critical). Remaining remediation requires separately reviewing Clerk/backend, Cloudinary/storage and Prisma/toolchain dependency majors. These are real remaining release-hardening tasks, not resolved by a passing build. The deprecated Clerk React package also has a future supported-package migration path; it was not mixed into the working authentication rewrite.
- Replaced outdated README claims (Tailwind, university-email enforcement and unauthenticated joining) with the actual stack/workflow. Added `frontend/.env.example`, `LOCAL_SETUP.md` and `scripts/check.mjs`.
- Added `backend/prisma/baseline.sql`, generated offline from the current Prisma model, for a dedicated empty database. It includes pgvector and all current tables. It was NOT applied to the existing database. The legacy migration history is incomplete; setup docs distinguish fresh bootstrap, existing-database drift review and migration-history resolution. No reset or automatic `_prisma_migrations` rewrite occurred.

### Browser/service verification

- Real multi-PDF fixture: uploaded the two-page binary-search PDF and a three-page transactions/isolation/recovery PDF. Both reached `ready` through real Cloudinary/Gemini. A real course summary returned 200 in about 15.36 seconds total, cited both sources, used four excerpts and included write-ahead logging/recovery from the final document page. Coverage reported 2 of 2 searchable PDFs.
- Provider-outage UI: intercepted only the disposable course's AI response as 503 in Playwright. The error displayed as an alert, the question draft remained, and resource cards stayed available. The interception was removed afterward; it did not change server credentials or production behavior.
- Moderation rehearsal: only two guarded disposable records were deliberately marked FLAGGED. The actual teacher Review controls restored one and dismissed the other. Student preview showed the restored question, hid the dismissed record and exposed no Review controls. No real student's content was flagged for this test.
- Image-only question composition uploaded through the actual browser and returned 201 with an empty text body and stored image receipt. Lightbox zoom/reopen behavior passed. Images remain explicitly outside automated content interpretation/moderation.
- A real second Clerk identity was supplied by the user in an isolated browser context. Its existing Teacher role was temporarily switched through the localhost UI to Student; the primary teacher remained signed in separately. The original second-account role was restored after testing.
- Real two-account journey passed: join by six-character code, auto-enrollment/access, Gemini duplicate suggestion for a genuine binary-search paraphrase, upvote-existing with draft clearing only after success, a distinct write-ahead-logging question reaching the teacher, teacher written answer reaching the student's resolved archive, poll launch and a real student vote reaching the teacher.
- Student reload recovered the saved poll vote. Student deletion attempt returned **403**; repeated upvote returned **409**; bookmark returned **200**; authenticated PDF download returned **200 / 4192 bytes**. These checks used the actual running backend and Clerk sessions, not test-token mocks.
- Ending through the teacher's actual confirmation dialog sent BOTH accounts to the correct recap. Ready AI output showed the faculty follow-up only to the owner and the student revision box to the student. Deleting the disposable lecture also updated the open student recap to its deleted notice.
- All test-owned browser records were deleted via authorized APIs: course 12, lecture 53, associated PDFs/image material, questions, poll/votes and bookmark. The final database/storage counts are recorded below. Both actual user accounts were retained and restored to Teacher; no personal academic records were deleted.
- Reran the isolated live-database/Socket.io regression suite after backend dependency updates: **11 scenarios passed**, fixtures cleaned up. The normal server still has no development test-token bypass.
- `node scripts/check.mjs` runs backend syntax (36 source files), all **24 backend tests**, frontend lint and production build. It does not call external AI or mutate the live database. Full final invocation/results are recorded below.

### Remaining release gaps

- This checkpoint demonstrates the listed localhost workflows, not an exhaustive guarantee for every input/device. Finish a broader route/keyboard/screen-reader sweep, long-title and many-resource stress, and PDF Unicode font coverage before declaring final release readiness.
- The full bootstrap SQL is generated but an isolated empty-database rehearsal and deliberate migration-history baseline are still pending. Do not blindly run the old migration chain on an empty or existing database.
- Backend audit findings and supported Clerk/Cloudinary SDK migrations remain outstanding. No public deployment is part of this delivery.
- OCR/image moderation and comprehensive semantic duplicate accuracy remain outside what these tests prove. Provider high-demand errors remain possible and are surfaced/retryable.

Final Phase 4 check results: `node scripts/check.mjs` passed (36 backend source syntax checks, 24 tests, frontend lint with 0 errors/warnings, and Vite build with no chunk-size warning). API, database and Redis health are ready. Database checks confirmed QA course/lecture/material/question/bookmark counts all zero and pending storage cleanup zero. Both real user IDs 3 and 5 remain Teacher. The independent student browser context remains signed in; no account was deleted or signed out.

`git diff --check` still reports trailing whitespace in the pre-existing combined working tree; it is not claimed clean. Unrelated user changes were not reset or reformatted to satisfy that Git check.

## Final AI, reliability and performance pass — 5 November 2026

This pass keeps the existing Teacher/Student workflow, ownership, courses and lecture URLs. Existing uncommitted work was preserved; no reset or unrelated formatting was performed.

### Completed changes

- Fixed the reported AI failure at its source: the previously configured generation model returned a daily-quota 429, with a retry delay of roughly 15 hours. Switched this localhost configuration to `gemini-3.1-flash-lite`, which returned successful real responses. No billing setting was changed. Daily exhaustion, short rate limits, timeouts and unavailable service now surface as typed HTTP errors rather than successful fake insights.
- Moderation now runs before a question is published. A local profanity check rejects explicit abuse; Gemini checks relevance and abusive text with lecture context. Flagged submissions persist with their reason and go only to the owner's private Review stream. Public bundles, question reads and bookmarks hide quarantined/dismissed records. Provider failure is explicitly marked unavailable; image contents are not moderated.
- Unified question and document embedding dimensions at 768. New accepted questions warm their cached vectors; duplicate checks reuse candidate vectors instead of triggering up to 25 cold embedding requests. Exact repeats remain deterministic. A real final-model paraphrase scored 0.9408 and was detected. This is a working example, not a precision/recall benchmark; cold historical semantic candidates can be skipped.
- Replaced overlapping PDF/chat controls with one course revision assistant: material scope plus Explain, Overview, Revision sheet or Practice questions. Results use retrieved PDF excerpts and source/page links. Ready-state controls prevent requests against unindexed-only material. Images offer viewing/downloading, not unsupported AI chat.
- PDF indexing stores page numbers, batches metadata inserts/vector updates atomically, retains a valid old index on replacement failure, and supports owner retry. Added additive migration `20261105_moderation_sources`; Prisma Client remains 6.19.3. Existing PDFs need reindexing to gain reliable page citations.
- Removed the duplicate End Lecture and image-sharing actions. Browser counts confirmed one of each. Recap/drawer resources distinguish images from PDFs. Removed additional rendered emoji labels and a duplicate recap export control. Fixed the new long resource-action overflow at 390 px.
- Added cache single-flight and a short local read-through layer, cached/invalidation-aware RAG manifests and successful answers, shared room snapshots with private fields kept separate, and one recap-bundle endpoint. Removed redundant identity-sync/enrollment requests. Necessary transaction, authorization and socket behavior remain intact.
- Migrated deprecated backend Clerk integration to `@clerk/backend`, Cloudinary to SDK 2 with a streaming Multer adapter, and dev watching to Node's built-in watcher. Verified both actual Clerk accounts and actual PDF/image uploads after migration. Backend and frontend dependency audits now each report zero findings in the checked lockfiles. SDK references: https://clerk.com/docs/reference/backend/verify-token and https://cloudinary.com/documentation/node_image_and_video_upload .
- Added lazy-loaded, licensed Noto Sans export fonts and wrapped long metadata. Extracted and visually checked the two-page stress export containing Greek/Latin Unicode and long content. Comprehensive CJK/complex-script export is not established.
- Rehearsed the full current bootstrap in a uniquely named temporary PostgreSQL schema: 14 tables, Prisma CRUD, pgvector, then schema cleanup. Existing public tables and migration history were not reset or rewritten.

### Evidence and limits

- Latest `node scripts/check.mjs`: 37 backend files checked; 27 tests passed; frontend lint zero errors/warnings; production build passed without the large-chunk warning.
- Latest isolated database/Socket.io suite completed and cleaned its disposable records; the suite covers 11 scenarios. Separate real Clerk two-account journeys cover joining, enrollment, duplicates, votes, written answers, polls, recap and deletion in the preceding checkpoint.
- This pass's real browser checks: safe academic question published; off-topic question returned 202 and was quarantined; owner dismissed it; student recap contained question 95 but excluded dismissed question 94. Both accounts transitioned to recap when the owner concluded the lecture. Recap showed material 20 as image and material 18 as PDF.
- Real redesigned-assistant Practice request returned 200 in approximately 5.5 seconds, citing pages 1, 2 and 3. The earlier 10-second generation deadline proved too short once; document generation now has a bounded 25-second deadline, while moderation retains its shorter limit. No service can guarantee provider response time or unlimited free quota.
- Sampled warm course request: about 427 ms; repeated cached AI result: about 431 ms. A normal question post measured about 4.25 seconds and PDF upload about 7.25 seconds. These are observed samples, not universal targets.
- The configured Supabase database is in Sydney. Warm direct reads measured about 397–399 ms; a cold connection about 3.7 seconds. Remote transaction round trips remain a real latency constraint. A local-copy versus existing-cloud preference was requested; no database was moved. Docker exists but its daemon was not running. Keep the current cloud configuration unless the user chooses otherwise.
- This is a localhost acceptance pass, not a guarantee for every device/input. OCR, image moderation, exhaustive semantic accuracy, full screen-reader certification and public production deployment remain outside the established coverage.

### Disposable browser fixture cleanup

Course 15 (`QA AI acceptance - disposable`), ended lecture 59 (`DDPZRC`), materials 18/20, gallery image 30 and associated test questions were created for this pass. Automatic approval review rejected their deletion because these specific records were not explicitly authorized for deletion. Approval has been requested; until it arrives they remain intact. Do not report these fixtures as cleaned. All other user courses, especially course 14, were retained. Primary account 5 remains Student and second account 3 remains Teacher; no account role was changed in this pass.

## Follow-up: reproduced classroom controls, moderation and latency — 6 November 2026

### Reproduced and fixed

- The saved-question star literally rendered an empty string in the bookmarked state. It now uses a persistent SVG with filled/outlined states, accessible name/pressed state and a per-question request guard. Faculty vote squares now explicitly inherit readable foreground color rather than the browser's dark button text.
- The prior moderation contract was fail-open: provider timeout/missing configuration published unchecked text. It is now fail-closed for text: retain the submission as FLAGGED with `moderation_status=unavailable`, explain the reason and deliver it only to the instructor. Attachment-only questions remain outside image-content moderation. The provider deadline is five seconds and failed checks are not cached.
- Reproduced Gemini allowing “How are you today?” in a CPU lecture. Added narrow exact greeting detection and explicit examples to the contextual prompt; bumped the moderation cache version so earlier permissive results are not reused. This does not claim to eliminate every model classification mistake.
- Renamed Review to Needs review and added inline explanation: held questions are hidden from students; Restore publishes them and Dismiss keeps them hidden. It also handles checks that could not finish, avoiding silent publication.
- Pin/unpin/mark-answered and review decisions now update visible state optimistically. Conflicting spotlight operations are guarded; failures roll back and attempt an authoritative refresh. Success is only confirmed after the server responds. Bookmark requests are guarded against double toggles. Existing socket payloads remain unchanged.
- Removed redundant ownership preflight reads for question mutations: ownership is still verified inside each transaction, with the Teacher role checked by the route. Serializable transactions and topological deletion remain intact. Empty poll/question/media branches skip unnecessary deletion statements.
- Dashboard dialogs/actions no longer await another complete list fetch after a committed action. Background refresh remains, and a successful refresh clears stale connection errors left by a server restart.
- Corrected faculty grid flex/min-height sizing so it scrolls within the available room height. Bounded the course AI answer to 60dvh with keyboard-accessible scrolling, keeping references/materials reachable. Source references wrap safely.

### System issue identified

A simultaneous integration process exhausted the Supabase session pool: `EMAXCONNSESSION`, pool size 15. The runtime Prisma pool now defaults to four connections per process (`PRISMA_CONNECTION_LIMIT`), leaving capacity for other processes; the legacy pg adapter is capped at two. This avoids the observed pool exhaustion in the subsequent full run. It does not remove physical latency to the Sydney database. Avoid running unnecessary duplicate backend processes.

A real pin request under concurrent integration load took about 4.91 seconds to confirm; its UI transition took about 532 ms including browser click scheduling. A separate delayed-response check observed an optimistic transition in 104 ms before releasing the request. No claim is made that cross-device persistence, deletion or every website action is instant. A separate localhost PostgreSQL/pgvector copy was proposed; existing Supabase data/configuration were not moved pending the user's choice.

### Verification

- `node scripts/check.mjs` passed: 37 backend syntax checks, **29 tests**, lint zero errors/warnings, production build passed.
- Updated real-database/Socket.io integration passed **12 scenarios**, then cleaned its own disposable records. The harness disables Gemini, so it now deliberately verifies quarantine followed by instructor Restore before testing votes. Earlier runs exposed pool exhaustion and the changed moderation expectation; these failures were investigated rather than reported as passes.
- Real signed-in student academic CPU question returned 201 / checked (about 5.95 s in that sample). Exact greeting returned 202 / FLAGGED, appeared in the teacher's explained review queue, and was absent from the student's bundle.
- Real teacher star remained visible as a filled SVG; vote text color was rgb(241,245,249) against rgb(29,33,40). Pin/unpin saved with HTTP 200. A synthetic HTTP 503 restored the old pin state; interception was removed afterward.
- Teacher room at 390/768/1440 px had no horizontal overflow; its console ended at viewport height. Real course-14 Explain request returned 200 with a source; answer height was bounded and page bottom reachable at each width. Screenshots `tmp/teacher-controls-fixed.png` and `tmp/vault-bottom-fixed.png` were visually inspected.
- Existing personal CPU room DH7D20 and its questions were not changed. Test lecture 69/B0NH90 was created in existing QA course 15, used questions 101/102/104 and a QA bookmark, then ended through the actual UI. It remains pending cleanup authorization along with the prior QA course/lecture. No user role was changed. Both signed-in browser contexts returned to dashboards.

### AI product direction

Keep source-grounded questions as the vault's main action. Generic summaries have limited differentiation; optional overviews are secondary and explicitly sampled. Strong follow-up options are: (1) suggest a relevant PDF passage beside an unanswered live doubt, (2) group semantic question clusters into instructor-visible confusion topics, and (3) build source-linked practice from unanswered/resolved lecture questions. Implement and evaluate one focused feature rather than adding generic chatbot screens. Current chunking, embeddings, pgvector retrieval, citations and cache/access controls already constitute real RAG; do not describe it as training a model or claim benchmarked accuracy.

## Shortening the real interaction paths while retaining Supabase — 6 November 2026

User decision: do not set up local PostgreSQL/pgvector. Retain the remote database; improve code paths that also benefit deployment. No database region/connection URL, personal data or existing migration history was changed.

### Implemented

- Session creation now attempts the insert directly, relying on the existing unique room-code constraint and retrying rare collisions (bounded to five attempts). Removed the separate uniqueness read. Reuses the course fields already read/authorized by the route instead of fetching that relation again for the response.
- Removed the two sequential, unnecessary create-time cache fills. Course summary invalidation/notification runs after the committed create response; invalidation still precedes its workspace notification. The immediate response includes the persisted room ID/code, not a provisional room.
- Course creation similarly relies on its unique constraint and returns HTTP 409 on collisions. A new course's zero resource/session counts are supplied directly instead of re-querying them.
- Cache misses populate local memory and enqueue Redis cache fills without waiting for a remote SET reply. Authoritative invalidations still await DEL before notifications; commands retain ordering on the shared Redis client.
- Batch deletion invalidates course views once per distinct course and groups session-key invalidation, replacing a serial repeated invalidation loop. Removed duplicate preflight ownership reads for single/batch lecture deletion; the existing serializable pruning transaction still validates every owner/existence before deleting anything. Updated unit coverage verifies non-owner and mixed-batch rejection.
- Enabled Prisma 6.19.3 `relationJoins` client preview feature, then regenerated the client. This is a client query strategy, not a database schema migration. Nested relation reads use database-side joins instead of separate remote reads. No raw SQL CRUD was introduced. Reference: https://www.prisma.io/docs/orm/v6/reference/prisma-client-reference#relationloadstrategy-preview .
- Removed the dashboard's redundant `refresh-workspace` emission on every workspace update. Enrollment/leave endpoints already join/leave course rooms; reconnect still establishes membership. Avoids an extra membership query and ready/refresh cycle per update.
- Added `Server-Timing` stages for create/status/delete and read-only `backend/scripts/profileDatabase.mjs`. The integration harness records sampled interaction times. These expose timings, not SQL contents, auth tokens or classroom text.

### Measurements and verification

Read-only probe on the existing database, before versus after successfully regenerating the join client:

| Read | Before | After |
|---|---|---|
| Warm simple table read | ~402–403 ms, 1 statement | ~402–403 ms, 1 statement |
| Warm question + session | ~809 ms, 2 statements | ~404 ms, 1 statement |

The relation probe is approximately 50% faster for that read; it does not establish a 50% whole-app improvement. Cold first connection remained ~3.7 seconds.

Two successive integration samples (not a statistically controlled performance benchmark): status update 3659 ms before joins -> 2769 ms after; transaction stage 3606 -> 2711 ms; cache/notification stage ~44 ms. New create-path samples ranged 853–4356 ms across warm/cold/different-user conditions; warm insert itself could be ~403 ms. A signed-in browser read returned teacher session list in ~61 ms from cache and course detail in ~1676 ms cold.

A populated lecture deletion remained slow: 12354 ms then 12792 ms, mostly in the pruning transaction (11110/11883 ms). Grouped invalidation and reduced reads do not make multi-statement remote pruning instant. Do not report deletion latency as solved. A production backend located near PostgreSQL is the strongest next infrastructure step while retaining Supabase. If deletion must acknowledge immediately, implement a durable job plus visible pending/deletion state and access checks; do not respond success before an unreliable fire-and-forget deletion.

Validation: **38 backend source syntax checks, 31 tests, frontend lint and production build passed**. Full independent-user live database/Socket.io regression passed **12 scenarios** after joins/deletion changes, then cleaned its own fixtures. Real signed-in read endpoints returned 200. Existing QA cleanup approval remains separate; no user course or lecture was deleted by these benchmarks. The backend was restarted with the regenerated client; one Windows DLL lock during generation was resolved by stopping the process and retrying successfully. An earlier probe before generation completed was discarded, not treated as an after-result.

## Responsive operations and durable deletion — 7 November 2026

Scope: keep the current Supabase region and Teacher/Student workflow. Preserve all existing uncommitted work and personal classroom data. No local database, region migration or deployment was performed.

### Interface feedback and request guards

- Added shared BusyButton/PageSkeleton components and a network activity indicator. Buttons display spinners and disable repeated submission; initial route/data loads use skeletons. Background reads show a small Updating indicator while existing content remains visible. Requests exceeding eight seconds show a still-working explanation. HTTP waits are bounded to 60 seconds (120 for uploads); Socket.io actions retain bounded acknowledgements.
- Covered create/delete/assign/leave, answer/pin/bookmark, media/vault actions, uploads, downloads, PDF export, AI generation, poll launch/vote/end/remove and pause/resume. Fast synchronous navigation/copy controls do not get artificial delays.
- Added synchronous ref-based action guards, not just disabled styling. Pending destructive/create dialogs reject Escape/backdrop/cancel dismissal; failure stops activity and leaves drafts/dialogs available for retry. Downloads and exports coalesce duplicate requests, with exports keyed by lecture and audience.
- Fixed poll launch clearing its draft before the server acknowledged success. Poll launch now remains open while saving, closes/resets only after success, and preserves the question/options on timeout. Duplicate-question upvote and room material upload also guard repeated submissions and retain unsaved input.
- Loading indicators match the faculty/student theme and reduced-motion settings. Deletion progress remains visible in a sticky status panel, with a retry control after failure.

### Less frontend/server work

- Added bounded in-memory, account/role-scoped dashboard/course snapshots (30-second TTL, 40 entries) and in-flight request sharing. Returning to a recent view can display its snapshot while an authoritative refresh runs. Mutations and server lifecycle events invalidate snapshots; older reads cannot repopulate invalidated entries or overwrite newer UI state. Authorization failures clear protected snapshots; changing Clerk identity remounts the protected page.
- The student dashboard initially requests live rooms and enrolled courses. History and notebook data load only when their tab is opened. Notebook/history errors are no longer converted into fabricated empty arrays.
- Added progressive rendering in batches of 20 for dashboard lists and course materials; search/filter still considers the complete fetched collection. This reduces DOM work, not the size of every backend list response. Full server-side cursor pagination is not claimed implemented.
- Removed unused material previews from teacher course-card queries; file lists remain available in the course vault. Existing socket reconciliation remains active. Profile-sync failure is handled without an unhandled promise rejection if the parallel initial data request also fails.
- Kept activity tracking lazy on authenticated routes, avoiding pulling Axios into the public landing entry solely for progress tracking. The final build stays split without the large-chunk warning.

### Durable lecture deletion

- Applied additive migration `20261107_session_deletion_jobs`: a durable job table plus nullable session job marker. Existing rows/data and migration history were retained; Prisma remains 6.19.3. Regenerated the full empty-database bootstrap with the new model (15 tables).
- DELETE lecture / batch delete now return HTTP 202 after an owner-checked, serializable enqueue transaction. Acknowledgement means queued, not physically deleted. UI closes the confirmation with a queued message and shows progress; normal lecture cards/doubts exclude pending jobs.
- A queued lecture denies access and new writes immediately. Student active/history/notebook queries and course lecture lists omit queued records. Late uploads, questions, votes, pin/answer operations, polls and socket controls check the marker as appropriate. Shared course-vault resources retain their existing retention rules.
- The backend worker claims persisted jobs with a conditional two-minute lease and token, then uses the existing transactional topological pruning. It handles already-pruned rows idempotently, retries transient failures, and marks repeated failures FAILED with an owner-only retry action. Startup/periodic recovery reads jobs from PostgreSQL; work is not dependent on a fire-and-forget callback surviving.
- Existing session-deleted / sessions-batch-deleted completion payloads remain. Queuing closes the classroom; completion notifications follow actual cleanup. The dashboard polls while jobs remain pending to reconcile missed events.
- Batched multi-asset cleanup bookkeeping uses Prisma createMany/updateMany with deduplicated image/raw identities, avoiding an upsert round trip per attachment. Durable Cloudinary cleanup still checks shared references before destroying an asset.
- Infrastructure scope stays one persistent application backend. Job leases prevent double claims, but multiple production Socket.io replicas would additionally require a shared event adapter; this work does not claim a complete distributed deployment.

### Verification recorded so far

- Cache unit tests cover shared requests, identity/role partitioning, invalidation races, expiry and retry after failure. Deletion tests cover ownership, duplicate enqueue, lease ownership, idempotent recovery, failed-job retry and retry exhaustion. Storage batching covers identity/type deduplication and due-time preservation.
- Live database/Socket.io suite passed 13 scenarios after queued deletion was introduced, including HTTP 202, immediate HTTP 410 access denial, actual cascade completion, batch notification once, retained shared vault assets and execution of a persisted job when the worker resumes. Its isolated fixtures were cleaned. A final rerun after storage batching is recorded below when complete.
- Sample queued DELETE acknowledgement was about 3535 ms against the unchanged remote database, versus the preceding roughly 12–13-second synchronous deletion samples. Cleanup continues afterward; this does not establish instant persistence or a universal latency target.
- Isolated bootstrap rehearsal passed with 15 tables, Prisma CRUD, deletion marker/job linkage, and real multi-asset cleanup SQL. The temporary schema was removed; public data was not reset.
- Real signed-in browser plus delayed read interception: initial faculty skeleton visible; overlapping loads produced one sessions request and one courses request. Returning from a vault displayed dashboard data while both refresh responses were held, with no full-page skeleton.
- Actual student request counts: initial history=0/notebook=0; opening notebook requested it once without fetching history; opening history then requested history once.
- Synthetic create-failure browser check: exactly one POST, visible spinner and long-wait message, Escape guarded, original draft retained and submit re-enabled after 503. The POST was intercepted; no lecture was created for this UI check.
- Synthetic 45-row display check rendered 20 cards initially, then 40 after Show more. Simulated queued/failed deletion displayed its pending spinner and retry panel. These rows/jobs existed only in browser interception, not PostgreSQL. Interceptions were removed and real views restored.
- A pin/unpin save failure was intercepted in the existing faculty room: visible spinner, disabled action and rollback verified. No real status mutation was sent. A poll-launch frame was blocked only in the test browser: one attempt, visible loader, Escape guarded, draft preserved on acknowledgement timeout; WebSocket.send was restored and no test poll was launched.
- Checked deletion feedback at 390/768/1440 px without horizontal overflow and visually inspected loading/retry screenshots. Existing personal CPU room DH7D20, prior QA fixtures and account roles were retained.

Final check results and cleanup status follow below. Known limits remain remote database latency, provider quota/latency, unsupported OCR/image moderation and public deployment. No claim is made that every action now saves instantly.

### Final results — 7 November responsive-operations pass

- Final `node scripts/check.mjs` passed: 40 backend source files checked, **37 backend tests + 3 frontend cache tests**, frontend lint with zero errors/warnings, and production build without a large-chunk warning. A final frontend lint/build also passed after the authentication-loading skeleton polish. Main entry remains about 346 kB before gzip; activity/Axios tracking stays in authenticated chunks.
- Final real database/Socket.io rerun passed **13 scenarios** after batched asset bookkeeping and cleaned its own users/course/lecture/material/job fixtures. Queued DELETE acknowledgement measured **3450 ms** in that run; physical pruning and storage cleanup run afterward. Status update sample was 2834 ms. These remain remote-database samples, not instant-operation guarantees.
- Isolated 15-table bootstrap plus CRUD/job linkage/multi-asset cleanup insert/update checks passed; temporary schema removed. Final public checks: deletion jobs = 0, session deletion markers = 0, disposable integration users = 0.
- Restored the normal backend with the final code. API/database/Redis health report ready. Both real signed-in browser contexts returned to actual dashboards with no fresh page errors or workspace-error banner; student account 5 and faculty account 3 retain their roles. All synthetic HTTP/WebSocket interception was removed. Prior QA fixtures and personal records remain untouched.
- Known scope limits: progressive rendering is not full server-side pagination; confirmed writes still incur remote database latency; background file removal may finish after lecture-row pruning; multi-replica socket delivery is not configured. Existing OCR/image-moderation/provider-quota/deployment limits remain.

## UI precision and usable scanned PDFs - 7 November 2026

This checkpoint supersedes the earlier Review queue, visible background-refresh/cleanup banners and unsupported-OCR statements. Existing Teacher/Student ownership, course workflow, uncommitted work and personal classrooms were retained. No database region move, deployment, reset or schema migration was performed in this follow-up.

### Changes delivered

- Pin/Unpin and Answer now show a spinner only for the requested action. Bookmark stars update without a separate spinner; repeated writes remain guarded. Normal background reads have no persistent progress banner. Running cleanup stays quiet, while failed jobs remain visible with Retry. Long foreground operations retain explanatory feedback.
- Removed the teacher Review filter and its dead rendering paths. Automatically rejected text returns 422 without creating/publishing a question; unavailable checking returns retryable 503, keeping the draft. Rejected moderation submissions release their ordinary cooldown; profanity penalties are preserved. Historical flagged rows were not deleted, and image-only classroom attachments still lack image moderation.
- Added bounded scanned-PDF text recovery before the existing chunk/embed/store pipeline. Native-text pages skip OCR; unreadable pages are rendered individually and transcribed with the configured Gemini model. Up to 12 scanned pages, a document deadline, per-page timeout, 6 MB image limit and 24-hour successful-transcription cache bound work. Page references survive chunking. Old complete indexes remain usable if a replacement fails; interrupted OCR is retryable after startup recovery.
- Reindexed the existing `revision` upload successfully. Its single scanned page is a course-completion certificate, not academic revision notes. A real signed-in material question returned HTTP 200 and correctly identified the certificate, with a source reference. No academic content was invented to fill the missing notes. Provider quota/availability still applies.
- Replaced dense hosted-session cards with an aligned desktop list and compact mobile cards. Search, course/status filters, sort, assignment, selection and batch-delete handlers are preserved. Discussion counts, dates, code copying and primary action are separated. Removed the vault button labelled Launch Live Room that merely navigated back to the dashboard.
- Public landing content no longer waits for Clerk authentication loading. Nonblocking font loading uses the shared Inter/Newsreader styles with system monospace. Rewrote generic/unsupported claims around signed-in code joining, anonymous display, voting, semantic suggestions, course PDFs and recaps. Reduced section gaps, replaced feature emojis with icons, corrected labels, improved mobile demo controls and centered section navigation below the header. Role selection uses keyboard-operable buttons.
- Fixed narrow-screen minimum-width overflow in faculty active-room/course grids, doubts actions/filters, student course grids, course AI controls, join navigation and recap material cards. Live tabs no longer clip their underline/text or expose a spurious scrollbar. Teacher card controls fit one row at 390 px and use a deliberate two-column layout on the smallest phones.

### Verification

- `node scripts/check.mjs`: 41 backend source syntax checks, **41 backend tests + 3 frontend cache tests**, lint and production build passed. OCR tests cover native-text bypass, page bounds, cached transcription, source-page preservation, malformed/empty outcomes and provider failure. Moderation tests verify no persistence on rejection/outage; cooldown test preserves abuse penalties.
- Real PostgreSQL/Socket.io integration passed **13 scenarios with 4 independent disposable users**, including publication, unavailable moderation, pause, pin persistence, concurrent votes/polls, server restart, written answers, end-session, rollback, durable deletion, batch notifications and shared-asset retention/cleanup. Its own records were cleaned; the regular backend was restored.
- Pin failure was intercepted in the real teacher browser (no actual status mutation): Pin spinner=1, Answer spinner=0, Review controls=0. Original state and enabled controls returned after authoritative reconciliation. Hosted-session search and selection/clear worked without deleting records. Create lecture/course dialogs fitted a 320 px viewport and closed using Escape before submission.
- Checked public landing, onboarding, join, faculty Home/Sessions/Doubts/Courses, student courses/history/notebook, course vault, recap and both live-room views across 320/390/768/1440 px; additional 1024 px checks covered landing, vault, sessions and student live view. Corrected observed page overflow; intentional navigation strips scroll internally. Inspected representative desktop/mobile screenshots, not an exhaustive every-browser certification.
- Blocked the external Clerk service in a fresh browser context: landing heading/content rendered with no opening skeleton. Desktop/mobile Live Experience links centered the heading with zero measured center offset; other main section links were checked (FAQ remains naturally constrained by the document end). Signed-in browser checks produced no fresh page errors. API, database and Redis health all ready.
- Current isolated remote-database samples: session creation about 0.8-4.5 s, queued delete acknowledgement about 3.7 s. These are test samples, not performance guarantees. Optimistic presentation and background cleanup reduce perceived waiting; geography, persistence and AI latency remain.

### Remaining boundaries

No claim is made that every control on every browser/device is certified or that saves are instantaneous. Image-only classroom abuse detection, large scanned-document OCR, provider quota and production deployment remain separate limitations. Historical work-log entries are retained for traceability. Older user/QA data was not removed.

## Landing simplification and flagship vault AI - 7 November 2026

### Landing

- Shortened the hero to one value statement, removed the redundant four-step strip and long comparison cards, reduced capabilities to three concise cards, and simplified faculty copy. Landing headings use a consistent sans-serif treatment without the oversized italic slogan.
- Standardized the tagline to **Same Classroom. More Questions.** in the header, hero, footer and document title. Header, mobile menu and footer now render the same navigation list with identical labels and section IDs.
- Fixed a real navigation defect: `overflow-x: hidden` on the landing wrapper created a scrolling ancestor that defeated the sticky header. Switched to `clip`. Anchor logic centers the entire section when it fits, accounting for the sticky header; taller phone sections start below the header so their heading remains visible. Initial hash alignment waits for image/font layout. Reduced-motion preferences remain respected.
- Browser check: all five links from both desktop header and footer reached their matching section with zero rounded center error; header top remained zero. Mobile menu links also aligned correctly, with the tall demo aligned below the header. No horizontal page overflow at 320, 390, 768, 1024 or 1440 px.

### Course vault AI

- Replaced the task dropdown and oversized synthesis panel with **Ask your PDFs**: select one PDF or all ready PDFs, enter a question, see the answer and source links, then expand the actual retrieved passages. Added an explicit question label, multiline input, duplicate-submit guard, request cancellation on leaving/changing courses, clear/retry actions and responsive styling. Answers flow naturally down the page.
- Source cards now open the original PDF with a page fragment. Evidence includes source number, PDF ID/title, page and exact stored chunk text. Failed generation still returns retrieved evidence through the authorized request, without claiming a successful generated answer.
- Reproduced the reported failure: `gemini-3.1-flash-lite` returned HTTP 503 UNAVAILABLE/high demand. It was a provider generation failure, not absent vectors. Added one bounded lightweight fallback for transient 500/502/503/504 responses in vault answers and scanned-page transcription, with a shared deadline. Quota and invalid/incomplete responses do not trigger retry loops.
- Verified fallback `gemini-3.5-flash-lite` with real generation. The provider listed the older 2.5 model but rejected it at generation time; that retired model is not the final default. The optional fallback setting is documented in `.env.example`; actual secrets, billing and primary model were not changed.
- Rebuilt the two legacy indexes referenced in the screenshot: material 4 (resume) now has 3 page-linked chunks; material 2 (`operating basics`) has 12. Its first rebuild encountered provider overload during scanned-page transcription; its old index survived, and the bounded-fallback rebuild succeeded. Both originals were retained. The file titled `operating basics` contains an IoT odor-detection/perfume-sprayer presentation, so it is not evidence for operating-system definitions.
- Added the read-only `backend/scripts/inspectRagIndex.mjs` tool. Live inspection confirms pgvector 0.8.0 and 768-dimensional stored vectors in PostgreSQL. Current indexes are the primary key and material_id B-tree; no HNSW/IVFFlat index exists. Browser IndexedDB is not the vector store.
- Wrote `ASKANON_AI_ARCHITECTURE.md` with the full upload/retrieval flowchart, concrete schema, limits, inspection commands, current provider recovery, code map and honest interview explanation. Updated the shorter walkthrough and local setup notes.

### Verification and boundaries

- Final root check passed: 41 backend syntax checks, **43 backend tests + 3 frontend tests**, frontend lint and production build. Added tests for one-shot overload fallback, no quota retry, and evidence preservation on generation failure. Existing PDF/cooldown/authorization checks continue passing.
- Real signed-in material request returned HTTP 200 for the resume projects question, with three retrieved chunks and a page-1 source. A question unsupported by the IoT PDF explicitly declined to invent an OS definition. A whole-course overview returned HTTP 200 with both selected documents and six sampled excerpts.
- Browser-injected 503 test preserved the question draft, displayed evidence and Retry, and recovered against the real endpoint after interception was removed. No synthetic interceptor remains.
- Inspected desktop/mobile landing and vault screenshots, tested material-source links including `#page=1`, and checked both pages for overflow at 320/390/768/1024/1440 px. The broader 13-scenario classroom regression from the previous checkpoint was not rerun for this landing/vault-only pass.
- Server restored with final code. No personal course/lecture/PDF deletion, database-region migration, schema migration, billing change or production deployment occurred. Reindexing updated only derived records for the two requested PDFs.
- Remaining honest limits: provider availability and quota, exact vector search at current scale, no conversational memory/reranker/chunk overlap, sampled broad overviews, bounded scanned-document processing and older unrelated legacy indexes. Citation references are evidence to inspect, not a guarantee of correctness.

## Course companion and editorial landing restoration - 7 November 2026

User requested the fuller companion improvements and restoration of the earlier landing appearance. Continued from the interrupted implementation without reverting unrelated or pre-existing changes.

### Delivered behavior

- Restored the landing's serif/italic editorial treatment, photograph overlay, four-step strip and comparison-card layout. Removed the latest sans-serif redesign overrides. Kept the exact Same Classroom. More Questions. tagline, shared header/footer link list, sticky-header fix, auth-independent rendering and responsive corrections. This is a targeted restoration of the earlier appearance, not a reset to the much older Git HEAD.
- The course vault is now a short study conversation. It displays up to eight successful exchanges in the current page and sends only the most recent three as bounded context. New conversation, PDF selection changes and course changes reset context. No chat table, agent framework or new database migration was introduced.
- Follow-up retrieval combines bounded recent question/answer context with the current question. Previous AI answers are explicitly non-authoritative: factual claims must be supported by fresh retrieved excerpts. Answer caching includes the normalized conversation context so generic follow-ups from different topics do not share a context-free cache key.
- Increased semantic seeds to 8 for a selected PDF and 12 for a course, retaining the 0.45 similarity threshold. Added immediate neighboring chunks with scoped Prisma queries and deduplication, bounded to 14/18 total passages. Existing pgvector storage, authorization and page citations remain.
- Replaced the terse answer instruction with adaptive depth: direct factual answers, useful structured concept explanations, and longer detailed requests when supported. Raised output allowance to 6000 tokens within a 40-second generation deadline; thin documents are not padded to hit a word count. Existing bounded overload fallback remains.
- Structured generation returns the explanation, up to three evidence-grounded next questions and optional practice separately. Explain more simply and Check my understanding use the current conversation. Practice presents up to three source-supported questions; worked answers are hidden behind reveal controls. Insufficient material may produce fewer questions rather than invented content.
- Added standard GFM Markdown support so comparison tables render correctly. Wide tables scroll inside their own accessible region instead of widening the page. Existing HTML/image suppression remains. Frontend package/lock files retain existing dependencies plus remark-gfm.
- Failed follow-ups retain prior conversation and the current draft, with Retry and available retrieved passages. Successful requests clear the composer; guarded requests prevent duplicate sends. Navigation aborts pending work, and changing courses clears its loading state.

### Verification

- Final root check passed: 41 backend syntax checks, **47 backend tests + 3 frontend cache tests**, lint and production build. Final frontend lint/build also passed after the table renderer was added. New tests cover bounded/malformed history, contextual retrieval queries, authorized-neighbor expansion and deduplication, separate practice answers, no-evidence behavior and malformed structured output. Existing overview concurrency/reindex-cache test was updated to the structured response format; it still verifies cache invalidation.
- Real signed-in browser, existing material 2: detailed IoT explanation returned HTTP 200, 383 words, 11 retrieved passages and three specific follow-up suggestions. Explain more simply sent one prior exchange, retained the topic and returned HTTP 200 with 191 words. Practice sent two prior exchanges and returned HTTP 200 with three questions; all worked answers initially collapsed, one reveal verified.
- Actual additional comparison request succeeded after the dev dependency refresh reset the selection to course-wide scope. Its first automation wait expected the old material-specific URL and timed out; this was an automation mismatch, not a failed API response. The generated response chose prose, so table rendering was separately verified with an explicitly synthetic Markdown fixture.
- Responsive checks on landing and companion at 320/390/768/1024/1440 px found no page overflow. At 320 px, a 420 px comparison table scrolled within a 246 px region while document width stayed 314 px. Inspected representative restored landing and practice screenshots.
- Browser-only injected 503 preserved one prior exchange and the follow-up draft, with Retry enabled. New conversation cleared it. Switching PDFs cleared the real three-turn conversation. Synthetic interception was removed; no fixture was written to PostgreSQL.
- Header/footer Live Experience links retained the sticky header at top zero and aligned the restored demo section correctly. The hero uses Newsreader/Georgia serif again, with overlay and four workflow steps present.
- Backend restored with current code. No original PDF, classroom, course or user was deleted. No region move, deployment, billing change, reindex or schema migration was needed in this pass. Existing personal/uncommitted work was preserved.

Limits: conversation is page-local, bounded and not durable chat history; retrieval has no reranker or approximate vector index; suggested questions and answer depth depend on available evidence and model behavior. Real example word counts are observations, not guarantees. Full classroom integration was not repeated for these scoped landing/vault changes.

## Detail fixes and pre-production audit - 10 November 2026

- Reordered the shared header/mobile/footer navigation to match page order (Live Experience before Why AskAnon).
- Moved course Attach material into an independently rendered body-level dialog. Neighboring grid cards no longer stretch; reopening starts a fresh file/title selection, Enter submits the form, pending uploads guard cancellation, and a 25 MB client check matches the server limit. Upload errors retain the current draft.
- Fixed the actual direct-vault diagram defect: the shared lightbox now imports its own stylesheet instead of relying on SessionRoom.css. It portals to body, fits the loaded image to the available viewport, scales real layout dimensions for scrollable zoom, and displays a retry state for image-load errors. Course/recap opening no longer depends on visiting a live room first.
- Confirmed standalone behavior: initial course_id is null; first resource upload or diagram Save to Vault creates/reuses the host's General Lectures & Sessions and links the lecture. Added explanatory create-dialog text. Resolver now recognizes legacy GEN100 as well as GEN-* and chooses the oldest owned matching general vault; existing duplicates were not merged or deleted.
- Added a repository/profile footer credit using the actual Git remote, github.com/vanshambansal/AskAnon. Role-switch controls now disappear when server policy forbids switching, leaving a workspace label. Development switching remains available under existing explicit dev configuration.
- Added ASKANON_PRODUCTION_REVIEW.md: exact no-course workflow, evidence matrix, production blockers and staged release suggestions. Key pending items include controlled teacher approval, restrictive origins, expensive-operation quotas, private-file delivery decision and a real two-account staging rehearsal.

Verification: 49 backend + 3 frontend tests, 41 backend syntax checks, frontend lint/build passed. Isolated real database/Socket.io regression passed 13 scenarios with 4 disposable users and cleaned its records; no personal lecture/course/PDF was deleted. Backend watch mode restored after the regression. New resolver tests cover reuse, creation, linkage and ownership. An initial sandbox-only test run could not reach its local HTTP listener; rerunning with loopback access passed. A subsequent test-only Redis handle was isolated before the final passing run.

Browser checks used the public page and actual components with clearly synthetic, browser-only course/image fixtures because the fresh Playwright profile was not signed in. Three course cards remained 181 px high before/after attachment dialog opening; dialog fit 320/390/768/1440 px and Cancel closed it. A direct image viewer without importing SessionRoom styles stayed fixed and fitted the viewport at those widths; zoom/reset/Escape passed. Public navigation order and GitHub credit were observed on localhost. These are targeted checks, not a claim of manually exercising every signed-in button. Login was requested; authenticated manual audit remains pending.

The existing frontend serves localhost:5173. Temporary duplicate frontend processes created during sandbox diagnosis were stopped; the user's original frontend was retained. The original backend/watch pair was verified before pausing it for regression and restored afterward. Current application/services readiness is recorded by the final health check.

## Signed-in browser audit continuation - 10 November 2026

Following the user's sign-in, exercised the real Student dashboard tabs and vault image viewer, then switched locally to Teacher for disposable records. Verified course/standalone lecture creation, pause/resume, first-upload general-vault creation/linkage, broadcast, unpin/repin, written answer, bookmark, poll launch/end/remove, gallery upload/Save to Vault/remove, PDF export, end/recap tabs, image labels, course attachment dialog/PDF upload, indexing retry, cited AI request, authorized PDF download, session search, course reassignment and queued deletion.

The first PDF indexing attempt was interrupted by an observed backend watch restart; Retry reached Ready and the subsequent AI request returned 200 with a source/evidence. The current PDF was deliberately a small audit transcript, so its factual answer remained short. No model accuracy/latency guarantee is inferred from that single response. No product code changes were necessary in this continuation; the previously passing 52 automated tests and 13 real integration scenarios remain the relevant automated results.

Created only audit-tagged data: course 29, automatically created general course 30, lecture 107 (OVUITU), materials 32/33/34 and their dependent note/poll/media/bookmark rows. Removed those materials/courses through owner-checked APIs and the lecture through the UI/durable worker. Verified its bundle returned 404 and neither test course remained. Restored the original Student role. Existing personal records and older QA data were not removed. The production review now includes these signed-in results; independent two-account production-mode UI rehearsal remains distinct from single-account local role switching.

## Footer and release-planning decision - 10 November 2026

Changed footer credit to exactly Crafted by Vansham Bansal, linking only the name to the verified GitHub profile; removed the extra repository/copyright credit text. Removed the visible dashboard role switch and its client handler in both workspaces. Production backend role guards remain; production environment policy and teacher approval still require explicit configuration/design.

Reviewed current provider/Redis/transaction/worker/error paths and appended a current-versus-pending failure matrix and four-pass release sequence to ASKANON_PRODUCTION_REVIEW.md. No backup, paid service, deployment or provider dashboard setting was silently enabled. Backup/restore coverage remains unverified. Public/signed-in browser checks confirmed the exact one-link/no-icon credit and absence of switch controls; frontend lint/build passed. Existing user role/data and earlier uncommitted work were preserved.
