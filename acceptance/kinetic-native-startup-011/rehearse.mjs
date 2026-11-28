import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';
import { identifyRunningBuild, measureMenus } from './observe.mjs';

const [candidate, url, file] = process.argv.slice(2);
const pin = JSON.parse(await readFile(new URL('release-pin.json',import.meta.url),'utf8'));
const git = (...args) => execFileSync('git',['-C',candidate,'rev-parse',...args],{encoding:'utf8'}).trim();
assert.equal(git('HEAD'),pin.source);
assert.equal(git('HEAD^{tree}'),pin.tree);
const { chromium } = createRequire(path.resolve(candidate,'package.json'))('@playwright/test');
const browser = await chromium.launch({headless:true,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const report = {kind:'hosted UI rehearsal', nativeMeasurement:false, releasePin:pin,
  hostedRun:process.env.GITHUB_RUN_ID, observer:process.env.GITHUB_SHA};
const start=process.hrtime.bigint(), clock=()=>Number(process.hrtime.bigint()-start)/1e6;
try {
  const page=await browser.newPage({viewport:{width:800,height:600},deviceScaleFactor:1});
  await page.goto(url,{waitUntil:'domcontentloaded'});
  await measureMenus(page,report,clock);
  report.identity=await identifyRunningBuild(page);
  assert.match(report.identity.renderer,/swiftshader/i);
  assert.equal(report.identity.build.sourceCommit,pin.source);
  assert.equal(report.identity.build.dirty,false);
  report.status='passed';
} catch(error) {
  report.status='failed'; report.error=String(error.stack); process.exitCode=1;
} finally {
  await writeFile(file,JSON.stringify(report,null,2)+'\n');
  console.log(report.status,report.error??'Rehearsed both documents and the collision-ready frame.');
  await browser.close();
}
