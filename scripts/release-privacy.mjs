import {readFileSync,readdirSync,writeFileSync} from 'node:fs';
import {join,relative} from 'node:path';
const secrets=['DEEPSEEK_API_KEY','OPENAI_API_KEY'].flatMap(name=>process.env[name]?.length>=8?[{name,bytes:Buffer.from(process.env[name])}]:[]);
const files=[];const walk=directory=>{for(const e of readdirSync(directory,{withFileTypes:true})){const path=join(directory,e.name);if(e.isDirectory())walk(path);else if(e.isFile())files.push(path);}};
for(const directory of ['src','dist','evidence/v0.3','acceptance','scripts'])walk(directory);
const hits=[];
for(const path of files){const bytes=readFileSync(path);for(const secret of secrets)if(bytes.includes(secret.bytes))hits.push({path:relative('.',path).replaceAll('\\','/'),credential:secret.name});}
const report={method:'Exact byte scan for operator environment credentials, including source maps, distribution and sanitized evidence. Credential values are neither printed nor saved.',credentialNames:secrets.map(s=>s.name),filesScanned:files.length,matches:hits.length,filesWithMatches:hits,status:hits.length?'failed':'passed'};
writeFileSync('evidence/v0.3/phase-6-privacy.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));if(hits.length)process.exitCode=1;
