import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {resolve,extname,sep} from 'node:path';
if(!process.env.SKIMMER_V020_DIST)throw Error('Set SKIMMER_V020_DIST to a separately built original v0.2.0 dist directory');
const roots={'/Skimmer-Scraper/':process.env.SKIMMER_V020_DIST,'/candidate/':resolve('dist')};
const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.woff2':'font/woff2','.glb':'model/gltf-binary','.map':'application/json','.json':'application/json'};
createServer(async(req,res)=>{
 try{
  const path=new URL(req.url,'http://127.0.0.1').pathname;const prefix=Object.keys(roots).find(p=>path.startsWith(p));if(!prefix){res.writeHead(404).end();return;}
  const root=resolve(roots[prefix]);const file=resolve(root,decodeURIComponent(path.slice(prefix.length))||'index.html');if(!file.startsWith(root+sep)){res.writeHead(403).end();return;}
  const bytes=await readFile(file);res.writeHead(200,{'content-type':mime[extname(file)]??'application/octet-stream','cache-control':'no-store'});res.end(bytes);
 }catch{res.writeHead(404).end();}
}).listen(4176,'127.0.0.1',()=>console.log('Local same-origin migration QA on http://127.0.0.1:4176'));
