import type { SkyJourney } from '../game/skyJourney';
import { journeyProfile } from '../world/journeyWorlds';
const KEY='skimmer-scraper.journey.v3';
const labels={ASCENT:'持续爬升，穿越天穹',THRESHOLD:'抵达天穹',INVERSION:'天空翻转',WORLD_SWAP:'迎接新世界',DIVE:'编队俯冲',RECOVERY:'重新展开编队'};
export class JourneyHud {
 private readonly panel=document.createElement('div');private readonly label=document.createElement('span');
 private readonly veil=document.createElement('div');
 private readonly skip=document.createElement('button');private readonly egg=document.createElement('aside');
 public unlocked=false;public triggers=0;private celebrated=false;
 private eggUntil=0;
 public constructor(onSkip:()=>void){
  try{this.unlocked=JSON.parse(localStorage.getItem(KEY)??'{}').fifthUnlocked===true;}catch{/* optional record */}
  this.panel.id='journey-status';this.panel.className='journey-status';this.panel.setAttribute('role','status');
  this.skip.id='journey-skip';this.skip.type='button';this.skip.textContent='跳过转场';this.skip.addEventListener('click',onSkip);this.panel.append(this.label,this.skip);
  this.egg.id='journey-easter-egg';this.egg.className='journey-egg';this.egg.hidden=true;
  const text=document.createElement('p');text.textContent='第五次穿越 · 天空记得同伴\nSkimmer-Scraper · styayur';
  const dismiss=document.createElement('button');dismiss.type='button';dismiss.id='journey-egg-dismiss';dismiss.textContent='继续飞行';dismiss.addEventListener('click',()=>{this.egg.hidden=true;});this.egg.append(text,dismiss);
  document.querySelector('#app')?.append(this.panel,this.egg);
  if(!this.panel.isConnected)document.body.append(this.panel,this.egg);
  this.veil.className='sky-veil';this.veil.setAttribute('aria-hidden','true');document.body.append(this.veil);
 }
 public reset():void{this.triggers=0;this.celebrated=false;this.egg.hidden=true;}
 public completed(index:number,time:number):void{
  if(index!==5||this.celebrated)return;this.celebrated=true;this.triggers++;
  this.egg.hidden=this.unlocked;this.unlocked=true;this.eggUntil=time+8;
  try{localStorage.setItem(KEY,JSON.stringify({version:1,fifthUnlocked:true}));}catch{/* optional */}
 }
 public update(journey:SkyJourney,running:boolean):void{
  const p=journey.progress;
  const opacity=journey.phase==='WORLD_SWAP'?1:journey.phase==='INVERSION'?Math.max(0,(p-.65)/.35):journey.phase==='DIVE'?Math.max(0,1-p/.35):0;
  this.veil.style.opacity=String(running?opacity:0);
  this.panel.hidden=!running;this.skip.hidden=!journey.active;
  this.skip.disabled=journey.phase==='WORLD_SWAP';
  this.label.textContent=`${journey.worldIndex?`${journey.worldIndex} · ${journeyProfile(journey.worldIndex).name}`:'樱色起航'} · ${labels[journey.phase]}${journey.active?'':` ${520} m`}`;
  if(!running)this.egg.hidden=true;
  if(journey.time>=this.eggUntil)this.egg.hidden=true;
 }
 public snapshot(){return{easterEggUnlocked:this.unlocked,easterEggTriggers:this.triggers,easterEggVisible:!this.egg.hidden};}
}
