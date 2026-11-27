export const speechActs = [
  'greeting', 'identity', 'background', 'motivation', 'recall', 'flight', 'observations', 'mission',
] as const;
export type SpeechAct = (typeof speechActs)[number];
export type RadioUtterance = { agentId: number; act: SpeechAct };
export type WireUtterance = RadioUtterance | { agentId: number; text: string } | { agentId: number; freeText: string };

/** The legacy text field proves envelope compatibility. Its contents never cross this boundary. */
export function readUtterance(raw: unknown): { agentId: number; act?: SpeechAct; freeText?: string } | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  if (Object.keys(raw).length !== 2 || !Object.hasOwn(raw, 'agentId')) return null;
  const line = raw as Record<string, unknown>;
  if (typeof line.agentId !== 'number' || !Number.isInteger(line.agentId)) return null;
  if (Object.hasOwn(line, 'act')) {
    const act = speechActs.find(candidate => candidate === line.act);
    return act ? { agentId: line.agentId, act } : null;
  }
  if (Object.hasOwn(line, 'freeText')) {
    const text = line.freeText;
    if (typeof text !== 'string' || !text.trim() || text.length > 140 || /[\x00-\x1f<>]/.test(text)) return null;
    return { agentId: line.agentId, freeText: text.trim() };
  }
  if (!Object.hasOwn(line, 'text') || typeof line.text !== 'string') return null;
  if (!line.text.trim() || line.text.length > 140 || /[\x00-\x1f]/.test(line.text)) return null;
  return { agentId: line.agentId };
}
