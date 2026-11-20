import { DEFAULT_MODEL_CONFIG, type Perception, type PublicModelConfig, type TokenUsage } from './contracts';
export const validateModelConfig=(value:PublicModelConfig):PublicModelConfig=>{
  const endpoint=new URL(value.endpoint);
  if(endpoint.username||endpoint.password||endpoint.search||endpoint.hash)throw Error('Endpoint must not contain credentials, query or fragment.');
  const loopback=['localhost','127.0.0.1','[::1]'].includes(endpoint.hostname);
  if(endpoint.protocol!=='https:'&&!(endpoint.protocol==='http:'&&loopback&&value.provider==='custom'&&value.trusted))throw Error('HTTPS or an explicitly trusted loopback endpoint is required.');
  if(value.provider==='deepseek'&&(endpoint.origin!=='https://api.deepseek.com'||endpoint.pathname!=='/chat/completions'))throw Error('DeepSeek endpoint mismatch.');
  if(value.provider==='openai'&&(endpoint.origin!=='https://api.openai.com'||endpoint.pathname!=='/v1/chat/completions'))throw Error('OpenAI endpoint mismatch.');
  if(value.provider==='custom'&&!value.trusted)throw Error('Explicit trust is required for a custom endpoint.');
  if(!['deepseek','openai','custom'].includes(value.provider)||!/^[a-zA-Z0-9._:/-]{1,100}$/.test(value.model))throw Error('Invalid model configuration.');
  for(const [number,min,max]of[[value.intervalSeconds,2,60],[value.maxRequests,1,100],[value.tokenBudget,1000,200000],[value.timeoutMs,1000,20000]]){
    if(!Number.isFinite(number)||number<min||number>max)throw Error('Invalid request budget.');
  }
  return{...value,endpoint:endpoint.href,maxRequests:Math.floor(value.maxRequests),tokenBudget:Math.floor(value.tokenBudget)};
};
export interface ModelStats { connected:boolean; pending:boolean; requests:number; successes:number; failures:number; cancellations:number; reservedTokens:number; usage:TokenUsage; lastLatencyMs:number|null; error:string|null }
export interface ModelReply { decision:unknown; usage:TokenUsage; latencyMs:number; provider:string; model:string }
const PROMPT = `You plan a small aircraft team in a real flight game. Return ONLY a json object, no code or tools.
Required exact keys: requestId, epoch, ttl (1..12 seconds), risk (0..riskLimit), formation (wedge|line|spread), orders (1..3), reason (brief Chinese, <=100 characters).
Each order has exact keys agents (unique active integer IDs), action (FOLLOW|LEAD|REGROUP|SCOUT|PROTECT|RELAY|HOLD), targetId (a published target ID or null for FOLLOW/REGROUP/PROTECT). Never invent a target, agent, trust value or key.
Use perception, hazards, grace, trust, charges and recent outcomes to choose actual cooperation. In clear space choose useful lead/scout/formation; near obstacles choose safe routes/regroup/protect. When grace is draining and a surface partner exists, prepare RELAY with sufficient ttl. RELAY must target that partner's surface ID and include the partner. HOLD loiters at a target; local physics handles safety. No chat.
Example json: {"requestId":"copy perception.requestId","epoch":0,"ttl":10,"risk":0.3,"formation":"wedge","orders":[{"agents":[1],"action":"FOLLOW","targetId":null}],"reason":"保持安全编队"}`;
const safeNumber=(value:unknown):number=>typeof value==='number'&&Number.isFinite(value)&&value>=0?Math.min(1e8,value):0;
const readUsage=(value:unknown):TokenUsage=>{
  const data=(value??{}) as Record<string,unknown>;return{input:safeNumber(data.prompt_tokens),output:safeNumber(data.completion_tokens),total:safeNumber(data.total_tokens),cached:safeNumber(data.prompt_cache_hit_tokens)};
};

/** BYOK stays in a private runtime field. This adapter never logs request/response bodies. */
export class ModelClient {
  #key='';#generation=0;#controller:AbortController|null=null;
  #config:PublicModelConfig={...DEFAULT_MODEL_CONFIG};#lastRequest=-Infinity;#blockedUntil=0;
  #stats:ModelStats={connected:false,pending:false,requests:0,successes:0,failures:0,cancellations:0,reservedTokens:0,usage:{input:0,output:0,total:0,cached:0},lastLatencyMs:null,error:null};
  public constructor(private readonly transport:typeof fetch=(input,init)=>fetch(input,init),private readonly clock:()=>number=()=>performance.now()){}
  public connect(config:PublicModelConfig,key:string):void{
    const next=validateModelConfig(config);
    if(!/^[^\s\x00-\x1f\x7f]{8,4096}$/.test(key)||next.endpoint.includes(key)||next.model.includes(key))throw Error('Invalid API key.');
    this.cancel();this.#generation++;this.#config=next;this.#key=key;this.#stats.connected=true;this.#stats.error=null;
  }
  public disconnect():void{this.#generation++;this.#key='';this.#stats.connected=false;this.cancel();}
  public cancel():void{this.#controller?.abort();}
  public snapshot():ModelStats{return{...this.#stats,usage:{...this.#stats.usage}};}
  public publicConfig():Omit<PublicModelConfig,'endpoint'>&{origin:string}{const{endpoint,...rest}=this.#config;return{...rest,origin:new URL(endpoint).origin};}
  public canRequest():boolean{
    if(this.#stats.requests>=this.#config.maxRequests){this.#stats.error='request-budget';return false;}
    if(this.#stats.reservedTokens+5000>this.#config.tokenBudget){this.#stats.error='token-budget';return false;}
    return this.#stats.connected&&!this.#stats.pending&&this.clock()-this.#lastRequest>=this.#config.intervalSeconds*1000&&this.clock()>=this.#blockedUntil;
  }
  public async request(perception:Perception):Promise<ModelReply|null>{
    if(!this.canRequest())return null;
    if(this.#stats.requests>=this.#config.maxRequests){this.#stats.error='request-budget';return null;}
    const body={model:this.#config.model,messages:[{role:'system',content:PROMPT},{role:'user',content:JSON.stringify(perception)}],
      response_format:{type:'json_object'},max_tokens:512,temperature:0.2,stream:false,
      ...(this.#config.provider==='deepseek'?{thinking:{type:'disabled'}}:{})};
    const serialized=JSON.stringify(body);const bytes=new TextEncoder().encode(serialized).length;
    if(bytes>12000){this.#stats.error='request-size';return null;}
    const reserve=bytes+768;
    if(this.#stats.reservedTokens+reserve>this.#config.tokenBudget){this.#stats.error='token-budget';return null;}
    const key=this.#key;const generation=this.#generation;const controller=new AbortController();this.#controller=controller;
    const started=this.clock();this.#lastRequest=started;this.#stats.pending=true;this.#stats.requests++;this.#stats.reservedTokens+=reserve;
    let timedOut=false;const timeout=setTimeout(()=>{timedOut=true;controller.abort();},this.#config.timeoutMs);
    try{
      const response=await this.transport(this.#config.endpoint,{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${key}`},
        body:serialized,signal:controller.signal,redirect:'error',credentials:'omit',referrerPolicy:'no-referrer'});
      if(generation!==this.#generation||controller.signal.aborted)throw Error('cancelled');
      if(!response.ok){
        if(response.status===429)this.#blockedUntil=this.clock()+Math.max(10000,Math.min(120000,Number(response.headers.get('retry-after')??10)*1000||10000));
        if(response.status===401||response.status===403){this.#key='';this.#stats.connected=false;}
        throw Error(`http-${response.status}`);
      }
      const reader=response.body?.getReader();if(!reader)throw Error('empty-response');
      const chunks:Uint8Array[]=[];let size=0;
      while(true){const chunk=await reader.read();if(chunk.done)break;size+=chunk.value.byteLength;if(size>65536){await reader.cancel();throw Error('response-size');}chunks.push(chunk.value);}
      const data=new Uint8Array(size);let offset=0;for(const chunk of chunks){data.set(chunk,offset);offset+=chunk.byteLength;}
      const text=new TextDecoder().decode(data);
      const parsed=JSON.parse(text) as {choices?:Array<{message?:{content?:unknown}}> ;usage?:unknown};
      if(JSON.stringify(parsed).includes(JSON.stringify(key).slice(1,-1)))throw Error('sensitive-response');
      const content=parsed.choices?.[0]?.message?.content;
      if(typeof content!=='string'||!content.trim())throw Error('empty-decision');
      const decision:unknown=JSON.parse(content);const usage=readUsage(parsed.usage);
      if(generation!==this.#generation||controller.signal.aborted)throw Error('cancelled');
      for(const field of ['input','output','total','cached']as const)this.#stats.usage[field]+=usage[field];
      this.#stats.successes++;this.#stats.error=null;this.#stats.lastLatencyMs=Math.max(0,this.clock()-started);
      return{decision,usage,latencyMs:this.#stats.lastLatencyMs,provider:this.#config.provider,model:this.#config.model};
    }catch(error){
      if(generation!==this.#generation||controller.signal.aborted&&!timedOut){this.#stats.cancellations++;return null;}
      const known=error instanceof Error?error.message:'';
      this.#stats.error=timedOut?'timeout':/^(http-\d{3}|response-size|sensitive-response|empty-response|empty-decision)$/.test(known)?known:'invalid-or-network-response';
      this.#stats.failures++;this.#blockedUntil=Math.max(this.#blockedUntil,this.clock()+Math.min(60000,2000*2**Math.min(4,this.#stats.failures)));
      return null;
    }finally{clearTimeout(timeout);if(this.#controller===controller){this.#controller=null;this.#stats.pending=false;}}
  }
}
