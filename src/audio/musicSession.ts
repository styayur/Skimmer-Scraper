import { chooseTrack, type Track } from './mzkSelection';

const pools = {city:'City',dragonspine:'Dragonspine',forge:'WorldForge',local:'Local'} as const;
export type MusicWorld = keyof typeof pools;
export class MusicSession {
  private media:HTMLAudioElement|null=null;
  private world:MusicWorld='city';
  private active=false;
  private ducked=false;
  private volume=.35;
  private id='';
  private files:Track[]=[];
  public enabled=false;
  public status='';
  public setEnabled(value:boolean){
    this.enabled=value;
    if(!value)this.stop();
    else if(this.active)this.next();
  }
  public setFiles(files:File[]){
    this.stop();
    for(const file of this.files)URL.revokeObjectURL(file.url);
    this.files=files.map((f,i)=>({id:'file-'+i,title:'Local',artist:'',album:'',url:URL.createObjectURL(f)}));
    if(this.enabled && this.active)this.next();
  }
  public setVolume(value:number){this.volume=Math.max(0,Math.min(1,value));}
  public next(){
    if(!this.enabled)return;
    this.stop();
    const title=pools[this.world];
    const builtins=[0,1].map(i=>({id:this.world+i,title:title+(i?' II':''),artist:'Skimmer-Scraper',album:title,url:'./music/'+this.world+'-'+i+'.opus'}));
    const pool=this.files.length?this.files:builtins;
    const track=chooseTrack(this.files.length?'Local':title,pool.filter(t=>pool.length===1||t.id!==this.id));
    if(!track){this.status='暂无可用音乐。';return;}
    this.id=track.id;
    const media=new Audio(track.url);
    this.media=media;
    media.volume=this.volume*(this.ducked?.25:1);
    media.onended=()=>{if(this.media===media && this.active)this.next();};
    media.onerror=()=>{if(this.media===media){this.stop();this.status='音源不可用，可选择本地音乐。';}};
    if(this.active)this.play(media);
  }
  private play(media:HTMLAudioElement){
    void media.play().then(()=>{if(this.media===media)this.status='';},()=>{
      if(this.media===media && this.active){this.stop();this.status='音乐未能播放，可重新开启或选择本地文件。';}
    });
  }
  public update(world:MusicWorld,active:boolean,ducked:boolean,dt:number){
    const wasActive=this.active;
    this.active=active;this.ducked=ducked;
    if(world!==this.world){this.stop();this.world=world;this.id='';this.status='';}
    if(!this.enabled)return;
    if(!active){if(wasActive)this.media?.pause();return;}
    if(!this.media){if(!this.status)this.next();return;}
    if(!wasActive)this.play(this.media);
    const target=this.volume*(ducked?.25:1);
    this.media.volume+=(target-this.media.volume)*(1-Math.exp(-Math.max(0,dt)/180));
  }
  public snapshot() {
    return { enabled: this.enabled, active: this.active, world: this.world, ducked: this.ducked,
      selected: this.id, playing: this.media !== null && !this.media.paused,
      mediaTime: this.media?.currentTime ?? 0, volume: this.media?.volume ?? 0, status: this.status };
  }
  private stop(){
    const media=this.media;this.media=null;this.status='';
    if(media){media.onended=null;media.onerror=null;media.pause();media.removeAttribute('src');media.load();}
  }
  public dispose(){this.setEnabled(false);this.setFiles([]);}
}
