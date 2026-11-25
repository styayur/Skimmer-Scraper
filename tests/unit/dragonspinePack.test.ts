import {expect,it} from 'vitest';
import {readFileSync} from 'node:fs';
import {validatePack} from '../../src/platform/worldPacks';

it('binds Dragonspine packs to one seed, tier and collision generator',()=>{
  const pack=JSON.parse(readFileSync('public/realms/dragonspine/web/world-pack.json','utf8'));
  expect(validatePack(pack).schema).toBe(2);
  for(const change of [{schema:1},{tier:'high'},{theme:'dragon'},{seed:17},{generatorVersion:1},
    {baseWorld:'dragonspine-base-1'},{collision:'dragonspine-base-1'},{unpackedBytes:undefined}]){
    expect(()=>validatePack({...pack,...change})).toThrow();
  }
  expect(validatePack(pack, '0.9.0')).toEqual(pack);
  expect(() => validatePack({ ...pack, packVersion: '2.0.1' }, '0.9.0')).toThrow();
  expect(() => validatePack(pack, '0.8.1')).toThrow();
});
