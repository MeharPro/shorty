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

export interface VisualHighlight {
  id: string;
  start: number;
  end: number;
  score: number;
  label: string;
  dominantExpression: 'smile' | 'surprise' | 'emphasis' | 'engagement';
  faceCount: number;
  focusStrategy?: 'speaker' | 'reaction' | 'group';
  cameraMotion?: 'steady' | 'dynamic' | 'shake';
  metrics: {
    smile: number;
    surprise: number;
    emphasis: number;
    engagement: number;
    groupEnergy?: number;
  };
}

export interface VisualAnalysisSummary {
  provider: 'mediapipe-face-landmarker';
  sourcePublicId?: string;
  sourceUrl?: string;
  analyzedDuration: number;
  sampleCount: number;
  averageScore: number;
  peakScore: number;
  highlights: VisualHighlight[];
  generatedAt: string;
}

export interface ReelQualityAudit {
  status: 'pass' | 'warn';
  samples: number;
  framesWithFaces: number;
  speakerFaceVisibleRatio: number;
  notes: string[];
}

export interface Feature1EditingAdvice {
  removeSilences?: boolean;
  shakingCaptions?: boolean;
  faceFocus?: boolean;
  safeFaceFrame?: boolean;
  qaEnabled?: boolean;
  focusPreference?: 'auto' | 'speaker' | 'reaction' | 'group';
  cameraMotionPreference?: 'auto' | 'steady' | 'dynamic' | 'shake';
  captionDensity?: 'tight' | 'balanced';
  viralStyle?: 'balanced' | 'aggressive';
}

export interface Feature1AgentPlan {
  model: string;
  summary: string;
  editingOptions: Feature1EditingAdvice;
  logicBlocks: string[];
  qaChecks: string[];
  notes: string[];
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
  analysisSource: 'transcript' | 'visual' | 'hybrid';
  expressionLabel?: string;
  expressionScore?: number;
  focusStrategy?: 'speaker' | 'reaction' | 'group';
  cameraMotion?: 'steady' | 'dynamic' | 'shake';
  previewUrl: string;
  deliveryUrl: string;
  posterUrl: string;
  downloadUrl: string;
  aiPreviewUrl: string | null;
  subtitleAsset?: ReelSubtitleAsset | null;
  qa?: ReelQualityAudit | null;
}

export interface TranscriptWord {
  word: string;
  start: number;
  end: number;
}

export interface TranscriptSegment {
  id: string;
  text: string;
  start: number;
  end: number;
  confidence?: number;
  words: TranscriptWord[];
}

export interface CaptionCue {
  id: string;
  text: string;
  start: number;
  end: number;
  words: TranscriptWord[];
}

export interface ReelSubtitleAsset {
  id: string;
  label: string;
  publicId: string;
  secureUrl: string;
  format: 'srt';
  cueCount: number;
  resourceType: 'raw';
  provider?: string;
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
  visualAnalysis?: VisualAnalysisSummary;
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
  publicId?: string;
  sourceUrl: string;
  transcriptUrl?: string;
  segments?: TranscriptSegment[];
  generatedAt: string;
}
