export type PlatformId = 'youtube-shorts' | 'instagram-reels' | 'tiktok';
export type StoryPresetId = 'clip-commander' | 'launch-loop' | 'gameplay-stack';
export type CaptionThemeId = 'impact' | 'clean-room' | 'night-shift';

export interface MediaAsset {
  id: string;
  label: string;
  publicId: string;
  secureUrl: string;
  source: 'sample' | 'upload' | 'remote';
  resourceType: 'video';
  strategy?: 'cloudinary-public-id' | 'remote-fetch';
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
  compositionMode: 'single' | 'gameplay-stack';
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

export interface ReelScoreBreakdown {
  hookStrength: number;
  standaloneClarity: number;
  emotionalImpact: number;
  novelty: number;
  pacing: number;
  visualEngagement: number;
  insightDensity: number;
}

export interface ReelCandidate {
  id: string;
  rank: number;
  title: string;
  startOffset: number;
  duration: number;
  transcriptExcerpt: string;
  hook: string;
  captionLines: string[];
  viralityScore: number;
  scoreBreakdown: ReelScoreBreakdown;
  reasoning: string[];
  editingPlan: string[];
  analysisSource: 'transcript' | 'visual';
  deliveryUrl: string;
  posterUrl: string;
  downloadUrl: string;
  aiPreviewUrl: string | null;
}

export interface ReelGenerationResponse {
  generatedAt: string;
  source: {
    mode: 'cloudinary-public-id' | 'remote-fetch';
    publicId: string | null;
    secureUrl: string | null;
    duration: number;
  };
  transcriptUsed: boolean;
  visualSignalsUsed: boolean;
  recommendedClipId: string | null;
  clips: ReelCandidate[];
}

export interface ReelHistoryEntry {
  id: string;
  createdAt: string;
  sourceLabel: string;
  recommendedClipId: string | null;
  result: ReelGenerationResponse;
}

export interface VideoTranscriptionResponse {
  transcript: string;
  provider: string;
  model: string;
  sourceUrl: string;
  generatedAt: string;
}
