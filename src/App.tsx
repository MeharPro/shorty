import { startTransition, useDeferredValue, useEffect, useState } from 'react';
import { cloudName, isDemoCloud, uploadPreset } from './cloudinary/config';
import {
  CAPTION_THEMES,
  PLATFORM_PRESETS,
  SAMPLE_GAMEPLAY_ASSET,
  SAMPLE_PRIMARY_ASSET,
  STORY_PRESETS,
} from './data/presets';
import { loadDraft, loadExportHistory, saveDraft } from './lib/persistence';
import {
  buildManifestPayload,
  buildPlayableSourceUrl,
  buildPreviewManifest,
} from './lib/rendering';
import { hasSupabaseBrowserConfig } from './lib/supabase';
import type {
  CreatorDraft,
  MediaAsset,
  SavedExport,
} from './types';
import {
  ShortyControlSection,
  ShortyHero,
  ShortyManifestPanel,
  ShortyMediaSection,
  ShortyPreviewDeck,
  ShortySnapshotsPanel,
  ShortyStyleSection,
  ShortySystemPanel,
} from './components/ShortyStudioSections';
import { ShortyStudioController } from './shorty/ShortyStudioController';
import { ShortyStudioModel } from './shorty/ShortyStudioModel';
import './App.css';

const DEFAULT_STORY_PRESET = STORY_PRESETS[0];

const DEFAULT_DRAFT: CreatorDraft = {
  captionThemeId: CAPTION_THEMES[0].id,
  platforms: PLATFORM_PRESETS.map((platform) => platform.id),
  ...DEFAULT_STORY_PRESET.defaults,
};

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

  return (
    <div className="shorty-shell">
      <ShortyHero
        model={model}
        copiedToken={copiedToken}
        isSaving={isSaving}
        onCopyManifest={() => void copyText('manifest', manifestJson)}
        onSaveSnapshot={() => void controller.saveSnapshot()}
      />

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
          <ShortyPreviewDeck
            draft={draft}
            manifests={manifests}
            copiedToken={copiedToken}
            statusMessage={statusMessage}
            onCopyRenderUrl={(manifestId, url) => void copyText(`url-${manifestId}`, url)}
          />

          <ShortySnapshotsPanel
            savedExports={savedExports}
            copiedToken={copiedToken}
            onCopySnapshot={(entry) => void copyText(`snapshot-${entry.id}`, entry.payload)}
          />

          <ShortyManifestPanel manifestJson={manifestJson} />
        </section>
      </main>
    </div>
  );
}

export default App;
