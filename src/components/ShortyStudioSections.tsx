import shortyBolt from '../assets/shorty-bolt.svg';
import { UploadWidget } from '../cloudinary/UploadWidget';
import type { CloudinaryUploadResult } from '../cloudinary/UploadWidget';
import type {
  CaptionTheme,
  CreatorDraft,
  PlatformPreset,
  RenderManifest,
  SavedExport,
  StoryPreset,
} from '../types';
import type {
  ShortyAssetCardModel,
  ShortyStudioModel,
} from '../shorty/ShortyStudioModel';

interface ShortyHeroProps {
  model: ShortyStudioModel;
  copiedToken: string | null;
  isSaving: boolean;
  onCopyManifest: () => void;
  onSaveSnapshot: () => void;
}

export function ShortyHero({
  model,
  copiedToken,
  isSaving,
  onCopyManifest,
  onSaveSnapshot,
}: ShortyHeroProps) {
  return (
    <header className="shorty-hero">
      <section className="shorty-hero__primary">
        <div className="shorty-brandbar">
          <div className="shorty-brand">
            <div className="shorty-brand__logo-wrap">
              <img className="shorty-brand__logo" src={shortyBolt} alt="Shorty logo" />
            </div>
            <div className="shorty-brand__meta">
              <span>Shorty / creator studio</span>
              <strong>Short-form editor</strong>
            </div>
          </div>
          <div className="shorty-brandbar__status">Shorts-ready workflow</div>
        </div>

        <span className="shorty-kicker">{model.eyebrow}</span>
        <h1>{model.brandName}</h1>
        <p>{model.heroBody}</p>

        <div className="shorty-actions">
          <button
            className="shorty-button shorty-button--solid"
            type="button"
            data-testid="copy-manifest-button"
            onClick={onCopyManifest}
          >
            {copiedToken === 'manifest' ? 'Manifest copied' : 'Copy manifest JSON'}
          </button>
          <button
            className="shorty-button shorty-button--ghost"
            type="button"
            data-testid="save-snapshot-button"
            disabled={isSaving}
            onClick={onSaveSnapshot}
          >
            {isSaving ? 'Saving…' : 'Save snapshot'}
          </button>
        </div>

        <div className="shorty-chip-row">
          {model.chips.map((chip) => (
            <span
              key={chip.label}
              className={`shorty-chip shorty-chip--${chip.tone ?? 'default'}`}
            >
              {chip.label}
            </span>
          ))}
        </div>
      </section>

      <section className="shorty-hero__rail">
        <article className="shorty-hero-visual">
          <div className="shorty-hero-visual__copy">
            <span>Creator flow</span>
            <strong>Shape once. Publish across Shorts, Reels, and TikTok.</strong>
            <p>
              Keep the workflow clean: source clip first, gameplay only when needed, then export
              platform-safe renders without fighting the editor.
            </p>
          </div>
          <div className="shorty-hero-visual__mark">
            <img className="shorty-hero-visual__logo" src={shortyBolt} alt="Shorty mark" />
          </div>
        </article>

        <section className="shorty-stage-grid">
          {model.stageCards.map((card) => (
            <article className="shorty-stage-card" key={`${card.eyebrow}-${card.title}`}>
              <span className="shorty-stage-card__eyebrow">{card.eyebrow}</span>
              <strong>{card.title}</strong>
              <p>{card.body}</p>
            </article>
          ))}
        </section>
      </section>
    </header>
  );
}

interface ShortyAssetCardProps {
  card: ShortyAssetCardModel;
  previewUrl: string;
  uploadText: string;
  secondaryActionLabel: string;
  remoteGameplayUrl?: string;
  onRemoteGameplayUrlChange?: (value: string) => void;
  onAttachRemoteGameplay?: () => void;
  onUploadSuccess: (result: CloudinaryUploadResult) => void;
  onUploadError: (error: Error) => void;
  onSecondaryAction: () => void;
}

function ShortyAssetCard({
  card,
  previewUrl,
  uploadText,
  secondaryActionLabel,
  remoteGameplayUrl,
  onRemoteGameplayUrlChange,
  onAttachRemoteGameplay,
  onUploadSuccess,
  onUploadError,
  onSecondaryAction,
}: ShortyAssetCardProps) {
  return (
    <article className="shorty-asset-card">
      <div className="shorty-asset-card__frame">
        <video
          className="shorty-asset-card__video"
          src={previewUrl}
          muted
          autoPlay
          loop
          playsInline
        />
      </div>

      <div className="shorty-asset-card__meta">
        <span className="shorty-asset-card__eyebrow">{card.heading}</span>
        <strong>{card.asset.label}</strong>
        <p>{card.subtitle}</p>
        <code>{card.identifier}</code>
        <span>{card.metrics}</span>
      </div>

      <div className="shorty-asset-card__actions">
        <UploadWidget
          onUploadSuccess={onUploadSuccess}
          onUploadError={onUploadError}
          buttonText={uploadText}
          resourceType="video"
          clientAllowedFormats={['mp4', 'mov', 'm4v', 'webm']}
        />
        <button
          className="shorty-button shorty-button--ghost"
          type="button"
          onClick={onSecondaryAction}
        >
          {secondaryActionLabel}
        </button>
      </div>

      {typeof remoteGameplayUrl === 'string' ? (
        <div className="shorty-remote">
          <label className="shorty-field shorty-field--full">
            <span>Remote gameplay feed</span>
            <input
              data-testid="gameplay-remote-input"
              value={remoteGameplayUrl}
              onChange={(event) => onRemoteGameplayUrlChange?.(event.target.value)}
              placeholder="https://example.com/gameplay.mp4"
            />
          </label>
          <p>
            Direct MP4/WebM URLs work immediately. If you only have a page URL, resolve it first
            with <code>npm run resolve:gameplay -- &lt;url&gt;</code>.
          </p>
          <button
            className="shorty-button shorty-button--ghost"
            type="button"
            data-testid="attach-remote-gameplay-button"
            onClick={onAttachRemoteGameplay}
          >
            Attach remote feed
          </button>
        </div>
      ) : null}
    </article>
  );
}

interface ShortyMediaSectionProps {
  model: ShortyStudioModel;
  sourcePreviewUrl: string;
  gameplayPreviewUrl: string;
  remoteGameplayUrl: string;
  onRemoteGameplayUrlChange: (value: string) => void;
  onSourceUploadSuccess: (result: CloudinaryUploadResult) => void;
  onGameplayUploadSuccess: (result: CloudinaryUploadResult) => void;
  onUploadError: (error: Error) => void;
  onUseSampleSource: () => void;
  onUseSampleGameplay: () => void;
  onAttachRemoteGameplay: () => void;
}

export function ShortyMediaSection({
  model,
  sourcePreviewUrl,
  gameplayPreviewUrl,
  remoteGameplayUrl,
  onRemoteGameplayUrlChange,
  onSourceUploadSuccess,
  onGameplayUploadSuccess,
  onUploadError,
  onUseSampleSource,
  onUseSampleGameplay,
  onAttachRemoteGameplay,
}: ShortyMediaSectionProps) {
  return (
    <section className="shorty-panel">
      <div className="shorty-panel__header">
        <div>
          <span className="shorty-panel__step">01</span>
          <h2>Media shelf</h2>
          <p>Start with the main clip. Add gameplay only when the cut needs extra movement.</p>
        </div>
        <span className="shorty-panel__badge">
          {model.uploadsAvailable ? 'Uploads live' : 'Sample mode'}
        </span>
      </div>

      {model.uploadAlert ? <div className="shorty-panel__alert">{model.uploadAlert}</div> : null}

      <div className="shorty-asset-grid">
        <ShortyAssetCard
          card={model.sourceCard}
          previewUrl={sourcePreviewUrl}
          uploadText="Upload source"
          secondaryActionLabel="Use built-in clip"
          onUploadSuccess={onSourceUploadSuccess}
          onUploadError={onUploadError}
          onSecondaryAction={onUseSampleSource}
        />
        <ShortyAssetCard
          card={model.gameplayCard}
          previewUrl={gameplayPreviewUrl}
          uploadText="Upload gameplay"
          secondaryActionLabel="Use built-in clip"
          remoteGameplayUrl={remoteGameplayUrl}
          onRemoteGameplayUrlChange={onRemoteGameplayUrlChange}
          onAttachRemoteGameplay={onAttachRemoteGameplay}
          onUploadSuccess={onGameplayUploadSuccess}
          onUploadError={onUploadError}
          onSecondaryAction={onUseSampleGameplay}
        />
      </div>
    </section>
  );
}

interface ShortyStyleSectionProps {
  presets: StoryPreset[];
  activePresetId: CreatorDraft['storyPresetId'];
  onApplyPreset: (preset: StoryPreset) => void;
}

export function ShortyStyleSection({
  presets,
  activePresetId,
  onApplyPreset,
}: ShortyStyleSectionProps) {
  return (
    <section className="shorty-panel">
      <div className="shorty-panel__header">
        <div>
          <span className="shorty-panel__step">02</span>
          <h2>Format packs</h2>
          <p>Pick the tone first. Everything else can be tuned after.</p>
        </div>
      </div>

      <div className="shorty-style-grid">
        {presets.map((preset) => (
          <button
            key={preset.id}
            type="button"
            data-testid={`preset-${preset.id}`}
            className={`shorty-style-card ${
              activePresetId === preset.id ? 'shorty-style-card--active' : ''
            }`}
            onClick={() => onApplyPreset(preset)}
          >
            <span>{preset.challengeFit}</span>
            <strong>{preset.label}</strong>
            <p>{preset.description}</p>
          </button>
        ))}
      </div>
    </section>
  );
}

interface ShortyControlSectionProps {
  draft: CreatorDraft;
  captionThemes: CaptionTheme[];
  platforms: PlatformPreset[];
  onHeadlineChange: (value: string) => void;
  onCtaChange: (value: string) => void;
  onCaptionSeedChange: (value: string) => void;
  onClipDurationChange: (value: number) => void;
  onCaptionThemeChange: (value: CreatorDraft['captionThemeId']) => void;
  onStartOffsetChange: (value: number) => void;
  onUseAiPreviewChange: (value: boolean) => void;
  onIncludeGameplayChange: (value: boolean) => void;
  onTogglePlatform: (platformId: PlatformPreset['id']) => void;
}

export function ShortyControlSection({
  draft,
  captionThemes,
  platforms,
  onHeadlineChange,
  onCtaChange,
  onCaptionSeedChange,
  onClipDurationChange,
  onCaptionThemeChange,
  onStartOffsetChange,
  onUseAiPreviewChange,
  onIncludeGameplayChange,
  onTogglePlatform,
}: ShortyControlSectionProps) {
  return (
    <section className="shorty-panel">
      <div className="shorty-panel__header">
        <div>
          <span className="shorty-panel__step">03</span>
          <h2>Cut controls</h2>
          <p>Tune the hook, captions, and destinations without losing the edit.</p>
        </div>
      </div>

      <div className="shorty-form-grid">
        <label className="shorty-field">
          <span>Headline</span>
          <input
            value={draft.headline}
            onChange={(event) => onHeadlineChange(event.target.value)}
            maxLength={90}
            placeholder="Lead with the payoff"
          />
        </label>

        <label className="shorty-field">
          <span>CTA</span>
          <input
            value={draft.ctaLabel}
            onChange={(event) => onCtaChange(event.target.value)}
            maxLength={40}
            placeholder="Watch the full cut"
          />
        </label>

        <label className="shorty-field shorty-field--full">
          <span>Caption seed</span>
          <textarea
            rows={4}
            value={draft.captionSeed}
            onChange={(event) => onCaptionSeedChange(event.target.value)}
            placeholder="Paste the key sentence or transcript fragment you want the layout to emphasize."
          />
        </label>

        <label className="shorty-field">
          <span>Duration</span>
          <select
            value={draft.clipDuration}
            onChange={(event) => onClipDurationChange(Number(event.target.value))}
          >
            {[15, 20, 30, 45].map((value) => (
              <option key={value} value={value}>
                {value} seconds
              </option>
            ))}
          </select>
        </label>

        <label className="shorty-field">
          <span>Caption theme</span>
          <select
            value={draft.captionThemeId}
            onChange={(event) =>
              onCaptionThemeChange(event.target.value as CreatorDraft['captionThemeId'])
            }
          >
            {captionThemes.map((theme) => (
              <option key={theme.id} value={theme.id}>
                {theme.label}
              </option>
            ))}
          </select>
        </label>

        <label className="shorty-field shorty-field--full">
          <span>Start offset ({draft.startOffset}s)</span>
          <input
            type="range"
            min="0"
            max="30"
            step="1"
            value={draft.startOffset}
            onChange={(event) => onStartOffsetChange(Number(event.target.value))}
          />
        </label>
      </div>

      <div className="shorty-toggle-grid">
        <label className="shorty-toggle">
          <input
            type="checkbox"
            checked={draft.useAiPreview}
            onChange={(event) => onUseAiPreviewChange(event.target.checked)}
          />
          <span>
            <strong>AI preview</strong>
            <small>Generate a source-first highlight preview URL alongside the final render.</small>
          </span>
        </label>

        <label className="shorty-toggle">
          <input
            type="checkbox"
            checked={draft.includeGameplay}
            onChange={(event) => onIncludeGameplayChange(event.target.checked)}
          />
          <span>
            <strong>Gameplay stack</strong>
            <small>Lay a second video into the lower half of the vertical render.</small>
          </span>
        </label>
      </div>

      <div className="shorty-destination-row">
        {platforms.map((platform) => {
          const active = draft.platforms.includes(platform.id);
          return (
            <button
              key={platform.id}
              type="button"
              data-testid={`platform-${platform.id}`}
              className={`shorty-pill ${active ? 'shorty-pill--active' : ''}`}
              onClick={() => onTogglePlatform(platform.id)}
            >
              {platform.label}
            </button>
          );
        })}
      </div>
    </section>
  );
}

interface ShortyPreviewDeckProps {
  draft: CreatorDraft;
  manifests: RenderManifest[];
  copiedToken: string | null;
  statusMessage: string;
  onCopyRenderUrl: (manifestId: string, url: string) => void;
}

export function ShortyPreviewDeck({
  draft,
  manifests,
  copiedToken,
  statusMessage,
  onCopyRenderUrl,
}: ShortyPreviewDeckProps) {
  return (
    <section className="shorty-panel">
      <div className="shorty-panel__header">
        <div>
          <span className="shorty-panel__step">04</span>
          <h2>Preview queue</h2>
          <p>Check the vertical mockup, copy a render URL, or open the final output.</p>
        </div>
        {statusMessage ? (
          <span className="shorty-panel__badge shorty-panel__badge--live">{statusMessage}</span>
        ) : null}
      </div>

      <div className="shorty-preview-grid">
        {manifests.map((manifest) => (
          <article
            className="shorty-preview-card"
            key={manifest.id}
            data-testid="preview-card"
            data-composition-mode={manifest.compositionMode}
          >
            <div className="shorty-phone">
              <img
                className="shorty-phone__poster"
                src={manifest.posterUrl}
                alt={`${manifest.platform.label} poster preview`}
              />
              <div
                className="shorty-safe-zone shorty-safe-zone--top"
                style={{
                  height: `${(manifest.platform.safeTop / manifest.platform.height) * 100}%`,
                }}
              />
              <div
                className="shorty-safe-zone shorty-safe-zone--bottom"
                style={{
                  height: `${(manifest.platform.safeBottom / manifest.platform.height) * 100}%`,
                }}
              />
              <div className="shorty-hook">{draft.headline}</div>
              <div className={`shorty-captions shorty-captions--${draft.captionThemeId}`}>
                {manifest.captionLines.map((line) => (
                  <span key={line}>{line}</span>
                ))}
              </div>
              {draft.includeGameplay ? (
                <div className="shorty-gameplay-state">
                  Gameplay live: {manifest.gameplayLabel ?? 'Built-in gameplay'}
                </div>
              ) : null}
              <div className="shorty-cta">{draft.ctaLabel}</div>
            </div>

            <div className="shorty-preview-card__body">
              <div className="shorty-preview-card__header">
                <div>
                  <strong>{manifest.platform.label}</strong>
                  <span>{manifest.platform.exportLabel}</span>
                </div>
                <div className="shorty-preview-card__actions">
                  <button
                    className="shorty-mini-button"
                    type="button"
                    onClick={() => onCopyRenderUrl(manifest.id, manifest.deliveryUrl)}
                  >
                    {copiedToken === `url-${manifest.id}` ? 'Copied' : 'Copy link'}
                  </button>
                  <a
                    className="shorty-mini-button shorty-mini-button--link"
                    data-testid="render-link"
                    href={manifest.deliveryUrl}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Open render
                  </a>
                </div>
              </div>

              <div className="shorty-preview-pill-row">
                <span className="shorty-preview-pill">{manifest.platform.exportLabel}</span>
                <span className="shorty-preview-pill">
                  {manifest.compositionMode === 'gameplay-stack' ? 'Gameplay stack' : 'Single clip'}
                </span>
                {manifest.aiPreviewUrl ? (
                  <span className="shorty-preview-pill shorty-preview-pill--accent">
                    AI preview
                  </span>
                ) : null}
              </div>

              <ul className="shorty-summary-chips">
                {manifest.transformationSummary.slice(0, 4).map((summary) => (
                  <li key={summary}>{summary}</li>
                ))}
              </ul>

              <details className="shorty-inline-details">
                <summary>View render recipe</summary>
                <code className="shorty-recipe">{manifest.transformationRecipe}</code>
              </details>

              {manifest.aiPreviewUrl ? (
                <a
                  className="shorty-secondary-link"
                  href={manifest.aiPreviewUrl}
                  target="_blank"
                  rel="noreferrer"
                >
                  Open AI preview
                </a>
              ) : null}
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

interface ShortySnapshotsPanelProps {
  savedExports: SavedExport[];
  copiedToken: string | null;
  onCopySnapshot: (entry: SavedExport) => void;
}

export function ShortySnapshotsPanel({
  savedExports,
  copiedToken,
  onCopySnapshot,
}: ShortySnapshotsPanelProps) {
  return (
    <section className="shorty-panel">
      <div className="shorty-panel__header">
        <div>
          <h2>Snapshots</h2>
          <p>Save working states so you can jump between variations without rebuilding them.</p>
        </div>
      </div>

      {savedExports.length ? (
        <ul className="shorty-snapshot-list">
          {savedExports.map((entry) => (
            <li key={entry.id}>
              <div>
                <strong>{entry.headline}</strong>
                <span>
                  {new Date(entry.createdAt).toLocaleString()} • {entry.platforms.join(', ')}
                </span>
              </div>
              <button
                className="shorty-mini-button"
                type="button"
                onClick={() => onCopySnapshot(entry)}
              >
                {copiedToken === `snapshot-${entry.id}` ? 'Copied' : 'Copy payload'}
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="shorty-empty-state">
          Save a snapshot after tuning the cut and it will show up here for quick reuse.
        </p>
      )}
    </section>
  );
}

interface ShortySystemPanelProps {
  model: ShortyStudioModel;
}

export function ShortySystemPanel({ model }: ShortySystemPanelProps) {
  return (
    <details className="shorty-panel shorty-panel--collapsible">
      <summary className="shorty-details-summary">
        <div>
          <h2>System</h2>
          <p>Operational details live here so the main editor stays focused.</p>
        </div>
      </summary>

      <ul className="shorty-system-list">
        {model.systemRows.map((row) => (
          <li key={row.label}>
            <strong>{row.label}</strong>
            <span>{row.value}</span>
          </li>
        ))}
      </ul>
    </details>
  );
}

interface ShortyManifestPanelProps {
  manifestJson: string;
}

export function ShortyManifestPanel({ manifestJson }: ShortyManifestPanelProps) {
  return (
    <details className="shorty-panel shorty-panel--collapsible">
      <summary className="shorty-details-summary">
        <div>
          <h2>Manifest</h2>
          <p>Use the raw JSON when you need automation hooks, debugging, or API handoff.</p>
        </div>
      </summary>

      <pre className="shorty-manifest">{manifestJson}</pre>
    </details>
  );
}
