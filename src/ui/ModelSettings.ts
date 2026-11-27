import { t, catalogs, selectedLocale, type MessageKey } from '../i18n';
import { DEFAULT_MODEL_CONFIG, type PublicModelConfig } from '../ai/contracts';
import type { SymbiosisRuntime } from '../ai/SymbiosisRuntime';
function modelError(code: string): string {
  if (/^http-\d{3}$/.test(code)) return t('model.error.http', { status: code.slice(5) });
  const key = `model.error.${code}`;
  return Object.hasOwn(catalogs[selectedLocale], key) ? catalogs[selectedLocale][key as MessageKey] : code;
}

export const bindModelSettings=(runtime:SymbiosisRuntime, onIssue: (message: string) => void):(()=>void)=>{
  const panel=document.createElement('details');panel.className='model-settings';
  panel.innerHTML=`<summary>${t('modelSettings.aiModel')}</summary>
    <div class="setting-heading"><label>${t('modelSettings.provider')} <select id="ai-provider"><option value="deepseek">DeepSeek</option><option value="openai">OpenAI</option><option value="custom">${t('modelSettings.custom')}</option></select></label><button class="setting-help" type="button" aria-label="${t('modelSettings.modelAndAPIHelp')}" data-help-section="guide-ai">?</button></div>
    <label>${t('modelSettings.model')} <input id="ai-model" value="deepseek-flash" maxlength="100" autocomplete="off"></label>
    <label>${t('modelSettings.endpoint')} <input id="ai-endpoint" type="url" value="https://api.deepseek.com/chat/completions" autocomplete="off" spellcheck="false"></label>
    <label><input id="ai-trusted" type="checkbox">${t('modelSettings.iTrustThisEndpointWithMyKey')}</label>
    <label>API Key <input id="ai-key" type="password" autocomplete="off" spellcheck="false" placeholder="${t('modelSettings.thisPageOnly')}"></label>
    <label>${t('modelSettings.planningIntervalS')}<input id="ai-interval" type="number" min="2" max="60" value="8"></label>
    <label>${t('modelSettings.requestsPerPage')} <input id="ai-budget" type="number" min="1" max="100" value="20"></label>
    <label>${t('modelSettings.tokenLimit')} <input id="ai-tokens" type="number" min="1000" max="200000" value="50000"></label>
    <label>${t('modelSettings.timeoutMs')}<input id="ai-timeout" type="number" min="1000" max="20000" value="8000"></label>
    <div class="world-inline-actions"><button id="ai-connect" class="utility-button" type="button">${t('modelSettings.connect')}</button><button id="ai-disconnect" class="utility-button" type="button">${t('modelSettings.disconnectAndClearKey')}</button></div>
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
    }catch{message.textContent=t('modelSettings.invalidConfig');}
  });
  panel.querySelector('#ai-disconnect')!.addEventListener('click',()=>{runtime.disconnectModel();input('key').value='';message.textContent=t('modelSettings.keyCleared');});
  const status=document.createElement('p');status.id='cooperation-status';status.className='setting-status';status.setAttribute('role','status');panel.append(status);
  let previousError: string | null = null;
  return()=>{
    const issue = runtime.client.lastError;
    if (issue && issue !== previousError) onIssue(t('modelSettings.assistancePaused', { issue: modelError(issue) }));
    previousError = issue;
    if (!panel.open || !panel.getClientRects().length) return;
    const model=runtime.client.snapshot();
    const text=model.connected
      ? t('modelSettings.connected', { model: runtime.client.publicConfig().model, requests: model.requests, tokens: model.usage.total })
      : t('modelSettings.localWingmates');
    const visibleStatus=issue ? `${text} · ${modelError(issue)}` : text;
    if(status.textContent!==visibleStatus)status.textContent=visibleStatus;
  };
};
