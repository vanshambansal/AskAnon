# Explaining AskAnon's AI in an interview

AskAnon helps students ask questions during a lecture and revise afterward. AI has two specific jobs, rather than being a generic chat widget.

## 1. Keep the live discussion useful

Before publishing a question, a local profanity check and a short Gemini classification assess abusive language and clear irrelevance to the lecture. Rejected text stays in the author's draft and is not published. If checking is unavailable, submission is retryable. Separately, embeddings represent questions numerically; cosine similarity suggests an existing question so the student can upvote it instead of repeating it. Accepted-question embeddings are cached in Redis, with bounded memory fallback. This is probabilistic assistance: unrelated-looking prerequisite questions must be allowed, and teachers can dismiss published questions.

## 2. Revision grounded in course PDFs — RAG

1. The teacher uploads a PDF. Cloudinary stores the original; PostgreSQL stores ownership and indexing state.
2. The backend extracts native text page by page, transcribes unreadable scanned pages when needed, and splits it into roughly 1,200-character chunks. Each chunk retains its material ID and page number.
3. Gemini's embedding model converts each chunk to a 768-number vector. PostgreSQL's pgvector extension stores vectors beside chunk text. Index replacement is atomic.
4. For a student's topic question, embed the question and retrieve nearby vectors only from that student's accessible course/material scope.
5. Give Gemini the retrieved text plus the question, instructing it to answer from those excerpts and admit when they are insufficient.
6. Show the answer with source material and page links. This is retrieval-augmented generation: retrieval supplies evidence; the model writes the explanation. It is not model training.

Overview, revision sheets and generated practice questions use sampled first/middle/last excerpts across the selected PDFs rather than claiming exhaustive document coverage. This makes a useful classroom revision assistant: students can explain a topic or practise from the same materials used in lectures.

Successful results and embeddings are cached; errors are not treated as answers. Access control applies before retrieval. Scanned PDF pages can be transcribed by Gemini before chunking (up to 12 scanned pages per file, with a bounded document deadline). Classroom image attachments are not automatically moderated, and generated answers are not guaranteed hallucination-free. Stored sources let a student check the explanation.

## A short demo

Create a course and lecture, join from another account, post a real academic question, try a paraphrase, then try an obviously unrelated question and show that it is rejected without reaching the class feed. Upload a short text PDF and wait for Ready. Open Ask your PDFs, select the document, ask a question and expand View retrieved passages. Open its source PDF at the cited page. End the lecture and show the recap.

## Honest résumé wording

Built a real-time classroom Q&A application with React, Express, Socket.io and PostgreSQL; implemented Gemini-assisted moderation and semantic duplicate suggestions, plus a pgvector-backed PDF revision assistant with page-level sources, access-controlled retrieval and Redis caching.

Be ready to discuss limitations and trade-offs. We tested real examples and regression scenarios, but have not established a large labelled accuracy benchmark or deployed a production-scale multi-instance system.

## Focused next AI features (proposals, not implemented claims)

- **Evidence beside a live doubt:** retrieve a course PDF passage related to the question; show the page and an optional grounded draft answer to the instructor. Keep the instructor in control of publication. This connects retrieval to the live classroom workflow.
- **Confusion clusters:** group similar unanswered questions using embeddings and show cluster size, representative questions and relevant resource pages. Evaluate whether teachers find the groups coherent; do not label invented classifications as measured learning outcomes.
- **Lecture-based practice:** retrieve material for the lecture's actual unresolved questions and generate a small cited practice set. Its value comes from classroom context and source grounding, not generic quiz generation.

My recommended priority is evidence beside a live doubt, followed by confusion clusters. Keep vault Q&A as the primary AI action; generic summaries should remain optional. Retrieval hit quality, citation support and duplicate precision should be evaluated with a small labelled dataset before claiming accuracy figures on a résumé.


The complete current pipeline, database inspection commands, flowchart and verified provider-failure explanation are in [ASKANON_AI_ARCHITECTURE.md](AI_ARCHITECTURE.md). The task dropdown has been replaced by a question-first interface.


The companion now uses the last three exchanges for follow-up context, retrieves neighboring passages, offers specific next questions and generates practice with hidden worked answers. Detailed answers grow with the available evidence; no fixed length is guaranteed. Conversation is held in the current page and clears when the document scope changes.
