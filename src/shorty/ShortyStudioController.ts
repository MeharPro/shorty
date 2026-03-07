import type { Dispatch, SetStateAction } from 'react';
import type {
  CloudinaryUploadResult,
} from '../cloudinary/UploadWidget';
import {
  SAMPLE_GAMEPLAY_ASSET,
  SAMPLE_PRIMARY_ASSET,
} from '../data/presets';
import { saveExportHistory } from '../lib/persistence';
import {
  createMediaAssetFromUpload,
  createRemoteMediaAsset,
} from '../lib/rendering';
import { persistManifestSnapshot } from '../lib/supabase';
import type {
  CreatorDraft,
  MediaAsset,
  PlatformId,
  RenderManifest,
  SavedExport,
  StoryPreset,
} from '../types';

interface ShortyStudioControllerDeps {
  draft: CreatorDraft;
  sourceAsset: MediaAsset;
  savedExports: SavedExport[];
  manifests: RenderManifest[];
  manifestJson: string;
  setDraft: Dispatch<SetStateAction<CreatorDraft>>;
  setSourceAsset: Dispatch<SetStateAction<MediaAsset>>;
  setGameplayAsset: Dispatch<SetStateAction<MediaAsset>>;
  setSavedExports: Dispatch<SetStateAction<SavedExport[]>>;
  setStatusMessage: Dispatch<SetStateAction<string>>;
  setIsSaving: Dispatch<SetStateAction<boolean>>;
  setRemoteGameplayUrl: Dispatch<SetStateAction<string>>;
}

export class ShortyStudioController {
  private readonly deps: ShortyStudioControllerDeps;

  constructor(deps: ShortyStudioControllerDeps) {
    this.deps = deps;
  }

  updateDraft<Key extends keyof CreatorDraft>(key: Key, value: CreatorDraft[Key]): void {
    this.deps.setDraft((current) => ({
      ...current,
      [key]: value,
    }));
  }

  togglePlatform(platformId: PlatformId): void {
    this.deps.setDraft((current) => {
      const exists = current.platforms.includes(platformId);
      const nextPlatforms = exists
        ? current.platforms.filter((value) => value !== platformId)
        : [...current.platforms, platformId];

      return {
        ...current,
        platforms: nextPlatforms.length ? nextPlatforms : [platformId],
      };
    });
  }

  useSampleSource(): void {
    this.deps.setSourceAsset(SAMPLE_PRIMARY_ASSET);
    this.deps.setStatusMessage('Built-in source clip loaded.');
  }

  useSampleGameplay(): void {
    this.deps.setGameplayAsset(SAMPLE_GAMEPLAY_ASSET);
    this.deps.setRemoteGameplayUrl('');
    this.deps.setDraft((current) => ({
      ...current,
      includeGameplay: true,
    }));
    this.deps.setStatusMessage('Built-in gameplay clip loaded into the stack.');
  }

  handleSourceUploadSuccess(result: CloudinaryUploadResult): void {
    this.deps.setSourceAsset(createMediaAssetFromUpload(result, 'Uploaded Source Clip'));
    this.deps.setStatusMessage('Source clip uploaded to Cloudinary.');
  }

  handleGameplayUploadSuccess(result: CloudinaryUploadResult): void {
    this.deps.setGameplayAsset(createMediaAssetFromUpload(result, 'Uploaded Gameplay Clip'));
    this.deps.setRemoteGameplayUrl('');
    this.deps.setDraft((current) => ({
      ...current,
      includeGameplay: true,
    }));
    this.deps.setStatusMessage('Gameplay clip uploaded and added to the stack.');
  }

  handleUploadError(error: Error): void {
    this.deps.setStatusMessage(error.message);
  }

  attachRemoteGameplay(url: string): void {
    const trimmed = url.trim();

    if (!/^https?:\/\//i.test(trimmed)) {
      this.deps.setStatusMessage('Paste a direct http(s) gameplay video URL.');
      return;
    }

    this.deps.setGameplayAsset(createRemoteMediaAsset(trimmed, 'Remote Gameplay Feed'));
    this.deps.setRemoteGameplayUrl(trimmed);
    this.deps.setDraft((current) => ({
      ...current,
      includeGameplay: true,
    }));
    this.deps.setStatusMessage('Remote gameplay feed attached.');
  }

  applyStoryPreset(preset: StoryPreset): void {
    this.deps.setDraft((current) => ({
      ...current,
      ...preset.defaults,
    }));
  }

  async saveSnapshot(): Promise<void> {
    const entry: SavedExport = {
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
      headline: this.deps.draft.headline,
      storyPresetId: this.deps.draft.storyPresetId,
      platforms: this.deps.draft.platforms,
      deliveryUrls: this.deps.manifests.map((manifest) => manifest.deliveryUrl),
      sourcePublicId: this.deps.sourceAsset.publicId,
      payload: this.deps.manifestJson,
    };

    const nextHistory = [entry, ...this.deps.savedExports].slice(0, 6);
    this.deps.setSavedExports(nextHistory);
    saveExportHistory(nextHistory);
    this.deps.setIsSaving(true);

    try {
      const result = await persistManifestSnapshot(entry);
      if (result.persisted) {
        this.deps.setStatusMessage('Snapshot saved locally and synced.');
      } else {
        this.deps.setStatusMessage(
          `Snapshot saved locally${result.reason ? `; remote sync skipped: ${result.reason}` : '.'}`
        );
      }
    } finally {
      this.deps.setIsSaving(false);
    }
  }
}
