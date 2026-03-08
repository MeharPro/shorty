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

interface Feature2WorkflowSnapshot {
  selectedNodeId: string;
  canvasNodes: Feature2CanvasNodeSnapshot[];
  stages: Feature2StageModelSnapshot[];
  promptInput: string;
  scriptGuidance: string;
  captionText: string;
  targetDurationSeconds: number;
  selectedVoiceId: string;
  selectedGameplayPresetId: string;
  videoCount: number;
  renderState: string;
}

const CORE_SEQUENCE = ['prompt', 'script', 'voice', 'gameplay', 'caption', 'music', 'render'];

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

  return {
    feature: 'feature2',
    title: 'Feature 2 Workflow',
    selectedNodeId: snapshot.selectedNodeId,
    activeStageId: snapshot.selectedNodeId,
    nodes,
    edges,
    metadata: {
      promptInput: snapshot.promptInput,
      scriptGuidance: snapshot.scriptGuidance,
      captionText: snapshot.captionText,
      targetDurationSeconds: snapshot.targetDurationSeconds,
      selectedVoiceId: snapshot.selectedVoiceId,
      selectedGameplayPresetId: snapshot.selectedGameplayPresetId,
      videoCount: snapshot.videoCount,
      renderState: snapshot.renderState,
    },
  };
}
