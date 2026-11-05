// C02: preserve Jellyfin's original home while hiding only redundant My Media
// and two floating SearchHub buttons. All other shelves stay untouched.
(() => {
  'use strict';
  if(location.origin !== "__JFD_SERVER_ORIGIN__" || window.__jfdC02TidyHomeV1)return;
  window.__jfdC02TidyHomeV1 = true;
  const ID='jfd-c02-tidy-home';
  const paths=new Map();
  function install(){
    if(!document.head || document.getElementById(ID))return;
    const el=document.createElement('style');
    el.id=ID;
    el.textContent=[
      '#jfd-surface-search-entry-v27,#jfsh-launch{display:none!important}',
      '.jfd-c02-hide-media-shelf{display:none!important}'
    ].join('');
    document.head.appendChild(el);
  }
  function isHome(){
    const hash=location.hash||'';
    return /^#\/home(?:\?|\/|$)/i.test(hash) || hash==='#/' || hash==='#';
  }
  function collect(){
    // Official My Media cards use appRouter.getRouteUrl(item).
    // These are the exact routes for mixed/video/movie/tv libraries.
    const links=document.querySelectorAll('a.homeLibraryButton[href]');
    for(const link of links){
      const href=link.getAttribute('href')||'';
      if(!/^#\/[a-z]+(?:\?|\/)/i.test(href))continue;
      const hash=href.substring(1);
      const query=hash.includes('?')?hash.split('?').slice(1).join('?'):'';
      const id=new URLSearchParams(query).get('topParentId');
      const name=(link.querySelector('.homeLibraryText')?.textContent||'').trim();
      if(id && /^[0-9a-f-]{32,36}$/i.test(id)){
        paths.set(id.toLowerCase(),href);
        if(name)paths.set('name:'+name.toLowerCase(),href);
      }
    }
  }
  function hideMyMedia(){
    if(!isHome())return;
    for(const title of document.querySelectorAll('h2.sectionTitle,h3.sectionTitle,.sectionTitle')){
      const text=(title.textContent||'').replace(/\s+/g,'').toLowerCase();
      if(text!=='マイメディア'&&text!=='mymedia')continue;
      const section=title.closest('.verticalSection');
      if(section && section.querySelector('.homeLibraryButtonContainer,a.homeLibraryButton'))
        section.classList.add('jfd-c02-hide-media-shelf');
    }
  }
  function refresh(){
    install();
    if(!isHome())return;
    collect();
    hideMyMedia();
  }
  function navigate(id,name){
    const key=String(id||'').toLowerCase();
    if(!/^[0-9a-f-]{32,36}$/i.test(key))return 'invalid';
    collect();
    const cards=Array.from(document.querySelectorAll('a.homeLibraryButton[href]'));
    const target=cards.find(a=>{
      const href=a.getAttribute('href')||'';
      const query=href.includes('?')?href.split('?').slice(1).join('?'):'';
      const found=new URLSearchParams(query).get('topParentId');
      return found?.toLowerCase()===key;
    }) || cards.find(a=>
      (a.querySelector('.homeLibraryText')?.textContent||'').trim()===name);
    if(target){
      const href=target.getAttribute('href');
      if(href?.startsWith('#/')){location.hash=href;return 'jellyfin-native-route';}
    }
    const saved=paths.get(key)||paths.get('name:'+String(name||'').toLowerCase());
    if(saved?.startsWith('#/')){location.hash=saved;return 'cached-jellyfin-route';}
    return 'not-found';
  }
  window.__jfdC02NativeLibrary=Object.freeze({
    navigate,
    hasCached:id=>paths.has(String(id||'').toLowerCase())
  });
  if(document.readyState==='loading')
    document.addEventListener('DOMContentLoaded',refresh,{once:true});
  else refresh();
  window.addEventListener('hashchange',()=>setTimeout(refresh,60));
  setInterval(refresh,1400);
})();
