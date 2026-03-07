import { useEffect, useState } from 'react';
import { loadReelHistory, saveReelHistory } from '../lib/persistence';
import { generateReels } from '../lib/reels';
import {
  fetchReelHistory,
  hasSupabaseBrowserConfig,
  persistReelHistoryEntry,
} from '../lib/supabase';
import { transcribeVideo } from '../lib/transcription';
import type { MediaAsset, ReelGenerationResponse, ReelHistoryEntry } from '../types';

interface ReelGeneratorPanelProps {
  sourceAsset: MediaAsset;
  userKey: string;
  remoteUserId?: string;
}

function formatScore(value: number): string {
  return `${Math.round(value)}/100`;
}

function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const remaining = Math.round(seconds % 60);
  return `${mins}:${remaining.toString().padStart(2, '0')}`;
}

export function ReelGeneratorPanel({
  sourceAsset,
  userKey,
  remoteUserId,
}: ReelGeneratorPanelProps) {
  const [sourceMode, setSourceMode] = useState<'current' | 'drive'>('current');
  const [googleDriveUrl, setGoogleDriveUrl] = useState('');
  const [transcriptText, setTranscriptText] = useState('');
  const [result, setResult] = useState<ReelGenerationResponse | null>(null);
  const [history, setHistory] = useState<ReelHistoryEntry[]>([]);
  const [errorMessage, setErrorMessage] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [historyMessage, setHistoryMessage] = useState('');

  useEffect(() => {
    let isMounted = true;
    const localHistory = loadReelHistory(userKey);
    setHistory(localHistory);

    if (!hasSupabaseBrowserConfig || !remoteUserId) {
      return () => {
        isMounted = false;
      };
    }

    void fetchReelHistory(remoteUserId).then((response) => {
      if (!isMounted) {
        return;
      }

      if (!response.ok) {
        setHistoryMessage(`History sync unavailable: ${response.message}`);
        return;
      }

      setHistory(response.entries);
      saveReelHistory(userKey, response.entries);
      setHistoryMessage(response.entries.length ? 'History synced from Supabase.' : '');
    });

    return () => {
      isMounted = false;
    };
  }, [remoteUserId, userKey]);

  const currentSourceAsset = sourceMode === 'current' ? sourceAsset : null;
  const currentGoogleDriveUrl = sourceMode === 'drive' ? googleDriveUrl.trim() : '';

  const handleTranscribe = async () => {
    if (sourceMode === 'drive' && !currentGoogleDriveUrl) {
      setErrorMessage('Paste a Google Drive link before requesting transcription.');
      return;
    }

    setIsTranscribing(true);
    setErrorMessage('');

    try {
      const response = await transcribeVideo({
        sourceAsset: currentSourceAsset,
        googleDriveUrl: currentGoogleDriveUrl,
      });
      setTranscriptText(response.transcript);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Failed to transcribe video.');
    } finally {
      setIsTranscribing(false);
    }
  };

  const handleGenerate = async () => {
    if (sourceMode === 'drive' && !googleDriveUrl.trim()) {
      setErrorMessage('Paste a Google Drive link to generate reels from Drive.');
      return;
    }

    setIsGenerating(true);
    setErrorMessage('');

    try {
      const response = await generateReels({
        sourceAsset: currentSourceAsset,
        googleDriveUrl: currentGoogleDriveUrl,
        transcriptText: transcriptText.trim(),
      });

      const entry: ReelHistoryEntry = {
        id: crypto.randomUUID(),
        createdAt: new Date().toISOString(),
        sourceLabel:
          sourceMode === 'current'
            ? sourceAsset.label
            : googleDriveUrl.trim() || 'Google Drive video',
        recommendedClipId: response.recommendedClipId,
        result: response,
      };

      const nextHistory = [entry, ...history].slice(0, 10);
      setHistory(nextHistory);
      saveReelHistory(userKey, nextHistory);
      if (hasSupabaseBrowserConfig && remoteUserId) {
        const syncResult = await persistReelHistoryEntry(remoteUserId, entry);
        setHistoryMessage(
          syncResult.persisted
            ? 'History synced to Supabase.'
            : `Saved locally; Supabase sync skipped: ${syncResult.reason}`
        );
      }
      setResult(response);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Failed to generate reels.');
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <article className="reel-panel" id="feature1-panel">
      <div className="reel-panel__section-head">
        <h2>Generate Reels</h2>
        <p>
          Analyze transcript + visual signals, generate 30–60 second vertical clips, and rank
          them by virality potential.
        </p>
      </div>

      <div className="reel-controls">
        <div className="toggle-pills">
          <button
            type="button"
            className={`toggle-pill ${sourceMode === 'current' ? 'toggle-pill--active' : ''}`}
            onClick={() => setSourceMode('current')}
          >
            Current source
          </button>
          <button
            type="button"
            className={`toggle-pill ${sourceMode === 'drive' ? 'toggle-pill--active' : ''}`}
            onClick={() => setSourceMode('drive')}
          >
            Google Drive link
          </button>
        </div>

        {sourceMode === 'current' ? (
          <div className="source-card">
            <strong>{sourceAsset.label}</strong>
            <span>{sourceAsset.publicId || sourceAsset.secureUrl}</span>
          </div>
        ) : (
          <label className="form-field">
            <span>Google Drive video link</span>
            <input
              type="url"
              value={googleDriveUrl}
              onChange={(event) => setGoogleDriveUrl(event.target.value)}
              placeholder="https://drive.google.com/file/d/.../view"
            />
          </label>
        )}

        <label className="form-field">
          <span>Transcript (optional, improves clip quality)</span>
          <textarea
            rows={5}
            value={transcriptText}
            onChange={(event) => setTranscriptText(event.target.value)}
            placeholder="Paste transcript text here. Timestamped lines like 00:15 Hook line... work best."
          />
        </label>

        <div className="reel-actions">
          <button
            className="btn btn--primary"
            type="button"
            onClick={() => void handleGenerate()}
            disabled={isGenerating}
          >
            {isGenerating ? 'Generating reels...' : 'Generate ranked reels'}
          </button>
          <button
            className="btn btn--ghost"
            type="button"
            onClick={() => void handleTranscribe()}
            disabled={isTranscribing}
          >
            {isTranscribing ? 'Transcribing...' : 'Auto-transcribe source'}
          </button>
        </div>

        {errorMessage ? <p className="reel-error">{errorMessage}</p> : null}
        {historyMessage ? <p className="reel-info">{historyMessage}</p> : null}
      </div>

      <section className="reel-history">
        <div>
          <h2>Past Work</h2>
          <p>Saved reel batches for your account.</p>
        </div>

        {history.length ? (
          <ul className="reel-history__list">
            {history.map((entry) => {
              const topClip =
                entry.result.clips.find((clip) => clip.id === entry.recommendedClipId) ??
                entry.result.clips[0];
              return (
                <li key={entry.id}>
                  <div>
                    <strong>{entry.sourceLabel}</strong>
                    <span>
                      {new Date(entry.createdAt).toLocaleString()} • {entry.result.clips.length} reels • top {topClip ? formatScore(topClip.viralityScore) : 'n/a'}
                    </span>
                  </div>
                  <div className="past-work__item-actions">
                    <button
                      className="btn btn--ghost btn--sm"
                      type="button"
                      onClick={() => setResult(entry.result)}
                    >
                      Open batch
                    </button>
                    {topClip ? (
                      <a
                        className="btn btn--ghost btn--sm"
                        href={topClip.deliveryUrl}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Open top reel
                      </a>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="reel-history__empty">
            Generate your first reel batch and it will appear here.
          </p>
        )}
      </section>

      {result ? (
        <div className="reel-results">
          <div className="reel-results__summary">
            <span className="reel-results__pill reel-results__pill--active">{result.clips.length} reels generated</span>
            <span className="reel-results__pill">Transcript: {result.transcriptUsed ? 'used' : 'not provided'}</span>
            <span className="reel-results__pill">Visual analysis: {result.visualSignalsUsed ? 'used' : 'off'}</span>
          </div>

          <div className="reel-grid">
            {result.clips.map((clip) => {
              const recommended = clip.id === result.recommendedClipId;
              return (
                <article className="reel-card" key={clip.id}>
                  <div className="reel-card__media">
                    {recommended ? <span className="reel-card__badge">Recommended</span> : null}
                    <video
                      className="reel-card__video"
                      controls
                      playsInline
                      preload="metadata"
                      poster={clip.posterUrl}
                      src={clip.previewUrl || clip.deliveryUrl}
                    />
                  </div>

                  <div className="reel-card__body">
                    <div className="reel-card__header">
                      <div>
                        <strong>#{clip.rank} · {clip.title}</strong>
                        <span>
                          {formatTime(clip.startOffset)} start · {clip.duration}s · {clip.analysisSource}
                        </span>
                      </div>
                      <div className="reel-score">
                        <span>Virality Score</span>
                        <strong>{formatScore(clip.viralityScore)}</strong>
                      </div>
                    </div>

                    <p className="reel-hook">{clip.hook}</p>

                    {clip.transcriptExcerpt ? (
                      <p className="reel-excerpt">{clip.transcriptExcerpt}</p>
                    ) : null}

                    <div className="reel-card__actions">
                      <a
                        className="btn btn--ghost btn--sm"
                        href={clip.deliveryUrl}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Open reel
                      </a>
                      <a
                        className="btn btn--primary btn--sm"
                        href={clip.downloadUrl}
                        download
                      >
                        Download
                      </a>
                      {clip.aiPreviewUrl ? (
                        <a
                          className="btn btn--ghost btn--sm"
                          href={clip.aiPreviewUrl}
                          target="_blank"
                          rel="noreferrer"
                        >
                          Preview URL
                        </a>
                      ) : null}
                    </div>

                    <div className="reel-breakdown">
                      <span>Hook {formatScore(clip.scoreBreakdown.hookStrength)}</span>
                      <span>Clarity {formatScore(clip.scoreBreakdown.standaloneClarity)}</span>
                      <span>Emotion {formatScore(clip.scoreBreakdown.emotionalImpact)}</span>
                      <span>Novelty {formatScore(clip.scoreBreakdown.novelty)}</span>
                      <span>Pacing {formatScore(clip.scoreBreakdown.pacing)}</span>
                      <span>Visuals {formatScore(clip.scoreBreakdown.visualEngagement)}</span>
                    </div>

                    <div className="reel-columns">
                      <div>
                        <h3>Why it ranked</h3>
                        <ul>
                          {clip.reasoning.map((item) => (
                            <li key={item}>{item}</li>
                          ))}
                        </ul>
                      </div>
                      <div>
                        <h3>Editing plan</h3>
                        <ul>
                          {clip.editingPlan.map((item) => (
                            <li key={item}>{item}</li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        </div>
      ) : null}
    </article>
  );
}
