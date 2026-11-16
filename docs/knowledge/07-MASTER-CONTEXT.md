# AskAnon master context

Copy the material between the horizontal rules into a new developer/AI conversation. It is self-contained but intentionally shorter than the handbook. Recheck current code before treating configurable details as permanent.

---

## Project and product rules

AskAnon, “Same Classroom. More Questions.”, is a real-time classroom Q&A and course-material study companion. It is a resume/demo project, not a university administration platform. No institutional administrator or teacher-verification chain exists.

Authentication comes first. A new signed-in identity chooses Student or Teacher once; existing profiles retain their role. Teachers manage only sessions/courses they own. Students join live lectures by six-character code and gain enrollment in the linked course vault. A standalone lecture initially has no course; saving resources can create/reuse the teacher's general vault. Enrollment/history is course-oriented, not a durable independent attendance model.

Features include questions and upvotes, pin/answer/dismiss states, written answers, intake pause, instructor notes/code, diagrams and image lightbox, polls, material uploads/downloads, bookmarks, course vaults, ended-session recaps and a PDF-grounded study companion.

## Stack and layout

- Frontend: React 19, Vite, React Router, Clerk, Socket.io client and custom CSS. `frontend/src/main.jsx` sets providers; `App.jsx` defines routes. Pages include Dashboard, Onboarding, JoinSession, SessionRoom, SessionRecap and CourseDetail. Dashboard/session/course components live in their corresponding component subfolders.
- Backend: Node ES modules, Express 5, Socket.io, Prisma 6.19.3. `backend/src/app.js` starts HTTP/sockets and in-process workers. Routes wire middleware/controllers; `utils/` contains substantial service logic. Active DB client is `config/prisma.js`; legacy `config/db.js` is not the main path.
- PostgreSQL/Supabase with pgvector, Redis with bounded memory fallback, Cloudinary for originals and Gemini generation/embedding APIs.
- `backend/prisma/schema.prisma` is the schema reference. `backend/test/` has isolated tests; opt-in scripts cover real database/socket fixtures. `scripts/check.mjs` runs syntax/tests/lint/build. Builds are not live acceptance tests.

## Data model and security

Core models: User, Course, Session, Question, Vote, CourseEnrollment, CourseMaterial, MaterialChunk, SessionMedia, Bookmark, Poll, PollOption and PollVote. Durable cleanup uses SessionDeletionJob and StorageCleanup.

User has unique Clerk ID/email and saved role. Sessions have unique codes and nullable course linkage. Vote/enrollment/bookmark pairs are unique. Poll votes have a unique poll/voter-key pair. Question has status plus legacy answered flags and **no author foreign key**. Do not claim question-author recovery or total system anonymity. Other records retain identity associations.

Clerk bearer tokens establish identity; access middleware enforces owner/enrollment/code access. Socket handshake and commands are authenticated. Browser-supplied IDs are not authority. CORS is an origin restriction, not authentication. Course authorization precedes AI retrieval. Public Cloudinary URLs are not private-file guarantees. Never disclose `.env` contents, credentials or personal test data.

## Main communication flows

Most resource writes use HTTP. After commit the backend invalidates caches and broadcasts to lecture/private workspace rooms. SessionRoom reconciles responses/events and refetches state on reconnect. Pause/poll commands use sockets with acknowledgements. Socket.io does not act as an event database.

Question POST validates, runs local/contextual checks and rechecks lecture state inside a transaction before insertion. Unavailable written moderation blocks publication and keeps the draft. Instructor broadcasts and image-only content have distinct paths; images are not automatically abuse-moderated. Duplicate checks are optional and may fail open, but do not bypass final moderation.

Sessions automatically end six hours after creation using the normal ended state and poll closure. Startup/minute sweeps and relevant reads catch up overdue sessions; live writes check the deadline. Existing content remains. No schema migration or new expired-state UI is needed. The implementation is utils/sessionExpiry.js.

## AI and RAG implementation

`utils/ragService.js` owns the PDF pipeline. Upload metadata is persisted separately from background indexing. Native page text comes from pdf-parse; pages with very little text can be rendered and transcribed through `pdfTextService.js`. Bounded chunks of about 1,200 characters retain page/sequence metadata. There is no explicit chunk overlap.

`gemini-embedding-001` produces 768-dimensional vectors, stored with chunk text in PostgreSQL `MaterialChunk.embedding` (`vector(768)`). Ordinary CRUD uses Prisma. Unsupported vector operations use narrowly scoped parameterized raw SQL through Prisma. Do not replace relational workflows with raw SQL or claim no raw queries exist.

Index jobs share same-material work, allow two concurrent jobs and reject oversized jobs. Old chunks are replaced transactionally only after all new embeddings succeed. Interrupted indexing becomes retryable failed state; it is not a distributed durable indexing queue.

Authorized material/course questions are embedded with bounded short history. Active retrieval takes 8/12 seed chunks, keeps similarity at least 0.45, then adds neighbors up to 14/18 chunks. Cosine search is course/material-scoped. No checked-in HNSW/IVFFlat index, hybrid PDF search or semantic reranker is present; a live DB could have separate changes and needs inspection.

Gemini receives evidence and instructions to answer only from it, admit insufficient support and treat documents/history as untrusted. Response schema includes answer/followUps/practice. Backend assembles sources/evidence and coverage. Inline citations are generated, not claim-by-claim independently verified. No evidence skips generation. Overview/revision uses selected first/middle/last chunks from bounded documents rather than exhaustive reading. Up to three history turns are request-carried context, not persistent chat memory.

Moderation classifies written submissions with lecture context; duplicate suggestions use normalized exact matches and cached question-vector cosine comparisons (up to 25 candidates; threshold environment override, code default 0.82). This is separate from document RAG. Recaps synthesize selected discussion/polls without PDF vector retrieval. No fine-tuning or self-trained model is implemented.

## Constraints and continuation rules

The free demo topology is Vercel frontend, one persistent Render backend and existing external services. Redis is optional acceleration; database and provider latency remain. In-memory grants, room state and cache revisions require redesign before multiple replicas. Important data needs backups; current test data was declared disposable and backup was deferred.

Preserve uncommitted work, the existing CSS system, WebSocket contracts, ownership checks, transactional dependency pruning and shared-asset cleanup. Never reset production data or expose secrets. Do not fabricate test passes, latency improvements, adoption or deployment health. Explain implemented behaviour separately from recommendations. Inspect current source before editing or claiming a feature exists.

Full learning reference: `docs/knowledge/README.md`. Operational instructions: `docs/LOCAL_SETUP.md` and `docs/DEPLOYMENT.md`. Historical logs explain earlier decisions but can be outdated. Source audit date for this context: 16 November 2026.

---
