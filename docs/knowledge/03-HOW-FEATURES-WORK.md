# How the main features work

## 1. Authentication and role selection

Clerk authenticates the person. React obtains a token and sends `Authorization: Bearer …`. The backend verifies it, takes the subject (`sub`) as the Clerk identity and looks up `User.clerk_user_id`.

Profile sync without a role returns `409 ROLE_REQUIRED` for a new identity. Onboarding then submits a choice, and the backend retrieves its verified primary email from Clerk. Existing profiles cannot switch roles (`403 ROLE_IMMUTABLE`); the upsert update branch cannot overwrite the saved role.

Evidence: [user routes](../../backend/src/routes/userRoutes.js), [Onboarding](../../frontend/src/pages/Onboarding.jsx), [Dashboard](../../frontend/src/pages/Dashboard.jsx).

## 2. Create, join and enroll

A teacher POSTs a title and optional course ID. Backend role validation prevents a student creating a lecture; assigning a course requires ownership. A unique lecture code identifies the room. A code is an access mechanism shared with participants, not proof that somebody belongs to a particular university.

The room bundle route validates code access and returns questions, media, materials, personal bookmarks/votes and current poll state. Independent reads run concurrently. Joining an active course-linked session upserts the caller's enrollment and refreshes private course/workspace membership. A standalone code establishes a bounded, temporary in-memory grant; it does not add a durable attendance row.

Evidence: [session controller](../../backend/src/controllers/sessionController.js), [material lifecycle](../../backend/src/utils/materialLifecycle.js), [access checks](../../backend/src/middleware/accessMiddleware.js).

## 3. Ask a question

```mermaid
sequenceDiagram
    participant S as Student React UI
    participant E as Express
    participant A as AI and cache
    participant P as PostgreSQL
    participant T as Connected classroom
    S->>E: Duplicate pre-check
    E->>P: Read recent active candidates
    E->>A: Reuse or compare embeddings
    E-->>S: Optional similar question suggestion
    S->>E: POST question with token
    E->>E: Access, input and local checks
    E->>A: Contextual moderation
    alt Safe written submission
        E->>P: Recheck session and commit question
        E-->>T: question-received
        E-->>S: 201 question
    else Rejected or checking unavailable
        E-->>S: Rejection or retryable error; no question created
    end
```

Duplicate detection is a suggestion step, not a database uniqueness guarantee. It normalizes text first, then compares meaning where candidate embeddings are cached. It checks up to 25 recent pending/pinned text-only questions. The student can choose to upvote a match rather than submit another question.

Publication has its own mandatory path. Student question text is limited to 300 characters. Local checks reject obvious abuse; Gemini checks text plus bounded code context against the lecture title/subject. A rejection returns 422; unavailable checking returns 503 and keeps the frontend draft. The failed moderation path releases the submission cooldown rather than treating a provider outage as misconduct.

The transaction rechecks active/deletion/paused state before inserting. The server publishes the committed record to the lecture room and invalidates caches. The browser reconciles by ID so a response and socket delivery need not produce two cards. Accepted text embeddings are warmed after the response, avoiding an additional publication dependency.

Instructor NOTE/CODE broadcasts are different from student QUESTION records: ownership is required, the broadcast is pinned, and it does not run the same question moderation. Image-only questions are marked attachment-only, not falsely described as text-reviewed. Neither exception means arbitrary clients may bypass ownership checks for instructor content.

Evidence: [SessionRoom](../../frontend/src/pages/SessionRoom.jsx), [question controller](../../backend/src/controllers/questionController.js), [moderation](../../backend/src/utils/contentModerator.js).

## 4. Votes, pinning and written answers

The server derives voter identity from the token. Upvoting inserts a unique Vote and increments the question counter in one transaction. Duplicate insertion fails; the counter change rolls back. Voting closes on answered or ended content, and hosts cannot vote in their own lecture. A second click is not a toggle-downvote API.

Pinning resets any currently pinned item and pins the selected question in a Serializable transaction. The broadcast updates existing cards and the pinned banner. `PENDING` unpins; `ANSWERED` updates answered timestamps and flags; `DISMISSED` hides it from the student feed. Written answers also persist explanation text. Legacy boolean/status fields must remain consistent.

## 5. Polls and reconnects

Pause/resume and poll commands enter through authenticated socket handlers. Commands require a joined lecture; host actions check ownership. Poll voter keys are built server-side from the verified user, not accepted from the client. Starting a poll validates 2–6 options and retires the previously displayed poll.

On reconnect, `join-session` supplies persisted pause/poll state, including the participant's own vote. SessionRoom then refreshes the HTTP bundle. It does not assume every missed event will be replayed. Durable state makes rehydration possible; Socket.io alone does not persist the application.

Evidence: [socket handler](../../backend/src/socket/socketHandler.js), [poll service](../../backend/src/utils/pollService.js).

## 6. Materials, recap and deletion

Upload middleware validates authorization before external storage where configured. Cloudinary stores the file; a transaction creates its material record and links its course/session. The HTTP response confirms the upload, not completed AI indexing. PDFs start background indexing; images remain viewable resources. If a file uploaded but metadata creation failed, the asset is queued for cleanup.

Ending a session commits ended state and closes polls, then notifies clients. AI recap generation is separate from this essential lifecycle action. It summarizes selected discussion, written answers and polls; an unavailable recap does not mean ending the session failed.

Lecture deletion returns **202 Accepted** after a durable deletion job is committed. Access is blocked while pruning proceeds. The worker retries failures and can reclaim an expired lease after restart. Completion invalidates caches and sends single/batch deletion events. This separates “request accepted” from “all cleanup finished.” Course removal has a different lifecycle: it detaches lectures and removes course-owned materials rather than calling lecture deletion for each session.

Evidence: [material controller](../../backend/src/controllers/materialController.js), [session jobs](../../backend/src/utils/sessionDeletionJobs.js), [lifecycle pruning](../../backend/src/utils/sessionLifecycle.js).

## Compact REST reference

Paths below include `/api`. All listed routes require a verified identity; sync can run before an application profile exists. “Owner” means the owning teacher, not any teacher. Route files define the full contract; these are the core operations worth knowing.

| Method and path | Purpose / main permission |
|---|---|
| `POST /users/sync`, `GET /users/me` | Create/retrieve saved profile; immutable role |
| `POST /sessions` | Teacher creates lecture; optional owned `course_id` |
| `GET /sessions/:code/bundle` | Code-based room snapshot; live course enrollment |
| `GET /sessions/:code/recap-bundle` | Recorded room data including poll history |
| `GET /sessions/teacher/:teacherId` | Own hosted sessions |
| `GET /sessions/history/student/:userId` | Own course-linked concluded lectures |
| `PATCH /sessions/:id/end`, `PATCH /sessions/:id/course` | Owner ends/reassigns lecture |
| `DELETE /sessions/:id`, `POST /sessions/batch-delete` | Owner queues deletion; batch body `sessionIds` |
| `POST /sessions/deletion-jobs/:jobId/retry` | Owner retries a failed deletion |
| `GET /sessions/:id/ai-insights`, `POST /sessions/:id/ai-insights/refresh` | Accessible insight read; owner refresh |
| `POST /questions/check-duplicate` | Authorized session pre-check; `session_id`, `question_text` |
| `POST /questions` | Create authorized question/broadcast |
| `POST /questions/:id/upvote` | One verified vote per question |
| `PATCH /questions/:id/status`, `PATCH /questions/:id/answer-text` | Owner status or `answer_text` |
| `POST /courses`, `GET /courses/:id`, `DELETE /courses/:id` | Create / authorized read / owner removal |
| `POST /courses/enroll`, `DELETE /courses/enroll/:courseId` | Validated enrollment / own leave |
| `POST /materials/upload` | Owner multipart upload; title, scope and `file` |
| `POST /materials/from-media` | Owner saves an existing classroom image |
| `POST /materials/:id/index` | Owner requests reindex |
| `POST /bookmarks/:questionId/toggle`, `GET /bookmarks/my` | Own saved questions; accessible-question check on toggle |
| `POST /courses/:id/ask`, `POST /materials/:id/ask` | Authorized AI request; `question`, optional `mode`, `history` |
| `GET /materials/proxy-download` | Authenticated, validated resource delivery |

## Compact socket reference

Client connection authentication supplies a token. Rooms include lecture codes, `user:<id>` and authorized `course:<id>`. Joining a room controls notification audience; it is not a replacement for write permission checks.

| Direction | Events and essential contract |
|---|---|
| Client → server | `join-session`: code string or object with `sessionCode` |
| Client → server | `pause-session`, `resume-session`: owner, lecture code |
| Client → server | `start-poll`: `{sessionCode, poll: {question, options}}` |
| Client → server | `vote-poll`: `{sessionCode, pollId, optionIndex}` |
| Client → server | `end-poll`, `remove-poll`: owner, `sessionCode` |
| Client → server | `refresh-workspace`: refresh private room membership |
| Server → client | `session-state`: pause and personalized current poll snapshot |
| Server → room | `question-received`, `question-updated`, `question-pinned`: question record; `question-removed`: ID |
| Server → room | `session-paused`, `session-resumed`, `session-ended`, `session-closed` |
| Server → room | `poll-started`, `poll-updated`, `poll-ended`: poll view; `poll-removed`: no poll payload |
| Server → audience | `material-received`, `material-index-updated`, `material-removed`; classroom media events |
| Server → workspace | `workspace-updated`, `session-deleted`, `sessions-batch-deleted`, `course-deleted` |
