import { hashNumbers } from './deterministic';
import { DENSE_GENERATOR_VERSION, GENERATOR_VERSION, resolveWorldSettings, type CityGenerationConfig, type WorldSettings } from './worldConfig';
export const JOURNEY_PROFILES=[
 {name:'钴蓝霓虹',preset:'neon',hue:.18,top:0x101e42,mid:0x426c98,horizon:0x99e5e8},
 {name:'翡翠群岛',preset:'archipelago',hue:.3,top:0x102e37,mid:0x427f7e,horizon:0xc9e8b3},
 {name:'紫藤桥庭',preset:'sakura',hue:.73,top:0x281c43,mid:0x8a659f,horizon:0xe4c4ec},
 {name:'琥珀高城',preset:'neon',hue:.93,top:0x371a27,mid:0xa15e4e,horizon:0xffd092},
 {name:'金穹归航',preset:'archipelago',hue:.08,top:0x25323e,mid:0x9b8b63,horizon:0xffe9b1},
] as const;

const denseWorldStyles: ReadonlyArray<Partial<CityGenerationConfig>> = [
 { architecture: 'faceted', buildingHeightMax: 209, buildingDensity: 0.59, suspendedHeightMax: 380 },
 { architecture: 'setback', buildingHeightMax: 178, islandFrequency: 0.46, suspendedHeightMax: 396 },
 { architecture: 'lantern', buildingHeightMax: 168, bridgeFrequency: 0.73, bridgeHeightMin: 57 },
 { architecture: 'faceted', buildingHeightMax: 225, buildingDensity: 0.59, bridgeFrequency: 0.68, suspendedHeightMax: 420 },
 { architecture: 'setback', buildingHeightMax: 193, islandFrequency: 0.45, bridgeHeightMin: 66, suspendedHeightMax: 410 },
];

export const journeyProfile=(index:number)=>JOURNEY_PROFILES[((index-1)%5+5)%5]!;
export const journeyWorld=(base:WorldSettings,index:number):WorldSettings=>{
 if(!Number.isSafeInteger(index)||index<0||index>1e6)throw Error('Invalid journey index');
 if(index===0)return{...base,config:{...base.config}};
 const profile=journeyProfile(index);const seed=hashNumbers(base.seed,index,base.generatorVersion,0x534b5933);
 const world=resolveWorldSettings({seed:String(seed),preset:profile.preset,mode:base.mode,generatorVersion:base.generatorVersion});
 world.paletteHue=profile.hue;
 if(base.generatorVersion>=DENSE_GENERATOR_VERSION){
  Object.assign(world.config,denseWorldStyles[(index-1)%5]);
  if(base.generatorVersion===GENERATOR_VERSION) world.config.landmark = (['foldedFan','terraceOrchard','lanternCourt','needleExchange','moonGate'] as const)[(index-1)%5];
  return world;
 }
 if((index-1)%5===2){world.config.buildingHeightMax=155;world.config.bridgeFrequency=.65;world.config.buildingDensity=.3;}
 if((index-1)%5===3){world.config.buildingHeightMax=280;world.config.bridgeFrequency=.7;world.config.buildingDensity=.42;}
 if((index-1)%5===4){world.config.islandFrequency=.65;world.config.buildingDensity=.18;}
 return world;
};
