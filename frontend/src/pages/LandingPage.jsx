import Icon from '../components/common/Icon'
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { SignInButton, useAuth, useClerk } from '@clerk/clerk-react'
import './LandingPage.css'

const sectionLinks = [
  ['demo', 'Live Experience'], ['why', 'Why AskAnon'], ['features', 'Features'], ['faculty', 'For Faculty'], ['faq', 'FAQ']
]
const tagline = 'Same Classroom. More Questions.'

function centerLandingSection(hash, smooth = true) {
  const section = document.getElementById(hash.slice(1))
  if (!section) return
  const navHeight = document.querySelector('.editorial-nav')?.getBoundingClientRect().height || 0
  const rect = section.getBoundingClientRect()
  const available = window.innerHeight - navHeight
  // Center the section itself when it fits. For tall mobile sections, show its
  // heading and first content together rather than jumping into the middle.
  const top = window.scrollY + rect.top - navHeight - Math.max(0, (available - rect.height) / 2)
  window.scrollTo({ top: Math.max(0, top), behavior: smooth && !window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'smooth' : 'instant' })
  section.setAttribute('tabindex', '-1')
  section.focus({ preventScroll: true })
}

const capabilities = [
  { icon: 'upvote', title: 'Ask. Vote. Get heard.', text: 'Anonymous questions, shared doubts and answers from your lecturer.' },
  { icon: 'book', title: 'Ask your course PDFs.', text: 'Answers from your materials, with the exact passages to check.' },
  { icon: 'folder', title: 'Keep learning after class.', text: 'Lecture recaps, shared resources and your saved questions in one place.' }
]

export default function LandingPage() {
  const { isSignedIn, isLoaded } = useAuth()
  const { openSignIn } = useClerk()
  const navigate = useNavigate()

  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)

  // Interactive mock upvotes & tabs for the demo widget
  const [activeDemoTab, setActiveDemoTab] = useState('trending') // 'trending' | 'newest' | 'answered'
  const [demoInput, setDemoInput] = useState('')
  const [demoFeedback, setDemoFeedback] = useState('')

  const [trendingQuestions, setTrendingQuestions] = useState([
    { id: 1, text: "Why does Shortest Job First (SJF) cause starvation in non-preemptive systems?", votes: 38, hasUpvoted: false, tag: "OS / Scheduling", time: "5 min ago" },
    { id: 2, text: "Can you re-explain the difference between paging and segmentation with a memory diagram?", votes: 29, hasUpvoted: false, tag: "Memory Management", time: "11 min ago" },
    { id: 3, text: "Is Peterson's Algorithm guaranteed to work reliably on modern multi-core out-of-order CPUs?", votes: 19, hasUpvoted: false, tag: "Concurrency", time: "18 min ago" },
  ])

  const [newestQuestions, setNewestQuestions] = useState([
    { id: 101, text: "Will slide 24's Gantt chart calculation formula be required on the midterm?", votes: 2, hasUpvoted: false, tag: "Exam Scope", time: "Just now" },
    { id: 102, text: "Is time quantum T always chosen to be slightly larger than 80% of typical CPU burst durations?", votes: 5, hasUpvoted: false, tag: "Scheduling", time: "1 min ago" },
    { id: 103, text: "What happens to the ready queue when a process issues a blocking read() system call?", votes: 8, hasUpvoted: false, tag: "I/O Handling", time: "3 min ago" },
  ])

  const [answeredQuestions, setAnsweredQuestions] = useState([
    {
      id: 201,
      text: "In Round Robin scheduling, what happens if the time quantum Q approaches infinity?",
      votes: 42,
      hasUpvoted: false,
      tag: "Round Robin",
      time: "25 min ago",
      answer: "If Q approaches infinity, Round Robin scheduling becomes mathematically identical to First-Come, First-Served (FCFS) because every process runs to completion before preemption.",
      teacherName: "Dr. Sharma"
    },
    {
      id: 202,
      text: "Why does Shortest Job First (SJF) yield the provably minimal average waiting time?",
      votes: 35,
      hasUpvoted: false,
      tag: "Proof / Scheduling",
      time: "32 min ago",
      answer: "By moving a short process ahead of a long one, the decrease in waiting time for the short process strictly outweighs the increase for the long process, lowering the global arithmetic mean.",
      teacherName: "Dr. Sharma"
    }
  ])

  // FAQ Accordion state
  const [activeFaq, setActiveFaq] = useState(null)

  const handleUpvote = (id) => {
    const updateList = (list) =>
      list.map((q) => {
        if (q.id === id) {
          return {
            ...q,
            votes: q.hasUpvoted ? q.votes - 1 : q.votes + 1,
            hasUpvoted: !q.hasUpvoted,
          }
        }
        return q
      })

    if (activeDemoTab === 'trending') setTrendingQuestions(updateList)
    else if (activeDemoTab === 'newest') setNewestQuestions(updateList)
    else setAnsweredQuestions(updateList)
  }

  const handleDemoSubmit = (e) => {
    e.preventDefault()
    if (!demoInput.trim()) return
    const newQ = {
      id: Date.now(),
      text: demoInput.trim(),
      votes: 1,
      hasUpvoted: true,
      tag: "Live Room",
      time: "Just now"
    }
    setNewestQuestions(prev => [newQ, ...prev])
    setTrendingQuestions(prev => [newQ, ...prev])
    setDemoInput('')
    setActiveDemoTab('newest')
    setDemoFeedback('✓ Anonymous doubt posted to the demo lecture feed!')
    setTimeout(() => setDemoFeedback(''), 3500)
  }

  const currentDemoQuestions =
    activeDemoTab === 'trending' ? trendingQuestions :
    activeDemoTab === 'newest' ? newestQuestions : answeredQuestions

  const faqs = [
    { q: 'How does a lecture work?', a: 'The instructor creates a room and shares a six-character code. Signed-in students join, ask questions and vote. The instructor can pin a question, answer in writing, share a diagram or run a poll.' },
    { q: 'Are my questions anonymous?', a: 'Classroom question cards omit your name and email. You still sign in for course access, saved doubts and voting. Anonymity in the classroom feed does not mean accounts are untraceable.' },
    { q: 'Do I need an account?', a: 'Yes. Sign in before joining a lecture. Joining a course-linked room also gives you access to that course vault; there is no separate university registration process.' },
    { q: 'How are inappropriate questions handled?', a: 'Local filters and contextual text checks reject abusive or clearly unrelated submissions with a reason. If checks are unavailable, the draft is kept for retry. Instructors can also dismiss questions and pause intake. Images are not automatically moderated.' },
    { q: 'What does the course AI actually do?', a: 'It searches the course PDFs for passages relevant to your question, then explains them with source references. You can also generate a revision sheet or practice questions. Answers depend on the material; generated practice is not an exam prediction.' },
    { q: 'What remains after class?', a: 'The lecture becomes a read-only recap with discussion, written answers, polls and shared resources. Course materials and saved doubts stay available within their access rules until their owner removes them.' }
  ]
  useEffect(() => {
    let cancelled = false
    const align = () => { if (!cancelled && window.location.hash) centerLandingSection(window.location.hash, false) }
    Promise.all([document.fonts.ready, ...[...document.images].map(img => img.decode?.().catch(() => {}))]).then(align)
    window.addEventListener('hashchange', align)
    return () => { cancelled = true; window.removeEventListener('hashchange', align) }
  }, [])
  const handleSectionLink = event => {
    const link = event.target.closest('a[href^="#"]')
    const hash = link?.getAttribute('href')
    if (!hash || hash.length < 2 || !document.getElementById(hash.slice(1))) return
    event.preventDefault()
    setIsMobileMenuOpen(false)
    window.history.replaceState(window.history.state, '', hash)
    requestAnimationFrame(() => requestAnimationFrame(() => centerLandingSection(hash)))
  }

  return (
    <div className="landing-editorial" onClick={handleSectionLink}>
      {/* ── 1. NAVIGATION BAR ── */}
      <nav className="editorial-nav">
        <div className="nav-left">
          <a href="/" className="nav-brand">
            <span className="brand-badge">/A</span>
            <span className="brand-name">AskAnon</span>
          </a>
          <span className="nav-tagline">{tagline}</span>
        </div>

        <div className="nav-center">
          {sectionLinks.map(([id, label]) => <a key={id} href={`#${id}`} className="nav-link">{label}</a>)}
        </div>

        <div className="nav-right">
          <div className="nav-desktop-auth">
            {isSignedIn ? (
              <button className="btn btn-ghost btn-sm" onClick={() => navigate('/dashboard')}>
                Dashboard →
              </button>
            ) : (
              <div className="nav-auth-group">
                <SignInButton mode="modal">
                  <button disabled={!isLoaded} className="btn btn-ghost btn-sm">Sign In</button>
                </SignInButton>
              </div>
            )}
          </div>
          <button
            className={`hamburger-btn ${isMobileMenuOpen ? 'open' : ''}`}
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            aria-label="Toggle mobile menu"
          >
            <span className="hamburger-line"></span>
            <span className="hamburger-line"></span>
          </button>
        </div>
      </nav>

      {/* Mobile Menu Overlay */}
      <div className={`mobile-menu-overlay ${isMobileMenuOpen ? 'open' : ''}`}>
        <div className="mobile-menu-content">
          {sectionLinks.map(([id, label]) => <a key={id} href={`#${id}`} className="mobile-nav-link">{label}</a>)}

          <div className="mobile-menu-auth">
            {isSignedIn ? (
              <button className="btn btn-primary btn-lg w-100" onClick={() => navigate('/dashboard')}>
                Dashboard →
              </button>
            ) : (
              <>
                <SignInButton mode="modal">
                  <button disabled={!isLoaded} className="btn btn-ghost btn-lg w-100">Sign In</button>
                </SignInButton>
              </>
            )}
          </div>
        </div>
      </div>

      {/* ── 2. HERO SECTION (2-COLUMN EDITORIAL) ── */}
      <header className="editorial-hero">
        <div className="hero-grid">
          {/* Left: Typography & Value Proposition */}
          <div className="hero-content">
            <div className="hero-eyebrow">
              <span className="eyebrow-pill">REAL CLASSROOMS</span>
              <span className="eyebrow-separator">/</span>
              <span className="eyebrow-pill">REAL QUESTIONS</span>
            </div>

            <h1 className="hero-title">Same Classroom.<br /><em>More Questions.</em></h1>

            <p className="hero-description">Ask without hesitation. Let the class vote on what matters, and keep the answers and course materials close.</p>

            <div className="hero-actions">
              {isSignedIn ? (
                <button className="btn btn-primary btn-lg" onClick={() => navigate('/dashboard')}>
                  Go to Dashboard →
                </button>
              ) : (
                <>
                  <button className="btn btn-primary btn-lg" disabled={!isLoaded} onClick={() => isSignedIn ? navigate('/dashboard') : openSignIn()}>
                    Get Started →
                  </button>
                  <a href="#demo" className="btn btn-ghost btn-lg">
                    See Live Demo ↓
                  </a>
                </>
              )}
            </div>
          </div>

          {/* Right: Architectural Photograph with Floating Card */}
          <div className="hero-media-wrapper">
            <div className="media-frame">
              <img
                src="/classroom.jpg"
                alt="Classic university lecture hall with afternoon light streaming through windows"
                className="hero-image" width="1200" height="900" decoding="async"
              />

              <div className="media-overlay-card"><p className="overlay-quote">Same Classroom.<br />More Questions.</p><span className="overlay-signature">AskAnon</span></div>
            </div>
          </div>
        </div>

        {/* ── 3. FOUR-PILLAR EDITORIAL METHODOLOGY STRIP ── */}

        <div className="methodology-strip">{[
          ['01', 'Ask', 'Share a doubt without your name on the classroom card.'],
          ['02', 'Prioritize', 'Vote for the questions you want answered.'],
          ['03', 'Understand', 'Follow explanations, diagrams and live polls.'],
          ['04', 'Revisit', 'Return to your notes, answers and course PDFs.']
        ].map(([number, title, text]) => <div className="method-col" key={number}><span className="method-num">{number}</span><h3 className="method-heading">{title}</h3><p className="method-text">{text}</p></div>)}</div>

      </header>

      {/* ── 4. INTERACTIVE LIVE SIMULATION / DEMO ── */}
      <section id="demo" className="section-container demo-section">
        <div className="section-header"><span className="section-tag">TRY A SAMPLE ROOM</span><h2 className="section-title">Try a live classroom</h2><p className="section-subtitle">Ask a sample question. Vote on another. See the answer.</p></div>

        <div className="interactive-demo-card">
          {/* Mock Lecture Room Header */}
          <div className="demo-room-topbar">
            <div className="demo-course-info">
              <span className="demo-live-dot">● LIVE</span>
              <span className="demo-breadcrumb">Operating Systems / CS301 &gt; Lecture 12: CPU Scheduling</span>
            </div>
            <div className="demo-meta-badges">
              <span className="badge badge-crimson">Interactive preview</span>
              <span className="badge badge-ghost">Code: #CS3A01</span>
            </div>
          </div>

          {/* Interactive Questions Stream */}
          <div className="demo-stream">
            <div className="stream-header-tabs">
              <button
                className={`stream-tab ${activeDemoTab === 'trending' ? 'active' : ''}`}
                onClick={() => setActiveDemoTab('trending')}
              >
                Top voted
              </button>
              <button
                className={`stream-tab ${activeDemoTab === 'newest' ? 'active' : ''}`}
                onClick={() => setActiveDemoTab('newest')}
              >
                Newest ({newestQuestions.length})
              </button>
              <button
                className={`stream-tab ${activeDemoTab === 'answered' ? 'active' : ''}`}
                onClick={() => setActiveDemoTab('answered')}
              >
                Answered ({answeredQuestions.length})
              </button>
            </div>

            <div className="demo-questions-list">
              {currentDemoQuestions.slice(0, 3).map((q) => (
                <div key={q.id} className={`demo-q-card ${q.hasUpvoted ? 'is-upvoted' : ''}`}>
                  <button
                    className={`demo-upvote-btn ${q.hasUpvoted ? 'active' : ''}`}
                    onClick={() => handleUpvote(q.id)}
                    title="Upvote this question"
                  >
                    <span className="upvote-arrow">▲</span>
                    <span className="upvote-count">{q.votes}</span>
                  </button>

                  <div className="demo-q-body">
                    <p className="demo-q-text">{q.text}</p>

                    {/* Faculty Answer Box (shown on answered questions) */}
                    {q.answer && (
                      <div className="demo-answer-box">
                        <div className="demo-answer-header">
                          <span className="demo-answer-tag">✓ Verified Faculty Answer</span>
                          <span className="demo-answer-author">{q.teacherName || 'Prof. Sharma'}</span>
                        </div>
                        <p className="demo-answer-text">{q.answer}</p>
                      </div>
                    )}

                    <div className="demo-q-footer">
                      <span className="demo-q-tag">{q.tag}</span>
                      <span className="demo-q-author">Anonymous Student · {q.time}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Interactive Demo Post Dock */}
            <form className="demo-ask-dock" onSubmit={handleDemoSubmit}>
              <input
                type="text"
                className="demo-dock-input"
                placeholder="Ask an anonymous doubt to Dr. Sharma... (press Enter to post)"
                value={demoInput}
                onChange={(e) => setDemoInput(e.target.value)}
              />
              <button
                type="submit"
                className="btn btn-primary btn-sm demo-ask-btn"
                disabled={!demoInput.trim()}
              >
                <span className="ask-text-full">Ask Anonymously</span>
                <span className="ask-text-short">Send</span>
                <span className="ask-icon">→</span>
              </button>
            </form>

            {demoFeedback && (
              <div className="demo-feedback-banner">
                {demoFeedback}
              </div>
            )}
          </div>
        </div>
      </section>

      {/* ── 5. THE PROBLEM VS. THE ASKANON PARADIGM ── */}
      <section id="why" className="section-container comparison-section">
        <div className="section-header"><span className="section-tag">WHY ASKANON</span><h2 className="section-title">A doubt shared is a doubt answered.</h2></div>
        <div className="comparison-grid">
          <div className="comparison-card traditional"><div className="card-badge-status status-bad">THE TRADITIONAL LECTURE</div><h3 className="comparison-card-title">A raised hand. Or silence.</h3><ul className="comparison-list"><li>Some questions never get asked aloud.</li><li>Shared doubts are difficult to see.</li><li>Useful explanations get lost after class.</li></ul></div>
          <div className="comparison-card modern"><div className="card-badge-status status-good">THE ASKANON CLASSROOM</div><h3 className="comparison-card-title">Every doubt has a place.</h3><ul className="comparison-list"><li>Ask without your name on display.</li><li>Let votes surface the class's priorities.</li><li>Keep answers and materials for revision.</li></ul></div>
        </div>
      </section>

      {/* ── 6. PLATFORM CAPABILITIES & ARCHITECTURE ── */}
      <section id="features" className="section-container features-section">
        <div className="section-header"><span className="section-tag">THE TOOLKIT</span><h2 className="section-title">During class. After class.</h2></div>

        <div className="features-grid">{capabilities.map(feature => <article className="feature-card" key={feature.title}><div className="feature-icon"><Icon name={feature.icon} /></div><h3 className="feature-title">{feature.title}</h3><p className="feature-desc">{feature.text}</p></article>)}</div>
      </section>

      {/* ── 7. FOR FACULTY & INSTRUCTORS ── */}
      <section id="faculty" className="section-container faculty-section">
        <div className="faculty-box">
          <div className="faculty-content">
            <span className="section-tag" style={{ color: 'var(--status-emerald)' }}>FOR LECTURERS</span>
            <h2 className="faculty-title">Teach from one live view.</h2>
            <p className="faculty-text">
              Create a room. Share the code. Answer the questions that matter most.
            </p>
          </div>
          <div className="faculty-metric-grid"><div className="metric-cell"><span className="metric-number">Live</span><span className="metric-label">Questions and votes during class</span></div><div className="metric-cell"><span className="metric-number">One code</span><span className="metric-label">A simple way into your lecture</span></div><div className="metric-cell"><span className="metric-number">After class</span><span className="metric-label">Answers and resources to revisit</span></div></div>
        </div>
      </section>

      {/* ── 8. FREQUENTLY ASKED QUESTIONS (ACCORDION) ── */}
      <section id="faq" className="section-container faq-section">
        <div className="section-header"><span className="section-tag">FAQ</span><h2 className="section-title">A few things to know.</h2></div>

        <div className="faq-accordion">
          {faqs.map((faq, index) => {
            const isOpen = activeFaq === index
            return (
              <div
                key={index}
                className={`faq-item ${isOpen ? 'open' : ''}`}
              >
                <button type="button" className="faq-question" aria-expanded={isOpen} aria-controls={`faq-answer-${index}`} onClick={() => setActiveFaq(isOpen ? null : index)}>
                  <span>{faq.q}</span>
                  <span className="faq-toggle-icon" aria-hidden="true">{isOpen ? '-' : '+'}</span>
                </button>
                {isOpen && (
                  <div className="faq-answer" id={`faq-answer-${index}`}>
                    <p>{faq.a}</p>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </section>

      {/* ── 9. PRESTIGE EDITORIAL BANNER & FOOTER ── */}
      <footer className="editorial-footer">
        <div className="footer-quote-banner">
          <p className="footer-quote">{tagline}</p>
          <div className="footer-cta-row">
            <button className="btn btn-primary btn-lg" disabled={!isLoaded} onClick={() => isSignedIn ? navigate('/dashboard') : openSignIn()}>
              {isSignedIn ? 'Go to Dashboard →' : 'Get Started →'}
            </button>
          </div>
        </div>

        <div className="footer-bottom-bar">
          <div className="footer-brand">
            <span className="brand-badge">/A</span>
            <span className="brand-name">AskAnon</span>
            <span className="footer-credit">Crafted by <a href="https://github.com/vanshambansal" target="_blank" rel="noopener noreferrer">Vansham Bansal</a></span>
          </div>

          <div className="footer-links">
            {sectionLinks.map(([id, label]) => <a key={id} href={`#${id}`}>{label}</a>)}
          </div>
        </div>
      </footer>
    </div>
  )
}
