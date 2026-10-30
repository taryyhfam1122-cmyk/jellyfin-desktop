(() => {
    'use strict';
    if (location.origin !== "__JFD_SERVER_ORIGIN__" || window.__jfdTrickplayPreview) return;

    // Use Jellyfin Web's own authorized trickplay bubble. No access tokens,
    // video identifiers or credentials are read from storage or passed to the host.
    const sheets = new Map();
    const MAX_SHEETS = 4;
    let root, canvas, label, generation = 0, lastFrame = null;
    let lastStatus = '';
    const infoBubble = () => document.createElement('div');

    function status(value) {
        if (lastStatus === value) return;
        lastStatus = value;
        try {
            window.chrome?.webview?.postMessage({type:'jfd-touch-status',event:value});
        } catch (_) {}
    }

    function create() {
        if (root && root.isConnected) return;
        root = document.createElement('div');
        root.id = 'jfd-arm64-fullscreen-trickplay';
        root.style.cssText = 'position:fixed;inset:0;z-index:2147483620;background:#000;' +
            'display:none;align-items:center;justify-content:center;pointer-events:none';
        canvas = document.createElement('canvas');
        canvas.style.cssText = 'width:100vw;height:100vh;object-fit:contain;background:#000;';
        label = document.createElement('div');
        label.style.cssText = 'position:absolute;bottom:7%;left:50%;transform:translateX(-50%);' +
            'color:white;background:#111b;padding:8px 16px;border-radius:8px;font:22px system-ui';
        root.append(canvas, label);
        document.body.appendChild(root);
    }

    function getSprite(seconds, duration) {
        const slider = document.querySelector('#videoOsdPage .osdPositionSlider');
        if (!slider || typeof slider.updateBubbleHtml !== 'function' || !(duration > 0)) return null;
        const bubble = infoBubble();
        const percent = Math.min(100, Math.max(0, 100 * seconds / duration));
        if (!slider.updateBubbleHtml(bubble, percent)) return null;
        const wrapper = bubble.querySelector('.chapterThumbWrapper');
        if (!wrapper) return null;

        const width = Number.parseFloat(wrapper.style.width);
        const height = Number.parseFloat(wrapper.style.height);
        const x = -Number.parseFloat(wrapper.style.backgroundPositionX);
        const y = -Number.parseFloat(wrapper.style.backgroundPositionY);
        const css = wrapper.style.backgroundImage;
        if (!(width > 0 && height > 0) || !Number.isFinite(x) || !Number.isFinite(y) ||
            !css.startsWith('url(') || !css.endsWith(')')) return null;

        const raw = css.slice(4, -1).trim().replace(/^['"]|['"]$/g, '');
        let uri;
        try { uri = new URL(raw, location.href); } catch (_) { return null; }
        if (uri.origin !== location.origin) return null;
        return {url:uri.href,width,height,x,y};
    }

    function loadSheet(url) {
        const cached = sheets.get(url);
        if (cached) {
            sheets.delete(url);
            sheets.set(url,cached);
            return cached;
        }
        const promise = new Promise((resolve,reject)=>{
            const img = new Image();
            img.onload = () => {
                if (typeof img.decode === 'function')
                    Promise.resolve(img.decode()).then(()=>resolve(img),()=>resolve(img));
                else resolve(img);
            };
            img.onerror = ()=>reject(new Error('sprite'));
            img.src=url;
        });
        sheets.set(url,promise);
        while(sheets.size > MAX_SHEETS) sheets.delete(sheets.keys().next().value);
        promise.catch(()=>{if(sheets.get(url)===promise)sheets.delete(url);});
        return promise;
    }

    function show(seconds,duration) {
        create();
        const sprite = getSprite(seconds,duration);
        if (!sprite) { status('trickplay-unavailable'); return false; }
        label.textContent = Math.floor(seconds/60)+':'+String(Math.floor(seconds%60)).padStart(2,'0');
        const key = sprite.url+'#'+sprite.x+','+sprite.y;
        if (lastFrame===key && root.style.display==='flex') return true;
        const current=++generation;
        loadSheet(sprite.url).then(img=>{
            if (current !== generation || !root || !root.isConnected) return;
            if(sprite.x+sprite.width > img.naturalWidth+1 ||
               sprite.y+sprite.height > img.naturalHeight+1) return;
            // Draw only the requested tile, not the enormous complete JPEG sprite.
            canvas.width=Math.round(sprite.width);
            canvas.height=Math.round(sprite.height);
            canvas.getContext('2d',{alpha:false})?.drawImage(img,
                sprite.x,sprite.y,sprite.width,sprite.height,
                0,0,canvas.width,canvas.height);
            lastFrame=key;
            root.style.display='flex';
            status('trickplay-displayed');
        }).catch(()=>status('trickplay-error'));
        return true;
    }

    function hide() {
        generation++;
        lastFrame=null;
        if(root) root.style.display='none';
    }

    function prefetch(seconds,duration) {
        const sprite=getSprite(seconds,duration);
        if(sprite)loadSheet(sprite.url).catch(()=>{});
    }

    window.__jfdTrickplayPreview={show,hide,prefetch};
})();