# Decisions, reliability and honest tradeoffs

For deeper worked scenarios and performance-measurement guidance, continue to [System design in practice](08-SYSTEM-DESIGN-IN-PRACTICE.md).

## How to explain a decision

Describe the problem, approach and tradeoff rather than saying a technology is “best.” The implementation below is verified from code. Unless explicitly stated as a product rule, the suitability explanations are **engineering interpretations**, not proof of the original author's reasoning or a measured comparison.

| Decision | Problem and chosen approach | Benefit, alternative and cost |
|---|---|---|
| React + Vite | Build an interactive browser application | Straightforward client state and builds; Next.js could add server rendering but would change architecture. This is a fit argument, not a benchmark. |
| Node + Express | Serve JSON APIs and socket connections | One JavaScript backend with visible middleware; other runtimes/frameworks could work. Async I/O does not make CPU-heavy parsing free. |
| HTTP plus Socket.io | Confirm mutations and update classmates immediately | HTTP is easy to validate; socket rooms reduce repeated polling. Reconnect/auth/room management add work. |
| PostgreSQL | Model connected courses, lectures, votes and constraints | Joins and transactions fit the relationships; MongoDB is possible, but would require other modeling decisions. Relational is suitable, not universally superior. |
| Prisma | Keep ordinary CRUD and relationships readable | Types/schema and transactions help consistency. Unsupported vectors still require narrow SQL operations. ORM use does not eliminate query tuning. |
| pgvector | Search course text without another database | Keeps metadata and vectors together. Exact scoped distance queries are adequate for a small demo, but larger collections need measurement and indexing decisions. |
| Redis plus PostgreSQL | Avoid repeating reads and maintain expiring counters | Redis is disposable acceleration, not the authoritative data store. A small app could use only PostgreSQL/process memory; distributed cache invalidation adds complexity. |
| Clerk | Avoid building credential/session management | Provider handles authentication, backend handles application authorization. Dependency, quotas, account lifecycle and environment setup remain. |
| Cloudinary | Store/download images and PDFs outside the backend filesystem | Survives ephemeral hosting and supports delivery. External cleanup is asynchronous; URLs are not inherently private. |
| Direct Gemini HTTP calls | Add bounded classification, embeddings and generation | Pipeline is small enough for explicit functions. An orchestration framework could help a larger workflow, but is not required to call this RAG. |
| Serializable transactions | Preserve votes/pins/lifecycle under overlapping requests | Conflicts are retried; database constraints remain necessary. More contention/retries can increase latency. |
| One backend instance | Keep free demo operation understandable | Avoids distributed room/grant/job coordination. Horizontal scaling requires more than starting a second container. |

Explicit product rules include self-selected immutable roles, ownership-based management, no university intermediary and public-safe demo materials. Model/chunk/threshold values are tunable implementation choices; no benchmark proving optimal values is recorded.

## Security: identity is not permission

Authentication answers “who signed in?” Authorization answers “may this identity act on this resource?” Clerk token verification establishes the first. The application then checks saved role, owner ID or course enrollment. Hiding a button is not authorization.

Images attached to questions carry an upload receipt checked against user and URL. Upload middleware limits types/sizes and checks relevant ownership. Public demo file URLs can still be shared after an authorized user obtains them. Do not claim confidential file protection without a private delivery design.

## What actually makes an action slow?

Break the path into browser interaction, network, backend checks, database round trips, provider calls and reconciliation. Model moderation adds latency before publication by design. Pinning should not need Gemini, but can still wait on remote database reads/writes, cache invalidation and notification work.

Implemented mitigations include bundled reads, parallel independent reads, indexes, connection limits, action-specific pending states, selective optimistic updates, lazy page loading and caches. These reduce work or perceived delay. They do not remove inter-region database latency or a free backend cold start.

## Caches and stale data

[cacheHelper](../../backend/src/utils/cacheHelper.js) reads process memory, then Redis, then the underlying operation. TTL means time-to-live: entries expire instead of remaining valid forever. Concurrent reads for the same revision/key share a Promise. Cache writes happen without an extra wait for the caller where possible.

This is a one-process-oriented scheme. Local revision counters do not synchronize across replicas, and Redis reconnection does not by itself prove every local cache stayed consistent during an outage. Cache-aside correctness and bounded staleness remain tradeoffs; PostgreSQL is the source of truth.

## Failure policies differ intentionally

| Failure | Behaviour |
|---|---|
| Invalid/expired identity | Reject; do not trust browser profile data |
| Redis unavailable | Use bounded local cache/counters and reconnect in background |
| Moderation unavailable | Keep draft, block unchecked written submission |
| Duplicate hint unavailable | Allow normal submission path; moderation still required |
| Vault generation unavailable | Return retryable error; retrieved evidence can remain inspectable |
| PDF index interrupted | Mark failed on restart; teacher retries; old index may survive |
| Lecture deletion interrupted | Persisted job/lease permits retry and recovery |
| Cloudinary deletion fails | Persisted cleanup remains retryable; shared references checked |
| Missed socket events | Rejoin and fetch persisted state; not guaranteed event replay |
| Database unavailable | Return failure; never treat cache-only guessed writes as committed |

**Fail-open** means an optional step does not block the main flow, as with duplicate suggestions. **Fail-closed** means the operation is withheld without a successful check, as with written moderation. There is no universal fallback policy appropriate for every feature.

## Budgets and background recovery

[serviceLimits](../../backend/src/middleware/serviceLimits.js) sets shared per-user AI/recap requests to 20/hour, uploads to 20/hour, manual indexing to 6/hour and duplicate checks to 60/minute. Guarded AI/upload requests have per-user concurrency two and a combined per-process ceiling eight. Student submission cooldown is a separate mechanism. These are application budgets, not Google's provider quotas or a hard total bill ceiling.

Deletion jobs retry with an available time, bounded attempts and lease token. A lease prevents a stale worker from recording completion after another claim. Pruning is idempotent in recovery: remaining records can be deleted even after a crash between pruning and completion. Idempotency means repeating an operation does not repeat its effect incorrectly; it does not mean every HTTP endpoint in the application is idempotent.

Storage cleanup checks whether other records still reference an asset before destroying it. A classroom diagram saved into a vault must not disappear when its gallery entry is removed. Durable job state is different from `setImmediate`, which only schedules work in the current process.

## Tests: what they prove

| Evidence | Purpose and limits |
|---|---|
| [check.mjs](../../scripts/check.mjs) | Backend syntax, isolated tests, frontend cache tests, lint and build; no automatic deployed acceptance test |
| [access tests](../../backend/test/access.test.js) | Auth/ownership/role and related route behaviours with mocked dependencies |
| [AI tests](../../backend/test/ai.test.js) | Provider error handling, moderation/fallback, output validation and selected RAG behaviours; synthetic provider results are not quality benchmarks |
| [companion tests](../../backend/test/companion.test.js) | Context/history/response and companion-related logic |
| Lifecycle/PDF/runtime tests | Cleanup, index replacement, extraction support, origin validation and limits |
| [classroom verifier](../../backend/scripts/verifyClassroom.mjs) | Opt-in real database/socket scenarios with disposable fixtures and simulated identity/provider behaviour; it mutates fixtures and cleans them |
| [bootstrap verifier](../../backend/scripts/verifyBootstrap.mjs) | Opt-in schema/bootstrap checking; inspect targets before use |
| Manual two-account rehearsal | Real Clerk, device, storage and deployment integration; must be performed separately |

## Deployment and next improvements

The intended free demo uses Vercel, Render and existing Supabase/Redis/Cloudinary. Exact origins and matching frontend/backend Clerk instance keys matter. Backend secrets never belong in `VITE_` variables. Development auth, public-safe files, cold starts and provider quota are documented demo limits, not enterprise guarantees.

Before an interview, open the deployed site, verify a classroom and a PDF question, and have a screenshot/video explanation available if the free host/provider is unavailable. Do not present a recorded demo as proof the live service is healthy.

## Handbook verification record

On 16 November 2026, this documentation change was checked for local Markdown file/heading links, referenced source symbols, fenced-block balance, expected question count, secret patterns and Git whitespace errors. Mermaid diagrams were reviewed as source; GitHub rendering was not independently exercised. Application tests, load tests, deployed classroom flows and live provider calls were not rerun for this documentation-only change. Existing test coverage was inspected, not counted as a new pass.
