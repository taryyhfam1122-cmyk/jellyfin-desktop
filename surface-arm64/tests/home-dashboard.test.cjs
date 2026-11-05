'use strict';
const nodeTest = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname,'..');
const source = fs.readFileSync(path.join(root,'home-dashboard.js'),'utf8')
  .replace('"__JFD_SERVER_ORIGIN__"','"http://jellyfin.test:30013"')
  .replace('"__JFD_HOME_STYLE__"','".jfd-dashboard-test{display:flex;}"');

class Element {
  constructor(tag) {
    this.tagName=tag;this.children=[];this.style={};this.dataset={};
    this.attrs={};this.className='';this._text='';this.isConnected=false;
    this.listeners={};this.src='';
  }
  set textContent(value) {this._text=String(value);}
  get textContent() {return this._text+this.children.map(e=>e.textContent).join('');}
  append(...kids) {for(const k of kids){this.children.push(k);k.isConnected=true;}}
  prepend(...kids){for(const k of kids.reverse()){this.children.unshift(k);k.isConnected=true;}}
  remove() {this.isConnected=false;}
  replaceChildren(...kids) {this.children=[];this.append(...kids);}
  addEventListener(name,handler) {this.listeners[name]=handler;}
  setAttribute(key,value){this.attrs[key]=String(value);}
  getClientRects(){return [1];}
  scrollIntoView(){}
  querySelector(selector){
    if(selector.startsWith('[data-section="')){
      const target=selector.split('"')[1];
      return walk(this).find(el=>el.dataset.section===target)||null;
    }
    return null;
  }
}
function walk(el){return [el,...el.children.flatMap(walk)];}
function harness(host='http://jellyfin.test:30013') {
  let fetchCount=0;
  const body=new Element('body'),head=new Element('head');
  const document={
    body,head,documentElement:new Element('html'),
    createElement:tag=>new Element(tag),
    getElementById:id=>walk(body).concat(walk(head)).find(x=>x.id===id)||null,
    querySelectorAll:()=>[],
    addEventListener:()=>{},
  };
  const item=(id,name,progress=0)=>({
    Id:id,Name:name,Type:'Movie',ImageTags:{Primary:'abc'},
    RunTimeTicks:1500000000,UserData:{PlaybackPositionTicks:progress}
  });
  const samples={
    resume:[item('10000000-0000-0000-0000-000000000001','続きから見る実作品',500000000)],
    latest:[item('10000000-0000-0000-0000-000000000002','最近追加した実作品')],
    favorites:[item('10000000-0000-0000-0000-000000000003','お気に入り実作品')],
    views:[{Id:'1',Name:'JAV'}]
  };
  const api={
    getCurrentUserId:()=> 'user123',
    getUrl:route=>route,
    getImageUrl:id=>'/jellyfin-image/'+id,
    fetch:async({url})=>{
      fetchCount++;
      if(url.includes('/Items/Resume'))return {Items:samples.resume};
      if(url.includes('/Items/Latest'))return samples.latest;
      if(url.endsWith('/Views'))return {Items:samples.views};
      if(url.endsWith('/Items'))return {Items:samples.favorites};
      throw Error('unexpected '+url);
    }
  };
  const listeners={};
  const location={origin:host,hash:'#/home'};
  const context={window:{ApiClient:api,addEventListener:(name,fn)=>{listeners[name]=fn;}},
     document,location,localStorage:{getItem:()=>null,setItem:()=>{}},
     getComputedStyle:()=>({visibility:'visible'}),
     setInterval:()=>1,setTimeout:(fn)=>fn(),Date,Number,Math,JSON,Set,Promise,console};
  vm.runInNewContext(source,context);
  return {body,location,api,samples,document,listeners,fetchCount:()=>fetchCount};
}
const settled=()=>new Promise(resolve=>setImmediate(resolve));
nodeTest('dashboard displays actual Jellyfin resume, latest and favorites, no hardcoded mock content',async()=>{
  const h=harness();
  await settled();await settled();
  const ui=walk(h.body).find(el=>el.id==='jfd-c02-home');
  assert.ok(ui,'dashboard root is installed on home');
  assert.equal(ui.style.display,'flex');
  assert.match(ui.textContent,/続きから見る実作品/);
  assert.match(ui.textContent,/最近追加した実作品/);
  assert.match(ui.textContent,/お気に入り実作品/);
  assert.match(ui.textContent,/検索一覧/);
  assert.match(ui.textContent,/保存済み/);
  assert.ok(h.fetchCount()>=4);
  const hero=walk(ui).find(el=>el.className==='jfd-hero-title');
  assert.equal(hero.textContent,'続きから見る実作品');
  const progress=walk(ui).find(el=>el.className==='jfd-progress-fill');
  assert.equal(progress.style.width,(100/3)+'%');
});
nodeTest('dashboard does not render on another host',()=>{
  const h=harness('http://untrusted.example');
  assert.equal(walk(h.body).some(el=>el.id==='jfd-c02-home'),false);
  assert.equal(h.fetchCount(),0);
});
nodeTest('home navigation does not persist Jellyfin credentials',()=>{
  assert.match(source,/window\.ApiClient/);
  assert.match(source,/getCurrentUserId/);
  assert.match(source,/api\.fetch/);
  assert.doesNotMatch(source,/accessToken|ApiKey|Authorization|api_key|password|sessionId/i);
  assert.match(source,/location\.origin !== "http:\/\/jellyfin\.test:30013"/);
});
nodeTest('native C02 includes dashboard assets and keeps old gestures and offline app',()=>{
  const form=fs.readFileSync(path.join(root,'SurfaceForm.cs'),'utf8');
  const csproj=fs.readFileSync(path.join(root,'JellyfinSurface.csproj'),'utf8');
  assert.match(form,/home-dashboard\.js/);
  assert.match(form,/home-dashboard\.css/);
  assert.match(form,/command == "open-saved"/);
  assert.match(form,/command == "open-progress"/);
  assert.match(form,/Native Home navigation failed/);
  assert.match(form,/SearchHub bridge loaded/);
  assert.match(csproj,/home-dashboard\.js/);
  assert.match(csproj,/home-dashboard\.css/);
  assert.match(form,/Jellyfin C02/);
  assert.match(form,/Color\.FromArgb\(111, 48, 177\)/);
});
