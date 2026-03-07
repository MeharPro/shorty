import {
  startTransition,
  useDeferredValue,
  useEffect,
  useState,
  type ReactNode,
  type SVGProps,
} from 'react';
import boltLogo from '../assets/bolt-logo.png';
import {
  UploadWidget,
  type CloudinaryUploadResult,
} from '../cloudinary/UploadWidget';
import { cloudName, isDemoCloud, uploadPreset } from '../cloudinary/config';
import {
  CAPTION_THEMES,
  PLATFORM_PRESETS,
  SAMPLE_GAMEPLAY_ASSET,
  SAMPLE_PRIMARY_ASSET,
  STORY_PRESETS,
} from '../data/presets';
import { loadDraft, loadExportHistory, saveDraft } from '../lib/persistence';
import {
  buildManifestPayload,
  buildPlayableSourceUrl,
  buildPreviewManifest,
} from '../lib/rendering';
import type { ShortySession } from '../lib/session';
import { hasSupabaseBrowserConfig } from '../lib/supabase';
import type {
  CreatorDraft,
  MediaAsset,
  RenderManifest,
  SavedExport,
} from '../types';
import { ShortyStudioController } from '../shorty/ShortyStudioController';
import {
  ShortyStudioModel,
  ShortyValueFormatter,
} from '../shorty/ShortyStudioModel';

const DEFAULT_STORY_PRESET = STORY_PRESETS[0];

const DEFAULT_DRAFT: CreatorDraft = {
  captionThemeId: CAPTION_THEMES[0].id,
  platforms: PLATFORM_PRESETS.map((platform) => platform.id),
  ...DEFAULT_STORY_PRESET.defaults,
};

const NAV_ITEMS = [
  { href: '#media', label: 'Dashboard', icon: 'home' as const, active: true },
  { href: '#media', label: 'Media', icon: 'video' as const },
  { href: '#presets', label: 'Presets', icon: 'sliders' as const },
  { href: '#outputs', label: 'Outputs', icon: 'layers' as const },
  { href: '#history', label: 'Snapshots', icon: 'clock' as const },
  { href: '#system', label: 'System', icon: 'terminal' as const },
];

type DashboardGlyphName =
  | 'arrow'
  | 'bell'
  | 'clock'
  | 'cloud'
  | 'copy'
  | 'document'
  | 'globe'
  | 'home'
  | 'layers'
  | 'save'
  | 'search'
  | 'settings'
  | 'sliders'
  | 'spark'
  | 'terminal'
  | 'user'
  | 'video'
  | 'wallet';

interface DashboardPageProps {
  session: ShortySession | null;
  onLogout: () => Promise<void>;
}

interface DashboardSectionHeadingProps {
  eyebrow?: string;
  title: string;
  description: string;
  action?: ReactNode;
}

interface DashboardSidebarItemProps {
  href: string;
  label: string;
  icon: DashboardGlyphName;
  active?: boolean;
}

interface AssetUploadCardProps {
  eyebrow: string;
  asset: MediaAsset;
  previewUrl: string;
  description: string;
  uploadText: string;
  secondaryActionLabel: string;
  onUploadSuccess: (result: CloudinaryUploadResult) => void;
  onUploadError: (error: Error) => void;
  onSecondaryAction: () => void;
  remoteGameplayUrl?: string;
  onRemoteGameplayUrlChange?: (value: string) => void;
  onAttachRemoteGameplay?: () => void;
}

interface PreviewPhoneCardProps {
  draft: CreatorDraft;
  manifest: RenderManifest;
  copiedToken: string | null;
  onCopyRenderUrl: (manifestId: string, url: string) => void;
}

function DashboardGlyph({
  name,
  ...props
}: { name: DashboardGlyphName } & SVGProps<SVGSVGElement>) {
  switch (name) {
    case 'home':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...props}>
          <path d="M3.5 10.75L12 4l8.5 6.75V20a1 1 0 0 1-1 1H14v-6h-4v6H4.5a1 1 0 0 1-1-1z" />
        </svg>
      );
    case 'video':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...props}>
          <rect x="3.5" y="6" width="13" height="12" rx="3" />
          <path d="M16.5 10l4-2.5v9L16.5 14z" />
        </svg>
      );
    case 'sliders':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...props}>
          <path d="M4 7h9" />
          <path d="M17 7h3" />
          <path d="M4 17h3" />
          <path d="M11 17h9" />
          <circle cx="15" cy="7" r="2.5" />
          <circle cx="9" cy="17" r="2.5" />
        </svg>
      );
    case 'layers':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...props}>
          <path d="M12 4l8 4-8 4-8-4 8-4z" />
          <path d="M4 12l8 4 8-4" />
          <path d="M4 16l8 4 8-4" />
        </svg>
      );
    case 'clock':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...props}>
          <circle cx="12" cy="12" r="8.5" />
          <path d="M12 7.5v5l3.5 2" />
        </svg>
      );
    case 'terminal':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...props}>
          <rect x="3.5" y="5" width="17" height="14" rx="3" />
          <path d="M7 10l2.5 2.5L7 15" />
          <path d="M12.5 15H17" />
        </svg>
      );
    case 'wallet':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...props}>
          <path d="M4.5 8h13a3 3 0 0 1 3 3v6a2.5 2.5 0 0 1-2.5 2.5H6A2.5 2.5 0 0 1 3.5 17V9A1 1 0 0 1 4.5 8z" />
          <path d="M6 8V6.5A2.5 2.5 0 0 1 8.5 4H18" />
          <circle cx="16.5" cy="13.5" r="1.2" fill="currentColor" stroke="none" />
        </svg>
      );
    case 'globe':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...props}>
          <circle cx="12" cy="12" r="8.5" />
          <path d="M4 9h16" />
          <path d="M4 15h16" />
          <path d="M12 3.5c2.8 2.8 4 5.63 4 8.5s-1.2 5.7-4 8.5c-2.8-2.8-4-5.63-4-8.5s1.2-5.7 4-8.5z" />
        </svg>
      );
    case 'document':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...props}>
          <path d="M8 3.5h6l4 4V19a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 6 19V5A1.5 1.5 0 0 1 7.5 3.5z" />
          <path d="M14 3.5V8h4" />
          <path d="M9 12h6" />
          <path d="M9 16h4" />
        </svg>
      );
    case 'spark':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...props}>
          <path d="M12 3l1.8 4.7L18.5 9l-4.7 1.8L12 15.5l-1.8-4.7L5.5 9l4.7-1.3z" />
          <path d="M18.5 15.5l.9 2.4 2.4.9-2.4.9-.9 2.4-.9-2.4-2.4-.9 2.4-.9z" />
        </svg>
      );
    case 'search':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...props}>
          <circle cx="11" cy="11" r="6.5" />
          <path d="M16 16l4 4" />
        </svg>
      );
    case 'bell':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...props}>
          <path d="M8 18h8" />
          <path d="M9.25 19a2.75 2.75 0 0 0 5.5 0" />
          <path d="M6 16c1.5-1.3 2-3.35 2-5V10a4 4 0 1 1 8 0v1c0 1.65.5 3.7 2 5z" />
        </svg>
      );
    case 'settings':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...props}>
          <circle cx="12" cy="12" r="3" />
          <path d="M19 12a7 7 0 0 0-.1-1l2-1.5-2-3.5-2.4 1a8.5 8.5 0 0 0-1.7-1L14.5 3h-5l-.3 3a8.5 8.5 0 0 0-1.7 1l-2.4-1-2 3.5 2 1.5a7 7 0 0 0 0 2l-2 1.5 2 3.5 2.4-1a8.5 8.5 0 0 0 1.7 1l.3 3h5l.3-3a8.5 8.5 0 0 0 1.7-1l2.4 1 2-3.5-2-1.5c.07-.33.1-.67.1-1z" />
        </svg>
      );
    case 'copy':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...props}>
          <rect x="8" y="8" width="11" height="11" rx="2.5" />
          <path d="M5 15V7a2 2 0 0 1 2-2h8" />
        </svg>
      );
    case 'save':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...props}>
          <path d="M5 4.5h11l3 3V19a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 5 19z" />
          <path d="M8 4.5v5h7v-5" />
          <path d="M8 20.5V14h8v6.5" />
        </svg>
      );
    case 'cloud':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...props}>
          <path d="M8 18.5h9A3.5 3.5 0 0 0 17 11a4.75 4.75 0 0 0-9.1-1.9A3.75 3.75 0 0 0 8 18.5z" />
        </svg>
      );
    case 'user':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...props}>
          <circle cx="12" cy="8" r="3.2" />
          <path d="M5.5 19a6.5 6.5 0 0 1 13 0" />
        </svg>
      );
    case 'arrow':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...props}>
          <path d="M5 12h14" />
          <path d="M13 6l6 6-6 6" />
        </svg>
      );
    default:
      return null;
  }
}

function DashboardSectionHeading({
  eyebrow,
  title,
  description,
  action,
}: DashboardSectionHeadingProps) {
  return (
    <div className="purity-section-heading">
      <div>
        {eyebrow ? <span className="purity-section-heading__eyebrow">{eyebrow}</span> : null}
        <h2>{title}</h2>
        <p>{description}</p>
      </div>
      {action ? <div className="purity-section-heading__action">{action}</div> : null}
    </div>
  );
}

function DashboardSidebarItem({
  href,
  label,
  icon,
  active = false,
}: DashboardSidebarItemProps) {
  return (
    <a
      className={`purity-sidebar__link ${active ? 'purity-sidebar__link--active' : ''}`}
      href={href}
    >
      <span className="purity-sidebar__icon">
        <DashboardGlyph aria-hidden="true" height={16} name={icon} width={16} />
      </span>
      <span>{label}</span>
    </a>
  );
}

function AssetUploadCard({
  eyebrow,
  asset,
  previewUrl,
  description,
  uploadText,
  secondaryActionLabel,
  onUploadSuccess,
  onUploadError,
  onSecondaryAction,
  remoteGameplayUrl,
  onRemoteGameplayUrlChange,
  onAttachRemoteGameplay,
}: AssetUploadCardProps) {
  return (
    <article className="purity-upload-card">
      <div className="purity-upload-card__media">
        <video
          autoPlay
          className="purity-upload-card__video"
          loop
          muted
          playsInline
          src={previewUrl}
        />
      </div>

      <div className="purity-upload-card__body">
        <span className="purity-upload-card__eyebrow">{eyebrow}</span>
        <strong>{asset.label}</strong>
        <p>{description}</p>

        <div className="purity-token-list">
          <span>{ShortyValueFormatter.duration(asset.duration)}</span>
          <span>{ShortyValueFormatter.bytes(asset.bytes)}</span>
          <span>{asset.source}</span>
        </div>

        <code>{asset.publicId || asset.secureUrl}</code>

        <div className="purity-button-row">
          <UploadWidget
            buttonText={uploadText}
            className="purity-upload-card__widget"
            clientAllowedFormats={['mp4', 'mov', 'm4v', 'webm']}
            onUploadError={onUploadError}
            onUploadSuccess={onUploadSuccess}
            resourceType="video"
          />
          <button className="purity-button purity-button--ghost" type="button" onClick={onSecondaryAction}>
            {secondaryActionLabel}
          </button>
        </div>

        {typeof remoteGameplayUrl === 'string' ? (
          <div className="purity-remote-field">
            <label className="purity-field">
              <span>Remote gameplay feed</span>
              <input
                data-testid="gameplay-remote-input"
                placeholder="https://example.com/gameplay.mp4"
                value={remoteGameplayUrl}
                onChange={(event) => onRemoteGameplayUrlChange?.(event.target.value)}
              />
            </label>
            <button
              className="purity-button purity-button--ghost"
              data-testid="attach-remote-gameplay-button"
              type="button"
              onClick={onAttachRemoteGameplay}
            >
              Attach remote feed
            </button>
          </div>
        ) : null}
      </div>
    </article>
  );
}

function PreviewPhoneCard({
  draft,
  manifest,
  copiedToken,
  onCopyRenderUrl,
}: PreviewPhoneCardProps) {
  return (
    <article
      className="purity-phone-card"
      data-composition-mode={manifest.compositionMode}
      data-testid="preview-card"
    >
      <div className="purity-phone">
        <img
          alt={`${manifest.platform.label} poster preview`}
          className="purity-phone__poster"
          src={manifest.posterUrl}
        />
        <div
          className="purity-phone__safe-zone purity-phone__safe-zone--top"
          style={{
            height: `${(manifest.platform.safeTop / manifest.platform.height) * 100}%`,
          }}
        />
        <div
          className="purity-phone__safe-zone purity-phone__safe-zone--bottom"
          style={{
            height: `${(manifest.platform.safeBottom / manifest.platform.height) * 100}%`,
          }}
        />
        <div className="purity-phone__headline">{draft.headline}</div>
        <div className={`purity-phone__captions purity-phone__captions--${draft.captionThemeId}`}>
          {manifest.captionLines.map((line) => (
            <span key={line}>{line}</span>
          ))}
        </div>
        {draft.includeGameplay ? (
          <div className="purity-phone__gameplay">
            Gameplay live: {manifest.gameplayLabel ?? 'Built-in gameplay'}
          </div>
        ) : null}
        <div className="purity-phone__cta">{draft.ctaLabel}</div>
      </div>

      <div className="purity-phone-card__body">
        <div className="purity-phone-card__header">
          <div>
            <strong>{manifest.platform.label}</strong>
            <span>{manifest.platform.exportLabel}</span>
          </div>
          <div className="purity-phone-card__actions">
            <button
              className="purity-mini-button"
              type="button"
              onClick={() => onCopyRenderUrl(manifest.id, manifest.deliveryUrl)}
            >
              {copiedToken === `url-${manifest.id}` ? 'Copied' : 'Copy link'}
            </button>
            <a
              className="purity-mini-button purity-mini-button--link"
              data-testid="render-link"
              href={manifest.deliveryUrl}
              rel="noreferrer"
              target="_blank"
            >
              Open render
            </a>
          </div>
        </div>

        <div className="purity-token-list">
          <span>{manifest.platform.exportLabel}</span>
          <span>{manifest.compositionMode === 'gameplay-stack' ? 'Gameplay stack' : 'Single clip'}</span>
          {manifest.aiPreviewUrl ? <span>AI preview</span> : null}
        </div>

        <ul className="purity-summary-list">
          {manifest.transformationSummary.slice(0, 4).map((summary) => (
            <li key={summary}>{summary}</li>
          ))}
        </ul>
      </div>
    </article>
  );
}

export function DashboardPage({ session, onLogout }: DashboardPageProps) {
  const [draft, setDraft] = useState<CreatorDraft>(() => loadDraft() ?? DEFAULT_DRAFT);
  const [sourceAsset, setSourceAsset] = useState<MediaAsset>(SAMPLE_PRIMARY_ASSET);
  const [gameplayAsset, setGameplayAsset] = useState<MediaAsset>(SAMPLE_GAMEPLAY_ASSET);
  const [savedExports, setSavedExports] = useState<SavedExport[]>(() => loadExportHistory());
  const [statusMessage, setStatusMessage] = useState('');
  const [copiedToken, setCopiedToken] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [remoteGameplayUrl, setRemoteGameplayUrl] = useState('');
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  const deferredDraft = useDeferredValue(draft);
  const storyPreset =
    STORY_PRESETS.find((preset) => preset.id === deferredDraft.storyPresetId) ??
    DEFAULT_STORY_PRESET;
  const captionTheme =
    CAPTION_THEMES.find((theme) => theme.id === deferredDraft.captionThemeId) ??
    CAPTION_THEMES[0];

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

  const model = new ShortyStudioModel({
    cloudName,
    hasSupabaseBrowserConfig,
    hasUploadPreset: Boolean(uploadPreset),
    isDemoCloud,
    manifests,
    storyPreset,
    captionTheme,
    draft: deferredDraft,
    sourceAsset,
    gameplayAsset,
    savedExports,
  });

  const controller = new ShortyStudioController({
    draft,
    sourceAsset,
    savedExports,
    manifests,
    manifestJson,
    setDraft,
    setSourceAsset,
    setGameplayAsset,
    setSavedExports,
    setStatusMessage,
    setIsSaving,
    setRemoteGameplayUrl,
  });

  useEffect(() => {
    saveDraft(draft);
  }, [draft]);

  useEffect(() => {
    if (!statusMessage) {
      return undefined;
    }

    const timeout = window.setTimeout(() => setStatusMessage(''), 4200);
    return () => window.clearTimeout(timeout);
  }, [statusMessage]);

  const sourcePreviewUrl = buildPlayableSourceUrl(sourceAsset);
  const gameplayPreviewUrl = buildPlayableSourceUrl(gameplayAsset);
  const copyText = async (token: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedToken(token);
      setStatusMessage('Copied to clipboard.');
      window.setTimeout(() => {
        setCopiedToken((current) => (current === token ? null : current));
      }, 2000);
    } catch {
      setStatusMessage('Clipboard access is unavailable in this browser.');
    }
  };

  const handleLogout = async () => {
    setIsLoggingOut(true);

    try {
      await onLogout();
      setStatusMessage('Workspace session cleared.');
    } finally {
      setIsLoggingOut(false);
    }
  };

  return (
    <div className="purity-app">
      <aside className="purity-sidebar">
        <a className="purity-sidebar__brand" href="#media">
          <span className="purity-sidebar__brand-mark">
            <img alt="Shorty logo" src={boltLogo} />
          </span>
          <span className="purity-sidebar__brand-copy">
            <strong>Shorty Dashboard</strong>
            <span>Purity shell</span>
          </span>
        </a>

        <div className="purity-sidebar__separator" />

        <nav className="purity-sidebar__nav" aria-label="Dashboard">
          {NAV_ITEMS.map((item) => (
            <DashboardSidebarItem key={item.label} {...item} />
          ))}
        </nav>

        <section className="purity-auth-card">
          {session ? (
            <>
              <span className="purity-auth-card__eyebrow">Session</span>
              <strong>{session.name}</strong>
              <p>{session.email}</p>
              <button
                className="purity-button purity-button--ghost"
                disabled={isLoggingOut}
                type="button"
                onClick={() => void handleLogout()}
              >
                {isLoggingOut ? 'Clearing...' : 'Clear session'}
              </button>
            </>
          ) : (
            <>
              <span className="purity-auth-card__eyebrow">Account</span>
              <strong>Sign in to sync</strong>
              <p>Keep snapshots portable without adding extra dashboard chrome.</p>
              <div className="purity-auth-card__actions">
                <a className="purity-button purity-button--primary" href="/login">
                  Sign in
                </a>
                <a className="purity-button purity-button--ghost" href="/signup">
                  Sign up
                </a>
              </div>
            </>
          )}
        </section>
      </aside>

      <div className="purity-shell">
        <header className="purity-header">
          <div className="purity-header__crumbs">
            <span>Dashboard</span>
            <strong>Shorty creator tool</strong>
            <p>{statusMessage || 'Purity shell, reduced to the editor and preview workflow.'}</p>
          </div>

          <div className="purity-header__actions">
            <button
              className="purity-button purity-button--primary"
              data-testid="copy-manifest-button"
              type="button"
              onClick={() => void copyText('manifest', manifestJson)}
            >
              <DashboardGlyph aria-hidden="true" height={16} name="copy" width={16} />
              {copiedToken === 'manifest' ? 'Manifest copied' : 'Copy manifest'}
            </button>

            <button
              className="purity-button purity-button--ghost"
              data-testid="save-snapshot-button"
              disabled={isSaving}
              type="button"
              onClick={() => void controller.saveSnapshot()}
            >
              <DashboardGlyph aria-hidden="true" height={16} name="save" width={16} />
              {isSaving ? 'Saving...' : 'Save snapshot'}
            </button>
          </div>
        </header>

        <main className="purity-main">
          <section className="purity-editor-grid" id="media">
            <article className="purity-card purity-card--wide">
              <DashboardSectionHeading
                description="Keep only the tool surface: source in, gameplay optional, no extra dashboard filler."
                eyebrow="01"
                title="Media shelf"
              />

              {model.uploadAlert ? <div className="purity-inline-alert">{model.uploadAlert}</div> : null}

              <div className="purity-upload-grid">
                <AssetUploadCard
                  asset={sourceAsset}
                  description={model.sourceCard.subtitle}
                  eyebrow="Source"
                  previewUrl={sourcePreviewUrl}
                  secondaryActionLabel="Use built-in clip"
                  uploadText="Upload source"
                  onSecondaryAction={() => controller.useSampleSource()}
                  onUploadError={(error) => controller.handleUploadError(error)}
                  onUploadSuccess={(result) => controller.handleSourceUploadSuccess(result)}
                />

                <AssetUploadCard
                  asset={gameplayAsset}
                  description={model.gameplayCard.subtitle}
                  eyebrow="Gameplay"
                  previewUrl={gameplayPreviewUrl}
                  remoteGameplayUrl={remoteGameplayUrl}
                  secondaryActionLabel="Use built-in clip"
                  uploadText="Upload gameplay"
                  onAttachRemoteGameplay={() => controller.attachRemoteGameplay(remoteGameplayUrl)}
                  onRemoteGameplayUrlChange={setRemoteGameplayUrl}
                  onSecondaryAction={() => controller.useSampleGameplay()}
                  onUploadError={(error) => controller.handleUploadError(error)}
                  onUploadSuccess={(result) => controller.handleGameplayUploadSuccess(result)}
                />
              </div>
            </article>

            <article className="purity-card" id="presets">
              <DashboardSectionHeading
                description="Switch the preset underneath the shell without adding more chrome."
                eyebrow="02"
                title="Format packs"
              />

              <div className="purity-preset-grid">
                {STORY_PRESETS.map((preset) => (
                  <button
                    key={preset.id}
                    className={`purity-preset-card ${
                      draft.storyPresetId === preset.id ? 'purity-preset-card--active' : ''
                    }`}
                    data-testid={`preset-${preset.id}`}
                    type="button"
                    onClick={() => {
                      startTransition(() => controller.applyStoryPreset(preset));
                    }}
                  >
                    <span>{preset.challengeFit}</span>
                    <strong>{preset.label}</strong>
                    <p>{preset.description}</p>
                  </button>
                ))}
              </div>
            </article>

            <article className="purity-card purity-card--grow">
              <DashboardSectionHeading
                description="The controls stay dense, but this is the actual tool now."
                eyebrow="03"
                title="Cut controls"
              />

              <div className="purity-form-grid">
                <label className="purity-field">
                  <span>Headline</span>
                  <input
                    maxLength={90}
                    placeholder="Lead with the payoff"
                    value={draft.headline}
                    onChange={(event) => controller.updateDraft('headline', event.target.value)}
                  />
                </label>

                <label className="purity-field">
                  <span>CTA</span>
                  <input
                    maxLength={40}
                    placeholder="Watch the full cut"
                    value={draft.ctaLabel}
                    onChange={(event) => controller.updateDraft('ctaLabel', event.target.value)}
                  />
                </label>

                <label className="purity-field purity-field--full">
                  <span>Caption seed</span>
                  <textarea
                    placeholder="Paste the line that should anchor the captions."
                    rows={4}
                    value={draft.captionSeed}
                    onChange={(event) => controller.updateDraft('captionSeed', event.target.value)}
                  />
                </label>

                <label className="purity-field">
                  <span>Duration</span>
                  <select
                    value={draft.clipDuration}
                    onChange={(event) => controller.updateDraft('clipDuration', Number(event.target.value))}
                  >
                    {[15, 20, 30, 45].map((value) => (
                      <option key={value} value={value}>
                        {value} seconds
                      </option>
                    ))}
                  </select>
                </label>

                <label className="purity-field">
                  <span>Caption theme</span>
                  <select
                    value={draft.captionThemeId}
                    onChange={(event) =>
                      controller.updateDraft(
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

                <label className="purity-field purity-field--full">
                  <span>Start offset ({draft.startOffset}s)</span>
                  <input
                    max="30"
                    min="0"
                    step="1"
                    type="range"
                    value={draft.startOffset}
                    onChange={(event) => controller.updateDraft('startOffset', Number(event.target.value))}
                  />
                </label>
              </div>

              <div className="purity-toggle-grid">
                <label className="purity-toggle">
                  <input
                    checked={draft.useAiPreview}
                    type="checkbox"
                    onChange={(event) => controller.updateDraft('useAiPreview', event.target.checked)}
                  />
                  <span>
                    <strong>AI preview</strong>
                    <small>Generate a quick preview URL alongside the final delivery output.</small>
                  </span>
                </label>

                <label className="purity-toggle">
                  <input
                    checked={draft.includeGameplay}
                    type="checkbox"
                    onChange={(event) => controller.updateDraft('includeGameplay', event.target.checked)}
                  />
                  <span>
                    <strong>Gameplay stack</strong>
                    <small>Keep a second video layer active in the lower half of the composition.</small>
                  </span>
                </label>
              </div>

              <div className="purity-platform-row">
                {PLATFORM_PRESETS.map((platform) => {
                  const active = draft.platforms.includes(platform.id);
                  return (
                    <button
                      key={platform.id}
                      className={`purity-pill ${active ? 'purity-pill--active' : ''}`}
                      data-testid={`platform-${platform.id}`}
                      type="button"
                      onClick={() => controller.togglePlatform(platform.id)}
                    >
                      {platform.label}
                    </button>
                  );
                })}
              </div>
            </article>
          </section>

          <section className="purity-preview-section" id="outputs">
            <DashboardSectionHeading
              description="Review poster, captions, and final delivery links without anything else competing for space."
              eyebrow="04"
              title="Preview deck"
            />

            <div className="purity-phone-grid">
              {manifests.map((manifest) => (
                <PreviewPhoneCard
                  key={manifest.id}
                  copiedToken={copiedToken}
                  draft={draft}
                  manifest={manifest}
                  onCopyRenderUrl={(manifestId, url) => void copyText(`url-${manifestId}`, url)}
                />
              ))}
            </div>
          </section>

          <section className="purity-secondary-grid">
            <article className="purity-card" id="history">
              <DashboardSectionHeading
                description="Saved states stay inside the dashboard so you can bounce between variants."
                title="Snapshots"
              />

              {savedExports.length ? (
                <ul className="purity-snapshot-list">
                  {savedExports.map((entry) => (
                    <li key={entry.id}>
                      <div>
                        <strong>{entry.headline}</strong>
                        <span>
                          {new Date(entry.createdAt).toLocaleString()} · {entry.platforms.join(', ')}
                        </span>
                      </div>
                      <button
                        className="purity-mini-button"
                        type="button"
                        onClick={() => void copyText(`snapshot-${entry.id}`, entry.payload)}
                      >
                        {copiedToken === `snapshot-${entry.id}` ? 'Copied' : 'Copy payload'}
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="purity-empty-state">
                  Save a snapshot after tuning the cut and it will show up here for quick reuse.
                </p>
              )}
            </article>

            <details className="purity-card" id="system">
              <summary className="purity-details-summary">
                <div>
                  <h2>System</h2>
                  <p>Operational details stay collapsed until you actually need them.</p>
                </div>
              </summary>

              <ul className="purity-system-list">
                {model.systemRows.map((row) => (
                  <li key={row.label}>
                    <strong>{row.label}</strong>
                    <span>{row.value}</span>
                  </li>
                ))}
              </ul>
            </details>

            <details className="purity-card purity-card--wide">
              <summary className="purity-details-summary">
                <div>
                  <h2>Manifest</h2>
                  <p>Raw JSON remains available for automation, debugging, or API handoff.</p>
                </div>
              </summary>

              <pre className="purity-manifest">{manifestJson}</pre>
            </details>
          </section>
        </main>
      </div>
    </div>
  );
}
