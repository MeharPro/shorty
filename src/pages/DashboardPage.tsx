import { useEffect, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import boltLogo from '../assets/bolt-logo.png';
import { normalizeBrainrotVideoUrl } from '../lib/brainrot';
import {
  loadBrainrotHistory,
  loadReelHistory,
  saveBrainrotHistory,
  saveReelHistory,
} from '../lib/persistence';
import {
  fetchBrainrotHistory,
  fetchReelHistory,
  hasSupabaseBrowserConfig,
} from '../lib/supabase';
import type { ShortySession } from '../lib/session';
import type { BrainrotHistoryEntry, ReelHistoryEntry } from '../types';

interface DashboardPageProps {
  session: ShortySession | null;
  onLogout: () => Promise<void>;
}

function formatScore(value: number): string {
  return `${Math.round(value)}/100`;
}

interface PastWorkEntry {
  id: string;
  createdAt: string;
  workflowLabel: 'Feature 1' | 'Feature 2';
  title: string;
  detail: string;
  viewUrl: string | null;
  actionLabel: string | null;
}

function parseTimestamp(value: string): number {
  const timestamp = Date.parse(value);
  return Number.isNaN(timestamp) ? 0 : timestamp;
}

function mergeHistoryEntries<T extends { id: string; createdAt: string }>(
  preferred: T[],
  fallback: T[]
): T[] {
  const merged = new Map<string, T>();

  [...preferred, ...fallback].forEach((entry) => {
    if (!merged.has(entry.id)) {
      merged.set(entry.id, entry);
    }
  });

  return [...merged.values()].sort(
    (left, right) => parseTimestamp(right.createdAt) - parseTimestamp(left.createdAt)
  );
}

function truncateText(value: string, maxLength = 72): string {
  if (value.length <= maxLength) {
    return value;
  }

  return `${value.slice(0, maxLength - 3).trimEnd()}...`;
}

function buildPastWorkEntries(
  reelHistory: ReelHistoryEntry[],
  brainrotHistory: BrainrotHistoryEntry[]
): PastWorkEntry[] {
  const feature1Entries: PastWorkEntry[] = reelHistory.map((entry) => {
    const topClip =
      entry.result.clips.find((clip) => clip.id === entry.recommendedClipId) ??
      entry.result.clips[0];

    return {
      id: `feature1:${entry.id}`,
      createdAt: entry.createdAt,
      workflowLabel: 'Feature 1',
      title: entry.sourceLabel,
      detail: `${entry.result.clips.length} reels${
        topClip ? ` · Top: ${formatScore(topClip.viralityScore)}` : ''
      }`,
      viewUrl: topClip?.deliveryUrl ?? null,
      actionLabel: topClip ? 'View top reel' : null,
    };
  });

  const feature2Entries: PastWorkEntry[] = brainrotHistory.map((entry) => {
    const primaryRender = entry.renders[0] ?? null;
    const title =
      primaryRender?.script.title?.trim() ||
      primaryRender?.label?.trim() ||
      entry.prompt.trim() ||
      'Brain Rot AI Reel';
    const reelCount = entry.renders.length;
    const reelLabel = reelCount === 1 ? 'reel' : 'reels';
    const typeLabel = primaryRender?.typeLabel?.trim();

    return {
      id: `feature2:${entry.id}`,
      createdAt: entry.createdAt,
      workflowLabel: 'Feature 2',
      title: truncateText(title),
      detail: `${reelCount} ${reelLabel}${typeLabel ? ` · ${typeLabel}` : ''}`,
      viewUrl: primaryRender?.deliveryUrl
        ? normalizeBrainrotVideoUrl(primaryRender.deliveryUrl)
        : null,
      actionLabel: primaryRender ? 'View reel' : null,
    };
  });

  return [...feature1Entries, ...feature2Entries].sort(
    (left, right) => parseTimestamp(right.createdAt) - parseTimestamp(left.createdAt)
  );
}

export function DashboardPage({ session, onLogout }: DashboardPageProps) {
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [history, setHistory] = useState<PastWorkEntry[]>([]);

  useEffect(() => {
    if (!session) {
      return;
    }

    let isMounted = true;
    const localReelHistory = loadReelHistory(session.userKey);
    const localBrainrotHistory = loadBrainrotHistory(session.userKey);
    setHistory(buildPastWorkEntries(localReelHistory, localBrainrotHistory));

    if (!hasSupabaseBrowserConfig || !session.userId) {
      return () => {
        isMounted = false;
      };
    }

    void Promise.all([
      fetchReelHistory(session.userId),
      fetchBrainrotHistory(session.userId),
    ]).then(([reelResponse, brainrotResponse]) => {
      if (!isMounted) {
        return;
      }

      const nextReelHistory = reelResponse.ok
        ? mergeHistoryEntries(reelResponse.entries, localReelHistory)
        : localReelHistory;
      const nextBrainrotHistory = brainrotResponse.ok
        ? mergeHistoryEntries(brainrotResponse.entries, localBrainrotHistory)
        : localBrainrotHistory;

      if (reelResponse.ok) {
        saveReelHistory(session.userKey, nextReelHistory);
      }

      if (brainrotResponse.ok) {
        saveBrainrotHistory(session.userKey, nextBrainrotHistory);
      }

      setHistory(buildPastWorkEntries(nextReelHistory, nextBrainrotHistory));
    });

    return () => {
      isMounted = false;
    };
  }, [session]);

  if (!session) {
    return <Navigate replace to="/login" />;
  }

  const accountLabel = session.username.includes('@') ? session.username : `@${session.username}`;

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
      <header className="dashboard__header">
        <Link className="dashboard__brand" to="/app">
          <span className="dashboard__brand-mark">
            <img alt="Shorty" src={boltLogo} />
          </span>
          <span className="dashboard__brand-name">Shorty</span>
        </Link>

        <div className="dashboard__user-area">
          <div className="dashboard__user-info">
            <strong>{session.name}</strong>
            <span>{accountLabel}</span>
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

      <div className="dashboard__hero">
        <h1>What do you want to create?</h1>
        <p>Choose a workflow below to start turning content into viral short-form videos.</p>
      </div>

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

      {history.length > 0 && (
        <section className="past-work">
          <h2 className="past-work__title">Past Work</h2>
          <div className="past-work__list">
            {history.slice(0, 8).map((entry) => {
              return (
                <div className="past-work__item" key={entry.id}>
                  <div className="past-work__item-info">
                    <strong>{entry.title}</strong>
                    <span>
                      {new Date(entry.createdAt).toLocaleDateString()} · {entry.workflowLabel} ·{' '}
                      {entry.detail}
                    </span>
                  </div>
                  <div className="past-work__item-actions">
                    {entry.viewUrl && entry.actionLabel ? (
                      <a
                        className="btn btn--ghost btn--sm"
                        href={entry.viewUrl}
                        rel="noreferrer"
                        target="_blank"
                      >
                        {entry.actionLabel}
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
