import { DEFAULT_MODEL_CONFIG, type PublicModelConfig } from '../ai/contracts';
import type { SymbiosisRuntime } from '../ai/SymbiosisRuntime';
export const bindModelSettings=(runtime:SymbiosisRuntime):(()=>void)=>{
  const panel=document.createElement('details');panel.className='model-settings';
  panel.innerHTML=`<summary>模型协作 · 自带 API Key</summary>
    <p>未连接时使用 Local Autonomous Controller。Key 仅留在当前页内存；网页脚本在运行时仍可能读取。只发送必要飞行状态，不发送本机模型。</p>
    <label>提供商 <select id="ai-provider"><option value="deepseek">DeepSeek</option><option value="openai">OpenAI</option><option value="custom">受信任兼容端点</option></select></label>
    <label>模型 <input id="ai-model" value="deepseek-flash" maxlength="100" autocomplete="off"></label>
    <label>Endpoint <input id="ai-endpoint" type="url" value="https://api.deepseek.com/chat/completions" autocomplete="off" spellcheck="false"></label>
    <label><input id="ai-trusted" type="checkbox">我信任自定义端点接收此 Key 和飞行状态</label>
    <label>API Key <input id="ai-key" type="password" autocomplete="off" spellcheck="false" placeholder="仅当前页面"></label>
    <label>间隔（秒）<input id="ai-interval" type="number" min="2" max="60" value="8"></label>
    <label>页面调用上限 <input id="ai-budget" type="number" min="1" max="100" value="20"></label>
    <label>保守 Token 预算 <input id="ai-tokens" type="number" min="1000" max="200000" value="50000"></label>
    <label>超时（毫秒）<input id="ai-timeout" type="number" min="1000" max="20000" value="8000"></label>
    <div><button id="ai-connect" type="button">连接</button> <button id="ai-disconnect" type="button">断开并删除 Key</button></div>
    <p id="ai-message" role="status">没有官方代管推理；服务商需允许浏览器直连。自定义代理须自行明确信任。</p>`;
  document.querySelector('#rules-panel')!.append(panel);
  const input=(id:string)=>panel.querySelector<HTMLInputElement>(`#ai-${id}`)!;
  const provider=panel.querySelector<HTMLSelectElement>('#ai-provider')!;
  const message=panel.querySelector<HTMLElement>('#ai-message')!;
  provider.addEventListener('change',()=>{
    if(provider.value==='deepseek'){input('endpoint').value=DEFAULT_MODEL_CONFIG.endpoint;input('model').value='deepseek-flash';}
    if(provider.value==='openai'){input('endpoint').value='https://api.openai.com/v1/chat/completions';input('model').value='gpt-4.1-mini';}
  });
  panel.querySelector('#ai-connect')!.addEventListener('click',()=>{
    const key=input('key').value;input('key').value='';
    try{
      const config:PublicModelConfig={provider:provider.value as PublicModelConfig['provider'],endpoint:input('endpoint').value.trim(),model:input('model').value.trim(),trusted:input('trusted').checked,
        intervalSeconds:Number(input('interval').value),maxRequests:Number(input('budget').value),tokenBudget:Number(input('tokens').value),timeoutMs:Number(input('timeout').value)};
      runtime.client.connect(config,key);message.textContent='已连接；开始飞行后规划。计费由服务商决定，页面预算不会因重试或重新连接而重置。';
    }catch{message.textContent='配置无效：检查 HTTPS、端点信任、模型及预算。Key 已从输入框清除。';}
  });
  panel.querySelector('#ai-disconnect')!.addEventListener('click',()=>{runtime.client.disconnect();runtime.invalidate();input('key').value='';message.textContent='已删除内存 Key，恢复本地伴飞。';});
  const status=document.createElement('div');status.id='cooperation-status';status.className='cooperation-status';status.setAttribute('role','status');document.querySelector('#companion-status')!.after(status);
  return()=>{
    const s=runtime.snapshot();status.hidden=runtime.team.agents.length===0;
    const text=`Trust ${Math.round(s.trust.value*100)} · Relay ${s.relay.charges}/2 · ${Math.max(0,Math.ceil(s.relay.cooldownUntil-s.time))}s\n${s.model.connected?'模型已连接':'本地伴飞'} · ${s.model.requests} 次 · ${s.model.usage.total} tokens${s.model.error?` · ${s.model.error}`:''}`;
    if(status.textContent!==text)status.textContent=text;
  };
};
