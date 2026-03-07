import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import boltLogo from '../assets/bolt-logo.png';
import type { ShortySession } from '../lib/session';

interface AuthPageProps {
  mode: 'login' | 'signup';
  onAuth: (session: ShortySession) => void;
}

export function AuthPage({ mode, onAuth }: AuthPageProps) {
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const isSignup = mode === 'signup';

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const trimmedEmail = email.trim();
    if (!trimmedEmail) {
      return;
    }

    const fallbackName = trimmedEmail.split('@')[0] || 'Creator';
    onAuth({
      name: isSignup ? (name.trim() || fallbackName) : fallbackName,
      email: trimmedEmail,
    });

    setPassword('');
    navigate('/dashboard');
  };

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
          <Link to="/">Home</Link>
          <Link to="/dashboard">Dashboard</Link>
          <Link to={isSignup ? '/login' : '/signup'}>{isSignup ? 'Login' : 'Signup'}</Link>
        </nav>
      </header>

      <main className="shorty-auth-grid">
        <section className="shorty-auth-panel shorty-auth-panel--info">
          <span className="shorty-home-panel__eyebrow">{isSignup ? 'Signup' : 'Login'}</span>
          <h1>{isSignup ? 'Create a workspace identity.' : 'Return to the dashboard.'}</h1>
          <p>
            This local auth flow only stores a lightweight workspace identity so you can move
            through the app cleanly while the real backend is still being built.
          </p>

          <ul className="shorty-auth-points">
            <li>Keep dashboard navigation organized</li>
            <li>Preserve a named workspace identity</li>
            <li>Move directly into creation after submit</li>
          </ul>
        </section>

        <section className="shorty-auth-panel">
          <form className="shorty-auth-form" onSubmit={handleSubmit}>
            <div className="shorty-auth-form__header">
              <strong>{isSignup ? 'Create account' : 'Sign in'}</strong>
              <span>{isSignup ? 'Need access to the dashboard.' : 'Use any email locally.'}</span>
            </div>

            {isSignup ? (
              <label className="shorty-field">
                <span>Name</span>
                <input
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="Your workspace name"
                  required
                />
              </label>
            ) : null}

            <label className="shorty-field">
              <span>Email</span>
              <input
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="creator@shorty.app"
                type="email"
                required
              />
            </label>

            <label className="shorty-field">
              <span>Password</span>
              <input
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="Enter any password"
                type="password"
                required
              />
            </label>

            <button className="shorty-button shorty-button--solid" type="submit">
              {isSignup ? 'Create account' : 'Sign in'}
            </button>

            <p className="shorty-auth-form__switch">
              {isSignup ? 'Already have a workspace?' : 'Need a workspace?'}{' '}
              <Link to={isSignup ? '/login' : '/signup'}>{isSignup ? 'Log in' : 'Create one'}</Link>
            </p>
          </form>
        </section>
      </main>
    </div>
  );
}
