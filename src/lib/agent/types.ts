export type WorkflowFeatureId = 'feature1' | 'feature2';
export type WorkflowRole = 'user' | 'assistant' | 'system';
export type WorkflowNodeKind = 'core' | 'custom';

export interface WorkflowNodePosition {
  x: number;
  y: number;
}

export interface WorkflowNode {
  id: string;
  type: string;
  kind: WorkflowNodeKind;
  label: string;
  description?: string;
  position: WorkflowNodePosition;
  params: Record<string, unknown>;
  metadata: Record<string, unknown>;
  branchId?: string;
  variantId?: string;
  isCustom?: boolean;
  customBlockId?: string;
}

export interface WorkflowEdge {
  id: string;
  source: string;
  target: string;
}

export interface WorkflowGraph {
  feature: WorkflowFeatureId;
  title: string;
  selectedNodeId?: string | null;
  activeStageId?: string | null;
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  metadata: Record<string, unknown>;
}

export interface CustomBlockSchemaField {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'enum' | 'object' | 'array';
  required?: boolean;
  description?: string;
  options?: string[];
}

export interface CustomBlockSchema {
  inputs: CustomBlockSchemaField[];
  outputs: CustomBlockSchemaField[];
  paramsSchema: CustomBlockSchemaField[];
}

export interface CustomBlockProvenance {
  createdFromPrompt: string;
  creationReason: string;
  influencedBy: string[];
  backingCoreNodes: string[];
}

export interface CustomBlockDefinition {
  blockId: string;
  blockName: string;
  description: string;
  blockKind: string;
  schema: CustomBlockSchema;
  defaultParams: Record<string, unknown>;
  internalPlan: string[];
  editableFields: string[];
  provenance: CustomBlockProvenance;
}

export type GraphActionType =
  | 'set_active_stage'
  | 'set_prompt_value'
  | 'set_script_guidance'
  | 'set_caption_text'
  | 'set_target_duration'
  | 'set_variant_count'
  | 'update_node_params'
  | 'create_custom_block'
  | 'update_custom_block'
  | 'remove_custom_block'
  | 'queue_transcription'
  | 'queue_execution';

export interface GraphAction {
  id: string;
  type: GraphActionType;
  targetNodeId?: string;
  reason: string;
  params?: Record<string, unknown>;
  customBlock?: CustomBlockDefinition;
}

export interface RetrievalHit {
  id: string;
  kind: string;
  source: string;
  text: string;
  similarity: number;
  tags: string[];
}

export interface ScoreBreakdown {
  retention: number;
  hook: number;
  pacing: number;
  alignment: number;
  complexity: number;
  overall: number;
}

export interface CandidateWorkflow {
  id: string;
  label: string;
  summary: string;
  branchId?: string;
  variantId?: string;
  actions: GraphAction[];
  scoreBreakdown: ScoreBreakdown;
}

export interface OptimizationDecision {
  selectedCandidateId: string | null;
  objective: string;
  reason: string;
  constraints: string[];
}

export interface AgentValidationResult {
  ok: boolean;
  issues: string[];
}

export interface AgentExecutionPlan {
  shouldTranscribe: boolean;
  shouldRun: boolean;
  notes: string[];
}

export interface AgentCommandResponse {
  feature: WorkflowFeatureId;
  model: string;
  fallbackUsed: boolean;
  warning?: string;
  summary: string;
  validation: AgentValidationResult;
  retrievalHits: RetrievalHit[];
  actions: GraphAction[];
  customBlocks: CustomBlockDefinition[];
  candidates: CandidateWorkflow[];
  optimization: OptimizationDecision;
  execution: AgentExecutionPlan;
}

export interface WorkflowChatMessage {
  id: string;
  role: WorkflowRole;
  content: string;
  timestamp: string;
}
