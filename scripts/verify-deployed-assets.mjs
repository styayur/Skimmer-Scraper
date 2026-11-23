import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';

const [directory, summaryPath] = process.argv.slice(2);
const root='https://styayur.github.io/Skimmer-Scraper/';
const hashes=[];
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
async function verify(dir) {
  for (const entry of await readdir(dir,{withFileTypes:true})) {
    const path=join(dir,entry.name);
    if(entry.isDirectory()){await verify(path);continue;}
    const file=relative(directory,path).split(sep).join('/');
    const bytes=await readFile(path);
    const result=await fetch(new URL(file,root),{cache:'no-store',signal:AbortSignal.timeout(120000)});
    assert.equal(result.status,200,file);
    const digest=hash(bytes);
    assert.equal(hash(Buffer.from(await result.arrayBuffer())),digest,file);
    hashes.push({file,bytes:bytes.length,sha256:digest});
  }
}
await verify(directory);
assert(hashes.some(row=>row.file==='build-info.json') && hashes.some(row=>row.file==='index.html'));
await writeFile(summaryPath,JSON.stringify({url:root,files:hashes},null,2)+'\n');
console.log('Verified deployed files',hashes.length);
