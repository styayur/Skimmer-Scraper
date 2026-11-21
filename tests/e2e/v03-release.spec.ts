import {test,expect} from '@playwright/test';
import {writeFileSync} from 'node:fs';
import packageInfo from '../../package.json' with {type:'json'};
const {version}=packageInfo;

test('static distribution includes full licenses, exact source provenance and the candidate version',async({page,request})=>{
 const metadata=await request.get('/build-info.json');expect(metadata.ok()).toBe(true);const info=await metadata.json();
 expect(info.version).toBe(version);expect(info.sourceCommit).toMatch(/^[a-f0-9]{40}$/);expect(info.dirty).toBe(false);
 for(const [file,content]of [['LICENSE','GNU AFFERO GENERAL PUBLIC LICENSE'],['licenses/PROJECT-MIT-v0.2.0.txt','Permission is hereby granted'],['licenses/THIRD-PARTY-NOTICES.txt','SIL OPEN FONT LICENSE'],['CREDITS.md','AGPL-3.0-only']]){
  const response=await request.get(`/${file}`);expect(response.ok()).toBe(true);expect(await response.text()).toContain(content);
 }
 await page.goto('/?seed=334458');await page.locator('#title-screen').getByRole('link', {name:'操作指南'}).click();await expect(page.locator('#game-version')).toHaveText(`v${version}`);
 await expect(page.getByRole('link',{name:'源码 · AGPL-3.0'})).toHaveAttribute('href',info.sourceUrl);
 writeFileSync('evidence/v0.3/phase-6-distribution.json',JSON.stringify({status:'passed',info,fullAgpl:true,historicalMit:true,runtimeAndFontNotices:true},null,2));
});
