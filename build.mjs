import {fileURLToPath} from 'node:url';
process.chdir(fileURLToPath(new URL('.',import.meta.url)));
import {mkdir,cp,rm} from 'node:fs/promises';
await rm('dist',{recursive:true,force:true});await mkdir('dist');
for(const f of ['index.html','style.css','app.js','auth.js','sync.js','family-data.js','experiments.json','manifest.webmanifest','sw.js','assets']) await cp(f,`dist/${f}`,{recursive:true});
console.log('Genius Kids Lab: build selesai.');
