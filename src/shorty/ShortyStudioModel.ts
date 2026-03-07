import type {
  CaptionTheme,
  CreatorDraft,
  MediaAsset,
  RenderManifest,
  SavedExport,
  StoryPreset,
} from '../types';

export interface ShortyChipModel {
  label: string;
  tone?: 'default' | 'accent' | 'muted';
}

export interface ShortyStageCardModel {
  eyebrow: string;
  title: string;
  body: string;
}

export interface ShortySystemRowModel {
  label: string;
  value: string;
}

export class ShortyValueFormatter {
  static bytes(bytes?: number): string {
    if (!bytes) {
      return 'Unknown size';
    }

    if (bytes < 1024 * 1024) {
      return `${Math.round(bytes / 1024)} KB`;
    }

    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  static duration(seconds?: number): string {
    if (!seconds) {
      return 'n/a';
    }

    const mins = Math.floor(seconds / 60);
    const remaining = Math.round(seconds % 60);
    return `${mins}:${remaining.toString().padStart(2, '0')}`;
  }
}

export class ShortyAssetCardModel {
  public readonly heading: string;
  public readonly asset: MediaAsset;
  private readonly includeGameplay: boolean;

  constructor(heading: string, asset: MediaAsset, includeGameplay: boolean) {
    this.heading = heading;
    this.asset = asset;
    this.includeGameplay = includeGameplay;
  }

  get subtitle(): string {
    if (this.heading === 'Source') {
      return this.asset.source === 'sample'
        ? 'Built-in sample clip'
        : this.asset.source === 'remote'
          ? 'Streaming from a remote asset URL'
          : 'Uploaded to your Cloudinary account';
    }

    if (!this.includeGameplay) {
      return 'Optional lower-half gameplay layer';
    }

    return this.asset.source === 'remote'
      ? 'Remote gameplay feed is live'
      : 'Gameplay composite is armed';
  }

  get identifier(): string {
    return this.asset.publicId || this.asset.secureUrl;
  }

  get metrics(): string {
    return `${ShortyValueFormatter.duration(this.asset.duration)} • ${ShortyValueFormatter.bytes(
      this.asset.bytes
    )}`;
  }
}

interface ShortyStudioModelOptions {
  cloudName: string;
  hasSupabaseBrowserConfig: boolean;
  hasUploadPreset: boolean;
  isDemoCloud: boolean;
  manifests: RenderManifest[];
  storyPreset: StoryPreset;
  captionTheme: CaptionTheme;
  draft: CreatorDraft;
  sourceAsset: MediaAsset;
  gameplayAsset: MediaAsset;
  savedExports: SavedExport[];
}

export class ShortyStudioModel {
  private readonly options: ShortyStudioModelOptions;

  constructor(options: ShortyStudioModelOptions) {
    this.options = options;
  }

  get brandName(): string {
    return 'Shorty';
  }

  get eyebrow(): string {
    return 'YOUTUBE-STYLE SHORT-FORM STUDIO';
  }

  get heroBody(): string {
    return 'Build clean vertical edits from one source clip, layer gameplay only when the pacing needs it, and line up export-ready versions for every short-form platform.';
  }

  get uploadsAvailable(): boolean {
    return this.options.hasUploadPreset && !this.options.isDemoCloud;
  }

  get chips(): ShortyChipModel[] {
    return [
      { label: `Cloud ${this.options.cloudName}` },
      {
        label: this.uploadsAvailable ? 'Uploads armed' : 'Sample mode',
        tone: this.uploadsAvailable ? 'accent' : 'muted',
      },
      {
        label: this.options.hasSupabaseBrowserConfig ? 'Cloud sync on' : 'Local saves',
      },
    ];
  }

  get stageCards(): ShortyStageCardModel[] {
    return [
      {
        eyebrow: 'Input',
        title: 'One source, many cuts',
        body: 'Start with the main clip, then add gameplay only when the edit needs extra movement.',
      },
      {
        eyebrow: 'Mode',
        title: this.options.storyPreset.label,
        body: `${this.options.storyPreset.description} Captions land in ${this.options.captionTheme.label}.`,
      },
      {
        eyebrow: 'Output',
        title: `${this.options.manifests.length} publish target${this.options.manifests.length === 1 ? '' : 's'} armed`,
        body: `${this.platformSummary} • ${this.options.draft.includeGameplay ? 'Gameplay stack on' : 'Single-video layout'}`,
      },
    ];
  }

  get platformSummary(): string {
    return this.options.manifests.map((manifest) => manifest.platform.label).join(', ');
  }

  get sourceCard(): ShortyAssetCardModel {
    return new ShortyAssetCardModel(
      'Source',
      this.options.sourceAsset,
      this.options.draft.includeGameplay
    );
  }

  get gameplayCard(): ShortyAssetCardModel {
    return new ShortyAssetCardModel(
      'Gameplay',
      this.options.gameplayAsset,
      this.options.draft.includeGameplay
    );
  }

  get uploadAlert(): string | null {
    if (this.uploadsAvailable) {
      return null;
    }

    if (this.options.isDemoCloud && this.options.hasUploadPreset) {
      return 'Uploads are blocked because this app is still pointed at Cloudinary demo. Switch the cloud name to your real account and the current preset will start working.';
    }

    return 'Uploads stay disabled until a real Cloudinary cloud name and unsigned upload preset are configured.';
  }

  get systemRows(): ShortySystemRowModel[] {
    return [
      {
        label: 'Uploads',
        value: this.uploadsAvailable
          ? 'Direct unsigned uploads are ready.'
          : 'Direct uploads are paused until Cloudinary is fully configured.',
      },
      {
        label: 'Cloud',
        value: this.options.isDemoCloud
          ? 'Using Cloudinary sample assets.'
          : `Connected to ${this.options.cloudName}.`,
      },
      {
        label: 'Snapshots',
        value: this.options.hasSupabaseBrowserConfig
          ? 'Saved locally and mirrored to Supabase.'
          : 'Saved locally in the browser.',
      },
      {
        label: 'History',
        value: `${this.options.savedExports.length} saved snapshot${
          this.options.savedExports.length === 1 ? '' : 's'
        } in this browser.`,
      },
    ];
  }
}
