import { DEFAULT_MODEL_CONFIG, type PublicModelConfig } from '../ai/contracts';
import type { SymbiosisRuntime } from '../ai/SymbiosisRuntime';
export const bindModelSettings=(runtime:SymbiosisRuntime, onIssue: (message: string) => void):(()=>void)=>{
  const panel=document.createElement('details');panel.className='model-settings';
  panel.innerHTML=`<summary>AI 模型</summary>
    <div class="setting-heading"><label>提供商 <select id="ai-provider"><option value="deepseek">DeepSeek</option><option value="openai">OpenAI</option><option value="custom">自定义</option></select></label><button class="setting-help" type="button" aria-label="模型与 API 帮助" data-help-section="guide-ai">?</button></div>
    <label>模型 <input id="ai-model" value="deepseek-flash" maxlength="100" autocomplete="off"></label>
    <label>端点 <input id="ai-endpoint" type="url" value="https://api.deepseek.com/chat/completions" autocomplete="off" spellcheck="false"></label>
    <label><input id="ai-trusted" type="checkbox">我信任自定义端点接收此 Key 和飞行状态</label>
    <label>API Key <input id="ai-key" type="password" autocomplete="off" spellcheck="false" placeholder="仅当前页面"></label>
    <label>规划间隔（秒）<input id="ai-interval" type="number" min="2" max="60" value="8"></label>
    <label>页面调用上限 <input id="ai-budget" type="number" min="1" max="100" value="20"></label>
    <label>Token 上限 <input id="ai-tokens" type="number" min="1000" max="200000" value="50000"></label>
    <label>超时（毫秒）<input id="ai-timeout" type="number" min="1000" max="20000" value="8000"></label>
    <div class="world-inline-actions"><button id="ai-connect" class="utility-button" type="button">连接</button><button id="ai-disconnect" class="utility-button" type="button">断开并删除 Key</button></div>
    <p id="ai-message" class="setting-status" role="status"></p>`;
  document.querySelector('#advanced-flight-settings')!.append(panel);
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
      runtime.client.connect(config,key);message.textContent='';
    }catch{message.textContent='配置无效。请检查端点、信任选项、模型和预算。';}
  });
  panel.querySelector('#ai-disconnect')!.addEventListener('click',()=>{runtime.client.disconnect();runtime.invalidate();input('key').value='';message.textContent='已清除 Key。';});
  const status=document.createElement('p');status.id='cooperation-status';status.className='setting-status';status.setAttribute('role','status');panel.append(status);
  let previousError: string | null = null;
  return()=>{
    const s=runtime.snapshot();
    const issue = s.model.error ?? null;
    if (issue && issue !== previousError) onIssue(`模型协作暂停，伴机继续本地飞行。 ${issue}`);
    previousError = issue;
    if (!panel.open || !panel.getClientRects().length) return;
    const text=s.model.connected
      ? `${s.config?.model ?? '模型'} 已连接 · ${s.model.requests} 次 · ${s.model.usage.total} tokens`
      : '本地伴飞';
    const visibleStatus=s.model.error ? `${text} · ${s.model.error}` : text;
    if(status.textContent!==visibleStatus)status.textContent=visibleStatus;
  };
};
