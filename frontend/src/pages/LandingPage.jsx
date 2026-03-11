import { useNavigate } from 'react-router-dom'
import { SignInButton, SignUpButton, useAuth } from '@clerk/clerk-react'
import { useEffect, useRef } from 'react'
import './LandingPage.css'

export default function LandingPage() {
  const { isSignedIn } = useAuth()
  const navigate = useNavigate()
  const heroRef = useRef(null)

//   useEffect(() => {
//     if (isSignedIn) navigate('/dashboard')
//   }, [isSignedIn])

  return (
    <div className="landing">
      {/* ANIMATED GRID */}
      <div className="landing-grid" aria-hidden />
      {/* GLOW ORB */}
      <div className="glow-orb" aria-hidden />

      {/* NAV */}
      <nav className="landing-nav fade-in">
        <div className="nav-logo">
          <span className="logo-mark">AQ</span>
          <span className="logo-text">AskAnon</span>
        </div>
        <div className="nav-actions">
        {isSignedIn ? (
            <button className="btn btn-primary btn-sm" onClick={() => navigate('/dashboard')}>
            Go to Dashboard →
            </button>
        ) : (
            <>
            <SignInButton mode="modal">
                <button className="btn btn-ghost btn-sm">Sign in</button>
            </SignInButton>
            <SignUpButton mode="modal">
                <button className="btn btn-primary btn-sm">Get started →</button>
            </SignUpButton>
            </>
        )}
        </div>
      </nav>

      {/* HERO */}
      <main className="landing-hero" ref={heroRef}>
        <div className="hero-tag fade-up" style={{ animationDelay: '0.05s' }}>
          <span className="live-dot" />
          Real-time anonymous Q&A — built for classrooms
        </div>

        <h1 className="hero-title fade-up" style={{ animationDelay: '0.15s' }}>
          Ask freely,<br />
          <em>learn fearlessly.</em>
        </h1>

        <p className="hero-sub fade-up" style={{ animationDelay: '0.25s' }}>
          70% of students never raise their hand in class.<br />
          AskAnon changes that — completely anonymous, instantly delivered.
        </p>

        <div className="hero-cta fade-up" style={{ animationDelay: '0.32s' }}>
          {isSignedIn ? (
            <button className="btn btn-primary btn-lg" onClick={() => navigate('/dashboard')}>
              Go to Dashboard →
            </button>
          ) : (
            <>
              <SignUpButton mode="modal">
                <button className="btn btn-primary btn-lg">Create a session →</button>
              </SignUpButton>
              <SignInButton mode="modal">
                <button className="btn btn-ghost btn-lg">Sign in</button>
              </SignInButton>
            </>
          )}
        </div>

        {/* FLOATING MOCK QUESTIONS */}
        <div className="mock-window fade-up" style={{ animationDelay: '0.42s' }}>
          <div className="mock-header">
            <span className="mock-dot red" /><span className="mock-dot yellow" /><span className="mock-dot green" />
            <span className="mock-title">DSA Lecture 5 — Trees</span>
            <span className="badge badge-green" style={{ marginLeft: 'auto' }}>● Live</span>
          </div>
          <div className="mock-questions">
            {[
              { text: 'Can you explain the difference between BFS and DFS again?', votes: 12, new: true },
              { text: 'Why do we use recursion for tree traversal specifically?', votes: 8 },
              { text: 'The time complexity part was confusing — can you slow down?', votes: 5 },
            ].map((q, i) => (
              <div key={i} className={`mock-q ${q.new ? 'mock-q-new' : ''}`} style={{ animationDelay: `${0.5 + i * 0.12}s` }}>
                <div className="mock-upvote">
                  <span>▲</span>
                  <span>{q.votes}</span>
                </div>
                <span className="mock-q-text">{q.text}</span>
                {q.new && <span className="mock-new-badge">new</span>}
              </div>
            ))}
          </div>
        </div>
      </main>

      {/* QUOTE STRIP */}
      <div className="quote-strip fade-up" style={{ animationDelay: '0.5s' }}>
        <span className="quote-mark-lg">"</span>
        <p>The question you're afraid to ask is the one everyone else wants answered.</p>
        <span className="quote-mark-lg">"</span>
      </div>

      {/* HOW IT WORKS */}
      <section className="how-section">
        <p className="section-label fade-up">How it works</p>
        <div className="how-steps">
          {[
            { n: '01', icon: '🎓', title: 'Teacher creates a session', desc: 'Get a unique 6-digit code to share with your class on the projector.' },
            { n: '02', icon: '📱', title: 'Students join instantly',   desc: 'Enter the code — no signup, no name shown. Completely anonymous.' },
            { n: '03', icon: '⚡', title: 'Questions flow live',       desc: 'Upvote what matters. Teacher sees the most important questions first.' },
          ].map((s, i) => (
            <div key={s.n} className="how-step fade-up" style={{ animationDelay: `${0.1 * i}s` }}>
              <div className="step-icon-wrap">
                <span className="step-icon">{s.icon}</span>
                <span className="step-n">{s.n}</span>
              </div>
              <h3>{s.title}</h3>
              <p>{s.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* STATS */}
      <section className="stats-section fade-up">
        {[
          { n: '70%',  label: 'students never ask in class' },
          { n: '< 1s', label: 'question delivery time' },
          { n: '0',    label: 'names ever revealed' },
          { n: '∞',    label: 'questions per session' },
        ].map(s => (
          <div key={s.n} className="stat-box">
            <span className="stat-n">{s.n}</span>
            <span className="stat-label">{s.label}</span>
          </div>
        ))}
      </section>

      {/* FEATURES */}
      <section className="features-section">
        {[
          { icon: '⚡', title: 'Real-time',     desc: 'WebSocket powered. Questions appear instantly on every screen.' },
          { icon: '🎭', title: 'Anonymous',     desc: 'No names, no judgment. Students finally feel safe asking.' },
          { icon: '🗳️', title: 'Vote system',   desc: 'Most wanted questions bubble up to the top automatically.' },
          { icon: '🔒', title: 'Chitkara only', desc: 'Restricted to @chitkara.edu.in — your campus, your classroom.' },
        ].map(f => (
          <div key={f.title} className="feature-card">
            <span className="feature-icon">{f.icon}</span>
            <h3>{f.title}</h3>
            <p>{f.desc}</p>
          </div>
        ))}
      </section>

      {/* CTA BANNER */}
      <section className="cta-banner fade-up">
        <div className="cta-content">
          <h2>Ready to make your classroom fearless?</h2>
          <p>Start your first session in under 30 seconds.</p>
          <SignUpButton mode="modal">
            <button className="btn btn-primary btn-lg">Get started for free →</button>
          </SignUpButton>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="landing-footer">
        <div className="footer-logo">
          <span className="logo-mark" style={{ width: 26, height: 26, fontSize: 9 }}>AQ</span>
          <span style={{ fontSize: 14, fontWeight: 700 }}>AskAnon</span>
        </div>
        <div className="footer-links">
          <span>Ask freely, learn fearlessly</span>
          <span className="footer-dot">·</span>
          <span>Chitkara University</span>
          <span className="footer-dot">·</span>
          <span>© 2026</span>
        </div>
      </footer>
    </div>
  )
}