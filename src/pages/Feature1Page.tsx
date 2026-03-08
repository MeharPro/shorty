import { useCallback, useEffect, useMemo, useState, type MouseEvent as ReactMouseEvent } from 'react';
import { Link, Navigate } from 'react-router-dom';
import boltLogo from '../assets/bolt-logo.png';
import {
  UploadWidget,
  type CloudinaryUploadResult,
} from '../cloudinary/UploadWidget';

import { buildPlayableSourceUrl, createMediaAssetFromUpload } from '../lib/rendering';
import {
  loadReelHistory,
  saveReelHistory,
  loadUploadHistory,
  saveUploadHistory,
  loadTranscript,
  loadTranscriptData,
  saveTranscript,
  saveTranscriptData,
  type UploadHistoryItem,
} from '../lib/persistence';
import { buildCaptionCues } from '../lib/captions';
import { generateReels } from '../lib/reels';
import { auditGeneratedClips, chooseRecommendedClip } from '../lib/reelQualityAudit';
import { analyzeVideoExpressions } from '../lib/visualAnalysis';
import {
  fetchReelHistory,
  hasSupabaseBrowserConfig,
  persistReelHistoryEntry,
} from '../lib/supabase';
import { AgentChatPanel } from '../components/agent/AgentChatPanel';
import { WorkflowSidebarTabs } from '../components/agent/WorkflowSidebarTabs';
import { FaceDetectVideo } from '../components/FaceDetectVideo';
import { buildFeature1WorkflowGraph } from '../lib/agent/feature1Adapter';
import { downloadJsonFile } from '../lib/agent/export';
import type { AgentCommandResponse, CustomBlockDefinition } from '../lib/agent/types';
import { useWorkflowAgent } from '../lib/agent/useWorkflowAgent';
import { transcribeVideo } from '../lib/transcription';
import type { ShortySession } from '../lib/session';
import type {
  MediaAsset,
  Feature1EditingAdvice,
  ReelGenerationResponse,
  ReelHistoryEntry,
  VideoTranscriptionResponse,
  VisualAnalysisSummary,
} from '../types';

interface Feature1PageProps {
  session: ShortySession | null;
}

type CoreNodeId = 'upload' | 'transcribe' | 'generate' | 'hook-filter' | 'results';
type NodeStatus = 'locked' | 'available' | 'active' | 'completed';
type LogicBlockType =
  | 'hook-filter'
  | 'caption-pass'
  | 'viral-score'
  | 'voiceover'
  | 'brand-safety'
  | 'export-split';

type DragState =
  | null
  | {
    mode: 'pan';
    startX: number;
    startY: number;
    originX: number;
    originY: number;
  }
  | {
    mode: 'core';
    nodeId: CoreNodeId;
    startX: number;
    startY: number;
    originX: number;
    originY: number;
  }
  | {
    mode: 'logic';
    nodeId: string;
    startX: number;
    startY: number;
    originX: number;
    originY: number;
  };

interface CoreFlowNode {
  id: CoreNodeId;
  label: string;
  icon: string;
  description: string;
  x: number;
  y: number;
}

interface LogicBlockTemplate {
  type: LogicBlockType;
  label: string;
  icon: string;
  description: string;
  tint: 'purple' | 'cyan' | 'green' | 'orange';
}

interface LogicBlock extends LogicBlockTemplate {
  id: string;
  attachTo: CoreNodeId;
  x: number;
  y: number;
  note: string;
  agentBlock?: CustomBlockDefinition | null;
}

interface ConnectorPath {
  key: string;
  d: string;
  done?: boolean;
  accent?: LogicBlockTemplate['tint'];
}

const CORE_NODE_WIDTH = 220;
const CORE_NODE_HEIGHT = 116;
const LOGIC_NODE_WIDTH = 220;
const DEFAULT_VIEWPORT_OFFSET = { x: 120, y: 120 };
const WORKFLOW_AGENT_ENABLED = import.meta.env.VITE_ENABLE_WORKFLOW_AGENT !== 'false';

const CORE_SEQUENCE: CoreNodeId[] = ['upload', 'transcribe', 'generate', 'hook-filter', 'results'];

const GENERATE_STAGES = [
  { label: 'Scanning facial expressions…', duration: 400 },
  { label: 'Analyzing transcript…', duration: 1200 },
  { label: 'Finding viral moments…', duration: 1400 },
  { label: 'Scoring hooks…', duration: 1000 },
  { label: 'Building clips…', duration: 800 },
  { label: 'Ranking by virality…', duration: 600 },
];

const FEATURE1_VIDEO_UPLOAD_FORMATS = ['mp4', 'mov', 'm4v', 'webm'];

function collectUniqueUrls(values: Array<string | null | undefined>): string[] {
  const seen = new Set<string>();
  const urls: string[] = [];

  for (const value of values) {
    if (!value || seen.has(value)) {
      continue;
    }

    seen.add(value);
    urls.push(value);
  }

  return urls;
}

const INITIAL_CORE_NODES: CoreFlowNode[] = [
  { id: 'upload', label: 'Upload', icon: '📤', description: 'Add source video', x: 80, y: 120 },
  { id: 'transcribe', label: 'Transcribe', icon: '📝', description: 'Extract transcript', x: 360, y: 120 },
  { id: 'generate', label: 'Generate', icon: '⚡', description: 'Create reels', x: 640, y: 120 },
  { id: 'hook-filter', label: 'Hook Filter', icon: '🪝', description: 'Review hooks', x: 920, y: 120 },
  { id: 'results', label: 'Results', icon: '🏆', description: 'View ranked clips', x: 1200, y: 120 },
];

const LOGIC_BLOCK_LIBRARY: LogicBlockTemplate[] = [
  {
    type: 'hook-filter',
    label: 'Hook Filter',
    icon: '🪝',
    description: 'Insert a scoring layer for stronger first-three-second hooks.',
    tint: 'purple',
  },
  {
    type: 'caption-pass',
    label: 'Caption Logic',
    icon: '💬',
    description: 'Add caption cleanup, highlight words, and pacing rules.',
    tint: 'cyan',
  },
  {
    type: 'viral-score',
    label: 'Virality Ranker',
    icon: '📈',
    description: 'Blend transcript, pacing, emotion, and visual scores.',
    tint: 'green',
  },
  {
    type: 'voiceover',
    label: 'Voiceover Stage',
    icon: '🎙',
    description: 'Optional logic block for AI voice passes or narration layers.',
    tint: 'orange',
  },
  {
    type: 'brand-safety',
    label: 'Safety Review',
    icon: '🛡',
    description: 'Moderation and content-fit gate before publishing.',
    tint: 'cyan',
  },
  {
    type: 'export-split',
    label: 'Variant Export',
    icon: '🧩',
    description: 'Fan out one winning reel into multiple export variants.',
    tint: 'orange',
  },
];

function createInitialLogicBlocks(): LogicBlock[] {
  return [
    {
      ...LOGIC_BLOCK_LIBRARY[0],
      id: 'logic-hook-filter-default',
      attachTo: 'generate',
      x: 760,
      y: 300,
      note: 'Great place to drop prompt-level ranking logic next.',
    },
    {
      ...LOGIC_BLOCK_LIBRARY[1],
      id: 'logic-caption-pass-default',
      attachTo: 'results',
      x: 1080,
      y: 300,
      note: 'Use this for stylized subtitles or post-processing rules.',
    },
  ];
}

const AGENT_BLOCK_ATTACHMENTS: Record<LogicBlockType, CoreNodeId> = {
  'hook-filter': 'generate',
  'caption-pass': 'results',
  'viral-score': 'generate',
  voiceover: 'generate',
  'brand-safety': 'results',
  'export-split': 'results',
};

function getAgentBlockCoordinates(blocks: LogicBlock[], attachTo: CoreNodeId, excludeId?: string) {
  const siblings = blocks.filter(
    (block) => block.attachTo === attachTo && (!excludeId || block.id !== excludeId)
  ).length;

  return {
    x: attachTo === 'generate' ? 760 + siblings * 48 : 1080 + siblings * 48,
    y: 300 + siblings * 70,
  };
}

function isCoreNodeId(value: string): value is CoreNodeId {
  return CORE_SEQUENCE.includes(value as CoreNodeId);
}

function pickFeature1LogicTemplate(block: CustomBlockDefinition): LogicBlockTemplate {
  const kind = `${block.blockKind} ${block.blockName}`.toLowerCase();
  if (kind.includes('caption')) {
    return LOGIC_BLOCK_LIBRARY.find((item) => item.type === 'caption-pass') ?? LOGIC_BLOCK_LIBRARY[1];
  }
  if (kind.includes('voice')) {
    return LOGIC_BLOCK_LIBRARY.find((item) => item.type === 'voiceover') ?? LOGIC_BLOCK_LIBRARY[3];
  }
  if (kind.includes('safety')) {
    return LOGIC_BLOCK_LIBRARY.find((item) => item.type === 'brand-safety') ?? LOGIC_BLOCK_LIBRARY[4];
  }
  if (kind.includes('export') || kind.includes('variant')) {
    return LOGIC_BLOCK_LIBRARY.find((item) => item.type === 'export-split') ?? LOGIC_BLOCK_LIBRARY[5];
  }
  if (kind.includes('retention') || kind.includes('viral')) {
    return LOGIC_BLOCK_LIBRARY.find((item) => item.type === 'viral-score') ?? LOGIC_BLOCK_LIBRARY[2];
  }
  return LOGIC_BLOCK_LIBRARY.find((item) => item.type === 'hook-filter') ?? LOGIC_BLOCK_LIBRARY[0];
}

function createFeature1AgentLogicBlock(
  block: CustomBlockDefinition,
  currentBlocks: LogicBlock[]
): LogicBlock {
  const template = pickFeature1LogicTemplate(block);
  const preferredAttachment = block.provenance.backingCoreNodes.find((nodeId) =>
    isCoreNodeId(nodeId)
  );
  const attachTo = preferredAttachment ? preferredAttachment : AGENT_BLOCK_ATTACHMENTS[template.type];
  const position = getAgentBlockCoordinates(currentBlocks, attachTo);

  return {
    ...template,
    id: `logic-${template.type}-${crypto.randomUUID()}`,
    label: block.blockName,
    description: block.description,
    attachTo,
    x: position.x,
    y: position.y,
    note: block.internalPlan.join(' '),
    agentBlock: block,
  };
}

function formatScore(value: number): string {
  return `${Math.round(value)}/100`;
}

function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const remaining = Math.round(seconds % 60);
  return `${mins}:${remaining.toString().padStart(2, '0')}`;
}

function connectorPath(
  fromX: number,
  fromY: number,
  toX: number,
  toY: number
): string {
  const curve = Math.max(80, Math.abs(toX - fromX) * 0.45);
  return `M ${fromX} ${fromY} C ${fromX + curve} ${fromY}, ${toX - curve} ${toY}, ${toX} ${toY} `;
}

export function Feature1Page({ session }: Feature1PageProps) {
  const sessionUserKey = session?.userKey;
  const [activeCoreNode, setActiveCoreNode] = useState<CoreNodeId>('upload');
  const [coreNodes, setCoreNodes] = useState<CoreFlowNode[]>(INITIAL_CORE_NODES);
  const [logicBlocks, setLogicBlocks] = useState<LogicBlock[]>(() => createInitialLogicBlocks());
  const [selectedLogicBlockId, setSelectedLogicBlockId] = useState<string | null>(null);
  const [viewportOffset, setViewportOffset] = useState(DEFAULT_VIEWPORT_OFFSET);
  const [dragState, setDragState] = useState<DragState>(null);

  const [sourceAsset, setSourceAsset] = useState<MediaAsset | null>(null);

  const [transcriptText, setTranscriptText] = useState('');
  const [transcriptionPublicId, setTranscriptionPublicId] = useState('');
  const [transcriptionLanguage, setTranscriptionLanguage] = useState('');
  const [transcriptionDetails, setTranscriptionDetails] = useState<VideoTranscriptionResponse | null>(null);
  const [isTranscribing, setIsTranscribing] = useState(false);

  const [isGenerating, setIsGenerating] = useState(false);
  const [generateStage, setGenerateStage] = useState(0);
  const [result, setResult] = useState<ReelGenerationResponse | null>(null);
  const [filteredClipIds, setFilteredClipIds] = useState<Set<string>>(new Set());
  const [visualAnalysis, setVisualAnalysis] = useState<VisualAnalysisSummary | null>(null);

  // Editing options
  const [editRemoveSilences, setEditRemoveSilences] = useState(true);
  const [editShakingCaptions, setEditShakingCaptions] = useState(true);
  const [editFaceFocus, setEditFaceFocus] = useState(true);
  const [editSafeFaceFrame, setEditSafeFaceFrame] = useState(true);
  const [agentFocusPreference, setAgentFocusPreference] =
    useState<Feature1EditingAdvice['focusPreference']>('auto');
  const [agentCameraMotionPreference, setAgentCameraMotionPreference] =
    useState<Feature1EditingAdvice['cameraMotionPreference']>('auto');
  const [agentCaptionDensity, setAgentCaptionDensity] =
    useState<Feature1EditingAdvice['captionDensity']>('balanced');
  const [agentViralStyle, setAgentViralStyle] =
    useState<Feature1EditingAdvice['viralStyle']>('balanced');
  const [agentVariantCount, setAgentVariantCount] = useState(1);
  const [pendingAgentExecution, setPendingAgentExecution] = useState<{
    shouldTranscribe: boolean;
    shouldRun: boolean;
    notes: string[];
  } | null>(null);

  const [history, setHistory] = useState<ReelHistoryEntry[]>([]);
  const [errorMessage, setErrorMessage] = useState('');
  const [statusMessage, setStatusMessage] = useState('');

  const sourcePreviewUrl = sourceAsset ? buildPlayableSourceUrl(sourceAsset) : null;
  const hasSource = !!sourceAsset;

  const getNodeStatus = useCallback(
    (id: CoreNodeId): NodeStatus => {
      if (id === activeCoreNode) return 'active';

      const activeIndex = CORE_SEQUENCE.indexOf(activeCoreNode);
      const currentIndex = CORE_SEQUENCE.indexOf(id);

      if (currentIndex < activeIndex) return 'completed';
      if (id === 'transcribe' && hasSource) return 'available';
      if (id === 'generate' && hasSource) return 'available';
      if (id === 'results' && result) return 'available';

      return 'locked';
    },
    [activeCoreNode, hasSource, result]
  );

  useEffect(() => {
    if (!session) {
      return undefined;
    }

    let isMounted = true;
    const localHistory = loadReelHistory(sessionUserKey);
    setHistory(localHistory);

    if (!hasSupabaseBrowserConfig || !session.userId) {
      return () => {
        isMounted = false;
      };
    }

    void fetchReelHistory(session.userId).then((response) => {
      if (!isMounted) return;
      if (response.ok) {
        setHistory(response.entries);
        saveReelHistory(sessionUserKey, response.entries);
      }
    });

    return () => {
      isMounted = false;
    };
  }, [session, sessionUserKey, session?.userId]);

  useEffect(() => {
    if (!dragState) return undefined;

    const handleMouseMove = (event: MouseEvent) => {
      const dx = event.clientX - dragState.startX;
      const dy = event.clientY - dragState.startY;

      if (dragState.mode === 'pan') {
        setViewportOffset({
          x: dragState.originX + dx,
          y: dragState.originY + dy,
        });
        return;
      }

      if (dragState.mode === 'core') {
        setCoreNodes((current) =>
          current.map((node) =>
            node.id === dragState.nodeId
              ? { ...node, x: dragState.originX + dx, y: dragState.originY + dy }
              : node
          )
        );
        return;
      }

      setLogicBlocks((current) =>
        current.map((block) =>
          block.id === dragState.nodeId
            ? { ...block, x: dragState.originX + dx, y: dragState.originY + dy }
            : block
        )
      );
    };

    const handleMouseUp = () => {
      setDragState(null);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [dragState]);

  const coreNodeMap = useMemo(
    () => Object.fromEntries(coreNodes.map((node) => [node.id, node])) as Record<CoreNodeId, CoreFlowNode>,
    [coreNodes]
  );

  const connectorPaths = useMemo<ConnectorPath[]>(() => {
    const corePaths = CORE_SEQUENCE.slice(0, -1).map((fromId, index) => {
      const toId = CORE_SEQUENCE[index + 1];
      const fromNode = coreNodeMap[fromId];
      const toNode = coreNodeMap[toId];

      return {
        key: `${fromId}-${toId}`,
        d: connectorPath(
          fromNode.x + viewportOffset.x + CORE_NODE_WIDTH,
          fromNode.y + viewportOffset.y + CORE_NODE_HEIGHT / 2,
          toNode.x + viewportOffset.x,
          toNode.y + viewportOffset.y + CORE_NODE_HEIGHT / 2
        ),
        done: getNodeStatus(fromId) === 'completed',
      };
    });

    const logicPaths = logicBlocks.map((block) => {
      const parent = coreNodeMap[block.attachTo];
      return {
        key: `${block.attachTo}-${block.id}`,
        d: connectorPath(
          parent.x + viewportOffset.x + CORE_NODE_WIDTH / 2,
          parent.y + viewportOffset.y + CORE_NODE_HEIGHT,
          block.x + viewportOffset.x + LOGIC_NODE_WIDTH / 2,
          block.y + viewportOffset.y
        ),
        accent: block.tint,
      };
    });

    return [...corePaths, ...logicPaths];
  }, [coreNodeMap, getNodeStatus, logicBlocks, viewportOffset]);

  const selectedLogicBlock = logicBlocks.find((block) => block.id === selectedLogicBlockId) ?? null;
  const clipCaptionMap = useMemo(() => {
    if (!result || !transcriptionDetails?.segments?.length) {
      return new Map<string, ReturnType<typeof buildCaptionCues>>();
    }

    return new Map(
      result.clips.map((clip) => [
        clip.id,
        buildCaptionCues(transcriptionDetails.segments ?? [], {
          clipStart: clip.startOffset,
          clipDuration: clip.duration,
          maxWordsPerCue: agentCaptionDensity === 'tight' ? 2 : 3,
          maxCharsPerCue: agentCaptionDensity === 'tight' ? 12 : 18,
          maxCueDuration: agentCaptionDensity === 'tight' ? 1.2 : 1.8,
          maxLineChars: agentCaptionDensity === 'tight' ? 10 : 14,
          maxLinesPerCue: 2,
        }),
      ])
    );
  }, [agentCaptionDensity, result, transcriptionDetails]);

  const startPan = (event: ReactMouseEvent<HTMLDivElement>) => {
    if (event.target !== event.currentTarget) return;
    setSelectedLogicBlockId(null);
    setDragState({
      mode: 'pan',
      startX: event.clientX,
      startY: event.clientY,
      originX: viewportOffset.x,
      originY: viewportOffset.y,
    });
  };

  const startCoreDrag = (event: ReactMouseEvent<HTMLButtonElement>, node: CoreFlowNode) => {
    event.stopPropagation();
    setSelectedLogicBlockId(null);
    setActiveCoreNode(node.id);
    setDragState({
      mode: 'core',
      nodeId: node.id,
      startX: event.clientX,
      startY: event.clientY,
      originX: node.x,
      originY: node.y,
    });
  };

  const startLogicDrag = (event: ReactMouseEvent<HTMLButtonElement>, block: LogicBlock) => {
    event.stopPropagation();
    setSelectedLogicBlockId(block.id);
    setDragState({
      mode: 'logic',
      nodeId: block.id,
      startX: event.clientX,
      startY: event.clientY,
      originX: block.x,
      originY: block.y,
    });
  };

  const addLogicBlock = (type: LogicBlockType) => {
    const template = LOGIC_BLOCK_LIBRARY.find((item) => item.type === type);
    const anchor = coreNodeMap[activeCoreNode];
    if (!template || !anchor) return;

    const siblings = logicBlocks.filter((block) => block.attachTo === activeCoreNode).length;
    const id = `logic-${type}-${crypto.randomUUID()}`;

    const nextBlock: LogicBlock = {
      ...template,
      id,
      attachTo: activeCoreNode,
      x: anchor.x + 40,
      y: anchor.y + 180 + siblings * 126,
      note: `Attached to ${anchor.label}. Drag to reposition and expand workflow logic.`,
    };

    setLogicBlocks((current) => [...current, nextBlock]);
    setSelectedLogicBlockId(id);
    setStatusMessage(`${template.label} block added to the workflow.`);
  };

  const removeSelectedLogicBlock = () => {
    if (!selectedLogicBlock) return;
    setLogicBlocks((current) => current.filter((block) => block.id !== selectedLogicBlock.id));
    setSelectedLogicBlockId(null);
    setStatusMessage(`${selectedLogicBlock.label} removed from the workflow.`);
  };

  const updateSelectedLogicBlock = (patch: Partial<LogicBlock>) => {
    if (!selectedLogicBlock) return;
    setLogicBlocks((current) =>
      current.map((block) => (block.id === selectedLogicBlock.id ? { ...block, ...patch } : block))
    );
  };

  const resetViewport = () => {
    setViewportOffset(DEFAULT_VIEWPORT_OFFSET);
    setStatusMessage('Flow viewport recentered.');
  };

  const [uploadHistory, setUploadHistory] = useState<UploadHistoryItem[]>(() =>
    loadUploadHistory(sessionUserKey)
  );

  useEffect(() => {
    setUploadHistory(loadUploadHistory(sessionUserKey));
  }, [sessionUserKey]);

  const resetGeneratedState = useCallback(() => {
    setResult(null);
    setFilteredClipIds(new Set());
    setVisualAnalysis(null);
  }, []);

  const handleSourceUploadSuccess = (uploadResult: CloudinaryUploadResult) => {
    const asset = createMediaAssetFromUpload(uploadResult, uploadResult.original_filename || 'Uploaded Video');
    setSourceAsset(asset);
    setTranscriptionPublicId(uploadResult.public_id);
    resetGeneratedState();
    setStatusMessage('Video uploaded!');

    // Save to upload history
    const historyItem: UploadHistoryItem = {
      id: asset.id,
      publicId: uploadResult.public_id,
      secureUrl: uploadResult.secure_url,
      label: uploadResult.original_filename || 'Uploaded Video',
      duration: uploadResult.duration,
      thumbnailUrl: uploadResult.secure_url?.replace('/video/upload/', '/video/upload/w_240,h_135,c_fill,so_0/').replace(/\.[^.]+$/, '.jpg'),
      uploadedAt: new Date().toISOString(),
    };
    const next = [historyItem, ...uploadHistory.filter(h => h.publicId !== uploadResult.public_id)].slice(0, 10);
    setUploadHistory(next);
    saveUploadHistory(next, sessionUserKey);
  };

  const handleSelectFromHistory = (item: UploadHistoryItem) => {
    const asset: MediaAsset = {
      id: item.id,
      label: item.label,
      publicId: item.publicId,
      secureUrl: item.secureUrl,
      source: 'upload',
      resourceType: 'video',
      strategy: 'cloudinary-public-id',
      duration: item.duration,
    };
    setSourceAsset(asset);
    setTranscriptionPublicId(item.publicId);
    resetGeneratedState();
    // Load any saved transcript for this video
    const saved = sessionUserKey
      ? loadTranscriptData(sessionUserKey, item.publicId)
      : loadTranscriptData(item.publicId);
    if (saved?.transcript) {
      setTranscriptText(saved.transcript);
      setTranscriptionDetails((current) => ({
        transcript: saved.transcript,
        provider: saved.provider || current?.provider || 'cloudinary',
        model: saved.model || current?.model || 'auto_transcription',
        publicId: item.publicId,
        sourceUrl: saved.transcriptUrl || current?.sourceUrl || '',
        transcriptUrl: saved.transcriptUrl || current?.transcriptUrl,
        segments: saved.segments,
        generatedAt: saved.generatedAt || current?.generatedAt || new Date().toISOString(),
      }));
      setStatusMessage(`Loaded "${item.label}" with saved transcript.`);
    } else {
      setTranscriptText(
        sessionUserKey ? loadTranscript(sessionUserKey, item.publicId) : loadTranscript(item.publicId)
      );
      setTranscriptionDetails(null);
      setStatusMessage(`Loaded "${item.label}" from recent uploads.`);
    }
  };

  const handleSourceUploadError = (error: Error) => {
    setErrorMessage(error.message || 'Upload failed.');
  };



  const handleTranscribe = async () => {
    const publicId = transcriptionPublicId.trim();
    if (!publicId) {
      setErrorMessage('Enter a Cloudinary public ID to run transcription.');
      return;
    }

    setIsTranscribing(true);
    setErrorMessage('');
    try {
      const response = await transcribeVideo({
        sourceAsset: null,
        googleDriveUrl: '',
        publicId,
        language: transcriptionLanguage.trim() || undefined,
      });
      setTranscriptText(response.transcript);
      setTranscriptionDetails(response);
      if (sessionUserKey) {
        saveTranscriptData(sessionUserKey, publicId, response);
      } else {
        saveTranscriptData(publicId, response);
      }
      setStatusMessage(`Cloudinary transcript loaded for ${response.publicId || publicId}.`);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Failed to transcribe.');
    } finally {
      setIsTranscribing(false);
    }
  };

  const currentEditingOptions: Feature1EditingAdvice = {
    removeSilences: editRemoveSilences,
    shakingCaptions: editShakingCaptions,
    faceFocus: editFaceFocus,
    safeFaceFrame: editSafeFaceFrame,
    focusPreference: agentFocusPreference,
    cameraMotionPreference: agentCameraMotionPreference,
    captionDensity: agentCaptionDensity,
    viralStyle: agentViralStyle,
    qaEnabled: true,
  };

  const handleGenerate = async () => {
    if (!session) {
      return;
    }

    setIsGenerating(true);
    setGenerateStage(0);
    setErrorMessage('');

    try {
      let resolvedVisualAnalysis = visualAnalysis;

      if (
        sourcePreviewUrl &&
        (!resolvedVisualAnalysis || resolvedVisualAnalysis.sourcePublicId !== sourceAsset?.publicId)
      ) {
        try {
          resolvedVisualAnalysis = await analyzeVideoExpressions({
            src: sourcePreviewUrl,
            duration: sourceAsset?.duration,
            sourcePublicId: sourceAsset?.publicId,
          });
          setVisualAnalysis(resolvedVisualAnalysis);
        } catch (analysisError) {
          setStatusMessage(
            analysisError instanceof Error
              ? `${analysisError.message} Continuing with transcript and timeline scoring.`
              : 'MediaPipe expression scan skipped. Continuing with transcript and timeline scoring.'
          );
          resolvedVisualAnalysis = null;
          setVisualAnalysis(null);
        }
      }

      for (let i = 1; i < GENERATE_STAGES.length; i++) {
        setGenerateStage(i);
        await new Promise((resolve) => setTimeout(resolve, GENERATE_STAGES[i].duration));
      }

      const response = await generateReels({
        sourceAsset,
        googleDriveUrl: '',
        transcriptText: transcriptText.trim(),
        transcriptSegments: transcriptionDetails?.segments,
        visualAnalysis: resolvedVisualAnalysis,
        editingOptions: currentEditingOptions,
      });

      const auditedClips =
        currentEditingOptions.qaEnabled === false
          ? response.clips
          : await auditGeneratedClips(response.clips, currentEditingOptions);
      const auditedResponse: ReelGenerationResponse = {
        ...response,
        clips: auditedClips,
        recommendedClipId: chooseRecommendedClip(auditedClips, response.recommendedClipId),
      };

      const entry: ReelHistoryEntry = {
        id: crypto.randomUUID(),
        createdAt: new Date().toISOString(),
        sourceLabel: sourceAsset?.label || 'Uploaded video',
        recommendedClipId: auditedResponse.recommendedClipId,
        result: auditedResponse,
      };

      const nextHistory = [entry, ...history].slice(0, 10);
      setHistory(nextHistory);
      saveReelHistory(sessionUserKey, nextHistory);
      if (hasSupabaseBrowserConfig && session.userId) {
        await persistReelHistoryEntry(session.userId, entry);
      }

      setResult(auditedResponse);
      setVisualAnalysis(auditedResponse.visualAnalysis ?? resolvedVisualAnalysis ?? null);
      // Auto-enable all clips in filter
      setFilteredClipIds(new Set(auditedResponse.clips.map((c) => c.id)));
      setActiveCoreNode('hook-filter');
      setStatusMessage(
        currentEditingOptions.qaEnabled === false
          ? 'Reels generated! Review hooks below.'
          : 'Reels generated and QA-checked for speaker framing.'
      );
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Failed to generate reels.');
    } finally {
      setIsGenerating(false);
      setGenerateStage(0);
    }
  };

  const toggleClipFilter = (clipId: string) => {
    setFilteredClipIds((prev) => {
      const next = new Set(prev);
      if (next.has(clipId)) {
        next.delete(clipId);
      } else {
        next.add(clipId);
      }
      return next;
    });
  };

  const buildCurrentWorkflowGraph = useCallback(
    () =>
      buildFeature1WorkflowGraph({
        activeCoreNode,
        selectedNodeId: selectedLogicBlockId ?? activeCoreNode,
        coreNodes,
        logicBlocks,
        editingOptions: currentEditingOptions,
        hasSource,
        hasTranscript: Boolean(transcriptText.trim()),
        hasResult: Boolean(result),
        clipCount: result?.clips.length ?? 0,
        recommendedClipId: result?.recommendedClipId ?? null,
      }),
    [
      activeCoreNode,
      coreNodes,
      currentEditingOptions,
      hasSource,
      logicBlocks,
      result,
      selectedLogicBlockId,
      transcriptText,
    ]
  );

  const applyFeature1AgentResponse = useCallback(
    async (response: AgentCommandResponse) => {
      if (!response.validation.ok) {
        throw new Error(response.validation.issues.join(' ') || 'Agent plan failed validation.');
      }

      const coreNodeIds = new Set(coreNodes.map((node) => node.id));
      const customNodeIds = new Set(logicBlocks.map((block) => block.id));
      const validationIssues: string[] = [];

      response.actions.forEach((action) => {
        if (action.type === 'set_active_stage' || action.type === 'update_node_params') {
          if (action.targetNodeId && !coreNodeIds.has(action.targetNodeId as CoreNodeId)) {
            validationIssues.push(`Unknown stage target: ${action.targetNodeId}`);
          }
        }

        if ((action.type === 'remove_custom_block' || action.type === 'update_custom_block') && action.targetNodeId) {
          if (!customNodeIds.has(action.targetNodeId)) {
            validationIssues.push(`Unknown custom block target: ${action.targetNodeId}`);
          }
        }

        if (action.type === 'create_custom_block' && !action.customBlock) {
          validationIssues.push('Planner requested a custom block without a definition.');
        }
      });

      if (validationIssues.length > 0) {
        throw new Error(validationIssues.join(' '));
      }

      let nextActiveCoreNode = activeCoreNode;
      let nextSelectedLogicBlockId = selectedLogicBlockId;
      let nextLogicBlocks = [...logicBlocks];
      let nextRemoveSilences = editRemoveSilences;
      let nextShakingCaptions = editShakingCaptions;
      let nextFaceFocus = editFaceFocus;
      let nextSafeFaceFrame = editSafeFaceFrame;
      let nextFocusPreference = agentFocusPreference;
      let nextCameraMotionPreference = agentCameraMotionPreference;
      let nextCaptionDensity = agentCaptionDensity;
      let nextViralStyle = agentViralStyle;
      let nextVariantCount = agentVariantCount;
      let nextTranscriptionPublicId = transcriptionPublicId.trim();
      let shouldTranscribe = response.execution.shouldTranscribe;
      let shouldRun = response.execution.shouldRun;

      response.actions.forEach((action) => {
        if (action.type === 'set_active_stage' && isCoreNodeId(action.targetNodeId || '')) {
          nextActiveCoreNode = action.targetNodeId as CoreNodeId;
          return;
        }

        if (action.type === 'set_variant_count') {
          nextVariantCount = Math.min(4, Math.max(1, Number(action.params?.count || 1)));
          return;
        }

        if (action.type === 'queue_transcription') {
          shouldTranscribe = true;
          return;
        }

        if (action.type === 'queue_execution') {
          shouldRun = true;
          return;
        }

        if (action.type === 'create_custom_block' && action.customBlock) {
          const nextBlock = createFeature1AgentLogicBlock(action.customBlock, nextLogicBlocks);
          nextLogicBlocks = [...nextLogicBlocks, nextBlock];
          nextSelectedLogicBlockId = nextBlock.id;
          nextActiveCoreNode =
            nextBlock.attachTo === 'results' && !result ? 'generate' : nextBlock.attachTo;
          return;
        }

        if (action.type === 'update_custom_block' && action.targetNodeId) {
          nextLogicBlocks = nextLogicBlocks.map((block) =>
            block.id === action.targetNodeId
              ? {
                  ...block,
                  label: typeof action.params?.label === 'string' ? action.params.label : block.label,
                  description:
                    typeof action.params?.description === 'string'
                      ? action.params.description
                      : block.description,
                  note: typeof action.params?.note === 'string' ? action.params.note : block.note,
                }
              : block
          );
          nextSelectedLogicBlockId = action.targetNodeId;
          return;
        }

        if (action.type === 'remove_custom_block' && action.targetNodeId) {
          nextLogicBlocks = nextLogicBlocks.filter((block) => block.id !== action.targetNodeId);
          if (nextSelectedLogicBlockId === action.targetNodeId) {
            nextSelectedLogicBlockId = null;
          }
          return;
        }

        if (action.type === 'update_node_params' && action.targetNodeId === 'generate') {
          if (typeof action.params?.removeSilences === 'boolean') {
            nextRemoveSilences = action.params.removeSilences;
          }
          if (typeof action.params?.shakingCaptions === 'boolean') {
            nextShakingCaptions = action.params.shakingCaptions;
          }
          if (typeof action.params?.faceFocus === 'boolean') {
            nextFaceFocus = action.params.faceFocus;
          }
          if (typeof action.params?.safeFaceFrame === 'boolean') {
            nextSafeFaceFrame = action.params.safeFaceFrame;
          }
          if (
            action.params?.focusPreference === 'auto' ||
            action.params?.focusPreference === 'speaker' ||
            action.params?.focusPreference === 'reaction' ||
            action.params?.focusPreference === 'group'
          ) {
            nextFocusPreference = action.params.focusPreference;
          }
          if (
            action.params?.cameraMotionPreference === 'auto' ||
            action.params?.cameraMotionPreference === 'steady' ||
            action.params?.cameraMotionPreference === 'dynamic' ||
            action.params?.cameraMotionPreference === 'shake'
          ) {
            nextCameraMotionPreference = action.params.cameraMotionPreference;
          }
          if (
            action.params?.captionDensity === 'tight' ||
            action.params?.captionDensity === 'balanced'
          ) {
            nextCaptionDensity = action.params.captionDensity;
          }
          if (
            action.params?.viralStyle === 'balanced' ||
            action.params?.viralStyle === 'aggressive'
          ) {
            nextViralStyle = action.params.viralStyle;
          }
        }
      });

      if (shouldTranscribe && !nextTranscriptionPublicId && sourceAsset?.publicId) {
        nextTranscriptionPublicId = sourceAsset.publicId;
      }

      setEditRemoveSilences(nextRemoveSilences);
      setEditShakingCaptions(nextShakingCaptions);
      setEditFaceFocus(nextFaceFocus);
      setEditSafeFaceFrame(nextSafeFaceFrame);
      setAgentFocusPreference(nextFocusPreference);
      setAgentCameraMotionPreference(nextCameraMotionPreference);
      setAgentCaptionDensity(nextCaptionDensity);
      setAgentViralStyle(nextViralStyle);
      setAgentVariantCount(nextVariantCount);
      setLogicBlocks(nextLogicBlocks);
      setSelectedLogicBlockId(nextSelectedLogicBlockId);
      setActiveCoreNode(nextActiveCoreNode);
      setTranscriptionPublicId(nextTranscriptionPublicId);
      setErrorMessage('');
      setStatusMessage(`Workflow agent updated Feature 1. ${response.summary}`);
      setPendingAgentExecution(
        shouldTranscribe || shouldRun
          ? {
              shouldTranscribe,
              shouldRun,
              notes: response.execution.notes,
            }
          : null
      );

      const executionSteps = [];
      if (shouldTranscribe) {
        executionSteps.push('transcription');
      }
      if (shouldRun) {
        executionSteps.push('generation');
      }

      return executionSteps.length > 0
        ? `Queued ${executionSteps.join(' and ')} through the current Feature 1 handlers.`
        : `Applied ${response.actions.length} validated workflow action${response.actions.length === 1 ? '' : 's'}.`;
    },
    [
      activeCoreNode,
      agentCameraMotionPreference,
      agentCaptionDensity,
      agentFocusPreference,
      agentVariantCount,
      agentViralStyle,
      coreNodes,
      editFaceFocus,
      editRemoveSilences,
      editSafeFaceFrame,
      editShakingCaptions,
      logicBlocks,
      result,
      selectedLogicBlockId,
      sourceAsset?.publicId,
      transcriptionPublicId,
    ]
  );

  const workflowAgent = useWorkflowAgent({
    feature: 'feature1',
    sessionUserKey,
    getWorkflowGraph: buildCurrentWorkflowGraph,
    applyResponse: applyFeature1AgentResponse,
  });

  useEffect(() => {
    if (!pendingAgentExecution) {
      return;
    }

    const execution = pendingAgentExecution;
    setPendingAgentExecution(null);

    void (async () => {
      if (execution.shouldTranscribe && transcriptionPublicId.trim()) {
        await handleTranscribe();
      } else if (execution.shouldTranscribe && !transcriptText.trim()) {
        setStatusMessage('Agent updated the graph, but transcription could not start because no Cloudinary source is selected.');
      }

      if (execution.shouldRun && sourceAsset) {
        await handleGenerate();
      } else if (execution.shouldRun && !sourceAsset) {
        setStatusMessage('Agent updated the graph, but generation could not start because no source video is loaded.');
      } else if (execution.notes.length) {
        setStatusMessage(execution.notes.join(' '));
      }
    })();
  }, [handleGenerate, handleTranscribe, pendingAgentExecution, sourceAsset, transcriptionPublicId, transcriptText]);

  const handleStartNew = () => {
    setActiveCoreNode('upload');
    setSourceAsset(null);
    setTranscriptText('');
    setTranscriptionPublicId('');
    setTranscriptionLanguage('');
    setTranscriptionDetails(null);
    setResult(null);
    setFilteredClipIds(new Set());
    setVisualAnalysis(null);
    setEditRemoveSilences(true);
    setEditShakingCaptions(true);
    setEditFaceFocus(true);
    setEditSafeFaceFrame(true);
    setAgentFocusPreference('auto');
    setAgentCameraMotionPreference('auto');
    setAgentCaptionDensity('balanced');
    setAgentViralStyle('balanced');
    setAgentVariantCount(1);
    setPendingAgentExecution(null);
    setErrorMessage('');
    setStatusMessage('');
  };

  if (!session) {
    return <Navigate replace to="/login" />;
  }

  const feature1Workflow = buildCurrentWorkflowGraph();

  return (
    <div className="feature-page feature-page--builder">
      <nav className="feature-page__nav">
        <Link className="feature-page__back" to="/app">
          ← Dashboard
        </Link>
        <Link className="dashboard__brand" to="/app">
          <span className="dashboard__brand-mark">
            <img alt="Shorty" src={boltLogo} />
          </span>
          <span className="dashboard__brand-name">Shorty</span>
        </Link>
      </nav>

      <div className="feature-page__header">
        <div className="feature-page__kicker">Feature 1 workflow canvas</div>
        <h1 className="feature-page__title">Dynamic reel-generation flowchart</h1>
        <p className="feature-page__desc">
          Drag blocks, pan the infinite grid, and add more logic stages as the reel workflow grows.
          The production actions still live inside the core nodes below.
        </p>
      </div>

      <section className="flow-workspace flow-workspace--opal">
        <aside className="flow-library">
          <div className="flow-library__list">
            {LOGIC_BLOCK_LIBRARY.map((block) => (
              <button
                key={block.type}
                className={`flow-library-card flow-library-card--${block.tint}`}
                type="button"
                onClick={() => addLogicBlock(block.type)}
              >
                <span className="flow-library-card__icon">{block.icon}</span>
                <span className="flow-library-card__copy">
                  <strong>{block.label}</strong>
                  <span>{block.description}</span>
                </span>
              </button>
            ))}
          </div>

          <div className="flow-library__footer">
            <button className="btn btn--ghost btn--sm" type="button" onClick={resetViewport}>
              Recenter canvas
            </button>
            <span>{logicBlocks.length} custom blocks active</span>
          </div>
        </aside>

        <div className="flow-canvas-shell">
          <div className="flow-canvas-shell__header">
            <div>
              <span className="feature-page__kicker">Canvas</span>
              <h2>Feature 1 workflow</h2>
            </div>
            <div className="flow-canvas-shell__meta">
              <span>Drag blocks</span>
              <span>Pan grid</span>
              <span>Extend logic</span>
            </div>
          </div>

          <div
            className="flow-workspace__viewport flow-workspace__viewport--opal"
            onMouseDown={startPan}
            style={{
              backgroundPosition: `${viewportOffset.x}px ${viewportOffset.y}px, ${viewportOffset.x}px ${viewportOffset.y}px`,
            }}
          >
            <svg className="flow-workspace__connectors" aria-hidden="true">
              <defs>
                <marker id="flow-arrow" markerWidth="10" markerHeight="8" refX="8" refY="4" orient="auto">
                  <polygon points="0 0, 10 4, 0 8" fill="rgba(124, 58, 237, 0.45)" />
                </marker>
                <marker id="flow-arrow-done" markerWidth="10" markerHeight="8" refX="8" refY="4" orient="auto">
                  <polygon points="0 0, 10 4, 0 8" fill="rgba(16, 185, 129, 0.75)" />
                </marker>
              </defs>
              {connectorPaths.map((path) => (
                <path
                  key={path.key}
                  d={path.d}
                  className={`flow-workspace__connector ${path.done ? 'flow-workspace__connector--done' : ''} ${path.accent ? `flow-workspace__connector--${path.accent}` : ''}`}
                  markerEnd={path.done ? 'url(#flow-arrow-done)' : 'url(#flow-arrow)'}
                />
              ))}
            </svg>

            {coreNodes.map((node) => {
              const status = getNodeStatus(node.id);
              return (
                <button
                  key={node.id}
                  type="button"
                  className={`flow-node flow-node--core flow-node--${status}`}
                  style={{
                    width: CORE_NODE_WIDTH,
                    left: node.x + viewportOffset.x,
                    top: node.y + viewportOffset.y,
                  }}
                  onClick={() => {
                    setSelectedLogicBlockId(null);
                    if (status !== 'locked') setActiveCoreNode(node.id);
                  }}
                  onMouseDown={(event) => startCoreDrag(event, node)}
                  disabled={status === 'locked'}
                >
                  <span className="flow-node__handle">⋮⋮</span>
                  <span className="flow-node__icon">{status === 'completed' ? '✓' : node.icon}</span>
                  <span className="flow-node__label">{node.label}</span>
                  <span className="flow-node__desc">{node.description}</span>
                </button>
              );
            })}

            {logicBlocks.map((block) => (
              <button
                key={block.id}
                type="button"
                className={`flow-node flow-node--logic flow-node--logic-${block.tint} ${selectedLogicBlockId === block.id ? 'flow-node--logic-selected' : ''}`}
                style={{
                  width: LOGIC_NODE_WIDTH,
                  left: block.x + viewportOffset.x,
                  top: block.y + viewportOffset.y,
                }}
                onClick={() => setSelectedLogicBlockId(block.id)}
                onMouseDown={(event) => startLogicDrag(event, block)}
              >
                <span className="flow-node__handle">⋮⋮</span>
                <span className="flow-node__icon">{block.icon}</span>
                <span className="flow-node__label">{block.label}</span>
                <span className="flow-node__desc">{block.description}</span>
              </button>
            ))}
          </div>

          <div className="flow-workspace__footer flow-workspace__footer--opal">
            <span>Tip: drag blocks to rearrange the flow. Drag empty space to pan the infinite grid.</span>
            <span>Active stage: {coreNodeMap[activeCoreNode].label}</span>
          </div>
        </div>

        <aside className="flow-inspector flow-inspector--opal flow-inspector--tabs">
          <div className="flow-inspector__card">
            <WorkflowSidebarTabs
              className="workflow-sidebar-tabs"
              defaultTabId={WORKFLOW_AGENT_ENABLED ? 'agent' : 'inspector'}
              tabs={[
                ...(WORKFLOW_AGENT_ENABLED
                  ? [
                      {
                        id: 'agent',
                        label: 'Agent',
                        content: (
                          <AgentChatPanel
                            title="Agent-controlled workflow"
                            subtitle="Describe the reel change you want. The agent mutates the graph, then uses the current transcribe and generate handlers."
                            draft={workflowAgent.draft}
                            isBusy={workflowAgent.isBusy}
                            status={workflowAgent.status}
                            error={workflowAgent.error}
                            messages={workflowAgent.messages}
                            response={workflowAgent.lastResponse}
                            workflow={feature1Workflow}
                            executionPlan={workflowAgent.lastResponse}
                            composerTestId="feature1-agent-wish"
                            sendTestId="feature1-agent-apply"
                            onDraftChange={workflowAgent.setDraft}
                            onSend={() => void workflowAgent.send()}
                            onExportWorkflow={() =>
                              downloadJsonFile(
                                `feature1-workflow-${new Date().toISOString()}.json`,
                                feature1Workflow
                              )
                            }
                            onExportPlan={() =>
                              workflowAgent.lastResponse
                                ? downloadJsonFile(
                                    `feature1-agent-plan-${new Date().toISOString()}.json`,
                                    workflowAgent.lastResponse
                                  )
                                : undefined
                            }
                          />
                        ),
                      },
                    ]
                  : []),
                {
                  id: 'inspector',
                  label: 'Inspector',
                  content: selectedLogicBlock ? (
                    <div className="flow-inspector__body">
                      <div className="flow-inspector__header">
                        <span className="feature-page__kicker">Inspector</span>
                        <h2>{selectedLogicBlock.label}</h2>
                        <p>Fine-tune this logic block and connect it to the right stage.</p>
                      </div>

                      <label className="form-field">
                        <span>Block label</span>
                        <input
                          value={selectedLogicBlock.label}
                          onChange={(event) => updateSelectedLogicBlock({ label: event.target.value })}
                        />
                      </label>

                      <label className="form-field">
                        <span>Attach to stage</span>
                        <select
                          value={selectedLogicBlock.attachTo}
                          onChange={(event) =>
                            updateSelectedLogicBlock({ attachTo: event.target.value as CoreNodeId })
                          }
                        >
                          {coreNodes.map((node) => (
                            <option key={node.id} value={node.id}>
                              {node.label}
                            </option>
                          ))}
                        </select>
                      </label>

                      <label className="form-field">
                        <span>Description</span>
                        <textarea
                          rows={4}
                          value={selectedLogicBlock.description}
                          onChange={(event) =>
                            updateSelectedLogicBlock({ description: event.target.value })
                          }
                        />
                      </label>

                      <label className="form-field">
                        <span>Logic note</span>
                        <textarea
                          rows={4}
                          value={selectedLogicBlock.note}
                          onChange={(event) => updateSelectedLogicBlock({ note: event.target.value })}
                        />
                      </label>

                      <div className="flow-inspector__chips">
                        <span className="flow-chip">Type: {selectedLogicBlock.type}</span>
                        <span className="flow-chip">Theme: {selectedLogicBlock.tint}</span>
                        {selectedLogicBlock.agentBlock ? <span className="flow-chip">Agent block</span> : null}
                      </div>

                      {selectedLogicBlock.agentBlock ? (
                        <div className="flow-inspector__summary">
                          <strong>{selectedLogicBlock.agentBlock.blockName}</strong>
                          <p>{selectedLogicBlock.agentBlock.provenance.creationReason}</p>
                          <p>Backs: {selectedLogicBlock.agentBlock.provenance.backingCoreNodes.join(', ') || 'current flow'}</p>
                        </div>
                      ) : null}

                      <button className="btn btn--danger btn--sm" type="button" onClick={removeSelectedLogicBlock}>
                        Remove block
                      </button>
                    </div>
                  ) : (
                    <div className="flow-inspector__body">
                      <div className="flow-inspector__header">
                        <span className="feature-page__kicker">Inspector</span>
                        <h2>Workflow overview</h2>
                        <p>Select a custom block to edit it, or keep building from the library.</p>
                      </div>

                      <div className="flow-overview-list">
                        {coreNodes.map((node) => (
                          <div className="flow-overview-list__item" key={node.id}>
                            <strong>
                              {node.icon} {node.label}
                            </strong>
                            <span>{getNodeStatus(node.id)}</span>
                          </div>
                        ))}
                      </div>

                      <div className="flow-inspector__summary">
                        <strong>Opal-style builder surface</strong>
                        <p>
                          Core stages stay fixed conceptually, but the surrounding logic layer is built to
                          grow with more scoring, QA, and export branches.
                        </p>
                        <p>Agent variant cap: {agentVariantCount}</p>
                      </div>
                    </div>
                  ),
                },
                {
                  id: 'results',
                  label: 'Results',
                  content: (
                    <div className="flow-inspector__body">
                      <div className="flow-inspector__header">
                        <span className="feature-page__kicker">Results</span>
                        <h2>{result ? 'Latest reel batch' : 'No reels yet'}</h2>
                        <p>
                          {result
                            ? 'The current batch stays editable in the main workflow panel.'
                            : 'Generate reels from the current workflow or let the agent do it for you.'}
                        </p>
                      </div>

                      {result ? (
                        <>
                          <div className="flow-inspector__chips">
                            <span className="flow-chip">{result.clips.length} clips</span>
                            <span className="flow-chip">{filteredClipIds.size} enabled</span>
                            <span className="flow-chip">Caption density: {agentCaptionDensity}</span>
                          </div>
                          <div className="flow-inspector__summary">
                            <strong>
                              Recommended clip:{' '}
                              {result.clips.find((clip) => clip.id === result.recommendedClipId)?.title ?? 'Pending'}
                            </strong>
                            <p>
                              Transcript {result.transcriptUsed ? 'enabled' : 'off'} and visual analysis{' '}
                              {result.visualSignalsUsed ? 'enabled' : 'off'}.
                            </p>
                          </div>
                        </>
                      ) : (
                        <div className="flow-inspector__summary">
                          <strong>Manual controls remain available</strong>
                          <p>
                            Upload, transcribe, generate, filter, and review results exactly as before.
                          </p>
                        </div>
                      )}
                    </div>
                  ),
                },
              ]}
            />
          </div>
        </aside>
      </section>

      {errorMessage && <div className="wizard-error">{errorMessage}</div>}
      {statusMessage && !errorMessage && (
        <div className="inline-banner" data-testid="feature1-status-banner">
          {statusMessage}
        </div>
      )}

      <section className="flow-panel-layout">
        <div className="flow-panel flow-panel--opal">
          {activeCoreNode === 'upload' && (
            <div className="flow-panel__content" key="upload">
              <div className="flow-panel__header">
                <h2>Add Your Source Video</h2>
                <p>Upload a video file via Cloudinary.</p>
              </div>

              <div className="flow-panel__body">
                <div className="upload-zone">
                  <div className="upload-zone__actions">
                    <UploadWidget
                      buttonText="Choose Video File"
                      clientAllowedFormats={FEATURE1_VIDEO_UPLOAD_FORMATS}
                      onUploadError={handleSourceUploadError}
                      onUploadSuccess={handleSourceUploadSuccess}
                      resourceType="video"
                    />
                  </div>

                  {sourceAsset && sourcePreviewUrl && (
                    <div className="upload-preview">
                      <div className="upload-preview__video-wrap">
                        <video autoPlay controls loop muted playsInline src={sourcePreviewUrl} />
                      </div>
                      <div className="upload-preview__meta">
                        <strong>{sourceAsset.label}</strong>
                        <span>
                          {sourceAsset.source} •{' '}
                          {sourceAsset.duration ? `${Math.round(sourceAsset.duration)}s` : 'Loaded'}
                        </span>
                      </div>
                    </div>
                  )}
                </div>

                {uploadHistory.length > 0 && (
                  <div className="recent-uploads">
                    <h4 className="recent-uploads__title">Recent Uploads</h4>
                    <div className="recent-uploads__grid">
                      {uploadHistory.map((item) => (
                        <button
                          key={item.id}
                          type="button"
                          className={`recent-uploads__card ${sourceAsset?.publicId === item.publicId ? 'recent-uploads__card--active' : ''}`}
                          onClick={() => handleSelectFromHistory(item)}
                          data-testid="recent-upload-card"
                        >
                          {item.thumbnailUrl ? (
                            <img src={item.thumbnailUrl} alt={item.label} className="recent-uploads__thumb" />
                          ) : (
                            <div className="recent-uploads__thumb recent-uploads__thumb--placeholder">🎬</div>
                          )}
                          <div className="recent-uploads__info">
                            <span className="recent-uploads__label">{item.label}</span>
                            <span className="recent-uploads__meta">
                              {item.duration ? `${Math.round(item.duration)}s` : 'Video'}
                            </span>
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <div className="flow-panel__nav">
                <div />
                <button
                  className="btn btn--primary"
                  type="button"
                  onClick={() => setActiveCoreNode('transcribe')}
                  disabled={!hasSource}
                  data-testid="feature1-next-transcribe"
                >
                  Next: Transcribe →
                </button>
              </div>
            </div >
          )}

          {
            activeCoreNode === 'transcribe' && (
              <div className="flow-panel__content" key="transcribe">
                <div className="flow-panel__header">
                  <h2>Transcribe Your Video</h2>
                  <p>Run Cloudinary transcription on any existing video public ID, then refine the text below.</p>
                </div>

                <div className="flow-panel__body">
                  <div className="transcribe-stack">
                    <div className="transcribe-config-card">
                      <div className="transcribe-config-card__header">
                        <strong>Cloudinary transcription job</strong>
                        <span>Separate from upload. Paste the video public ID from any Cloudinary pipeline.</span>
                      </div>

                      <div className="transcribe-config-grid">
                        <label className="form-field">
                          <span>Cloudinary public ID</span>
                          <input
                            value={transcriptionPublicId}
                            onChange={(event) => setTranscriptionPublicId(event.target.value)}
                            placeholder="shorty/my-video"
                          />
                        </label>

                        <label className="form-field">
                          <span>Original language</span>
                          <input
                            value={transcriptionLanguage}
                            onChange={(event) => setTranscriptionLanguage(event.target.value)}
                            placeholder="en"
                            maxLength={5}
                          />
                        </label>
                      </div>

                      <div className="transcribe-actions">
                        <button
                          className="btn btn--primary"
                          type="button"
                          onClick={() => void handleTranscribe()}
                          disabled={isTranscribing || !transcriptionPublicId.trim()}
                        >
                          {isTranscribing ? '⏳ Transcribing...' : '☁️ Run Cloudinary transcription'}
                        </button>
                        <button
                          className="btn btn--ghost"
                          type="button"
                          onClick={() => setTranscriptionPublicId(sourceAsset?.publicId || '')}
                          disabled={!sourceAsset?.publicId}
                        >
                          Use current source
                        </button>
                        <span className="transcribe-or">Upload stays separate. Manual transcript editing stays available.</span>
                      </div>

                      {transcriptionDetails && (
                        <div className="transcribe-config-meta">
                          <span className="transcribe-meta-pill">Provider: {transcriptionDetails.provider}</span>
                          <span className="transcribe-meta-pill">Mode: {transcriptionDetails.model}</span>
                          <span className="transcribe-meta-pill">Asset: {transcriptionDetails.publicId || transcriptionPublicId}</span>
                        </div>
                      )}
                    </div>
                  </div>

                  <label className="form-field">
                    <span>Transcript</span>
                    <textarea
                      data-testid="feature1-transcript"
                      rows={8}
                      value={transcriptText}
                      onChange={(event) => {
                        setTranscriptText(event.target.value);
                        if (transcriptionPublicId) {
                          if (sessionUserKey) {
                            saveTranscript(sessionUserKey, transcriptionPublicId, event.target.value);
                          } else {
                            saveTranscript(transcriptionPublicId, event.target.value);
                          }
                        }
                        setTranscriptionDetails((current) =>
                          current
                            ? {
                              ...current,
                              transcript: event.target.value,
                            }
                            : current
                        );
                      }}
                      placeholder="Paste transcript text here. Timestamped lines like 00:15 Hook line... work best."
                    />
                  </label>

                  {transcriptText.trim() && (
                    <div className="transcript-preview">
                      <span className="transcript-preview__badge">✓ Ready</span>
                      <span className="transcript-preview__count">
                        {transcriptText.trim().split(/\s+/).length} words
                      </span>
                    </div>
                  )}
                </div>

                <div className="flow-panel__nav">
                  <button className="btn btn--ghost" type="button" onClick={() => setActiveCoreNode('upload')}>
                    ← Back
                  </button>
                  <div className="wizard-nav__right">
                    <button className="btn btn--ghost" type="button" onClick={() => setActiveCoreNode('generate')}>
                      Skip
                    </button>
                    <button
                      className="btn btn--primary"
                      type="button"
                      onClick={() => setActiveCoreNode('generate')}
                      data-testid="feature1-next-generate"
                    >
                      Next: Generate →
                    </button>
                  </div>
                </div>
              </div>
            )
          }

          {
            activeCoreNode === 'generate' && (
              <div className="flow-panel__content" key="generate">
                <div className="flow-panel__header">
                  <h2>Generate Reels</h2>
                  <p>Analyze your video and create ranked 30–60 second viral clips.</p>
                </div>

                <div className="flow-panel__body">
                  <div className="generate-summary">
                    <div className="generate-summary__item">
                      <span className="generate-summary__label">Source</span>
                      <strong>{sourceAsset?.label || 'No video'}</strong>
                    </div>
                    <div className="generate-summary__item">
                      <span className="generate-summary__label">Transcript</span>
                      <strong>
                        {transcriptText.trim()
                          ? `${transcriptText.trim().split(/\s+/).length} words`
                          : 'Not provided'}
                      </strong>
                    </div>
                    <div className="generate-summary__item">
                      <span className="generate-summary__label">Output</span>
                      <strong>30–60s viral reels, ranked</strong>
                    </div>
                    <div className="generate-summary__item">
                      <span className="generate-summary__label">MediaPipe</span>
                      <strong>
                        {visualAnalysis?.highlights?.length
                          ? `${visualAnalysis.highlights.length} expression peaks`
                          : 'Expression scan on generate'}
                      </strong>
                    </div>
                  </div>

                  <div className="editing-blocks">
                    <h3 className="editing-blocks__title">Editing Blocks</h3>
                    <div className="editing-blocks__grid">
                      <label className={`editing-block ${editRemoveSilences ? 'editing-block--on' : ''}`}>
                        <div className="editing-block__icon">✂️</div>
                        <div className="editing-block__info">
                          <strong>Remove Silences</strong>
                          <span>Cut dead air &amp; awkward pauses for fast pacing</span>
                        </div>
                        <div className="editing-block__toggle">
                          <input type="checkbox" checked={editRemoveSilences} onChange={(e) => setEditRemoveSilences(e.target.checked)} />
                          <span className="editing-block__slider" />
                        </div>
                      </label>

                      <label className={`editing-block ${editShakingCaptions ? 'editing-block--on' : ''}`}>
                        <div className="editing-block__icon">💥</div>
                        <div className="editing-block__info">
                          <strong>Shaking Captions</strong>
                          <span>Bold, animated text that demands attention</span>
                        </div>
                        <div className="editing-block__toggle">
                          <input type="checkbox" checked={editShakingCaptions} onChange={(e) => setEditShakingCaptions(e.target.checked)} />
                          <span className="editing-block__slider" />
                        </div>
                      </label>

                      <label className={`editing-block ${editFaceFocus ? 'editing-block--on' : ''}`}>
                        <div className="editing-block__icon">🎯</div>
                        <div className="editing-block__info">
                          <strong>Face Focus</strong>
                          <span>Track the active speaker instead of locking on the center face</span>
                        </div>
                        <div className="editing-block__toggle">
                          <input type="checkbox" checked={editFaceFocus} onChange={(e) => setEditFaceFocus(e.target.checked)} />
                          <span className="editing-block__slider" />
                        </div>
                      </label>

                      <label className={`editing-block ${editSafeFaceFrame ? 'editing-block--on' : ''}`}>
                        <div className="editing-block__icon">🧍</div>
                        <div className="editing-block__info">
                          <strong>Safe Face Frame</strong>
                          <span>Pad the final 9:16 render so the speaker’s full face stays visible</span>
                        </div>
                        <div className="editing-block__toggle">
                          <input type="checkbox" checked={editSafeFaceFrame} onChange={(e) => setEditSafeFaceFrame(e.target.checked)} />
                          <span className="editing-block__slider" />
                        </div>
                      </label>
                    </div>
                  </div>

                  {isGenerating ? (
                    <div className="generating-state">
                      <div className="generating-state__spinner" />
                      <h2>{GENERATE_STAGES[generateStage]?.label || 'Processing…'}</h2>
                      <div className="generating-state__progress">
                        <div
                          className="generating-state__bar"
                          style={{ width: `${((generateStage + 1) / GENERATE_STAGES.length) * 100}%` }}
                        />
                      </div>
                      <div className="generating-state__steps">
                        {GENERATE_STAGES.map((stage, i) => (
                          <span
                            key={stage.label}
                            className={`generating-state__step ${i <= generateStage ? 'generating-state__step--done' : ''}`}
                          >
                            {i < generateStage ? '✓' : i === generateStage ? '●' : '○'} {stage.label.replace('…', '')}
                          </span>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div className="generate-cta">
                      <button
                        className="btn btn--primary btn--xl generate-button"
                        type="button"
                        onClick={() => void handleGenerate()}
                        disabled={isGenerating || !hasSource}
                        data-testid="feature1-generate"
                      >
                        ⚡ Generate Reels
                      </button>
                    </div>
                  )}
                </div>

                <div className="flow-panel__nav">
                  <button
                    className="btn btn--ghost"
                    type="button"
                    onClick={() => setActiveCoreNode('transcribe')}
                    disabled={isGenerating}
                  >
                    ← Back
                  </button>
                  <div />
                </div>
              </div>
            )
          }

          {
            activeCoreNode === 'hook-filter' && result && (
              <div className="flow-panel__content" key="hook-filter">
                <div className="flow-panel__header">
                  <h2>🪝 Review Hooks</h2>
                  <p>Toggle clips on/off. Only enabled clips move to Results.</p>
                </div>

                <div className="flow-panel__body">
                  <div className="hook-filter__summary">
                    <span className="hook-filter__count">
                      {filteredClipIds.size} of {result.clips.length} clips enabled
                    </span>
                    <button
                      className="btn btn--ghost btn--sm"
                      type="button"
                      onClick={() =>
                        setFilteredClipIds(
                          filteredClipIds.size === result.clips.length
                            ? new Set()
                            : new Set(result.clips.map((c) => c.id))
                        )
                      }
                    >
                      {filteredClipIds.size === result.clips.length ? 'Deselect All' : 'Select All'}
                    </button>
                  </div>

                  <div className="hook-filter__list">
                    {result.clips.map((clip) => {
                      const enabled = filteredClipIds.has(clip.id);
                      const hookScore = clip.scoreBreakdown.hookStrength;
                      return (
                        <div
                          key={clip.id}
                          className={`hook-filter__card ${enabled ? 'hook-filter__card--enabled' : 'hook-filter__card--disabled'}`}
                        >
                          <button
                            type="button"
                            className="hook-filter__toggle"
                            onClick={() => toggleClipFilter(clip.id)}
                          >
                            <span className={`hook-filter__check ${enabled ? 'hook-filter__check--on' : ''}`}>
                              {enabled ? '✓' : ''}
                            </span>
                          </button>

                          <div className="hook-filter__preview">
                            <video
                              className="hook-filter__video"
                              muted
                              playsInline
                              preload="metadata"
                              poster={clip.posterUrl}
                              src={clip.previewUrl || clip.deliveryUrl || clip.aiPreviewUrl || clip.downloadUrl}
                              onMouseEnter={(e) => {
                                const v = e.currentTarget;
                                v.currentTime = 0;
                                v.play().catch(() => { });
                              }}
                              onMouseLeave={(e) => {
                                e.currentTarget.pause();
                                e.currentTarget.currentTime = 0;
                              }}
                            />
                          </div>

                          <div className="hook-filter__info">
                            <div className="hook-filter__rank">
                              #{clip.rank}
                              {hookScore >= 70 && <span className="hook-fire">🔥</span>}
                            </div>
                            <p className="hook-filter__hook-text">"{clip.hook}"</p>
                              {clip.expressionLabel ? (
                                <div className="reel-card-v2__expression reel-card-v2__expression--compact">
                                  <span>🎯 {clip.focusStrategy || 'speaker'} · {clip.expressionLabel}</span>
                                  {clip.cameraMotion ? <strong>{clip.cameraMotion}</strong> : null}
                                </div>
                              ) : null}
                            <div className="hook-filter__meter">
                              <div className="hook-filter__meter-label">
                                <span>Hook Strength</span>
                                <strong>{formatScore(hookScore)}</strong>
                              </div>
                              <div className="hook-filter__meter-bar">
                                <div
                                  className="hook-filter__meter-fill"
                                  style={{
                                    width: `${hookScore}%`,
                                    background: hookScore >= 70
                                      ? 'linear-gradient(90deg, #10b981, #34d399)'
                                      : hookScore >= 50
                                        ? 'linear-gradient(90deg, #f59e0b, #fbbf24)'
                                        : 'linear-gradient(90deg, #ef4444, #f87171)',
                                  }}
                                />
                              </div>
                            </div>
                            <span className="hook-filter__time">
                              {formatTime(clip.startOffset)} · {clip.duration}s · {clip.analysisSource}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className="flow-panel__nav">
                  <button
                    className="btn btn--ghost"
                    type="button"
                    onClick={() => setActiveCoreNode('generate')}
                  >
                    ← Back
                  </button>
                  <button
                    className="btn btn--primary"
                    type="button"
                    onClick={() => setActiveCoreNode('results')}
                    disabled={filteredClipIds.size === 0}
                    data-testid="feature1-view-results"
                  >
                    View Results ({filteredClipIds.size}) →
                  </button>
                </div>
              </div>
            )
          }

          {
            activeCoreNode === 'results' && result && (
              <div className="flow-panel__content" key="results">
                <div className="flow-panel__header">
                  <h2>Your Reels Are Ready 🎉</h2>
                  <p>
                    {result.clips.filter((c) => filteredClipIds.has(c.id)).length} reels ranked by virality score.
                  </p>
                </div>

                <div className="flow-panel__body">
                  <div className="reel-results__summary">
                    <span className="reel-results__pill reel-results__pill--active">
                      {result.clips.filter((c) => filteredClipIds.has(c.id)).length} reels
                    </span>
                    <span className="reel-results__pill">
                      Transcript: {result.transcriptUsed ? 'used' : 'off'}
                    </span>
                    <span className="reel-results__pill">
                      Visual: {result.visualSignalsUsed ? 'MediaPipe' : 'off'}
                    </span>
                    {result.clips.some((clip) => clip.qa) ? (
                      <span className="reel-results__pill">
                        QA: {result.clips.filter((clip) => clip.qa?.status === 'pass').length}/{result.clips.length} pass
                      </span>
                    ) : null}
                    {result.visualAnalysis?.highlights?.length ? (
                      <span className="reel-results__pill">
                        Expressions: {result.visualAnalysis.highlights.length} peaks
                      </span>
                    ) : null}
                  </div>

                  <div className="reel-grid-v2">
                    {result.clips
                      .filter((c) => filteredClipIds.has(c.id))
                      .map((clip, idx) => {
                        const recommended = clip.id === result.recommendedClipId;
                        const isTop = idx === 0;
                        const scorePercent = Math.round(clip.viralityScore);
                        const circumference = 2 * Math.PI * 38;
                        const strokeOffset = circumference - (scorePercent / 100) * circumference;
                        const clipVideoSources = collectUniqueUrls([
                          clip.deliveryUrl,
                          clip.previewUrl,
                          clip.aiPreviewUrl,
                          clip.downloadUrl,
                        ]);
                        const cardVideoSrc = clipVideoSources[0] || '';
                        const fallbackVideoSrcs = clipVideoSources.slice(1);
                        const useRenderedVideo = clipVideoSources[0] === clip.deliveryUrl && Boolean(clip.deliveryUrl);

                        return (
                          <article
                            className={`reel-card-v2 ${isTop ? 'reel-card-v2--top' : ''}`}
                            key={clip.id}
                            data-testid="feature1-reel-card"
                          >
                            <div className="reel-card-v2__phone">
                              {recommended && <span className="reel-card-v2__badge">⭐ Best</span>}
                              {isTop && <span className="reel-card-v2__fire">🔥</span>}
                              <FaceDetectVideo
                                key={`${clip.id}:${clipVideoSources.join('|')}`}
                                src={cardVideoSrc}
                                fallbackSrcs={fallbackVideoSrcs}
                                poster={clip.posterUrl}
                                faceFocusEnabled={editFaceFocus}
                                safeFrameEnabled={editSafeFaceFrame}
                                captions={clipCaptionMap.get(clip.id) || []}
                                captionsEnabled={Boolean(clipCaptionMap.get(clip.id)?.length)}
                                captionVariant={editShakingCaptions ? 'shaking' : 'clean'}
                                focusStrategy={clip.focusStrategy}
                                cameraMotion={clip.cameraMotion}
                                suppressLocalEffectsOnPrimarySource={useRenderedVideo}
                              />
                            </div>

                            <div className="reel-card-v2__body">
                              <div className="reel-card-v2__top-row">
                                <div className="reel-card-v2__title">
                                  <strong>#{clip.rank} · {clip.title}</strong>
                                  <span className="reel-card-v2__meta">
                                    {formatTime(clip.startOffset)} · {clip.duration}s
                                  </span>
                                </div>

                                <div className="reel-score-ring">
                                  <svg viewBox="0 0 88 88" className="reel-score-ring__svg">
                                    <circle cx="44" cy="44" r="38" className="reel-score-ring__bg" />
                                    <circle
                                      cx="44"
                                      cy="44"
                                      r="38"
                                      className="reel-score-ring__fill"
                                      strokeDasharray={circumference}
                                      strokeDashoffset={strokeOffset}
                                      style={{
                                        stroke: scorePercent >= 70
                                          ? '#10b981'
                                          : scorePercent >= 50
                                            ? '#f59e0b'
                                            : '#ef4444',
                                      }}
                                    />
                                  </svg>
                                  <span className="reel-score-ring__value">{scorePercent}</span>
                                </div>
                              </div>

                              <p className="reel-card-v2__hook">"{clip.hook}"</p>

                              {clip.expressionLabel ? (
                                <div className="reel-card-v2__expression">
                                  <span>
                                    😀 {clip.expressionLabel}
                                    {clip.focusStrategy ? ` · ${clip.focusStrategy}` : ''}
                                  </span>
                                  {clip.cameraMotion ? <em>{clip.cameraMotion}</em> : null}
                                  {clip.expressionScore ? <strong>{formatScore(clip.expressionScore)}</strong> : null}
                                </div>
                              ) : null}

                              {clip.qa ? (
                                <div
                                  className={`reel-card-v2__qa reel-card-v2__qa--${clip.qa.status}`}
                                  data-testid="feature1-reel-qa"
                                >
                                  <span>
                                    {clip.qa.status === 'pass' ? 'QA passed' : 'QA review'}
                                    {` · face ${Math.round(clip.qa.speakerFaceVisibleRatio * 100)}%`}
                                  </span>
                                  <small>{clip.qa.notes[0]}</small>
                                </div>
                              ) : null}

                              {clip.transcriptExcerpt && (
                                <p className="reel-card-v2__excerpt">{clip.transcriptExcerpt}</p>
                              )}

                              <div className="reel-card-v2__scores">
                                <span>Hook {formatScore(clip.scoreBreakdown.hookStrength)}</span>
                                <span>Clarity {formatScore(clip.scoreBreakdown.standaloneClarity)}</span>
                                <span>Emotion {formatScore(clip.scoreBreakdown.emotionalImpact)}</span>
                                <span>Pacing {formatScore(clip.scoreBreakdown.pacing)}</span>
                              </div>

                              <div className="reel-card-v2__actions">
                                <a className="btn btn--primary btn--sm" href={clip.downloadUrl} download>
                                  ⬇ Download
                                </a>
                                <a
                                  className="btn btn--ghost btn--sm"
                                  href={clip.deliveryUrl}
                                  target="_blank"
                                  rel="noreferrer"
                                >
                                  ↗ Open
                                </a>
                                <button
                                  className="btn btn--ghost btn--sm"
                                  type="button"
                                  onClick={() => navigator.clipboard?.writeText(clip.deliveryUrl)}
                                >
                                  📋 Copy Link
                                </button>
                              </div>
                            </div>
                          </article>
                        );
                      })}
                  </div>
                </div>

                <div className="flow-panel__nav">
                  <button className="btn btn--ghost" type="button" onClick={() => setActiveCoreNode('hook-filter')}>
                    ← Filter Hooks
                  </button>
                  <button className="btn btn--ghost" type="button" onClick={handleStartNew}>
                    Start New
                  </button>
                </div>
              </div>
            )
          }
        </div >
      </section >

      {
        history.length > 0 && activeCoreNode === 'upload' && (
          <section className="past-work" style={{ marginTop: 48 }}>
            <h2 className="past-work__title">Past Generations</h2>
            <div className="past-work__list">
              {history.slice(0, 5).map((entry) => {
                const topClip =
                  entry.result.clips.find((clip) => clip.id === entry.recommendedClipId) ??
                  entry.result.clips[0];
                return (
                  <div className="past-work__item" key={entry.id}>
                    <div className="past-work__item-info">
                      <strong>{entry.sourceLabel}</strong>
                      <span>
                        {new Date(entry.createdAt).toLocaleDateString()} · {entry.result.clips.length}{' '}
                        reels
                        {topClip ? ` · Top: ${formatScore(topClip.viralityScore)}` : ''}
                      </span>
                    </div>
                    <div className="past-work__item-actions">
                      <button
                        className="btn btn--ghost btn--sm"
                        type="button"
                        onClick={() => {
                          setResult(entry.result);
                          setVisualAnalysis(entry.result.visualAnalysis ?? null);
                          setFilteredClipIds(new Set(entry.result.clips.map((clip) => clip.id)));
                          setActiveCoreNode('results');
                          setStatusMessage(`Loaded ${entry.result.clips.length} saved reels.`);
                        }}
                      >
                        View
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        )
      }
    </div >
  );
}
