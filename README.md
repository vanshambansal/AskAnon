# AskAnon

**Same Classroom. More Questions.**

A real-time classroom Q&A and course-material study companion. There is no university administrator or institution hierarchy.

## Workflow

1. Sign up and choose **Student** or **Teacher** once. Existing accounts keep their saved role; there is no role-switch toggle.
2. Teachers create lectures, optionally linked to a course, and share a six-character code.
3. Students sign in and join by code. Joining a course-linked live lecture enrolls them in its course vault.
4. A standalone lecture starts without a course. Its first resource upload or diagram saved to the vault creates/reuses the teacher's general vault and links that lecture.
5. Questions, votes, written answers, diagrams and polls update live. Ended lectures have read-only recaps.
6. Students revisit PDFs, save useful doubts and ask the course companion questions grounded in retrieved source passages.

Teacher is a self-selected hosting role, not a claim of university verification. Every management action still checks ownership. Questions hide names in classroom cards; accounts and vote associations still exist.

## Stack

React 19 / Vite / custom CSS, Clerk, Express 5, Socket.io, Prisma 6.19.3, PostgreSQL + pgvector, optional Redis, Cloudinary and Gemini.

The companion supports page-level PDF extraction, bounded scanned-page transcription, 768-dimensional embeddings, scoped retrieval with neighboring passages, short conversation context, follow-up suggestions and practice with revealable answers. Sources remain inspectable. AI output can be wrong or unavailable.

## Local setup

See [local setup](docs/LOCAL_SETUP.md). Keep your existing local `.env` files; only placeholder `.env.example` files belong in Git.

```powershell
cd backend
npm ci
npx prisma generate
cd ../frontend
npm ci
cd ..
npm --prefix backend start
# In another terminal:
npm --prefix frontend run dev
```

Open http://localhost:5173. Use the API URL matching your backend in `frontend/.env`.

## Checks

```powershell
node scripts/check.mjs
```

Includes backend syntax and isolated authorization/lifecycle/AI tests, frontend cache tests, lint and build. Opt-in real database/Socket.io and schema-bootstrap rehearsals are documented in the setup guide; they are not run against production automatically.

## Deployment and documentation

- [Documentation index](docs/README.md)
- [Simple deployment guide and known limits](docs/DEPLOYMENT.md)
- [AI architecture, flowchart and index inspection](docs/AI_ARCHITECTURE.md)
- [Interview walkthrough](docs/AI_WALKTHROUGH.md)
- [Changelog](CHANGELOG.md)
- [Historical development and acceptance log](docs/history/COMPLETION_LOG.md)

Deploy the frontend statically and run one persistent backend process for sockets and background workers. The database region, provider accounts and live deployment are configured separately; see the deployment checklist. Backups are not considered complete until a restore has been tested.

Crafted by [Vansham Bansal](https://github.com/vanshambansal).
