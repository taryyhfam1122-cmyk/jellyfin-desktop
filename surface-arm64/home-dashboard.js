// Jellyfin C02 online home redesign. Runs ONLY on the configured server origin.
// All titles, artwork and progress are loaded from the current Jellyfin session.
// Does not read, forward or persist access tokens; it modifies no library data.
(() => {
    'use strict';
    if (location.origin !== "__JFD_SERVER_ORIGIN__" || window.__jfdC02HomeV1) return;
    window.__jfdC02HomeV1 = true;

    const ID = 'jfd-c02-home';
    const STYLE = 'jfd-c02-home-style';
    const CSS = "__JFD_HOME_STYLE__";
    const THEMES = new Set(['modern','oled','navy']);
    const CACHE_MS = 90000;
    const state = {api:null,userId:'',loading:false,updated:0,resume:[],latest:[],
                   favorites:[],views:[],error:'',theme:'modern',lastRoute:'',root:null};
    try {
        const stored = localStorage.getItem('jfd-c02-dashboard-theme');
        if (THEMES.has(stored)) state.theme=stored;
    } catch (_) {}

    function visibleVideo() {
        if (/\/(?:video|player)(?:[/?]|$)/i.test(location.hash)) return true;
        // Jellyfin may keep an empty player container mounted on the home
        // page. Its existence alone must not hide this custom dashboard.
        return [...document.querySelectorAll('video')].some(v=>{
            const rect=v.getBoundingClientRect();
            return v.isConnected && rect.width>100 && rect.height>100 &&
                getComputedStyle(v).visibility!=='hidden' &&
                (v.readyState>0 || (Number.isFinite(v.duration) && v.duration>0));
        });
    }
    function isHome() {
        const hash=location.hash || '';
        return (/^#\/?home(?:[?&/]|$)/i.test(hash) || hash==='#/' || hash==='#') &&
               !visibleVideo() &&
               !document.getElementById('jfsh-v1');
    }
    function apiReady() {
        try {
            const api=window.ApiClient;
            if(!api || typeof api.getCurrentUserId!=='function' ||
               typeof api.fetch!=='function' || typeof api.getUrl!=='function') return null;
            return api.getCurrentUserId() ? api : null;
        } catch (_) { return null; }
    }
    function installStyle() {
        if(!document.head || document.getElementById(STYLE)) return;
        const style=document.createElement('style');
        style.id=STYLE;
        style.textContent=CSS;
        document.head.append(style);
    }
    function node(tag,className,text) {
        const el=document.createElement(tag);
        if(className) el.className=className;
        if(text!==undefined) el.textContent=String(text);
        return el;
    }
    function button(label,className,action) {
        const b=node('button',className,label);
        b.type='button'; b.addEventListener('click',action);
        return b;
    }
    function post(action) {
        try { window.chrome?.webview?.postMessage({type:'jfd-player-action',action}); }
        catch (_) {}
    }
    function format(seconds) {
        if(!Number.isFinite(seconds)||seconds<=0) return '0:00';
        const t=Math.floor(seconds),m=Math.floor(t/60),h=Math.floor(t/3600);
        return h ? h+':'+String(m%60).padStart(2,'0')+':'+String(t%60).padStart(2,'0')
                 : m+':'+String(t%60).padStart(2,'0');
    }
    function title(item) {
        const name=String(item?.Name||'名称未設定');
        const series=String(item?.SeriesName||'');
        return series && series!==name ? series+' · '+name : name;
    }
    function ratio(item) {
        const progress=Number(item?.UserData?.PlaybackPositionTicks||0);
        const duration=Number(item?.RunTimeTicks||0);
        return duration>0 ? Math.max(0,Math.min(100,100*progress/duration)) : 0;
    }
    function time(item) {
        return format(Number(item?.UserData?.PlaybackPositionTicks||0)/1e7) +
            ' / ' + format(Number(item?.RunTimeTicks||0)/1e7);
    }
    function imageUrl(item,maxWidth=380,backdrop=false) {
        const api=state.api;
        if(!api || !item?.Id) return '';
        const primary=item.ImageTags?.Primary || item.PrimaryImageTag || '';
        const back=item.BackdropImageTags?.[0] || '';
        const thumb=item.ImageTags?.Thumb || item.ParentThumbImageTag || '';
        let tag=backdrop?back:primary;
        let type=backdrop?'Backdrop':'Primary';
        let id=item.Id;
        if(!tag && !backdrop && thumb) {
            tag=thumb; type='Thumb'; id=item.ParentThumbItemId || id;
        }
        if(!tag && !backdrop && item.SeriesPrimaryImageTag) {
            tag=item.SeriesPrimaryImageTag;
            id=item.SeriesId || id;
        }
        if(!tag && backdrop) return imageUrl(item,maxWidth,false);
        if(!tag) return '';
        try {
            const getter=api.getImageUrl || api.getScaledImageUrl;
            return typeof getter==='function' ?
                getter.call(api,id,{type,maxWidth,tag}) : api.getUrl('Items/'+id+'/Images/'+type,{maxWidth,tag});
        } catch (_) {return '';}
    }
    async function request(route,params) {
        const a=state.api;
        const response=await a.fetch({url:a.getUrl(route,params),type:'GET',dataType:'json'});
        return typeof response==='string'?JSON.parse(response):response;
    }
    function items(data) {
        return Array.isArray(data)?data : Array.isArray(data?.Items)?data.Items:[];
    }
    async function load(force=false) {
        if(state.loading || !state.api || !state.userId) return;
        if(!force && Date.now()-state.updated<CACHE_MS) return;
        state.loading=true;
        state.error='';
        try {
            const uid=encodeURIComponent(state.userId);
            const fields='RunTimeTicks,UserData,ImageTags,BackdropImageTags,PrimaryImageAspectRatio,SeriesPrimaryImageTag,ParentThumbImageTag';
            const results=await Promise.allSettled([
                request('Users/'+uid+'/Items/Resume',{Limit:16,MediaTypes:'Video',Fields:fields}),
                request('Users/'+uid+'/Items/Latest',{Limit:25,Fields:fields}),
                request('Users/'+uid+'/Items',{Recursive:true,Filters:'IsFavorite',
                    IncludeItemTypes:'Movie,Episode,Series',SortBy:'DateCreated',
                    SortOrder:'Descending',Limit:22,Fields:fields}),
                request('Users/'+uid+'/Views',{})
            ]);
            if(results.every(x=>x.status==='rejected')) {
                state.error='Jellyfinの作品情報を取得できませんでした。接続状態を確認してください。';
                state.updated=0;
            } else {
                state.resume=results[0].status==='fulfilled'?items(results[0].value):[];
                state.latest=results[1].status==='fulfilled'?items(results[1].value):[];
                state.favorites=results[2].status==='fulfilled'?items(results[2].value):[];
                state.views=results[3].status==='fulfilled'?items(results[3].value):[];
                state.updated=Date.now();
            }
        } catch(_) {
            state.error='ホームの読み込みに失敗しました。更新ボタンから再取得できます。';
        } finally {
            state.loading=false;
            if(state.root && isHome()) render();
        }
    }
    function showTheme(name) {
        if(!THEMES.has(name))return;
        state.theme=name;
        try { localStorage.setItem('jfd-c02-dashboard-theme',name); } catch(_) {}
        if(state.root)render();
    }
    function navigateDetails(item,autoplay=false) {
        const id=String(item?.Id||'');
        if(!/^[0-9a-f-]{16,64}$/i.test(id)) return;
        if(state.root)state.root.style.display='none';
        location.hash='/details?id='+encodeURIComponent(id);
        if(!autoplay)return;
        // Use Jellyfin's own play/resume action, including server-side
        // playback reporting. No direct network media URLs are constructed.
        let tries=0;
        const tick=()=>{
            if(visibleVideo())return;
            if(!location.hash.includes('id='+encodeURIComponent(id)))return;
            const pages=[...document.querySelectorAll('.page')].filter(p=>
                p.getClientRects().length && getComputedStyle(p).visibility!=='hidden');
            const scope=pages.at(-1)||document;
            const options=[
                '.btnResume', 'button[data-action="resume"]',
                '.btnPlay', 'button[data-action="play"]',
                'button[data-action="playAll"]'
            ];
            let target=null;
            for(const selector of options) {
                const candidate=scope.querySelector(selector);
                if(candidate && !candidate.disabled && candidate.getClientRects().length) {
                    target=candidate;break;
                }
            }
            if(target) {target.click();return;}
            if(++tries<36)setTimeout(tick,180);
        };
        setTimeout(tick,280);
    }
    function openSearch() {
        state.root.style.display='none';
        try {
            if(window.__jfdSurfaceSearchHub?.openSearch?.())return;
        }catch(_){}
        post('open-search');
    }
    function openSaved() {state.root.style.display='none';post('open-saved');}
    function openProgress() {post('open-progress');}
    function scrollTo(id) {
        const el=state.root?.querySelector('[data-section="'+id+'"]');
        if(el)el.scrollIntoView({behavior:'smooth',block:'start'});
    }
    function nav(side,titleText,ico,fn,isActive=false) {
        const b=button('', 'jfd-side-button',fn);
        if(isActive)b.setAttribute('aria-current','page');
        b.append(node('span','jfd-nav-icon',ico),node('span','',titleText));
        side.append(b);return b;
    }
    function sideBar(root) {
        const side=node('aside','jfd-side');
        const brand=node('div','jfd-brand');
        brand.append(node('span','jfd-brand-symbol','△'),node('span','','Jellyfin C02'));
        side.append(brand);
        const menu=node('nav','jfd-side-nav');
        nav(menu,'ホーム','⌂',()=>{render();},true);
        nav(menu,'検索一覧','⌕',openSearch);
        nav(menu,'保存済み','▣',openSaved);
        nav(menu,'ダウンロード進捗','⇩',openProgress);
        nav(menu,'お気に入り','♥',()=>scrollTo('favorites'));
        side.append(menu);
        const end=node('div','jfd-side-end');
        end.append(node('div','jfd-sidebar-theme-title','表示テーマ'));
        const swatches=node('div','jfd-theme-options');
        for(const [theme,name] of [['modern','モダンダーク'],['oled','OLEDミニマル'],['navy','ネイビーブルー']]) {
            const b=button('','jfd-theme-swatch',()=>showTheme(theme));
            b.dataset.theme=theme;
            b.setAttribute('aria-label',name);
            b.setAttribute('title',name);
            b.setAttribute('aria-pressed',String(theme===state.theme));
            swatches.append(b);
        }
        end.append(swatches);
        end.append(node('p','jfd-side-note','保存済み作品はオフラインでも視聴できます'));
        side.append(end);root.append(side);
    }
    function hero(main) {
        const selected=state.resume[0]||state.latest[0];
        const el=node('section','jfd-hero');
        el.dataset.section='hero';
        const cover=node('div','jfd-hero-cover');
        if(selected) {
            const url=imageUrl(selected,1450,true);
            if(url)cover.style.backgroundImage='url('+JSON.stringify(url)+')';
        }
        el.append(cover,node('div','jfd-hero-shade'));
        const info=node('div','jfd-hero-text');
        const isResume=!!state.resume.length;
        info.append(node('span','jfd-hero-label',isResume?'▶ 続きから再生':'◆ 最近追加した作品'));
        info.append(node('h2','jfd-hero-title',selected?title(selected):'Jellyfinライブラリへようこそ'));
        info.append(node('div','jfd-hero-info',selected?
            (isResume?'再生位置 '+time(selected):'作品の詳細を開いて再生できます'):
            'ライブラリの作品をここに表示します'));
        const track=node('div','jfd-progress');
        const fill=node('div','jfd-progress-fill');
        fill.style.width=(selected?ratio(selected):0)+'%';track.append(fill);
        info.append(track);
        const actions=node('div','jfd-hero-buttons');
        if(selected) {
            actions.append(button(isResume?'▶ 続きから再生':'▶ 再生する',
                'jfd-primary-action',()=>navigateDetails(selected,true)));
            actions.append(button('ⓘ 作品詳細','jfd-secondary-action',()=>navigateDetails(selected)));
        } else {
            actions.append(button('⌕ 検索一覧を開く','jfd-primary-action',openSearch));
        }
        info.append(actions);el.append(info);main.append(el);
    }
    function card(item) {
        const el=button('','jfd-card',()=>navigateDetails(item,true));
        el.setAttribute('aria-label',title(item)+' を再生');
        el.setAttribute('title',title(item));
        const art=node('div','jfd-poster');
        const url=imageUrl(item,410);
        if(url) {
            const img=node('img');
            img.loading='lazy';img.decoding='async';img.src=url;
            img.alt='';img.onerror=()=>{img.remove();art.prepend(node('span','jfd-poster-fallback',title(item)));};
            art.append(img);
        } else art.append(node('span','jfd-poster-fallback',title(item)));
        if(item?.RunTimeTicks>0) {
            const duration=format(Number(item.RunTimeTicks)/1e7);
            art.append(node('span','jfd-poster-tag',duration));
        }
        if(ratio(item)>0) {
            const progress=node('div','jfd-poster-bar');
            const filled=node('span');filled.style.width=ratio(item)+'%';
            progress.append(filled);art.append(progress);
        }
        el.append(art,node('span','jfd-card-title',title(item)));
        return el;
    }
    function row(main,id,heading,data,empty) {
        const section=node('section','jfd-section');
        section.dataset.section=id;
        const titleArea=node('div','jfd-section-title');
        titleArea.append(node('h3','',heading),node('small','',data.length+'作品'));
        section.append(titleArea);
        if(data.length) {
            const strip=node('div','jfd-strip');
            for(const item of data) strip.append(card(item));
            section.append(strip);
        } else section.append(node('p','jfd-empty',empty));
        main.append(section);
    }
    function render() {
        const root=state.root;
        if(!root)return;
        root.className='jfd-theme-'+state.theme;
        root.replaceChildren();
        root.style.display='flex';
        sideBar(root);
        const main=node('main','jfd-main');
        const welcome=node('div','jfd-welcome');
        welcome.append(node('h1','jfd-welcome-title','ホーム'));
        welcome.append(node('span','jfd-welcome-small','Jellyfin C02 · オンラインライブラリ'));
        main.append(welcome);
        if(state.loading && !state.updated && !state.resume.length) {
            main.append(node('p','jfd-loading','作品一覧を読み込んでいます…'));
        } else {
            hero(main);
            const quick=node('div','jfd-quick');
            quick.append(button('⌕ 検索一覧','',openSearch),
                         button('▣ 保存済み（オフライン）','',openSaved),
                         button('⇩ ダウンロード進捗','',openProgress),
                         button('↻ ホームを更新','',()=>{state.updated=0;load(true);render();}));
            main.append(quick);
            row(main,'resume','再生を続ける',state.resume,'再生途中の作品はまだありません。');
            row(main,'latest','最近追加した作品',state.latest,'最近追加した作品はありません。');
            row(main,'favorites','お気に入り',state.favorites,'お気に入りに登録した作品がここに表示されます。');
            if(state.error)main.append(node('p','jfd-empty',state.error));
            main.append(node('div','jfd-content-status',
                state.updated?'実際のJellyfinライブラリから読み込んだ作品を表示しています':'接続済みのJellyfinライブラリを確認しています'));
        }
        root.append(main);
    }
    function sync() {
        if(!document.body || !document.head)return;
        installStyle();
        const should=isHome();
        const api=apiReady();
        if(!should||!api) {
            if(state.root)state.root.style.display='none';
            return;
        }
        const newUser=api.getCurrentUserId();
        const changed=state.userId!==newUser||state.api!==api;
        if(changed) {
            state.api=api;state.userId=newUser;
            state.updated=0;state.resume=[];state.latest=[];state.favorites=[];state.views=[];
        }
        if(!state.root||!state.root.isConnected) {
            state.root=node('div');
            state.root.id=ID;
            document.body.append(state.root);
            render();
        } else if(state.root.style.display==='none')render();
        if(!state.loading && (changed||Date.now()-state.updated>CACHE_MS))load();
    }
    window.addEventListener('hashchange',()=>setTimeout(sync,35));
    document.addEventListener('DOMContentLoaded',sync,{once:true});
    setInterval(sync,1200);
    sync();
})();
