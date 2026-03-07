import { startTransition, useDeferredValue, useEffect, useState } from 'react';
import { cloudName, isDemoCloud, uploadPreset } from './cloudinary/config';
import { UploadWidget } from './cloudinary/UploadWidget';
import type { CloudinaryUploadResult } from './cloudinary/UploadWidget';
import {
  CAPTION_THEMES,
  PLATFORM_PRESETS,
  SAMPLE_GAMEPLAY_ASSET,
  SAMPLE_PRIMARY_ASSET,
  STORY_PRESETS,
} from './data/presets';
import { loadDraft, loadExportHistory, saveDraft, saveExportHistory } from './lib/persistence';
import {
  buildManifestPayload,
  buildPlayableSourceUrl,
  buildPreviewManifest,
  createMediaAssetFromUpload,
  createRemoteMediaAsset,
} from './lib/rendering';
import {
  hasSupabaseBrowserConfig,
  persistManifestSnapshot,
} from './lib/supabase';
import type {
  CreatorDraft,
  MediaAsset,
  PlatformId,
  SavedExport,
  StoryPreset,
} from './types';
import './App.css';

const DEFAULT_STORY_PRESET = STORY_PRESETS[0];

const DEFAULT_DRAFT: CreatorDraft = {
  captionThemeId: CAPTION_THEMES[0].id,
  platforms: PLATFORM_PRESETS.map((platform) => platform.id),
  ...DEFAULT_STORY_PRESET.defaults,
};

function formatBytes(bytes?: number): string {
  if (!bytes) {
    return 'Unknown size';
  }

  if (bytes < 1024 * 1024) {
    return `${Math.round(bytes / 1024)} KB`;
  }

  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDuration(seconds?: number): string {
  if (!seconds) {
    return 'n/a';
  }

  const mins = Math.floor(seconds / 60);
  const remaining = Math.round(seconds % 60);
  return `${mins}:${remaining.toString().padStart(2, '0')}`;
}

function App() {
  const [draft, setDraft] = useState<CreatorDraft>(() => loadDraft() ?? DEFAULT_DRAFT);
  const [sourceAsset, setSourceAsset] = useState<MediaAsset>(SAMPLE_PRIMARY_ASSET);
  const [gameplayAsset, setGameplayAsset] = useState<MediaAsset>(SAMPLE_GAMEPLAY_ASSET);
  const [savedExports, setSavedExports] = useState<SavedExport[]>(() => loadExportHistory());
  const [statusMessage, setStatusMessage] = useState('');
  const [copiedToken, setCopiedToken] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [remoteGameplayUrl, setRemoteGameplayUrl] = useState('');

  const deferredDraft = useDeferredValue(draft);
  const hasUploadPreset = Boolean(uploadPreset);
  const storyPreset =
    STORY_PRESETS.find((preset) => preset.id === draft.storyPresetId) ?? DEFAULT_STORY_PRESET;
  const captionTheme =
    CAPTION_THEMES.find((theme) => theme.id === draft.captionThemeId) ?? CAPTION_THEMES[0];

  const manifests = PLATFORM_PRESETS.filter((platform) =>
    deferredDraft.platforms.includes(platform.id)
  ).map((platform) =>
    buildPreviewManifest(
      sourceAsset,
      deferredDraft.includeGameplay ? gameplayAsset : null,
      deferredDraft,
      platform,
      storyPreset,
      captionTheme
    )
  );

  const manifestPayload = buildManifestPayload(
    sourceAsset,
    deferredDraft.includeGameplay ? gameplayAsset : null,
    deferredDraft,
    manifests
  );
  const manifestJson = JSON.stringify(manifestPayload, null, 2);
  const sourcePreviewUrl = buildPlayableSourceUrl(sourceAsset);
  const gameplayPreviewUrl = buildPlayableSourceUrl(gameplayAsset);

  useEffect(() => {
    saveDraft(draft);
  }, [draft]);

  useEffect(() => {
    if (!statusMessage) {
      return undefined;
    }

    const timeout = window.setTimeout(() => setStatusMessage(''), 4500);
    return () => window.clearTimeout(timeout);
  }, [statusMessage]);

  const updateDraft = <Key extends keyof CreatorDraft>(
    key: Key,
    value: CreatorDraft[Key]
  ) => {
    setDraft((current) => ({
      ...current,
      [key]: value,
    }));
  };

  const togglePlatform = (platformId: PlatformId) => {
    setDraft((current) => {
      const exists = current.platforms.includes(platformId);
      const nextPlatforms = exists
        ? current.platforms.filter((value) => value !== platformId)
        : [...current.platforms, platformId];

      return {
        ...current,
        platforms: nextPlatforms.length ? nextPlatforms : [platformId],
      };
    });
  };

  const handleSourceUploadSuccess = (result: CloudinaryUploadResult) => {
    setSourceAsset(createMediaAssetFromUpload(result, 'Uploaded Source Clip'));
    setStatusMessage('Source clip uploaded to Cloudinary.');
  };

  const handleGameplayUploadSuccess = (result: CloudinaryUploadResult) => {
    setGameplayAsset(createMediaAssetFromUpload(result, 'Uploaded Gameplay Bed'));
    setDraft((current) => ({
      ...current,
      includeGameplay: true,
    }));
    setStatusMessage('Gameplay bed uploaded and compositing is live.');
  };

  const handleUploadError = (error: Error) => {
    setStatusMessage(error.message);
  };

  const attachGameplayFeed = (url: string, label = 'Remote Gameplay Feed') => {
    setGameplayAsset(createRemoteMediaAsset(url, label));
    setRemoteGameplayUrl(url);
    setDraft((current) => ({
      ...current,
      includeGameplay: true,
    }));
  };

  const attachRemoteGameplay = () => {
    const url = remoteGameplayUrl.trim();

    if (!/^https?:\/\//i.test(url)) {
      setStatusMessage('Paste a direct http(s) gameplay video URL.');
      return;
    }

    attachGameplayFeed(url);
    setStatusMessage('Remote gameplay feed attached for live lower-half compositing.');
  };

  const applyStoryPreset = (preset: StoryPreset) => {
    startTransition(() => {
      setDraft((current) => ({
        ...current,
        ...preset.defaults,
      }));
    });
  };

  const copyText = async (token: string, text: string) => {
    await navigator.clipboard.writeText(text);
    setCopiedToken(token);
    setStatusMessage('Copied to clipboard.');
    window.setTimeout(() => {
      setCopiedToken((current) => (current === token ? null : current));
    }, 2000);
  };

  const saveSnapshot = async () => {
    const entry: SavedExport = {
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
      headline: draft.headline,
      storyPresetId: draft.storyPresetId,
      platforms: draft.platforms,
      deliveryUrls: manifests.map((manifest) => manifest.deliveryUrl),
      sourcePublicId: sourceAsset.publicId,
      payload: manifestJson,
    };

    const nextHistory = [entry, ...savedExports].slice(0, 6);
    setSavedExports(nextHistory);
    saveExportHistory(nextHistory);
    setIsSaving(true);

    try {
      const result = await persistManifestSnapshot(entry);
      if (result.persisted) {
        setStatusMessage('Snapshot saved locally and synced to Supabase.');
      } else {
        setStatusMessage(
          `Snapshot saved locally${result.reason ? `; remote sync skipped: ${result.reason}` : '.'}`
        );
      }
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="app-shell">
      <header className="hero">
        <div className="hero-copy">
          <span className="eyebrow">Hack Canada 2026 // Cloudinary-first build</span>
          <h1>yt-shortmaker</h1>
          <p className="hero-body">
            Turn a regular upload into Shorts, Reels, and TikToks with Cloudinary trim windows,
            vertical crops, caption packs, and live gameplay composites when a second feed is
            attached.
          </p>
          <div className="hero-actions">
            <button
              className="button"
              type="button"
              data-testid="copy-manifest-button"
              onClick={() => void copyText('manifest', manifestJson)}
            >
              {copiedToken === 'manifest' ? 'Manifest copied' : 'Copy manifest JSON'}
            </button>
            <button
              className="button button--ghost"
              type="button"
              disabled={!manifests.length || isSaving}
              data-testid="save-snapshot-button"
              onClick={() => void saveSnapshot()}
            >
              {isSaving ? 'Saving…' : 'Save export snapshot'}
            </button>
          </div>
          <div className="hero-chips">
            <span className="chip">Cloud: {cloudName}</span>
            <span className="chip">
              {isDemoCloud
                ? 'Demo cloud active'
                : hasUploadPreset
                  ? 'Upload preset configured'
                  : 'Cloud configured'}
            </span>
            <span className="chip">
              {hasSupabaseBrowserConfig ? 'Supabase ready' : 'Supabase optional'}
            </span>
          </div>
        </div>

        <div className="hero-stats">
          <article className="stat-card">
            <span className="stat-label">Delivery stack</span>
            <strong>{manifests.length} export recipes</strong>
            <p>
              Each platform gets its own vertical crop, safe-zone plan, and delivery URL.
            </p>
          </article>
          <article className="stat-card">
            <span className="stat-label">Cloudinary workflow</span>
            <strong>Trim, crop, preview, deliver</strong>
            <p>
              Real URLs are generated for sponsor demos, while posters render instantly for the
              interface.
            </p>
          </article>
          <article className="stat-card">
            <span className="stat-label">Hackathon scope</span>
            <strong>Web app first, Reactiv later</strong>
            <p>
              The main build is Cloudinary-native; the Reactiv angle can stay a separate App Clip.
            </p>
          </article>
        </div>
      </header>

      <main className="workspace">
        <aside className="control-column">
          <section className="panel">
            <div className="panel-header">
              <div>
                <h2>Source Media</h2>
                <p>
                  Upload your own Cloudinary videos, or keep shipping against the demo assets while
                  the editing flow stabilizes.
                </p>
              </div>
              <span className="panel-badge">
                {hasUploadPreset && !isDemoCloud ? 'Unsigned widget ready' : 'Sample-cloud mode'}
              </span>
            </div>

            <div className="source-grid">
              <article className="source-card">
                <div className="source-preview">
                  <video
                    className="source-video"
                    src={sourcePreviewUrl}
                    muted
                    autoPlay
                    loop
                    playsInline
                  />
                </div>
                <div className="source-meta">
                  <div>
                    <strong>{sourceAsset.label}</strong>
                    <span>
                      {sourceAsset.source === 'sample'
                        ? 'Cloudinary demo asset'
                        : 'Uploaded to your cloud'}
                    </span>
                  </div>
                  <code>{sourceAsset.publicId}</code>
                  <span>
                    {formatDuration(sourceAsset.duration)} • {formatBytes(sourceAsset.bytes)}
                  </span>
                </div>
                <div className="source-actions">
                  <UploadWidget
                    onUploadSuccess={handleSourceUploadSuccess}
                    onUploadError={handleUploadError}
                    buttonText="Upload source video"
                    resourceType="video"
                    clientAllowedFormats={['mp4', 'mov', 'm4v', 'webm']}
                  />
                  <button
                    className="button button--ghost"
                    type="button"
                    onClick={() => setSourceAsset(SAMPLE_PRIMARY_ASSET)}
                  >
                    Use sample
                  </button>
                </div>
              </article>

              <article className="source-card">
                <div className="source-preview">
                  <video
                    className="source-video"
                    src={gameplayPreviewUrl}
                    muted
                    autoPlay
                    loop
                    playsInline
                  />
                </div>
                <div className="source-meta">
                  <div>
                    <strong>{gameplayAsset.label}</strong>
                    <span>
                      {draft.includeGameplay
                        ? 'Live lower-half composite rendering enabled'
                        : 'Attach a gameplay layer for a stacked render'}
                    </span>
                  </div>
                  <code>{gameplayAsset.publicId || gameplayAsset.secureUrl}</code>
                  <span>
                    {formatDuration(gameplayAsset.duration)} • {formatBytes(gameplayAsset.bytes)}
                  </span>
                </div>
                <div className="source-actions">
                  <UploadWidget
                    onUploadSuccess={handleGameplayUploadSuccess}
                    onUploadError={handleUploadError}
                    buttonText="Upload gameplay bed"
                    resourceType="video"
                    clientAllowedFormats={['mp4', 'mov', 'm4v', 'webm']}
                  />
                  <button
                    className="button button--ghost"
                    type="button"
                    onClick={() => setGameplayAsset(SAMPLE_GAMEPLAY_ASSET)}
                  >
                    Use sample
                  </button>
                </div>
                <div className="remote-gameplay">
                  <label className="field field--full">
                    <span>Remote gameplay URL</span>
                    <input
                      data-testid="gameplay-remote-input"
                      value={remoteGameplayUrl}
                      onChange={(event) => setRemoteGameplayUrl(event.target.value)}
                      placeholder="https://example.com/gameplay.mp4"
                    />
                  </label>
                  <p className="remote-gameplay-hint">
                    Paste a direct MP4/WebM URL here. If you only have a page URL, use the
                    {' '}
                    <code>npm run resolve:gameplay -- &lt;url&gt;</code> helper first.
                  </p>
                  <button
                    className="button button--ghost"
                    type="button"
                    data-testid="attach-remote-gameplay-button"
                    onClick={attachRemoteGameplay}
                  >
                    Attach remote gameplay
                  </button>
                </div>
              </article>
            </div>
          </section>

          <section className="panel">
            <div className="panel-header">
              <div>
                <h2>Story Recipe</h2>
                <p>
                  Preset stacks let you pivot between explainers, promo reels, and gameplay-backed
                  creator edits.
                </p>
              </div>
            </div>
            <div className="preset-grid">
              {STORY_PRESETS.map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  data-testid={`preset-${preset.id}`}
                  className={`preset-card ${
                    draft.storyPresetId === preset.id ? 'preset-card--active' : ''
                  }`}
                  onClick={() => applyStoryPreset(preset)}
                >
                  <span className="preset-kicker">{preset.challengeFit}</span>
                  <strong>{preset.label}</strong>
                  <p>{preset.description}</p>
                </button>
              ))}
            </div>
          </section>

          <section className="panel">
            <div className="panel-header">
              <div>
                <h2>Editing Controls</h2>
                <p>
                  Everything here feeds the generated Cloudinary delivery URLs and export manifests.
                </p>
              </div>
            </div>

            <div className="control-grid">
              <label className="field">
                <span>Hook headline</span>
                <input
                  value={draft.headline}
                  onChange={(event) => updateDraft('headline', event.target.value)}
                  maxLength={90}
                  placeholder="Lead with the payoff"
                />
              </label>

              <label className="field">
                <span>CTA label</span>
                <input
                  value={draft.ctaLabel}
                  onChange={(event) => updateDraft('ctaLabel', event.target.value)}
                  maxLength={40}
                  placeholder="Watch the full video"
                />
              </label>

              <label className="field field--full">
                <span>Caption seed</span>
                <textarea
                  rows={4}
                  value={draft.captionSeed}
                  onChange={(event) => updateDraft('captionSeed', event.target.value)}
                  placeholder="Paste the sentence or transcript excerpt you want burned into the output."
                />
              </label>

              <label className="field">
                <span>Clip duration</span>
                <select
                  value={draft.clipDuration}
                  onChange={(event) => updateDraft('clipDuration', Number(event.target.value))}
                >
                  {[15, 20, 30, 45].map((value) => (
                    <option key={value} value={value}>
                      {value} seconds
                    </option>
                  ))}
                </select>
              </label>

              <label className="field">
                <span>Caption theme</span>
                <select
                  value={draft.captionThemeId}
                  onChange={(event) =>
                    updateDraft(
                      'captionThemeId',
                      event.target.value as CreatorDraft['captionThemeId']
                    )
                  }
                >
                  {CAPTION_THEMES.map((theme) => (
                    <option key={theme.id} value={theme.id}>
                      {theme.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="field field--full">
                <span>Start offset ({draft.startOffset}s)</span>
                <input
                  type="range"
                  min="0"
                  max="30"
                  step="1"
                  value={draft.startOffset}
                  onChange={(event) => updateDraft('startOffset', Number(event.target.value))}
                />
              </label>
            </div>

            <div className="toggle-grid">
              <label className="toggle">
                <input
                  type="checkbox"
                  checked={draft.useAiPreview}
                  onChange={(event) => updateDraft('useAiPreview', event.target.checked)}
                />
                <span>
                  <strong>Generate AI preview URL</strong>
                  <small>
                    Uses Cloudinary&apos;s preview effect for sponsor-side wow factor.
                  </small>
                </span>
              </label>

              <label className="toggle">
                <input
                  type="checkbox"
                  checked={draft.includeGameplay}
                  onChange={(event) => updateDraft('includeGameplay', event.target.checked)}
                />
                <span>
                  <strong>Enable gameplay composite</strong>
                  <small>
                    Render a second video into the lower half of each Cloudinary delivery URL.
                  </small>
                </span>
              </label>
            </div>

            <div className="platform-row">
              {PLATFORM_PRESETS.map((platform) => {
                const active = draft.platforms.includes(platform.id);
                return (
                  <button
                    key={platform.id}
                    type="button"
                    data-testid={`platform-${platform.id}`}
                    className={`platform-pill ${active ? 'platform-pill--active' : ''}`}
                    onClick={() => togglePlatform(platform.id)}
                  >
                    {platform.label}
                  </button>
                );
              })}
            </div>
          </section>

          <section className="panel">
            <div className="panel-header">
              <div>
                <h2>Integration Readiness</h2>
                <p>
                  The repo is staged for Vercel deploys, Cloudinary MCP, and optional Supabase
                  storage.
                </p>
              </div>
            </div>
            <ul className="readiness-list">
              <li>
                <strong>Cloudinary widget</strong>
                <span>
                  {hasUploadPreset
                    ? 'Unsigned uploads are live.'
                    : 'Add VITE_CLOUDINARY_UPLOAD_PRESET to upload real videos.'}
                </span>
              </li>
              <li>
                <strong>Cloudinary MCP</strong>
                <span>
                  `.mcp.json` is generated and points at Cloudinary asset and env config endpoints.
                </span>
              </li>
              <li>
                <strong>Vercel routes</strong>
                <span>
                  `/api/health`, `/api/render-manifest`, and `/api/sign-cloudinary` are included.
                </span>
              </li>
              <li>
                <strong>Supabase</strong>
                <span>
                  {hasSupabaseBrowserConfig
                    ? 'Browser client is configured.'
                    : 'Use the included schema when you want auth and saved jobs.'}
                </span>
              </li>
            </ul>
          </section>
        </aside>

        <section className="preview-column">
          <section className="panel panel--preview">
            <div className="panel-header">
              <div>
                <h2>Output Preview</h2>
                <p>
                  Posters render immediately from Cloudinary video frames. Final delivery URLs are
                  attached to each card, and AI preview URLs can take a moment to materialize on
                  first request.
                </p>
              </div>
              {statusMessage ? (
                <span className="panel-badge panel-badge--live">{statusMessage}</span>
              ) : null}
            </div>

            <div className="preview-grid">
              {manifests.map((manifest) => (
                <article
                  className="preview-card"
                  key={manifest.id}
                  data-testid="preview-card"
                  data-composition-mode={manifest.compositionMode}
                >
                  <div className="phone-frame">
                    <img
                      className="phone-poster"
                      src={manifest.posterUrl}
                      alt={`${manifest.platform.label} poster preview`}
                    />
                    <div
                      className="safe-zone safe-zone--top"
                      style={{
                        height: `${(manifest.platform.safeTop / manifest.platform.height) * 100}%`,
                      }}
                    />
                    <div
                      className="safe-zone safe-zone--bottom"
                      style={{
                        height: `${(manifest.platform.safeBottom / manifest.platform.height) * 100}%`,
                      }}
                    />
                    <div className="hook-banner">{draft.headline}</div>
                    <div className={`caption-stack caption-stack--${draft.captionThemeId}`}>
                      {manifest.captionLines.map((line) => (
                        <span key={line}>{line}</span>
                      ))}
                    </div>
                    {draft.includeGameplay ? (
                      <div className="gameplay-banner">
                        Gameplay composite live:{' '}
                        {manifest.gameplayLabel ?? 'Upload or keep sample'}
                      </div>
                    ) : null}
                    <div className="cta-chip">{draft.ctaLabel}</div>
                  </div>

                  <div className="preview-meta">
                    <div className="preview-header">
                      <div>
                        <strong>{manifest.platform.label}</strong>
                        <span>{manifest.platform.exportLabel}</span>
                      </div>
                      <div className="preview-actions">
                        <button
                          className="mini-button"
                          type="button"
                          onClick={() => void copyText(`url-${manifest.id}`, manifest.deliveryUrl)}
                        >
                          {copiedToken === `url-${manifest.id}` ? 'Copied' : 'Copy URL'}
                        </button>
                        <a
                          className="mini-button mini-button--link"
                          href={manifest.deliveryUrl}
                          target="_blank"
                          rel="noreferrer"
                        >
                          Open render
                        </a>
                      </div>
                    </div>

                    <ul className="summary-list">
                      {manifest.transformationSummary.map((summary) => (
                        <li key={summary}>{summary}</li>
                      ))}
                    </ul>

                    <code className="recipe">{manifest.transformationRecipe}</code>

                    {manifest.aiPreviewUrl ? (
                      <a
                        className="secondary-link"
                        href={manifest.aiPreviewUrl}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Open AI preview URL
                      </a>
                    ) : null}
                  </div>
                </article>
              ))}
            </div>
          </section>

          <section className="panel">
            <div className="panel-header">
              <div>
                <h2>Manifest Console</h2>
                <p>
                  This is the payload a Vercel function or queue worker can use to drive final
                  exports.
                </p>
              </div>
            </div>
            <pre className="manifest-console">{manifestJson}</pre>
          </section>

          <section className="panel">
            <div className="panel-header">
              <div>
                <h2>Recent Snapshots</h2>
                <p>
                  Saved locally now, with optional Supabase sync when browser credentials are
                  present.
                </p>
              </div>
            </div>
            {savedExports.length ? (
              <ul className="snapshot-list">
                {savedExports.map((entry) => (
                  <li key={entry.id}>
                    <div>
                      <strong>{entry.headline}</strong>
                      <span>
                        {new Date(entry.createdAt).toLocaleString()} •{' '}
                        {entry.platforms.join(', ')}
                      </span>
                    </div>
                    <button
                      className="mini-button"
                      type="button"
                      onClick={() => void copyText(`snapshot-${entry.id}`, entry.payload)}
                    >
                      {copiedToken === `snapshot-${entry.id}` ? 'Copied' : 'Copy payload'}
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="empty-state">
                Save a snapshot after tuning the recipe and it will appear here for quick reuse.
              </p>
            )}
          </section>
        </section>
      </main>
    </div>
  );
}

export default App;
