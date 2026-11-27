export const identities = [
  {
    id: 1,
    en: 'I charted routes between sky cities. I still carry charts of skies that have vanished.',
    zh: '我曾为高空城市测绘航路。我的航图里还留着一些已经消失的天空。',
  },
  {
    id: 2,
    en: 'Search and rescue, hazardous airspace. I learned to count the aircraft on the way home.',
    zh: '我曾在危险空域搜救。返航时，我总会把编队里的飞机再数一遍。',
  },
  {
    id: 3,
    en: 'I surveyed unfamiliar worlds and unusual landforms. I like seeing what lies beyond the ridge.',
    zh: '我曾勘察陌生世界与异常地貌。我总想知道山脊的另一侧有什么。',
  },
] as const;

export interface DialogueTurn {
  agent: number;
  epoch: number;
  pilot: string;
  reply: string;
}
export class CompanionMemory {
  #turns: (DialogueTurn & { share: boolean })[] = [];
  public add(turn: DialogueTurn, share: boolean): void {
    this.#turns.push({ ...turn, share });
    if (this.#turns.length > 10) this.#turns.shift();
  }
  public recent(agent: number) {
    return [...this.#turns].reverse().find((turn) => turn.agent === agent);
  }
  public context(): DialogueTurn[] {
    return this.#turns
      .filter((turn) => turn.share)
      .map(({ agent, epoch, pilot, reply }) => ({ agent, epoch, pilot, reply }));
  }
  public clear(): void {
    this.#turns = [];
  }
  public get size() {
    return this.#turns.length;
  }
}
