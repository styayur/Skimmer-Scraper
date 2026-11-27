import type { Vec3 } from '../core/math';
export const ACTIONS = ['FOLLOW','LEAD','REGROUP','SCOUT','PROTECT','RELAY','HOLD'] as const;
export type AgentAction = typeof ACTIONS[number];
export interface PerceivedTarget {
  id: string; kind: 'route' | 'surface' | 'player' | 'structure' | 'floating-island';
  position: Vec3; clearance: number | null; agentId?: number;
  capabilities?: readonly ('inspect' | 'glide')[];
}
export interface Perception {
  requestId: string; epoch: number; time: number; seed: number;
  player: { position: Vec3; velocity: Vec3; grace: number; graceLimit: number; surfaceDistance: number | null; mode: 'challenge' | 'free' };
  trust: number; riskLimit: number; charges: number; relayReady: boolean;
  agents: Array<{ id: number; position: Vec3; velocity: Vec3; task: string; surfaceDistance: number | null; deployed: boolean }>;
  targets: PerceivedTarget[];
  memory: Array<{ event: string; action: string; progress: number }>;
}
export interface TeamOrder { agents: number[]; action: AgentAction; targetId: string | null }
export interface TeamPlan { requestId: string; epoch: number; ttl: number; risk: number; formation: 'wedge' | 'line' | 'spread'; orders: TeamOrder[]; reason: string }
export interface ResolvedOrder extends TeamOrder { target: Vec3 }
export interface ValidatedPlan extends TeamPlan { resolved: ResolvedOrder[] }
export interface TokenUsage { input: number; output: number; total: number; cached: number }
export interface PublicModelConfig {
  provider: 'deepseek' | 'openai' | 'custom'; endpoint: string; model: string; trusted: boolean;
  intervalSeconds: number; maxRequests: number; tokenBudget: number; timeoutMs: number;
}
export const DEFAULT_MODEL_CONFIG: PublicModelConfig = {
  provider: 'deepseek', endpoint: 'https://api.deepseek.com/chat/completions', model: 'deepseek-flash', trusted: false,
  intervalSeconds: 8, maxRequests: 20, tokenBudget: 50_000, timeoutMs: 8_000,
};
