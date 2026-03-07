import { useEffect, useState } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { AuthPage } from './pages/AuthPage';
import { DashboardPage } from './pages/DashboardPage';
import { Feature1Page } from './pages/Feature1Page';
import { Feature2Page } from './pages/Feature2Page';
import { LandingPage } from './pages/LandingPage';
import {
  clearSession,
  createShortySession,
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

function App() {
  const [session, setSession] = useState<ShortySession | null>(() => loadSession());

  useEffect(() => {
    if (!hasSupabaseBrowserConfig) {
      return undefined;
    }

    let mounted = true;

    void getCurrentSession().then((supabaseSession) => {
      if (!mounted || !supabaseSession?.user?.email) {
        return;
      }

      const nextSession = createShortySession(
        supabaseSession.user.email,
        supabaseSession.user.user_metadata?.full_name,
        supabaseSession.user.id
      );
      saveSession(nextSession);
      setSession(nextSession);
    });

    const unsubscribe = onSessionChange((supabaseSession) => {
      if (!mounted) {
        return;
      }

      if (!supabaseSession?.user?.email) {
        clearSession();
        setSession(null);
        return;
      }

      const nextSession = createShortySession(
        supabaseSession.user.email,
        supabaseSession.user.user_metadata?.full_name,
        supabaseSession.user.id
      );
      saveSession(nextSession);
      setSession(nextSession);
    });

    return () => {
      mounted = false;
      unsubscribe();
    };
  }, []);

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

  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/app" element={<DashboardPage session={session} onLogout={handleLogout} />} />
      <Route path="/feature1" element={<Feature1Page session={session} />} />
      <Route path="/feature2" element={<Feature2Page session={session} />} />
      <Route path="/login" element={<AuthPage mode="login" onAuth={handleAuth} />} />
      <Route path="/signup" element={<AuthPage mode="signup" onAuth={handleAuth} />} />
      <Route path="*" element={<Navigate replace to="/" />} />
    </Routes>
  );
}

export default App;
