import { source } from '@cloudinary/url-gen/actions/overlay';
import { fill } from '@cloudinary/url-gen/actions/resize';
import { trim, volume } from '@cloudinary/url-gen/actions/videoEdit';
import { loop as loopEffect } from '@cloudinary/url-gen/actions/effect';
import { compass } from '@cloudinary/url-gen/qualifiers/gravity';
import { Position } from '@cloudinary/url-gen/qualifiers/position';
import { audio, image as imageSource, text } from '@cloudinary/url-gen/qualifiers/source';
import { TextStyle } from '@cloudinary/url-gen/qualifiers/textStyle';
import { solid } from '@cloudinary/url-gen/qualifiers/textStroke';
import { position as timelinePosition } from '@cloudinary/url-gen/qualifiers/timeline';
import { mute } from '@cloudinary/url-gen/qualifiers/volume';
import { format, quality } from '@cloudinary/url-gen/actions/delivery';
import { auto as autoFormat } from '@cloudinary/url-gen/qualifiers/format';
import { auto as autoQuality } from '@cloudinary/url-gen/qualifiers/quality';
import { cloudName, cld } from '../cloudinary/config';
import type { MediaAsset } from '../types';

export const BRAINROT_FRAME_WIDTH = 1080;
export const BRAINROT_FRAME_HEIGHT = 1920;
export const INTRO_CARD_DURATION_SECONDS = 3;
const DEFAULT_CAPTION = 'Watch this one closely';
const DEFAULT_GAMEPLAY_PUBLIC_ID = 'shorty/brainrot/subway-surfers-demo';
const CAPTION_LINE_LIMIT = 22;
const CAPTION_MAX_LINES = 3;
const INTRO_CARD_OVERLAY_OFFSET_Y = -160;

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
  | 'satisfying-ice-cream'
  | 'satisfying-bubbles'
  | 'satisfying-soap'
  | 'satisfying-street-bubbles'
  | 'custom-remote';
export type BrainrotCaptionPresetId =
  | 'signal-pop'
  | 'clean-room'
  | 'night-shift'
  | 'arcade-glow'
  | 'reddit-story';
export type BrainrotTemplateId = 'subway-template' | 'satisfying-template';

export interface BrainrotAudioAsset {
  id: string;
  label: string;
  publicId: string;
  secureUrl: string;
  duration: number;
  resourceType: 'video';
  provider?: string;
}

export interface BrainrotWordTiming {
  text: string;
  startSeconds: number;
  endSeconds: number;
}

export interface BrainrotVoiceAlignment {
  sourceText: string;
  words: BrainrotWordTiming[];
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
  backgroundVisible: boolean;
  fontFamily: BrainrotFontFamily;
  fontSize: number;
  fontWeight: 'normal' | 'bold';
  strokeColor: string;
  strokeWidth: number;
  maxWordsPerCue: number;
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
  remoteUrl?: string;
  duration?: number;
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

export interface BrainrotTemplatePreset {
  id: BrainrotTemplateId;
  label: string;
  tag: string;
  description: string;
  gameplayPresetId: BrainrotGameplayPresetId;
  typeId: BrainrotTypeId;
  captionPresetId: BrainrotCaptionPresetId;
  preferredVoiceGender: 'female' | 'male';
  defaultPrompt: string;
  defaultIntroQuestion: string;
  defaultScriptGuidance: string;
}

export interface BrainrotIntroCard {
  enabled: boolean;
  title: string;
  question: string;
  durationSeconds: number;
}

export interface BrainrotIntroCardAsset {
  id: string;
  publicId: string;
  secureUrl: string;
  width: number;
  height: number;
  resourceType: 'image';
}

export interface BrainrotScriptPackage {
  title: string;
  hook: string;
  spokenScript: string;
  captionText: string;
  introCardTitle: string;
  introCardQuestion: string;
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
  alignment?: BrainrotVoiceAlignment | null;
  generatedAt: string;
  warning?: string;
}

export interface BrainrotVoicesResponse {
  voices: BrainrotVoiceOption[];
  defaultVoiceId: string;
  fallback?: boolean;
  warning?: string;
}

export interface BrainrotNodeSuggestion {
  title: string;
  body: string;
  color: string;
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
  introCard?: BrainrotIntroCard;
  introCardAsset?: BrainrotIntroCardAsset | null;
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
    label: 'Drama Recap',
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

export const BRAINROT_TEMPLATE_PRESETS: BrainrotTemplatePreset[] = [
  {
    id: 'subway-template',
    label: 'Subway Surfers Template',
    tag: 'Classic',
    description: 'Muted Subway Surfers gameplay under a tension-heavy story narration with centered captions.',
    gameplayPresetId: 'subway-classic',
    typeId: 'reddit-drama',
    captionPresetId: 'reddit-story',
    preferredVoiceGender: 'female',
    defaultPrompt: 'What family tradition ruined your family?',
    defaultIntroQuestion: 'What family tradition ruined your family?',
    defaultScriptGuidance:
      'Open with a strong question, then turn it into a gripping confession-style story with a female creator delivery. Keep the phrasing easy to caption in short 2 to 4 word bursts.',
  },
  {
    id: 'satisfying-template',
    label: 'Satisfying Video Template',
    tag: 'ASMR',
    description: 'Free stock satisfying footage behind an instant-hook opener and bold centered captions.',
    gameplayPresetId: 'satisfying-ice-cream',
    typeId: 'reddit-drama',
    captionPresetId: 'reddit-story',
    preferredVoiceGender: 'female',
    defaultPrompt: 'What family tradition ruined your family?',
    defaultIntroQuestion: 'What family tradition ruined your family?',
    defaultScriptGuidance:
      'Open with a sharp question and make it sound like an addicting story recap with a female creator voice. Keep every caption chunk short, punchy, and easy to read in the center of the screen.',
  },
];

export const BRAINROT_FONT_OPTIONS: BrainrotFontFamily[] = ['Impact'];

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
    id: 'satisfying-ice-cream',
    label: 'Satisfying Ice Cream',
    tag: 'Sweet',
    description: 'A looping Thai ice cream macro clip that matches the soft, satisfying look in your reference.',
    source: 'remote',
    defaultOffset: 0,
    defaultGravity: 'center',
    remoteUrl: 'https://cdn.coverr.co/videos/coverr-making-thai-ice-cream-4635/360p.mp4',
    duration: 8,
  },
  {
    id: 'satisfying-bubbles',
    label: 'Slow Bubbles',
    tag: 'Calm',
    description: 'Soft slow-motion bubbles as an alternate satisfying background template.',
    source: 'remote',
    defaultOffset: 0,
    defaultGravity: 'center',
    remoteUrl: 'https://cdn.coverr.co/videos/coverr-bubbles-in-slow-motion-4154/360p.mp4',
    duration: 10,
  },
  {
    id: 'satisfying-soap',
    label: 'Foam Soap',
    tag: 'Clean',
    description: 'Close-up foam soap visuals for a glossy, repetitive satisfying background.',
    source: 'remote',
    defaultOffset: 0,
    defaultGravity: 'center',
    remoteUrl: 'https://coverr.co/videos/washing-hands-with-foam-soap-cK81mJE55e',
    duration: 11,
  },
  {
    id: 'satisfying-street-bubbles',
    label: 'Street Bubbles',
    tag: 'Float',
    description: 'Colorful floating bubbles with a softer satisfying motion profile.',
    source: 'remote',
    defaultOffset: 0,
    defaultGravity: 'center',
    remoteUrl: 'https://coverr.co/videos/bubbles-on-the-street-KPO5zy95Pg',
    duration: 12,
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
  backgroundVisible: false,
  fontFamily: 'Impact',
  fontSize: 28,
  fontWeight: 'bold',
  strokeColor: '#050505',
  strokeWidth: 3,
  maxWordsPerCue: 3,
  placement: 'center',
  horizontalOffset: 0,
  verticalOffset: 0,
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
      textColor: '#ffe44d',
      backgroundColor: '#000000',
      backgroundVisible: false,
      fontFamily: 'Impact',
      fontSize: 36,
      fontWeight: 'bold',
      strokeColor: '#000000',
      strokeWidth: 6,
      maxWordsPerCue: 3,
      placement: 'center',
      horizontalOffset: 0,
      verticalOffset: 0,
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
      backgroundColor: '#000000',
      backgroundVisible: false,
      fontFamily: 'Impact',
      fontSize: 32,
      fontWeight: 'bold',
      strokeColor: '#000000',
      strokeWidth: 5,
      maxWordsPerCue: 4,
      placement: 'center',
      horizontalOffset: 0,
      verticalOffset: 0,
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
      backgroundColor: '#000000',
      backgroundVisible: false,
      fontFamily: 'Impact',
      fontSize: 34,
      fontWeight: 'bold',
      strokeColor: '#0f172a',
      strokeWidth: 6,
      maxWordsPerCue: 4,
      placement: 'center',
      horizontalOffset: 0,
      verticalOffset: 12,
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
      backgroundColor: '#000000',
      backgroundVisible: false,
      fontFamily: 'Impact',
      fontSize: 34,
      fontWeight: 'bold',
      strokeColor: '#083344',
      strokeWidth: 6,
      maxWordsPerCue: 4,
      placement: 'center',
      horizontalOffset: 0,
      verticalOffset: 0,
    },
  },
  {
    id: 'reddit-story',
    label: 'Story Outline',
    tag: 'Outline',
    description: 'Bold white center captions with a thick black outline, tuned for fast story clips.',
    previewFontFamily: '"Arial Black", "Anton", sans-serif',
    style: {
      textColor: '#ffffff',
      backgroundColor: '#000000',
      backgroundVisible: false,
      fontFamily: 'Impact',
      fontSize: 28,
      fontWeight: 'bold',
      strokeColor: '#000000',
      strokeWidth: 3,
      maxWordsPerCue: 3,
      placement: 'center',
      horizontalOffset: 0,
      verticalOffset: 0,
    },
  },
];

export const FALLBACK_BRAINROT_VOICE: BrainrotVoiceOption = {
  id: 'google:Kore',
  name: 'Kore',
  category: 'google-ai',
  labels: {
    descriptive: 'firm',
    use_case: 'story',
    gender: 'female',
  },
  previewUrl: '',
};

function normalizeColor(value: string) {
  const trimmed = value.trim() || '#0f172a';
  return `rgb:${trimmed.replace(/^#/, '')}`;
}

function buildTextStyle(
  captionStyle: BrainrotCaptionStyle,
  options?: { fontSize?: number; includeStroke?: boolean }
) {
  const textStyle = new TextStyle(
    captionStyle.fontFamily,
    options?.fontSize ?? captionStyle.fontSize
  ).fontWeight(captionStyle.fontWeight);

  if (options?.includeStroke !== false && captionStyle.strokeWidth > 0) {
    textStyle.stroke(solid(captionStyle.strokeWidth, normalizeColor(captionStyle.strokeColor)));
  }

  return textStyle;
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

function buildCaptionLayers(line: string, captionStyle: BrainrotCaptionStyle, offsetY: number) {
  const overlayText = sanitizeCaptionText(line) || DEFAULT_CAPTION;
  const textSource = text(overlayText, buildTextStyle(captionStyle)).textColor(
    normalizeColor(captionStyle.textColor)
  );

  if (captionStyle.backgroundVisible) {
    textSource.backgroundColor(normalizeColor(captionStyle.backgroundColor));
  }

  return [
    source(textSource).position(
      new Position()
        .gravity(compass(captionStyle.placement))
        .offsetX(captionStyle.horizontalOffset)
        .offsetY(offsetY)
    ),
  ];
}

function serializeOverlayPublicId(publicId: string) {
  return String(publicId || '')
    .replace(/^\/+|\/+$/g, '')
    .replace(/\//g, ':');
}

function buildTimedSubtitlesTransformations(
  subtitlesAsset: BrainrotSubtitleAsset,
  captionStyle: BrainrotCaptionStyle
) {
  const sourceParts = [
    `co_${normalizeColor(captionStyle.textColor)}`,
    `l_subtitles:${buildTextStyle(captionStyle, { includeStroke: false }).toString()}:${serializeOverlayPublicId(subtitlesAsset.publicId)}`,
  ];

  if (captionStyle.backgroundVisible) {
    sourceParts.push(`b_${normalizeColor(captionStyle.backgroundColor)}`);
  }

  if (captionStyle.strokeWidth > 0) {
    sourceParts.push(
      `bo_${captionStyle.strokeWidth}px_solid_${normalizeColor(captionStyle.strokeColor)}`
    );
  }

  const applyParts = [`fl_layer_apply`, `g_${captionStyle.placement}`];

  applyParts.push(`x_${captionStyle.horizontalOffset}`, `y_${captionStyle.verticalOffset}`);

  return [`${sourceParts.join(',')}/${applyParts.join(',')}`];
}

function buildIntroCardOverlayLayer(introCardAsset: BrainrotIntroCardAsset) {
  return source(imageSource(introCardAsset.publicId))
    .position(new Position().gravity(compass('center')).offsetY(INTRO_CARD_OVERLAY_OFFSET_Y))
    .timeline(
      timelinePosition()
        .startOffset(0)
        .endOffset(INTRO_CARD_DURATION_SECONDS)
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
    introCard,
    introCardAsset,
  }: BrainrotCompositeOptions,
  { includeAudio = true }: { includeAudio?: boolean } = {}
) {
  const availableDuration = gameplayAsset.duration
    ? Math.max(1, gameplayAsset.duration - gameplayStartOffset)
    : null;
  const requiredLoops = availableDuration
    ? Math.max(0, Math.ceil(clipDuration / availableDuration) - 1)
    : 0;
  const introLeadInSeconds =
    introCard?.enabled && introCard.question.trim() ? INTRO_CARD_DURATION_SECONDS : 0;
  const render = createBaseGameplayVideo(gameplayAsset);

  if (requiredLoops > 0) {
    render.effect(loopEffect(requiredLoops));
  }

  render
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
    buildTimedSubtitlesTransformations(subtitlesAsset, captionStyle).forEach((layer) => {
      render.addTransformation(layer);
    });
  } else {
    const captionLines = splitCaptionLines(captionText);
    const lineOffset = Math.round(captionStyle.fontSize * 0.72);
    const blockStartOffset =
      captionStyle.verticalOffset - ((captionLines.length - 1) * lineOffset) / 2;

    captionLines.forEach((line, index) => {
      buildCaptionLayers(line, captionStyle, Math.round(blockStartOffset + index * lineOffset))
        .map((layer) =>
          introLeadInSeconds > 0
            ? layer.timeline(timelinePosition().startOffset(introLeadInSeconds))
            : layer
        )
        .forEach((layer) => {
          render.overlay(layer);
        });
    });
  }

  if (introCardAsset && introLeadInSeconds > 0) {
    render.overlay(buildIntroCardOverlayLayer(introCardAsset));
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
  introCard,
}: {
  brainrotType: BrainrotTypeId;
  voiceLabel: string;
  gameplayLabel?: string;
  captionText: string;
  captionStyle: BrainrotCaptionStyle;
  layoutStyle: BrainrotLayoutStyle;
  durationSeconds: number;
  timedCaptions?: boolean;
  introCard?: BrainrotIntroCard;
}) {
  return [
    `Style: ${buildTypeLabel(brainrotType)} prompt turned into a short-form script`,
    `Voiceover: ${voiceLabel} for ${durationSeconds.toFixed(1)}s`,
    `Gameplay bed: ${gameplayLabel || 'Selected gameplay'} trimmed, muted, and filled edge-to-edge`,
    `Layout: gameplay fills the full 9:16 frame with ${layoutStyle.gameplayGravity} crop focus`,
    introCard?.enabled
      ? `Intro: rounded story post card shown for the first ${INTRO_CARD_DURATION_SECONDS.toFixed(1)}s while narration stays in sync underneath`
      : 'Intro: no opening card overlay',
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

interface PrepareRemoteGameplayResponse {
  asset: MediaAsset;
  cached: boolean;
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

interface BrainrotIntroCardResponse {
  asset: BrainrotIntroCardAsset;
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

export async function prepareBrainrotRemoteGameplayAsset(input: {
  presetId?: string;
  url: string;
  label: string;
  duration?: number;
}): Promise<PrepareRemoteGameplayResponse> {
  const response = await fetch('/api/prepare-brainrot-remote-gameplay', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(input),
  });

  return readJsonResponse<PrepareRemoteGameplayResponse>(response);
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
  variationIndex?: number;
  variationCount?: number;
  partLabel?: string;
  previousTitles?: string[];
  previousHooks?: string[];
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
  maxWordsPerCue?: number;
  trimStartSeconds?: number;
  wordTimings?: BrainrotWordTiming[];
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

export async function generateBrainrotIntroCardAsset(introCard: BrainrotIntroCard) {
  const response = await fetch('/api/brainrot-intro-card', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      title: introCard.title,
      question: introCard.question,
    }),
  });

  return readJsonResponse<BrainrotIntroCardResponse>(response);
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

export async function generateBrainrotNode(input: { prompt: string; seed?: string }) {
  const response = await fetch('/api/brainrot-node', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(input),
  });

  return readJsonResponse<BrainrotNodeSuggestion>(response);
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
