import {createRequire} from 'node:module';
import {resolve} from 'node:path';
import {openSession,relocate,residentCell} from './observe.mjs';
const {chromium}=createRequire(resolve('candidate/package.json'))('@playwright/test');
const browser=await chromium.launch({headless:true,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader','--enable-webgl','--mute-audio']});
try {
  const s=await openSession(browser,'http://127.0.0.1:4175/',17,'ephemeral');
  const cell={x:11,z:-8};
  await relocate(s.page,cell);
  console.log(JSON.stringify(await s.world.read(residentCell,cell)));
} finally {await browser.close();}
