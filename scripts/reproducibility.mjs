import {spawnSync,execFileSync} from 'node:child_process';
import {readFileSync,readdirSync,writeFileSync} from 'node:fs';
import {join,relative} from 'node:path';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const git=(...args)=>execFileSync('git',args,{encoding:'utf8'}).trim();
assert(!git('status','--porcelain','--untracked-files=no'),'Tracked files must be clean before reproducibility capture');
const entries=()=>{const rows=[];const walk=dir=>{for(const item of readdirSync(dir,{withFileTypes:true})){const path=join(dir,item.name);if(item.isDirectory())walk(path);else{const bytes=readFileSync(path);rows.push({path:relative('dist',path).replaceAll('\\','/'),bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')});}}};walk('dist');return rows.sort((a,b)=>a.path.localeCompare(b.path,'en'));};
let first;
for(let index=0;index<2;index++){
 const run=spawnSync('npm',['run','build'],{shell:process.platform==='win32',stdio:'inherit'});assert(run.status===0,'Production build failed');
 const current=entries();if(index===0)first=current;else assert.deepEqual(current,first,'Build outputs differ');
}
const info=JSON.parse(readFileSync('dist/build-info.json','utf8'));assert(info.sourceCommit===git('rev-parse','HEAD')&&!info.dirty);
const report={status:'passed',method:'Two full production builds at the same clean commit with the same lockfile and local toolchain; every distribution file has identical SHA256. Final merged-release verification is attached separately.',sourceCommit:info.sourceCommit,node:process.version,platform:process.platform,lockfileSha256:createHash('sha256').update(readFileSync('package-lock.json')).digest('hex'),files:first,crossPlatformIdentityClaimed:false};
writeFileSync(process.env.REPRO_OUTPUT??'evidence/v0.3/phase-6-reproducibility.json',JSON.stringify(report,null,2));
console.log(JSON.stringify({status:report.status,sourceCommit:report.sourceCommit,files:first.length}));
