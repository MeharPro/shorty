import type { Feature1EditingAdvice } from '../../types';
import type {
  CustomBlockDefinition,
  WorkflowEdge,
  WorkflowGraph,
  WorkflowNode,
} from './types';

interface Feature1CoreNodeSnapshot {
  id: string;
  label: string;
  description: string;
  x: number;
  y: number;
}

interface Feature1LogicBlockSnapshot {
  id: string;
  type: string;
  label: string;
  description: string;
  attachTo: string;
  x: number;
  y: number;
  note: string;
  tint: string;
  agentBlock?: CustomBlockDefinition | null;
}

interface Feature1WorkflowSnapshot {
  activeCoreNode: string;
  selectedNodeId?: string | null;
  coreNodes: Feature1CoreNodeSnapshot[];
  logicBlocks: Feature1LogicBlockSnapshot[];
  editingOptions: Feature1EditingAdvice;
  hasSource: boolean;
  hasTranscript: boolean;
  hasResult: boolean;
  clipCount: number;
  recommendedClipId: string | null;
}

export function buildFeature1WorkflowGraph(
  snapshot: Feature1WorkflowSnapshot
): WorkflowGraph {
  const nodes: WorkflowNode[] = [
    ...snapshot.coreNodes.map((node) => ({
      id: node.id,
      type: node.id,
      kind: 'core' as const,
      label: node.label,
      description: node.description,
      position: { x: node.x, y: node.y },
      params: {},
      metadata: {},
    })),
    ...snapshot.logicBlocks.map((block) => ({
      id: block.id,
      type: block.type,
      kind: 'custom' as const,
      label: block.label,
      description: block.description,
      position: { x: block.x, y: block.y },
      params: {
        note: block.note,
        tint: block.tint,
      },
      metadata: {
        attachTo: block.attachTo,
        provenance: block.agentBlock?.provenance ?? null,
      },
      isCustom: true,
      customBlockId: block.agentBlock?.blockId ?? block.id,
    })),
  ];

  const coreEdges: WorkflowEdge[] = snapshot.coreNodes.slice(0, -1).map((node, index) => ({
    id: `${node.id}-${snapshot.coreNodes[index + 1].id}`,
    source: node.id,
    target: snapshot.coreNodes[index + 1].id,
  }));

  const customEdges: WorkflowEdge[] = snapshot.logicBlocks.map((block) => ({
    id: `${block.attachTo}-${block.id}`,
    source: block.attachTo,
    target: block.id,
  }));

  return {
    feature: 'feature1',
    title: 'Feature 1 Workflow',
    selectedNodeId: snapshot.selectedNodeId ?? snapshot.logicBlocks[0]?.id ?? snapshot.activeCoreNode,
    activeStageId: snapshot.activeCoreNode,
    nodes,
    edges: [...coreEdges, ...customEdges],
    metadata: {
      editingOptions: snapshot.editingOptions,
      hasSource: snapshot.hasSource,
      hasTranscript: snapshot.hasTranscript,
      hasResult: snapshot.hasResult,
      clipCount: snapshot.clipCount,
      recommendedClipId: snapshot.recommendedClipId,
    },
  };
}
