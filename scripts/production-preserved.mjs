import { chromium } from '@playwright/test';
import { writeFileSync } from 'node:fs';
const address=process.env.HTTPS_PROXY??process.env.HTTP_PROXY;
const parsed=address?new URL(address):null;
const proxy=parsed?{server:parsed.origin,...(parsed.username?{username:decodeURIComponent(parsed.username),password:decodeURIComponent(parsed.password)}:{})}:undefined;
const browser=await chromium.launch({headless:true,proxy,args:['--use-angle=swiftshader','--enable-webgl','--ignore-gpu-blocklist']});
try{
 const page=await browser.newPage({viewport:{width:1440,height:900}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 const response=await page.goto('https://styayur.github.io/Skimmer-Scraper/',{timeout:90000});await page.waitForFunction(()=>window.__SKIMMER_SCRAPER__?.snapshot().ready,null,{timeout:120000});
 const version=await page.locator('.title-footer__version').textContent();await page.locator('#start-button').click();await page.waitForTimeout(1200);const snapshot=await page.evaluate(()=>window.__SKIMMER_SCRAPER__.snapshot());
 const result={url:page.url(),httpStatus:response.status(),version,mode:snapshot.mode,runTime:snapshot.runTime,world:snapshot.world,errors};writeFileSync('evidence/v0.3/phase-6-production-preserved.json',JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));if(result.httpStatus!==200||!result.version.includes('0.2.0')||result.errors.length)process.exitCode=2;
}finally{await browser.close();}
