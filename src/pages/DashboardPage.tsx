import { startTransition, useDeferredValue, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import boltLogo from '../assets/bolt-logo.png';
import { cloudName, isDemoCloud, uploadPreset } from '../cloudinary/config';
import {
  CAPTION_THEMES,
  PLATFORM_PRESETS,
  SAMPLE_GAMEPLAY_ASSET,
  SAMPLE_PRIMARY_ASSET,
  STORY_PRESETS,
} from '../data/presets';
import type { ShortySession } from '../lib/session';
import { loadDraft, loadExportHistory, saveDraft } from '../lib/persistence';
import {
  buildManifestPayload,
  buildPlayableSourceUrl,
  buildPreviewManifest,
} from '../lib/rendering';
import { hasSupabaseBrowserConfig } from '../lib/supabase';
import type { CreatorDraft, MediaAsset, SavedExport } from '../types';
import {
  ShortyControlSection,
  ShortyHero,
  ShortyManifestPanel,
  ShortyMediaSection,
  ShortyPreviewDeck,
  ShortySnapshotsPanel,
  ShortyStyleSection,
  ShortySystemPanel,
} from '../components/ShortyStudioSections';
import { ShortyStudioController } from '../shorty/ShortyStudioController';
import { ShortyStudioModel } from '../shorty/ShortyStudioModel';

const DEFAULT_STORY_PRESET = STORY_PRESETS[0];

const DEFAULT_DRAFT: CreatorDraft = {
  captionThemeId: CAPTION_THEMES[0].id,
  platforms: PLATFORM_PRESETS.map((platform) => platform.id),
  ...DEFAULT_STORY_PRESET.defaults,
};

interface DashboardPageProps {
  session: ShortySession | null;
  onLogout: () => Promise<void>;
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

    const timeout = window.setTimeout(() => setStatusMessage(''), 4500);
    return () => window.clearTimeout(timeout);
  }, [statusMessage]);

  const sourcePreviewUrl = buildPlayableSourceUrl(sourceAsset);
  const gameplayPreviewUrl = buildPlayableSourceUrl(gameplayAsset);

  const copyText = async (token: string, text: string) => {
    await navigator.clipboard.writeText(text);
    setCopiedToken(token);
    setStatusMessage('Copied to clipboard.');
    window.setTimeout(() => {
      setCopiedToken((current) => (current === token ? null : current));
    }, 2000);
  };

  const handleLogout = async () => {
    setIsLoggingOut(true);
    try {
      await onLogout();
    } finally {
      setIsLoggingOut(false);
    }
  };

  return (
    <div className="shorty-shell">
      <header className="shorty-topbar">
        <div className="shorty-topbar__brand">
          <div className="shorty-topbar__logo-wrap">
            <img className="shorty-topbar__logo" src={boltLogo} alt="Shorty logo" />
          </div>
          <div className="shorty-topbar__meta">
            <strong>Shorty</strong>
            <span>Creator Studio</span>
          </div>
        </div>

        <nav className="shorty-topbar__nav">
          <Link to="/">Home</Link>
          <Link to="/login">Login</Link>
          <Link to="/signup">Signup</Link>
          <Link className="shorty-topbar__nav-link--active" to="/dashboard">
            Dashboard
          </Link>
        </nav>

        <div className="shorty-topbar__session">
          <div className="shorty-topbar__session-copy">
            <strong>{session?.name ?? 'Guest workspace'}</strong>
            <span>{session?.email ?? 'Local dashboard access'}</span>
          </div>
          <button
            className="shorty-button shorty-button--ghost"
            disabled={isLoggingOut}
            type="button"
            onClick={() => void handleLogout()}
          >
            {isLoggingOut ? 'Clearing...' : 'Clear session'}
          </button>
        </div>
      </header>

      <div className="shorty-dashboard-tabs" role="tablist" aria-label="Dashboard sections">
        <button className="shorty-dashboard-tab shorty-dashboard-tab--active" type="button">
          Compose
        </button>
        <button className="shorty-dashboard-tab" type="button">
          Snapshots
        </button>
        <button className="shorty-dashboard-tab" type="button">
          Manifest
        </button>
      </div>

      <main className="shorty-workspace">
        <aside className="shorty-sidebar">
          <ShortyMediaSection
            model={model}
            sourcePreviewUrl={sourcePreviewUrl}
            gameplayPreviewUrl={gameplayPreviewUrl}
            remoteGameplayUrl={remoteGameplayUrl}
            onRemoteGameplayUrlChange={setRemoteGameplayUrl}
            onSourceUploadSuccess={(result) => controller.handleSourceUploadSuccess(result)}
            onGameplayUploadSuccess={(result) => controller.handleGameplayUploadSuccess(result)}
            onUploadError={(error) => controller.handleUploadError(error)}
            onUseSampleSource={() => controller.useSampleSource()}
            onUseSampleGameplay={() => controller.useSampleGameplay()}
            onAttachRemoteGameplay={() => controller.attachRemoteGameplay(remoteGameplayUrl)}
          />

          <ShortyStyleSection
            presets={STORY_PRESETS}
            activePresetId={draft.storyPresetId}
            onApplyPreset={(preset) => {
              startTransition(() => controller.applyStoryPreset(preset));
            }}
          />

          <ShortyControlSection
            draft={draft}
            captionThemes={CAPTION_THEMES}
            platforms={PLATFORM_PRESETS}
            onHeadlineChange={(value) => controller.updateDraft('headline', value)}
            onCtaChange={(value) => controller.updateDraft('ctaLabel', value)}
            onCaptionSeedChange={(value) => controller.updateDraft('captionSeed', value)}
            onClipDurationChange={(value) => controller.updateDraft('clipDuration', value)}
            onCaptionThemeChange={(value) => controller.updateDraft('captionThemeId', value)}
            onStartOffsetChange={(value) => controller.updateDraft('startOffset', value)}
            onUseAiPreviewChange={(value) => controller.updateDraft('useAiPreview', value)}
            onIncludeGameplayChange={(value) => controller.updateDraft('includeGameplay', value)}
            onTogglePlatform={(platformId) => controller.togglePlatform(platformId)}
          />

          <ShortySystemPanel model={model} />
        </aside>

        <section className="shorty-main">
          <ShortyHero
            model={model}
            copiedToken={copiedToken}
            isSaving={isSaving}
            onCopyManifest={() => void copyText('manifest', manifestJson)}
            onSaveSnapshot={() => void controller.saveSnapshot()}
          />

          <ShortyPreviewDeck
            draft={draft}
            manifests={manifests}
            copiedToken={copiedToken}
            statusMessage={statusMessage}
            onCopyRenderUrl={(manifestId, url) => void copyText(`url-${manifestId}`, url)}
          />

          <div className="shorty-dashboard-secondary">
            <ShortySnapshotsPanel
              savedExports={savedExports}
              copiedToken={copiedToken}
              onCopySnapshot={(entry) => void copyText(`snapshot-${entry.id}`, entry.payload)}
            />

            <ShortyManifestPanel manifestJson={manifestJson} />
          </div>
        </section>
      </main>
    </div>
  );
}
