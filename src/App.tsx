import { useState } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { AuthPage } from './pages/AuthPage';
import { DashboardPage } from './pages/DashboardPage';
import { Feature1Page } from './pages/Feature1Page';
import { Feature2Page } from './pages/Feature2Page';
import { LandingPage } from './pages/LandingPage';
import {
  clearSession,
  loadSession,
  saveSession,
  type ShortySession,
} from './lib/session';
import './App.css';

function App() {
  const [session, setSession] = useState<ShortySession | null>(() => loadSession());

  const handleAuth = (nextSession: ShortySession) => {
    saveSession(nextSession);
    setSession(nextSession);
  };

  const handleLogout = async () => {
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
