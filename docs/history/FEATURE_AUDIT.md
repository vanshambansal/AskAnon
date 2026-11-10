# AskAnon feature acceptance audit

Checked locally on 5 November 2026. “Verified” means the listed scenario has evidence; it does not establish every possible input or production readiness. Detailed chronological evidence is in ASKANON_V2_COMPLETION_PLAN.md.

| Feature | Result / evidence |
|---|---|
| Sign-in and account roles | Two real independent Clerk accounts passed authenticated API and browser flows after backend SDK migration. Local role switch preserved; production self-promotion disabled. |
| Dashboard, courses and lecture ownership | Existing teacher/student workflow preserved, dashboard split into components, ownership and cross-account denial covered by tests. Create/assign/search/filter/batch controls reviewed in prior phases. |
| Join code and enrollment | Actual independent student joined the teacher's code and gained course access. Invalid/unauthenticated/unauthorized access covered by tests. |
| Live questions and duplicates | Actual student submission reached owner. Exact-repeat logic plus real semantic paraphrase detection; latest shared embedding score 0.9408. Cold historical semantic candidates may be skipped. |
| Relevance/abuse moderation | Real relevant, unrelated and abusive text checks passed; actual unrelated submission quarantined before public emission. Restore/Dismiss checked. Image contents unsupported; provider outage is explicitly labelled. |
| Votes, saved doubts and answers | Independent-account upvote/bookmark/written answer and reload persistence passed; duplicate vote 409 and unauthorized delete 403. |
| Pinning, pause, state transitions | Automated state/access regression coverage plus browser review in earlier checkpoints. |
| Polls | Real teacher launch/student vote/teacher update and vote recovery on reload passed. |
| Code and gallery | Code/copy and image-only composition reviewed; real image upload, gallery, lightbox zoom reset and Save to Vault passed. One image-sharing control remains. |
| Course vault | Real PDF and image uploads, inline upload, categories, authenticated downloads, indexing and retry verified. Duplicate socket/upload insertion race fixed. |
| Course AI / RAG | Real multi-PDF summary in preceding checkpoint; latest single-panel Practice action returned cited answers for pages 1–3. Explain, overview, revision and practice share bounded retrieval. Errors remain errors, without fabricated answers. |
| End / recap / cascades | Actual End control moved both accounts to recap. One End action remains. Images use image presentation, PDFs use PDF badge. Previous real deletion rehearsal propagated to student; transactional cascade regression suite passed. |
| Lecture AI recap | Actual structured generation and owner/student-specific display passed in prior checkpoint; provider failures remain retryable errors. |
| Export | Browser download and four-page pagination stress passed earlier; latest two-page Unicode/long-metadata export extracted and visually inspected. Broader writing systems unverified. |
| Visual/accessibility | SVG icon cleanup, focus/Escape/dialog checks and 390/768/1440 layouts reviewed. Latest course assistant/resource overflow fixed. Full assistive-technology certification not claimed. |
| Performance | Route/export splitting, request consolidation, cache single-flight and reuse implemented. Warm sampled reads/results ~0.43 s; remote DB cold starts/writes still slower. |
| Data/setup/dependencies | Additive Prisma schema changes, isolated 14-table bootstrap + CRUD passed, 27 isolated tests and 11 live integration scenarios; lint/build pass; both dependency audits zero. Migration history not silently repaired. |

Remaining decisions/limits: local database copy for quicker demos versus the existing remote database; approval to remove this pass's specific test fixtures; production hosting/faculty provisioning; no OCR or image-content moderation; AI quota and accuracy limits. Existing personal data and uncommitted work were preserved.

## 6 November follow-up

The saved star and faculty vote contrast defects were reproduced and fixed. Text moderation no longer publishes silently on provider failure: the question is held privately for instructor review. Exact conversational greetings are off-topic; contextual moderation remains probabilistic. Needs review now explains Restore/Dismiss. Pin/answer/review actions have optimistic UI and rollback; saved-star requests are guarded. Empty cascade branches and redundant question ownership reads were removed, preserving transactional checks.

A real pool-exhaustion error was found under simultaneous backend/test load. Prisma is now capped at four connections by default; the follow-up integration run passed 12 scenarios and cleaned its fixtures. Local checks passed 29 tests, lint and build. A measured pin confirmation still took ~4.91 s under integration load; the UI updates earlier. Not every action or cross-device update is instant. Remote database latency remains unresolved pending a local-copy decision.

The vault answer has bounded accessible scrolling; a real source-linked answer and reachable bottom were checked at 390/768/1440 px. Test lecture 69/B0NH90 is ended and retained pending explicit QA cleanup authorization. See the completion log for the exact scope and measurements.

## Interaction-path optimization follow-up

Keeping Supabase: unique-constraint-based room/course creation, reduced create-time cache work, grouped deletion invalidation, transaction-scoped deletion ownership checks, database-side Prisma relation joins and fewer dashboard socket refresh requests are implemented. Warm question/session reads measured ~809 ms (2 statements) before and ~404 ms (1 statement) after. Sample status request improved ~3659 to ~2769 ms. **Populated deletion still measured about 12–13 seconds**; a local UI response is not evidence that remote persistence is instant. Current final checks: 31 tests, lint/build and 12 live integration scenarios passed. See the completion log for conditions and remaining architecture choices.

## Responsive operations follow-up — 7 November 2026

- Added consistent skeleton/button/network feedback, long-wait messaging, bounded waits and duplicate-action guards. Failed submissions retain drafts. Poll launch now waits for acknowledgement before clearing its draft.
- Added short-lived identity-scoped frontend snapshots and request coalescing. Student notebook/history are lazy; actual browser request counts confirmed neither is fetched initially. Lists progressively render 20 items at a time; server-side pagination of every collection is not implemented.
- Lecture deletion is now durable and asynchronous: HTTP 202 queues work, immediate access checks hide/lock the lecture, the worker prunes transactionally, and the dashboard displays pending/failure/retry states. Physical completion emits the existing lifecycle events. Added a nullable marker/job table without resetting personal data.
- The first new live suite passed 13 scenarios and cleaned its fixtures; 15-table bootstrap/CRUD and multi-asset bookkeeping passed in an isolated schema. Browser loading/failure checks used clearly synthetic interception rather than modifying personal records. Full final totals are in the completion log.
- Remote latency still exists: one queued acknowledgement measured ~3.5 seconds; physical cleanup follows. This is an improved interaction contract, not instant deletion.

Final 7 November verification: 37 backend tests + 3 frontend cache tests, lint/build passed; 13 real database/socket scenarios passed and fixtures cleaned; isolated 15-table bootstrap and multi-asset bookkeeping passed. No deletion jobs or session deletion markers remained. Both real accounts returned to their dashboards with original roles and no fresh page errors. Queued DELETE acknowledgement sample ~3.45 s; physical cleanup follows asynchronously. See the completion log for details and limitations.

## 7 November - latest UI and OCR acceptance

Supersedes earlier unsupported-OCR and instructor Review-queue descriptions. Action-specific spinners, quiet background refresh/cleanup, aligned session list and responsive layouts are now implemented. The Review tab is removed; rejected text is returned to the student without publication, and unavailable checks are retryable. Scanned PDFs can be transcribed before the existing pgvector RAG pipeline (12 scanned pages maximum and bounded deadlines). The existing revision PDF was successfully indexed and queried; it is a certificate, so it cannot provide absent lecture notes.

Validation: 41 backend tests + 3 frontend tests, syntax/lint/build and 13 isolated real-database/Socket.io scenarios passed. Desktop/mobile layouts and real signed-in PDF answering were exercised. Public content rendered with the external auth service blocked. Personal rows and existing uncommitted work were preserved. See the latest completion-plan checkpoint for the exact viewport matrix, test boundaries and latency samples.

## 7 November - landing and vault follow-up acceptance

The landing has shorter copy, sans-serif headings, the exact Same Classroom. More Questions. tagline and a shared header/mobile/footer navigation list. Corrected sticky-header containment; desktop section-center tests passed for all links and mobile tall sections align below the header.

Vault UI is now Ask your PDFs, without Study task. Single-PDF/course questions, source page links, evidence expansion and retry after an injected error were verified. Actual failure was Gemini 503 overload; a bounded current-model fallback succeeded. Two legacy indexes were rebuilt (3 resume chunks, 12 IoT presentation chunks). PostgreSQL pgvector storage and its current B-tree indexes were inspected read-only; no browser IndexedDB or approximate vector index is claimed.

Latest validation: 43 backend + 3 frontend tests, lint/build and targeted real browser/AI checks. Full implementation/explanation: ASKANON_AI_ARCHITECTURE.md. This supersedes prior interface descriptions that mention the task selector.

## Latest companion acceptance - 7 November

The earlier editorial landing appearance is restored; shared navigation and sticky-header corrections remain. Vault AI now supports page-local conversation with the last three exchanges, adaptive depth, specific follow-up suggestions and practice with hidden worked answers. Retrieval adds bounded neighboring passages; no new database or agent system was added.

Acceptance: 47 backend + 3 frontend tests, lint/build; real 383-word detailed response, 191-word simpler follow-up and three practice questions with initially hidden answers. Responsive layouts, source links, PDF-scope reset, failed-follow-up draft/history retention and table overflow were checked. See the completion log and AI architecture document for limits.

## 10 November follow-up

Reported navigation order, stretching upload cards and unstyled direct-vault diagrams have targeted fixes and browser component checks. Standalone/general-vault behavior is clarified and legacy general vaults are reused. Footer credit comes from the Git remote; unavailable role switching is hidden. 52 automated tests and 13 isolated live database/socket scenarios passed. See ASKANON_PRODUCTION_REVIEW.md for the exact audit matrix, production blockers and signed-in manual checks still pending login.

### Signed-in audit follow-up, 10 November

Real Student/Teacher-local workflows now exercised after login, including standalone-to-general upload, repaired image viewing and course attachment dialog, classroom controls, polls, PDF export/recap, indexing recovery, cited AI/download, assignment and queued deletion. Audit-only records were cleaned and the original Student role restored. See ASKANON_PRODUCTION_REVIEW.md for the exact scope and remaining two-account production rehearsal.
