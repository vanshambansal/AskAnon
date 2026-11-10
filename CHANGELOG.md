# AskAnon V2 — Development Changelog & Architecture Audit

This file is maintained as a persistent, authoritative log of all architectural improvements, refactorings, and feature additions in AskAnon V2.

---

## 📌 Phase 1: Foundation Clean-Up & Backend Standardization

### Step 1.1: Dead Code Removal & Route Realignment
- **Date**: Sept 05, 2026
- **Rationale**: The repository contained disconnected files built solely for evaluation/demo purposes. These created runtime errors, increased bundle size, and gave recruiters the impression of an unfinished hackathon project.
- **Files Deleted**:
  - `frontend/src/pages/TeacherDashboard.jsx` & `.css`: Broken duplicate of `Dashboard.jsx` with undeclared `dbUser` causing runtime crash on render.
  - `frontend/src/pages/AnalyticsPage.jsx`: Standalone page with hardcoded `const teacherId = 1;` unlinked from router.
  - `frontend/src/pages/TokenPage.jsx`: Utility for copying JWT tokens for Postman testing.
  - `frontend/src/pages/RoleSelect.jsx` & `.css`: Unused role selection page.
  - `backend/test-socket.html`: Static evaluation HTML file.
- **Files Modified**:
  - `frontend/src/App.jsx`: Cleaned routes, removed `TokenPage`, and wired `HomeRoute` to automatically direct authenticated users to `/dashboard`.
- **Verification**: `npm run build` completed with 0 errors.

---

### Step 1.2: Standardize Backend on Prisma Client
- **Date**: Sept 05, 2026
- **Rationale**: The backend was architecturally split — `analyticsController.js` used Prisma while `sessionController.js`, `questionController.js`, and `userRoutes.js` used raw `pg.Pool` SQL queries with manual string templates. This created inconsistencies, potential SQL vulnerabilities, and foreign-key deletion issues.
- **Files Modified**:
  - `backend/src/controllers/sessionController.js`: Migrated to `prisma.session`. Added atomic transaction deletion (`prisma.$transaction`) to cleanly delete sessions and related records without foreign key errors.
  - `backend/src/controllers/questionController.js`: Migrated to `prisma.question` and `prisma.vote`. Upvotes now use atomic transactions.
  - `backend/src/controllers/uploadController.js`: Migrated to `prisma.sessionMedia`.
  - `backend/src/middleware/authMiddleware.js`: Migrated user lookup to `prisma.user.findUnique`.
  - `backend/src/routes/userRoutes.js`: Migrated to `prisma.user`.
  - `backend/src/app.js`: Removed deprecated `db.js` import.
  - `backend/src/config/redis.js`: Added non-blocking connection with retry limits so the server never hangs on startup if the external Redis host is unreachable.
- **Verification**:
  - Root endpoint `GET http://localhost:5000/` returns `200 OK`.
  - Vite frontend `GET http://localhost:5173/` returns `200 OK`.

---

## 📌 Phase 2: Modern Lecture Console & Session Lifecycle

### Step 2.1: Question State Machine & Real-Time Pinning
- **Date**: Sept 05, 2026
- **Rationale**: Real classroom Q&A requires questions to have a rich lifecycle (`PENDING` → `PINNED` → `ANSWERED` | `DISMISSED`) rather than a simple boolean flag. Pinning allows the teacher to spotlight one question for the entire class.
- **Files Modified**:
  - `backend/prisma/schema.prisma`: Added `status` (default `'PENDING'`) and `pinned_at` timestamp.
  - `backend/src/controllers/questionController.js`: Implemented `PATCH /api/questions/:id/status` with single-pin logic (pinning a new question automatically unpins previous ones in the session).
  - `backend/src/routes/questionRoutes.js`: Registered `PATCH /api/questions/:id/status`.
  - `backend/src/socket/socketHandler.js`: Registered real-time socket events `pin-question`, `unpin-question`, and `question-status-changed`.
- **Verification**: Backend automatically reloaded with Nodemon and syntax validation passed.

---

### Step 2.2: Decomposing `SessionRoom.jsx` into Modular Components
- **Date**: Sept 05, 2026
- **Rationale**: `SessionRoom.jsx` was a monolithic file (>600 lines) that mixed socket listeners, state management, modal logic, PDF generation, and UI. Breaking it into domain-specific components under `frontend/src/components/session/` establishes clean React design patterns.
- **Components Created**:
  - `SessionHeader.jsx`: Clean header with code copy, live badge, and teacher controls.
  - `PinnedQuestionBanner.jsx`: Spotlight banner for the currently pinned active doubt.
  - `QuestionCard.jsx`: Reusable card supporting upvoting, teacher moderation (Pin, Answer, Delete), and image attachments.
  - `QuestionInput.jsx`: Doubt submission input with character count and image attachment.
  - `MediaStrip.jsx`: Teacher-shared diagrams gallery.
  - `LightboxModal.jsx`: Full-screen image preview.
- **Verification**: `npm run build` passed with 0 errors.

---

### Step 2.3: Post-Session Read-Only Recap & Archive View (`/session/:code/recap`)
- **Date**: Sept 05, 2026
- **Rationale**: Previously, ending a session abruptly disconnected users and returned them to the dashboard, losing the context of the doubts asked. A permanent recap page enables students to review questions and answers anytime for exam revision.
- **Files Created**:
  - `frontend/src/pages/SessionRecap.jsx`: Dedicated post-session review page showing lecture duration, metrics (Doubts Asked, Answered Count, Answer Rate %, Top Question), attached diagrams, and segmented lists of answered vs open doubts.
  - `frontend/src/pages/SessionRecap.css`: High-contrast, responsive archive styling.
- **Files Modified**:
  - `backend/src/controllers/sessionController.js`: Updated `getSessionByCode` to return ended sessions rather than returning a 400 error, enabling the recap page to fetch past lecture details.
  - `frontend/src/App.jsx`: Registered route `/session/:code/recap`.
  - `frontend/src/pages/SessionRoom.jsx`: Automatically redirects to recap when an ended session is accessed, when the teacher ends the session, or when the `session-closed` socket event fires.
  - `frontend/src/pages/Dashboard.jsx`: Added a "Recap →" action button to past/ended sessions in the dashboard list.
- **Verification**: `npm run build` passed with 0 errors.

---

## 📌 Phase 3: Study Materials & Lecture Resources Hub

### Step 3.1: Course & Study Material Vault Schema
- **Date**: Sept 05, 2026
- **Rationale**: Students currently receive slides and problem sheets across scattered WhatsApp groups and unstructured emails. Adding `Course` and `CourseMaterial` models establishes an organized academic hierarchy: Subject ➔ Lectures ➔ Attached Slides/Handouts.
- **Files Modified**:
  - `backend/prisma/schema.prisma`:
    - Defined `Course` model (`id`, `course_code`, `title`, `description`, `teacher_id`, `created_at`).
    - Defined `CourseMaterial` model (`id`, `course_id`, `session_id?`, `title`, `file_url`, `public_id`, `file_type`, `file_size`, `category`, `uploaded_at`).
    - Added relational mapping between `User`, `Course`, `Session`, and `CourseMaterial`.
  - `backend/prisma/migrations/20260905_add_courses_and_materials/migration.sql`: Generated reproducible SQL migration.

---

### Step 3.2: Study Materials Upload & Management API Endpoints
- **Date**: Sept 05, 2026
- **Rationale**: Provides the backend endpoints and storage pipeline to upload lecture slides (PDFs) and documents up to 25MB to Cloudinary and attach them to courses or individual sessions.
- **Files Created**:
  - `backend/src/controllers/materialController.js`: Handlers for `uploadMaterial`, `getMaterialsByCourse`, `getMaterialsBySession`, and `deleteMaterial`.
  - `backend/src/routes/materialRoutes.js`: Endpoints (`POST /api/materials/upload`, `GET /course/:courseId`, `GET /session/:sessionId`, `DELETE /:id`).
- **Files Modified**:
  - `backend/src/config/cloudinary.js`: Added `materialUpload` storage engine supporting multi-page PDFs and slides up to 25MB with raw/auto resource types.
  - `backend/src/app.js`: Registered `app.use('/api/materials', materialRoutes)`.
  - `backend/.env`: Configured `DATABASE_URL` with `?pgbouncer=true` to ensure reliable Prisma transactions through the Supabase connection pooler.
- **Verification**:
  - Live PostgreSQL schema migrated with `courses` and `course_materials` tables created.
  - Test Prisma query connected and fetched live database rows.
  - Backend syntax check passed with 0 errors.
---

### Step 3.3: In-Session Study Materials Drawer & Real-Time Sync
- **Date**: Sept 05, 2026
- **Rationale**: Students and lecturers need instant access to relevant lecture slides and reference notes right inside the active session without switching apps or digging through email threads. Real-time WebSocket broadcasting ensures students immediately see uploaded slides the second the lecturer shares them.
- **Files Created**:
  - `frontend/src/components/session/MaterialsDrawer.jsx`: Slide-out panel displaying attached lecture materials with category filtering, live file upload for teachers (with size/type validation), download buttons, and teacher-only delete action.
- **Files Modified**:
  - `backend/src/socket/socketHandler.js`: Handled `material-added` and `material-deleted` events broadcast to the session room.
  - `frontend/src/components/session/SessionHeader.jsx`: Added "Resources" toggle button displaying material counter badge.
  - `frontend/src/pages/SessionRoom.jsx`: Integrated material state, fetch on mount, upload/delete handler with optimistic state updates, and real-time socket listener.
  - `frontend/src/pages/SessionRoom.css`: Added responsive slide-over drawer styling with glassmorphism backdrop and clean document card layouts.
- **Verification**:
  - Frontend production build (`npm run build`) passed cleanly with 0 errors.

---

### Step 3.4: Academic Course & Study Material Vault Hub on Dashboard
- **Date**: Sept 05, 2026
- **Rationale**: Elevates AskAnon beyond transient, ephemeral chatrooms into an organized academic hub. Teachers can manage recurring semester courses, upload and categorize slides/handouts directly into a course vault, and attach live lecture sessions to their courses.
- **Files Created**:
  - `backend/src/controllers/courseController.js`: Handlers for `createCourse`, `getCoursesByTeacher`, `getCourseById`, and `deleteCourse`.
  - `backend/src/routes/courseRoutes.js`: Endpoints (`POST /api/courses`, `GET /teacher/:teacherId`, `GET /:id`, `DELETE /:id`) with Clerk authentication.
- **Files Modified**:
  - `backend/src/app.js`: Registered `app.use('/api/courses', courseRoutes)`.
  - `backend/src/controllers/sessionController.js`: Supported optional `course_id` when creating sessions and included `course` relational details in `getSessionByCode`.
  - `backend/src/controllers/materialController.js`: Added smart fallback to automatically resolve/associate course IDs when materials are uploaded inside sessions.
  - `backend/prisma/client`: Re-generated Prisma Client binary to recognize `course` and `course_materials` models and relations.
  - `frontend/src/pages/Dashboard.jsx`: Built dual-tab view ("Lecture Sessions" vs "Courses & Study Vault"), course creation modal, inline study material upload and deletion directly from the course card, and optional course selector dropdown in the "Create Session" modal.
  - `frontend/src/pages/Dashboard.css`: Added styles for tab bar, course cards, inline vault drawer, document rows, and mobile responsiveness.
- **Verification**:
  - `node -c` backend syntax validation passed with 0 errors.
  - `npx prisma generate` generated v6.19.3 client recognizing all models.
  - Frontend production build (`npm run build`) passed with 0 errors.
  - Backend server restarted and connected successfully to Supabase and WebSocket clients.

---

## 📌 Phase 4: Full Code Audit & Bug Fixes

## [Unreleased] - Bug Fixes & Backend Recovery
- **Backend Export Fix**: Exported both named and default `cloudinary` from `cloudinary.js` to fix a `SyntaxError` that crashed nodemon.
- **Connection Refusal Resolved**: Backend on `http://localhost:5000` is healthy and responding to requests.
- **Safe Auth Profile Sync**: Added `getOrSyncDbUser()` and state fallbacks in `Dashboard.jsx` to eliminate `TypeError: Cannot read properties of null (reading 'id')` when creating sessions or courses.
- **Connection State UI**: Added a user-facing retry notification banner in `Dashboard.jsx` to gracefully handle server reconnects.

## [2026-09-04] - Phase 4: Code Audit & Bug Fixes
- **Date**: Sept 05, 2026
- **Rationale**: Following major architectural shifts, an exhaustive end-to-end static audit of all routes and frontend components was performed to patch leaks, correct race conditions, and fix navigation loopholes.
- **Key Fixes**:
  - **Auth Sync Race Condition**: Refactored `userRoutes.js` to use `prisma.user.upsert()` instead of `findUnique + create` to eliminate race conditions when Clerk pushes concurrent login requests.
  - **Cloudinary Orphan Leak**: Patched `deleteCourse` in `courseController.js` to systematically iterate through attached course materials and invoke `cloudinary.uploader.destroy()` on the physical PDF/image files *before* deleting database rows.
  - **Ended Session Redirection**: Updated `JoinSession.jsx` to gracefully intercept inactive sessions and redirect the student directly to `/session/:code/recap`, bypassing a flash of the `SessionRoom`.
  - **Upload Context Preservation**: Fixed a bug in `SessionRoom.jsx` where uploading slides during unlinked live sessions aggressively forced `course_id = 1`. Now omitting `course_id` triggers the backend's dynamic `GEN100` fallback properly.
- **Verification**:
  - Verified WebSocket payloads (`material-added`, `media-shared`, `question-answered`) align cleanly with the React frontend listeners.
  - `npm run build` executed successfully with 0 errors.
  - `node -c` backend syntax audit validated successfully for all controllers.

## 📌 Phase 5: Faculty Dashboard Enhancements (2026-09-05)
- **Batch Deletion with Safe Sequential Pruning**:
  - Implemented multi-select checkboxes on session cards with a floating bottom action dock (`batch-action-dock`).
  - Added `POST /api/sessions/batch-delete` backend controller using safe sequential Prisma queries to bypass PgBouncer interactive transaction limitations on Supabase.
  - Materials and PDFs attached to sessions remain safely preserved in Course Repositories (`session_id = null`).
- **Sessions Search, Filter & Sort Command Bar**:
  - Full text search across session titles, subject names, and 6-character room codes (`#ABCDEF`).
  - Filter dropdowns for Course (All / Specific Course / Unassigned) and Status (All / Live Only / Concluded Only).
  - Multi-tier sorting: Newest First, Oldest First, and Most Questions.
  - "Select All" / "Deselect All" visible sessions toggle.
- **Classroom Projector Display Mode**:
  - Added dedicated `📽️ Projector` view modal for live sessions with high-contrast display, room code `# A B C D E F`, join banner, and high-res QR code.
- **1-Click Question Transcript Export (CSV)**:
  - Added instant CSV download button (`📥 CSV`) directly on concluded session cards.
- **Course Assignment**:
  - Added inline course badge and `+ Assign Course` modal to re-assign or link sessions to Course Vaults on the fly (`PATCH /api/sessions/:id/course`).

## 📌 Phase 6: Student Dashboard Section Isolation & Auto-Enrollment (2026-09-05)
- **CourseEnrollment Model**:
  - Added `course_enrollments` table in PostgreSQL linking `User ↔ Course` with unique index.
- **Seamless Auto-Enrollment on Live Lecture Join**:
  - Joining a live lecture via room code `#ABCDEF` or direct link (`/session/:code`) auto-enrolls the student into that lecture's course repository (`POST /api/courses/enroll`).
- **Personalized Student Dashboard Feed**:
  - Course Vaults grid strictly displays courses the student is enrolled in (`GET /api/courses/enrolled/:userId`). Section A students never see Section B or unrelated campus classes.
  - "● Live Now for Your Classes" only alerts students to live rooms belonging to their enrolled courses (`GET /api/sessions/active/student/:userId`).
  - Added `Leave ✕` course action (`DELETE /api/courses/enroll/:courseId`) with confirmation.
  - Added clean empty/welcome state (`student-welcome-panel`) for students who have not attended any lectures yet.

## 📌 Phase 7: Live Session Room Overhaul & Media Controls (2026-09-05)
- **Active Room UI Overflow Fixed (Faculty Dashboard)**:
  - Redesigned active lecture card (`Dashboard.jsx` & `Dashboard.css`) with a clean 2-tier action stack (`.atc-actions-stack` with primary `Enter Live Console →` and subrow for `📽️ Projector`, `End Lecture`, and `🗑`).
  - Fixed cramping of `.badge-crimson` (`white-space: nowrap`) and multi-line wrapping of `.atc-elapsed-time`.
- **Eliminated Duplicate & Cluttered Controls**:
  - Removed redundant `📷 Share Media` and `↓ PDF` buttons from `SessionHeader.jsx`, keeping the topbar lean and focused on navigation, live timer, canonical `# Code` badge, and `📁 Slides & Notes`.
  - Removed duplicate `# Code` and `📁 Slides` icons from the left vertical rail, preserving only `💬 Q&A` stream and `← Exit`.
  - Streamlined `Podium Quick Actions` in `SessionRoom.jsx`, removing redundant slides triggers and adding a 1-click `📽️ Classroom Projector ↗` action.
- **In-Class Code Snippets Feature**:
  - Added optional `code_snippet` and `code_language` fields to the `Question` model in PostgreSQL via Prisma (`npx prisma db push`).
  - Upgraded `QuestionInput.jsx` with `</> Code` composer toggle, language selector (Python, JS, TS, C++, Java, C, SQL, HTML/CSS, Go, Rust, Plain Text), and monospace editor with terminal dots.
  - Upgraded `QuestionCard.jsx` with syntax container, language badge, and 1-click `📋 Copy Code` button with `✓ Copied` feedback.
- **Fixed Image Bugs & Duplicate Image Broadcasts**:
  - Identified and fixed root cause where `LightboxModal` was expecting `image` but `SessionRoom.jsx` was passing `imageUrl`. Updated `LightboxModal.jsx` to accept both `image` and `imageUrl` and support objects or plain URL strings.
  - Added deduplication in `socket.on('media-received')` in `SessionRoom.jsx` checking both `id` and `public_id` to prevent double images on teacher upload.
- **Cloudinary Download Utility (`downloadHelper.js`)**:
  - Created `downloadFile(url, filename)` that transforms Cloudinary URLs to `/upload/fl_attachment/` and fetches as a blob, resolving cross-origin download restrictions on PDF and images.
  - Updated `MaterialsDrawer.jsx`, `CourseDetail.jsx`, `LightboxModal.jsx`, and `MediaStrip.jsx` to use `downloadFile`.
- **Teacher Classroom Board & "Save to Course Vault"**:
  - Added `MediaStrip` to the Faculty Podium feed column so teachers can directly view, enlarge, download, delete, or save shared whiteboard photos and diagrams.
  - Added backend endpoint `POST /api/materials/from-media` in `materialRoutes.js` and `materialController.js` supporting both numeric `id` and string `public_id` lookups.
  - Teachers can now 1-click save any lecture whiteboard photo directly to the Course Study Vault (`📁 Save to Vault`).
- **Interactive Lightbox Modal Upgrade**:
  - Rewrote `LightboxModal.jsx` with zoom controls (`−`, `100%`, `+`), 1-click direct download (`⬇️ Download`), teacher `📁 Save to Vault`, and `Esc` keyboard shortcut.

## 📌 Phase 8: Applied AI Architecture — Live Deduplication & Academic Synthesis (2026-09-06)
- **Applied AI Feature 1: Semantic Duplicate Detection & Related Doubt Linking**:
  - **Pragmatic Architecture**: Avoided continuous typing debounce and clustering graphs; implemented clean on-submit pre-check (~250ms latency) using Google Gemini embeddings (`models/gemini-embedding-001`).
  - **Configurable Sensitivity**: Configured `DUPLICATE_THRESHOLD=0.82` in `backend/.env` for non-breaking parameter tuning.
  - **Two-Tier Caching**: Sub-millisecond in-memory cache + Redis cache-aside (`86400s` TTL) using MD5 text hashes, protecting against redundant external API calls.
  - **Fail-Open Design**: If Gemini is slow or times out, the question automatically posts without hanging the classroom experience.
  - **Human-Centric Intercept UX**: `DuplicatePromptModal.jsx` displays clear copy comparing student drafts with existing active questions, providing `[👍 Upvote Existing Question (+1)]`, `[Post Mine Anyway →]`, and `[← Cancel & Edit Draft]`.
  - **Related Doubt Linking**: Questions posted anyway are linked via `related_to_id` and `related_text` in PostgreSQL and tagged with a `⚡ Related Doubt` badge and popover on the question stream.

- **Applied AI Feature 2: AI Academic Intelligence & Role-Tailored Post-Lecture Synthesis**:
  - **Structured LLM Generation**: `aiInsightsService.js` synthesizes classroom comprehension using `gemini-3.6-flash` in strict JSON schema mode (`responseMimeType: 'application/json'`) with circuit-breaker protection.
  - **Four Academic Pillars Generated**:
    1. `core_concepts`: High-level curriculum topics covered in lecture.
    2. `student_misconceptions`: Classroom confusion heatmap explaining specific misunderstanding patterns.
    3. `exam_revision_note`: High-yield exam preparation advice tailored for students.
    4. `action_for_next_lecture`: Actionable 5-minute pedagogical follow-up guidance tailored for professors.
  - **Zero-Cost Database Caching**: Persisted to `Session.ai_summary` in PostgreSQL. Once generated, all subsequent visits by students or instructors are instant 0ms database reads with 0 Gemini API calls.
  - **Role-Tailored Recap UI**: Added the `🤖 Academic Intelligence` card in `SessionRecap.jsx` and `SessionRecap.css`. Automatically presents the *Faculty Action Item* and `🔄 Refresh Analysis` button to professors, and the *Exam Preparation Focus* to students.

---

## 📌 Phase 9: Permanent Session Deletion Architecture & Real-Time Sync (2026-09-09)
- **Root Cause Diagnosis**:
  - In `sessionController.js`, `deleteSession` and `batchDeleteSessions` attempted to query `prisma.enrollment.findMany(...)` to invalidate student cache keys. The actual model in Prisma schema is `CourseEnrollment` (`prisma.courseEnrollment`). This threw a fatal `TypeError: Cannot read properties of undefined (reading 'findMany')`, returning status 500 and completely blocking session deletion.
  - In `Dashboard.jsx`, `confirmDeleteSession` and `handleBatchDelete` contained calls to an undeclared function `setDoubts(...)`, throwing a `ReferenceError` on the client side.
  - Foreign key dependencies on `polls` (`poll_votes`, `poll_options`), `bookmarks`, `votes`, and `questions` were previously not explicitly cleaned in topological order before issuing `prisma.session.delete`, risking relational constraint errors on PostgreSQL.
  - In `SessionRoom.jsx`, a duplicate legacy `session-closed` listener improperly routed deleted sessions to `/recap` instead of redirecting students to `/dashboard`.
- **Architectural Solution & Improvements**:
  - **Topological Cascade Pruning**: Implemented safe, multi-tier sequential pruning in `deleteSession` and `batchDeleteSessions`:
    1. Decouples attached `course_materials` (`session_id = null`) preserving slides in the Course Vault.
    2. Prunes live `poll_votes` and `poll_options` before deleting `polls`.
    3. Cleans up `bookmarks`, `votes`, and resets self-referencing `related_to_id` before deleting `questions`.
    4. Cleans up `session_media`.
    5. Queries `prisma.courseEnrollment.findMany` safely to invalidate student session history caches.
    6. Permanently deletes the session record from PostgreSQL.
  - **Multi-Client Real-Time WebSocket Synchronization**:
    - Backend now emits `session-deleted` and `sessions-batch-deleted` broadcasts.
    - `Dashboard.jsx` now connects to Socket.io and listens for `session-deleted`, `sessions-batch-deleted`, and `session-ended` in real-time. Deleted sessions instantly disappear from both faculty and student dashboard feeds across all open windows and devices without requiring page refresh.
    - Students currently inside an active lecture that gets deleted receive the `session-closed` socket event and are cleanly redirected to `/dashboard` with an informative error toast.
## 7 November 2026 � responsive operations

- Added consistent loading/saving feedback, skeleton views, long-wait messaging, bounded waits and duplicate-action guards across the classroom/dashboard/vault flows. Failed create/poll/upload drafts are preserved.
- Added account-scoped frontend snapshots, request coalescing, lazy student notebook/history requests and progressive list rendering. Kept authoritative socket refreshes and invalidation.
- Lecture deletion now returns 202 after durable enqueue, denies further classroom access, and performs topological cleanup in the backend worker. Added pending/failure/retry UI, lease recovery and batched storage-cleanup bookkeeping. Completion socket event shapes remain unchanged.
- Additive database artifact: `backend/prisma/migrations/20261107_session_deletion_jobs/migration.sql`; regenerated bootstrap now contains 15 tables. Existing data/region/migration history retained. See the completion log for exact tests, latency samples and limitations.

## 2026-11-07 - focused feedback, responsive polish and scanned-PDF retrieval

- Scoped Pin/Answer loading feedback to the actual action; removed redundant bookmark spinners, routine background refresh banners and running-cleanup panels. Failed jobs retain retry feedback.
- Removed instructor Review tab; text rejected by moderation is not published, unavailable checking is retryable, and ordinary rejected drafts can retry without erasing abuse penalties.
- Added bounded, page-preserving Gemini transcription for scanned PDF pages before chunking/embedding; cached successful transcription and retained old indexes on failure. Verified existing scanned certificate through a real cited AI response.
- Reworked hosted sessions into a clean responsive list, fixed narrow-screen grids/forms/navigation and standardized font choices. Updated landing copy, spacing, anchor alignment and auth-independent static rendering; made role selection keyboard-operable.
- Validation: 41 backend tests + 3 frontend tests, lint/build, 13 isolated classroom integration scenarios and targeted signed-in/responsive browser checks. See completion log for evidence and limits.

## 2026-11-07 - shorter landing and verifiable vault answers

- Unified tagline/navigation, shortened landing copy and switched landing headings to sans-serif. Fixed sticky-header containment and centered section navigation from header/footer.
- Replaced Study task with Ask your PDFs; added readable source cards, exact retrieved passages, retry feedback and guarded/cancellable requests.
- Diagnosed Gemini 503 overload and verified one bounded lightweight fallback. Applied the same recovery to scanned-page transcription; quota failures remain explicit.
- Reindexed the two screenshot PDFs with page references. Added a read-only pgvector inspector and ASKANON_AI_ARCHITECTURE.md with the actual RAG flowchart and limitations.
- Verified 46 automated tests, syntax, lint/build, real single/course PDF requests, failure recovery and responsive layouts. Existing personal data and unrelated changes retained.

## 2026-11-07 - conversational course companion and editorial restoration

- Restored serif/italic landing headings, photo overlay, workflow strip and comparison cards while preserving working section navigation and branding.
- Added bounded conversation context, evidence-grounded follow-up suggestions, adaptive longer answers and practice questions with revealable worked answers.
- Expanded retrieval with authorized neighboring chunks; preserved sources, failure recovery, access control and cache versioning.
- Added responsive Markdown tables. Verified real detailed/simpler/practice requests and draft preservation; 50 automated tests plus lint/build passed.

## 2026-11-10 - detailed UI and release review

- Corrected landing link order and added verified author/GitHub footer credit.
- Replaced expanding course upload drawers with a guarded dialog and fresh file selection.
- Made the image viewer independently styled, body-portaled and responsive with scrollable zoom and load retry.
- Explained standalone-to-general vault behavior and reused legacy general vault codes without deleting existing data.
- Hide unavailable role switching; documented production blockers and audit coverage in ASKANON_PRODUCTION_REVIEW.md.
- Validation: 52 automated tests plus 13 isolated database/socket scenarios; targeted responsive component browser checks. Authenticated manual browser audit still requires sign-in.

## 2026-11-10 - final credit and role-switch removal

- Footer now reads Crafted by Vansham Bansal; only the name links to the GitHub profile, with no separate GitHub text/icon.
- Removed the visible dashboard role toggle and client handler; existing production API role restrictions remain.
- Recorded current failure handling, remaining recovery/backup/quota gaps and ordered production hardening passes in the production review. No hosting/billing/backup configuration changed.
- Verified public and signed-in rendering, frontend lint and production build.

## 2026-11-10 — Simplified demo release preparation

- Confirmed there is no institution or approval intermediary: new accounts choose Student or Teacher once. Existing roles cannot be changed through profile sync, including with the former development switch flag.
- Preserved session ownership, join-by-code enrollment, course vault access and lazy general-vault creation for standalone session resources.
- Added exact production origin configuration, bounded request/indexing limits, Redis recovery with memory fallback and graceful shutdown.
- Added a read-only database backup command; pg_dump is not installed here, so backup execution and a restore rehearsal remain release prerequisites.
- Organized current guides under docs/ and retained prior reviews under docs/history/. Real environment files are ignored, unchanged and copied to ignored local safety storage.
- Validation: 56 unit tests, frontend lint/build and backend syntax checks passed. All 14 isolated classroom integration scenarios passed across six identities, including restart recovery; disposable records were cleaned up. Gemini responses in the integration harness are simulated, not proof of current provider quota.
- Integration measurements still showed approximately 0.7–3.5 seconds for session creation and 2.6 seconds for queued deletion acknowledgement against the configured remote database. Background work and optimistic UI do not eliminate remote database latency.
- Prepared five organized Git commits covering configuration, API, frontend, checks/tooling and documentation. Actual hosting configuration, production credentials/origins, backup restore and post-deployment rehearsal remain external steps.

## 2026-11-10 — Returning-account onboarding recovery

- Diagnosed role-selection failures as a unique-email collision with a deleted legacy Clerk identity (P2002), rather than a missing role selection.
- Profile sync now reconnects the verified primary email only after Clerk confirms the previous identity is deleted (404). Saved role, profile ID and all owned/enrolled data are retained. Active identities and provider failures never permit reassignment.
- Added regression coverage for deleted identity, active identity and provider outage; all 20 access tests pass.

## 2026-11-10 — Authentication-first entry flow

- Both landing-page entry actions authenticate first. New users choose a role only after authentication; returning users retain their saved role.
- Direct unsigned onboarding shows a sign-in/create-account action instead of role cards. Removed stale pre-auth role intent from dashboard synchronization.
- Added Vercel client-route fallback and a manual Vercel/Railway deployment walkthrough. No hosting resources were created.

## 2026-11-10 — Landing entry-point cleanup

- Kept Sign In/Dashboard in desktop and mobile navigation, the main hero action and one final footer action.
- Removed duplicate navigation Get Started buttons and the misleading Launch a Faculty Session action. Faculty information remains; registration uses one authentication-first flow with an explicit role choice for new accounts.
- Frontend lint and production build passed.
