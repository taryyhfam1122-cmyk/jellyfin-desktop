// Local catalog only. This script runs in an app-generated file:// page.
// Never connects to NAS, never reads credentials, never deletes without native confirmation.
(() => {
'use strict';
const records = JSON.parse(document.getElementById('jfd-offline-data').textContent);
const treeRoot = {name:'すべての作品',path:[],children:new Map()};
let selection = [];
let expanded = new Set();
let chosen = null;
const $ = id=>document.getElementById(id);
const send = (action,file)=>window.chrome?.webview?.postMessage({type:'jfd-offline-action',action,...(file?{file}:{})});
function readState(key,fallback){try {return JSON.parse(sessionStorage.getItem('jfd-offline-v26-'+key))??fallback;}catch{return fallback;}}
function saveState(key,val){try{sessionStorage.setItem('jfd-offline-v26-'+key,JSON.stringify(val));}catch{}}
function pathKey(path){return path.join('\u001f');}
const restored=readState('selection',[]);
selection=Array.isArray(restored)?restored:[];
const opens=readState('expanded',[]);
expanded=new Set(Array.isArray(opens)?opens:[]);
for(const entry of records){
 let node=treeRoot;
 for(const name of entry.folders){
    if(!node.children.has(name))node.children.set(name,{name,path:[...node.path,name],children:new Map()});
    node=node.children.get(name);
 }
}
function row(node,depth) {
 const wrap=document.createElement('div');
 const b=document.createElement('button');b.className='tree-row'+(pathKey(node.path)===pathKey(selection)?' selected':'');
 b.style.paddingLeft=String(Math.min(55,depth*13)+8)+'px';
 const icon=document.createElement('span');icon.className='folder-icon';const kind=node.path[0]==='JAV'?'jav':node.path[0]==='JAV(1280)'?'jav1280':node.path[0]==='ANIME'?'anime':'';
 icon.classList.add(kind);icon.textContent=node.path.length===0?'⌂':kind==='jav1280'&&node.path.length===1?'HD':kind==='anime'&&node.path.length===1?'▣':kind==='jav'&&node.path.length===1?'▶':node.children.size&&expanded.has(pathKey(node.path))?'▣':'▢';
 const name=document.createElement('span');name.className='name';name.textContent=node.name;
 const count=document.createElement('span');count.className='count';
 count.textContent=records.filter(x=>matches(x,node.path)).length;
 b.append(icon,name,count);
 b.onclick=()=>{
   selection=[...node.path];saveState('selection',selection);
   if(node.children.size){const k=pathKey(node.path);if(expanded.has(k))expanded.delete(k);else expanded.add(k);saveState('expanded',[...expanded]);}
   renderTree();renderCards(true);
 };
 wrap.append(b);
 if(expanded.has(pathKey(node.path))){
   for(const child of [...node.children.values()].sort((a,b)=>a.name.localeCompare(b.name,'ja')))wrap.append(row(child,depth+1));
 }
 return wrap;
}
function matches(entry,path){return path.every((seg,i)=>entry.folders[i]===seg);}
function renderTree(){const target=$('tree');target.replaceChildren(row(treeRoot,0));}
function tapCard(entry,node){
 let pending=null,last=0;
 node.addEventListener('click', e=>{
   const now=Date.now();
   if(now-last<400){last=0;clearTimeout(pending);pending=null;send('play',entry.file);return;}
   last=now;pending=setTimeout(()=>{if(last!==now)return;last=0;showDetails(entry);},420);
 });
}
function showDetails(entry){
 chosen=entry;$('detail-title').textContent=entry.title;
 $('detail-path').textContent=(entry.folders.length?entry.folders.join(' / '):'未分類')+' / '+entry.file;
 $('detail-size').textContent=(entry.bytes/1024/1024).toFixed(1)+' MB';
 $('details').showModal();
}
function renderCards(resetScroll=false){
 const q=$('search').value.trim().toLocaleLowerCase();
 const items=records.filter(x=>matches(x,selection)&&(x.title.toLocaleLowerCase().includes(q)||x.file.toLocaleLowerCase().includes(q)));
 const mode=$('sort').value;
 items.sort(mode==='name'?(a,b)=>a.title.localeCompare(b.title,'ja'):mode==='size'?(a,b)=>b.bytes-a.bytes:(a,b)=>b.saved-a.saved);
 $('where').textContent=selection.length?selection.join(' / '):'すべての作品';
 $('count').textContent=items.length+' 作品';
 const cards=$('cards');cards.replaceChildren();
 if(!items.length){const empty=document.createElement('div');empty.id='empty';empty.textContent='このフォルダには保存済み動画がありません。オンラインから作品をダウンロードしてください。';cards.append(empty);}
 for(const entry of items){
   const card=document.createElement('button');card.type='button';card.className='poster';
   const cover=document.createElement('div');cover.className='cover';
   if(entry.cover){const img=document.createElement('img');img.src=entry.cover;img.loading='lazy';img.alt='';img.onerror=()=>{cover.replaceChildren();const t=document.createElement('span');t.className='no-cover';t.textContent='NO COVER';cover.append(t);};cover.append(img);}
   else {const t=document.createElement('span');t.className='no-cover';t.textContent='NO COVER';cover.append(t);}
   const title=document.createElement('div');title.className='title';title.textContent=entry.title;
   card.append(cover,title);tapCard(entry,card);cards.append(card);
 }
 const scrollKey='scroll-'+pathKey(selection)+':'+q+':'+mode;
 cards.scrollTop=resetScroll?0:Number(readState(scrollKey,0))||0;
 $('summary').textContent='保存済み '+records.length+'作品 / '+(records.reduce((sum,x)=>sum+x.bytes,0)/1024/1024/1024).toFixed(2)+' GB • NASの元ファイルは変更されません';
}
$('search').addEventListener('input',()=>renderCards(true));$('sort').addEventListener('change',()=>renderCards(true));
$('cards').addEventListener('scroll',()=>{
 const q=$('search').value.trim().toLocaleLowerCase(), mode=$('sort').value;
 saveState('scroll-'+pathKey(selection)+':'+q+':'+mode,$('cards').scrollTop);
},{passive:true});
$('manage').onclick=()=>send('manage');$('online').onclick=()=>send('online-home');
$('exit').onclick=()=>send('exit');
$('batch-delete').onclick=()=>openDelete();
$('delete-close').onclick=()=>$('delete-dialog').close();
$('delete-all').onclick=()=>{selectedFiles=new Set(records.map(x=>x.file));renderDelete();};
$('delete-none').onclick=()=>{selectedFiles.clear();renderDelete();};
$('delete-confirm').onclick=()=>{const files=[...selectedFiles];if(!files.length)return;window.chrome?.webview?.postMessage({type:'jfd-offline-action',action:'delete-many',files});$('delete-dialog').close();};
$('downloads').onclick=()=>{$('download-dialog').showModal();send('downloads');};
$('download-refresh').onclick=()=>send('downloads');
$('download-close').onclick=()=>$('download-dialog').close();
$('detail-close').onclick=()=>$('details').close();
$('detail-play').onclick=()=>{if(chosen)send('play',chosen.file);};
$('detail-cover').onclick=()=>{if(chosen)send('cover',chosen.file);$('details').close();};
$('detail-delete').onclick=()=>{if(chosen)send('delete',chosen.file);$('details').close();};
$('details').addEventListener('click',e=>{if(e.target===$('details'))$('details').close();});

let selectedFiles=new Set();
function openDelete(){selectedFiles.clear();renderDelete();$('delete-dialog').showModal();}
function renderDelete(){
 const target=$('delete-list');target.replaceChildren();
 // Group by all known original Jellyfin paths, never use filesystem paths as selectors.
 const folders=new Map();
 for(const entry of records){
   const segments=entry.folders.length?entry.folders:['未分類'];
   for(let i=1;i<=segments.length;i++){
     const key=segments.slice(0,i).join('\u001f');
     if(!folders.has(key))folders.set(key,{name:segments.slice(0,i).join(' / '),depth:i,files:new Set()});
     folders.get(key).files.add(entry.file);
   }
 }
 const makeCheck=(label,files,cls)=>{
    const row=document.createElement('label');row.className=cls;
    const input=document.createElement('input');input.type='checkbox';
    input.checked=files.every(x=>selectedFiles.has(x));
    input.indeterminate=!input.checked&&files.some(x=>selectedFiles.has(x));
    input.onchange=()=>{for(const x of files){if(input.checked)selectedFiles.add(x);else selectedFiles.delete(x);}renderDelete();};
    const name=document.createElement('span');name.textContent=label;
    row.append(input,name);target.append(row);
 };
 const sorted=[...folders.values()].sort((a,b)=>a.name.localeCompare(b.name,'ja'));
 for(const f of sorted)makeCheck('📁 '+f.name+'（'+f.files.size+'本）',[...f.files],'group');
 for(const entry of records)makeCheck('▣ '+entry.title+'（'+(entry.bytes/1024/1024).toFixed(0)+' MB）',[entry.file],'sub');
 const chosen=records.filter(x=>selectedFiles.has(x.file));
 const bytes=chosen.reduce((v,x)=>v+x.bytes,0);
 $('delete-count').textContent=chosen.length+'本を選択・合計 '+(bytes/1024/1024/1024).toFixed(2)+' GB';
 $('delete-confirm').disabled=!chosen.length;
}
// The native app provides progress values; never show fabricated progress.
window.jfdSetDownloads=function(items){
 const panel=$('download-panel');panel.replaceChildren();
 if(!Array.isArray(items)||!items.length){panel.textContent='実行中のダウンロードはありません。';return;}
 for(const item of items){
  const card=document.createElement('div');card.style.cssText='border-bottom:1px solid #35475b;padding:10px 0';
  const heading=document.createElement('div');heading.textContent=item.name+' — '+item.state;
  const bar=document.createElement('div');bar.className='progress';
  const fill=document.createElement('span');fill.style.width=Number.isFinite(item.percent)?Math.max(0,Math.min(100,item.percent))+'%':'0%';
  bar.append(fill);
  const detail=document.createElement('div');detail.className='muted';detail.style.fontSize='13px';
  detail.textContent=(item.received/1048576).toFixed(1)+' MB'+(item.total>0?' / '+(item.total/1048576).toFixed(1)+' MB（'+item.percent.toFixed(0)+'%）':' / 合計容量不明');
  card.append(heading,bar,detail);panel.append(card);
 }
};

renderTree();renderCards();
})();
