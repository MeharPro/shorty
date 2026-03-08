import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import boltLogo from '../assets/bolt-logo.png';
import {
  signInWithUsername,
  signUpWithUsername,
} from '../lib/localAuth';
import type { ShortySession } from '../lib/session';

interface AuthPageProps {
  mode: 'login' | 'signup';
  onAuth: (session: ShortySession) => void;
}

export function AuthPage({ mode, onAuth }: AuthPageProps) {
  const navigate = useNavigate();
  const [displayName, setDisplayName] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [authMessage, setAuthMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const isSignup = mode === 'signup';

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const trimmedUsername = username.trim();
    const trimmedPassword = password.trim();

    if (!trimmedUsername || !trimmedPassword) {
      setAuthMessage('Username and password are required.');
      return;
    }

    setIsSubmitting(true);
    setAuthMessage('');

    try {
      const result = isSignup
        ? await signUpWithUsername(trimmedUsername, trimmedPassword, displayName)
        : await signInWithUsername(trimmedUsername, trimmedPassword);

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
          {isSignup
            ? 'Use a username and password to create a local Shorty workspace.'
            : 'Sign in with your username to open your saved Shorty workspace.'}
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
            <span>Username</span>
            <input
              autoCapitalize="none"
              autoCorrect="off"
              data-testid="auth-username"
              placeholder="creator_name"
              required
              value={username}
              onChange={(event) => setUsername(event.target.value)}
            />
          </label>

          <label className="auth-field">
            <span>Password</span>
            <input
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
