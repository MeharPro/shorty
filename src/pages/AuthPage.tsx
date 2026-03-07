import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import boltLogo from '../assets/bolt-logo.png';
import { createShortySession, type ShortySession } from '../lib/session';
import {
  hasSupabaseBrowserConfig,
  signInWithEmail,
  signUpWithEmail,
} from '../lib/supabase';

interface AuthPageProps {
  mode: 'login' | 'signup';
  onAuth: (session: ShortySession) => void;
}

export function AuthPage({ mode, onAuth }: AuthPageProps) {
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [authMessage, setAuthMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const isSignup = mode === 'signup';

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const trimmedEmail = email.trim();
    const trimmedPassword = password.trim();
    if (!trimmedEmail || !trimmedPassword) {
      setAuthMessage('Email and password are required.');
      return;
    }

    setIsSubmitting(true);
    setAuthMessage('');

    try {
      if (hasSupabaseBrowserConfig) {
        const result = isSignup
          ? await signUpWithEmail(trimmedEmail, trimmedPassword)
          : await signInWithEmail(trimmedEmail, trimmedPassword);

        if (!result.ok) {
          setAuthMessage(result.message);
          return;
        }
      }

      onAuth(createShortySession(trimmedEmail, isSignup ? name : undefined));
      setPassword('');
      navigate('/dashboard');
    } finally {
      setIsSubmitting(false);
    }
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
            {hasSupabaseBrowserConfig
              ? 'Supabase auth is configured, so these screens now use the live email flow from the dev branch.'
              : 'Supabase is not configured, so this page falls back to a local workspace identity.'}
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
              <span>
                {hasSupabaseBrowserConfig
                  ? 'Uses Supabase auth when env vars are present.'
                  : 'Uses local fallback when auth env vars are missing.'}
              </span>
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

            <button className="shorty-button shorty-button--solid" disabled={isSubmitting} type="submit">
              {isSubmitting ? 'Working...' : isSignup ? 'Create account' : 'Sign in'}
            </button>

            {authMessage ? <p className="shorty-auth-form__message">{authMessage}</p> : null}

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
