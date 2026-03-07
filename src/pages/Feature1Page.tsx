import { useCallback, useEffect, useMemo, useState, type MouseEvent as ReactMouseEvent } from 'react';
import { Link, Navigate } from 'react-router-dom';
import boltLogo from '../assets/bolt-logo.png';
import {
  UploadWidget,
  type CloudinaryUploadResult,
} from '../cloudinary/UploadWidget';
import { SAMPLE_PRIMARY_ASSET } from '../data/presets';
import { buildPlayableSourceUrl, createMediaAssetFromUpload } from '../lib/rendering';
import { loadReelHistory, saveReelHistory } from '../lib/persistence';
import { generateReels } from '../lib/reels';
import {
  fetchReelHistory,
  hasSupabaseBrowserConfig,
  persistReelHistoryEntry,
} from '../lib/supabase';
import { transcribeVideo } from '../lib/transcription';
import type { ShortySession } from '../lib/session';
import type { MediaAsset, ReelGenerationResponse, ReelHistoryEntry } from '../types';

interface Feature1PageProps {
  session: ShortySession | null;
}

type CoreNodeId = 'upload' | 'transcribe' | 'generate' | 'results';
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

const CORE_SEQUENCE: CoreNodeId[] = ['upload', 'transcribe', 'generate', 'results'];

const INITIAL_CORE_NODES: CoreFlowNode[] = [
  { id: 'upload', label: 'Upload', icon: '📤', description: 'Add source video', x: 120, y: 120 },
  { id: 'transcribe', label: 'Transcribe', icon: '📝', description: 'Extract transcript', x: 440, y: 120 },
  { id: 'generate', label: 'Generate', icon: '⚡', description: 'Create reels', x: 760, y: 120 },
  { id: 'results', label: 'Results', icon: '🏆', description: 'View ranked clips', x: 1080, y: 120 },
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

function extractDriveFileId(url: string): string | null {
  const match = url.match(/\/d\/([a-zA-Z0-9_-]+)/);
  return match ? match[1] : null;
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
  const [activeCoreNode, setActiveCoreNode] = useState<CoreNodeId>('upload');
  const [coreNodes, setCoreNodes] = useState<CoreFlowNode[]>(INITIAL_CORE_NODES);
  const [logicBlocks, setLogicBlocks] = useState<LogicBlock[]>(() => createInitialLogicBlocks());
  const [selectedLogicBlockId, setSelectedLogicBlockId] = useState<string | null>(null);
  const [viewportOffset, setViewportOffset] = useState(DEFAULT_VIEWPORT_OFFSET);
  const [dragState, setDragState] = useState<DragState>(null);

  const [sourceMode, setSourceMode] = useState<'upload' | 'drive'>('upload');
  const [sourceAsset, setSourceAsset] = useState<MediaAsset | null>(null);
  const [googleDriveUrl, setGoogleDriveUrl] = useState('');

  const [transcriptText, setTranscriptText] = useState('');
  const [isTranscribing, setIsTranscribing] = useState(false);

  const [isGenerating, setIsGenerating] = useState(false);
  const [result, setResult] = useState<ReelGenerationResponse | null>(null);

  const [history, setHistory] = useState<ReelHistoryEntry[]>([]);
  const [errorMessage, setErrorMessage] = useState('');
  const [statusMessage, setStatusMessage] = useState('');

  const sourcePreviewUrl = sourceAsset ? buildPlayableSourceUrl(sourceAsset) : null;
  const hasSource = sourceMode === 'upload' ? !!sourceAsset : !!googleDriveUrl.trim();

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
    const localHistory = loadReelHistory(session.email);
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
        saveReelHistory(session.email, response.entries);
      }
    });

    return () => {
      isMounted = false;
    };
  }, [session, session?.email, session?.userId]);

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

  const handleSourceUploadSuccess = (uploadResult: CloudinaryUploadResult) => {
    setSourceAsset(createMediaAssetFromUpload(uploadResult, 'Uploaded Source Video'));
    setStatusMessage('Video uploaded!');
  };

  const handleSourceUploadError = (error: Error) => {
    setErrorMessage(error.message || 'Upload failed.');
  };

  const handleUseSample = () => {
    setSourceAsset(SAMPLE_PRIMARY_ASSET);
    setStatusMessage('Sample video loaded.');
  };

  const handleTranscribe = async () => {
    setIsTranscribing(true);
    setErrorMessage('');
    try {
      const response = await transcribeVideo({
        sourceAsset: sourceMode === 'upload' ? sourceAsset : null,
        googleDriveUrl: sourceMode === 'drive' ? googleDriveUrl.trim() : '',
      });
      setTranscriptText(response.transcript);
      setStatusMessage('Transcription complete!');
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Failed to transcribe.');
    } finally {
      setIsTranscribing(false);
    }
  };

  const handleGenerate = async () => {
    if (!session) {
      return;
    }

    setIsGenerating(true);
    setErrorMessage('');
    try {
      const response = await generateReels({
        sourceAsset: sourceMode === 'upload' ? sourceAsset : null,
        googleDriveUrl: sourceMode === 'drive' ? googleDriveUrl.trim() : '',
        transcriptText: transcriptText.trim(),
      });

      const entry: ReelHistoryEntry = {
        id: crypto.randomUUID(),
        createdAt: new Date().toISOString(),
        sourceLabel:
          sourceMode === 'upload'
            ? sourceAsset?.label || 'Uploaded video'
            : googleDriveUrl.trim() || 'Google Drive video',
        recommendedClipId: response.recommendedClipId,
        result: response,
      };

      const nextHistory = [entry, ...history].slice(0, 10);
      setHistory(nextHistory);
      saveReelHistory(session.email, nextHistory);
      if (hasSupabaseBrowserConfig && session.userId) {
        await persistReelHistoryEntry(session.userId, entry);
      }

      setResult(response);
      setActiveCoreNode('results');
      setStatusMessage('Reels generated and ranked.');
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Failed to generate reels.');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleStartNew = () => {
    setActiveCoreNode('upload');
    setSourceAsset(null);
    setGoogleDriveUrl('');
    setTranscriptText('');
    setResult(null);
    setErrorMessage('');
    setStatusMessage('');
  };

  if (!session) {
    return <Navigate replace to="/login" />;
  }

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
          <div className="flow-library__header">
            <span className="feature-page__kicker">Library</span>
            <h2>Blocks</h2>
            <p>Drop more logic into the pipeline as your Feature 1 workflow grows.</p>
          </div>

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

        <aside className="flow-inspector flow-inspector--opal">
          <div className="flow-inspector__card">
            <div className="flow-inspector__header">
              <span className="feature-page__kicker">Inspector</span>
              <h2>{selectedLogicBlock ? selectedLogicBlock.label : 'Workflow overview'}</h2>
              <p>
                {selectedLogicBlock
                  ? 'Fine-tune this logic block and connect it to the right stage.'
                  : 'Select a custom block to edit it, or keep building from the library.'}
              </p>
            </div>

            {selectedLogicBlock ? (
              <div className="flow-inspector__body">
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
                </div>

                <button className="btn btn--danger btn--sm" type="button" onClick={removeSelectedLogicBlock}>
                  Remove block
                </button>
              </div>
            ) : (
              <div className="flow-inspector__body">
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
                </div>
              </div>
            )}
          </div>
        </aside>
      </section>

      {errorMessage && <div className="wizard-error">{errorMessage}</div>}
      {statusMessage && !errorMessage && <div className="inline-banner">{statusMessage}</div>}

      <section className="flow-panel-layout">
        <div className="flow-panel flow-panel--opal">
          {activeCoreNode === 'upload' && (
            <div className="flow-panel__content" key="upload">
              <div className="flow-panel__header">
                <h2>Add Your Source Video</h2>
                <p>Upload a video file or paste a Google Drive link.</p>
              </div>

              <div className="flow-panel__body">
                <div className="toggle-pills">
                  <button
                    type="button"
                    className={`toggle-pill ${sourceMode === 'upload' ? 'toggle-pill--active' : ''}`}
                    onClick={() => setSourceMode('upload')}
                  >
                    Upload File
                  </button>
                  <button
                    type="button"
                    className={`toggle-pill ${sourceMode === 'drive' ? 'toggle-pill--active' : ''}`}
                    onClick={() => setSourceMode('drive')}
                  >
                    Google Drive Link
                  </button>
                </div>

                {sourceMode === 'upload' ? (
                  <div className="upload-zone">
                    <div className="upload-zone__actions">
                      <UploadWidget
                        buttonText="Choose Video File"
                        clientAllowedFormats={['mp4', 'mov', 'm4v', 'webm']}
                        onUploadError={handleSourceUploadError}
                        onUploadSuccess={handleSourceUploadSuccess}
                        resourceType="video"
                      />
                      <button className="btn btn--ghost" type="button" onClick={handleUseSample}>
                        Use sample video
                      </button>
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
                ) : (
                  <div className="drive-input">
                    <label className="form-field">
                      <span>Google Drive Video Link</span>
                      <input
                        type="url"
                        value={googleDriveUrl}
                        onChange={(event) => setGoogleDriveUrl(event.target.value)}
                        placeholder="https://drive.google.com/file/d/.../view"
                      />
                    </label>
                    {googleDriveUrl.trim() && (
                      <>
                        <div className="drive-input__check">
                          <span>✓</span>
                          <span>Link ready</span>
                        </div>
                        {extractDriveFileId(googleDriveUrl) && (
                          <div className="upload-preview">
                            <div className="upload-preview__video-wrap">
                              <iframe
                                src={`https://drive.google.com/file/d/${extractDriveFileId(googleDriveUrl)}/preview`}
                                width="100%"
                                height="380"
                                allow="autoplay"
                                allowFullScreen
                                style={{ border: 'none', borderRadius: '12px 12px 0 0', display: 'block' }
                                }
                                title="Drive video preview"
                              />
                            </div >
                            <div className="upload-preview__meta">
                              <strong>Google Drive Video</strong>
                              <span>drive.google.com • Linked</span>
                            </div>
                          </div >
                        )}
                      </>
                    )}
                  </div >
                )}
              </div >

              <div className="flow-panel__nav">
                <div />
                <button
                  className="btn btn--primary"
                  type="button"
                  onClick={() => setActiveCoreNode('transcribe')}
                  disabled={!hasSource}
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
                  <p>Auto-transcribe or paste your own. Helps the AI find the best moments.</p>
                </div>

                <div className="flow-panel__body">
                  <div className="transcribe-actions">
                    <button
                      className="btn btn--primary"
                      type="button"
                      onClick={() => void handleTranscribe()}
                      disabled={isTranscribing}
                    >
                      {isTranscribing ? '⏳ Transcribing...' : '🎙 Auto-Transcribe'}
                    </button>
                    <span className="transcribe-or">or paste manually below</span>
                  </div>

                  <label className="form-field">
                    <span>Transcript</span>
                    <textarea
                      rows={8}
                      value={transcriptText}
                      onChange={(event) => setTranscriptText(event.target.value)}
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
                    <button className="btn btn--primary" type="button" onClick={() => setActiveCoreNode('generate')}>
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
                      <strong>
                        {sourceMode === 'upload'
                          ? sourceAsset?.label || 'Uploaded'
                          : googleDriveUrl.trim() || 'Drive'}
                      </strong>
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
                  </div>

                  {isGenerating ? (
                    <div className="generating-state">
                      <div className="generating-state__spinner" />
                      <h2>Generating your reels...</h2>
                      <p>Analyzing video, extracting clips, ranking by virality.</p>
                    </div>
                  ) : (
                    <div className="generate-cta">
                      <button
                        className="btn btn--primary btn--xl generate-button"
                        type="button"
                        onClick={() => void handleGenerate()}
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
            activeCoreNode === 'results' && result && (
              <div className="flow-panel__content" key="results">
                <div className="flow-panel__header">
                  <h2>Your Reels Are Ready 🎉</h2>
                  <p>{result.clips.length} reels ranked by virality score.</p>
                </div>

                <div className="flow-panel__body">
                  <div className="reel-results__summary">
                    <span className="reel-results__pill reel-results__pill--active">
                      {result.clips.length} reels
                    </span>
                    <span className="reel-results__pill">
                      Transcript: {result.transcriptUsed ? 'used' : 'off'}
                    </span>
                    <span className="reel-results__pill">
                      Visual: {result.visualSignalsUsed ? 'used' : 'off'}
                    </span>
                  </div>

                  <div className="reel-grid">
                    {result.clips.map((clip) => {
                      const recommended = clip.id === result.recommendedClipId;
                      return (
                        <article className="reel-card" key={clip.id}>
                          <div className="reel-card__media">
                            {recommended && <span className="reel-card__badge">⭐ Recommended</span>}
                            <video
                              className="reel-card__video"
                              controls
                              playsInline
                              preload="metadata"
                              poster={clip.posterUrl}
                              src={clip.deliveryUrl}
                            />
                          </div>
                          <div className="reel-card__body">
                            <div className="reel-card__header">
                              <div>
                                <strong>
                                  #{clip.rank} · {clip.title}
                                </strong>
                                <span>
                                  {formatTime(clip.startOffset)} start · {clip.duration}s ·{' '}
                                  {clip.analysisSource}
                                </span>
                              </div>
                              <div className="reel-score">
                                <span>Virality</span>
                                <strong>{formatScore(clip.viralityScore)}</strong>
                              </div>
                            </div>
                            <p className="reel-hook">{clip.hook}</p>
                            {clip.transcriptExcerpt && (
                              <p className="reel-excerpt">{clip.transcriptExcerpt}</p>
                            )}
                            <div className="reel-card__actions">
                              <a className="btn btn--primary btn--sm" href={clip.downloadUrl} download>
                                ⬇ Download
                              </a>
                              <a
                                className="btn btn--ghost btn--sm"
                                href={clip.deliveryUrl}
                                target="_blank"
                                rel="noreferrer"
                              >
                                Open
                              </a>
                            </div>
                            <div className="reel-breakdown">
                              <span>Hook {formatScore(clip.scoreBreakdown.hookStrength)}</span>
                              <span>Clarity {formatScore(clip.scoreBreakdown.standaloneClarity)}</span>
                              <span>Emotion {formatScore(clip.scoreBreakdown.emotionalImpact)}</span>
                              <span>Novelty {formatScore(clip.scoreBreakdown.novelty)}</span>
                              <span>Pacing {formatScore(clip.scoreBreakdown.pacing)}</span>
                              <span>Visuals {formatScore(clip.scoreBreakdown.visualEngagement)}</span>
                            </div>
                            <div className="reel-columns">
                              <div>
                                <h3>Why it ranked</h3>
                                <ul>
                                  {clip.reasoning.map((item) => (
                                    <li key={item}>{item}</li>
                                  ))}
                                </ul>
                              </div>
                              <div>
                                <h3>Editing plan</h3>
                                <ul>
                                  {clip.editingPlan.map((item) => (
                                    <li key={item}>{item}</li>
                                  ))}
                                </ul>
                              </div>
                            </div>
                          </div>
                        </article>
                      );
                    })}
                  </div>
                </div>

                <div className="flow-panel__nav">
                  <button className="btn btn--ghost" type="button" onClick={handleStartNew}>
                    ← Start New
                  </button>
                  <div />
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
                          setActiveCoreNode('results');
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
