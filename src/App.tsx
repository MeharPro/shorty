import { useEffect, useState } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { AuthPage } from './pages/AuthPage';
import { DashboardPage } from './pages/DashboardPage';
import { Feature1Page } from './pages/Feature1Page';
import { Feature2Page } from './pages/Feature2Page';
import { LandingPage } from './pages/LandingPage';
import {
  clearSession,
  createShortySessionFromAuthUser,
  loadSession,
  saveSession,
  type ShortySession,
} from './lib/session';
import {
  getCurrentSession,
  hasSupabaseBrowserConfig,
  onSessionChange,
  signOutCurrentUser,
} from './lib/supabase';
import './App.css';

type ThemeMode = 'light' | 'dark';

const THEME_STORAGE_KEY = 'shorty-theme-mode';

function loadInitialAuthState() {
  const savedSession = loadSession();

  return {
    session: savedSession,
    isAuthReady: !hasSupabaseBrowserConfig || Boolean(savedSession),
  };
}

function loadThemePreference(): ThemeMode {
  if (typeof window === 'undefined') {
    return 'light';
  }

  const savedTheme = window.localStorage.getItem(THEME_STORAGE_KEY);
  if (savedTheme === 'light' || savedTheme === 'dark') {
    return savedTheme;
  }

  return 'light';
}

function App() {
  const [initialAuthState] = useState(loadInitialAuthState);
  const [session, setSession] = useState<ShortySession | null>(initialAuthState.session);
  const [isAuthReady, setIsAuthReady] = useState<boolean>(initialAuthState.isAuthReady);
  const [theme, setTheme] = useState<ThemeMode>(() => loadThemePreference());

  const handleAuth = (nextSession: ShortySession) => {
    saveSession(nextSession);
    setSession(nextSession);
  };

  const handleLogout = async () => {
    if (hasSupabaseBrowserConfig) {
      await signOutCurrentUser();
    }

    clearSession();
    setSession(null);
  };

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
  }, [theme]);

  useEffect(() => {
    if (!hasSupabaseBrowserConfig) {
      return;
    }

    let isMounted = true;

    const syncSession = async () => {
      const currentAuthSession = await getCurrentSession();
      if (!isMounted) {
        return;
      }

      if (currentAuthSession?.user) {
        const nextSession = createShortySessionFromAuthUser(currentAuthSession.user);
        saveSession(nextSession);
        setSession(nextSession);
      } else {
        clearSession();
        setSession(null);
      }

      setIsAuthReady(true);
    };

    void syncSession();

    const unsubscribe = onSessionChange((currentAuthSession) => {
      if (!isMounted) {
        return;
      }

      if (currentAuthSession?.user) {
        const nextSession = createShortySessionFromAuthUser(currentAuthSession.user);
        saveSession(nextSession);
        setSession(nextSession);
      } else {
        clearSession();
        setSession(null);
      }

      setIsAuthReady(true);
    });

    return () => {
      isMounted = false;
      unsubscribe();
    };
  }, []);

  const nextTheme = theme === 'dark' ? 'light' : 'dark';

  if (!isAuthReady) {
    return (
      <div className="app-shell">
        <button
          aria-label={`Switch to ${nextTheme} mode`}
          className="app-theme-toggle"
          onClick={() => setTheme(nextTheme)}
          type="button"
        >
          <span className="app-theme-toggle__eyebrow">Theme</span>
          <strong className="app-theme-toggle__value">{theme === 'dark' ? 'Dark' : 'Light'}</strong>
        </button>

        <div className="auth-page">
          <div className="auth-card">
            <h1 className="auth-card__title">Restoring session</h1>
            <p className="auth-card__subtitle">
              Checking the persisted Supabase session for this browser.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="app-shell">
      <button
        aria-label={`Switch to ${nextTheme} mode`}
        className="app-theme-toggle"
        onClick={() => setTheme(nextTheme)}
        type="button"
      >
        <span className="app-theme-toggle__eyebrow">Theme</span>
        <strong className="app-theme-toggle__value">{theme === 'dark' ? 'Dark' : 'Light'}</strong>
      </button>

      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/app" element={<DashboardPage session={session} onLogout={handleLogout} />} />
        <Route path="/feature1" element={<Feature1Page session={session} />} />
        <Route path="/feature2" element={<Feature2Page session={session} />} />
        <Route
          path="/login"
          element={session ? <Navigate replace to="/app" /> : <AuthPage mode="login" onAuth={handleAuth} />}
        />
        <Route
          path="/signup"
          element={session ? <Navigate replace to="/app" /> : <AuthPage mode="signup" onAuth={handleAuth} />}
        />
        <Route path="*" element={<Navigate replace to="/" />} />
      </Routes>
    </div>
  );
}

export default App;
