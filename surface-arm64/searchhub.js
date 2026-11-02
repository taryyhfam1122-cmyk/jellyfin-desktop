/* Jellyfin Surface ARM64: Search Hub v19 return-to-results fix
 * Origin-restricted, read-only JavaScript taken from the Desktop v1.5 branch.
 * Does not touch playback, video seeking, account credentials, or media files.
 */
(() => {
  'use strict';
  if (location.origin !== "__JFD_SERVER_ORIGIN__") return;
// BEGIN CHATGPT_SEARCHHUB_CENTER_LAUNCH_V16
// Independent of the SearchHub global guard: the server's Injector may load first.
(() => {
  const apply = () => {
    if (!document.head || document.getElementById('jfsh-launch-center-v16')) return;
    const style = document.createElement('style');
    style.id = 'jfsh-launch-center-v16';
    style.textContent = '#jfsh-launch {top:180px!important;left:50%!important;right:auto!important;transform:translateX(-50%)!important;}';
    document.head.appendChild(style);
  };
  apply();
  if (document.readyState === 'loading')
    document.addEventListener('DOMContentLoaded', apply, {once:true});
})();
// END CHATGPT_SEARCHHUB_CENTER_LAUNCH_V16
// BEGIN JFD_SURFACE_PLAYBACK_UI_V21
// Also applies when the server's JavaScript Injector registers SearchHub first.
(() => {
  const STYLE='jfd-surface-playback-ui-v21';
  const ACTIVE='jfd-surface-playback-active';
  function visible(el) {
    if (!el || !el.isConnected) return false;
    const r=el.getBoundingClientRect();
    if (!r || r.width<120 || r.height<90) return false;
    const css=getComputedStyle(el);
    return css.visibility!=='hidden' && css.display!=='none';
  }
  function isPlaying() {
    try { if (window.__jfdSurfacePlayerActive?.() === true) return true; }
    catch (_) {}
    if (/\/(?:video|player)(?:[/?]|$)/i.test(window.location.hash)) return true;
    // Jellyfin may render a player overlay without changing the #/home route.
    if ([...document.querySelectorAll('.videoPlayerContainer video,video')].some(v =>
      visible(v) && (v.readyState>0 || (Number.isFinite(v.duration) && v.duration>0)))) return true;
    return [...document.querySelectorAll('#videoOsdPage,.videoOsdPage,.videoPlayerContainer')].some(visible);
  }
  function ensureStyle() {
    if (!document.head || document.getElementById(STYLE)) return;
    const style=document.createElement('style');
    style.id=STYLE;
    style.textContent='body.'+ACTIVE+' #jfsh-launch,body.'+ACTIVE+' #jfsh-return-to-cast {'+
      'display:none!important;visibility:hidden!important;pointer-events:none!important;}';
    document.head.appendChild(style);
  }
  function sync() {
    ensureStyle();
    if (!document.body) return;
    const active=isPlaying();
    if (document.body.classList.contains(ACTIVE)!==active)
      document.body.classList.toggle(ACTIVE,active);
  }
  window.__jfdSurfacePlaybackUI=Object.freeze({isPlaying,sync});
  sync();
  if (document.readyState==='loading')
    document.addEventListener('DOMContentLoaded',sync,{once:true});
  window.addEventListener('hashchange',sync);
  document.addEventListener('playing',sync,true);
  document.addEventListener('loadedmetadata',sync,true);
  document.addEventListener('emptied',sync,true);
  document.addEventListener('ended',sync,true);
  setInterval(sync,400);
})();
// END JFD_SURFACE_PLAYBACK_UI_V21
// BEGIN JFD_SURFACE_LAUNCHER_RECOVERY_V22
// Keep a launcher available after the SearchHub close button, even when a
// server-side JavaScript Injector owns the main SearchHub registration.
(() => {
  const BUTTON_ID='jfsh-launch';
  const SEARCH_ID='jfsh-v1';
  const STYLE_ID='jfd-surface-launcher-v22';
  function ensureLauncherStyle() {
    if (!document.head || document.getElementById(STYLE_ID)) return;
    const style=document.createElement('style');
    style.id=STYLE_ID;
    style.textContent='#jfsh-launch {top:180px!important;left:50%!important;right:auto!important;transform:translateX(-50%)!important;}';
    document.head.appendChild(style);
  }
  function ready() {
    const api=window.ApiClient;
    try {
      return Boolean(api && typeof api.getCurrentUserId==='function' &&
        api.getCurrentUserId() && typeof api.fetch==='function' &&
        typeof api.getUrl==='function');
    } catch (_) { return false; }
  }
  function repairLauncher() {
    ensureLauncherStyle();
    if (!document.body) return false;
    const searchOpen=Boolean(document.getElementById(SEARCH_ID));
    const playing=window.__jfdSurfacePlaybackUI?.isPlaying?.()===true;
    const hidden=searchOpen || playing || Boolean(document.fullscreenElement);
    let button=document.getElementById(BUTTON_ID);
    if (!ready()) {
      if(button) button.style.display='none';
      return false;
    }
    if (!button && !hidden) {
      button=document.createElement('button');
      button.id=BUTTON_ID;
      button.type='button';
      button.textContent='🔎 検索一覧';
      button.title='女優・シリーズ・ジャンル一覧';
      document.body.appendChild(button);
    }
    if(button) {
      // Inline !important wins over an older server-side Injector's 88px rule.
      button.style.setProperty('top','180px','important');
      button.style.display=hidden?'none':'';
    }
    return Boolean(button && !hidden);
  }
  window.__jfdSurfaceLauncher=Object.freeze({repair:repairLauncher});
  repairLauncher();
  if(document.readyState==='loading')
    document.addEventListener('DOMContentLoaded',repairLauncher,{once:true});
  window.addEventListener('hashchange',repairLauncher);
  setInterval(repairLauncher,500);
})();
// END JFD_SURFACE_LAUNCHER_RECOVERY_V22
// BEGIN CHATGPT_JELLYFIN_SEARCHHUB_V15
if (typeof document !== 'undefined' && typeof window !== 'undefined') {
// Read-only cast / series / genre panel. The shared global guard avoids
// duplicate registration when the server-side JavaScript Injector is active.
/* Jellyfin Search Hub v1.5.0 (fast cache + parallel paging) — 10.11.x / JavaScript Injector (private script)
 * Read-only: only invokes GET endpoints; never changes Jellyfin libraries.
 */
(() => {
  'use strict';
  if (window.__JellyfinSearchHubV1) return;
  window.__JellyfinSearchHubV1 = true;

  const ID = 'jfsh-v1';
  const STYLE_ID = 'jfsh-v1-style';
  const PAGE_SIZE = 72; // Works and category lists keep existing behavior.
  const PERSON_PAGE_SIZE = 50;
  const PAGE_BUTTON_WINDOW = 10;
  const MAX_ITEMS = 30000;
  const FETCH_BATCH = 250;
  const FETCH_WORKERS = 4; // Limit parallel requests to avoid overloading TrueNAS.
  const CACHE_TTL_MS = 20 * 60 * 1000;
  const DB_NAME = 'jfsh_v15_readonly';
  const DB_STORE = 'media_cache';
  let databasePromise = null;

  const state = {
    api: null, userId: '', libraries: [], scope: 'jav', tab: 'persons',
    query: '', persons: [], movies: [], movieIndex: {}, personItemMap: new Map(),
    fetchedPersonsKey: '', fetchedMoviesKey: '',
    detail: null, detailItems: [], detailGenres: '', page: 1,
    loading: false, message: '', error: '', epoch: 0, opened: false,
    personMode: 'all', personLetter: 'all', brokenPhotos: new Set(),
    parentScrollTop: 0, parentQuery: '', restoreScrollTop: null
  };
  const e = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({
    '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'
  }[c]));
  const fold = s => String(s || '').normalize('NFKC').toLocaleLowerCase();
  const includes = (s, q) => fold(s).includes(fold(q));
  const image = item => {
    if (!item || !item.Id) return '';
    const tag = (item.ImageTags && item.ImageTags.Primary) || item.PrimaryImageTag;
    if (!tag) return '';
    try {
      const getter = state.api.getImageUrl || state.api.getScaledImageUrl;
      return typeof getter === 'function' ? getter.call(state.api,item.Id,
        {type:'Primary',maxWidth:480,tag}) : '';
    } catch (_) { return ''; }
  };
  // Japanese alphabetical grouping. The visible name can be kanji, kana or Latin.
  // Priority: full-name override -> supplied phonetic/sort data -> local surname dictionary.
  // The offline dictionary deliberately avoids fetching private Jellyfin data from any web service.
  // A kanji-only name without a reliable reading remains in 漢字・その他.
  const KANA_GROUPS = ['あ','か','さ','た','な','は','ま','や','ら','わ'];
  const ALPHA_GROUPS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
  const KANA_ROWS = [
    ['あ','あいうえおぁぃぅぇぉゔ'], ['か','かきくけこがぎぐげご'],
    ['さ','さしすせそざじずぜぞ'], ['た','たちつてとだぢづでどっ'],
    ['な','なにぬねの'], ['は','はひふへほばびぶべぼぱぴぷぺぽ'],
    ['ま','まみむめも'], ['や','やゆよゃゅょ'], ['ら','らりるれろ'],
    ['わ','わをんゎ']
  ];
  // Initial-only Hepburn romanization (covers kana, voiced and semi-voiced forms).
  const ROMAJI_INITIAL_ROWS = [
    ['あいうえおぁぃぅぇぉ','AIUEOAIUEO'],
    ['かきくけこ','KKKKK'],['がぎぐげご','GGGGG'],
    ['さしすせそ','SSSSS'],['ざじずぜぞ','ZJZZZ'],
    ['たちつてと','TCTTT'],['だぢづでど','DJZDD'],
    ['なにぬねの','NNNNN'],
    ['はひふへほ','HHFHH'],['ばびぶべぼ','BBBBB'],['ぱぴぷぺぽ','PPPPP'],
    ['まみむめも','MMMMM'],['やゆよゃゅょ','YYYYYY'],
    ['らりるれろ','RRRRR'],['わをんゎ','WWNW'],['っ','T'],['ゔ','V']
  ];
  const ROMAJI_INITIAL = new Map();
  for (const [chars, letters] of ROMAJI_INITIAL_ROWS) {
    for(let i=0;i<chars.length;i++) ROMAJI_INITIAL.set(chars[i],letters[i]);
  }
  // Full-name exceptions are exact matches; update this when new verified readings are known.
  const FULL_READINGS = new Map(Object.entries({
    '園田みおん':'そのだみおん', 'あいかりん':'あいかりん',
    '明日花キララ':'あすかきらら', '乃々果花':'ののかはな',
    '東雲あずさ':'しののめあずさ', '楪カレン':'ゆずりはかれん',
    '水卜さくら':'みうらさくら', '夢乃あいか':'ゆめのあいか',
    '羽咲みはる':'うさみみはる', '凪ひかる':'なぎひかる'
  }));
  // Frequent Japanese surnames / stage-name prefixes (longest prefix wins).
  const SURNAME_READINGS = new Map(Object.entries({
    '園田':'そのだ','佐藤':'さとう','鈴木':'すずき','高橋':'たかはし','田中':'たなか','渡辺':'わたなべ',
    '渡邊':'わたなべ','伊藤':'いとう','山本':'やまもと','中村':'なかむら','小林':'こばやし',
    '加藤':'かとう','吉田':'よしだ','山田':'やまだ','佐々木':'ささき','山口':'やまぐち',
    '松本':'まつもと','井上':'いのうえ','木村':'きむら','林':'はやし','清水':'しみず',
    '山崎':'やまざき','山﨑':'やまざき','森':'もり','池田':'いけだ','橋本':'はしもと',
    '阿部':'あべ','石川':'いしかわ','山下':'やました','中島':'なかじま','前田':'まえだ',
    '藤田':'ふじた','小川':'おがわ','岡田':'おかだ','後藤':'ごとう','長谷川':'はせがわ',
    '石井':'いしい','村上':'むらかみ','近藤':'こんどう','坂本':'さかもと','遠藤':'えんどう',
    '青木':'あおき','藤井':'ふじい','斎藤':'さいとう','齋藤':'さいとう','斉藤':'さいとう',
    '西村':'にしむら','福田':'ふくだ','太田':'おおた','三浦':'みうら','藤原':'ふじわら',
    '岡本':'おかもと','松田':'まつだ','中川':'なかがわ','中野':'なかの','原田':'はらだ',
    '小野':'おの','田村':'たむら','竹内':'たけうち','金子':'かねこ','和田':'わだ',
    '中山':'なかやま','石田':'いしだ','上田':'うえだ','森田':'もりた','小島':'こじま',
    '柴田':'しばた','原':'はら','宮崎':'みやざき','宮本':'みやもと','内田':'うちだ',
    '高木':'たかぎ','安藤':'あんどう','谷口':'たにぐち','大野':'おおの','高田':'たかだ',
    '丸山':'まるやま','今井':'いまい','河野':'こうの','藤本':'ふじもと','村田':'むらた',
    '武田':'たけだ','上野':'うえの','杉山':'すぎやま','増田':'ますだ','小山':'こやま',
    '大塚':'おおつか','平野':'ひらの','菅原':'すがわら','久保':'くぼ','松井':'まつい',
    '千葉':'ちば','岩崎':'いわさき','桜井':'さくらい','櫻井':'さくらい','野口':'のぐち',
    '松尾':'まつお','野村':'のむら','新井':'あらい','佐野':'さの','菊池':'きくち',
    '杉本':'すぎもと','大西':'おおにし','黒田':'くろだ','星野':'ほしの','片山':'かたやま',
    '浜田':'はまだ','濱田':'はまだ','永井':'ながい','本田':'ほんだ','田口':'たぐち',
    '西田':'にしだ','中田':'なかた','吉川':'よしかわ','小松':'こまつ','北村':'きたむら',
    '五十嵐':'いがらし','古川':'ふるかわ','成田':'なりた','小池':'こいけ','長田':'おさだ',
    '川口':'かわぐち','関':'せき','大石':'おおいし','西川':'にしかわ','広瀬':'ひろせ',
    '廣瀬':'ひろせ','小倉':'おぐら','岸本':'きしもと','岡崎':'おかざき','岩田':'いわた',
    '荒木':'あらき','石原':'いしはら','大橋':'おおはし','松岡':'まつおか','松下':'まつした',
    '本間':'ほんま','福島':'ふくしま','秋山':'あきやま','白石':'しらいし','島田':'しまだ',
    '栗原':'くりはら','大久保':'おおくぼ','小沢':'おざわ','小澤':'おざわ','川島':'かわしま',
    '山岸':'やまぎし','坂口':'さかぐち','藤岡':'ふじおか','松浦':'まつうら','酒井':'さかい',
    '三上':'みかみ','深田':'ふかだ','河北':'かわきた','波多野':'はたの','吉沢':'よしざわ',
    '吉澤':'よしざわ','紗倉':'さくら','桃乃木':'もものぎ','天海':'あまみ','天使':'あまつか',
    '葵':'あおい','篠田':'しのだ','東雲':'しののめ','神宮寺':'じんぐうじ','有村':'ありむら',
    '本庄':'ほんじょう','八木':'やぎ','七沢':'ななさわ','明里':'あかり','早乙女':'さおとめ',
    '乙':'おと','岬':'みさき','夕美':'ゆうみ','桜':'さくら','葉月':'はづき','美谷':'みたに',
    '白坂':'しらさか','白浜':'しらはま','橘':'たちばな','小坂':'こさか','北野':'きたの',
    '瀬戸':'せと','夏目':'なつめ','大槻':'おおつき','柚木':'ゆずき','美月':'みづき',
    '月野':'つきの','花咲':'はなさき','藤森':'ふじもり','愛沢':'あいざわ','愛咲':'あいさき',
    '愛音':'あいね','新垣':'あらがき','雨宮':'あまみや','安達':'あだち','安西':'あんざい',
    '一ノ瀬':'いちのせ','一之瀬':'いちのせ','一条':'いちじょう','一色':'いっしき',
    '水野':'みずの','水城':'みずき','水川':'みずかわ','水沢':'みずさわ','水樹':'みずき',
    '水卜':'みうら','美咲':'みさき','若月':'わかつき','若宮':'わかみや','芹沢':'せりざわ',
    '香坂':'こうさか','香澄':'かすみ','香月':'かづき','香山':'かやま','桐谷':'きりたに',
    '桐島':'きりしま','桐原':'きりはら','友田':'ともだ','友永':'ともなが','瀬名':'せな',
    '小泉':'こいずみ','柚月':'ゆづき','高瀬':'たかせ','西野':'にしの','星乃':'ほしの',
    '月島':'つきしま','姫野':'ひめの','日向':'ひなた','朝比奈':'あさひな','風間':'かざま',
    '向井':'むかい','宮下':'みやした','二宮':'にのみや','南':'みなみ','倉木':'くらき',
    '楓':'かえで','凪':'なぎ','未歩':'みほ','美波':'みなみ','天音':'あまね','七海':'ななみ',
    '結城':'ゆうき','夢乃':'ゆめの','羽咲':'うさみ','松坂':'まつざか','楪':'ゆずりは'
  }));
  const SORTED_SURNAMES = [...SURNAME_READINGS.keys()].sort((a,b)=>b.length-a.length);
  function kanaChar(c){
    if(!c)return '';
    const code=c.codePointAt(0);
    return (code>=0x30A1 && code<=0x30F6) ? String.fromCharCode(code-0x60) : c;
  }
  function parseInitial(reading){
    const name=String(reading||'').normalize('NFKC').trim();
    if(!name)return null;
    const latin=name.charAt(0).toUpperCase();
    if(/^[A-Z]$/.test(latin))return {alpha:latin,kana:''};
    const ch=kanaChar(name[0]);
    const alpha=ROMAJI_INITIAL.get(ch);
    if(!alpha)return null;
    const row=KANA_ROWS.find(([,letters])=>letters.includes(ch));
    return {alpha,kana:row?row[0]:''};
  }
  function personInitial(person){
    const name=String(person.Name||'').normalize('NFKC').trim();
    // For native kana names, use the displayed name. Don't accidentally sort by a
    // different English-name order in SortName.
    let got=parseInitial(name);
    if(got)return {...got,type:'phonetic'};
    const override=FULL_READINGS.get(name);
    if(override && (got=parseInitial(override)))return {...got,type:'phonetic'};
    // Jellyfin does not guarantee that People[] includes a phonetic SortName.
    for(const field of ['Reading','PhoneticName','SortName']) {
      if((got=parseInitial(person[field])))return {...got,type:'phonetic'};
    }
    for(const prefix of SORTED_SURNAMES) {
      if(name.startsWith(prefix) && (got=parseInitial(SURNAME_READINGS.get(prefix))))
        return {...got,type:'phonetic'};
    }
    return {type:'other',alpha:'',kana:''};
  }
  function displayPeople(){
    return state.persons.filter(person=>{
      const url=image(person);
      if(!url || state.brokenPhotos.has(person.Key+'|'+url))return false;
      if(state.query && !includes(person.Name,state.query))return false;
      const group=personInitial(person);
      if(state.personMode==='other' && group.type!=='other')return false;
      if(state.personMode==='kana' && !group.kana)return false;
      if(state.personMode==='alpha' && !group.alpha)return false;
      if(state.personLetter!=='all'){
        const initial=state.personMode==='kana'?group.kana:group.alpha;
        if(initial!==state.personLetter)return false;
      }
      return true;
    });
  }
  function initialTabs(){
    const mode=state.personMode;
    const modeTabs=[['all','すべて'],['kana','あいうえお'],['alpha','A〜Z'],['other','読み不明']];
    const modes=`<div class="jfsh-initialmode" role="group" aria-label="名前の種類で絞り込み">${modeTabs.map(([key,label])=>`<button type="button" class="jfsh-index-tab ${mode===key?'selected':''}" data-act="person-mode" data-value="${key}">${label}</button>`).join('')}</div>`;
    if(mode!=='kana'&&mode!=='alpha')return modes;
    const keys=mode==='kana'?KANA_GROUPS:ALPHA_GROUPS;
    return modes+`<div class="jfsh-letter-tabs" role="group" aria-label="頭文字で絞り込み"><button class="jfsh-index-tab ${state.personLetter==='all'?'selected':''}" data-act="person-letter" data-value="all">すべて</button>${keys.map(key=>`<button class="jfsh-index-tab ${state.personLetter===key?'selected':''}" data-act="person-letter" data-value="${key}">${key}${mode==='kana'?'行':''}</button>`).join('')}</div>`;
  }
  function currentApi() {
    const a = window.ApiClient;
    if (!a || typeof a.getCurrentUserId !== 'function' || !a.getCurrentUserId() ||
        typeof a.getUrl !== 'function' || typeof a.fetch !== 'function') return null;
    return a;
  }
  async function get(route, args) {
    const api = state.api;
    if (!api) throw new Error('Jellyfinへのログインを確認してください。');
    // api.fetch() sends the current session's Authorization header.
    const data = await api.fetch({url: api.getUrl(route, args || {}), type: 'GET', dataType: 'json'});
    return (typeof data === 'string') ? JSON.parse(data) : data;
  }
  function selectedLibs() {
    if (state.scope === 'all') return [null];
    if (state.scope === 'jav') {
      const ids = state.libraries.filter(x => /\bJAV\b|ＪＡＶ/i.test(x.Name || ''));
      return ids.map(x => x.Id); // fail closed: never switch a JAV request to all libraries
    }
    return [state.scope];
  }
  function cacheKey() {
    // The cache is isolated by origin, Jellyfin user, and selected library IDs.
    // Changing library scope never reuses another scope's cached content.
    const ids = selectedLibs().map(x=>String(x || 'all')).sort().join(',');
    return `${window.location.origin}|${state.userId}:${state.scope}:${ids}`;
  }
  function openCacheDB() {
    if (databasePromise) return databasePromise;
    databasePromise = new Promise(resolve => {
      if (!('indexedDB' in window)) { resolve(null); return; }
      let req;
      try { req = indexedDB.open(DB_NAME, 1); }
      catch (_) { resolve(null); return; }
      req.onupgradeneeded = () => {
        if (!req.result.objectStoreNames.contains(DB_STORE)) req.result.createObjectStore(DB_STORE);
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
      req.onblocked = () => resolve(null);
    });
    return databasePromise;
  }
  async function cacheRead(key) {
    const db = await openCacheDB();
    if (!db) return null;
    return new Promise(resolve => {
      try {
        const req = db.transaction(DB_STORE,'readonly').objectStore(DB_STORE).get(key);
        req.onsuccess = () => {
          const entry = req.result;
          resolve(entry && Date.now()-entry.time < CACHE_TTL_MS && Array.isArray(entry.movies) ? entry.movies : null);
        };
        req.onerror = () => resolve(null);
      } catch (_) {resolve(null);}
    });
  }
  async function cacheWrite(key, movies) {
    const db = await openCacheDB();
    if (!db) return;
    // Cache only fields the gallery uses to reduce disk, memory and load time.
    const small = movies.map(x=>({
      Id:x.Id,Type:x.Type,Name:x.Name,OriginalTitle:x.OriginalTitle,
      ImageTags:x.ImageTags,PrimaryImageTag:x.PrimaryImageTag,
      SeriesName:x.SeriesName,Genres:x.Genres,Tags:x.Tags,
      People:Array.isArray(x.People)?x.People.filter(p =>
        ['actor','actress'].includes(fold(p.Type).trim())).map(p=>({
          Name:p.Name,Id:p.Id,Type:p.Type,PrimaryImageTag:p.PrimaryImageTag,
          ImageTags:p.ImageTags,SortName:p.SortName,Reading:p.Reading,PhoneticName:p.PhoneticName
        })):[]
    }));
    try {
      const tx = db.transaction(DB_STORE,'readwrite');
      tx.objectStore(DB_STORE).put({time:Date.now(),movies:small},key);
    } catch (_) {/* IndexedDB disabled, quota reached or private mode; work without cache. */}
  }
  async function cacheDrop(key) {
    const db=await openCacheDB();
    if (!db) return;
    try {db.transaction(DB_STORE,'readwrite').objectStore(DB_STORE).delete(key);}catch (_){}
  }
  function useMovies(items,key) {
    state.movies=uniq(items);
    state.movieIndex=Object.fromEntries(state.movies.map(x=>[x.Id,x]));
    deriveActorsFromVisibleMovies();
    state.fetchedMoviesKey=key;
    state.fetchedPersonsKey=key;
  }

  function uniq(items) {
    return [...new Map(items.filter(x=>x && x.Id).map(x=>[x.Id,x])).values()];
  }
  async function collect(route, params, cap, name, epoch) {
    // First request supplies TotalRecordCount; remaining pages are requested in
    // parallel (four workers), preserving complete coverage of the selected scope.
    const first = await get(route,{...params,startIndex:0,limit:FETCH_BATCH});
    const firstItems = Array.isArray(first.Items) ? first.Items : [];
    if (epoch !== state.epoch || !state.opened) return [];
    let result=firstItems.slice();
    const total = Number(first.TotalRecordCount);
    if (Number.isFinite(total) && total >= 0) {
      const limit=Math.min(cap,total);
      const starts=[];
      for(let i=FETCH_BATCH;i<limit;i+=FETCH_BATCH)starts.push(i);
      const chunks=new Array(starts.length);
      let next=0,done=firstItems.length;
      await Promise.all(Array.from({length:Math.min(FETCH_WORKERS,starts.length)},async()=>{
        while(next<starts.length){
          if(epoch!==state.epoch||!state.opened)return;
          const n=next++,offset=starts[n];
          const data=await get(route,{...params,startIndex:offset,limit:Math.min(FETCH_BATCH,limit-offset)});
          chunks[n]=Array.isArray(data.Items)?data.Items:[];
          done+=chunks[n].length;
          if(epoch===state.epoch){state.message=`${name} ${done}/${limit}件 読み込み中…`;setStatus();}
        }
      }));
      if(epoch!==state.epoch||!state.opened)return [];
      result.push(...chunks.flat());
      if(result.length<limit)throw new Error(`作品の取得件数が不足しています (${result.length}/${limit})。情報を更新してください。`);
      return result;
    }
    // Compatibility fallback when a custom Jellyfin API omits TotalRecordCount.
    let start=result.length;
    while(start<cap && result.length && start===result.length &&
      (start===FETCH_BATCH || result.length>=FETCH_BATCH)){
      if(epoch!==state.epoch||!state.opened)return [];
      const data=await get(route,{...params,startIndex:start,limit:Math.min(FETCH_BATCH,cap-start)});
      const chunk=Array.isArray(data.Items)?data.Items:[];
      result.push(...chunk);start+=chunk.length;
      if(epoch===state.epoch){state.message=`${name} ${result.length}件読み込み中…`;setStatus();}
      if(chunk.length<FETCH_BATCH)break;
    }
    return result;
  }
  async function loadLibraries() {
    if(state.libraries.length)return; // Browser session: no unnecessary Views request on reopen.
    const data = await get(`Users/${encodeURIComponent(state.userId)}/Views`, {});
    state.libraries = (data.Items || []).filter(x=>x.Id);
    if (!state.libraries.some(x=>/\bJAV\b|ＪＡＶ/i.test(x.Name || ''))) state.scope = state.libraries[0]?.Id || 'jav';
  }
  // Jellyfin 10.11's /Persons may return people unrelated to ParentId.
  // Only actual playable video entries inside the selected library are authoritative.
  function deriveActorsFromVisibleMovies() {
    const personsByName = new Map();
    const byPerson = new Map();
    for (const movie of state.movies) {
      if (!movie || movie.IsFolder || !['Movie', 'Video', 'Episode'].includes(movie.Type)) continue;
      for (const actor of (Array.isArray(movie.People) ? movie.People : [])) {
        // Actor is Jellyfin's acting-credit classification, not a gender classification.
        if (!['actor', 'actress'].includes(fold(actor.Type).trim())) continue;
        const name = String(actor.Name || '').trim();
        if (!name) continue;
        const key = 'name:' + fold(name); // Merge duplicate entries for the same name.
        const photo = actor.PrimaryImageTag || actor.ImageTags?.Primary || '';
        const sortName=String(actor.SortName || actor.Reading || actor.PhoneticName || '').trim();
        const current = personsByName.get(key);
        if (!current) {
          personsByName.set(key, { Key:key, Id:actor.Id || '', Name:name, SortName:sortName,
            ImageTags:photo ? {Primary:photo} : {} });
          byPerson.set(key, new Map());
        } else if (actor.Id && (!current.Id || !current.ImageTags?.Primary)) {
          if (!current.Id || photo) current.Id = actor.Id;
          if (photo) current.ImageTags = {Primary:photo};
        }
        if(current && sortName && !current.SortName) current.SortName=sortName;
        byPerson.get(key).set(movie.Id,movie);
      }
    }
    state.persons = [...personsByName.values()].sort((a,b) => a.Name.localeCompare(b.Name,'ja'));
    state.personItemMap = new Map([...byPerson].map(([key,items]) => [key,[...items.values()]]));
  }
  async function loadPersons(force=false) {
    // Share the movie query with genre/series. No global /Persons request is used.
    await loadMovies(force);
  }
  async function loadMovies(force=false) {
    const key = cacheKey();
    if (!force && state.fetchedMoviesKey === key) return;
    const epoch = ++state.epoch;
    // A new scope must not retain entries from a different library.
    state.movies=[];state.persons=[];state.movieIndex={};state.personItemMap=new Map();
    state.loading=true;state.error='';
    state.message='出演者情報を確認中…';draw();
    try {
      if(!force){
        const cached=await cacheRead(key);
        if(epoch!==state.epoch||!state.opened)return;
        if(cached){
          useMovies(cached,key);
          state.message='保存済みの一覧を表示中（更新は「情報を更新」）';
          return;
        }
      }
      if(force)await cacheDrop(key);
      const ids = selectedLibs();
      if (!ids.length) throw new Error('対象のJAVライブラリがありません。ライブラリを選択してください。');
      const results = await Promise.all(ids.map(id => collect(`Users/${encodeURIComponent(state.userId)}/Items`, {
        ...(id ? {parentId:id}:{}), recursive:true, includeItemTypes:'Movie,Video,Episode',
        fields:'Genres,Tags,People,Studios', sortBy:'SortName',sortOrder:'Ascending',
        enableImages:true
      },MAX_ITEMS,'作品',epoch)));
      if(epoch!==state.epoch || !state.opened)return;
      useMovies(results.flat(),key);
      void cacheWrite(key,state.movies);
      state.message=state.movies.length>=MAX_ITEMS
        ? `取得上限${MAX_ITEMS}作品から集計しました。上限外の出演者は表示されません。` : '';
    }catch(ex) {if(epoch===state.epoch) state.error='作品・出演者一覧の取得に失敗しました: '+ex.message;}
    finally{if(epoch===state.epoch){state.loading=false;draw();}}
  }
  function seriesNames(item) {
    const names = [];
    if (item.SeriesName) names.push(item.SeriesName);
    if (item.Type==='Series' && item.Name) names.push(item.Name);
    for(const tag of (item.Tags || [])) {
      const m = /^\s*(?:シリーズ|series|シリーズ名)\s*[:：=]\s*(.+)\s*$/i.exec(tag);
      if (m) names.push(m[1].trim());
    }
    return [...new Set(names.filter(Boolean))];
  }
  function categories() {
    const map = new Map();
    const type = state.tab === 'series' ? 'series' : 'genre';
    for(const item of state.movies) {
      const categories = type==='series' ? seriesNames(item) : (item.Genres || []);
      for(const name of categories) {
        const label=String(name||'').trim(); if(!label) continue;
        if(!map.has(label)) map.set(label,[]);
        map.get(label).push(item);
      }
    }
    return [...map].map(([name,items])=>({name,items})).sort((a,b)=>a.name.localeCompare(b.name,'ja'));
  }
  function posterList(items, title) {
    const search=fold(state.query);
    const filtered=items.filter(x=>!search || includes(`${x.Name} ${x.OriginalTitle||''}`,search))
      .filter(x=>!state.detailGenres || (x.Genres||[]).includes(state.detailGenres));
    const show=filtered.slice(0,state.page * PAGE_SIZE);
    const genres=[...new Set(items.flatMap(x=>x.Genres||[]))].sort((a,b)=>a.localeCompare(b,'ja'));
    return `<div class="jfsh-detailhead"><button class="jfsh-back" data-act="back">← 一覧へ</button><strong>${e(title)}</strong><span>${filtered.length}作品</span></div>
      <div class="jfsh-filters"><select id="jfsh-genres"><option value="">全ジャンル</option>${genres.map(x=>`<option value="${e(x)}" ${x===state.detailGenres?'selected':''}>${e(x)}</option>`).join('')}</select></div>
      <div class="jfsh-grid jfsh-posters">${show.map(x=>`<div class="jfsh-work"><button type="button" class="jfsh-tile" data-act="item" data-id="${e(x.Id)}" aria-label="作品の詳細を表示">
          <div class="jfsh-art">${image(x)?`<img loading="lazy" src="${e(image(x))}" alt="">`:'<span class="jfsh-empty">▶</span>'}</div>
          <div class="jfsh-name">${e(x.Name || '作品名なし')}</div></button><button class="jfsh-play" type="button" data-act="play" data-id="${e(x.Id)}" aria-label="${e(x.Name || '作品名なし')}を再生" title="再生">▶</button></div>`).join('')}</div>
      ${show.length<filtered.length?`<button class="jfsh-more" data-act="more">もっと表示 (${filtered.length-show.length}件)</button>`:''}
      ${!filtered.length?'<p class="jfsh-hint">条件に合う作品がありません。</p>':''}`;
  }
  // Numbered paging for the actress/photo gallery only.  For >10 pages, show
  // 1-10, then 11-20 etc.  Each button switches to exactly 50 people.
  function personPager(total) {
    const pages = Math.ceil(total / PERSON_PAGE_SIZE);
    if (pages <= 1) return '';
    const current = Math.min(Math.max(1, state.page), pages);
    const start = Math.floor((current - 1) / PAGE_BUTTON_WINDOW) * PAGE_BUTTON_WINDOW + 1;
    const end = Math.min(pages, start + PAGE_BUTTON_WINDOW - 1);
    const buttons = [];
    const button = (page, label, extraClass = '') => `<button type="button" data-act="person-page" data-page="${page}" class="jfsh-page ${extraClass} ${page === current ? 'selected' : ''}" aria-label="${label}ページ" ${page === current ? 'aria-current="page"' : ''}>${label}</button>`;
    if (current > 1) buttons.push(button(current - 1, '‹ 前へ', 'jfsh-page-step'));
    if (start > 1) buttons.push(button(Math.max(1,start - PAGE_BUTTON_WINDOW), `« ${Math.max(1,start - PAGE_BUTTON_WINDOW)}〜${start-1}`, 'jfsh-page-step'));
    for (let page = start; page <= end; page++) buttons.push(button(page, String(page)));
    if (end < pages) buttons.push(button(end + 1, `${end+1}〜${Math.min(end+PAGE_BUTTON_WINDOW,pages)} »`, 'jfsh-page-step'));
    if (current < pages && !(current === end && end < pages)) buttons.push(button(current + 1, '次へ ›', 'jfsh-page-step'));
    return `<nav class="jfsh-pages" aria-label="女優一覧のページ切り替え">${buttons.join('')}<span class="jfsh-page-summary">${current} / ${pages} ページ</span></nav>`;
  }
  function mainList() {
    if (state.detail) return posterList(state.detailItems,state.detail.name);
    if(state.tab==='persons'){
      const people=displayPeople();
      const totalPages=Math.max(1,Math.ceil(people.length/PERSON_PAGE_SIZE));
      state.page=Math.min(Math.max(1,state.page),totalPages);
      const begin=(state.page-1)*PERSON_PAGE_SIZE;
      const visible=people.slice(begin,begin+PERSON_PAGE_SIZE);
      const pageInfo=people.length ? ` / ${begin+1}〜${begin+visible.length}人目` : '';
      const pages=personPager(people.length);
      return `<p class="jfsh-hint">選択したライブラリの顔写真付き出演者だけを表示します。初回は作品を照合し、次回は約20分間のキャッシュで高速表示します。漢字名は登録済みの読み・内蔵の名字辞書で分類します。読みが判断できない名前は「読み不明」に表示します。</p>
        ${initialTabs()}
        <div class="jfsh-count">${people.length}人（写真あり）${pageInfo}</div>
        ${pages}
        <div class="jfsh-grid jfsh-people">${visible.map(x=>`<button class="jfsh-tile" data-act="person" data-id="${e(x.Key)}">
        <div class="jfsh-art"><img loading="lazy" src="${e(image(x))}" data-person-key="${e(x.Key)}" alt="${e(x.Name)}"></div>
        <div class="jfsh-name">${e(x.Name || '名前未登録')}</div></button>`).join('')}</div>
        ${pages}
        ${!people.length?'<p class="jfsh-hint">この条件で表示できる顔写真付きの出演者はいません。検索条件、画像登録、50音の読み仮名をご確認ください。</p>':''}`;
    }
    const vals=categories().filter(x=>!state.query || includes(x.name,state.query));
    const visible=vals.slice(0,state.page*PAGE_SIZE);
    const isSeries=state.tab==='series';
    return `<p class="jfsh-hint">${isSeries?'シリーズ名・Jellyfinの「シリーズ: ○○」形式のタグを集計します。未登録の作品は分類されません。':'Jellyfinに登録されたジャンルで作品をまとめています。'}</p>
      <div class="jfsh-count">${vals.length}${isSeries?'シリーズ':'ジャンル'}</div>
      <div class="jfsh-catgrid">${visible.map(x=>`<button class="jfsh-category" data-act="category" data-key="${e(x.name)}"><span class="jfsh-cat-icon">${isSeries?'▣':'#'}</span><span class="jfsh-cat-name">${e(x.name)}</span><small>${x.items.length}作品</small></button>`).join('')}</div>
      ${visible.length<vals.length?`<button class="jfsh-more" data-act="more">もっと表示 (${vals.length-visible.length}件)</button>`:''}
      ${!vals.length?`<p class="jfsh-hint">${isSeries?'シリーズ情報が未登録の可能性があります。ジャンル一覧は別途使えます。':'登録済みジャンルがありません。'}</p>`:''}`;
  }
  function ensureStyle() {
    if(document.getElementById(STYLE_ID))return;
    const s=document.createElement('style');s.id=STYLE_ID;
    s.textContent=`
    #jfsh-launch {position:fixed;top:180px;left:50%;right:auto;transform:translateX(-50%);z-index:4100;border:1px solid #3b526b;background:#172b47;color:#fff;border-radius:24px;padding:11px 18px;font-size:14px;font-weight:700;box-shadow:0 6px 24px #0008;cursor:pointer}
    #jfsh-launch:hover{background:#234e77}#${ID}{position:fixed;inset:0;z-index:990000;background:#0b111bed;color:#eef4ff;overflow-y:auto;overflow-x:hidden;overscroll-behavior:contain;touch-action:pan-y;-webkit-overflow-scrolling:touch;font:14px/1.5 system-ui,sans-serif}
    #${ID} * {box-sizing:border-box}#${ID} button,#${ID} select,#${ID} input{font:inherit}#${ID} .jfsh-shell{width:100%;max-width:2000px;margin:auto;padding:24px 16px 90px}
    #${ID} .jfsh-top{display:flex;align-items:center;gap:14px;flex-wrap:wrap;margin-bottom:18px}#${ID} h2{font-size:24px;margin:0;font-weight:750;flex:1}
    #${ID} .jfsh-close,#${ID} .jfsh-reload{padding:8px 15px;border-radius:9px;background:#26354c;color:white;border:1px solid #536078;cursor:pointer}
    #${ID} .jfsh-close{font-size:22px}#${ID} .jfsh-tabs{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:18px}
    #${ID} .jfsh-tab{padding:12px 20px;border-radius:10px;color:#d4e3f4;background:#1a283c;border:1px solid #3d4b60;cursor:pointer}
    #${ID} .jfsh-tab.active{border-color:#00a5dc;background:#005889;color:white;font-weight:700}
    #${ID} .jfsh-controls{display:flex;gap:12px;flex-wrap:wrap;margin-bottom:12px}#${ID} .jfsh-controls input{flex:2;min-width:170px}
    #${ID} input,#${ID} select{background:#1b2b42;color:#fff;padding:10px 13px;border:1px solid #53647d;border-radius:10px;min-height:42px}
    #${ID} .jfsh-controls select{flex:1;max-width:320px;min-width:160px}#${ID} .jfsh-hint{color:#b2c4d9;font-size:13px;margin:12px 0}
    #${ID} .jfsh-status{color:#a9dffa;margin:12px 0}#${ID} .jfsh-error{color:#ffbcaf;margin:10px 0}
    #${ID} .jfsh-initialmode,#${ID} .jfsh-letter-tabs{display:flex;align-items:center;gap:7px;overflow-x:auto;white-space:nowrap;max-width:100%;padding:5px 2px 9px;scrollbar-width:thin}
    #${ID} .jfsh-initialmode{margin:10px 0 5px;flex-wrap:wrap}
    #${ID} .jfsh-letter-tabs{margin:3px 0 12px;flex-wrap:nowrap}
    #${ID} .jfsh-index-tab{flex:none;border-radius:9px;padding:9px 13px;background:#19283e;color:#e6eef7;border:1px solid #52647c;cursor:pointer;min-height:40px}
    #${ID} .jfsh-index-tab.selected{background:#006298;color:white;border-color:#37bdf3;font-weight:700}
    #${ID} .jfsh-count{margin-bottom:10px;color:#d4e6f8}#${ID} .jfsh-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(136px,1fr));gap:16px}
    #${ID} .jfsh-people{grid-template-columns:repeat(auto-fill,minmax(275px,1fr));gap:18px}
    #${ID} .jfsh-people .jfsh-name{font-size:16px;font-weight:600;min-height:42px}
    #${ID} .jfsh-pages{display:flex;flex-wrap:wrap;align-items:center;justify-content:center;gap:7px;margin:14px 0 22px}
    #${ID} .jfsh-page{flex:none;min-width:43px;min-height:43px;padding:8px 11px;background:#1a2b45;color:#ecf3ff;border:1px solid #58708b;border-radius:9px;cursor:pointer}
    #${ID} .jfsh-page:hover{background:#244b71;border-color:#58bce8}
    #${ID} .jfsh-page.selected{background:#006899;color:#fff;font-weight:800;border-color:#4ac7ff}
    #${ID} .jfsh-page-step{min-width:80px}
    #${ID} .jfsh-page-summary{color:#acc6dc;margin-left:8px;white-space:nowrap;font-size:13px}
    #${ID} .jfsh-tile{display:block;min-width:0;border:0;background:#19263a;color:#fff;border-radius:11px;overflow:hidden;cursor:pointer;text-align:left;padding:0}
    #${ID} .jfsh-tile:hover{outline:2px solid #35afe7;transform:translateY(-2px)}#${ID} .jfsh-art{background:#2b374b;aspect-ratio:3/4;display:flex;justify-content:center;align-items:center;overflow:hidden}
    #${ID} .jfsh-art img{height:100%;width:100%;object-fit:cover}#${ID} .jfsh-empty{font-size:40px;color:#869bb2}
    #${ID} .jfsh-work{position:relative;min-width:0}#${ID} .jfsh-work .jfsh-tile{width:100%;height:100%}
    #${ID} .jfsh-play{position:absolute;left:50%;top:40%;transform:translate(-50%,-50%);width:64px;height:64px;display:flex;align-items:center;justify-content:center;border-radius:50%;border:2px solid #fff9;background:#102b44ce;color:white;cursor:pointer;font-size:28px;z-index:2;box-shadow:0 3px 15px #000a}
    #${ID} .jfsh-play:hover,#${ID} .jfsh-play:focus-visible{background:#0077b8;outline:3px solid #51c2ff}#${ID} .jfsh-posters{grid-template-columns:repeat(auto-fill,minmax(165px,1fr))}#${ID} .jfsh-posters .jfsh-art{aspect-ratio:2/3}
    #${ID} .jfsh-name{padding:9px 10px 12px;font-size:13px;line-height:1.45;overflow-wrap:anywhere}
    #${ID} .jfsh-catgrid{display:grid;grid-template-columns:repeat(auto-fill,minmax(210px,1fr));gap:14px}
    #${ID} .jfsh-category{display:flex;gap:10px;align-items:center;min-width:0;padding:20px 16px;cursor:pointer;border-radius:12px;background:#1c2f49;border:1px solid #354964;color:#eaf5ff;text-align:left}
    #${ID} .jfsh-category:hover{border-color:#3db3e6}#${ID} .jfsh-cat-icon{color:#65cbed;font-size:25px}#${ID} .jfsh-cat-name{min-width:0;overflow-wrap:anywhere;flex:1;font-weight:600}
    #${ID} .jfsh-category small{color:#aec5da;white-space:nowrap}#${ID} .jfsh-detailhead{display:flex;gap:14px;align-items:center;flex-wrap:wrap;margin:15px 0;font-size:18px}
    #${ID} .jfsh-detailhead span{color:#b9cede;font-size:13px}#${ID} .jfsh-back,#${ID} .jfsh-more{border:1px solid #496482;background:#1c3853;color:#fff;padding:10px 17px;border-radius:10px;cursor:pointer}
    #${ID} .jfsh-more{display:block;margin:25px auto;padding:14px 38px}#${ID} .jfsh-filters{margin:15px 0}
    @media(max-width:950px){#${ID} .jfsh-people{grid-template-columns:repeat(auto-fill,minmax(205px,1fr));gap:12px}}
    @media(max-width:650px){#jfsh-launch{top:180px;right:auto;padding:8px 12px}#${ID} .jfsh-shell{padding:15px 12px 65px}#${ID} h2{font-size:20px}#${ID} .jfsh-grid{grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}#${ID} .jfsh-people{grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}#${ID} .jfsh-name{font-size:12px;padding:6px}#${ID} .jfsh-people .jfsh-name{font-size:13px;min-height:34px}#${ID} .jfsh-page{min-width:37px;min-height:40px;padding:7px}#${ID} .jfsh-page-step{min-width:69px}#${ID} .jfsh-catgrid{grid-template-columns:1fr 1fr;gap:8px}#${ID} .jfsh-category{padding:12px 9px;flex-wrap:wrap}#${ID} .jfsh-category small{width:100%}}
    `;document.head.appendChild(s);
  }
  function setStatus() {
    const el=document.querySelector(`#${ID} .jfsh-status`);
    if(el)el.textContent=state.message;
  }
  function draw() {
    const root=document.getElementById(ID);if(!root)return;
    const options = [
      `<option value="jav" ${state.scope==='jav'?'selected':''}>JAV 関連ライブラリ</option>`,
      `<option value="all" ${state.scope==='all'?'selected':''}>すべてのライブラリ</option>`,
      ...state.libraries.map(x=>`<option value="${e(x.Id)}" ${state.scope===x.Id?'selected':''}>${e(x.Name)}</option>`)
    ].join('');
    root.innerHTML=`<div class="jfsh-shell">
       <div class="jfsh-top"><h2>🔎 Jellyfin 検索ハブ</h2><button class="jfsh-reload" data-act="refresh">情報を更新</button><button class="jfsh-close" data-act="close" aria-label="閉じる">×</button></div>
       <div class="jfsh-tabs">${[['persons','女優・出演者'],['series','シリーズ'],['genres','ジャンル']].map(([k,label])=>`<button class="jfsh-tab ${state.tab===k?'active':''}" data-act="tab" data-tab="${k}">${label}</button>`).join('')}</div>
       <div class="jfsh-controls"><input id="jfsh-search" type="search" placeholder="${state.detail?'作品名を検索':'名前・キーワードを検索'}" value="${e(state.query)}" aria-label="名前で検索"><select id="jfsh-library" aria-label="ライブラリの選択">${options}</select></div>
       ${state.message?`<div class="jfsh-status" role="status">${e(state.message)}</div>`:'<div class="jfsh-status" role="status"></div>'}
       ${state.error?`<div class="jfsh-error">${e(state.error)}</div>`:''}
       <div class="jfsh-result">${state.loading?'<p class="jfsh-hint">読み込み中…</p>':mainList()}</div>
      </div>`;
    // Apply saved scroll only after the list has finished loading.
    if (!state.loading && state.restoreScrollTop !== null) {
      const top = Math.max(0, Number(state.restoreScrollTop) || 0);
      state.restoreScrollTop = null;
      root.scrollTop = top;
      const detail = state.detail;
      requestAnimationFrame(() => {
        if (document.getElementById(ID) === root && state.detail === detail) root.scrollTop = top;
      });
    }
  }
  function open() {
    if(state.opened)return;
    state.api=currentApi();if(!state.api || !document.body)return;
    const activeUser=state.api.getCurrentUserId();
    if(state.userId && state.userId!==activeUser){state.libraries=[];state.fetchedMoviesKey='';state.fetchedPersonsKey='';}
    state.userId=activeUser;state.opened=true;
    ensureStyle();const root=document.createElement('div');root.id=ID;
    root.setAttribute('role','dialog');root.setAttribute('aria-label','Jellyfin検索ハブ');root.setAttribute('aria-modal','true');
    document.body.appendChild(root);
    // Prevent custom desktop/Surface seek and double-tap gestures on the overlay.
    ['pointerdown','pointermove','pointerup','mousedown','mousemove','mouseup',
     'touchstart','touchmove','touchend','dblclick','wheel'].forEach(type => {
      root.addEventListener(type, event => event.stopPropagation(), {passive:true});
    });
    installSearchSwipe(root);
    state.previousOverflow=document.documentElement.style.overflow;
    document.documentElement.style.overflow='hidden';
    state.message='ライブラリ情報を確認中…';state.loading=true;draw();
    (async()=>{try{await loadLibraries();state.loading=false;state.message=''; await loadTab();}
      catch(ex){state.loading=false;state.error='接続に失敗しました: '+ex.message;draw();}})();
  }
  // Horizontal back swipes are SearchHub navigation, not WebView history.
  // Vertical movement remains browser-native scrolling; do not prevent it.
  function handleSearchBack() {
    if (!state.opened) return false;
    if (state.detail) backToParentList();
    return true; // The search overlay stays open even on its top-level list.
  }
  function installSearchSwipe(root) {
    let touchStart=null, pointerStart=null, lastHandledAt=-Infinity;
    const ignored = target => Boolean(target?.closest?.(
      'input,textarea,select,[role="slider"],.jfsh-letter-tabs,.jfsh-initialmode'));
    const backGesture = (start, x, y) => {
      if (!start) return;
      const dx=x-start.x, dy=y-start.y;
      if (dx < 75 || Math.abs(dx) <= Math.abs(dy)*1.4) return;
      const now=Date.now();
      if (now-lastHandledAt < 500) return; // Pointer + Touch may both fire.
      lastHandledAt=now;
      handleSearchBack();
    };
    root.addEventListener('touchstart', evt => {
      if (evt.touches.length!==1 || ignored(evt.target)) {touchStart=null;return;}
      const t=evt.touches[0];
      touchStart={id:t.identifier,x:t.clientX,y:t.clientY};
    },{passive:true});
    root.addEventListener('touchmove', evt => {
      if (!touchStart || evt.touches.length!==1) return;
      const t=evt.touches[0];
      if (t.identifier!==touchStart.id) return;
      const dx=t.clientX-touchStart.x, dy=t.clientY-touchStart.y;
      if (dx>24 && Math.abs(dx)>Math.abs(dy)*1.4)
        evt.preventDefault(); // Block WebView back navigation, never vertical scroll.
    },{passive:false});
    root.addEventListener('touchend', evt => {
      if (!touchStart) return;
      const t=[...evt.changedTouches].find(t=>t.identifier===touchStart.id);
      if (t) backGesture(touchStart,t.clientX,t.clientY);
      touchStart=null;
    },{passive:true});
    root.addEventListener('touchcancel',()=>{touchStart=null;},{passive:true});
    root.addEventListener('pointerdown', evt => {
      if (evt.pointerType==='touch' && !ignored(evt.target))
        pointerStart={id:evt.pointerId,x:evt.clientX,y:evt.clientY};
      else pointerStart=null;
    },{passive:true});
    root.addEventListener('pointerup',evt=>{
      if (pointerStart && evt.pointerId===pointerStart.id)
        backGesture(pointerStart,evt.clientX,evt.clientY);
      pointerStart=null;
    },{passive:true});
    root.addEventListener('pointercancel',()=>{pointerStart=null;},{passive:true});
  }
  function close() {
    state.opened=false;state.epoch++;document.getElementById(ID)?.remove();
    document.documentElement.style.overflow=state.previousOverflow || '';state.detail=null;state.detailItems=[];state.query='';state.page=1;
    // Recreate and show the launcher immediately, not just on the next 2.5s poll.
    window.__jfdSurfacePlaybackUI?.sync?.();
    window.__jfdSurfaceLauncher?.repair?.();
  }

  // Restore the exact actress/series result set after opening details or playing a movie.
  let lastSelection = null;
  let playPoll = null;
  function restoreNativePointer() {
    try { window.api?.window?.setCursorVisibility?.(true); } catch (_) {}
  }
  function playbackVisible() {
    if (window.__jfdSurfacePlaybackUI?.isPlaying?.() === true) return true;
    if (/\/(?:video|player)(?:[/?]|$)/i.test(window.location.hash)) return true;
    if ([...document.querySelectorAll('.videoPlayerContainer')].some(el =>
      !el.classList.contains('hide') && el.getClientRects().length > 0 &&
      getComputedStyle(el).visibility !== 'hidden')) return true;
    // Jellyfin WebView2 playback can be an overlay without a #/video route.
    // Use visible, initialized media to hide the launcher even when paused.
    return [...document.querySelectorAll('video')].some(v => {
      const r = v.getBoundingClientRect();
      return v.isConnected && r.width > 100 && r.height > 100 &&
        v.readyState > 0 && getComputedStyle(v).visibility !== 'hidden';
    });
  }
  function updateReturnButton() {
    let b = document.getElementById('jfsh-return-to-cast');
    if (!lastSelection || state.opened || !document.body) {
      b?.remove(); return;
    }
    if (!b) {
      b=document.createElement('button');
      b.id='jfsh-return-to-cast';
      b.type='button';
      b.textContent='← 女優・作品一覧に戻る';
      b.title='直前の女優・シリーズ・ジャンルの作品一覧へ戻ります';
      b.setAttribute('aria-label','直前の作品一覧に戻る');
      b.style.cssText='position:fixed;top:86px;left:16px;z-index:2147483645;min-height:42px;'
        +'padding:7px 14px;border:1px solid #4f81a6;border-radius:9px;'
        +'background:rgba(16,41,65,.96);color:#fff;font:600 14px system-ui,sans-serif;'
        +'cursor:pointer;box-shadow:0 4px 12px #0007;';
      b.addEventListener('click',event=>{
        event.preventDefault();event.stopPropagation();returnToResults();
      });
      document.body.appendChild(b);
    }
    b.style.display=playbackVisible()?'none':'block';
  }
  function returnToResults() {
    const saved=lastSelection;
    if (!saved) return false;
    const api=currentApi();
    if (!api || api.getCurrentUserId()!==saved.userId) {
      lastSelection=null;updateReturnButton();return false;
    }
    lastSelection=null;
    if (playPoll) {clearTimeout(playPoll);playPoll=null;}
    updateReturnButton();
    const desiredHash=saved.originHash || '#/home';
    if(window.location.hash !== desiredHash) window.location.hash=desiredHash;
    restoreNativePointer();
    // Reopen from the in-memory, library-scoped index; never rescan the library.
    setTimeout(()=>{
      state.scope=saved.scope;state.tab=saved.tab;
      state.query=saved.query;state.page=saved.page;
      state.personMode=saved.personMode;state.personLetter=saved.personLetter;
      state.parentPage=saved.parentPage;
      state.parentQuery=saved.parentQuery;
      state.parentScrollTop=saved.parentScrollTop;
      state.restoreScrollTop=saved.detailScrollTop;
      state.detail=saved.detail;state.detailItems=saved.detailItems;
      state.detailGenres=saved.detailGenres;
      open();
    },180);
    return true;
  }
  function tryStartNativePlayback(id, attempt=0) {
    if (!lastSelection || lastSelection.itemId!==id || !lastSelection.autoPlay) return;
    if (playbackVisible()) {lastSelection.autoPlay=false;return;}
    if (window.location.hash.includes('id='+encodeURIComponent(id))) {
      const visible=[...document.querySelectorAll('.page')].reverse().find(el=>
        !el.classList.contains('hide') && el.getClientRects().length > 0 &&
        getComputedStyle(el).visibility!=='hidden');
      const target=visible || document;
      const play=target.querySelector('.btnPlay, button[data-action="resume"], button[data-action="play"]');
      if (play && play.getClientRects().length > 0 && !play.disabled) {
        lastSelection.autoPlay=false;
        play.click(); // Jellyfin's normal detail-page playback / resume action.
        return;
      }
    }
    if (attempt<50) playPoll=setTimeout(()=>tryStartNativePlayback(id,attempt+1),180);
    else {
      lastSelection.autoPlay=false; // Safe fallback: user stays on normal details page.
      updateReturnButton();
    }
  }
  function navigateToItem(id, autoPlay) {
    if(!/^[0-9a-f-]{16,64}$/i.test(id) || !state.detail) return;
    lastSelection={
      itemId:id, autoPlay:Boolean(autoPlay), userId:state.userId,
      originHash:window.location.hash,scope:state.scope,tab:state.tab,
      detail:state.detail,detailItems:state.detailItems,
      detailGenres:state.detailGenres,page:state.page,parentPage:state.parentPage||1,
      query:state.query,personMode:state.personMode,personLetter:state.personLetter,
      parentQuery:state.parentQuery,parentScrollTop:state.parentScrollTop,
      detailScrollTop:document.getElementById(ID)?.scrollTop || 0
    };
    if (playPoll) {clearTimeout(playPoll);playPoll=null;}
    close();restoreNativePointer();
    window.location.hash='/details?id='+encodeURIComponent(id);
    updateReturnButton();
    if(autoPlay) playPoll=setTimeout(()=>tryStartNativePlayback(id),260);
  }
  async function loadTab(force=false) {
    if(!state.opened)return;
    if(state.tab==='persons') await loadPersons(force); else await loadMovies(force);
    if(state.opened)draw();
  }
  function rememberParentList() {
    state.parentPage = state.page;
    state.parentQuery = state.query;
    state.parentScrollTop = document.getElementById(ID)?.scrollTop || 0;
  }
  function backToParentList() {
    state.detail=null;state.detailItems=[];state.detailGenres='';
    state.query=state.parentQuery || '';
    state.page=state.parentPage || 1;
    state.restoreScrollTop=state.parentScrollTop || 0;
    draw();
  }
  function openPerson(key) {
    const p=state.persons.find(x=>x.Key===key);if(!p)return;
    rememberParentList();
    state.detail={type:'person',name:p.Name,id:key};state.page=1;state.query='';state.detailGenres='';
    // The same scoped videos that built the person list define the cast works.
    // This avoids accidentally leaking content from unrelated libraries.
    state.detailItems=state.personItemMap.get(key) || [];
    state.message='';state.error='';draw();
  }
  function openCategory(name) {
    const item=categories().find(x=>x.name===name);if(!item)return;
    rememberParentList();
    state.detail={type:state.tab,name:item.name};state.detailItems=item.items;
    state.page=1;state.query='';state.detailGenres='';draw();
  }
  async function setTab(tab){
    if(!['persons','series','genres'].includes(tab))return;
    state.epoch++;state.tab=tab;state.detail=null;state.detailItems=[];
    state.query='';state.page=1;state.message='';state.error='';await loadTab();
  }
  document.addEventListener('click',evt=>{
    const button=evt.target.closest('#jfsh-launch');if(button){open();return;}
    const btn=evt.target.closest(`#${ID} [data-act]`);if(!btn)return;
    const action=btn.dataset.act;
    if(action==='close')close();
    else if(action==='tab')void setTab(btn.dataset.tab);
    else if(action==='more'){state.page++;draw();}
    else if(action==='person-page') {
      const next = Number(btn.dataset.page);
      const pages = Math.ceil(displayPeople().length / PERSON_PAGE_SIZE);
      if(!Number.isInteger(next) || next < 1 || next > pages || next === state.page) return;
      state.page=next;draw();
      const overlay=document.getElementById(ID);
      if(overlay)overlay.scrollTop=0;
    }
    else if(action==='person-mode'){state.personMode=btn.dataset.value;state.personLetter='all';state.page=1;draw();}
    else if(action==='person-letter'){state.personLetter=btn.dataset.value;state.page=1;draw();}
    else if(action==='back') backToParentList();
    else if(action==='person')openPerson(btn.dataset.id);
    else if(action==='category')openCategory(btn.dataset.key);
    else if(action==='refresh'){
      state.fetchedMoviesKey='';state.fetchedPersonsKey='';state.brokenPhotos.clear();state.page=1;state.detail=null;
      state.detailItems=[];void loadTab(true);
    }
    else if(action==='item') navigateToItem(btn.dataset.id,false);
    else if(action==='play') navigateToItem(btn.dataset.id,true);
  });
  // The server may have a stale image tag or an unavailable image resource.
  // Hide failed photo tiles immediately; don't replace them with blank silhouettes.
  document.addEventListener('error',evt=>{
    const img=evt.target;
    if(!img || !img.matches || !img.matches(`#${ID} img[data-person-key]`))return;
    state.brokenPhotos.add(img.dataset.personKey+'|'+img.getAttribute('src'));
    img.closest('.jfsh-tile')?.remove();
    const count=document.querySelector(`#${ID} .jfsh-count`);
    if(count) count.textContent=`${displayPeople().length}人（写真あり）`;
  },true);
  document.addEventListener('input',evt=>{
    if(evt.target.id!=='jfsh-search')return;
    const pos=evt.target.selectionStart;
    state.query=evt.target.value;state.page=1;
    // Rerender the result area only: preserve focus and IME composition.
    if(evt.isComposing)return;
    const root=document.getElementById(ID);if(!root||state.loading)return;
    const shell=root.querySelector('.jfsh-shell');
    const old= shell?.querySelector('.jfsh-result');
    if(old){old.innerHTML=mainList();return;}
    // Initial layout; draw with focus restoration.
    draw();const input=document.getElementById('jfsh-search');input?.focus();
    if(typeof pos==='number')input?.setSelectionRange(pos,pos);
  });
  document.addEventListener('compositionend',evt=>{
    if(evt.target.id==='jfsh-search') { state.query=evt.target.value;state.page=1; const r=document.querySelector(`#${ID} .jfsh-result`);if(r&&!state.loading)r.innerHTML=mainList(); }
  });
  document.addEventListener('change',evt=>{
    if(evt.target.id==='jfsh-library') {
      state.scope=evt.target.value;state.epoch++;state.detail=null;state.detailItems=[];
      state.page=1;state.query='';state.personMode='all';state.personLetter='all';void loadTab();
    }
    if(evt.target.id==='jfsh-genres'){state.detailGenres=evt.target.value;state.page=1;draw();}
  });
  document.addEventListener('keydown',evt=>{if(evt.key==='Escape'&&state.opened)close();});
  function returnFromDetail() {
    // Only intercept Back from a detail screen opened by SearchHub.
    // Never steal the Back operation while video playback is active.
    if (state.opened || !lastSelection || playbackVisible()) return false;
    if (!window.location.hash.includes('/details')) return false;
    return returnToResults();
  }
  window.addEventListener('hashchange',()=>{
    // A browser/trackpad back swipe must not destroy the SearchHub overlay.
    if(state.opened) {
      handleSearchBack();
      return;
    }
    // Jellyfin's own Back button can navigate directly to Home. Restore the
    // same cached works list as the visible '女優・作品一覧に戻る' command.
    if (lastSelection && !playbackVisible() &&
        !window.location.hash.includes('/details')) {
      if (returnToResults()) return;
    }
    restoreNativePointer();updateReturnButton();
  });
  // Jellyfin toolbar Back is handled by its delegated click listener.
  // Capture only that button on SearchHub-opened native details screens.
  document.addEventListener('click',event=>{
    if (state.opened || !lastSelection || playbackVisible() ||
        !window.location.hash.includes('/details')) return;
    const button=event.target?.closest?.(
      '.headerBackButton,.btnBack,.backButton,.navBack,.btnBackButton,[data-action="back"]');
    if (!button || button.closest('#jfsh-return-to-cast')) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    returnToResults();
  },true);
  // Small origin-restricted bridge for the native stop action. No media,
  // tokens, or library information crosses to the native process.
  window.__jfdSurfaceSearchHub = Object.freeze({
    hasPendingReturn() {
      const api=currentApi();
      return Boolean(lastSelection && api && lastSelection.userId===api.getCurrentUserId());
    },
    returnToResults() { return returnToResults(); },
    handleBack() { return handleSearchBack(); },
    returnFromDetail() { return returnFromDetail(); },
    // Native ARM64 toolbar and fullscreen controls must not rely on CSS or
    // the floating launcher being visible; use the same read-only panel.
    openSearch() { open(); return state.opened; }
  });
  function attachButton() {
    updateReturnButton();
    if(!currentApi()){
      document.getElementById('jfsh-launch')?.remove();
      if(state.opened)close();return;
    }
    if (!document.body || !document.head) return;
    const hidden = Boolean(document.fullscreenElement) || playbackVisible() || state.opened;
    const existing=document.getElementById('jfsh-launch');
    if(existing){existing.style.display=hidden ? 'none' : '';return;}
    ensureStyle();const b=document.createElement('button');b.id='jfsh-launch';
    b.textContent='🔎 検索一覧';b.type='button';b.title='女優・シリーズ・ジャンル一覧';
    b.style.display=hidden ? 'none' : '';
    document.body.appendChild(b);
  }
  attachButton();
  // SPA login transitions: lightweight periodic check. Never patch fetch, Jellyfin routing, or application files.
  const timer=setInterval(attachButton,2500);
  window.addEventListener('pagehide',()=>clearInterval(timer),{once:true});
})();
}
// END CHATGPT_JELLYFIN_SEARCHHUB_V15
})();
