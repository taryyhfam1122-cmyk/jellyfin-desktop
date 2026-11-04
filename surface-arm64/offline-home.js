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
 const icon=document.createElement('span');icon.className='folder-icon';icon.textContent=node.children.size&&expanded.has(pathKey(node.path))?'📂':'📁';
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
 if(resetScroll)cards.scrollTop=0;
 $('summary').textContent='保存済み '+records.length+'作品 / '+(records.reduce((sum,x)=>sum+x.bytes,0)/1024/1024/1024).toFixed(2)+' GB • NASの元ファイルは変更されません';
}
$('search').addEventListener('input',()=>renderCards(true));$('sort').addEventListener('change',()=>renderCards(true));
$('manage').onclick=()=>send('manage');$('online').onclick=()=>send('online-home');
$('detail-close').onclick=()=>$('details').close();
$('detail-play').onclick=()=>{if(chosen)send('play',chosen.file);};
$('detail-cover').onclick=()=>{if(chosen)send('cover',chosen.file);$('details').close();};
$('detail-delete').onclick=()=>{if(chosen)send('delete',chosen.file);$('details').close();};
$('details').addEventListener('click',e=>{if(e.target===$('details'))$('details').close();});
renderTree();renderCards();
})();
