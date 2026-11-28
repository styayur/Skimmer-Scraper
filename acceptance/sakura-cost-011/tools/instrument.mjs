// Insert counters in disposable runner checkouts. Parsing prevents matches in comments or type signatures.
import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
const [parserRoot, output] = process.argv.slice(2);
const ts = createRequire(path.resolve(parserRoot, 'package.json'))('typescript');
const selections = {
  'ai/SymbiosisRuntime': 'step request independentSurvey perception recordVisit remember record startMissions',
  'ai/semanticVerification': 'verifySite resolveSite',
  'ai/semanticTargets': 'observe observedHere',
  'ai/missions': 'tick start validateMissions',
  'ai/journeyMemory': 'remember change snapshot',
  'ai/modelClient': 'request canRequest backgroundAvailable',
  'companions/AgentController': 'step perceive safeRoute',
  'flight/surfaceGlide': 'stepGlide glideChangedMotion followPlan',
  'flight/surfacePatchGraph': 'planSurfacePatches continuationContact sweptEdge',
  'flight/surfaceTrajectory': 'sampleTrajectory planRedirect planMagnetic planTransfer planEscape',
  'world/worldStreamer': 'semanticCandidates routeHint queryNearest queryProximity queryGlide queryGlideAhead glideChordClear isCollisionCovered isCompanionCovered updateCoverage',
  'world/chunkedWorldAdapter': 'queryNearest',
  'game/shield': 'resolveShield sweepFlight',
  'game/cooperation': 'relayEligibility attemptRelay',
  'audio/musicSession': 'update',
  'audio/synth': 'update',
  'voice/VoiceRadio': 'update announce playAudio',
  'ui/RadioPanel': 'update',
  'ui/playerFlightDiagnostic': 'due add',
  'main': 'recordImportedFlight',
  'render/GameRenderer': 'renderFlight draw',
};
const timed = new Set(['companions/AgentController.step','ai/SymbiosisRuntime.step','world/chunkedWorldAdapter.queryNearest','game/cooperation.relayEligibility','audio/musicSession.update','voice/VoiceRadio.update','audio/synth.update','ui/RadioPanel.update','game/shield.resolveShield','render/GameRenderer.draw']);
const manifest = {};
for (const [stem, names] of Object.entries(selections)) {
  const filename = 'src/' + stem + '.ts';
  const wanted = new Set(names.split(' '));
  manifest[stem] = {present:[], unavailable:[...wanted]};
  if (!fs.existsSync(filename)) continue;
  const source = fs.readFileSync(filename,'utf8');
  const ast = ts.createSourceFile(filename,source,ts.ScriptTarget.Latest,true);
  if (ast.parseDiagnostics.length) throw Error('parse failed ' + filename);
  const edits = [], present = manifest[stem].present;
  function visit(node) {
    let name, body;
    if ((ts.isFunctionDeclaration(node) || ts.isMethodDeclaration(node)) && node.name && node.body) {
      name = node.name.getText(ast); body = node.body;
    } else if (ts.isVariableDeclaration(node) && node.initializer && ts.isArrowFunction(node.initializer)) {
      name = node.name.getText(ast); body = node.initializer.body;
    }
    if (wanted.has(name) && body) {
      const key = stem + '.' + name, lit = JSON.stringify(key);
      const from = body.getStart(ast), to = body.end;
      const block = ts.isBlock(body);
      const prefix = 'globalThis.__meter.hit(' + lit + ');';
      if (timed.has(key) && !block) throw Error('timed expression body ' + key);
      if (block) {
        edits.push([from+1,prefix+(timed.has(key)?'const __t=globalThis.__meter.start('+lit+');try{':'')]);
        if (timed.has(key)) edits.push([to-1,'}finally{globalThis.__meter.end('+lit+',__t);}']);
      } else {
        edits.push([from,'('+prefix.slice(0,-1)+',('], [to,'))']);
      }
      present.push(name);
    }
    ts.forEachChild(node,visit);
  }
  visit(ast);
  let result = source;
  for (const [at,value] of edits.sort((a,b)=>b[0]-a[0])) result = result.slice(0,at) + value + result.slice(at);
  if (stem === 'world/chunkedWorldAdapter') {
    const needle = 'const hit = chunk.bvh.closestPointToPoint(';
    if (!result.includes(needle)) throw Error('physical BVH site changed');
    result = result.replace(needle,'globalThis.__meter.hit("MeshBVH.closestPointToPoint");'+needle);
  }
  if (result!==source) fs.writeFileSync(filename,result);
  manifest[stem].unavailable = [...wanted].filter(name=>!present.includes(name));
}
for (const [stem,name] of [['world/chunkedWorldAdapter','queryNearest'],['ai/SymbiosisRuntime','perception'],['companions/AgentController','step'],['game/cooperation','relayEligibility'],['render/GameRenderer','draw'],['flight/surfaceGlide','stepGlide']]) {
  if (!manifest[stem].present.includes(name)) throw Error('required probe missing ' + stem + '.' + name);
}
fs.writeFileSync(output,JSON.stringify(manifest,null,2));
