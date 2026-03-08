import { BRAINROT_GAMEPLAY_PRESETS } from '../brainrot';
import type { CustomBlockDefinition, WorkflowGraph, WorkflowNode } from './types';

interface Feature2CanvasNodeSnapshot {
  id: string;
  kind: 'core' | 'custom';
  x: number;
  y: number;
  title?: string;
  body?: string;
  color?: string;
  agentBlock?: CustomBlockDefinition | null;
}

interface Feature2StageModelSnapshot {
  id: string;
  title: string;
  summary: string;
  code: string;
}

interface Feature2VoiceSnapshot {
  id: string;
  name: string;
  category: string;
  gender?: string;
}

interface Feature2WorkflowSnapshot {
  selectedNodeId: string;
  canvasNodes: Feature2CanvasNodeSnapshot[];
  stages: Feature2StageModelSnapshot[];
  promptInput: string;
  scriptGuidance: string;
  captionText: string;
  activeScriptText?: string;
  activeScriptTitle?: string;
  lastRunPrompt?: string;
  targetDurationSeconds: number;
  selectedVoiceId: string;
  variantVoiceIds?: string[];
  availableVoices?: Feature2VoiceSnapshot[];
  selectedGameplayPresetId: string;
  variantGameplayPresetIds?: string[];
  videoCount: number;
  scriptVariationMode?: 'same-script' | 'different-scripts';
  renderState: string;
}

const CORE_SEQUENCE = ['prompt', 'script', 'voice', 'gameplay', 'caption', 'music', 'render'];

function truncateText(value: string | undefined, maxLength: number) {
  const trimmed = String(value || '').replace(/\s+/g, ' ').trim();
  if (!trimmed) {
    return '';
  }

  return trimmed.length > maxLength ? `${trimmed.slice(0, maxLength - 1)}…` : trimmed;
}

export function buildFeature2WorkflowGraph(
  snapshot: Feature2WorkflowSnapshot
): WorkflowGraph {
  const stageMap = Object.fromEntries(snapshot.stages.map((stage) => [stage.id, stage])) as Record<
    string,
    Feature2StageModelSnapshot
  >;

  const nodes: WorkflowNode[] = snapshot.canvasNodes.map((node) => {
    const stage = stageMap[node.id];

    return node.kind === 'core'
      ? {
          id: node.id,
          type: node.id,
          kind: 'core' as const,
          label: stage?.title || node.id,
          description: stage?.summary || '',
          position: { x: node.x, y: node.y },
          params: {
            code: stage?.code || '',
            ...(node.id === 'prompt'
              ? {
                  promptInput: truncateText(snapshot.promptInput, 220),
                }
              : {}),
            ...(node.id === 'script'
              ? {
                  scriptGuidance: truncateText(snapshot.scriptGuidance, 260),
                  activeScriptTitle: truncateText(snapshot.activeScriptTitle, 80),
                  activeScriptText: truncateText(snapshot.activeScriptText, 520),
                }
              : {}),
            ...(node.id === 'caption'
              ? {
                  captionText: truncateText(snapshot.captionText, 120),
                }
              : {}),
            ...(node.id === 'voice'
              ? {
                  selectedVoiceId: snapshot.selectedVoiceId,
                  variantVoiceIds: snapshot.variantVoiceIds ?? [],
                  availableVoices: (snapshot.availableVoices ?? []).map((voice) => ({
                    id: voice.id,
                    name: voice.name,
                    category: voice.category,
                    gender: voice.gender ?? '',
                  })),
                }
              : {}),
            ...(node.id === 'gameplay'
              ? {
                  selectedGameplayPresetId: snapshot.selectedGameplayPresetId,
                  variantGameplayPresetIds: snapshot.variantGameplayPresetIds ?? [],
                  availableGameplayPresets: BRAINROT_GAMEPLAY_PRESETS.map((preset) => ({
                    id: preset.id,
                    label: preset.label,
                  })),
                }
              : {}),
          },
          metadata: {},
        }
      : {
          id: node.id,
          type: 'custom-block',
          kind: 'custom' as const,
          label: node.title || 'Custom block',
          description: node.body || '',
          position: { x: node.x, y: node.y },
          params: {
            color: node.color || '#06b6d4',
          },
          metadata: {
            provenance: node.agentBlock?.provenance ?? null,
          },
          isCustom: true,
          customBlockId: node.agentBlock?.blockId ?? node.id,
        };
  });

  const edges = CORE_SEQUENCE.slice(0, -1).map((nodeId, index) => ({
    id: `${nodeId}-${CORE_SEQUENCE[index + 1]}`,
    source: nodeId,
    target: CORE_SEQUENCE[index + 1],
  }));
  const customEdges = snapshot.canvasNodes.flatMap((node) => {
    if (node.kind !== 'custom') {
      return [];
    }

    const connectedNodeIds = [
      ...new Set(node.agentBlock?.provenance?.backingCoreNodes?.filter((nodeId) => CORE_SEQUENCE.includes(nodeId)) ?? []),
    ];

    if (!connectedNodeIds.length) {
      return [];
    }

    const [anchorNodeId, ...targetNodeIds] = connectedNodeIds;
    const links = [
      {
        id: `${anchorNodeId}-${node.id}`,
        source: anchorNodeId,
        target: node.id,
      },
    ];

    targetNodeIds.forEach((targetNodeId) => {
      links.push({
        id: `${node.id}-${targetNodeId}`,
        source: node.id,
        target: targetNodeId,
      });
    });

    return links;
  });

  return {
    feature: 'feature2',
    title: 'Feature 2 Workflow',
    selectedNodeId: snapshot.selectedNodeId,
    activeStageId: snapshot.selectedNodeId,
    nodes,
    edges: [...edges, ...customEdges],
    metadata: {
      promptInput: snapshot.promptInput,
      scriptGuidance: snapshot.scriptGuidance,
      captionText: snapshot.captionText,
      activeScriptTitle: truncateText(snapshot.activeScriptTitle, 80),
      activeScriptText: truncateText(snapshot.activeScriptText, 900),
      lastRunPrompt: truncateText(snapshot.lastRunPrompt, 220),
      targetDurationSeconds: snapshot.targetDurationSeconds,
      selectedVoiceId: snapshot.selectedVoiceId,
      variantVoiceIds: snapshot.variantVoiceIds ?? [],
      availableVoices: (snapshot.availableVoices ?? []).map((voice) => ({
        id: voice.id,
        name: voice.name,
        category: voice.category,
        gender: voice.gender ?? '',
      })),
      selectedGameplayPresetId: snapshot.selectedGameplayPresetId,
      variantGameplayPresetIds: snapshot.variantGameplayPresetIds ?? [],
      availableGameplayPresets: BRAINROT_GAMEPLAY_PRESETS.map((preset) => ({
        id: preset.id,
        label: preset.label,
      })),
      videoCount: snapshot.videoCount,
      scriptVariationMode: snapshot.scriptVariationMode ?? 'different-scripts',
      renderState: snapshot.renderState,
    },
  };
}
