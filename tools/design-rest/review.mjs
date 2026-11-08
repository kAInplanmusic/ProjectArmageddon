#!/usr/bin/env node
// fallow-ignore-file unused-file — eigenständiger CLI-Einstieg, Aufruf in docs/DesignRest/README.md.
/** Lokale Sichtprüfung: Vorschau und hashgebundene Bewertungs-Vorlage. */
import fs from 'node:fs/promises';
import path from 'node:path';
const run = path.resolve(process.argv[2] ?? 'artifacts/design-rest/plan-run');
const journal = JSON.parse(await fs.readFile(path.join(run,'journal.json'),'utf8'));
const escape = s => String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;');
const jobs = Object.entries(journal.jobs).filter(([,r])=>r.state==='downloaded');
const cards = jobs.map(([id,r])=>`<article><h3>${escape(id)}</h3><img src="${escape(r.output.file)}"><p>SHA256: ${r.output.sha256}</p></article>`).join('');
const groups = Map.groupBy(jobs,([id])=>id.replace(/-[0-7]-s\d+-r\d+$/,''));
const loops = [...groups].map(([name,items])=>`<article><h3>${escape(name)}</h3><img class="loop" data-frames='${escape(JSON.stringify(items.map(([,r])=>r.output.file)))}' src="${escape(items[0][1].output.file)}"><p>Vorschau bei 8 FPS; Phasenfolge gegen Plan prüfen.</p></article>`).join('');
const page = `<!doctype html><html lang="de"><meta charset="utf-8"><title>DesignRest – Sichtprüfung</title><style>body{background:#171b24;color:#eee;font:16px system-ui;padding:25px}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:15px}article{padding:12px;border:1px solid #778;overflow-wrap:anywhere}img{width:256px;height:256px;object-fit:contain;background:repeating-conic-gradient(#aaa 0% 25%,#ddd 0% 50%) 0/20px 20px}h3{font-size:14px}p{font-size:11px}</style><h1>Sichtprüfung</h1><p>Die Vorschau bewertet keine Identität automatisch. Untergrund, Silhouette, Gliedmaßen, Waffenanker und tatsächliche Bewegung kontrollieren.</p><h2>Animation</h2><div class="grid">${loops}</div><h2>Einzelframes</h2><div class="grid">${cards}</div><script>let t=0;setInterval(()=>{for(const im of document.querySelectorAll('.loop')){const fs=JSON.parse(im.dataset.frames);im.src=fs[t%fs.length]}t++},125)</script></html>`;
await fs.writeFile(path.join(run,'review.html'),page);
const template = Object.fromEntries(jobs.map(([id,r])=>[id,{file:r.output.file,sha256:r.output.sha256,reviewer:'',identity:false,anatomy:false,palette:false,pose:false,anchors:false,alpha:false,temporal:false,approved:false,notes:''}]));
try { await fs.writeFile(path.join(run,'review.json'),JSON.stringify(template,null,2)+'\n',{flag:'wx'}); } catch(e) { if(e.code!=='EEXIST')throw e; }
console.log(path.join(run,'review.html'));
