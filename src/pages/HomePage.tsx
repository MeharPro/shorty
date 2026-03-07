import { Link } from 'react-router-dom';
import boltLogo from '../assets/bolt-logo.png';
import type { ShortySession } from '../lib/session';

interface HomePageProps {
  session: ShortySession | null;
}

const HOME_ITEMS = [
  {
    title: 'Open the editor',
    body: 'Jump straight into the dashboard and build vertical cuts from a source clip.',
  },
  {
    title: 'Keep the workflow narrow',
    body: 'Uploads, presets, composition, and preview live in one organized workspace.',
  },
  {
    title: 'Export platform-safe variants',
    body: 'Generate Shorts, Reels, and TikTok outputs without rebuilding the same layout.',
  },
];

export function HomePage({ session }: HomePageProps) {
  return (
    <div className="shorty-route">
      <header className="shorty-route-header">
        <Link className="shorty-route-header__brand" to="/">
          <span className="shorty-route-header__logo-wrap">
            <img className="shorty-route-header__logo" src={boltLogo} alt="Shorty logo" />
          </span>
          <span className="shorty-route-header__meta">
            <strong>Shorty</strong>
            <span>Creator Studio</span>
          </span>
        </Link>

        <nav className="shorty-route-header__nav">
          <Link to="/dashboard">Dashboard</Link>
          <Link to="/login">Login</Link>
          <Link to="/signup">Signup</Link>
        </nav>
      </header>

      <main className="shorty-home-grid">
        <section className="shorty-home-panel shorty-home-panel--hero">
          <span className="shorty-home-panel__eyebrow">Home</span>
          <h1>Open the tool and start cutting clips.</h1>
          <p>
            Shorty is organized around one job: turn source media into short-form outputs with a
            clean dashboard workflow.
          </p>

          <div className="shorty-home-actions">
            <Link className="shorty-button shorty-button--solid" to="/dashboard">
              Open dashboard
            </Link>
            <Link className="shorty-button shorty-button--ghost" to={session ? '/dashboard' : '/login'}>
              {session ? `Continue as ${session.name}` : 'Log in'}
            </Link>
          </div>

          {session ? (
            <div className="shorty-home-session">
              Signed in as <strong>{session.name}</strong> · {session.email}
            </div>
          ) : null}
        </section>

        <section className="shorty-home-panel shorty-home-panel--stack">
          {HOME_ITEMS.map((item) => (
            <article className="shorty-home-list-item" key={item.title}>
              <strong>{item.title}</strong>
              <p>{item.body}</p>
            </article>
          ))}
        </section>
      </main>
    </div>
  );
}
