import { source } from '@cloudinary/url-gen/actions/overlay';
import { fill } from '@cloudinary/url-gen/actions/resize';
import { trim, volume } from '@cloudinary/url-gen/actions/videoEdit';
import { compass } from '@cloudinary/url-gen/qualifiers/gravity';
import { Position } from '@cloudinary/url-gen/qualifiers/position';
import { audio, subtitles, text } from '@cloudinary/url-gen/qualifiers/source';
import { TextStyle } from '@cloudinary/url-gen/qualifiers/textStyle';
import { mute } from '@cloudinary/url-gen/qualifiers/volume';
import { format, quality } from '@cloudinary/url-gen/actions/delivery';
import { auto as autoFormat } from '@cloudinary/url-gen/qualifiers/format';
import { auto as autoQuality } from '@cloudinary/url-gen/qualifiers/quality';
import { cloudName, cld } from '../cloudinary/config';
import type { MediaAsset } from '../types';

export const BRAINROT_FRAME_WIDTH = 1080;
export const BRAINROT_FRAME_HEIGHT = 1920;
const DEFAULT_CAPTION = 'Watch this one closely';
const DEFAULT_GAMEPLAY_PUBLIC_ID = 'shorty/brainrot/subway-surfers-demo';
const CAPTION_LINE_LIMIT = 22;
const CAPTION_MAX_LINES = 3;

export type BrainrotFontFamily = 'Arial' | 'Verdana' | 'Georgia' | 'Courier' | 'Impact';
export type BrainrotGravityMode = 'north' | 'center' | 'south';
export type BrainrotStageId =
  | 'prompt'
  | 'script'
  | 'voice'
  | 'gameplay'
  | 'caption'
  | 'music'
  | 'render';
export type BrainrotTypeId =
  | 'subway-storytime'
  | 'conspiracy-spiral'
  | 'motivation-shock'
  | 'weird-facts'
  | 'reddit-drama'
  | 'money-panic';
export type BrainrotGameplayPresetId =
  | 'subway-classic'
  | 'subway-speedrun'
  | 'subway-finale'
  | 'custom-remote';
export type BrainrotCaptionPresetId =
  | 'signal-pop'
  | 'clean-room'
  | 'night-shift'
  | 'arcade-glow';

export interface BrainrotAudioAsset {
  id: string;
  label: string;
  publicId: string;
  secureUrl: string;
  duration: number;
  resourceType: 'video';
  provider?: string;
}

export interface BrainrotSubtitleAsset {
  id: string;
  label: string;
  publicId: string;
  secureUrl: string;
  format: 'srt';
  cueCount: number;
  resourceType: 'raw';
  provider?: string;
}

export interface BrainrotCaptionStyle {
  textColor: string;
  backgroundColor: string;
  fontFamily: BrainrotFontFamily;
  fontSize: number;
  fontWeight: 'normal' | 'bold';
  placement: BrainrotGravityMode;
  horizontalOffset: number;
  verticalOffset: number;
}

export interface BrainrotLayoutStyle {
  splitRatio: number;
  gameplayGravity: BrainrotGravityMode;
  canvasColor: string;
}

export interface BrainrotVoiceSettings {
  stability: number;
  similarityBoost: number;
  style: number;
  speed: number;
  useSpeakerBoost: boolean;
}

export interface BrainrotTypePreset {
  id: BrainrotTypeId;
  label: string;
  tag: string;
  description: string;
}

export interface BrainrotGameplayPreset {
  id: BrainrotGameplayPresetId;
  label: string;
  tag: string;
  description: string;
  source: 'local' | 'remote';
  defaultOffset: number;
  defaultGravity: BrainrotGravityMode;
}

export interface BrainrotVoiceOption {
  id: string;
  name: string;
  category: string;
  labels: Record<string, string>;
  previewUrl: string;
}

export interface BrainrotCaptionStylePreset {
  id: BrainrotCaptionPresetId;
  label: string;
  tag: string;
  description: string;
  previewFontFamily: string;
  style: BrainrotCaptionStyle;
}

export interface BrainrotScriptPackage {
  title: string;
  hook: string;
  spokenScript: string;
  captionText: string;
  visualNotes: string[];
}

export interface BrainrotScriptResponse {
  model: string;
  brainrotType: BrainrotTypeId;
  script: BrainrotScriptPackage;
  generatedAt: string;
  fallback?: boolean;
  warning?: string;
}

export interface BrainrotVoiceResponse {
  audioAsset: BrainrotAudioAsset;
  durationSeconds: number;
  provider: string;
  modelId: string;
  voiceId: string;
  generatedAt: string;
}

export interface BrainrotVoicesResponse {
  voices: BrainrotVoiceOption[];
  defaultVoiceId: string;
  fallback?: boolean;
  warning?: string;
}

export interface BrainrotCompositeOptions {
  gameplayAsset: MediaAsset;
  voiceoverAsset?: BrainrotAudioAsset | null;
  subtitlesAsset?: BrainrotSubtitleAsset | null;
  captionText: string;
  clipDuration: number;
  gameplayStartOffset: number;
  captionStyle?: BrainrotCaptionStyle;
  layoutStyle?: BrainrotLayoutStyle;
}

export const BRAINROT_TYPE_PRESETS: BrainrotTypePreset[] = [
  {
    id: 'subway-storytime',
    label: 'Storytime Spiral',
    tag: 'Story',
    description: 'Feels like a chaotic first-person confession that keeps escalating without naming the gameplay.',
  },
  {
    id: 'conspiracy-spiral',
    label: 'Conspiracy Spiral',
    tag: 'Theory',
    description: 'Suspicious, ominous, and sticky without crossing into nonsense.',
  },
  {
    id: 'motivation-shock',
    label: 'Motivation Shock',
    tag: 'Wake-up',
    description: 'Tough-love delivery that sounds like a short-form intervention.',
  },
  {
    id: 'weird-facts',
    label: 'Weird Facts',
    tag: 'Facts',
    description: 'Curiosity bait that lands fast and leaves one idea hanging.',
  },
  {
    id: 'reddit-drama',
    label: 'Reddit Drama',
    tag: 'Drama',
    description: 'Messy recap energy with a clean setup, turn, and payoff.',
  },
  {
    id: 'money-panic',
    label: 'Money Panic',
    tag: 'Money',
    description: 'Career and financial anxiety framed like an instant realization.',
  },
];

export const BRAINROT_FONT_OPTIONS: BrainrotFontFamily[] = [
  'Arial',
  'Verdana',
  'Georgia',
  'Courier',
  'Impact',
];

export const BRAINROT_GAMEPLAY_GRAVITY_OPTIONS: BrainrotGravityMode[] = [
  'north',
  'center',
  'south',
];

export const BRAINROT_GAMEPLAY_PRESETS: BrainrotGameplayPreset[] = [
  {
    id: 'subway-classic',
    label: 'Subway Classic',
    tag: 'Default',
    description: 'The built-in Subway Surfers bed from src/assets, trimmed for the standard run.',
    source: 'local',
    defaultOffset: 18,
    defaultGravity: 'center',
  },
  {
    id: 'subway-speedrun',
    label: 'Speed Section',
    tag: 'Fast',
    description: 'The same local Subway clip, pushed into a later section with denser motion.',
    source: 'local',
    defaultOffset: 42,
    defaultGravity: 'center',
  },
  {
    id: 'subway-finale',
    label: 'Late Run',
    tag: 'Dense',
    description: 'The built-in Subway footage, but biased toward a later section with more visual noise.',
    source: 'local',
    defaultOffset: 74,
    defaultGravity: 'south',
  },
  {
    id: 'custom-remote',
    label: 'Custom Remote',
    tag: 'URL',
    description: 'Paste a public gameplay page or direct MP4/WebM URL and resolve it into the stack.',
    source: 'remote',
    defaultOffset: 0,
    defaultGravity: 'center',
  },
];

export const DEFAULT_BRAINROT_CAPTION_STYLE: BrainrotCaptionStyle = {
  textColor: '#ffffff',
  backgroundColor: '#101828',
  fontFamily: 'Impact',
  fontSize: 30,
  fontWeight: 'bold',
  placement: 'center',
  horizontalOffset: 0,
  verticalOffset: 120,
};

export const DEFAULT_BRAINROT_LAYOUT_STYLE: BrainrotLayoutStyle = {
  splitRatio: 0.48,
  gameplayGravity: 'center',
  canvasColor: '#0f172a',
};

export const DEFAULT_BRAINROT_VOICE_SETTINGS: BrainrotVoiceSettings = {
  stability: 0.45,
  similarityBoost: 0.85,
  style: 0.2,
  speed: 0.96,
  useSpeakerBoost: true,
};

export const BRAINROT_CAPTION_STYLE_PRESETS: BrainrotCaptionStylePreset[] = [
  {
    id: 'signal-pop',
    label: 'Signal Pop',
    tag: 'Bold',
    description: 'Heavy, high-contrast social captions with a punchy yellow signal feel.',
    previewFontFamily: '"Anton", "Arial Black", sans-serif',
    style: {
      textColor: '#111827',
      backgroundColor: '#facc15',
      fontFamily: 'Impact',
      fontSize: 30,
      fontWeight: 'bold',
      placement: 'center',
      horizontalOffset: 0,
      verticalOffset: 110,
    },
  },
  {
    id: 'clean-room',
    label: 'Clean Room',
    tag: 'Clean',
    description: 'Simple newsroom-style subtitle blocks that stay readable under busy gameplay.',
    previewFontFamily: '"Manrope", "Arial", sans-serif',
    style: {
      textColor: '#f8fafc',
      backgroundColor: '#0f172a',
      fontFamily: 'Verdana',
      fontSize: 26,
      fontWeight: 'bold',
      placement: 'center',
      horizontalOffset: 0,
      verticalOffset: 110,
    },
  },
  {
    id: 'night-shift',
    label: 'Night Shift',
    tag: 'Dark',
    description: 'Soft off-white text on a dark slate bed for explainers and calmer delivery.',
    previewFontFamily: '"Space Grotesk", "Arial", sans-serif',
    style: {
      textColor: '#f8fafc',
      backgroundColor: '#1e293b',
      fontFamily: 'Georgia',
      fontSize: 28,
      fontWeight: 'bold',
      placement: 'center',
      horizontalOffset: 0,
      verticalOffset: 120,
    },
  },
  {
    id: 'arcade-glow',
    label: 'Arcade Glow',
    tag: 'Retro',
    description: 'Crisp retro caption boxes that feel closer to an arcade HUD or score bug.',
    previewFontFamily: '"Bebas Neue", "Arial Narrow", sans-serif',
    style: {
      textColor: '#ecfeff',
      backgroundColor: '#0f766e',
      fontFamily: 'Courier',
      fontSize: 28,
      fontWeight: 'bold',
      placement: 'center',
      horizontalOffset: 0,
      verticalOffset: 110,
    },
  },
];

export const FALLBACK_BRAINROT_VOICE: BrainrotVoiceOption = {
  id: '21m00Tcm4TlvDq8ikWAM',
  name: 'Rachel',
  category: 'premade',
  labels: {},
  previewUrl: '',
};

function normalizeColor(value: string) {
  const trimmed = value.trim() || '#0f172a';
  return `rgb:${trimmed.replace(/^#/, '')}`;
}

function sanitizeCaptionText(value: string) {
  return value
    .replace(/[^\w\s!?.,:'-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 72);
}

function splitCaptionLines(value: string): string[] {
  const cleaned = sanitizeCaptionText(value);

  if (!cleaned) {
    return [DEFAULT_CAPTION];
  }

  const words = cleaned.split(' ');
  const lines: string[] = [];
  let current = '';

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;

    if (candidate.length > CAPTION_LINE_LIMIT && current) {
      lines.push(current);
      current = word;
    } else {
      current = candidate;
    }

    if (lines.length === CAPTION_MAX_LINES) {
      break;
    }
  }

  if (current && lines.length < CAPTION_MAX_LINES) {
    lines.push(current);
  }

  return lines.slice(0, CAPTION_MAX_LINES);
}

function buildCaptionLayer(line: string, captionStyle: BrainrotCaptionStyle, offsetY: number) {
  const overlayText = sanitizeCaptionText(line) || DEFAULT_CAPTION;

  return source(
    text(
      overlayText,
      new TextStyle(captionStyle.fontFamily, captionStyle.fontSize).fontWeight(
        captionStyle.fontWeight
      )
    )
      .textColor(normalizeColor(captionStyle.textColor))
      .backgroundColor(normalizeColor(captionStyle.backgroundColor))
  ).position(
    new Position()
      .gravity(compass(captionStyle.placement))
      .offsetX(captionStyle.horizontalOffset)
      .offsetY(offsetY)
  );
}

function buildTimedSubtitlesLayer(
  subtitlesAsset: BrainrotSubtitleAsset,
  captionStyle: BrainrotCaptionStyle
) {
  return source(
    subtitles(subtitlesAsset.publicId)
      .textStyle(
        new TextStyle(captionStyle.fontFamily, captionStyle.fontSize).fontWeight(
          captionStyle.fontWeight
        )
      )
      .textColor(normalizeColor(captionStyle.textColor))
  ).position(
    new Position()
      .gravity(compass(captionStyle.placement))
      .offsetX(captionStyle.horizontalOffset)
      .offsetY(captionStyle.verticalOffset)
  );
}

function isRemoteMediaAsset(asset: MediaAsset) {
  return asset.strategy === 'remote-fetch' || asset.source === 'remote';
}

function createBaseGameplayVideo(asset: MediaAsset) {
  if (isRemoteMediaAsset(asset)) {
    return cld.video(asset.secureUrl).setDeliveryType('fetch');
  }

  return cld.video(asset.publicId);
}

function buildCompositeAsset(
  {
    gameplayAsset,
    voiceoverAsset,
    subtitlesAsset,
    captionText,
    clipDuration,
    gameplayStartOffset,
    captionStyle = DEFAULT_BRAINROT_CAPTION_STYLE,
    layoutStyle = DEFAULT_BRAINROT_LAYOUT_STYLE,
  }: BrainrotCompositeOptions,
  { includeAudio = true }: { includeAudio?: boolean } = {}
) {
  const render = createBaseGameplayVideo(gameplayAsset)
    .videoEdit(trim().startOffset(gameplayStartOffset).duration(clipDuration))
    .videoEdit(volume(mute()))
    .resize(
      fill()
        .width(BRAINROT_FRAME_WIDTH)
        .height(BRAINROT_FRAME_HEIGHT)
        .gravity(compass(layoutStyle.gameplayGravity))
    );

  if (includeAudio && voiceoverAsset?.publicId) {
    render.overlay(source(audio(voiceoverAsset.publicId)));
  }

  if (subtitlesAsset?.publicId) {
    render.overlay(buildTimedSubtitlesLayer(subtitlesAsset, captionStyle));
  } else {
    const captionLines = splitCaptionLines(captionText);
    const lineOffset = Math.round(captionStyle.fontSize * 0.72);
    const blockStartOffset =
      captionStyle.verticalOffset - ((captionLines.length - 1) * lineOffset) / 2;

    captionLines.forEach((line, index) => {
      render.overlay(
        buildCaptionLayer(line, captionStyle, Math.round(blockStartOffset + index * lineOffset))
      );
    });
  }

  return render;
}

function buildTypeLabel(typeId: BrainrotTypeId) {
  return BRAINROT_TYPE_PRESETS.find((preset) => preset.id === typeId)?.label ?? 'Brain Rot';
}

async function readJsonResponse<T>(response: Response): Promise<T> {
  const raw = await response.text();
  const parsed = raw ? (JSON.parse(raw) as T & { error?: string }) : ({} as T & { error?: string });

  if (!response.ok) {
    throw new Error(parsed.error || 'Request failed.');
  }

  return parsed;
}

export function buildBrainrotCompositeUrl(options: BrainrotCompositeOptions) {
  return buildCompositeAsset(options)
    .delivery(format(autoFormat()))
    .delivery(quality(autoQuality()))
    .toURL();
}

export function buildBrainrotCompositePosterUrl(options: BrainrotCompositeOptions) {
  return buildCompositeAsset(options, { includeAudio: false }).format('jpg').toURL();
}

export function buildBrainrotRunPlan({
  brainrotType,
  voiceLabel,
  gameplayLabel,
  captionText,
  captionStyle,
  layoutStyle,
  durationSeconds,
  timedCaptions = false,
}: {
  brainrotType: BrainrotTypeId;
  voiceLabel: string;
  gameplayLabel?: string;
  captionText: string;
  captionStyle: BrainrotCaptionStyle;
  layoutStyle: BrainrotLayoutStyle;
  durationSeconds: number;
  timedCaptions?: boolean;
}) {
  return [
    `Style: ${buildTypeLabel(brainrotType)} prompt turned into a short-form script`,
    `Voiceover: ${voiceLabel} via ElevenLabs for ${durationSeconds.toFixed(1)}s`,
    `Gameplay bed: ${gameplayLabel || 'Selected gameplay'} trimmed, muted, and filled edge-to-edge`,
    `Layout: gameplay fills the full 9:16 frame with ${layoutStyle.gameplayGravity} crop focus`,
    timedCaptions
      ? `Captions: timed script-synced subtitles in ${captionStyle.fontFamily} ${captionStyle.fontSize}px at x ${captionStyle.horizontalOffset}px / y ${captionStyle.verticalOffset}px`
      : `Caption: "${sanitizeCaptionText(captionText) || DEFAULT_CAPTION}" in ${captionStyle.fontFamily} ${captionStyle.fontSize}px at x ${captionStyle.horizontalOffset}px / y ${captionStyle.verticalOffset}px`,
    'Music lane: reserved in the graph and ready for a later mix step',
    'Delivery: Cloudinary vertical render with embedded AI voiceover',
  ];
}

interface PrepareGameplayResponse {
  asset: MediaAsset;
  cached: boolean;
  fallback?: boolean;
}

interface ResolveBrainrotGameplayResponse {
  resolvedUrl: string;
  candidates?: string[];
  mode: 'direct' | 'scraped';
}

interface BrainrotCaptionsResponse {
  subtitleAsset: BrainrotSubtitleAsset;
  generatedAt: string;
  provider: string;
  strategy: string;
}

export function createFallbackBrainrotGameplayAsset(): MediaAsset | null {
  if (!cloudName) {
    return null;
  }

  return {
    id: DEFAULT_GAMEPLAY_PUBLIC_ID,
    label: 'Subway Surfers Gameplay',
    publicId: DEFAULT_GAMEPLAY_PUBLIC_ID,
    secureUrl: `https://res.cloudinary.com/${cloudName}/video/upload/f_auto,q_auto/${DEFAULT_GAMEPLAY_PUBLIC_ID}.mp4`,
    source: 'upload',
    strategy: 'cloudinary-public-id',
    resourceType: 'video',
    duration: 120,
  };
}

export async function prepareBrainrotGameplayAsset(): Promise<PrepareGameplayResponse> {
  try {
    const response = await fetch('/api/prepare-brainrot-gameplay');
    const data = await readJsonResponse<PrepareGameplayResponse>(response);

    if (!data.asset) {
      throw new Error('Gameplay asset response was missing the asset payload.');
    }

    return {
      asset: data.asset,
      cached: Boolean(data.cached),
      fallback: Boolean(data.fallback),
    };
  } catch (error) {
    const fallbackAsset = createFallbackBrainrotGameplayAsset();

    if (fallbackAsset) {
      return {
        asset: fallbackAsset,
        cached: true,
        fallback: true,
      };
    }

    throw error instanceof Error ? error : new Error('Failed to prepare the gameplay asset.');
  }
}

export async function fetchBrainrotVoices(): Promise<BrainrotVoicesResponse> {
  const response = await fetch('/api/brainrot-voices');
  const data = await readJsonResponse<BrainrotVoicesResponse>(response);

  return {
    voices: data.voices?.length ? data.voices : [FALLBACK_BRAINROT_VOICE],
    defaultVoiceId: data.defaultVoiceId || FALLBACK_BRAINROT_VOICE.id,
    fallback: Boolean(data.fallback),
    warning: data.warning,
  };
}

export async function generateBrainrotScript(input: {
  prompt: string;
  brainrotType: BrainrotTypeId;
  scriptGuidance?: string;
  targetDurationSeconds?: number;
}) {
  const response = await fetch('/api/brainrot-script', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(input),
  });

  return readJsonResponse<BrainrotScriptResponse>(response);
}

export async function generateBrainrotCaptions(input: {
  text: string;
  durationSeconds: number;
  seed: string;
}) {
  const response = await fetch('/api/brainrot-captions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(input),
  });

  return readJsonResponse<BrainrotCaptionsResponse>(response);
}

export async function synthesizeBrainrotVoice(input: {
  text: string;
  voiceId: string;
  voiceSettings: BrainrotVoiceSettings;
  seed: string;
}) {
  const response = await fetch('/api/brainrot-voice', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(input),
  });

  return readJsonResponse<BrainrotVoiceResponse>(response);
}

export async function resolveBrainrotGameplayUrl(url: string): Promise<MediaAsset> {
  const response = await fetch('/api/resolve-gameplay', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ url }),
  });
  const data = await readJsonResponse<ResolveBrainrotGameplayResponse>(response);

  return {
    id: `remote-${btoa(data.resolvedUrl).replace(/=+$/g, '')}`,
    label: data.mode === 'scraped' ? 'Resolved Gameplay Feed' : 'Remote Gameplay Feed',
    publicId: '',
    secureUrl: data.resolvedUrl,
    source: 'remote',
    strategy: 'remote-fetch',
    resourceType: 'video',
  };
}
