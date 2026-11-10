# AskAnon V2: project review

Reviewed on 5 November 2026. This is an audit of the current working tree, including its uncommitted V2 work. No application source was changed during this review.

## What you are building

AskAnon is a classroom participation and revision platform. A professor creates an instant lecture room, students join using its code, and questions appear anonymously in a shared feed. Votes help the professor prioritize confusion. Answers, polls and shared resources remain useful after class through recaps and course vaults.

The core product loop is: **create lecture → join → ask and prioritize → teach and respond → end lecture → revise**. The course vault connects successive lectures; the AI features help with duplicate questions, understanding confusion and searching uploaded PDFs. A university administration system or full learning-management system is outside the present scope.

## How the application works

| Layer | Responsibility | Main locations |
|---|---|---|
| React/Vite | Pages, forms, role-specific views and local UI state | `frontend/src/pages/` |
| Clerk | Account sign-in and token issuance | `main.jsx`, `useAuth`, `useUser` |
| Express | Reads and writes classroom data | `backend/src/routes/`, `controllers/` |
| Prisma/PostgreSQL | Persistent users, courses, sessions, questions, votes, enrollments, bookmarks, polls and document chunks | `backend/prisma/schema.prisma` |
| Socket.io | Updates open browser screens without a reload | `socketHandler.js`, `SessionRoom.jsx`, `Dashboard.jsx` |
| Cloudinary | Stores image/PDF files; database rows keep their URLs and storage IDs | `config/cloudinary.js`, upload/material controllers |
| Redis | Caches database responses, embeddings and moderation results; helps enforce posting cooldowns | `cacheHelper.js`, `authMiddleware.js` |
| Gemini | Moderation, question embeddings, recap synthesis and PDF-based answers | `backend/src/utils/` |

Signing in with Clerk and having a database profile are separate steps. The dashboard calls `/api/users/sync` to create/update its local profile, then fetches teacher or student data. Student and teacher are currently selectable workspaces, not university-verified identities.

For a question, the browser can check for a similar question first. Gemini turns text into a list of numbers (an embedding); the server compares those lists using cosine similarity. The student chooses whether to upvote the existing question or post anyway. The question API applies a posting cooldown and local text filtering, stores the question, then runs AI moderation in the background. Most live updates are subsequently relayed through client-emitted socket messages.

For course AI, PDFs are downloaded, their text is extracted and divided into chunks, and 768-dimensional embeddings are stored in PostgreSQL using pgvector. A question retrieves nearby chunks and sends those excerpts to Gemini to generate a grounded answer. This is RAG. Live duplicate detection is a separate embedding flow using a local/Redis cache, not a persistent question-vector search database.

The recap generator receives the lecture title/subject, up to 30 question texts, vote counts, answer statuses and poll results. It does **not** receive a lecture recording or transcript, and currently omits written answer text, code snippets and slide contents from that synthesis. Describe it as a synthesis of classroom questions and feedback rather than a full summary of everything taught.

## What exists

- Public landing page, interactive local demonstration, onboarding and Clerk sign-in.
- Faculty Home, Sessions, Doubts and Courses tabs; search/filter/sort; selection and batch actions; create/assign/delete handlers.
- Student course, lecture and saved-question views; room-code entry and automatic course enrollment on live-room entry.
- Live Q&A with image/code attachments, votes, pinning, answering, written explanations and deletion.
- Teacher notes/code broadcasts, pause/resume controls and live polls.
- Course and session materials, Cloudinary uploads, downloads, image lightbox and Save to Vault.
- Recap page, poll history, saved questions, AI insight card and PDF export.
- Duplicate-question prompt, contextual moderation and course/material RAG APIs.
- Dashboard presentation extracted into five components; parent retains state and effects.

These are implemented capabilities, not a claim that every path passed an end-to-end test.

## Checks performed and limits

- Read both development records and traced frontend pages/components, API routes/controllers, socket handlers, schema, caching, storage and AI utilities.
- Frontend production build passed. Its largest generated JavaScript chunk is approximately 972 kB (299 kB gzip), with a bundle-size warning.
- All 27 backend JavaScript source files passed syntax checks.
- Frontend lint failed with **36 errors and 4 warnings**. Most are unused variables/empty catches, but it also detects a real undefined upload handler.
- Opened the landing page in Playwright and verified the sign-in modal and mobile menu. The landing page had no horizontal overflow at a 390 px viewport.
- After the user signed in, inspected the faculty dashboard, Sessions search, Doubts filter and operating-systems course vault. Search reduced six sessions to one matching session. Reproduced the upload-dialog crash and broken Doubts session filter.
- Opened an existing recap with stored insights: its three questions, overview metrics and persisted poll result loaded. The poll history showed one saved response with the expected option distribution. No AI refresh was triggered.
- Database access initially failed because the sandbox denied TCP access (`EACCES`). A permitted check outside the sandbox connected successfully; restarting the backend with that access restored the dashboard and database-backed reads. This was **not evidence of a Supabase outage**.
- The configured Redis hostname fails DNS resolution. The backend runs without Redis in this session.
- A two-client socket check in an isolated, nonpersistent audit room confirmed that an unauthenticated connection can broadcast a fabricated question payload. No database record was created.
- Read indexing counts: the three PDFs in the inspected course have 6, 1 and 1 stored chunks respectively. This confirms some indexing exists, not the quality or completeness of extracted text.
- New Gemini generation was initially blocked by automatic approval review. After the user explicitly authorized sending excerpts from existing PDFs to Gemini, the Course Vault summary completed with HTTP 200 and a generated answer referencing all three uploaded documents. The first two `gemini-flash-latest` attempts timed out before the generation helper's fallback path succeeded. The uploaded test data contains an IoT project document and duplicate resumes, so the response summarized those rather than inventing an Operating Systems lecture. This verifies the course-summary generation path, not live duplicate detection, moderation, recap generation or topical vector retrieval.
- Existing lecture records were not deleted, ended or edited as part of testing. Full multi-device mutation tests, actual uploads/deletions and restart recovery still need disposable test data.

## Findings requiring attention

### 1. Critical: backend authentication and ownership are incomplete

`sessionRoutes.js` mounts all session operations without authentication middleware, including create, end, assign, single delete, batch delete and AI refresh. Some question moderation routes and all upload routes are also unprotected. `userRoutes.js` accepts profile IDs, email and role directly on an unauthenticated sync endpoint.

Even routes using `requireAuth` often trust `user_id` or `teacher_id` from the body/query instead of the verified identity. Course/material/bookmark operations do not consistently check ownership or enrollment. Some ownership checks only run if a caller supplies `user_id`, making omission bypass the check.

The visible role toggle was deliberately retained for local development in the archived discussion. The problem is broader than that toggle: hiding teacher buttons does not authorize API actions. Fix verified identity and ownership consistently before public use; an administration portal is not required to do this.

`requireAuth` additionally contains a nonproduction `dev-test-token` bypass that chooses the first database user. This should be explicit, isolated test configuration rather than an accidental deployment default.

### 2. Critical: socket messages trust the client

`socketHandler.js` has no connection authentication or room/host authorization. It forwards client-supplied question, answer, pin, deletion, media and material payloads. Poll creation and pause/end controls also trust callers.

The isolated socket test reproduced unauthenticated question broadcasting. The durable database may remain unchanged while connected browsers show false data. Authoritative events should follow validated server operations, and privileged socket actions should verify the session owner.

### 3. High: lecture termination affects unrelated rooms and has conflicting semantics

`sessionController.js` emits `session-ended` both to the specific room and globally. `SessionRoom.jsx` reacts to every `session-ended` event by navigating its own room to recap without checking the event's session ID/code. Consequently ending room A can move room B's browsers to recap (and an active-room recap redirects back to the room).

The live-room end handler also emits a legacy client `session-ended`; the socket server translates that into `session-closed`, which the frontend now interprets as deletion and redirects to dashboard. The same action therefore has competing recap/dashboard redirects. This path is code-confirmed; it was not triggered against existing lectures.

### 4. High: course detail Upload Material crashes

Browser reproduced: open the course vault, click **Upload Material**, and the error boundary replaces the page. `CourseDetail.jsx:671` references `handleUploadMaterial`, which is undefined; the defined function is `handleUpload`.

There is a second failure behind that: the defined handler posts to `/api/courses/:id/materials`, which is not registered. The actual API is `/api/materials/upload`, requiring course context. Its cold-profile sync fallback also calls nonexistent `/api/auth/sync` with an incompatible payload/response shape and writes a different storage key.

### 5. High: the Doubts session filter is broken

`Dashboard.jsx` constructs aggregated questions with `sessionId: s.id`, but the filter checks `q.session_id`. The teacher-session query does not select that field. Browser reproduced: selecting the lecture containing database questions yields zero displayed doubts.

The same teacher query omits `code_snippet`/`code_language`, although the UI tries to identify code-only questions. Those questions can be mislabeled as image attachments.

### 6. High: cache invalidation is incomplete

Course detail caches last 600 seconds, teacher-session lists 300 seconds and student histories 300 seconds. Session create/end/delete/assignment and material upload/delete do not consistently invalidate all affected course details, course counts, teacher lists and student histories. Question changes do not invalidate cached teacher-session question lists.

Examples: session deletion clears the session/teacher/history keys but not course detail; material upload clears the material-list key but not the course detail containing those materials; ending a lecture does not clear student history. These defects become more apparent when Redis is working. Turning Redis back on needs cache-correctness verification as well as a connection fix.

`getOrSetCache` has no general in-memory cache fallback: with Redis unavailable it queries the database. Separate local caches do exist for auth users, embeddings and rate limits. Redis startup is awaited at module scope, so retries delay server readiness despite documentation describing nonblocking startup.

### 7. High: cross-screen state synchronization is partial

- The deleting dashboard decrements course counts in its HTTP handler and its socket listener, potentially twice.
- The batch-delete socket listener removes sessions but does not update course counts or saved bookmarks. Single deletion also leaves already-loaded bookmarks stale.
- `CourseDetail.jsx` and `SessionRecap.jsx` do not subscribe to deletion updates.
- A dashboard receiving `session-ended` removes the live room but does not append it to the student's history.
- Dashboards do not subscribe to question additions/updates, so a teacher's Doubts tab does not continuously reflect activity elsewhere.

The archive's statement that deletion is synchronized everywhere is stronger than the current implementation supports.

### 8. High: reconnection and pause are incomplete

The room joins once during initialization. Its reconnect callback is attached to the socket rather than the Socket.io manager, and it does not rejoin the room. Socket room membership must be restored after a fresh connection. The intended resync only replaces questions, omitting session lifecycle, materials, bookmarks and polls.

Pause is browser/socket state only. A newly joining/reloaded browser starts unpaused, and the API does not enforce pause. A client can post directly while the professor believes intake is frozen.

### 9. High: moderation flags do not remove unsafe questions

Local filtering blocks text before insertion, but AI moderation happens after the question is saved and visible. Unsafe results set status `FLAGGED`; the frontend's unanswered lists and recap reads do not exclude `FLAGGED` or consistently exclude `DISMISSED`. The card has no meaningful flagged-state treatment. A flag can therefore leave the question visible as an ordinary doubt.

AI failures/timeouts allow the question through. The moderation cache key contains text but not lecture context, even though relevance decisions depend on that context. Code/image-only content is not checked by the text guardrail. The local dictionary can also reject legitimate academic wording; evaluate false positives rather than treating it as comprehensive moderation.

### 10. High: AI failure is disguised as successful synthesis

The recap utility returns generic academic advice when the key is missing, generation fails, JSON parsing fails or there are no questions. The controllers persist that result in `ai_summary` and later treat it as a completed generation. An outage can therefore leave generic fallback content cached indefinitely until refresh, with no visible distinction from actual model analysis.

There is no generation lock: background synthesis and several simultaneous recap requests can generate the same lecture more than once. JSON MIME output is requested, but a formal response schema and full field validation are absent. A timeout is present; a stateful circuit breaker is not implemented despite comments using that term.

The configured `gemini-3.6-flash` model code is documented by Google; the model name alone is not evidence of a bug. An authorized course-summary generation test succeeded after two timeouts on the first model alias. The browser measured 45.4 seconds for this request. The helper's repeated 16-second attempts can leave users waiting tens of seconds before receiving an answer. This does not validate every AI feature or establish a typical response time. Reference: https://ai.google.dev/gemini-api/docs/models/gemini-3.6-flash?hl=en

### 11. High: instructor broadcasts do not persist their intended state

The browser sends `status: PINNED`, `pinned_at` and, for notes, `is_answered`. `createQuestion` ignores those fields and stores the default pending question. Emitting `pin-question` then relays that pending object, without persisting a pin. Reloads cannot reliably reproduce the advertised spotlight behavior. Broadcasts also share the student posting cooldown and moderation pipeline.

### 12. High: database deletion and file lifecycle can diverge

The session handlers now prune dependent records in an appropriate order and preserve course materials by detaching them. That is a real improvement. But the sequence is not atomic: a later failure can leave a partially deleted lecture.

Single/batch session deletion removes media rows without destroying their Cloudinary files. Question images do not persist a dedicated `public_id`, limiting reliable cleanup. Save to Vault shares the same Cloudinary asset ID with session media; deleting either reference can destroy a file still used by the other. Material upload occurs before controller validation, so failed validation/database insertion can leave orphan files. Course deletion similarly performs several independent operations and does not fully synchronize caches/devices.

The fallback general course code `GEN100` is globally unique in the schema but created per teacher in the controller. A second teacher requiring that fallback can hit a uniqueness failure.

### 13. High: public download proxy accepts arbitrary URLs

`proxyDownload` fetches caller-supplied URLs without authentication, a storage-host allowlist, timeout or response-size limit. This creates a server-side request-forgery and resource-consumption risk. It buffers the complete download instead of streaming it. Restrict downloads to authorized stored assets.

Recap download links bypass the shared proxy utility and use cross-origin anchors with `download`, so their behavior differs from vault/lightbox downloads. Actual Cloudinary delivery permissions were not independently verified in this review.

### 14. Medium: polls are persisted but not fully recoverable

Poll history has database models and reads. The active runtime poll/voter state remains in a process-local map, however, and is not reconstructed on restart. Vote counts and vote records are written separately after broadcasting; failures are swallowed. Caller-provided voter IDs are trusted. Ending/deleting a session does not consistently close the persisted poll and clear active in-memory state across every path.

This is adequate scaffolding for a single-process demo, not durable authoritative poll processing yet.

### 15. Medium: RAG status and summaries overstate coverage

The UI labels `materials.length` as the number of indexed materials, regardless of actual indexing success or file type. There is no durable pending/indexing/ready/failed status or retry queue. Scanned image-only PDFs have no OCR path. Re-indexing deletes old chunks first, then creates replacements sequentially; failure can leave a partial index. The authorized summary test also showed Markdown syntax displayed literally in the answer: the frontend inserts the answer as text rather than rendering headings/lists/emphasis.

Paragraphs longer than the nominal chunk size are not split, while embedding input is truncated to 2,000 characters. Some stored chunks can therefore exceed the text represented by their embeddings. Course summary requests select only the first chunk of up to four documents, which cannot substantiate a comprehensive summary of all course materials. Retrieval has no minimum relevance threshold.

The vector utility already uses parameterized Prisma raw SQL methods for pgvector, whose field is declared `Unsupported` in the schema. This is an existing exception to the stated Prisma-only rule, not a change introduced during this review. Do not mistake the `Unsafe` method name alone for demonstrated SQL injection; the inspected values are bound as parameters. Ordinary CRUD remains Prisma-based.

### 16. Medium: privacy, UX and documentation claims need correction

- Landing FAQ claims no account is necessary, while room routes require Clerk sign-in.
- Marketing promises instant automatic grouping, but duplicate detection is an optional submit-time suggestion, not automatic merging.
- The `4.8×` participation statistic has no supporting study/measurement in the repository.
- Account and vote records exist; question authors are omitted from the question model, but “100% anonymous to everyone” and “completely encrypted” overstate the documented guarantees. Server logs also print question text.
- A failed database call is reported as “Could not reach backend” even while the backend is reachable. Recap subrequest failures are converted to empty arrays, hiding partial outages as “no questions/materials.”
- Several clickable divs, poll options and FAQ rows lack full keyboard semantics; custom dialogs generally lack focus trapping, accessible dialog labeling and consistent Escape handling.
- The room code is described as six characters, but standalone Join accepts five to eight characters and its example is five characters.
- Projector UI and CSV actions described in older changelog entries are absent/unwired in the current dashboard; the CSV handler is unused.
- `useSession.js` and `SocketContext.jsx` are empty placeholders. The old `config/db.js` is unused. Some comments still promise precise unmeasured latency or strict behavior the code does not provide.
- Only one course/material migration is present; the complete current schema cannot be reconstructed from that migration history alone. Later `db push` work needs a reproducible baseline/migration strategy.
- Neither package exposes an automated test suite; scratch AI scripts are manual experiments. There is no checked-in CI workflow found in this tree.

## Recommended repair order

1. **Establish a trustworthy baseline:** keep the working tree, document setup without secrets, repair Redis configuration, record external service status and create disposable test users/courses.
2. **Protect identity and room boundaries:** verified auth on APIs/sockets, ownership/enrollment checks, constrain the download proxy, separate test bypasses.
3. **Fix the shortest user-blocking paths:** course upload crash/URL/profile sync, Doubts session filter, termination event scope and conflicting redirects.
4. **Make state consistent:** one server-owned event per successful mutation, complete cache invalidation, idempotent count updates, course/recap listeners and reconnect/rejoin handling.
5. **Make lifecycle operations reliable:** transactions where appropriate, explicit file ownership/reference handling, poll close/recovery and server-enforced pause/rate limits.
6. **Make AI honest and observable:** distinct generation/indexing states, visible retryable failures, authorized live tests, representative duplicate examples and grounded RAG coverage checks.
7. **Finish UX and release preparation:** keyboard-accessible dialogs, truthful landing copy, consistent downloads, lazy route/PDF loading, migration baseline and a small meaningful integration/end-to-end suite.

Do not add more feature breadth before these steps. The present scope already has enough substance; reliable execution and your understanding of its data flow will add more value than another feature.
