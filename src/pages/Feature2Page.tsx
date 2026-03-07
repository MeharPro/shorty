import { useEffect, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent, WheelEvent as ReactWheelEvent } from 'react';
import { Link, Navigate } from 'react-router-dom';
import boltLogo from '../assets/bolt-logo.png';
import {
  BRAINROT_FRAME_HEIGHT,
  BRAINROT_FRAME_WIDTH,
  BRAINROT_CAPTION_STYLE_PRESETS,
  BRAINROT_FONT_OPTIONS,
  BRAINROT_GAMEPLAY_PRESETS,
  BRAINROT_GAMEPLAY_GRAVITY_OPTIONS,
  BRAINROT_TYPE_PRESETS,
  DEFAULT_BRAINROT_CAPTION_STYLE,
  DEFAULT_BRAINROT_LAYOUT_STYLE,
  DEFAULT_BRAINROT_VOICE_SETTINGS,
  FALLBACK_BRAINROT_VOICE,
  buildBrainrotCompositePosterUrl,
  buildBrainrotCompositeUrl,
  buildBrainrotRunPlan,
  fetchBrainrotVoices,
  generateBrainrotCaptions,
  generateBrainrotScript,
  prepareBrainrotGameplayAsset,
  resolveBrainrotGameplayUrl,
  synthesizeBrainrotVoice,
  type BrainrotAudioAsset,
  type BrainrotCaptionStyle,
  type BrainrotCaptionPresetId,
  type BrainrotFontFamily,
  type BrainrotLayoutStyle,
  type BrainrotScriptPackage,
  type BrainrotStageId,
  type BrainrotSubtitleAsset,
  type BrainrotTypeId,
  type BrainrotGameplayPresetId,
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
type VoiceFilterMode = 'recommended' | 'expressive-male' | 'all' | 'cloned';

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

function splitCaptionGuideLines(sourceText: string) {
  const words = sourceText.split(' ').filter(Boolean);
  if (!words.length) {
    return ['Captions appear here'];
  }

  const lines: string[] = [];
  let current = '';

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length > CAPTION_GUIDE_LINE_LIMIT && current) {
      lines.push(current);
      current = word;
    } else {
      current = candidate;
    }

    if (lines.length === CAPTION_GUIDE_MAX_LINES) {
      break;
    }
  }

  if (current && lines.length < CAPTION_GUIDE_MAX_LINES) {
    lines.push(current);
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

function scoreVoice(voice: BrainrotVoiceOption) {
  const gender = readVoiceLabel(voice, 'gender').toLowerCase();
  const useCase = readVoiceLabel(voice, 'use_case').toLowerCase();
  const descriptive = readVoiceLabel(voice, 'descriptive').toLowerCase();
  const category = voice.category.toLowerCase();
  let score = 0;

  if (gender === 'male') {
    score += 4;
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

function sortVoicesByRecommendation(voices: BrainrotVoiceOption[]) {
  return [...voices].sort((left, right) => {
    const delta = scoreVoice(right) - scoreVoice(left);

    if (delta !== 0) {
      return delta;
    }

    return left.name.localeCompare(right.name);
  });
}

function pickRecommendedVoiceId(voices: BrainrotVoiceOption[]) {
  return sortVoicesByRecommendation(voices)[0]?.id ?? FALLBACK_BRAINROT_VOICE.id;
}

function buildGeminiInputPreview({
  typeLabel,
  prompt,
  scriptGuidance,
  targetDurationSeconds,
}: {
  typeLabel: string;
  prompt: string;
  scriptGuidance: string;
  targetDurationSeconds: number;
}) {
  return [
    `Brain rot style: ${typeLabel}`,
    `Topic: ${prompt.trim() || 'Describe the reel idea here.'}`,
    `Script guidance: ${scriptGuidance.trim() || 'Keep it punchy, conversational, and easy to caption.'}`,
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

function createRunSignature(input: {
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
}

function CanvasCoreNode({
  node,
  model,
  isSelected,
  onPointerDown,
  onSelect,
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
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onSelect(node.id);
        }
      }}
    >
      <div className="brainrot-node__header">
        <span className="brainrot-node__step">{model.step}</span>
        <span className={`brainrot-status-pill brainrot-status-pill--${model.status}`}>
          {model.status}
        </span>
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
}

function CanvasCustomNode({
  node,
  isSelected,
  onPointerDown,
  onSelect,
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
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onSelect(node.id);
        }
      }}
    >
      <div className="brainrot-node__header">
        <span className="brainrot-node__step">Freeform</span>
        <span className="brainrot-custom-node__swatch" style={{ backgroundColor: node.color }} />
      </div>
      <strong>{node.title}</strong>
      <p>{node.body}</p>
      <span className="brainrot-node__grab">Drag</span>
    </div>
  );
}

export function Feature2Page({ session }: Feature2PageProps) {
  const [brainrotType, setBrainrotType] = useState<BrainrotTypeId>('subway-storytime');
  const [targetDurationSeconds, setTargetDurationSeconds] = useState(DEFAULT_TARGET_DURATION);
  const [promptInput, setPromptInput] = useState(
    'Why do certain habits quietly ruin your focus even when your day looks productive?'
  );
  const [scriptGuidance, setScriptGuidance] = useState(
    'Keep it sharp, specific, conversational, and easy to caption cleanly without mentioning the gameplay.'
  );
  const [scriptDraft, setScriptDraft] = useState('');
  const [manualScriptMode, setManualScriptMode] = useState(false);
  const [lastGeneratedScript, setLastGeneratedScript] = useState<BrainrotScriptPackage | null>(null);
  const [captionText, setCaptionText] = useState('Watch this one closely');
  const [manualCaptionMode, setManualCaptionMode] = useState(false);
  const [selectedCaptionPresetId, setSelectedCaptionPresetId] =
    useState<BrainrotCaptionPresetId>('signal-pop');
  const [captionStyle, setCaptionStyle] = useState<BrainrotCaptionStyle>(
    DEFAULT_BRAINROT_CAPTION_STYLE
  );
  const [layoutStyle, setLayoutStyle] = useState(DEFAULT_BRAINROT_LAYOUT_STYLE);
  const [voiceSettings, setVoiceSettings] = useState<BrainrotVoiceSettings>(
    DEFAULT_BRAINROT_VOICE_SETTINGS
  );
  const [voices, setVoices] = useState<BrainrotVoiceOption[]>([FALLBACK_BRAINROT_VOICE]);
  const [selectedVoiceId, setSelectedVoiceId] = useState(FALLBACK_BRAINROT_VOICE.id);
  const [voiceFilterMode, setVoiceFilterMode] = useState<VoiceFilterMode>('recommended');
  const [voiceSearchInput, setVoiceSearchInput] = useState('');
  const [isVoicesLoading, setIsVoicesLoading] = useState(true);
  const [voicesWarning, setVoicesWarning] = useState('');
  const [selectedGameplayPresetId, setSelectedGameplayPresetId] =
    useState<BrainrotGameplayPresetId>('subway-classic');
  const [localGameplayAsset, setLocalGameplayAsset] = useState<MediaAsset | null>(null);
  const [remoteGameplayAsset, setRemoteGameplayAsset] = useState<MediaAsset | null>(null);
  const [remoteGameplayUrl, setRemoteGameplayUrl] = useState('');
  const [voiceAsset, setVoiceAsset] = useState<BrainrotAudioAsset | null>(null);
  const [subtitleAsset, setSubtitleAsset] = useState<BrainrotSubtitleAsset | null>(null);
  const [gameplayStartOffset, setGameplayStartOffset] = useState(18);
  const [isPreparingGameplay, setIsPreparingGameplay] = useState(true);
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
  const [runPromptDraft, setRunPromptDraft] = useState(promptInput);
  const [runScriptGuidanceDraft, setRunScriptGuidanceDraft] = useState(scriptGuidance);
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
  const selectedTypePreset =
    BRAINROT_TYPE_PRESETS.find((preset) => preset.id === brainrotType) ?? BRAINROT_TYPE_PRESETS[0];
  const selectedCaptionPreset =
    BRAINROT_CAPTION_STYLE_PRESETS.find((preset) => preset.id === selectedCaptionPresetId) ??
    BRAINROT_CAPTION_STYLE_PRESETS[0];
  const selectedGameplayPreset =
    BRAINROT_GAMEPLAY_PRESETS.find((preset) => preset.id === selectedGameplayPresetId) ??
    BRAINROT_GAMEPLAY_PRESETS[0];
  const gameplayAsset =
    selectedGameplayPreset.source === 'remote' ? remoteGameplayAsset : localGameplayAsset;
  const selectedVoice =
    voices.find((voice) => voice.id === selectedVoiceId) ??
    voices[0] ??
    FALLBACK_BRAINROT_VOICE;
  const sortedVoices = sortVoicesByRecommendation(voices);
  const voiceSearchQuery = voiceSearchInput.trim().toLowerCase();
  const recommendedVoices = sortedVoices
    .filter((voice) => readVoiceLabel(voice, 'gender').toLowerCase() === 'male')
    .slice(0, 5);
  const filteredVoices = sortedVoices.filter((voice) => {
    const gender = readVoiceLabel(voice, 'gender').toLowerCase();
    const useCase = readVoiceLabel(voice, 'use_case').toLowerCase();
    const descriptive = readVoiceLabel(voice, 'descriptive').toLowerCase();

    if (voiceFilterMode === 'expressive-male' && gender !== 'male') {
      return false;
    }

    if (voiceFilterMode === 'recommended' && scoreVoice(voice) < 8) {
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
    gameplayStartOffset: safeGameplayOffset,
    manualScriptMode,
    manualCaptionMode,
  });
  const isRenderDirty = Boolean(generatedRender) && lastRunSignature !== runSignature;
  const canRun =
    Boolean(promptInput.trim() && selectedVoiceId) &&
    !isVoicesLoading &&
    !isResolvingGameplay &&
    (selectedGameplayPreset.source === 'remote'
      ? Boolean(gameplayAsset)
      : !isPreparingGameplay) &&
    renderState !== 'running';
  const scaledCanvasWidth = Math.round(canvasSize.width * canvasZoom);
  const scaledCanvasHeight = Math.round(canvasSize.height * canvasZoom);
  const zoomLabel = `${Math.round(canvasZoom * 100)}%`;
  const captionGuideSourceText = buildCaptionGuideSourceText({
    captionText,
    scriptDraft,
    generatedScript: lastGeneratedScript ?? generatedRender?.script ?? null,
  });
  const captionGuideLines = splitCaptionGuideLines(captionGuideSourceText);
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
      const rankedVoices = sortVoicesByRecommendation(response.voices);
      const recommendedVoiceId = pickRecommendedVoiceId(rankedVoices);
      setVoices(rankedVoices);
      setSelectedVoiceId((current) =>
        rankedVoices.some((voice) => voice.id === current) ? current : recommendedVoiceId
      );
      setVoicesWarning(response.warning || '');
      appendLog(
        response.warning
          ? `Voices loaded with fallback data: ${response.warning}`
          : `Loaded ${response.voices.length} ElevenLabs voice options and ranked the expressive male picks first.`,
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

  useEffect(() => {
    if (dependenciesBootedRef.current) {
      return;
    }

    dependenciesBootedRef.current = true;
    void Promise.allSettled([prepareGameplay({ quiet: false }), loadVoices()]);
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
        ? `${selectedTypePreset.label} queued for a ${targetDurationSeconds}s reel.`
        : 'Choose the brain rot type and describe what the reel should say.',
      code: 'prompt -> brainrotType -> promptInput',
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
          : `${selectedVoice.name} is selected for the AI narration.`,
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
      summary: isPreparingGameplay
        ? 'Preparing the built-in Subway gameplay bed from src/assets.'
        : gameplayAsset
          ? `${selectedGameplayPreset.label} is ready under the voiceover.`
          : selectedGameplayPreset.source === 'remote'
            ? 'Attach a remote gameplay URL to complete this node.'
            : 'Gameplay prep failed. Retry this node.',
      code: 'GET /api/prepare-brainrot-gameplay',
      status: isPreparingGameplay
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
      summary: `${selectedCaptionPreset.label} • timed Cloudinary subtitles from the AI script`,
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

  if (!session) {
    return <Navigate replace to="/login" />;
  }

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

  const handleAddCustomNode = () => {
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
      title: `Custom node ${customNodeCount + 1}`,
      body: 'Describe an extra note, a QA check, or a future branch.',
      color: '#06b6d4',
    };

    setCanvasNodes((current) => [...current, nextNode]);
    setSelectedNode(nextNode.id);
    setStatusMessage('Custom node added to the freeform canvas.');
    appendLog('Custom node added to the canvas.', 'success');
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
    setSelectedNode('render');
    setStatusMessage('Custom node removed from the freeform canvas.');
    appendLog('Custom node removed from the canvas.', 'warn');
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

    if (preset.source === 'local' && !localGameplayAsset && !isPreparingGameplay) {
      void prepareGameplay();
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

  const handleCaptionEditorPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    const editor = captionLayoutEditorRef.current;

    if (!editor) {
      return;
    }

    const rect = editor.getBoundingClientRect();
    captionEditorStateRef.current = {
      mode: 'move',
      startClientX: event.clientX,
      startClientY: event.clientY,
      startHorizontalOffset: captionStyle.horizontalOffset,
      startVerticalOffset: captionStyle.verticalOffset,
      editorWidth: rect.width,
      editorHeight: rect.height,
    };

    event.preventDefault();
  };

  const handleCaptionResizePointerDown = (event: ReactPointerEvent<HTMLButtonElement>) => {
    captionEditorStateRef.current = {
      mode: 'resize',
      startClientX: event.clientX,
      startClientY: event.clientY,
      startFontSize: captionStyle.fontSize,
    };

    event.preventDefault();
    event.stopPropagation();
  };

  const handleResetCaptionLayout = () => {
    setCaptionStyle((current) => ({
      ...current,
      placement: 'center',
      horizontalOffset: 0,
      verticalOffset: DEFAULT_BRAINROT_CAPTION_STYLE.verticalOffset,
      fontSize: DEFAULT_BRAINROT_CAPTION_STYLE.fontSize,
    }));
    appendLog('Caption layout reset to the default stage position.', 'info');
  };

  const openRunDialog = () => {
    if (renderState === 'running') {
      return;
    }

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
      setSelectedNode('gameplay');
      setStatusMessage('Attach a remote gameplay feed before running the pipeline.');
      appendLog('Run blocked because the custom remote gameplay node is still empty.', 'error');
      return;
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
        seed: `${brainrotType}-${effectiveScript.title}`,
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
            Math.max(targetDurationSeconds, Math.ceil(measuredVoiceDuration + 1)),
            TARGET_DURATION_MIN,
            Math.max(TARGET_DURATION_MIN, Math.floor(ensuredGameplay.duration))
          )
        : Math.max(targetDurationSeconds, Math.ceil(measuredVoiceDuration + 1));

      setActiveRunStage('gameplay');
      setSelectedNode('gameplay');
      appendLog(
        selectedGameplayPreset.source === 'remote'
          ? 'Gameplay bed ready. Reusing the attached remote gameplay feed.'
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
          seed: `${brainrotType}-${effectiveScript.title}`,
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
                  Core nodes drive execution. Custom nodes are freeform notes. The stage is bounded,
                  so nothing disappears off-canvas. Use +/- or pinch with trackpad to zoom.
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
                        />
                      ) : (
                        <CanvasCustomNode
                          key={node.id}
                          node={node}
                          isSelected={selectedNode === node.id}
                          onPointerDown={handleNodePointerDown}
                          onSelect={setSelectedNode}
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

          <article className="brainrot-surface">
            <div className="brainrot-surface__header">
              <div>
                <span className="brainrot-surface__eyebrow">Inspector</span>
                <h2>
                  {selectedCoreStage
                    ? coreFlowMap[selectedCoreStage].title
                    : selectedCustomNode?.title ?? 'Node'}
                </h2>
                <p>
                  {selectedCoreStage
                    ? coreFlowMap[selectedCoreStage].summary
                    : 'Edit the freeform note, move it, or remove it from the canvas.'}
                </p>
              </div>
              {selectedCoreStage ? (
                <code className="brainrot-inspector__code">
                  {coreFlowMap[selectedCoreStage].code}
                </code>
              ) : null}
            </div>

            {selectedCoreStage === 'prompt' ? (
              <div className="brainrot-inspector__body brainrot-form-grid">
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
                  <span>Target duration</span>
                  <strong>{targetDurationSeconds} seconds</strong>
                  <p>Gemini and the final reel now both aim for this length range.</p>
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
                      if (!manualScriptMode) {
                        setScriptDraft('');
                        setLastGeneratedScript(null);
                      }
                    }}
                    placeholder="Describe the idea, angle, or claim the brain rot reel should cover."
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

                {selectedGameplayPreset.source === 'remote' ? (
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
                )}

                <div className="brainrot-preview-card">
                  {gameplayAsset ? (
                    <video autoPlay loop muted playsInline src={gameplayPreviewUrl} />
                  ) : (
                    <div className="brainrot-empty-state">
                      {selectedGameplayPreset.source === 'remote'
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
                    Remote gameplay feeds start from the head of the resolved clip unless their
                    duration is known.
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
                      {selectedGameplayPreset.source === 'remote'
                        ? 'Remote gameplay feed'
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
                        <strong style={{ fontFamily: preset.previewFontFamily }}>
                          {preset.label}
                        </strong>
                      </div>
                      <p>{preset.description}</p>
                    </button>
                  ))}
                </div>

                <div className="brainrot-static-card">
                  <span>Caption mode</span>
                  <strong>Timed captions from the Gemini script</strong>
                  <p>
                    The script becomes a Cloudinary subtitle track. The hook below is kept for the
                    node summary and as the fallback if subtitle generation fails.
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
                  <strong>Drag the caption box over the Subway Surfers preview, then resize it</strong>
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
                      Gameplay preview will appear here once the Subway Surfers bed is ready.
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
                      backgroundColor: withAlpha(captionStyle.backgroundColor, 0.82),
                      fontFamily: resolveCaptionGuideFontFamily(captionStyle.fontFamily),
                      fontSize: `${captionGuideFontSize}px`,
                      fontWeight: captionStyle.fontWeight,
                      boxShadow: `0 24px 60px ${withAlpha(captionStyle.backgroundColor, 0.28)}`,
                    }}
                    onPointerDown={handleCaptionEditorPointerDown}
                  >
                    <span className="brainrot-caption-stage__tag">Drag caption</span>
                    <span className="brainrot-caption-stage__body">
                      {captionGuideLines.join('\n')}
                    </span>
                    <button
                      className="brainrot-caption-stage__resize"
                      type="button"
                      onPointerDown={handleCaptionResizePointerDown}
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

                <label className="brainrot-form-field">
                  <span>Font family</span>
                  <select
                    value={captionStyle.fontFamily}
                    onChange={(event) =>
                      setCaptionStyle((current) => ({
                        ...current,
                        fontFamily: event.target.value as BrainrotCaptionStyle['fontFamily'],
                      }))
                    }
                  >
                    {BRAINROT_FONT_OPTIONS.map((font) => (
                      <option key={font} value={font}>
                        {font}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="brainrot-form-field">
                  <span>Font weight</span>
                  <select
                    value={captionStyle.fontWeight}
                    onChange={(event) =>
                      setCaptionStyle((current) => ({
                        ...current,
                        fontWeight: event.target.value as BrainrotCaptionStyle['fontWeight'],
                      }))
                    }
                  >
                    <option value="bold">Bold</option>
                    <option value="normal">Normal</option>
                  </select>
                </label>

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
                    <span>Caption background</span>
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
          </article>
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
                  {selectedGameplayPreset.source === 'remote'
                    ? 'Using the attached remote gameplay feed.'
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
          className="brainrot-modal-backdrop"
          onClick={(event) => {
            if (event.target === event.currentTarget) {
              setIsRunDialogOpen(false);
            }
          }}
          role="presentation"
        >
          <div
            aria-labelledby="brainrot-run-dialog-title"
            aria-modal="true"
            className="brainrot-modal"
            role="dialog"
          >
            <div className="brainrot-modal__header">
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

            <div className="brainrot-modal__body brainrot-form-grid">
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

            <div className="brainrot-modal__actions">
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
