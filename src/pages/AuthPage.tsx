import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import boltLogo from '../assets/bolt-logo.png';
import { createShortySessionFromAuthUser, type ShortySession } from '../lib/session';
import {
  hasSupabaseBrowserConfig,
  signInWithEmail,
  signUpWithEmail,
} from '../lib/supabase';
import {
  signInWithUsername,
  signUpWithUsername,
} from '../lib/localAuth';

interface AuthPageProps {
  mode: 'login' | 'signup';
  onAuth: (session: ShortySession) => void;
}

export function AuthPage({ mode, onAuth }: AuthPageProps) {
  const navigate = useNavigate();
  const [displayName, setDisplayName] = useState('');
  const [identity, setIdentity] = useState('');
  const [password, setPassword] = useState('');
  const [authMessage, setAuthMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const isSignup = mode === 'signup';
  const usesSupabase = hasSupabaseBrowserConfig;
  const identityLabel = usesSupabase ? 'Email' : 'Username';
  const identityPlaceholder = usesSupabase ? 'you@example.com' : 'creator_name';
  const missingCredentialsMessage = usesSupabase
    ? 'Email and password are required.'
    : 'Username and password are required.';

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const trimmedIdentity = identity.trim();
    const trimmedPassword = password.trim();

    if (!trimmedIdentity || !trimmedPassword) {
      setAuthMessage(missingCredentialsMessage);
      return;
    }

    setIsSubmitting(true);
    setAuthMessage('');

    try {
      if (usesSupabase) {
        const result = isSignup
          ? await signUpWithEmail(trimmedIdentity, trimmedPassword, displayName)
          : await signInWithEmail(trimmedIdentity, trimmedPassword);

        if (!result.ok) {
          setAuthMessage(result.message);
          return;
        }

        setPassword('');

        if (!result.session?.user) {
          setAuthMessage(
            isSignup
              ? 'Account created. Check your email for the confirmation link, then sign in.'
              : 'Supabase did not return an active session. Try signing in again.'
          );
          return;
        }

        onAuth(createShortySessionFromAuthUser(result.session.user));
        navigate('/app');
        return;
      }

      const result = isSignup
        ? await signUpWithUsername(trimmedIdentity, trimmedPassword, displayName)
        : await signInWithUsername(trimmedIdentity, trimmedPassword);

      if (!result.ok) {
        setAuthMessage(result.message);
        return;
      }

      onAuth(result.session);
      setPassword('');
      navigate('/app');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-card">
        <Link className="auth-card__logo" to="/">
          <span className="auth-card__logo-mark">
            <img alt="Shorty" src={boltLogo} />
          </span>
          <span className="auth-card__logo-text">
            <strong>Shorty</strong>
            <span>Short-form content engine</span>
          </span>
        </Link>

        <h1 className="auth-card__title">
          {isSignup ? 'Create your account' : 'Welcome back'}
        </h1>
        <p className="auth-card__subtitle">
          {usesSupabase
            ? isSignup
              ? 'Create an account with your email and password. Your workspace syncs through Supabase.'
              : 'Sign in with your email to open your Supabase-backed Shorty workspace.'
            : isSignup
              ? 'Supabase browser auth is not configured here, so signup uses a local browser workspace.'
              : 'Supabase browser auth is not configured here, so signin uses a local browser workspace.'}
        </p>

        <form className="auth-form" onSubmit={handleSubmit}>
          {isSignup ? (
            <label className="auth-field">
              <span>Display name</span>
              <input
                data-testid="auth-display-name"
                placeholder="Your workspace name"
                value={displayName}
                onChange={(event) => setDisplayName(event.target.value)}
              />
            </label>
          ) : null}

          <label className="auth-field">
            <span>{identityLabel}</span>
            <input
              autoCapitalize="none"
              autoCorrect="off"
              autoComplete={usesSupabase ? 'email' : 'username'}
              data-testid={usesSupabase ? 'auth-email' : 'auth-username'}
              placeholder={identityPlaceholder}
              required
              type={usesSupabase ? 'email' : 'text'}
              value={identity}
              onChange={(event) => setIdentity(event.target.value)}
            />
          </label>

          <label className="auth-field">
            <span>Password</span>
            <input
              autoComplete={isSignup ? 'new-password' : 'current-password'}
              data-testid="auth-password"
              placeholder="Enter your password"
              required
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </label>

          <button
            className="auth-submit"
            data-testid="auth-submit"
            disabled={isSubmitting}
            type="submit"
          >
            {isSubmitting ? 'Working...' : isSignup ? 'Create account' : 'Sign in'}
          </button>

          {authMessage ? <p className="auth-error">{authMessage}</p> : null}

          <p className="auth-switch">
            {isSignup ? 'Already have an account?' : 'Need an account?'}{' '}
            <Link to={isSignup ? '/login' : '/signup'}>
              {isSignup ? 'Sign in' : 'Create one'}
            </Link>
          </p>
        </form>
      </div>
    </div>
  );
}
