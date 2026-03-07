import { useEffect, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import boltLogo from '../assets/bolt-logo.png';
import { loadReelHistory } from '../lib/persistence';
import {
  fetchReelHistory,
  hasSupabaseBrowserConfig,
} from '../lib/supabase';
import type { ShortySession } from '../lib/session';
import type { ReelHistoryEntry } from '../types';

interface DashboardPageProps {
  session: ShortySession | null;
  onLogout: () => Promise<void>;
}

function formatScore(value: number): string {
  return `${Math.round(value)}/100`;
}

export function DashboardPage({ session, onLogout }: DashboardPageProps) {
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [history, setHistory] = useState<ReelHistoryEntry[]>([]);

  useEffect(() => {
    if (!session) return;

    const localHistory = loadReelHistory(session.email);
    setHistory(localHistory);

    if (!hasSupabaseBrowserConfig || !session.userId) return;

    void fetchReelHistory(session.userId).then((response) => {
      if (response.ok) {
        setHistory(response.entries);
      }
    });
  }, [session]);

  if (!session) {
    return <Navigate replace to="/login" />;
  }

  const handleLogout = async () => {
    setIsLoggingOut(true);
    try {
      await onLogout();
    } finally {
      setIsLoggingOut(false);
    }
  };

  return (
    <div className="dashboard">
      {/* Header */}
      <header className="dashboard__header">
        <Link className="dashboard__brand" to="/">
          <span className="dashboard__brand-mark">
            <img alt="Shorty" src={boltLogo} />
          </span>
          <span className="dashboard__brand-name">Shorty</span>
        </Link>

        <div className="dashboard__user-area">
          <div className="dashboard__user-info">
            <strong>{session.name}</strong>
            <span>{session.email}</span>
          </div>
          <button
            className="dashboard__logout"
            disabled={isLoggingOut}
            type="button"
            onClick={() => void handleLogout()}
          >
            {isLoggingOut ? 'Signing out...' : 'Log out'}
          </button>
        </div>
      </header>

      {/* Hero */}
      <div className="dashboard__hero">
        <h1>What do you want to create?</h1>
        <p>Choose a workflow below to start turning content into viral short-form videos.</p>
      </div>

      {/* Two Feature Cards */}
      <div className="feature-grid">
        <Link className="feature-card" to="/feature1">
          <span className="feature-card__arrow">→</span>
          <div className="feature-card__icon feature-card__icon--purple">🎬</div>
          <div className="feature-card__label">Feature 1</div>
          <h2 className="feature-card__title">Video → Reels</h2>
          <p className="feature-card__desc">
            Upload a long video and let AI extract the best 30–60 second clips.
            Each reel is ranked by virality score so you ship the winners first.
          </p>
          <div className="feature-card__tags">
            <span className="feature-card__tag">30-60s clips</span>
            <span className="feature-card__tag">Virality ranked</span>
            <span className="feature-card__tag">Auto-edit</span>
          </div>
        </Link>

        <Link className="feature-card" to="/feature2">
          <span className="feature-card__arrow">→</span>
          <div className="feature-card__icon feature-card__icon--warm">🧠</div>
          <div className="feature-card__label">Feature 2</div>
          <h2 className="feature-card__title">Brain Rot AI Reels</h2>
          <p className="feature-card__desc">
            Minecraft gameplay, AI voices, and trending topics fused into
            10–50 brain rot videos ranked by engagement score.
          </p>
          <div className="feature-card__tags">
            <span className="feature-card__tag">Minecraft gameplay</span>
            <span className="feature-card__tag">ElevenLabs voices</span>
            <span className="feature-card__tag">Bulk generation</span>
          </div>
        </Link>
      </div>

      {/* Past Work */}
      {history.length > 0 && (
        <section className="past-work">
          <h2 className="past-work__title">Past Work</h2>
          <div className="past-work__list">
            {history.slice(0, 8).map((entry) => {
              const topClip =
                entry.result.clips.find((c) => c.id === entry.recommendedClipId) ??
                entry.result.clips[0];
              return (
                <div className="past-work__item" key={entry.id}>
                  <div className="past-work__item-info">
                    <strong>{entry.sourceLabel}</strong>
                    <span>
                      {new Date(entry.createdAt).toLocaleDateString()} · {entry.result.clips.length} reels
                      {topClip ? ` · Top: ${formatScore(topClip.viralityScore)}` : ''}
                    </span>
                  </div>
                  <div className="past-work__item-actions">
                    {topClip ? (
                      <a
                        className="btn btn--ghost btn--sm"
                        href={topClip.deliveryUrl}
                        target="_blank"
                        rel="noreferrer"
                      >
                        View top reel
                      </a>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}
