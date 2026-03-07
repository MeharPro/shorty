import { useState } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { AuthPage } from './pages/AuthPage';
import { DashboardPage } from './pages/DashboardPage';
import { HomePage } from './pages/HomePage';
import { clearSession, loadSession, saveSession, type ShortySession } from './lib/session';
import './App.css';

function App() {
  const [session, setSession] = useState<ShortySession | null>(() => loadSession());

  const handleAuth = (nextSession: ShortySession) => {
    saveSession(nextSession);
    setSession(nextSession);
  };

  const handleLogout = () => {
    clearSession();
    setSession(null);
  };

  return (
    <Routes>
      <Route path="/" element={<HomePage session={session} />} />
      <Route path="/login" element={<AuthPage mode="login" onAuth={handleAuth} />} />
      <Route path="/signup" element={<AuthPage mode="signup" onAuth={handleAuth} />} />
      <Route
        path="/dashboard"
        element={<DashboardPage session={session} onLogout={handleLogout} />}
      />
      <Route path="*" element={<Navigate replace to="/" />} />
    </Routes>
  );
}

export default App;
