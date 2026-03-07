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
            ? 'Start turning long videos into viral shorts'
            : 'Sign in to access your workspace'}
        </p>

        <form className="auth-form" onSubmit={handleSubmit}>
          {isSignup ? (
            <label className="auth-field">
              <span>Name</span>
              <input
                placeholder="Your name"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </label>
          ) : null}

          <label className="auth-field">
            <span>Email</span>
            <input
              placeholder="you@example.com"
              required
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </label>

          <label className="auth-field">
            <span>Password</span>
            <input
              placeholder="Enter your password"
              required
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>

          <button className="auth-submit" disabled={isSubmitting} type="submit">
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
