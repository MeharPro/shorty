export type PlatformId = 'youtube-shorts' | 'instagram-reels' | 'tiktok';
export type StoryPresetId = 'clip-commander' | 'launch-loop' | 'gameplay-stack';
export type CaptionThemeId = 'impact' | 'clean-room' | 'night-shift';

export interface MediaAsset {
  id: string;
  label: string;
  publicId: string;
  secureUrl: string;
  source: 'sample' | 'upload';
  resourceType: 'video';
  duration?: number;
  width?: number;
  height?: number;
  bytes?: number;
  createdAt?: string;
}

export interface CreatorDraft {
  storyPresetId: StoryPresetId;
  captionThemeId: CaptionThemeId;
  platforms: PlatformId[];
  headline: string;
  captionSeed: string;
  ctaLabel: string;
  clipDuration: number;
  startOffset: number;
  useAiPreview: boolean;
  includeGameplay: boolean;
}

export interface PlatformPreset {
  id: PlatformId;
  label: string;
  description: string;
  width: number;
  height: number;
  safeTop: number;
  safeBottom: number;
  exportLabel: string;
}

export interface StoryPreset {
  id: StoryPresetId;
  label: string;
  description: string;
  challengeFit: string;
  defaults: Pick<
    CreatorDraft,
    | 'storyPresetId'
    | 'headline'
    | 'captionSeed'
    | 'ctaLabel'
    | 'clipDuration'
    | 'startOffset'
    | 'useAiPreview'
    | 'includeGameplay'
  >;
}

export interface CaptionTheme {
  id: CaptionThemeId;
  label: string;
  description: string;
  accentVar: string;
}

export interface RenderManifest {
  id: string;
  platform: PlatformPreset;
  deliveryUrl: string;
  aiPreviewUrl: string | null;
  posterUrl: string;
  transformationRecipe: string;
  transformationSummary: string[];
  captionLines: string[];
  sourceLabel: string;
  gameplayLabel: string | null;
}

export interface SavedExport {
  id: string;
  createdAt: string;
  headline: string;
  storyPresetId: StoryPresetId;
  platforms: PlatformId[];
  deliveryUrls: string[];
  sourcePublicId: string;
  payload: string;
}
