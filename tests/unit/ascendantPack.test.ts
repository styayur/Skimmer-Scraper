import {expect,it} from 'vitest';
import {readFileSync} from 'node:fs';
import {validatePack} from '../../src/platform/worldPacks';

it('binds Ascendant upgrades to one seed, tier and collision generator',()=>{
  const pack=JSON.parse(readFileSync('public/realms/ascendant/web/world-pack.json','utf8'));
  expect(validatePack(pack).schema).toBe(2);
  for(const change of [{schema:1},{tier:'high'},{theme:'dragon'},{seed:17},{generatorVersion:1},
    {baseWorld:'dragonspine-base-1'},{collision:'dragonspine-base-1'},{unpackedBytes:undefined}]){
    expect(()=>validatePack({...pack,...change})).toThrow();
  }
  expect(validatePack(JSON.parse(readFileSync('public/realms/dragonspine/web/world-pack.json','utf8'))).schema).toBe(1);
});
