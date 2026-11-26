// TypeScript port of mzk's literal Unicode similarity and weighted shortlist.
// Copyright (c) 2026 styayur. See licenses/MZK-MIT.txt.
const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
const letters = (s: string) => Array.from(segmenter.segment(Array.from(s.normalize('NFKC'), c => c.toLowerCase()).join('').normalize('NFKC')), g => g.segment).slice(0,256);

export function similarity(query: string, label: string): number {
  const a = letters(query), b = letters(label);
  if (!a.length || !b.length) return 0;
  if (a.length === b.length && a.every((g,i) => g === b[i])) return 1;
  const edit = Array.from({length:b.length+1}, (_,i)=>i);
  const lcs = new Uint16Array(b.length+1), run = new Uint16Array(b.length+1);
  let longest=0;
  for (let i=1;i<=a.length;i++) {
    let diagonalEdit=edit[0]!, diagonalLcs=0, diagonalRun=0;
    edit[0]=i;
    for (let j=1;j<=b.length;j++) {
      const oldEdit=edit[j]!, oldLcs=lcs[j]!, oldRun=run[j]!;
      const match=a[i-1]===b[j-1];
      edit[j]=Math.min(oldEdit+1,edit[j-1]!+1,diagonalEdit+Number(!match));
      lcs[j]=match ? diagonalLcs+1 : Math.max(oldLcs,lcs[j-1]!);
      run[j]=match ? diagonalRun+1 : 0;
      longest=Math.max(longest,run[j]!);
      diagonalEdit=oldEdit; diagonalLcs=oldLcs; diagonalRun=oldRun;
    }
  }
  const editScore=1-edit[b.length]!/Math.max(a.length,b.length);
  if(a.length>2 && longest<2 && editScore<.65)return 0;
  const left=new Set(a.filter(c=>c.trim())), right=new Set(b.filter(c=>c.trim()));
  const overlap=[...left].filter(c=>right.has(c)).length/Math.max(1,new Set([...left,...right]).size);
  return .30*editScore+.20*overlap+(.40*lcs[b.length]!+.60*longest)/(a.length+b.length);
}

export interface Track { id:string; title:string; artist:string; album:string; url:string }
export function chooseTrack(query:string, pool:readonly Track[], random=Math.random):Track|undefined {
  const seen=new Set<string>();
  const scored=pool.filter(t=>!seen.has(t.id) && seen.add(t.id)).map(track=>({
    track,score:Math.max(similarity(query,track.title),.85*similarity(query,track.artist),.70*similarity(query,track.album))
  })).filter(t=>t.score>=.48);
  const best=Math.max(...scored.map(t=>t.score));
  const candidates=scored.filter(t=>t.score>=best-.22).map(t=>({...t,weight:Math.exp((t.score-best)/.14)}));
  let ticket=random()*candidates.reduce((s,t)=>s+t.weight,0);
  return candidates.find(t=>(ticket-=t.weight)<=0)?.track ?? candidates.at(-1)?.track;
}
