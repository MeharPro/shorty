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
      navigate('/');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="purity-auth-route">
      <section className="purity-auth-shell">
        <Link className="purity-auth-shell__brand" to="/">
          <span className="purity-sidebar__brand-mark purity-sidebar__brand-mark--centered">
            <img alt="Shorty logo" src={boltLogo} />
          </span>
          <span className="purity-auth-shell__brand-copy">
            <strong>Shorty Dashboard</strong>
            <span>{isSignup ? 'Create account' : 'Sign in'}</span>
          </span>
        </Link>

        <div className="purity-auth-shell__grid">
          <section className="purity-auth-panel purity-auth-panel--intro">
            <span className="purity-section-heading__eyebrow">
              {isSignup ? 'Sign up' : 'Sign in'}
            </span>
            <h1>{isSignup ? 'Create your workspace.' : 'Return to the editor.'}</h1>
            <p>
              {hasSupabaseBrowserConfig
                ? 'Use the account flow to sync sessions and snapshots across devices.'
                : 'Auth is optional right now, but adding an account keeps the dashboard ready for sync later.'}
            </p>

            <ul className="purity-auth-points">
              <li>Keep dashboard access in one focused route</li>
              <li>Attach a named identity to snapshots</li>
              <li>Drop straight back into the tool after submit</li>
            </ul>
          </section>

          <section className="purity-auth-panel">
            <form className="purity-auth-form" onSubmit={handleSubmit}>
              <div className="purity-auth-form__header">
                <strong>{isSignup ? 'Create account' : 'Sign in'}</strong>
                <span>
                  {hasSupabaseBrowserConfig
                    ? 'Uses Supabase when env vars are configured.'
                    : 'Falls back to a local workspace identity.'}
                </span>
              </div>

              {isSignup ? (
                <label className="purity-field">
                  <span>Name</span>
                  <input
                    placeholder="Your workspace name"
                    required
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                  />
                </label>
              ) : null}

              <label className="purity-field">
                <span>Email</span>
                <input
                  placeholder="creator@shorty.app"
                  required
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                />
              </label>

              <label className="purity-field">
                <span>Password</span>
                <input
                  placeholder="Enter your password"
                  required
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                />
              </label>

              <button className="purity-button purity-button--primary" disabled={isSubmitting} type="submit">
                {isSubmitting ? 'Working...' : isSignup ? 'Create account' : 'Sign in'}
              </button>

              {authMessage ? <p className="purity-auth-form__message">{authMessage}</p> : null}

              <p className="purity-auth-form__switch">
                {isSignup ? 'Already have an account?' : 'Need an account?'}{' '}
                <Link to={isSignup ? '/login' : '/signup'}>
                  {isSignup ? 'Sign in' : 'Create one'}
                </Link>
              </p>
            </form>
          </section>
        </div>
      </section>
    </div>
  );
}
