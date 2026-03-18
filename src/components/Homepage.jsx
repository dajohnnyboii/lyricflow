import { initiateLogin } from '../spotify'

const FEATURES = [
  {
    icon: (
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M9 18V5l12-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="18" cy="16" r="3" />
      </svg>
    ),
    title: 'Real-Time Sync',
    desc: 'Lyrics perfectly synced to every beat, word by word as you listen.',
  },
  {
    icon: (
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10" /><path d="M2 12h20" /><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
      </svg>
    ),
    title: 'Translations',
    desc: 'Instantly translate lyrics to 40+ languages while you listen.',
    premium: true,
  },
  {
    icon: (
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="8.5" cy="8.5" r="1.5" /><path d="m21 15-5-5L5 21" />
      </svg>
    ),
    title: 'Lyric Cards',
    desc: 'Export beautiful lyric cards for Instagram, TikTok and more.',
    premium: true,
  },
  {
    icon: (
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" />
      </svg>
    ),
    title: 'Themes & Vibes',
    desc: 'Dark, neon, glass and more. Dynamic colors from album art.',
  },
]

const PRICING = [
  {
    name: 'Free',
    price: '0',
    period: 'forever',
    features: ['Real-time synced lyrics', '3 beautiful themes', 'Dynamic album colors', 'Focus mode'],
    cta: 'Get Started',
    highlight: false,
  },
  {
    name: 'Pro',
    price: '4.99',
    period: '/month',
    features: [
      'Everything in Free',
      'Instant translations (40+ langs)',
      'Export lyric cards & videos',
      'Custom themes & animations',
      'Offline lyric caching',
      'No watermarks on exports',
    ],
    cta: 'Start Free Trial',
    highlight: true,
  },
  {
    name: 'Lifetime',
    price: '29.99',
    period: 'one-time',
    features: ['Everything in Pro', 'All future features', 'Priority support', 'Early access to new themes'],
    cta: 'Buy Once',
    highlight: false,
  },
]

export default function Homepage() {
  return (
    <div className="homepage">
      {/* Hero */}
      <section className="hero">
        <nav className="hero-nav">
          <div className="hero-logo">
            <div className="logo-icon">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                <path d="M6 9Q12 6 18 8M5 13Q12 10 19 12M7 17Q12 14 17 16" stroke="white" strokeWidth="2" strokeLinecap="round"/>
              </svg>
            </div>
            <span>LyricFlow</span>
          </div>
          <div className="hero-nav-links">
            <a href="#features">Features</a>
            <a href="#pricing">Pricing</a>
            <button className="nav-cta" onClick={() => initiateLogin()}>Open App</button>
          </div>
        </nav>

        <div className="hero-glow" />
        <div className="hero-glow hero-glow-2" />

        <div className="hero-content">
          <div className="hero-badge">Powered by Spotify</div>
          <h1 className="hero-title">
            Feel every<br />
            <span className="hero-gradient">word.</span>
          </h1>
          <p className="hero-subtitle">
            Real-time synced lyrics with stunning visuals.
            The most beautiful way to experience your music.
          </p>
          <div className="hero-actions">
            <button className="btn-primary" onClick={() => initiateLogin()}>
              <svg viewBox="0 0 24 24" width="20" height="20" fill="white">
                <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z"/>
              </svg>
              Connect with Spotify
            </button>
            <a href="#features" className="btn-secondary">Learn More</a>
          </div>

          <div className="hero-preview">
            <div className="preview-mockup">
              <div className="mockup-line mockup-dim">And I know when that hotline bling</div>
              <div className="mockup-line mockup-dim-2">That can only mean one thing</div>
              <div className="mockup-line mockup-active">I know when that hotline bling</div>
              <div className="mockup-line mockup-dim-2">That can only mean one thing</div>
              <div className="mockup-line mockup-dim">Ever since I left the city you</div>
            </div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="features-section" id="features">
        <div className="section-inner">
          <p className="section-label">Features</p>
          <h2 className="section-title">Everything you need.<br />Nothing you don't.</h2>
          <div className="features-grid">
            {FEATURES.map((f, i) => (
              <div className="feature-card" key={i}>
                <div className="feature-icon">{f.icon}</div>
                <h3>
                  {f.title}
                  {f.premium && <span className="pro-badge">PRO</span>}
                </h3>
                <p>{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section className="pricing-section" id="pricing">
        <div className="section-inner">
          <p className="section-label">Pricing</p>
          <h2 className="section-title">Simple, transparent pricing.</h2>
          <div className="pricing-grid">
            {PRICING.map((plan, i) => (
              <div className={`pricing-card${plan.highlight ? ' highlight' : ''}`} key={i}>
                {plan.highlight && <div className="popular-tag">Most Popular</div>}
                <h3>{plan.name}</h3>
                <div className="price">
                  <span className="currency">$</span>
                  <span className="amount">{plan.price}</span>
                  <span className="period">{plan.period}</span>
                </div>
                <ul>
                  {plan.features.map((f, j) => (
                    <li key={j}>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                      {f}
                    </li>
                  ))}
                </ul>
                <button
                  className={plan.highlight ? 'btn-primary' : 'btn-secondary'}
                  onClick={() => initiateLogin()}
                >
                  {plan.cta}
                </button>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="homepage-footer">
        <div className="footer-inner">
          <div className="footer-brand">
            <div className="hero-logo">
              <div className="logo-icon">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                  <path d="M6 9Q12 6 18 8M5 13Q12 10 19 12M7 17Q12 14 17 16" stroke="white" strokeWidth="2" strokeLinecap="round"/>
                </svg>
              </div>
              <span>LyricFlow</span>
            </div>
            <p>The most beautiful lyrics experience.</p>
          </div>
          <p className="footer-copy">Built with love for music lovers.</p>
        </div>
      </footer>
    </div>
  )
}
