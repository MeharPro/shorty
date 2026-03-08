import { Link } from 'react-router-dom';
import boltLogo from '../assets/bolt-logo.png';

const proofStats = [
  {
    value: '30-60s clips',
    label: 'Built for short-form exports with ranked outputs.',
  },
  {
    value: 'Ranked first',
    label: 'Open the strongest hooks before touching the rest.',
  },
  {
    value: 'Past work saved',
    label: 'Sessions, uploads, and exports stay in one workspace.',
  },
];

const consoleTracks = [
  {
    eyebrow: 'Input',
    title: 'Long-form source video',
    body: 'Upload MP4 or MOV files, or point the flow at a Drive link.',
    progress: '72%',
    state: 'Ready',
    tone: 'sky',
  },
  {
    eyebrow: 'AI pass',
    title: 'Transcript + visual scan',
    body: 'Shorty analyzes pacing, captions, framing, and hook quality together.',
    progress: '88%',
    state: 'Running',
    tone: 'violet',
  },
  {
    eyebrow: 'Output',
    title: 'Winning clips queued',
    body: 'Review virality scores, pick the top reel, and export without leaving the app.',
    progress: '96%',
    state: 'Ranked',
    tone: 'amber',
  },
];

const valueCards = [
  {
    eyebrow: 'Clear pitch',
    title: 'The landing page explains the product in one screen.',
    body: 'Shorty now shows actual workflows instead of generic imagery and filler sections.',
  },
  {
    eyebrow: 'Product-led',
    title: 'Feature 1, Feature 2, and platform basics are visible immediately.',
    body: 'Visitors can understand what ships today, what is next, and what the core workspace already handles.',
  },
  {
    eyebrow: 'Better hierarchy',
    title: 'One focused hero, one supporting system view, one path forward.',
    body: 'The page emphasizes upload, ranking, history, and export instead of decorative content.',
  },
];

const processSteps = [
  {
    step: '01',
    title: 'Bring in footage',
    body: 'Start with a source video upload or a Drive link. The product is designed around existing long-form footage.',
  },
  {
    step: '02',
    title: 'Let Shorty analyze it',
    body: 'Transcript extraction, visual scanning, and hook analysis combine into one generation pass.',
  },
  {
    step: '03',
    title: 'Review ranked candidates',
    body: 'Clip scoring makes it obvious which outputs deserve the first review and export.',
  },
  {
    step: '04',
    title: 'Return to past work',
    body: 'Authentication, saved sessions, and download history keep the workspace useful after the first batch.',
  },
];

const workflowCards = [
  {
    eyebrow: 'Feature 1',
    title: 'Video to reels',
    status: 'Live now',
    body: 'Upload footage, generate cuts, score hooks, and export the best reel without leaving the dashboard.',
    bullets: ['Source upload or Drive link', 'Transcript and face analysis', 'Virality-ranked outputs'],
    tone: 'live',
  },
  {
    eyebrow: 'Feature 2',
    title: 'Brain rot batch generator',
    status: 'Coming next',
    body: 'Shorty positions the bulk AI reel workflow as the next expansion of the same product surface.',
    bullets: ['Topic plus voice setup', 'Gameplay-backed generation', 'Batch ranking for experiments'],
    tone: 'soon',
  },
  {
    eyebrow: 'Platform',
    title: 'Auth, history, uploads, downloads',
    status: 'Always on',
    body: 'The shared platform layer keeps user state, media assets, and exports tied together across workflows.',
    bullets: ['Login and signup flow', 'Past work history', 'Saved assets and clean output delivery'],
    tone: 'base',
  },
];

const runwayItems = ['Upload', 'Transcribe', 'Generate', 'Rank', 'Download', 'Repeat'];

function getTrackToneClassName(tone: string) {
  return `landing-track landing-track--${tone}`;
}

function getWorkflowToneClassName(tone: string) {
  return `landing-workspace-card landing-workspace-card--${tone}`;
}

export function LandingPage() {
  return (
    <div className="landing-page">
      <header className="landing-nav">
        <Link className="landing-brand" to="/">
          <span className="landing-brand__mark">
            <img alt="Shorty" src={boltLogo} />
          </span>
          <span className="landing-brand__copy">
            <strong>Shorty</strong>
            <span>Short-form content engine</span>
          </span>
        </Link>

        <nav aria-label="Landing sections" className="landing-nav__links">
          <a className="landing-nav__link" href="#workflow">
            Workflow
          </a>
          <a className="landing-nav__link" href="#platform">
            Platform
          </a>
        </nav>

        <div className="landing-nav__actions">
          <Link className="btn btn--ghost" to="/login">
            Log in
          </Link>
          <Link className="btn btn--primary" to="/signup">
            Sign up
          </Link>
        </div>
      </header>

      <main className="landing-main">
        <section className="landing-hero">
          <div className="landing-hero__copy">
            <span className="landing-kicker">Feature 1 is live</span>
            <h1>Turn long videos into ranked short-form winners.</h1>
            <p>
              Shorty gives creators and operators one place to upload source footage, generate reel
              candidates, score the best hooks, and keep every export tied to past work.
            </p>

            <div className="landing-hero__actions">
              <Link className="btn btn--primary btn--lg" to="/signup">
                Start free
              </Link>
              <Link className="btn btn--ghost btn--lg" to="/app">
                Open dashboard
              </Link>
            </div>

            <div className="landing-audience">
              <span>Creators</span>
              <span>Agencies</span>
              <span>Growth teams</span>
            </div>

            <div className="landing-proof-grid">
              {proofStats.map((stat) => (
                <article className="landing-proof-card" key={stat.value}>
                  <strong>{stat.value}</strong>
                  <span>{stat.label}</span>
                </article>
              ))}
            </div>
          </div>

          <div className="landing-stage">
            <article className="landing-console">
              <div className="landing-console__top">
                <div>
                  <span className="landing-console__label">Active workflow</span>
                  <strong>Video to reels</strong>
                </div>
                <span className="landing-status-pill">Live</span>
              </div>

              <div className="landing-console__headline">
                <strong>Everything important happens in one pass.</strong>
                <span>Upload, analyze, rank, export, then return to history later.</span>
              </div>

              <div className="landing-console__tracks">
                {consoleTracks.map((track) => (
                  <article className={getTrackToneClassName(track.tone)} key={track.title}>
                    <div className="landing-track__header">
                      <span>{track.eyebrow}</span>
                      <span>{track.state}</span>
                    </div>
                    <strong>{track.title}</strong>
                    <p>{track.body}</p>
                    <div aria-hidden="true" className="landing-track__meter">
                      <span style={{ width: track.progress }} />
                    </div>
                  </article>
                ))}
              </div>

              <div className="landing-console__bottom">
                <article className="landing-score-card">
                  <span className="landing-score-card__eyebrow">Top reel</span>
                  <strong>Clip 04 scores 92/100</strong>
                  <p>Strong first-two-second hook, centered speaker framing, captions ready.</p>
                </article>
                <article className="landing-score-card landing-score-card--muted">
                  <span className="landing-score-card__eyebrow">Workspace</span>
                  <strong>Past work stays attached to your account</strong>
                  <p>Uploads, transcript data, and exports stay easy to revisit.</p>
                </article>
              </div>
            </article>

            <div className="landing-float-card landing-float-card--score">
              <span>Winning score</span>
              <strong>92 / 100</strong>
            </div>
            <div className="landing-float-card landing-float-card--history">
              <span>History synced</span>
              <strong>8 recent batches</strong>
            </div>
          </div>
        </section>

        <section className="landing-runway" aria-label="Core workflow">
          <span className="landing-runway__label">Core flow</span>
          {runwayItems.map((item) => (
            <span className="landing-chip" key={item}>
              {item}
            </span>
          ))}
        </section>

        <section className="landing-section" id="workflow">
          <div className="landing-section-heading">
            <span className="landing-kicker">Why the page reads better</span>
            <h2>A product landing page instead of a stock-photo collage.</h2>
            <p>
              Shorty now leads with the core workflow, shows what the app already supports, and
              gives visitors a clear action instead of decorative filler.
            </p>
          </div>

          <div className="landing-value-grid">
            {valueCards.map((card) => (
              <article className="landing-value-card" key={card.title}>
                <span className="landing-value-card__eyebrow">{card.eyebrow}</span>
                <h3>{card.title}</h3>
                <p>{card.body}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="landing-section landing-section--split" id="platform">
          <div className="landing-section-heading">
            <span className="landing-kicker">How it works</span>
            <h2>From source footage to export, the path is obvious.</h2>
            <p>
              The layout mirrors how the product actually behaves: ingest media, run analysis,
              inspect ranked clips, and keep the history tied to the same workspace.
            </p>
          </div>

          <div className="landing-process">
            {processSteps.map((step) => (
              <article className="landing-step-card" key={step.step}>
                <span className="landing-step-card__index">{step.step}</span>
                <h3>{step.title}</h3>
                <p>{step.body}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="landing-section">
          <div className="landing-section-heading">
            <span className="landing-kicker">Product surface</span>
            <h2>Feature depth and platform basics sit in the same story.</h2>
            <p>
              Feature 1 is positioned as the live workflow, Feature 2 is framed as the next module,
              and the supporting account system stays visible underneath both.
            </p>
          </div>

          <div className="landing-workspace__grid">
            {workflowCards.map((card) => (
              <article className={getWorkflowToneClassName(card.tone)} key={card.title}>
                <div className="landing-workspace-card__top">
                  <span className="landing-workspace-card__eyebrow">{card.eyebrow}</span>
                  <span className="landing-workspace-card__status">{card.status}</span>
                </div>
                <h3>{card.title}</h3>
                <p>{card.body}</p>
                <ul>
                  {card.bullets.map((bullet) => (
                    <li key={bullet}>{bullet}</li>
                  ))}
                </ul>
              </article>
            ))}
          </div>
        </section>

        <section className="landing-cta">
          <div className="landing-cta__copy">
            <span className="landing-kicker">Ready to ship clips faster?</span>
            <h2>Open the workspace and start the first batch.</h2>
            <p>The fastest way to judge Shorty is to upload footage and inspect the ranked results.</p>
          </div>

          <div className="landing-nav__actions">
            <Link className="btn btn--ghost btn--lg" to="/login">
              Log in
            </Link>
            <Link className="btn btn--primary btn--lg" to="/signup">
              Create account
            </Link>
          </div>
        </section>
      </main>
    </div>
  );
}
