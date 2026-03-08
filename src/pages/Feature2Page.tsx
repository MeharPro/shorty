import { useEffect, useRef, useState } from 'react';
import type {
  MouseEvent as ReactMouseEvent,
  PointerEvent as ReactPointerEvent,
  WheelEvent as ReactWheelEvent,
} from 'react';
import { createPortal } from 'react-dom';
import { Link, Navigate } from 'react-router-dom';
import boltLogo from '../assets/bolt-logo.png';
import {
  BRAINROT_FRAME_HEIGHT,
  BRAINROT_FRAME_WIDTH,
  BRAINROT_CAPTION_STYLE_PRESETS,
  BRAINROT_GAMEPLAY_PRESETS,
  BRAINROT_GAMEPLAY_GRAVITY_OPTIONS,
  BRAINROT_TEMPLATE_PRESETS,
  BRAINROT_TYPE_PRESETS,
  DEFAULT_BRAINROT_CAPTION_STYLE,
  DEFAULT_BRAINROT_LAYOUT_STYLE,
  DEFAULT_BRAINROT_VOICE_SETTINGS,
  FALLBACK_BRAINROT_VOICE,
  INTRO_CARD_DURATION_SECONDS,
  buildBrainrotCompositePosterUrl,
  buildBrainrotCompositeUrl,
  buildBrainrotRunPlan,
  fetchBrainrotVoices,
  generateBrainrotIntroCardAsset,
  generateBrainrotNode,
  generateBrainrotCaptions,
  generateBrainrotScript,
  prepareBrainrotGameplayAsset,
  prepareBrainrotRemoteGameplayAsset,
  resolveBrainrotGameplayUrl,
  synthesizeBrainrotVoice,
  type BrainrotAudioAsset,
  type BrainrotIntroCard,
  type BrainrotCaptionStyle,
  type BrainrotCaptionPresetId,
  type BrainrotFontFamily,
  type BrainrotLayoutStyle,
  type BrainrotScriptPackage,
  type BrainrotStageId,
  type BrainrotSubtitleAsset,
  type BrainrotTemplateId,
  type BrainrotTypeId,
  type BrainrotGameplayPresetId,
  type BrainrotGameplayPreset,
  type BrainrotVoiceOption,
  type BrainrotVoiceSettings,
} from '../lib/brainrot';
import { buildPlayableSourceUrl } from '../lib/rendering';
import type { ShortySession } from '../lib/session';
import type { MediaAsset } from '../types';

interface Feature2PageProps {
  session: ShortySession | null;
}

type CanvasSelectionId = BrainrotStageId | string;
type FlowNodeStatus = 'locked' | 'ready' | 'running' | 'complete' | 'error';
type LogTone = 'info' | 'success' | 'warn' | 'error';
type VoiceFilterMode = 'recommended' | 'expressive-female' | 'expressive-male' | 'all' | 'cloned';

interface FlowNodeModel {
  id: BrainrotStageId;
  step: string;
  title: string;
  summary: string;
  code: string;
  status: FlowNodeStatus;
}

interface ActivityLogEntry {
  id: string;
  message: string;
  tone: LogTone;
  timestamp: string;
}

interface GeneratedRender {
  deliveryUrl: string;
  posterUrl: string;
  generatedAt: string;
  plan: string[];
  script: BrainrotScriptPackage;
  audioAsset: BrainrotAudioAsset;
  subtitleAsset: BrainrotSubtitleAsset | null;
  voiceName: string;
  gameplayLabel: string;
  typeLabel: string;
  durationSeconds: number;
}

interface CoreCanvasNode {
  id: BrainrotStageId;
  kind: 'core';
  x: number;
  y: number;
}

interface CustomCanvasNode {
  id: string;
  kind: 'custom';
  x: number;
  y: number;
  title: string;
  body: string;
  color: string;
}

type CanvasNode = CoreCanvasNode | CustomCanvasNode;

const CORE_NODE_ORDER: BrainrotStageId[] = [
  'prompt',
  'script',
  'voice',
  'gameplay',
  'caption',
  'music',
  'render',
];

const CORE_NODE_WIDTH = 244;
const CORE_NODE_HEIGHT = 176;
const CUSTOM_NODE_WIDTH = 220;
const CUSTOM_NODE_HEIGHT = 150;
const CANVAS_PADDING = 24;
const MIN_CANVAS_HEIGHT = 700;
const DEFAULT_CANVAS_WIDTH = 1220;
const MIN_CANVAS_ZOOM = 0.35;
const MAX_CANVAS_ZOOM = 1.4;
const CANVAS_ZOOM_STEP = 0.05;
const DEFAULT_CANVAS_ZOOM = 0.65;
const TARGET_DURATION_MIN = 60;
const TARGET_DURATION_MAX = 90;
const TARGET_DURATION_STEP = 5;
const DEFAULT_TARGET_DURATION = 75;
const TARGET_DURATION_PRESETS = [60, 75, 90];
const DEFAULT_TEMPLATE_ID: BrainrotTemplateId = 'satisfying-template';
const CAPTION_GUIDE_LINE_LIMIT = 22;
const CAPTION_GUIDE_MAX_LINES = 3;
const CAPTION_PREVIEW_FONT_SCALE = 0.62;
const CAPTION_FONT_SIZE_MIN = 18;
const CAPTION_FONT_SIZE_MAX = 48;
const CAPTION_HORIZONTAL_LIMIT = 420;
const CAPTION_VERTICAL_LIMIT = 760;

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function delay(ms: number) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

function isCoreStageId(value: string): value is BrainrotStageId {
  return CORE_NODE_ORDER.includes(value as BrainrotStageId);
}

function isCustomCanvasNode(node: CanvasNode): node is CustomCanvasNode {
  return node.kind === 'custom';
}

function getNodeBounds(node: CanvasNode) {
  return {
    width: node.kind === 'core' ? CORE_NODE_WIDTH : CUSTOM_NODE_WIDTH,
    height: node.kind === 'core' ? CORE_NODE_HEIGHT : CUSTOM_NODE_HEIGHT,
  };
}

function getDefaultCorePositions(width: number, height: number) {
  const maxX = Math.max(CANVAS_PADDING, width - CORE_NODE_WIDTH - CANVAS_PADDING);
  const maxY = Math.max(CANVAS_PADDING, height - CORE_NODE_HEIGHT - CANVAS_PADDING);
  const columnGap = Math.max(
    44,
    Math.min(110, (width - CANVAS_PADDING * 2 - CORE_NODE_WIDTH * 3) / 2)
  );
  const rowGap = Math.max(
    38,
    Math.min(96, (height - CANVAS_PADDING * 2 - CORE_NODE_HEIGHT * 3) / 2)
  );
  const column1 = CANVAS_PADDING;
  const column2 = column1 + CORE_NODE_WIDTH + columnGap;
  const column3 = column2 + CORE_NODE_WIDTH + columnGap;
  const row1 = CANVAS_PADDING;
  const row2 = row1 + CORE_NODE_HEIGHT + rowGap;
  const row3 = row2 + CORE_NODE_HEIGHT + rowGap;
  const positions: Record<BrainrotStageId, { x: number; y: number }> = {
    prompt: { x: column1, y: row1 },
    script: { x: column2, y: row1 },
    voice: { x: column3, y: row1 },
    gameplay: { x: column3, y: row2 },
    caption: { x: column2, y: row2 },
    music: { x: column1, y: row2 },
    render: { x: column2, y: row3 },
  };

  return Object.fromEntries(
    Object.entries(positions).map(([key, point]) => [
      key,
      {
        x: clamp(Math.round(point.x), CANVAS_PADDING, maxX),
        y: clamp(Math.round(point.y), CANVAS_PADDING, maxY),
      },
    ])
  ) as Record<BrainrotStageId, { x: number; y: number }>;
}

function createInitialCanvasNodes(width: number, height: number): CanvasNode[] {
  const defaults = getDefaultCorePositions(width, height);
  return CORE_NODE_ORDER.map((id) => ({
    id,
    kind: 'core',
    x: defaults[id].x,
    y: defaults[id].y,
  }));
}

function createCoreLinkPath(fromNode: CoreCanvasNode, toNode: CoreCanvasNode) {
  const fromCenterX = fromNode.x + CORE_NODE_WIDTH / 2;
  const fromCenterY = fromNode.y + CORE_NODE_HEIGHT / 2;
  const toCenterX = toNode.x + CORE_NODE_WIDTH / 2;
  const toCenterY = toNode.y + CORE_NODE_HEIGHT / 2;
  const deltaX = toCenterX - fromCenterX;
  const deltaY = toCenterY - fromCenterY;

  if (Math.abs(deltaX) >= Math.abs(deltaY)) {
    const direction = deltaX >= 0 ? 1 : -1;
    const startX = fromNode.x + (direction > 0 ? CORE_NODE_WIDTH : 0);
    const startY = fromCenterY;
    const endX = toNode.x + (direction > 0 ? 0 : CORE_NODE_WIDTH);
    const endY = toCenterY;
    const controlOffset = Math.max(56, Math.abs(deltaX) * 0.35);

    return `M ${startX} ${startY} C ${startX + controlOffset * direction} ${startY}, ${endX - controlOffset * direction} ${endY}, ${endX} ${endY}`;
  }

  const direction = deltaY >= 0 ? 1 : -1;
  const startX = fromCenterX;
  const startY = fromNode.y + (direction > 0 ? CORE_NODE_HEIGHT : 0);
  const endX = toCenterX;
  const endY = toNode.y + (direction > 0 ? 0 : CORE_NODE_HEIGHT);
  const controlOffset = Math.max(56, Math.abs(deltaY) * 0.35);

  return `M ${startX} ${startY} C ${startX} ${startY + controlOffset * direction}, ${endX} ${endY - controlOffset * direction}, ${endX} ${endY}`;
}

function formatDuration(seconds?: number): string {
  if (!seconds) {
    return 'n/a';
  }

  const mins = Math.floor(seconds / 60);
  const remaining = Math.round(seconds % 60);
  return `${mins}:${remaining.toString().padStart(2, '0')}`;
}

function createLogEntry(message: string, tone: LogTone = 'info'): ActivityLogEntry {
  return {
    id: crypto.randomUUID(),
    message,
    tone,
    timestamp: new Date().toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    }),
  };
}

function summarizeScriptAsCaption(scriptText: string) {
  return scriptText
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .slice(0, 8)
    .join(' ');
}

function pickAutomaticCaption(script: BrainrotScriptPackage) {
  return (
    script.captionText.replace(/\s+/g, ' ').trim() ||
    script.hook.replace(/\s+/g, ' ').trim() ||
    summarizeScriptAsCaption(script.spokenScript) ||
    'Watch this one closely'
  );
}

function buildCaptionGuideSourceText(input: {
  captionText: string;
  scriptDraft: string;
  generatedScript: BrainrotScriptPackage | null;
}) {
  const source =
    input.generatedScript?.spokenScript ||
    input.generatedScript?.captionText ||
    input.captionText ||
    input.scriptDraft ||
    'Captions appear here while the voiceover runs.';

  return source.replace(/\s+/g, ' ').trim();
}

function splitCaptionGuideLines(sourceText: string, maxWordsPerCue: number) {
  const words = sourceText.split(' ').filter(Boolean);
  if (!words.length) {
    return ['Captions appear here'];
  }

  const wordChunkSize = clamp(maxWordsPerCue || 3, 2, 6);
  const lines: string[] = [];

  for (let index = 0; index < words.length; index += wordChunkSize) {
    const chunk = words.slice(index, index + wordChunkSize).join(' ');
    if (!chunk) {
      continue;
    }

    if (chunk.length > CAPTION_GUIDE_LINE_LIMIT && wordChunkSize > 2) {
      const midpoint = Math.ceil(chunk.split(' ').length / 2);
      lines.push(chunk.split(' ').slice(0, midpoint).join(' '));
      if (lines.length === CAPTION_GUIDE_MAX_LINES) {
        break;
      }
      lines.push(chunk.split(' ').slice(midpoint).join(' '));
    } else {
      lines.push(chunk);
    }

    if (lines.length >= CAPTION_GUIDE_MAX_LINES) {
      break;
    }
  }

  return lines.slice(0, CAPTION_GUIDE_MAX_LINES);
}

function resolveCaptionGuideFontFamily(fontFamily: BrainrotFontFamily) {
  switch (fontFamily) {
    case 'Impact':
      return 'Impact, Haettenschweiler, "Arial Narrow Bold", sans-serif';
    case 'Courier':
      return '"Courier New", Courier, monospace';
    case 'Georgia':
      return 'Georgia, serif';
    case 'Verdana':
      return 'Verdana, Geneva, sans-serif';
    case 'Arial':
    default:
      return 'Arial, Helvetica, sans-serif';
  }
}

function resolveCaptionPreviewPosition(captionStyle: BrainrotCaptionStyle) {
  return {
    left: `${clamp(50 + (captionStyle.horizontalOffset / BRAINROT_FRAME_WIDTH) * 100, 28, 72)}%`,
    top: `${clamp(50 + (captionStyle.verticalOffset / BRAINROT_FRAME_HEIGHT) * 100, 10, 90)}%`,
    transform: 'translate(-50%, -50%)',
  };
}

function withAlpha(color: string, alpha: number) {
  const normalized = color.trim();
  const shortHexMatch = normalized.match(/^#([\da-f]{3})$/i);
  const longHexMatch = normalized.match(/^#([\da-f]{6})$/i);

  if (shortHexMatch) {
    const expanded = shortHexMatch[1]
      .split('')
      .map((part) => `${part}${part}`)
      .join('');
    const red = Number.parseInt(expanded.slice(0, 2), 16);
    const green = Number.parseInt(expanded.slice(2, 4), 16);
    const blue = Number.parseInt(expanded.slice(4, 6), 16);
    return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
  }

  if (longHexMatch) {
    const hex = longHexMatch[1];
    const red = Number.parseInt(hex.slice(0, 2), 16);
    const green = Number.parseInt(hex.slice(2, 4), 16);
    const blue = Number.parseInt(hex.slice(4, 6), 16);
    return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
  }

  return normalized;
}

function readVoiceLabel(voice: BrainrotVoiceOption, key: string) {
  const matchedKey = Object.keys(voice.labels).find(
    (candidate) => candidate.toLowerCase().replace(/\s+/g, '_') === key
  );

  return matchedKey ? String(voice.labels[matchedKey] || '').trim() : '';
}

function formatVoiceLabel(value: string) {
  return value.replace(/[_-]+/g, ' ').trim();
}

function scoreVoice(voice: BrainrotVoiceOption, preferredGender: 'female' | 'male' = 'female') {
  const gender = readVoiceLabel(voice, 'gender').toLowerCase();
  const useCase = readVoiceLabel(voice, 'use_case').toLowerCase();
  const descriptive = readVoiceLabel(voice, 'descriptive').toLowerCase();
  const category = voice.category.toLowerCase();
  let score = 0;

  if (gender === preferredGender) {
    score += 4;
  }

  if (gender && gender !== preferredGender) {
    score += 0.5;
  }

  if (useCase.includes('social_media')) {
    score += 3.5;
  }

  if (useCase.includes('conversational')) {
    score += 3;
  }

  if (useCase.includes('narrative_story')) {
    score += 2.5;
  }

  if (descriptive.includes('hyped') || descriptive.includes('confident')) {
    score += 2.5;
  }

  if (descriptive.includes('classy') || descriptive.includes('casual') || descriptive.includes('deep')) {
    score += 1.5;
  }

  if (category === 'professional') {
    score += 1.75;
  }

  if (category === 'cloned') {
    score += 1;
  }

  if (voice.previewUrl) {
    score += 0.5;
  }

  return score;
}

function sortVoicesByRecommendation(
  voices: BrainrotVoiceOption[],
  preferredGender: 'female' | 'male' = 'female'
) {
  return [...voices].sort((left, right) => {
    const delta = scoreVoice(right, preferredGender) - scoreVoice(left, preferredGender);

    if (delta !== 0) {
      return delta;
    }

    return left.name.localeCompare(right.name);
  });
}

function pickRecommendedVoiceId(
  voices: BrainrotVoiceOption[],
  preferredGender: 'female' | 'male' = 'female'
) {
  const genderMatchedVoice = sortVoicesByRecommendation(voices, preferredGender).find(
    (voice) => readVoiceLabel(voice, 'gender').toLowerCase() === preferredGender
  );

  return (
    genderMatchedVoice?.id ??
    sortVoicesByRecommendation(voices, preferredGender)[0]?.id ??
    FALLBACK_BRAINROT_VOICE.id
  );
}

function buildGeminiInputPreview({
  typeLabel,
  prompt,
  scriptGuidance,
  targetDurationSeconds,
  introCard,
}: {
  typeLabel: string;
  prompt: string;
  scriptGuidance: string;
  targetDurationSeconds: number;
  introCard: BrainrotIntroCard;
}) {
  return [
    `Brain rot style: ${typeLabel}`,
    `Topic: ${prompt.trim() || 'Describe the reel idea here.'}`,
    `Script guidance: ${scriptGuidance.trim() || 'Keep it punchy, conversational, and easy to caption.'}`,
    introCard.enabled
      ? `Opening card: rounded story card for ${INTRO_CARD_DURATION_SECONDS.toFixed(1)}s using ${introCard.title.trim() || 'Story Watch'} / ${introCard.question.trim() || 'Add your opening question here.'}`
      : 'Opening card: disabled',
    `Target: ${targetDurationSeconds} second vertical voiceover with a strong hook and timed captions.`,
  ].join('\n');
}

function buildManualScriptPackage(
  scriptText: string,
  captionText: string,
  brainrotType: BrainrotTypeId
): BrainrotScriptPackage {
  const typeLabel =
    BRAINROT_TYPE_PRESETS.find((preset) => preset.id === brainrotType)?.label ?? 'Brain Rot';
  const cleanScript = scriptText.replace(/\s+/g, ' ').trim();
  const cleanCaption = captionText.replace(/\s+/g, ' ').trim() || summarizeScriptAsCaption(cleanScript);

  return {
    title: `${typeLabel} Voiceover`,
    hook: cleanCaption || 'Watch this one closely',
    spokenScript: cleanScript,
    captionText: cleanCaption || 'Watch this one closely',
    visualNotes: [
      'Use the generated voiceover as the only live audio bed.',
      'Keep the gameplay moving fast under the caption position you staged.',
      'Leave a beat at the end for the caption to land.',
    ],
  };
}

function buildAssetSeed(brainrotType: BrainrotTypeId, title: string) {
  const typeLabel =
    BRAINROT_TYPE_PRESETS.find((preset) => preset.id === brainrotType)?.label ?? brainrotType;

  return `${typeLabel} ${title}`.replace(/\s+/g, ' ').trim();
}

function ensureQuestion(value: string) {
  const trimmed = value.replace(/\s+/g, ' ').trim();

  if (!trimmed) {
    return '';
  }

  return /[?!.]$/.test(trimmed) ? trimmed : `${trimmed}?`;
}

function applyIntroCardToScript(
  script: BrainrotScriptPackage,
  introCard: BrainrotIntroCard
): BrainrotScriptPackage {
  if (!introCard.enabled) {
    return script;
  }

  const question = ensureQuestion(introCard.question) || 'What happened next?';

  return {
    ...script,
    hook: question,
    captionText: question,
  };
}

function formatIntroCardHandle(value: string) {
  const trimmed = value.replace(/\s+/g, ' ').trim().replace(/^@+/, '');
  return trimmed ? `@${trimmed}` : '@Story Watch';
}

function getIntroCardAvatarLetters(value: string) {
  const cleaned = value.replace(/^@/, '');
  const words = cleaned.split(/\s+/).filter(Boolean);

  if (words.length >= 2) {
    return `${words[0][0] ?? 'R'}${words[1][0] ?? 'W'}`.toUpperCase();
  }

  return (words[0] || 'RW').slice(0, 2).toUpperCase();
}

function RedditIntroCardPreview({ introCard }: { introCard: BrainrotIntroCard }) {
  const handle = formatIntroCardHandle(introCard.title);
  const initials = getIntroCardAvatarLetters(handle);
  const question = ensureQuestion(introCard.question) || 'What happened next?';

  return (
    <div className="brainrot-reddit-card" role="presentation">
      <div className="brainrot-reddit-card__avatar">{initials}</div>
      <div className="brainrot-reddit-card__content">
        <div className="brainrot-reddit-card__header">
          <div className="brainrot-reddit-card__title-row">
            <strong>{handle}</strong>
            <span className="brainrot-reddit-card__verified">✓</span>
          </div>
          <div className="brainrot-reddit-card__badges" aria-hidden="true">
            <span>✦</span>
            <span>✶</span>
            <span>✷</span>
            <span>✹</span>
            <span>✶</span>
            <span>✦</span>
          </div>
        </div>
        <p className="brainrot-reddit-card__question">{question}</p>
        <div className="brainrot-reddit-card__footer">
          <span>♡ 99+</span>
          <span>↗ 99+</span>
        </div>
      </div>
    </div>
  );
}

function createRunSignature(input: {
  templateId: BrainrotTemplateId;
  prompt: string;
  scriptGuidance: string;
  brainrotType: BrainrotTypeId;
  targetDurationSeconds: number;
  selectedVoiceId: string;
  selectedGameplayPresetId: BrainrotGameplayPresetId;
  remoteGameplayUrl: string;
  selectedCaptionPresetId: BrainrotCaptionPresetId;
  voiceSettings: BrainrotVoiceSettings;
  scriptText: string;
  captionText: string;
  captionStyle: BrainrotCaptionStyle;
  layoutStyle: BrainrotLayoutStyle;
  introCard: BrainrotIntroCard;
  gameplayStartOffset: number;
  manualScriptMode: boolean;
  manualCaptionMode: boolean;
}) {
  return JSON.stringify(input);
}

interface CanvasCoreNodeProps {
  node: CoreCanvasNode;
  model: FlowNodeModel;
  isSelected: boolean;
  onPointerDown: (event: ReactPointerEvent<HTMLDivElement>, nodeId: CanvasSelectionId) => void;
  onSelect: (id: CanvasSelectionId) => void;
  onOpenEditor: (id: CanvasSelectionId) => void;
}

function CanvasCoreNode({
  node,
  model,
  isSelected,
  onPointerDown,
  onSelect,
  onOpenEditor,
}: CanvasCoreNodeProps) {
  return (
    <div
      role="button"
      tabIndex={0}
      className={`brainrot-node brainrot-node--core brainrot-node--${model.status} ${
        isSelected ? 'brainrot-node--selected' : ''
      }`}
      style={{ left: node.x, top: node.y, width: CORE_NODE_WIDTH, minHeight: CORE_NODE_HEIGHT }}
      onPointerDown={(event) => onPointerDown(event, node.id)}
      onClick={() => onSelect(node.id)}
      onDoubleClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        onOpenEditor(node.id);
      }}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onSelect(node.id);
        }
      }}
    >
      <div className="brainrot-node__header">
        <span className="brainrot-node__step">{model.step}</span>
        <div className="brainrot-node__actions">
          <span className={`brainrot-status-pill brainrot-status-pill--${model.status}`}>
            {model.status}
          </span>
          <button
            aria-label={`Edit ${model.title}`}
            className="brainrot-node__menu"
            type="button"
            onPointerDown={(event) => {
              event.preventDefault();
              event.stopPropagation();
            }}
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              onOpenEditor(node.id);
            }}
          >
            ⋯
          </button>
        </div>
      </div>
      <strong>{model.title}</strong>
      <p>{model.summary}</p>
      <code>{model.code}</code>
      <span className="brainrot-node__grab">Drag</span>
    </div>
  );
}

interface CanvasCustomNodeProps {
  node: CustomCanvasNode;
  isSelected: boolean;
  onPointerDown: (event: ReactPointerEvent<HTMLDivElement>, nodeId: CanvasSelectionId) => void;
  onSelect: (id: CanvasSelectionId) => void;
  onOpenEditor: (id: CanvasSelectionId) => void;
}

function CanvasCustomNode({
  node,
  isSelected,
  onPointerDown,
  onSelect,
  onOpenEditor,
}: CanvasCustomNodeProps) {
  return (
    <div
      role="button"
      tabIndex={0}
      className={`brainrot-node brainrot-node--custom ${
        isSelected ? 'brainrot-node--selected' : ''
      }`}
      style={{
        left: node.x,
        top: node.y,
        width: CUSTOM_NODE_WIDTH,
        minHeight: CUSTOM_NODE_HEIGHT,
        borderColor: `${node.color}55`,
        boxShadow: isSelected ? `0 0 0 1px ${node.color}66, 0 24px 50px rgba(0,0,0,0.32)` : undefined,
      }}
      onPointerDown={(event) => onPointerDown(event, node.id)}
      onClick={() => onSelect(node.id)}
      onDoubleClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        onOpenEditor(node.id);
      }}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onSelect(node.id);
        }
      }}
    >
      <div className="brainrot-node__header">
        <span className="brainrot-node__step">Freeform</span>
        <div className="brainrot-node__actions">
          <span className="brainrot-custom-node__swatch" style={{ backgroundColor: node.color }} />
          <button
            aria-label={`Edit ${node.title}`}
            className="brainrot-node__menu"
            type="button"
            onPointerDown={(event) => {
              event.preventDefault();
              event.stopPropagation();
            }}
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              onOpenEditor(node.id);
            }}
          >
            ⋯
          </button>
        </div>
      </div>
      <strong>{node.title}</strong>
      <p>{node.body}</p>
      <span className="brainrot-node__grab">Drag</span>
    </div>
  );
}

export function Feature2Page({ session }: Feature2PageProps) {
  const defaultTemplate =
    BRAINROT_TEMPLATE_PRESETS.find((preset) => preset.id === DEFAULT_TEMPLATE_ID) ??
    BRAINROT_TEMPLATE_PRESETS[0];
  const defaultCaptionPreset =
    BRAINROT_CAPTION_STYLE_PRESETS.find((preset) => preset.id === defaultTemplate.captionPresetId) ??
    BRAINROT_CAPTION_STYLE_PRESETS[0];
  const [selectedTemplateId, setSelectedTemplateId] = useState<BrainrotTemplateId>(
    defaultTemplate.id
  );
  const [brainrotType, setBrainrotType] = useState<BrainrotTypeId>(defaultTemplate.typeId);
  const [targetDurationSeconds, setTargetDurationSeconds] = useState(DEFAULT_TARGET_DURATION);
  const [promptInput, setPromptInput] = useState(defaultTemplate.defaultPrompt);
  const [scriptGuidance, setScriptGuidance] = useState(defaultTemplate.defaultScriptGuidance);
  const [scriptDraft, setScriptDraft] = useState('');
  const [manualScriptMode, setManualScriptMode] = useState(false);
  const [lastGeneratedScript, setLastGeneratedScript] = useState<BrainrotScriptPackage | null>(null);
  const [captionText, setCaptionText] = useState(defaultTemplate.defaultIntroQuestion);
  const [manualCaptionMode, setManualCaptionMode] = useState(false);
  const [selectedCaptionPresetId, setSelectedCaptionPresetId] =
    useState<BrainrotCaptionPresetId>(defaultTemplate.captionPresetId);
  const [captionStyle, setCaptionStyle] = useState<BrainrotCaptionStyle>(defaultCaptionPreset.style);
  const [layoutStyle, setLayoutStyle] = useState(DEFAULT_BRAINROT_LAYOUT_STYLE);
  const [introCard, setIntroCard] = useState<BrainrotIntroCard>({
    enabled: true,
    title: 'Story Watch',
    question: defaultTemplate.defaultIntroQuestion,
    durationSeconds: INTRO_CARD_DURATION_SECONDS,
  });
  const [voiceSettings, setVoiceSettings] = useState<BrainrotVoiceSettings>(
    DEFAULT_BRAINROT_VOICE_SETTINGS
  );
  const [voices, setVoices] = useState<BrainrotVoiceOption[]>([FALLBACK_BRAINROT_VOICE]);
  const [selectedVoiceId, setSelectedVoiceId] = useState(FALLBACK_BRAINROT_VOICE.id);
  const [voiceFilterMode, setVoiceFilterMode] = useState<VoiceFilterMode>('expressive-female');
  const [voiceSearchInput, setVoiceSearchInput] = useState('');
  const [isVoicesLoading, setIsVoicesLoading] = useState(true);
  const [voicesWarning, setVoicesWarning] = useState('');
  const [selectedGameplayPresetId, setSelectedGameplayPresetId] =
    useState<BrainrotGameplayPresetId>(defaultTemplate.gameplayPresetId);
  const [localGameplayAsset, setLocalGameplayAsset] = useState<MediaAsset | null>(null);
  const [builtInRemoteGameplayAsset, setBuiltInRemoteGameplayAsset] = useState<MediaAsset | null>(null);
  const [remoteGameplayAsset, setRemoteGameplayAsset] = useState<MediaAsset | null>(null);
  const [remoteGameplayUrl, setRemoteGameplayUrl] = useState('');
  const [voiceAsset, setVoiceAsset] = useState<BrainrotAudioAsset | null>(null);
  const [subtitleAsset, setSubtitleAsset] = useState<BrainrotSubtitleAsset | null>(null);
  const [gameplayStartOffset, setGameplayStartOffset] = useState(18);
  const [isPreparingGameplay, setIsPreparingGameplay] = useState(true);
  const [isPreparingRemoteGameplay, setIsPreparingRemoteGameplay] = useState(false);
  const [isResolvingGameplay, setIsResolvingGameplay] = useState(false);
  const [isGameplayCached, setIsGameplayCached] = useState(false);
  const [isGameplayFallback, setIsGameplayFallback] = useState(false);
  const [statusMessage, setStatusMessage] = useState(
    'Choose the voice, gameplay bed, caption style, and duration, then click Run to generate the AI voiceover reel.'
  );
  const [selectedNode, setSelectedNode] = useState<CanvasSelectionId>('prompt');
  const [canvasSize, setCanvasSize] = useState({
    width: DEFAULT_CANVAS_WIDTH,
    height: MIN_CANVAS_HEIGHT,
  });
  const [canvasZoom, setCanvasZoom] = useState(DEFAULT_CANVAS_ZOOM);
  const [canvasNodes, setCanvasNodes] = useState<CanvasNode[]>(() =>
    createInitialCanvasNodes(DEFAULT_CANVAS_WIDTH, MIN_CANVAS_HEIGHT)
  );
  const [renderState, setRenderState] = useState<'idle' | 'running' | 'complete' | 'error'>(
    'idle'
  );
  const [activeRunStage, setActiveRunStage] = useState<BrainrotStageId | null>(null);
  const [generatedRender, setGeneratedRender] = useState<GeneratedRender | null>(null);
  const [lastRunSignature, setLastRunSignature] = useState('');
  const [isRunDialogOpen, setIsRunDialogOpen] = useState(false);
  const [isNodeEditorOpen, setIsNodeEditorOpen] = useState(false);
  const [runPromptDraft, setRunPromptDraft] = useState(promptInput);
  const [runScriptGuidanceDraft, setRunScriptGuidanceDraft] = useState(scriptGuidance);
  const [aiNodePrompt, setAiNodePrompt] = useState('');
  const [isAiNodeGenerating, setIsAiNodeGenerating] = useState(false);
  const [activityLog, setActivityLog] = useState<ActivityLogEntry[]>([
    createLogEntry('Brain Rot workspace booted. Prompt, script, and render nodes are ready.', 'info'),
  ]);
  const canvasStageRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLDivElement | null>(null);
  const captionLayoutEditorRef = useRef<HTMLDivElement | null>(null);
  const dependenciesBootedRef = useRef(false);
  const dragStateRef = useRef<{
    nodeId: CanvasSelectionId;
    offsetX: number;
    offsetY: number;
  } | null>(null);
  const captionEditorStateRef = useRef<
    | {
        mode: 'move';
        startClientX: number;
        startClientY: number;
        startHorizontalOffset: number;
        startVerticalOffset: number;
        editorWidth: number;
        editorHeight: number;
      }
    | {
        mode: 'resize';
        startClientX: number;
        startClientY: number;
        startFontSize: number;
      }
    | null
  >(null);

  const appendLog = (message: string, tone: LogTone = 'info') => {
    setActivityLog((current) => [...current, createLogEntry(message, tone)].slice(-14));
  };

  const selectedCanvasNode = canvasNodes.find((node) => node.id === selectedNode) ?? canvasNodes[0];
  const selectedCustomNode =
    selectedCanvasNode && isCustomCanvasNode(selectedCanvasNode) ? selectedCanvasNode : null;
  const selectedCoreStage = isCoreStageId(selectedNode) ? selectedNode : null;
  const selectedTemplate =
    BRAINROT_TEMPLATE_PRESETS.find((preset) => preset.id === selectedTemplateId) ??
    BRAINROT_TEMPLATE_PRESETS[0];
  const selectedTypePreset =
    BRAINROT_TYPE_PRESETS.find((preset) => preset.id === brainrotType) ?? BRAINROT_TYPE_PRESETS[0];
  const selectedCaptionPreset =
    BRAINROT_CAPTION_STYLE_PRESETS.find((preset) => preset.id === selectedCaptionPresetId) ??
    BRAINROT_CAPTION_STYLE_PRESETS[0];
  const selectedGameplayPreset =
    BRAINROT_GAMEPLAY_PRESETS.find((preset) => preset.id === selectedGameplayPresetId) ??
    BRAINROT_GAMEPLAY_PRESETS[0];
  const isCustomRemoteGameplayPreset = selectedGameplayPreset.id === 'custom-remote';
  const matchingBuiltInRemoteGameplayAsset =
    builtInRemoteGameplayAsset?.id === `preset-${selectedGameplayPreset.id}`
      ? builtInRemoteGameplayAsset
      : null;
  const gameplayAsset = isCustomRemoteGameplayPreset
    ? remoteGameplayAsset
    : selectedGameplayPreset.source === 'remote'
      ? matchingBuiltInRemoteGameplayAsset
      : localGameplayAsset;
  const isGameplayBusy = isCustomRemoteGameplayPreset
    ? isResolvingGameplay
    : selectedGameplayPreset.source === 'remote'
      ? isPreparingRemoteGameplay
      : isPreparingGameplay;
  const preferredVoiceGender = selectedTemplate.preferredVoiceGender;
  const selectedVoice =
    voices.find((voice) => voice.id === selectedVoiceId) ??
    voices[0] ??
    FALLBACK_BRAINROT_VOICE;
  const sortedVoices = sortVoicesByRecommendation(voices, preferredVoiceGender);
  const voiceSearchQuery = voiceSearchInput.trim().toLowerCase();
  const recommendedVoices =
    sortedVoices
      .filter((voice) => readVoiceLabel(voice, 'gender').toLowerCase() === preferredVoiceGender)
      .slice(0, 5)
      .length > 0
      ? sortedVoices
          .filter((voice) => readVoiceLabel(voice, 'gender').toLowerCase() === preferredVoiceGender)
          .slice(0, 5)
      : sortedVoices.slice(0, 5);
  const filteredVoices = sortedVoices.filter((voice) => {
    const gender = readVoiceLabel(voice, 'gender').toLowerCase();
    const useCase = readVoiceLabel(voice, 'use_case').toLowerCase();
    const descriptive = readVoiceLabel(voice, 'descriptive').toLowerCase();

    if (voiceFilterMode === 'expressive-female' && gender !== 'female') {
      return false;
    }

    if (voiceFilterMode === 'expressive-male' && gender !== 'male') {
      return false;
    }

    if (voiceFilterMode === 'recommended' && scoreVoice(voice, preferredVoiceGender) < 8) {
      return false;
    }

    if (voiceFilterMode === 'cloned' && voice.category.toLowerCase() !== 'cloned') {
      return false;
    }

    if (!voiceSearchQuery) {
      return true;
    }

    return [
      voice.name,
      voice.category,
      gender,
      useCase,
      descriptive,
      readVoiceLabel(voice, 'accent'),
      readVoiceLabel(voice, 'age'),
    ]
      .join(' ')
      .toLowerCase()
      .includes(voiceSearchQuery);
  });
  const visibleVoices = filteredVoices.slice(0, 12);
  const gameplayPreviewUrl = gameplayAsset ? buildPlayableSourceUrl(gameplayAsset) : '';
  const maxGameplayOffset = gameplayAsset
    ? Math.max(0, Math.floor(gameplayAsset.duration ?? 120) - 12)
    : 0;
  const safeGameplayOffset = gameplayAsset?.duration
    ? clamp(gameplayStartOffset, 0, maxGameplayOffset)
    : Math.max(0, gameplayStartOffset);

  const runSignature = createRunSignature({
    templateId: selectedTemplateId,
    prompt: promptInput,
    scriptGuidance,
    brainrotType,
    targetDurationSeconds,
    selectedVoiceId,
    selectedGameplayPresetId,
    remoteGameplayUrl,
    selectedCaptionPresetId,
    voiceSettings,
    scriptText: scriptDraft,
    captionText,
    captionStyle,
    layoutStyle,
    introCard,
    gameplayStartOffset: safeGameplayOffset,
    manualScriptMode,
    manualCaptionMode,
  });
  const isRenderDirty = Boolean(generatedRender) && lastRunSignature !== runSignature;
  const canRun =
    Boolean(promptInput.trim() && selectedVoiceId) &&
    !isVoicesLoading &&
    !isGameplayBusy &&
    Boolean(gameplayAsset) &&
    renderState !== 'running';
  const scaledCanvasWidth = Math.round(canvasSize.width * canvasZoom);
  const scaledCanvasHeight = Math.round(canvasSize.height * canvasZoom);
  const zoomLabel = `${Math.round(canvasZoom * 100)}%`;
  const captionGuideSourceText = buildCaptionGuideSourceText({
    captionText,
    scriptDraft,
    generatedScript: lastGeneratedScript ?? generatedRender?.script ?? null,
  });
  const captionGuideLines = splitCaptionGuideLines(
    captionGuideSourceText,
    captionStyle.maxWordsPerCue
  );
  const captionPreviewPosition = resolveCaptionPreviewPosition(captionStyle);
  const captionGuideFontSize = clamp(
    Math.round(captionStyle.fontSize * CAPTION_PREVIEW_FONT_SCALE),
    16,
    30
  );
  const captionLayoutPreviewUrl = gameplayPreviewUrl;
  const geminiInputPreview = buildGeminiInputPreview({
    typeLabel: selectedTypePreset.label,
    prompt: runPromptDraft,
    scriptGuidance: runScriptGuidanceDraft,
    targetDurationSeconds,
    introCard,
  });

  useEffect(() => {
    const node = canvasStageRef.current;

    if (!node) {
      return;
    }

    const updateSize = () => {
      setCanvasSize({
        width: Math.max(node.clientWidth, 960),
        height: Math.max(node.clientHeight, MIN_CANVAS_HEIGHT),
      });
    };

    updateSize();
    const observer = new ResizeObserver(updateSize);
    observer.observe(node);

    return () => {
      observer.disconnect();
    };
  }, []);

  useEffect(() => {
    setCanvasNodes((current) =>
      current.map((node) => {
        const { width, height } = getNodeBounds(node);
        return {
          ...node,
          x: clamp(node.x, CANVAS_PADDING, canvasSize.width - width - CANVAS_PADDING),
          y: clamp(node.y, CANVAS_PADDING, canvasSize.height - height - CANVAS_PADDING),
        };
      })
    );
  }, [canvasSize.height, canvasSize.width]);

  const loadVoices = async () => {
    setIsVoicesLoading(true);
    appendLog('Loading available ElevenLabs voices for the voice node.', 'info');

    try {
      const response = await fetchBrainrotVoices();
      const rankedVoices = sortVoicesByRecommendation(response.voices, preferredVoiceGender);
      const recommendedVoiceId = pickRecommendedVoiceId(rankedVoices, preferredVoiceGender);
      setVoices(rankedVoices);
      setSelectedVoiceId((current) =>
        rankedVoices.some((voice) => voice.id === current) ? current : recommendedVoiceId
      );
      setVoicesWarning(response.warning || '');
      appendLog(
        response.warning
          ? `Voices loaded with fallback data: ${response.warning}`
          : `Loaded ${response.voices.length} ElevenLabs voice options and ranked the ${preferredVoiceGender} picks first.`,
        response.warning ? 'warn' : 'success'
      );
    } catch (error) {
      setVoices([FALLBACK_BRAINROT_VOICE]);
      setSelectedVoiceId(FALLBACK_BRAINROT_VOICE.id);
      setVoicesWarning(error instanceof Error ? error.message : 'Failed to load voices.');
      appendLog(
        error instanceof Error ? error.message : 'Failed to load voices. Using fallback.',
        'warn'
      );
    } finally {
      setIsVoicesLoading(false);
    }
  };

  const prepareGameplay = async (options?: { quiet?: boolean }) => {
    const quiet = options?.quiet ?? false;
    setIsPreparingGameplay(true);

    if (!quiet) {
      setStatusMessage('Preparing the Subway Surfers gameplay bed.');
      appendLog('Preparing gameplay bed from the local Subway Surfers asset.', 'info');
    }

    try {
      const response = await prepareBrainrotGameplayAsset();
      setLocalGameplayAsset(response.asset);
      setIsGameplayCached(response.cached);
      setIsGameplayFallback(Boolean(response.fallback));

      if (!quiet) {
        setStatusMessage(
          response.fallback
            ? 'Gameplay bed loaded from the existing Cloudinary asset.'
            : response.cached
              ? 'Gameplay bed is ready from Cloudinary.'
              : 'Gameplay bed uploaded from src/assets and ready.'
        );
        appendLog(
          response.fallback
            ? 'Gameplay bed recovered from the existing Cloudinary asset.'
            : response.cached
              ? 'Gameplay bed confirmed in Cloudinary cache.'
              : 'Gameplay bed uploaded and connected to the flow.',
          'success'
        );
      }

      return response.asset;
    } catch (error) {
      setLocalGameplayAsset(null);
      setIsGameplayCached(false);
      setIsGameplayFallback(false);
      const nextMessage =
        error instanceof Error
          ? error.message
          : 'Failed to prepare the Subway Surfers gameplay clip.';

      if (!quiet) {
        setStatusMessage(nextMessage);
        appendLog(nextMessage, 'error');
        setSelectedNode('gameplay');
      }

      throw error;
    } finally {
      setIsPreparingGameplay(false);
    }
  };

  const prepareBuiltInRemoteGameplay = async (
    preset: BrainrotGameplayPreset,
    options?: { quiet?: boolean }
  ) => {
    const quiet = options?.quiet ?? false;

    if (!preset.remoteUrl) {
      throw new Error('The selected built-in gameplay preset is missing its source URL.');
    }

    setIsPreparingRemoteGameplay(true);

    if (!quiet) {
      setStatusMessage(`Caching ${preset.label} in Cloudinary for rendering.`);
      appendLog(`Caching the built-in ${preset.label} stock clip in Cloudinary.`, 'info');
    }

    try {
      const response = await prepareBrainrotRemoteGameplayAsset({
        presetId: preset.id,
        url: preset.remoteUrl,
        label: preset.label,
        duration: preset.duration,
      });
      setBuiltInRemoteGameplayAsset(response.asset);

      if (!quiet) {
        setStatusMessage(
          response.cached
            ? `${preset.label} is ready from Cloudinary.`
            : `${preset.label} was uploaded to Cloudinary and is ready.`
        );
        appendLog(
          response.cached
            ? `${preset.label} was already cached in Cloudinary.`
            : `${preset.label} was cached in Cloudinary for stable rendering.`,
          'success'
        );
      }

      return response.asset;
    } catch (error) {
      setBuiltInRemoteGameplayAsset(null);
      const nextMessage =
        error instanceof Error ? error.message : 'Failed to prepare the built-in remote gameplay clip.';

      if (!quiet) {
        setStatusMessage(nextMessage);
        appendLog(nextMessage, 'error');
        setSelectedNode('gameplay');
      }

      throw error;
    } finally {
      setIsPreparingRemoteGameplay(false);
    }
  };

  useEffect(() => {
    if (dependenciesBootedRef.current) {
      return;
    }

    dependenciesBootedRef.current = true;
    void Promise.allSettled([
      defaultTemplate.gameplayPresetId === 'custom-remote'
        ? Promise.resolve(null)
        : defaultTemplate.gameplayPresetId === 'satisfying-ice-cream' ||
            defaultTemplate.gameplayPresetId === 'satisfying-bubbles'
          ? prepareBuiltInRemoteGameplay(
              BRAINROT_GAMEPLAY_PRESETS.find((preset) => preset.id === defaultTemplate.gameplayPresetId) ??
                BRAINROT_GAMEPLAY_PRESETS[0],
              { quiet: false }
            )
          : prepareGameplay({ quiet: false }),
      loadVoices(),
    ]);
    // Feature 2 should boot its dependencies immediately.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!canvasNodes.some((node) => node.id === selectedNode)) {
      setSelectedNode('prompt');
    }
  }, [canvasNodes, selectedNode]);

  useEffect(() => {
    if (!isRunDialogOpen) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsRunDialogOpen(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isRunDialogOpen]);

  useEffect(() => {
    if (!isNodeEditorOpen) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsNodeEditorOpen(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isNodeEditorOpen]);

  useEffect(() => {
    const shouldLockScroll = isRunDialogOpen || isNodeEditorOpen;
    const { overflow } = document.body.style;

    if (shouldLockScroll) {
      document.body.style.overflow = 'hidden';
    }

    return () => {
      document.body.style.overflow = overflow;
    };
  }, [isNodeEditorOpen, isRunDialogOpen]);

  useEffect(() => {
    const handlePointerMove = (event: PointerEvent) => {
      const dragState = dragStateRef.current;
      const canvas = canvasRef.current;

      if (!dragState || !canvas) {
        return;
      }

      const rect = canvas.getBoundingClientRect();

      setCanvasNodes((current) =>
        current.map((node) => {
          if (node.id !== dragState.nodeId) {
            return node;
          }

          const { width, height } = getNodeBounds(node);
          const nextX = clamp(
            (event.clientX - rect.left) / canvasZoom - dragState.offsetX,
            CANVAS_PADDING,
            canvasSize.width - width - CANVAS_PADDING
          );
          const nextY = clamp(
            (event.clientY - rect.top) / canvasZoom - dragState.offsetY,
            CANVAS_PADDING,
            canvasSize.height - height - CANVAS_PADDING
          );

          return {
            ...node,
            x: nextX,
            y: nextY,
          };
        })
      );
    };

    const handlePointerUp = () => {
      dragStateRef.current = null;
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);

    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
    };
  }, [canvasSize.height, canvasSize.width, canvasZoom]);

  useEffect(() => {
    const handlePointerMove = (event: PointerEvent) => {
      const interaction = captionEditorStateRef.current;

      if (!interaction) {
        return;
      }

      if (interaction.mode === 'move') {
        const deltaX = event.clientX - interaction.startClientX;
        const deltaY = event.clientY - interaction.startClientY;
        const horizontalDelta = Math.round((deltaX / interaction.editorWidth) * BRAINROT_FRAME_WIDTH);
        const verticalDelta = Math.round((deltaY / interaction.editorHeight) * BRAINROT_FRAME_HEIGHT);

        setCaptionStyle((current) => ({
          ...current,
          placement: 'center',
          horizontalOffset: clamp(
            interaction.startHorizontalOffset + horizontalDelta,
            -CAPTION_HORIZONTAL_LIMIT,
            CAPTION_HORIZONTAL_LIMIT
          ),
          verticalOffset: clamp(
            interaction.startVerticalOffset + verticalDelta,
            -CAPTION_VERTICAL_LIMIT,
            CAPTION_VERTICAL_LIMIT
          ),
        }));
        return;
      }

      const delta =
        (event.clientX - interaction.startClientX) - (event.clientY - interaction.startClientY);
      const nextFontSize = clamp(
        Math.round(interaction.startFontSize + delta * 0.08),
        CAPTION_FONT_SIZE_MIN,
        CAPTION_FONT_SIZE_MAX
      );

      setCaptionStyle((current) => ({
        ...current,
        fontSize: nextFontSize,
      }));
    };

    const handlePointerUp = () => {
      captionEditorStateRef.current = null;
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);

    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
    };
  }, []);

  const coreFlowModels: FlowNodeModel[] = [
    {
      id: 'prompt',
      step: '01',
      title: 'Prompt + style',
      summary: promptInput.trim()
        ? `${selectedTemplate.label} • ${selectedTypePreset.label} queued for a ${targetDurationSeconds}s reel.`
        : 'Choose the template, opening question, and what the reel should say.',
      code: 'template -> introCard -> brainrotType -> promptInput',
      status: promptInput.trim() ? 'complete' : 'ready',
    },
    {
      id: 'script',
      step: '02',
      title: 'Gemini script',
      summary: scriptDraft.trim()
        ? manualScriptMode
          ? 'Using a manual script override on the next run.'
          : `Gemini-generated script is ready for the ${targetDurationSeconds}s voice pass.`
        : `Gemini 2.5 Flash will turn the prompt into a ${targetDurationSeconds}s script.`,
      code: 'POST /api/brainrot-script',
      status: activeRunStage === 'script'
        ? 'running'
        : scriptDraft.trim()
          ? 'complete'
          : promptInput.trim()
            ? 'ready'
            : 'locked',
    },
    {
      id: 'voice',
      step: '03',
      title: 'ElevenLabs voice',
      summary: voiceAsset
        ? `${selectedVoice.name} voiceover ready • ${formatDuration(voiceAsset.duration)}`
        : isVoicesLoading
          ? 'Loading ElevenLabs voices.'
          : `${selectedVoice.name} is selected for the ${preferredVoiceGender} AI narration.`,
      code: 'POST /api/brainrot-voice',
      status: isVoicesLoading
        ? 'running'
        : activeRunStage === 'voice'
          ? 'running'
          : voiceAsset
            ? 'complete'
            : selectedVoiceId
              ? 'ready'
              : 'locked',
    },
    {
      id: 'gameplay',
      step: '04',
      title: 'Gameplay bed',
      summary: isGameplayBusy
        ? isCustomRemoteGameplayPreset
          ? 'Resolving the remote gameplay feed.'
          : selectedGameplayPreset.source === 'remote'
            ? `Caching ${selectedGameplayPreset.label} in Cloudinary for stable rendering.`
            : 'Preparing the built-in Subway gameplay bed from src/assets.'
        : gameplayAsset
          ? selectedGameplayPreset.source === 'remote' && !isCustomRemoteGameplayPreset
            ? `${selectedGameplayPreset.label} is cached in Cloudinary and ready under the voiceover.`
            : `${selectedGameplayPreset.label} is ready under the voiceover.`
          : isCustomRemoteGameplayPreset
            ? 'Attach a remote gameplay URL to complete this node.'
            : 'Gameplay prep failed. Retry this node.',
      code: isCustomRemoteGameplayPreset
        ? 'POST /api/resolve-gameplay -> remote fetch'
        : selectedGameplayPreset.source === 'remote'
          ? 'POST /api/prepare-brainrot-remote-gameplay'
          : 'GET /api/prepare-brainrot-gameplay',
      status: isGameplayBusy
        ? 'running'
        : activeRunStage === 'gameplay'
          ? 'running'
          : gameplayAsset
            ? 'complete'
            : selectedGameplayPreset.source === 'remote'
              ? 'ready'
              : 'error',
    },
    {
      id: 'caption',
      step: '05',
      title: 'Caption overlay',
      summary: `${selectedCaptionPreset.label} • short centered subtitle bursts with a black outline`,
      code: 'POST /api/brainrot-captions -> Cloudinary subtitles overlay',
      status: activeRunStage === 'caption'
        ? 'running'
        : subtitleAsset || captionText.trim()
          ? 'complete'
          : promptInput.trim()
            ? 'ready'
            : 'locked',
    },
    {
      id: 'music',
      step: '06',
      title: 'Music lane',
      summary: 'Reserved in the flowchart. Background music is intentionally not mixed yet.',
      code: 'placeholder: future soundtrack step',
      status: activeRunStage === 'music' ? 'running' : 'ready',
    },
    {
      id: 'render',
      step: '07',
      title: 'Render output',
      summary: generatedRender
        ? isRenderDirty
          ? 'Inputs changed. Run again to refresh the final render.'
          : `Rendered ${new Date(generatedRender.generatedAt).toLocaleTimeString()} • ${generatedRender.durationSeconds}s`
        : 'Generate the final Cloudinary reel with embedded voiceover and timed captions.',
      code: 'buildBrainrotCompositeUrl()',
      status: renderState === 'running' || activeRunStage === 'render'
        ? 'running'
        : renderState === 'error'
          ? 'error'
          : generatedRender && !isRenderDirty
            ? 'complete'
            : canRun
              ? 'ready'
              : 'locked',
    },
  ];

  const coreFlowMap = Object.fromEntries(coreFlowModels.map((node) => [node.id, node])) as Record<
    BrainrotStageId,
    FlowNodeModel
  >;
  const selectedNodeTitle = selectedCoreStage
    ? coreFlowMap[selectedCoreStage]?.title
    : selectedCustomNode?.title ?? 'Node';
  const selectedNodeDescription = selectedCoreStage
    ? coreFlowMap[selectedCoreStage]?.summary
    : 'Edit the freeform note, move it, or remove it from the canvas.';
  const selectedNodeCode = selectedCoreStage ? coreFlowMap[selectedCoreStage]?.code : '';

  if (!session) {
    return <Navigate replace to="/login" />;
  }

  const openNodeEditor = (id: CanvasSelectionId) => {
    if (!canvasNodes.some((node) => node.id === id)) {
      return;
    }

    dragStateRef.current = null;
    setSelectedNode(id);
    setIsRunDialogOpen(false);
    setIsNodeEditorOpen(true);
  };

  const closeNodeEditor = () => {
    dragStateRef.current = null;
    setIsNodeEditorOpen(false);
  };

  const handleNodePointerDown = (
    event: ReactPointerEvent<HTMLDivElement>,
    nodeId: CanvasSelectionId
  ) => {
    const canvas = canvasRef.current;
    const node = canvasNodes.find((entry) => entry.id === nodeId);

    if (!canvas || !node) {
      return;
    }

    const rect = canvas.getBoundingClientRect();

    dragStateRef.current = {
      nodeId,
      offsetX: (event.clientX - rect.left) / canvasZoom - node.x,
      offsetY: (event.clientY - rect.top) / canvasZoom - node.y,
    };

    setSelectedNode(nodeId);
    event.preventDefault();
  };

  const updateCanvasZoom = (nextZoom: number) => {
    const clampedZoom = clamp(Math.round(nextZoom * 100) / 100, MIN_CANVAS_ZOOM, MAX_CANVAS_ZOOM);

    setCanvasZoom((currentZoom) => {
      if (Math.abs(currentZoom - clampedZoom) < 0.001) {
        return currentZoom;
      }

      const canvasStage = canvasStageRef.current;

      if (canvasStage) {
        const centerX = (canvasStage.scrollLeft + canvasStage.clientWidth / 2) / currentZoom;
        const centerY = (canvasStage.scrollTop + canvasStage.clientHeight / 2) / currentZoom;

        window.requestAnimationFrame(() => {
          canvasStage.scrollLeft = Math.max(
            0,
            Math.round(centerX * clampedZoom - canvasStage.clientWidth / 2)
          );
          canvasStage.scrollTop = Math.max(
            0,
            Math.round(centerY * clampedZoom - canvasStage.clientHeight / 2)
          );
        });
      }

      return clampedZoom;
    });
  };

  const handleCanvasWheel = (event: ReactWheelEvent<HTMLDivElement>) => {
    if (!event.ctrlKey && !event.metaKey) {
      return;
    }

    event.preventDefault();
    updateCanvasZoom(canvasZoom - Math.sign(event.deltaY) * CANVAS_ZOOM_STEP);
  };

  const createCustomNodeFromInput = (input: {
    title: string;
    body: string;
    color: string;
    logMessage: string;
  }) => {
    const customNodeCount = canvasNodes.filter(isCustomCanvasNode).length;
    const canvasStage = canvasStageRef.current;
    const viewportCenterX = canvasStage
      ? (canvasStage.scrollLeft + canvasStage.clientWidth / 2) / canvasZoom
      : canvasSize.width / 2;
    const viewportCenterY = canvasStage
      ? (canvasStage.scrollTop + canvasStage.clientHeight / 2) / canvasZoom
      : canvasSize.height / 2;
    const nextNode: CustomCanvasNode = {
      id: `custom-${crypto.randomUUID()}`,
      kind: 'custom',
      x: clamp(
        Math.round(viewportCenterX - CUSTOM_NODE_WIDTH / 2 + customNodeCount * 14),
        CANVAS_PADDING,
        canvasSize.width - CUSTOM_NODE_WIDTH - CANVAS_PADDING
      ),
      y: clamp(
        Math.round(viewportCenterY - CUSTOM_NODE_HEIGHT / 2 + customNodeCount * 14),
        CANVAS_PADDING,
        canvasSize.height - CUSTOM_NODE_HEIGHT - CANVAS_PADDING
      ),
      title: input.title,
      body: input.body,
      color: input.color,
    };

    setCanvasNodes((current) => [...current, nextNode]);
    dragStateRef.current = null;
    setSelectedNode(nextNode.id);
    setIsRunDialogOpen(false);
    setIsNodeEditorOpen(true);
    setStatusMessage('Custom node added to the freeform canvas.');
    appendLog(input.logMessage, 'success');
  };

  const handleAddCustomNode = () => {
    createCustomNodeFromInput({
      title: `Custom node ${canvasNodes.filter(isCustomCanvasNode).length + 1}`,
      body: 'Describe an extra note, a QA check, or a future branch.',
      color: '#06b6d4',
      logMessage: 'Custom node added to the canvas.',
    });
  };

  const handleAddAiNode = async () => {
    if (!aiNodePrompt.trim()) {
      setStatusMessage('Describe the node you want AI to create first.');
      appendLog('AI node creation blocked because the prompt is empty.', 'error');
      return;
    }

    setIsAiNodeGenerating(true);
    appendLog(`Generating an AI node from "${aiNodePrompt.trim()}".`, 'info');

    try {
      const suggestion = await generateBrainrotNode({
        prompt: aiNodePrompt,
        seed: brainrotType,
      });
      createCustomNodeFromInput({
        title: suggestion.title,
        body: suggestion.body,
        color: suggestion.color,
        logMessage: `AI node "${suggestion.title}" added to the canvas.`,
      });
      setAiNodePrompt('');
    } catch (error) {
      const nextMessage =
        error instanceof Error ? error.message : 'Failed to generate the AI flowchart node.';
      setStatusMessage(nextMessage);
      appendLog(nextMessage, 'error');
    } finally {
      setIsAiNodeGenerating(false);
    }
  };

  const handleResetCoreLayout = () => {
    const defaults = getDefaultCorePositions(canvasSize.width, canvasSize.height);

    setCanvasNodes((current) =>
      current.map((node) =>
        node.kind === 'core'
          ? {
              ...node,
              x: defaults[node.id].x,
              y: defaults[node.id].y,
            }
          : node
      )
    );
    appendLog('Core pipeline nodes reset to the bounded stage layout.', 'info');
  };

  const handleUpdateCustomNode = (
    nodeId: string,
    patch: Partial<Pick<CustomCanvasNode, 'title' | 'body' | 'color'>>
  ) => {
    setCanvasNodes((current) =>
      current.map((node) =>
        node.id === nodeId && node.kind === 'custom'
          ? {
              ...node,
              ...patch,
            }
          : node
      )
    );
  };

  const handleDeleteCustomNode = (nodeId: string) => {
    setCanvasNodes((current) => current.filter((node) => node.id !== nodeId));
    dragStateRef.current = null;
    setSelectedNode('render');
    setIsNodeEditorOpen(false);
    setStatusMessage('Custom node removed from the freeform canvas.');
    appendLog('Custom node removed from the canvas.', 'warn');
  };

  const handleSelectTemplate = (templateId: BrainrotTemplateId) => {
    const template =
      BRAINROT_TEMPLATE_PRESETS.find((preset) => preset.id === templateId) ??
      BRAINROT_TEMPLATE_PRESETS[0];
    const templateCaptionPreset =
      BRAINROT_CAPTION_STYLE_PRESETS.find((preset) => preset.id === template.captionPresetId) ??
      BRAINROT_CAPTION_STYLE_PRESETS[0];
    const templateGameplayPreset =
      BRAINROT_GAMEPLAY_PRESETS.find((preset) => preset.id === template.gameplayPresetId) ??
      BRAINROT_GAMEPLAY_PRESETS[0];
    const nextVoiceFilterMode =
      template.preferredVoiceGender === 'female' ? 'expressive-female' : 'expressive-male';

    setSelectedTemplateId(template.id);
    setBrainrotType(template.typeId);
    setPromptInput(template.defaultPrompt);
    setScriptGuidance(template.defaultScriptGuidance);
    setCaptionText(template.defaultIntroQuestion);
    setManualScriptMode(false);
    setScriptDraft('');
    setLastGeneratedScript(null);
    setManualCaptionMode(false);
    setSelectedCaptionPresetId(templateCaptionPreset.id);
    setCaptionStyle(templateCaptionPreset.style);
    setSelectedGameplayPresetId(templateGameplayPreset.id);
    setGameplayStartOffset(templateGameplayPreset.defaultOffset);
    setLayoutStyle((current) => ({
      ...current,
      gameplayGravity: templateGameplayPreset.defaultGravity,
    }));
    setIntroCard({
      enabled: true,
      title: 'Story Watch',
      question: template.defaultIntroQuestion,
      durationSeconds: INTRO_CARD_DURATION_SECONDS,
    });
    setVoiceFilterMode(nextVoiceFilterMode);
    setSelectedVoiceId((current) => {
      if (voices.some((voice) => voice.id === current)) {
        return pickRecommendedVoiceId(voices, template.preferredVoiceGender);
      }

      return pickRecommendedVoiceId(voices, template.preferredVoiceGender);
    });

    if (templateGameplayPreset.source === 'local') {
      if (!localGameplayAsset && !isPreparingGameplay) {
        void prepareGameplay();
      }
    } else if (templateGameplayPreset.id !== 'custom-remote') {
      void prepareBuiltInRemoteGameplay(templateGameplayPreset);
    }

    setSelectedNode('prompt');
    setStatusMessage(`${template.label} is now driving the flow.`);
    appendLog(`Template switched to ${template.label}.`, 'success');
  };

  const handleSelectGameplayPreset = (presetId: BrainrotGameplayPresetId) => {
    const preset =
      BRAINROT_GAMEPLAY_PRESETS.find((entry) => entry.id === presetId) ??
      BRAINROT_GAMEPLAY_PRESETS[0];

    setSelectedGameplayPresetId(preset.id);
    setGameplayStartOffset(preset.defaultOffset);
    setLayoutStyle((current) => ({
      ...current,
      gameplayGravity: preset.defaultGravity,
    }));

    if (preset.source === 'local') {
      if (!localGameplayAsset && !isPreparingGameplay) {
        void prepareGameplay();
      }
    } else if (preset.id !== 'custom-remote') {
      void prepareBuiltInRemoteGameplay(preset);
    }

    if (preset.id === 'satisfying-ice-cream' || preset.id === 'satisfying-bubbles') {
      setSelectedTemplateId('satisfying-template');
      setVoiceFilterMode('expressive-female');
      setSelectedVoiceId((current) =>
        voices.some((voice) => voice.id === current)
          ? pickRecommendedVoiceId(voices, 'female')
          : FALLBACK_BRAINROT_VOICE.id
      );
    } else if (preset.id === 'subway-classic' || preset.id === 'subway-speedrun' || preset.id === 'subway-finale') {
      setSelectedTemplateId('subway-template');
      setVoiceFilterMode('expressive-female');
      setSelectedVoiceId((current) =>
        voices.some((voice) => voice.id === current)
          ? pickRecommendedVoiceId(voices, 'female')
          : FALLBACK_BRAINROT_VOICE.id
      );
    }

    setStatusMessage(`${preset.label} is now armed for the gameplay node.`);
    appendLog(`Gameplay preset switched to ${preset.label}.`, 'info');
  };

  const handleResolveRemoteGameplay = async () => {
    if (!remoteGameplayUrl.trim()) {
      setSelectedNode('gameplay');
      setStatusMessage('Paste a public gameplay page or direct video URL first.');
      appendLog('Remote gameplay attach blocked because the URL field is empty.', 'error');
      return;
    }

    setIsResolvingGameplay(true);
    setSelectedNode('gameplay');
    setStatusMessage('Resolving the remote gameplay source.');
    appendLog('Resolving the remote gameplay URL into a direct video source.', 'info');

    try {
      const resolvedAsset = await resolveBrainrotGameplayUrl(remoteGameplayUrl);
      setRemoteGameplayAsset({
        ...resolvedAsset,
        label: 'Remote Gameplay Feed',
      });
      setStatusMessage('Remote gameplay feed attached to the stack.');
      appendLog('Remote gameplay feed resolved and attached.', 'success');
    } catch (error) {
      const nextMessage =
        error instanceof Error ? error.message : 'Failed to resolve the remote gameplay feed.';
      setStatusMessage(nextMessage);
      appendLog(nextMessage, 'error');
    } finally {
      setIsResolvingGameplay(false);
    }
  };

  const handleSelectCaptionPreset = (presetId: BrainrotCaptionPresetId) => {
    const preset =
      BRAINROT_CAPTION_STYLE_PRESETS.find((entry) => entry.id === presetId) ??
      BRAINROT_CAPTION_STYLE_PRESETS[0];

    setSelectedCaptionPresetId(preset.id);
    setCaptionStyle(preset.style);
    setStatusMessage(`${preset.label} is now active for the caption node.`);
    appendLog(`Caption preset switched to ${preset.label}.`, 'info');
  };

  const startCaptionMoveInteraction = (
    clientX: number,
    clientY: number,
    preventDefault: () => void
  ) => {
    const editor = captionLayoutEditorRef.current;

    if (!editor) {
      return;
    }

    const rect = editor.getBoundingClientRect();
    captionEditorStateRef.current = {
      mode: 'move',
      startClientX: clientX,
      startClientY: clientY,
      startHorizontalOffset: captionStyle.horizontalOffset,
      startVerticalOffset: captionStyle.verticalOffset,
      editorWidth: rect.width,
      editorHeight: rect.height,
    };

    preventDefault();
  };

  const handleCaptionEditorPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    startCaptionMoveInteraction(event.clientX, event.clientY, () => event.preventDefault());
  };

  const handleCaptionEditorMouseDown = (event: ReactMouseEvent<HTMLDivElement>) => {
    startCaptionMoveInteraction(event.clientX, event.clientY, () => event.preventDefault());
  };

  const startCaptionResizeInteraction = (
    clientX: number,
    clientY: number,
    preventDefault: () => void,
    stopPropagation: () => void
  ) => {
    captionEditorStateRef.current = {
      mode: 'resize',
      startClientX: clientX,
      startClientY: clientY,
      startFontSize: captionStyle.fontSize,
    };

    preventDefault();
    stopPropagation();
  };

  const handleCaptionResizePointerDown = (event: ReactPointerEvent<HTMLButtonElement>) => {
    startCaptionResizeInteraction(
      event.clientX,
      event.clientY,
      () => event.preventDefault(),
      () => event.stopPropagation()
    );
  };

  const handleCaptionResizeMouseDown = (event: ReactMouseEvent<HTMLButtonElement>) => {
    startCaptionResizeInteraction(
      event.clientX,
      event.clientY,
      () => event.preventDefault(),
      () => event.stopPropagation()
    );
  };

  const handleResetCaptionLayout = () => {
    const baselineStyle =
      BRAINROT_CAPTION_STYLE_PRESETS.find((preset) => preset.id === selectedCaptionPresetId)?.style ??
      DEFAULT_BRAINROT_CAPTION_STYLE;

    setCaptionStyle((current) => ({
      ...current,
      placement: 'center',
      horizontalOffset: baselineStyle.horizontalOffset,
      verticalOffset: baselineStyle.verticalOffset,
      fontSize: baselineStyle.fontSize,
    }));
    appendLog('Caption layout reset to the default stage position.', 'info');
  };

  const openRunDialog = () => {
    if (renderState === 'running') {
      return;
    }

    setIsNodeEditorOpen(false);
    setRunPromptDraft(promptInput);
    setRunScriptGuidanceDraft(scriptGuidance);
    setIsRunDialogOpen(true);
  };

  const handleRun = async (options?: {
    promptOverride?: string;
    scriptGuidanceOverride?: string;
  }) => {
    const effectivePromptInput = options?.promptOverride ?? promptInput;
    const effectiveScriptGuidance = options?.scriptGuidanceOverride ?? scriptGuidance;

    if (!effectivePromptInput.trim()) {
      setSelectedNode('prompt');
      setStatusMessage('Enter the reel idea before running the pipeline.');
      appendLog('Run blocked because the prompt node is empty.', 'error');
      return;
    }

    if (!selectedVoiceId) {
      setSelectedNode('voice');
      setStatusMessage('Pick an ElevenLabs voice before running the pipeline.');
      appendLog('Run blocked because the voice node is incomplete.', 'error');
      return;
    }

    let ensuredGameplay = gameplayAsset;

    if (selectedGameplayPreset.source === 'remote' && !ensuredGameplay) {
      if (isCustomRemoteGameplayPreset) {
        setSelectedNode('gameplay');
        setStatusMessage('Attach a remote gameplay feed before running the pipeline.');
        appendLog('Run blocked because the custom remote gameplay node is still empty.', 'error');
        return;
      }

      try {
        setSelectedNode('gameplay');
        setActiveRunStage('gameplay');
        appendLog(
          `Built-in stock clip missing from Cloudinary. Caching ${selectedGameplayPreset.label} before the run continues.`,
          'info'
        );
        ensuredGameplay = await prepareBuiltInRemoteGameplay(selectedGameplayPreset, { quiet: true });
      } catch {
        setActiveRunStage(null);
        setSelectedNode('gameplay');
        setStatusMessage('Gameplay bed could not be prepared.');
        appendLog('Run stopped because the built-in stock gameplay failed.', 'error');
        return;
      }
    }

    if (!ensuredGameplay && selectedGameplayPreset.source === 'local') {
      try {
        setSelectedNode('gameplay');
        setActiveRunStage('gameplay');
        appendLog('Gameplay bed missing. Preparing it before the run continues.', 'info');
        ensuredGameplay = await prepareGameplay({ quiet: true });
      } catch {
        setActiveRunStage(null);
        setSelectedNode('gameplay');
        setStatusMessage('Gameplay bed could not be prepared.');
        appendLog('Run stopped because the gameplay node failed.', 'error');
        return;
      }
    }

    if (!ensuredGameplay) {
      setSelectedNode('gameplay');
      setStatusMessage('Gameplay bed could not be prepared.');
      appendLog('Run stopped because the gameplay node is still empty.', 'error');
      return;
    }

    setPromptInput(effectivePromptInput);
    setScriptGuidance(effectiveScriptGuidance);
    setRenderState('running');
    setSubtitleAsset(null);
    setSelectedNode('script');
    setStatusMessage('Running the AI brain rot reel pipeline.');
    appendLog('Run started. Executing the graph in code order.', 'info');

    try {
      let effectiveScript: BrainrotScriptPackage;

      if (manualScriptMode && scriptDraft.trim()) {
        effectiveScript = buildManualScriptPackage(scriptDraft, captionText, brainrotType);
        appendLog('Using the manual script override instead of regenerating copy.', 'info');
      } else {
        setActiveRunStage('script');
        appendLog(
          `Generating ${selectedTypePreset.label} copy with Gemini 2.5 Flash.`,
          'info'
        );
        const scriptResponse = await generateBrainrotScript({
          prompt: effectivePromptInput,
          brainrotType,
          scriptGuidance: effectiveScriptGuidance,
          targetDurationSeconds,
        });
        effectiveScript = scriptResponse.script;
        setLastGeneratedScript(scriptResponse.script);
        setScriptDraft(scriptResponse.script.spokenScript);
        setManualScriptMode(false);

        if (!manualCaptionMode || !captionText.trim()) {
          setCaptionText(pickAutomaticCaption(scriptResponse.script));
        }

        if (scriptResponse.warning) {
          appendLog(scriptResponse.warning, 'warn');
        }

        appendLog('Script node complete. Gemini returned the narration and caption hook.', 'success');
      }

      effectiveScript = applyIntroCardToScript(effectiveScript, introCard);
      setLastGeneratedScript(effectiveScript);
      setScriptDraft(effectiveScript.spokenScript);

      const introLeadInSeconds =
        introCard.enabled && introCard.question.trim() ? INTRO_CARD_DURATION_SECONDS : 0;
      const effectiveCaption =
        manualCaptionMode && captionText.trim()
          ? captionText
          : pickAutomaticCaption(effectiveScript);

      setActiveRunStage('voice');
      setSelectedNode('voice');
      appendLog(`Sending the script to ElevenLabs voice "${selectedVoice.name}".`, 'info');
      const voiceResponse = await synthesizeBrainrotVoice({
        text: effectiveScript.spokenScript,
        voiceId: selectedVoiceId,
        voiceSettings,
        seed: buildAssetSeed(brainrotType, effectiveScript.title),
      });
      setVoiceAsset(voiceResponse.audioAsset);
      appendLog(
        `Voice node complete. Audio uploaded to Cloudinary at ${formatDuration(
          voiceResponse.durationSeconds
        )}.`,
        'success'
      );
      const measuredVoiceDuration =
        voiceResponse.durationSeconds || voiceResponse.audioAsset.duration || targetDurationSeconds;
      const clipDuration = ensuredGameplay.duration
        ? clamp(
            Math.max(targetDurationSeconds, Math.ceil(measuredVoiceDuration + introLeadInSeconds + 1)),
            TARGET_DURATION_MIN,
            Math.max(TARGET_DURATION_MIN, Math.floor(ensuredGameplay.duration))
          )
        : Math.max(targetDurationSeconds, Math.ceil(measuredVoiceDuration + introLeadInSeconds + 1));

      setActiveRunStage('gameplay');
      setSelectedNode('gameplay');
      appendLog(
        isCustomRemoteGameplayPreset
          ? 'Gameplay bed ready. Reusing the attached remote gameplay feed.'
          : selectedGameplayPreset.source === 'remote'
            ? `Gameplay bed ready. Reusing the cached ${selectedGameplayPreset.label} clip.`
          : `Gameplay bed ready. Reusing ${selectedGameplayPreset.label}.`,
        'info'
      );
      await delay(120);

      setActiveRunStage('caption');
      setSelectedNode('caption');
      if (!manualCaptionMode) {
        setCaptionText(effectiveCaption);
      }
      appendLog(
        `Caption node armed with ${selectedCaptionPreset.label} styling and timed subtitle sync.`,
        'info'
      );
      let nextSubtitleAsset: BrainrotSubtitleAsset | null = null;

      try {
        const captionResponse = await generateBrainrotCaptions({
          text: effectiveScript.spokenScript,
          durationSeconds: measuredVoiceDuration,
          seed: buildAssetSeed(brainrotType, effectiveScript.title),
          maxWordsPerCue: captionStyle.maxWordsPerCue,
          trimStartSeconds: introLeadInSeconds,
          wordTimings: voiceResponse.alignment?.words,
        });
        nextSubtitleAsset = captionResponse.subtitleAsset;
        setSubtitleAsset(captionResponse.subtitleAsset);
        appendLog(
          `Timed captions generated with ${captionResponse.subtitleAsset.cueCount} cues.`,
          'success'
        );
      } catch (captionError) {
        const nextMessage =
          captionError instanceof Error
            ? captionError.message
            : 'Timed caption generation failed. Falling back to the hook caption.';
        setSubtitleAsset(null);
        appendLog(nextMessage, 'warn');
      }
      await delay(120);

      setActiveRunStage('music');
      setSelectedNode('music');
      appendLog('Music lane intentionally skipped. Voiceover-only render for this pass.', 'warn');
      await delay(120);

      setActiveRunStage('render');
      setSelectedNode('render');
      let introCardAsset = null;

      if (introLeadInSeconds > 0) {
        try {
          const introCardResponse = await generateBrainrotIntroCardAsset(introCard);
          introCardAsset = introCardResponse.asset;
          appendLog('Opening card rebuilt as a rounded story post for the first three seconds.', 'success');
        } catch (introCardError) {
          appendLog(
            introCardError instanceof Error
              ? introCardError.message
              : 'Failed to build the opening story card. Continuing without it.',
            'warn'
          );
        }
      }

      const safeOffset = ensuredGameplay.duration
        ? clamp(
            safeGameplayOffset,
            0,
            Math.max(0, Math.floor((ensuredGameplay.duration ?? 120) - clipDuration))
          )
        : Math.max(0, safeGameplayOffset);
      const compositeOptions = {
        gameplayAsset: ensuredGameplay,
        voiceoverAsset: voiceResponse.audioAsset,
        subtitlesAsset: nextSubtitleAsset,
        captionText: effectiveCaption,
        clipDuration,
        gameplayStartOffset: safeOffset,
        captionStyle,
        layoutStyle,
        introCard,
        introCardAsset,
      };
      const deliveryUrl = buildBrainrotCompositeUrl(compositeOptions);
      const posterUrl = buildBrainrotCompositePosterUrl(compositeOptions);
      const plan = buildBrainrotRunPlan({
        brainrotType,
        voiceLabel: selectedVoice.name,
        gameplayLabel: ensuredGameplay.label,
        captionText: effectiveCaption,
        captionStyle,
        layoutStyle,
        durationSeconds: clipDuration,
        timedCaptions: Boolean(nextSubtitleAsset),
        introCard,
      });

      setGeneratedRender({
        deliveryUrl,
        posterUrl,
        generatedAt: new Date().toISOString(),
        plan,
        script: effectiveScript,
        audioAsset: voiceResponse.audioAsset,
        subtitleAsset: nextSubtitleAsset,
        voiceName: selectedVoice.name,
        gameplayLabel: ensuredGameplay.label,
        typeLabel: selectedTypePreset.label,
        durationSeconds: clipDuration,
      });
      setLastRunSignature(
        createRunSignature({
          templateId: selectedTemplateId,
          prompt: effectivePromptInput,
          scriptGuidance: effectiveScriptGuidance,
          brainrotType,
          targetDurationSeconds,
          selectedVoiceId,
          selectedGameplayPresetId,
          remoteGameplayUrl,
          selectedCaptionPresetId,
          voiceSettings,
          scriptText: effectiveScript.spokenScript,
          captionText: effectiveCaption,
          captionStyle,
          layoutStyle,
          introCard,
          gameplayStartOffset: safeOffset,
          manualScriptMode,
          manualCaptionMode,
        })
      );
      setRenderState('complete');
      setActiveRunStage(null);
      setStatusMessage('Run complete. The AI voiceover reel is ready.');
      appendLog('Render complete. Final Cloudinary output URL generated.', 'success');
    } catch (error) {
      setRenderState('error');
      setActiveRunStage(null);
      const nextMessage =
        error instanceof Error ? error.message : 'Failed to generate the brain rot reel.';
      setStatusMessage(nextMessage);
      appendLog(nextMessage, 'error');
    }
  };

  const handleRunDialogConfirm = () => {
    setIsRunDialogOpen(false);
    void handleRun({
      promptOverride: runPromptDraft,
      scriptGuidanceOverride: runScriptGuidanceDraft,
    });
  };

  const coreLinkPaths = CORE_NODE_ORDER.slice(0, -1).map((fromId, index) => {
    const toId = CORE_NODE_ORDER[index + 1];
    const fromNode = canvasNodes.find((node) => node.id === fromId);
    const toNode = canvasNodes.find((node) => node.id === toId);

    if (!fromNode || !toNode || fromNode.kind !== 'core' || toNode.kind !== 'core') {
      return null;
    }

    return createCoreLinkPath(fromNode, toNode);
  });

  return (
    <div className="feature-page feature-page--wide">
      <nav className="feature-page__nav">
        <Link className="feature-page__back" to="/">
          ← Dashboard
        </Link>
        <Link className="dashboard__brand" to="/">
          <span className="dashboard__brand-mark">
            <img alt="Shorty" src={boltLogo} />
          </span>
          <span className="dashboard__brand-name">Shorty</span>
        </Link>
      </nav>

      <div className="feature-page__header">
        <div className="feature-page__kicker">Feature 2</div>
        <h1 className="feature-page__title">Brain Rot AI Reels</h1>
        <p className="feature-page__desc">
          Prompt the reel, let Gemini write it, let ElevenLabs say it, and keep the freeform graph
          visible while a timed-captioned gameplay bed carries the background.
        </p>
      </div>

      <section className="brainrot-builder">
        <div className="brainrot-builder__main">
          <article className="brainrot-surface">
            <div className="brainrot-surface__header">
              <div>
                <span className="brainrot-surface__eyebrow">Canvas</span>
                <h2>Freeform execution graph</h2>
                <p>
                  Move the nodes around, add notes anywhere, and run the real prompt to voice to
                  render pipeline without the graph slipping outside the stage.
                </p>
              </div>
              <div className="brainrot-flow-actions">
                <label className="brainrot-flow-actions__prompt">
                  <span>AI node</span>
                  <input
                    type="text"
                    value={aiNodePrompt}
                    onChange={(event) => setAiNodePrompt(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') {
                        event.preventDefault();
                        void handleAddAiNode();
                      }
                    }}
                    placeholder='Try "make the camera shaky"'
                  />
                </label>
                <button
                  className="btn btn--ghost"
                  type="button"
                  onClick={() => void handleAddAiNode()}
                  disabled={isAiNodeGenerating}
                >
                  {isAiNodeGenerating ? 'Thinking...' : 'Add AI node'}
                </button>
                <button className="btn btn--ghost" type="button" onClick={handleAddCustomNode}>
                  Add node
                </button>
                <button className="btn btn--ghost" type="button" onClick={handleResetCoreLayout}>
                  Reset core layout
                </button>
                <button
                  className="btn btn--primary brainrot-run-button"
                  type="button"
                  onClick={openRunDialog}
                  disabled={!canRun}
                >
                  {renderState === 'running'
                    ? 'Running...'
                    : generatedRender && isRenderDirty
                      ? 'Run again'
                      : 'Run'}
                </button>
              </div>
            </div>

            <div className="brainrot-status-banner">
              <span className="brainrot-status-banner__dot" />
              <span>{statusMessage}</span>
            </div>

            <div className="brainrot-canvas-shell">
              <div className="brainrot-canvas-toolbar">
                <span>
                  Core nodes drive execution. Double-click any node or hit the three dots to edit
                  its settings. Custom nodes can be added blank or generated with AI.
                </span>
                <div className="brainrot-canvas-zoom" aria-label="Canvas zoom controls">
                  <button
                    className="brainrot-canvas-zoom__button"
                    type="button"
                    onClick={() => updateCanvasZoom(canvasZoom - CANVAS_ZOOM_STEP)}
                    disabled={canvasZoom <= MIN_CANVAS_ZOOM}
                    aria-label="Zoom out"
                  >
                    −
                  </button>
                  <button
                    className="brainrot-canvas-zoom__label"
                    type="button"
                    onClick={() => updateCanvasZoom(DEFAULT_CANVAS_ZOOM)}
                    aria-label="Reset zoom"
                  >
                    {zoomLabel}
                  </button>
                  <button
                    className="brainrot-canvas-zoom__button"
                    type="button"
                    onClick={() => updateCanvasZoom(canvasZoom + CANVAS_ZOOM_STEP)}
                    disabled={canvasZoom >= MAX_CANVAS_ZOOM}
                    aria-label="Zoom in"
                  >
                    +
                  </button>
                </div>
              </div>
              <div className="brainrot-canvas-stage" ref={canvasStageRef} onWheel={handleCanvasWheel}>
                <div
                  className="brainrot-canvas-viewport"
                  style={{ width: scaledCanvasWidth, height: scaledCanvasHeight }}
                >
                  <div
                    className="brainrot-canvas"
                    ref={canvasRef}
                    style={{
                      width: canvasSize.width,
                      height: canvasSize.height,
                      transform: `scale(${canvasZoom})`,
                    }}
                  >
                    <svg
                      className="brainrot-canvas__links"
                      viewBox={`0 0 ${canvasSize.width} ${canvasSize.height}`}
                    >
                      <defs>
                        <marker
                          id="brainrot-arrow"
                          markerWidth="10"
                          markerHeight="10"
                          refX="7"
                          refY="3"
                          orient="auto"
                        >
                          <path d="M0,0 L0,6 L9,3 z" fill="rgba(249, 115, 22, 0.55)" />
                        </marker>
                      </defs>
                      {coreLinkPaths.map((path, index) =>
                        path ? (
                          <path
                            key={`${CORE_NODE_ORDER[index]}-${CORE_NODE_ORDER[index + 1]}`}
                            d={path}
                            markerEnd="url(#brainrot-arrow)"
                          />
                        ) : null
                      )}
                    </svg>

                    {canvasNodes.map((node) =>
                      node.kind === 'core' ? (
                        <CanvasCoreNode
                          key={node.id}
                          node={node}
                          model={coreFlowMap[node.id]}
                          isSelected={selectedNode === node.id}
                          onPointerDown={handleNodePointerDown}
                          onSelect={setSelectedNode}
                          onOpenEditor={openNodeEditor}
                        />
                      ) : (
                        <CanvasCustomNode
                          key={node.id}
                          node={node}
                          isSelected={selectedNode === node.id}
                          onPointerDown={handleNodePointerDown}
                          onSelect={setSelectedNode}
                          onOpenEditor={openNodeEditor}
                        />
                      )
                    )}
                  </div>
                </div>
              </div>
            </div>

            <div className="brainrot-terminal">
              <div className="brainrot-terminal__header">
                <span className="brainrot-surface__eyebrow">Activity log</span>
                <strong>What the graph is doing</strong>
              </div>
              <div className="brainrot-terminal__body">
                {activityLog.map((entry) => (
                  <div className="brainrot-log" key={entry.id}>
                    <span className={`brainrot-log__tone brainrot-log__tone--${entry.tone}`} />
                    <span className="brainrot-log__time">{entry.timestamp}</span>
                    <span className="brainrot-log__message">{entry.message}</span>
                  </div>
                ))}
              </div>
            </div>
          </article>

          {isNodeEditorOpen && typeof document !== 'undefined'
            ? createPortal(
            <div
              className="brainrot-modal-backdrop brainrot-modal-backdrop--node-editor"
              onMouseDown={(event) => {
                if (event.target === event.currentTarget) {
                  closeNodeEditor();
                }
              }}
              role="presentation"
            >
              <div
                aria-labelledby="brainrot-node-dialog-title"
                aria-modal="true"
                className="brainrot-node-editor-modal"
                role="dialog"
                onMouseDown={(event) => event.stopPropagation()}
              >
                <div className="brainrot-node-editor-modal__header">
                  <div>
                    <span className="brainrot-surface__eyebrow">Node editor</span>
                    <h2 id="brainrot-node-dialog-title">{selectedNodeTitle}</h2>
                    <p>{selectedNodeDescription}</p>
                  </div>
                  <button
                    aria-label="Close node editor"
                    className="brainrot-modal__close"
                    type="button"
                    onClick={closeNodeEditor}
                  >
                    ×
                  </button>
                </div>

                {selectedNodeCode ? (
                  <div className="brainrot-node-editor-modal__meta">
                    <code className="brainrot-inspector__code">{selectedNodeCode}</code>
                  </div>
                ) : null}

                <div className="brainrot-node-editor-modal__body">

            {selectedCoreStage === 'prompt' ? (
              <div className="brainrot-inspector__body brainrot-form-grid">
                <div className="brainrot-option-grid">
                  {BRAINROT_TEMPLATE_PRESETS.map((template) => (
                    <button
                      key={template.id}
                      className={`brainrot-selection-card ${
                        selectedTemplateId === template.id ? 'brainrot-selection-card--active' : ''
                      }`}
                      type="button"
                      onClick={() => handleSelectTemplate(template.id)}
                    >
                      <div className="brainrot-selection-card__meta">
                        <span>{template.tag}</span>
                        <strong>{template.label}</strong>
                      </div>
                      <p>{template.description}</p>
                    </button>
                  ))}
                </div>
                <div className="brainrot-type-grid">
                  {BRAINROT_TYPE_PRESETS.map((preset) => (
                    <button
                      key={preset.id}
                      className={`brainrot-type-card ${
                        preset.id === brainrotType ? 'brainrot-type-card--active' : ''
                      }`}
                      type="button"
                      onClick={() => {
                        setBrainrotType(preset.id);
                        if (!manualScriptMode) {
                          setScriptDraft('');
                          setLastGeneratedScript(null);
                        }
                      }}
                    >
                      <span>{preset.tag}</span>
                      <strong>{preset.label}</strong>
                      <p>{preset.description}</p>
                    </button>
                  ))}
                </div>
                <div className="brainrot-static-card">
                  <span>Opening card</span>
                  <strong>
                    {introCard.enabled
                      ? `${formatIntroCardHandle(introCard.title)} • ${INTRO_CARD_DURATION_SECONDS.toFixed(1)}s`
                      : 'Disabled'}
                  </strong>
                  <p>
                    The opener is now a rounded story post card that sits alone for the
                    first three seconds before narration and captions begin.
                  </p>
                  {introCard.enabled ? <RedditIntroCardPreview introCard={introCard} /> : null}
                </div>
                <label className="brainrot-form-field">
                  <span>Card account</span>
                  <input
                    type="text"
                    value={introCard.title}
                    onChange={(event) =>
                      setIntroCard((current) => ({
                        ...current,
                        title: event.target.value,
                      }))
                    }
                    placeholder="Story Watch"
                  />
                </label>
                <label className="form-field">
                  <span>Card question</span>
                  <textarea
                    rows={3}
                    value={introCard.question}
                    onChange={(event) =>
                      setIntroCard((current) => ({
                        ...current,
                        question: event.target.value,
                      }))
                    }
                    placeholder="What family tradition ruined your family?"
                  />
                </label>
                <div className="brainrot-mini-grid">
                  <div className="brainrot-mini-card">
                    <span>Opening card length</span>
                    <strong>{INTRO_CARD_DURATION_SECONDS.toFixed(1)}s</strong>
                  </div>
                  <div className="brainrot-mini-card">
                    <span>Story start</span>
                    <strong>After the intro card</strong>
                  </div>
                </div>
                <label className="brainrot-form-field">
                  <span>Opening card</span>
                  <select
                    value={introCard.enabled ? 'enabled' : 'disabled'}
                    onChange={(event) =>
                      setIntroCard((current) => ({
                        ...current,
                        enabled: event.target.value === 'enabled',
                      }))
                    }
                  >
                    <option value="enabled">Enabled</option>
                    <option value="disabled">Disabled</option>
                  </select>
                </label>
                <div className="brainrot-static-card">
                  <span>Target duration</span>
                  <strong>{targetDurationSeconds} seconds</strong>
                  <p>Gemini, the voiceover, and the final reel now all aim for this length range.</p>
                </div>
                <div className="brainrot-pill-row">
                  {TARGET_DURATION_PRESETS.map((value) => (
                    <button
                      key={value}
                      className={`brainrot-pill-button ${
                        value === targetDurationSeconds ? 'brainrot-pill-button--active' : ''
                      }`}
                      type="button"
                      onClick={() => setTargetDurationSeconds(value)}
                    >
                      {value}s
                    </button>
                  ))}
                </div>
                <label className="brainrot-range-field">
                  <div>
                    <span>Duration slider</span>
                    <strong>{targetDurationSeconds}s</strong>
                  </div>
                  <input
                    type="range"
                    min={TARGET_DURATION_MIN}
                    max={TARGET_DURATION_MAX}
                    step={TARGET_DURATION_STEP}
                    value={targetDurationSeconds}
                    onChange={(event) => setTargetDurationSeconds(Number(event.target.value))}
                  />
                </label>
                <label className="form-field">
                  <span>Prompt</span>
                  <textarea
                    rows={6}
                    value={promptInput}
                    onChange={(event) => {
                      setPromptInput(event.target.value);
                      setIntroCard((current) => ({
                        ...current,
                        question:
                          current.question === selectedTemplate.defaultIntroQuestion
                            ? event.target.value
                            : current.question,
                      }));
                      if (!manualScriptMode) {
                        setScriptDraft('');
                        setLastGeneratedScript(null);
                      }
                    }}
                    placeholder="What family tradition ruined your family?"
                  />
                </label>
                <label className="form-field">
                  <span>Gemini script guidance</span>
                  <textarea
                    rows={4}
                    value={scriptGuidance}
                    onChange={(event) => setScriptGuidance(event.target.value)}
                    placeholder="Tell Gemini what angle to push, what tone to use, or what to avoid."
                  />
                </label>
              </div>
            ) : null}

            {selectedCoreStage === 'script' ? (
              <div className="brainrot-inspector__body brainrot-form-grid">
                <label className="form-field">
                  <span>Script</span>
                  <textarea
                    rows={9}
                    value={scriptDraft}
                    onChange={(event) => {
                      setScriptDraft(event.target.value);
                      setManualScriptMode(true);
                    }}
                    placeholder="Gemini will place the spoken script here after the next run."
                  />
                </label>
                <div className="brainrot-action-row">
                  <button
                    className="btn btn--ghost"
                    type="button"
                    onClick={() => {
                      setManualScriptMode(false);
                      setScriptDraft(lastGeneratedScript?.spokenScript ?? '');
                    }}
                  >
                    Use AI on next run
                  </button>
                </div>
                <div className="brainrot-mini-grid">
                  <div className="brainrot-mini-card">
                    <span>Mode</span>
                    <strong>{manualScriptMode ? 'Manual override' : 'Gemini generated'}</strong>
                  </div>
                  <div className="brainrot-mini-card">
                    <span>Hook</span>
                    <strong>{lastGeneratedScript?.hook ?? 'Pending'}</strong>
                  </div>
                </div>
              </div>
            ) : null}

            {selectedCoreStage === 'voice' ? (
              <div className="brainrot-inspector__body brainrot-form-grid">
                <div className="brainrot-pill-row">
                  {([
                    ['recommended', 'Recommended'],
                    ['expressive-female', 'Expressive female'],
                    ['expressive-male', 'Expressive male'],
                    ['all', 'All voices'],
                    ['cloned', 'Cloned'],
                  ] as const).map(([mode, label]) => (
                    <button
                      key={mode}
                      className={`brainrot-pill-button ${
                        voiceFilterMode === mode ? 'brainrot-pill-button--active' : ''
                      }`}
                      type="button"
                      onClick={() => setVoiceFilterMode(mode)}
                    >
                      {label}
                    </button>
                  ))}
                </div>

                <label className="brainrot-form-field">
                  <span>Search voices</span>
                  <input
                    type="text"
                    value={voiceSearchInput}
                    onChange={(event) => setVoiceSearchInput(event.target.value)}
                    placeholder="Search by name, gender, use case, accent, or tone."
                  />
                </label>

                {recommendedVoices.length ? (
                  <div className="brainrot-option-strip">
                    {recommendedVoices.map((voice) => (
                      <button
                        key={voice.id}
                        className={`brainrot-quick-chip ${
                          selectedVoiceId === voice.id ? 'brainrot-quick-chip--active' : ''
                        }`}
                        type="button"
                        onClick={() => setSelectedVoiceId(voice.id)}
                      >
                        {voice.name}
                      </button>
                    ))}
                  </div>
                ) : null}

                <div className="brainrot-option-grid brainrot-option-grid--compact">
                  {visibleVoices.map((voice) => (
                    <button
                      key={voice.id}
                      className={`brainrot-selection-card ${
                        selectedVoiceId === voice.id ? 'brainrot-selection-card--active' : ''
                      }`}
                      type="button"
                      onClick={() => setSelectedVoiceId(voice.id)}
                    >
                      <div className="brainrot-selection-card__meta">
                        <span>{voice.category}</span>
                        <strong>{voice.name}</strong>
                      </div>
                      <p>
                        {[
                          formatVoiceLabel(readVoiceLabel(voice, 'gender') || 'voice'),
                          formatVoiceLabel(readVoiceLabel(voice, 'use_case') || 'general'),
                          formatVoiceLabel(readVoiceLabel(voice, 'descriptive') || ''),
                        ]
                          .filter(Boolean)
                          .join(' • ')}
                      </p>
                    </button>
                  ))}
                </div>

                {!visibleVoices.length ? (
                  <p className="brainrot-inline-note">
                    No voices match this filter. Clear the search or switch back to Recommended.
                  </p>
                ) : null}

                <div className="brainrot-mini-grid">
                  <div className="brainrot-mini-card">
                    <span>Selected voice</span>
                    <strong>{selectedVoice.name}</strong>
                  </div>
                  <div className="brainrot-mini-card">
                    <span>Profile</span>
                    <strong>
                      {[
                        formatVoiceLabel(readVoiceLabel(selectedVoice, 'gender') || 'voice'),
                        formatVoiceLabel(readVoiceLabel(selectedVoice, 'accent') || ''),
                        formatVoiceLabel(readVoiceLabel(selectedVoice, 'age') || ''),
                      ]
                        .filter(Boolean)
                        .join(' • ')}
                    </strong>
                  </div>
                </div>

                {selectedVoice.previewUrl ? (
                  <div className="brainrot-audio-preview">
                    <audio controls preload="none" src={selectedVoice.previewUrl} />
                  </div>
                ) : null}

                <div className="brainrot-action-row">
                  <button
                    className="btn btn--ghost"
                    type="button"
                    onClick={() => void loadVoices()}
                    disabled={isVoicesLoading}
                  >
                    {isVoicesLoading ? 'Refreshing...' : 'Refresh voices'}
                  </button>
                </div>

                {voicesWarning ? <p className="brainrot-inline-note">{voicesWarning}</p> : null}

                <label className="brainrot-range-field">
                  <div>
                    <span>Stability</span>
                    <strong>{voiceSettings.stability.toFixed(2)}</strong>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.01}
                    value={voiceSettings.stability}
                    onChange={(event) =>
                      setVoiceSettings((current) => ({
                        ...current,
                        stability: Number(event.target.value),
                      }))
                    }
                  />
                </label>

                <label className="brainrot-range-field">
                  <div>
                    <span>Similarity</span>
                    <strong>{voiceSettings.similarityBoost.toFixed(2)}</strong>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.01}
                    value={voiceSettings.similarityBoost}
                    onChange={(event) =>
                      setVoiceSettings((current) => ({
                        ...current,
                        similarityBoost: Number(event.target.value),
                      }))
                    }
                  />
                </label>

                <label className="brainrot-range-field">
                  <div>
                    <span>Style</span>
                    <strong>{voiceSettings.style.toFixed(2)}</strong>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.01}
                    value={voiceSettings.style}
                    onChange={(event) =>
                      setVoiceSettings((current) => ({
                        ...current,
                        style: Number(event.target.value),
                      }))
                    }
                  />
                </label>

                <label className="brainrot-range-field">
                  <div>
                    <span>Speed</span>
                    <strong>{voiceSettings.speed.toFixed(2)}x</strong>
                  </div>
                  <input
                    type="range"
                    min={0.7}
                    max={1.2}
                    step={0.01}
                    value={voiceSettings.speed}
                    onChange={(event) =>
                      setVoiceSettings((current) => ({
                        ...current,
                        speed: Number(event.target.value),
                      }))
                    }
                  />
                </label>
              </div>
            ) : null}

            {selectedCoreStage === 'gameplay' ? (
              <div className="brainrot-inspector__body brainrot-form-grid">
                <div className="brainrot-option-grid">
                  {BRAINROT_GAMEPLAY_PRESETS.map((preset) => (
                    <button
                      key={preset.id}
                      className={`brainrot-selection-card ${
                        selectedGameplayPresetId === preset.id ? 'brainrot-selection-card--active' : ''
                      }`}
                      type="button"
                      onClick={() => handleSelectGameplayPreset(preset.id)}
                    >
                      <div className="brainrot-selection-card__meta">
                        <span>{preset.tag}</span>
                        <strong>{preset.label}</strong>
                      </div>
                      <p>{preset.description}</p>
                    </button>
                  ))}
                </div>

                {isCustomRemoteGameplayPreset ? (
                  <>
                    <label className="form-field">
                      <span>Remote gameplay URL</span>
                      <textarea
                        rows={3}
                        value={remoteGameplayUrl}
                        onChange={(event) => setRemoteGameplayUrl(event.target.value)}
                        placeholder="Paste a public gameplay page or a direct MP4/WebM URL."
                      />
                    </label>
                    <div className="brainrot-action-row">
                      <button
                        className="btn btn--ghost"
                        type="button"
                        onClick={() => void handleResolveRemoteGameplay()}
                        disabled={isResolvingGameplay}
                      >
                        {isResolvingGameplay ? 'Resolving...' : 'Attach remote gameplay'}
                      </button>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="brainrot-static-card">
                      <span>Footage source</span>
                      <strong>
                        {selectedGameplayPreset.source === 'remote'
                          ? 'Built-in satisfying stock clip'
                          : 'Built-in Subway Surfers clip'}
                      </strong>
                      <p>
                        {selectedGameplayPreset.source === 'remote'
                          ? 'This template uses a direct free-stock satisfying video so it works without a manual upload.'
                          : 'This template uses the local Subway Surfers gameplay cache and keeps the whole bed muted.'}
                      </p>
                    </div>
                    {selectedGameplayPreset.source === 'local' ? (
                      <div className="brainrot-action-row">
                        <button
                          className="btn btn--ghost"
                          type="button"
                          onClick={() => void prepareGameplay()}
                          disabled={isPreparingGameplay}
                        >
                          {isPreparingGameplay ? 'Preparing...' : 'Refresh built-in gameplay'}
                        </button>
                      </div>
                    ) : null}
                  </>
                )}

                <div className="brainrot-preview-card">
                  {gameplayAsset ? (
                    <video autoPlay loop muted playsInline src={gameplayPreviewUrl} />
                  ) : (
                    <div className="brainrot-empty-state">
                      {isCustomRemoteGameplayPreset
                        ? 'Attach a remote gameplay feed to fill the frame.'
                        : isPreparingGameplay
                          ? 'Preparing the built-in Subway Surfers mezzanine for Cloudinary.'
                          : 'Gameplay is missing. Retry this node.'}
                    </div>
                  )}
                </div>
                {selectedGameplayPreset.source === 'local' ? (
                  <label className="brainrot-range-field">
                    <div>
                      <span>Gameplay start offset</span>
                      <strong>{safeGameplayOffset}s</strong>
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={maxGameplayOffset || 0}
                      value={safeGameplayOffset}
                      onChange={(event) => setGameplayStartOffset(Number(event.target.value))}
                    />
                  </label>
                ) : (
                  <div className="brainrot-inline-note">
                    Built-in satisfying clips start from the head and loop automatically to match
                    the voiceover length.
                  </div>
                )}
                <label className="brainrot-form-field">
                  <span>Gameplay focus</span>
                  <select
                    value={layoutStyle.gameplayGravity}
                    onChange={(event) =>
                      setLayoutStyle((current) => ({
                        ...current,
                        gameplayGravity: event.target.value as BrainrotLayoutStyle['gameplayGravity'],
                      }))
                    }
                  >
                    {BRAINROT_GAMEPLAY_GRAVITY_OPTIONS.map((gravity) => (
                      <option key={gravity} value={gravity}>
                        {gravity}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="brainrot-static-card">
                  <span>Gameplay coverage</span>
                  <strong>Full-screen 9:16 cover</strong>
                  <p>
                    The gameplay now fills the whole render. Use the focus control above to decide
                    which cropped area stays visible.
                  </p>
                </div>
                <div className="brainrot-mini-grid">
                  <div className="brainrot-mini-card">
                    <span>Asset</span>
                    <strong>{gameplayAsset?.label ?? 'Waiting'}</strong>
                  </div>
                  <div className="brainrot-mini-card">
                    <span>Mode</span>
                    <strong>
                      {isCustomRemoteGameplayPreset
                        ? 'Remote gameplay feed'
                        : selectedGameplayPreset.source === 'remote'
                          ? 'Built-in satisfying stock'
                        : isGameplayFallback
                          ? 'Fallback Cloudinary asset'
                          : isGameplayCached
                            ? 'Cached asset'
                            : 'Prepared local upload'}
                    </strong>
                  </div>
                </div>
              </div>
            ) : null}

            {selectedCoreStage === 'caption' ? (
              <div className="brainrot-inspector__body brainrot-form-grid">
                <div className="brainrot-option-grid">
                  {BRAINROT_CAPTION_STYLE_PRESETS.map((preset) => (
                    <button
                      key={preset.id}
                      className={`brainrot-selection-card ${
                        selectedCaptionPresetId === preset.id ? 'brainrot-selection-card--active' : ''
                      }`}
                      type="button"
                      onClick={() => handleSelectCaptionPreset(preset.id)}
                    >
                      <div className="brainrot-selection-card__meta">
                        <span>{preset.tag}</span>
                        <strong>{preset.label}</strong>
                      </div>
                      <p>{preset.description}</p>
                    </button>
                  ))}
                </div>

                <div className="brainrot-static-card">
                  <span>Caption mode</span>
                  <strong>Timed short-phrase captions synced to the ElevenLabs voice</strong>
                  <p>
                    The caption track is now built from the synthesized voice timing, not from a
                    rough duration estimate. The hook below is kept for the node summary and as the
                    fallback if subtitle generation fails.
                  </p>
                </div>

                <label className="form-field">
                  <span>Hook / fallback caption</span>
                  <textarea
                    rows={4}
                    value={captionText}
                    onChange={(event) => {
                      setCaptionText(event.target.value);
                      setManualCaptionMode(true);
                    }}
                    placeholder="Type the fallback caption for the staged position."
                  />
                </label>

                <div className="brainrot-action-row">
                  <button
                    className="btn btn--ghost"
                    type="button"
                    onClick={() => {
                      setManualCaptionMode(false);
                      setCaptionText(
                        lastGeneratedScript
                          ? pickAutomaticCaption(lastGeneratedScript)
                          : summarizeScriptAsCaption(scriptDraft)
                      );
                    }}
                  >
                    Use AI caption
                  </button>
                </div>

                <div className="brainrot-static-card">
                  <span>Caption staging</span>
                  <strong>Drag the caption box over the preview, then resize it</strong>
                  <p>
                    The generated caption cues will use this same screen position and font size
                    when the reel is rendered.
                  </p>
                </div>

                <div
                  className="brainrot-caption-stage"
                  ref={captionLayoutEditorRef}
                >
                  {captionLayoutPreviewUrl ? (
                    <video autoPlay loop muted playsInline src={captionLayoutPreviewUrl} />
                  ) : (
                    <div className="brainrot-empty-state brainrot-empty-state--tall">
                      Gameplay preview will appear here once the background bed is ready.
                    </div>
                  )}
                  <div
                    className="brainrot-caption-stage__box"
                    role="presentation"
                    style={{
                      left: captionPreviewPosition.left,
                      top: captionPreviewPosition.top,
                      transform: captionPreviewPosition.transform,
                      color: captionStyle.textColor,
                      backgroundColor: captionStyle.backgroundVisible
                        ? withAlpha(captionStyle.backgroundColor, 0.82)
                        : 'transparent',
                      fontFamily: resolveCaptionGuideFontFamily(captionStyle.fontFamily),
                      fontSize: `${captionGuideFontSize}px`,
                      fontWeight: captionStyle.fontWeight,
                      WebkitTextStroke: `${Math.max(
                        1,
                        Math.round(captionStyle.strokeWidth * CAPTION_PREVIEW_FONT_SCALE)
                      )}px ${captionStyle.strokeColor}`,
                      textShadow: captionStyle.backgroundVisible
                        ? 'none'
                        : `0 6px 20px ${withAlpha(captionStyle.strokeColor, 0.52)}`,
                      boxShadow: captionStyle.backgroundVisible
                        ? `0 24px 60px ${withAlpha(captionStyle.backgroundColor, 0.28)}`
                        : `0 24px 60px ${withAlpha(captionStyle.strokeColor, 0.22)}`,
                    }}
                    onPointerDown={handleCaptionEditorPointerDown}
                    onMouseDown={handleCaptionEditorMouseDown}
                  >
                    <span className="brainrot-caption-stage__tag">Drag caption</span>
                    <span className="brainrot-caption-stage__body">
                      {captionGuideLines.join('\n')}
                    </span>
                    <button
                      className="brainrot-caption-stage__resize"
                      type="button"
                      onPointerDown={handleCaptionResizePointerDown}
                      onMouseDown={handleCaptionResizeMouseDown}
                    >
                      ↘
                    </button>
                  </div>
                </div>

                <div className="brainrot-mini-grid">
                  <div className="brainrot-mini-card">
                    <span>X offset</span>
                    <strong>{captionStyle.horizontalOffset}px</strong>
                  </div>
                  <div className="brainrot-mini-card">
                    <span>Y offset</span>
                    <strong>{captionStyle.verticalOffset}px</strong>
                  </div>
                </div>

                <label className="brainrot-range-field">
                  <div>
                    <span>Font size</span>
                    <strong>{captionStyle.fontSize}px</strong>
                  </div>
                  <input
                    type="range"
                    min={CAPTION_FONT_SIZE_MIN}
                    max={CAPTION_FONT_SIZE_MAX}
                    value={captionStyle.fontSize}
                    onChange={(event) =>
                      setCaptionStyle((current) => ({
                        ...current,
                        fontSize: Number(event.target.value),
                      }))
                    }
                  />
                </label>

                <label className="brainrot-range-field">
                  <div>
                    <span>Words per cue</span>
                    <strong>{captionStyle.maxWordsPerCue}</strong>
                  </div>
                  <input
                    type="range"
                    min={2}
                    max={6}
                    step={1}
                    value={captionStyle.maxWordsPerCue}
                    onChange={(event) =>
                      setCaptionStyle((current) => ({
                        ...current,
                        maxWordsPerCue: Number(event.target.value),
                      }))
                    }
                  />
                </label>

                <label className="brainrot-range-field">
                  <div>
                    <span>Outline width</span>
                    <strong>{captionStyle.strokeWidth}px</strong>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={8}
                    step={1}
                    value={captionStyle.strokeWidth}
                    onChange={(event) =>
                      setCaptionStyle((current) => ({
                        ...current,
                        strokeWidth: Number(event.target.value),
                      }))
                    }
                  />
                </label>

                <label className="brainrot-range-field">
                  <div>
                    <span>Horizontal offset</span>
                    <strong>{captionStyle.horizontalOffset}px</strong>
                  </div>
                  <input
                    type="range"
                    min={-CAPTION_HORIZONTAL_LIMIT}
                    max={CAPTION_HORIZONTAL_LIMIT}
                    step={10}
                    value={captionStyle.horizontalOffset}
                    onChange={(event) =>
                      setCaptionStyle((current) => ({
                        ...current,
                        placement: 'center',
                        horizontalOffset: Number(event.target.value),
                      }))
                    }
                  />
                </label>

                <label className="brainrot-range-field">
                  <div>
                    <span>Vertical offset</span>
                    <strong>{captionStyle.verticalOffset}px</strong>
                  </div>
                  <input
                    type="range"
                    min={-CAPTION_VERTICAL_LIMIT}
                    max={CAPTION_VERTICAL_LIMIT}
                    step={10}
                    value={captionStyle.verticalOffset}
                    onChange={(event) =>
                      setCaptionStyle((current) => ({
                        ...current,
                        placement: 'center',
                        verticalOffset: Number(event.target.value),
                      }))
                    }
                  />
                </label>

                <div className="brainrot-color-grid">
                  <label className="brainrot-form-field">
                    <span>Caption background</span>
                    <select
                      value={captionStyle.backgroundVisible ? 'visible' : 'transparent'}
                      onChange={(event) =>
                        setCaptionStyle((current) => ({
                          ...current,
                          backgroundVisible: event.target.value === 'visible',
                        }))
                      }
                    >
                      <option value="transparent">Transparent</option>
                      <option value="visible">Visible block</option>
                    </select>
                  </label>

                  <label className="brainrot-color-field">
                    <span>Text color</span>
                    <div>
                      <input
                        type="color"
                        value={captionStyle.textColor}
                        onChange={(event) =>
                          setCaptionStyle((current) => ({
                            ...current,
                            textColor: event.target.value,
                          }))
                        }
                      />
                      <input
                        type="text"
                        value={captionStyle.textColor}
                        onChange={(event) =>
                          setCaptionStyle((current) => ({
                            ...current,
                            textColor: event.target.value,
                          }))
                        }
                      />
                    </div>
                  </label>

                  <label className="brainrot-color-field">
                    <span>Outline color</span>
                    <div>
                      <input
                        type="color"
                        value={captionStyle.strokeColor}
                        onChange={(event) =>
                          setCaptionStyle((current) => ({
                            ...current,
                            strokeColor: event.target.value,
                          }))
                        }
                      />
                      <input
                        type="text"
                        value={captionStyle.strokeColor}
                        onChange={(event) =>
                          setCaptionStyle((current) => ({
                            ...current,
                            strokeColor: event.target.value,
                          }))
                        }
                      />
                    </div>
                  </label>

                  <label className="brainrot-color-field">
                    <span>Caption background color</span>
                    <div>
                      <input
                        type="color"
                        value={captionStyle.backgroundColor}
                        onChange={(event) =>
                          setCaptionStyle((current) => ({
                            ...current,
                            backgroundColor: event.target.value,
                          }))
                        }
                      />
                      <input
                        type="text"
                        value={captionStyle.backgroundColor}
                        onChange={(event) =>
                          setCaptionStyle((current) => ({
                            ...current,
                            backgroundColor: event.target.value,
                          }))
                        }
                      />
                    </div>
                  </label>
                </div>

                <div className="brainrot-action-row">
                  <button
                    className="btn btn--ghost"
                    type="button"
                    onClick={handleResetCaptionLayout}
                  >
                    Reset placement
                  </button>
                </div>
              </div>
            ) : null}

            {selectedCoreStage === 'music' ? (
              <div className="brainrot-inspector__body brainrot-form-grid">
                <div className="brainrot-placeholder-card">
                  <strong>Music link-up is staged for the next pass.</strong>
                  <p>
                    This run is voiceover-only by design so the main pipeline stays reliable. The
                    music node remains visible in the flow and in the final run plan.
                  </p>
                </div>
                <label className="brainrot-range-field brainrot-range-field--disabled">
                  <div>
                    <span>Music volume</span>
                    <strong>Coming later</strong>
                  </div>
                  <input type="range" min={0} max={100} value={12} disabled readOnly />
                </label>
              </div>
            ) : null}

            {selectedCoreStage === 'render' ? (
              <div className="brainrot-inspector__body">
                <div className="brainrot-mini-grid">
                  <div className="brainrot-mini-card">
                    <span>Type</span>
                    <strong>{selectedTypePreset.label}</strong>
                  </div>
                  <div className="brainrot-mini-card">
                    <span>Voice</span>
                    <strong>{selectedVoice.name}</strong>
                  </div>
                </div>
                <div className="brainrot-plan">
                  {(generatedRender?.plan ??
                    buildBrainrotRunPlan({
                      brainrotType,
                      voiceLabel: selectedVoice.name,
                      gameplayLabel: gameplayAsset?.label ?? selectedGameplayPreset.label,
                      captionText,
                      captionStyle,
                      layoutStyle,
                      durationSeconds: targetDurationSeconds,
                      timedCaptions: true,
                      introCard,
                    })).map((item) => (
                    <div className="brainrot-plan__item" key={item}>
                      {item}
                    </div>
                  ))}
                </div>
                <div className="brainrot-action-row">
                  <button
                    className="btn btn--primary brainrot-run-button"
                    type="button"
                    onClick={openRunDialog}
                    disabled={!canRun}
                  >
                    {renderState === 'running'
                      ? 'Running...'
                      : generatedRender && isRenderDirty
                        ? 'Run again'
                        : 'Run'}
                  </button>
                </div>
              </div>
            ) : null}

            {selectedCustomNode ? (
              <div className="brainrot-inspector__body brainrot-form-grid">
                <label className="brainrot-form-field">
                  <span>Title</span>
                  <input
                    type="text"
                    value={selectedCustomNode.title}
                    onChange={(event) =>
                      handleUpdateCustomNode(selectedCustomNode.id, {
                        title: event.target.value,
                      })
                    }
                  />
                </label>
                <label className="form-field">
                  <span>Body</span>
                  <textarea
                    rows={5}
                    value={selectedCustomNode.body}
                    onChange={(event) =>
                      handleUpdateCustomNode(selectedCustomNode.id, {
                        body: event.target.value,
                      })
                    }
                  />
                </label>
                <label className="brainrot-color-field">
                  <span>Accent</span>
                  <div>
                    <input
                      type="color"
                      value={selectedCustomNode.color}
                      onChange={(event) =>
                        handleUpdateCustomNode(selectedCustomNode.id, {
                          color: event.target.value,
                        })
                      }
                    />
                    <input
                      type="text"
                      value={selectedCustomNode.color}
                      onChange={(event) =>
                        handleUpdateCustomNode(selectedCustomNode.id, {
                          color: event.target.value,
                        })
                      }
                    />
                  </div>
                </label>
                <div className="brainrot-action-row">
                  <button
                    className="btn btn--ghost"
                    type="button"
                    onClick={() => handleDeleteCustomNode(selectedCustomNode.id)}
                  >
                    Delete node
                  </button>
                </div>
              </div>
            ) : null}
                </div>
              </div>
            </div>
            , document.body)
            : null}
        </div>

        <aside className="brainrot-builder__aside">
          <article className="brainrot-surface">
            <div className="brainrot-surface__header">
              <div>
                <span className="brainrot-surface__eyebrow">Output</span>
                <h2>Rendered reel</h2>
                <p>Preview the final Cloudinary output with the AI voiceover baked in.</p>
              </div>
              <span
                className={`brainrot-status-pill brainrot-status-pill--${
                  renderState === 'complete' && !isRenderDirty
                    ? 'complete'
                    : renderState === 'running'
                      ? 'running'
                      : renderState === 'error'
                        ? 'error'
                        : 'ready'
                }`}
              >
                {renderState === 'complete' && !isRenderDirty
                  ? 'fresh'
                  : renderState === 'running'
                    ? 'running'
                    : isRenderDirty
                      ? 'stale'
                      : 'idle'}
              </span>
            </div>

            <div className="brainrot-output-frame">
              {generatedRender ? (
                <video
                  key={generatedRender.deliveryUrl}
                  autoPlay
                  controls
                  loop
                  playsInline
                  poster={generatedRender.posterUrl}
                  src={generatedRender.deliveryUrl}
                />
              ) : captionLayoutPreviewUrl ? (
                <video
                  autoPlay
                  loop
                  muted
                  playsInline
                  src={captionLayoutPreviewUrl}
                />
              ) : (
                <div className="brainrot-empty-state brainrot-empty-state--tall">
                  Run the graph to generate the AI voiceover reel.
                </div>
              )}
            </div>

            <div className="brainrot-mini-grid">
              <div className="brainrot-mini-card">
                <span>Voice</span>
                <strong>{generatedRender?.voiceName ?? selectedVoice.name}</strong>
              </div>
              <div className="brainrot-mini-card">
                <span>Duration</span>
                <strong>{formatDuration(generatedRender?.durationSeconds)}</strong>
              </div>
              <div className="brainrot-mini-card">
                <span>Gameplay</span>
                <strong>{generatedRender?.gameplayLabel ?? gameplayAsset?.label ?? selectedGameplayPreset.label}</strong>
              </div>
            </div>

            {generatedRender ? (
              <>
                <div className="brainrot-action-row">
                  <a
                    className="btn btn--ghost"
                    href={generatedRender.deliveryUrl}
                    rel="noreferrer"
                    target="_blank"
                  >
                    Open render
                  </a>
                  <a
                    className="btn btn--ghost"
                    href={generatedRender.audioAsset.secureUrl}
                    rel="noreferrer"
                    target="_blank"
                  >
                    Open voice track
                  </a>
                  {generatedRender.subtitleAsset ? (
                    <a
                      className="btn btn--ghost"
                      href={generatedRender.subtitleAsset.secureUrl}
                      rel="noreferrer"
                      target="_blank"
                    >
                      Open captions
                    </a>
                  ) : null}
                </div>
                <div className="brainrot-plan">
                  {generatedRender.plan.map((item) => (
                    <div className="brainrot-plan__item" key={item}>
                      {item}
                    </div>
                  ))}
                </div>
              </>
            ) : null}
          </article>

          <article className="brainrot-surface">
            <div className="brainrot-surface__header">
              <div>
                <span className="brainrot-surface__eyebrow">Inputs</span>
                <h2>Pipeline state</h2>
                <p>The current script, voice asset, and gameplay bed the graph will use.</p>
              </div>
            </div>

            <div className="brainrot-asset-stack">
              <div className="brainrot-asset-card">
                <span>Selected type</span>
                <strong>{selectedTypePreset.label}</strong>
                <p>
                  {selectedTypePreset.description} Target length: {targetDurationSeconds}s.
                </p>
              </div>

              <div className="brainrot-asset-card">
                <span>Current script</span>
                <strong>{lastGeneratedScript?.title ?? 'Waiting for Gemini'}</strong>
                <p>{(scriptDraft || 'No script yet.').slice(0, 220)}</p>
              </div>

              <div className="brainrot-asset-card">
                <div className="brainrot-asset-card__thumb">
                  {gameplayAsset ? (
                    <video autoPlay loop muted playsInline src={gameplayPreviewUrl} />
                  ) : (
                    <div className="brainrot-empty-state">Gameplay not ready.</div>
                  )}
                </div>
                <span>Gameplay bed</span>
                <strong>{gameplayAsset?.label ?? 'Waiting for gameplay prep'}</strong>
                <p>
                  {isCustomRemoteGameplayPreset
                    ? 'Using the attached remote gameplay feed.'
                    : selectedGameplayPreset.source === 'remote'
                      ? 'Using the built-in satisfying stock background.'
                    : isGameplayFallback
                      ? 'Using fallback Cloudinary asset.'
                      : 'Using the local gameplay cache.'}
                </p>
              </div>

              <div className="brainrot-asset-card">
                <span>Voice asset</span>
                <strong>{voiceAsset?.label ?? 'Waiting for ElevenLabs'}</strong>
                <p>{voiceAsset ? `${selectedVoice.name} • ${formatDuration(voiceAsset.duration)}` : 'The synthesized voice track will appear here after the next run.'}</p>
                {voiceAsset ? <audio controls preload="none" src={voiceAsset.secureUrl} /> : null}
              </div>

              <div className="brainrot-asset-card">
                <span>Caption track</span>
                <strong>{subtitleAsset?.label ?? 'Waiting for timed captions'}</strong>
                <p>
                  {subtitleAsset
                    ? `${subtitleAsset.cueCount} cues uploaded to Cloudinary for burn-in.`
                    : 'The next run will generate a timed SRT from the Gemini script.'}
                </p>
              </div>
            </div>
          </article>
        </aside>
      </section>

      {isRunDialogOpen ? (
        <div
          className="brainrot-dialog-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              setIsRunDialogOpen(false);
            }
          }}
          role="presentation"
        >
          <div
            aria-labelledby="brainrot-run-dialog-title"
            aria-modal="true"
            className="brainrot-dialog"
            role="dialog"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="brainrot-dialog__header">
              <div>
                <span className="brainrot-surface__eyebrow">Gemini Input</span>
                <h2 id="brainrot-run-dialog-title">Review the script prompt before running</h2>
                <p>
                  This is the input Gemini will use for the narration and auto-caption on this run.
                </p>
              </div>
              <button
                aria-label="Close Gemini input dialog"
                className="brainrot-modal__close"
                type="button"
                onClick={() => setIsRunDialogOpen(false)}
              >
                ×
              </button>
            </div>

            <div className="brainrot-dialog__body brainrot-form-grid">
              <label className="form-field">
                <span>Topic prompt</span>
                <textarea
                  rows={5}
                  value={runPromptDraft}
                  onChange={(event) => setRunPromptDraft(event.target.value)}
                  placeholder="Describe the topic, claim, or story beat the reel should cover."
                />
              </label>

              <label className="form-field">
                <span>Script guidance</span>
                <textarea
                  rows={4}
                  value={runScriptGuidanceDraft}
                  onChange={(event) => setRunScriptGuidanceDraft(event.target.value)}
                  placeholder="Tell Gemini how to pace the narration, what tone to hit, and what to avoid."
                />
              </label>

              <div className="brainrot-static-card">
                <span>Live Gemini prompt preview</span>
                <pre className="brainrot-modal__preview">{geminiInputPreview}</pre>
              </div>

              {manualScriptMode ? (
                <p className="brainrot-inline-note">
                  Manual script override is active in the Script node. Switch that node back to AI
                  if you want Gemini to rewrite the narration on this run.
                </p>
              ) : null}
            </div>

            <div className="brainrot-dialog__actions">
              <button
                className="btn btn--ghost"
                type="button"
                onClick={() => setIsRunDialogOpen(false)}
              >
                Cancel
              </button>
              <button className="btn btn--primary" type="button" onClick={handleRunDialogConfirm}>
                Run pipeline
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
