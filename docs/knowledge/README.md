# AskAnon knowledge handbook

Start here to understand the project, explain its code and prepare for interviews. This is a guide to the checked-in implementation, not a promise that every external service is currently available.

## Reading paths

| Your goal | Read |
|---|---|
| Understand the product and architecture | [Project and architecture](01-PROJECT-AND-ARCHITECTURE.md) |
| Explain the code and database | [Code and database](02-CODE-AND-DATABASE.md) |
| Trace an action through the application | [Feature implementation](03-HOW-FEATURES-WORK.md) |
| Learn and explain RAG from the beginning | [AI and RAG](04-AI-AND-RAG-EXPLAINED.md) |
| Defend decisions and discuss failures | [Decisions and reliability](05-DECISIONS-AND-RELIABILITY.md) |
| Practise spoken answers and a demo | [Interview preparation](06-INTERVIEW-PREPARATION.md) |
| Brief another developer or AI | [Copyable master context](07-MASTER-CONTEXT.md) |

For a 30-minute revision, read the product pitch, the architecture diagram, the question and RAG flows, then answer interview questions 1, 4, 10, 18, 24, 27, 32 and 40 aloud. That is revision, not a substitute for learning the implementation.

## How to use this handbook

## Evidence and currency

Source audit: **16 November 2026**. Facts describe the repository at this review, not necessarily the commit currently running on Render. No provider calls, production-data mutations or live classroom acceptance tests are part of this documentation task. Historical test results elsewhere are dated evidence, not current verification.

| Area | Evidence available | What still requires a live check |
|---|---|---|
| Roles, ownership, enrollment | Routes, access middleware, isolated access tests | Current Clerk configuration and two-account deployed flow |
| Live controls and votes | Socket handlers, transactions, classroom tests | Deployed reconnects, cross-device delivery and latency |
| PDF ingestion and RAG | End-to-end code paths, AI/companion/PDF tests | Current storage delivery, model availability and real PDF quality |
| Recovery and deletion | Persisted jobs, reference checks, lifecycle tests | Hosting restarts, external deletion and resource limits |
| Free hosted demo | Vercel configuration, environment validation, deployment guide | Current hosting settings, quotas and deployed commit |

Code inspection verifies implementation exists. Mocked tests verify selected behaviour under controlled conditions. Neither proves all production paths work. See the verification record in the reliability chapter for checks actually performed for this handbook.

## Before an interview

You should be able to:

- Explain who uses AskAnon and why course vaults belong in it.
- Locate frontend/backend entry points, an ownership check and a socket handler.
- Trace a question, a vote and a PDF answer end to end.
- Explain embeddings without confusing them with generated answers.
- State what anonymity means in the actual schema.
- Discuss one limitation and a realistic next improvement without claiming it exists.

## Maintaining the reference

Operational instructions remain in [local setup](../LOCAL_SETUP.md) and [deployment](../DEPLOYMENT.md). [Historical records](../history/) explain earlier work but may describe removed workflows. This handbook takes its technical facts from current code.
