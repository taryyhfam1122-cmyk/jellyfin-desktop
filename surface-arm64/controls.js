(() => {
    'use strict';
    // Inject only on the Jellyfin server chosen in the app. No access tokens
    // are read, logged, or passed to native code.
    if (location.origin !== "__JFD_SERVER_ORIGIN__" || window.__jfdSurfaceTouchV1) return;
    window.__jfdSurfaceTouchV1 = true;
    const fingers = new Map();
    let gesture = null;
    let suppressClickUntil = 0;
    let overlay = null;
    let touchStream = false;

    // Chromium may turn a pointer stream into a scroll gesture and send
    // pointercancel. Prevent that only while the Jellyfin player is open:
    // never disable scrolling on the library pages.
    function installTouchStyle() {
        if (document.getElementById('jfd-surface-touch-css')) return;
        const el = document.createElement('style');
        el.id = 'jfd-surface-touch-css';
        el.textContent = [
            '.videoPlayerContainer, .videoPlayerContainer video,',
            '#videoOsdPage { touch-action:none!important; overscroll-behavior:contain; }',
            '.videoPlayerContainer * { -webkit-user-select:none; user-select:none; }'
        ].join(' ');
        (document.head || document.documentElement).appendChild(el);
    }
    if (document.documentElement) installTouchStyle();
    else document.addEventListener('DOMContentLoaded', installTouchStyle, {once:true});

    const reported = new Set();
    function report(event) {
        if (reported.has(event)) return;
        reported.add(event);
        try {
            // Fixed event names only; no URLs, tokens or video names are sent.
            window.chrome?.webview?.postMessage({type:'jfd-touch-status', event});
        } catch (_) { }
    }
    report('script-loaded');

    function seekDelta(dx, count) { return dx * (count === 2 ? .9 : .15); }
    function clamp(value, max) { return Math.max(0, Math.min(max, value)); }
    function video() {
        const elements = [...document.querySelectorAll('.videoPlayerContainer video, video')];
        return elements.find(v => {
            const r = v.getBoundingClientRect();
            return r.width > 100 && r.height > 100 &&
                Number.isFinite(v.duration) && v.duration > 0 &&
                v.isConnected && getComputedStyle(v).visibility !== 'hidden';
        }) || null;
    }
    function avoidUi(target) {
        return !!target?.closest?.('button,a,input,textarea,select,[role="slider"],.videoOsdBottom,.sliderContainer,.chapterThumbContainer,.headerTop,.videoOsd-appBar');
    }
    function inVideoArea(e, v) {
        const r = v.getBoundingClientRect();
        // Use the rendered video area (not the overlay elements) to decide
        // whether a finger started in the central playback region.
        return e.clientX >= r.left && e.clientX <= r.right
            && e.clientY >= r.top + r.height * .07
            && e.clientY <= r.bottom - r.height * .13
            && !avoidUi(e.target);
    }
    function centroid() {
        const pts = [...fingers.values()];
        return {x: pts.reduce((a,p)=>a+p.x,0)/pts.length,
                y: pts.reduce((a,p)=>a+p.y,0)/pts.length};
    }
    function formatTime(t) {
        t = Math.max(0, Math.round(t));
        const h = Math.floor(t/3600), m = Math.floor(t/60)%60, s=t%60;
        return (h ? h+':' + String(m).padStart(2,'0') : String(m)) + ':' + String(s).padStart(2,'0');
    }
    function showOverlay(label) {
        if (!overlay) {
            overlay = document.createElement('div');
            overlay.id = 'jfd-arm64-seek-overlay';
            overlay.style.cssText = 'position:fixed;left:50%;top:44%;transform:translate(-50%,-50%);z-index:2147483640;pointer-events:none;background:#121820da;color:white;border:1px solid #ffffff55;border-radius:12px;padding:15px 28px;font:600 23px system-ui;text-align:center;box-shadow:0 2px 20px #0009';
            document.body.appendChild(overlay);
        }
        overlay.textContent = label;
        overlay.style.display = 'block';
    }
    function hideOverlay() { if (overlay) overlay.style.display='none'; }
    function baseline() {
        const v = video();
        if (!v || !fingers.size) {gesture = null; return;}
        report('gesture-start');
        const p = centroid();
        gesture = {
            v, count: fingers.size, x: p.x, y:p.y, duration:v.duration,
            start:v.currentTime, target:v.currentTime, volume:v.volume,
            mode:null, tap:true, rightEdge:p.x >= innerWidth*.85
        };
    }
    window.addEventListener('pointerdown', e => {
        if (e.pointerType !== 'touch' || touchStream) return;
        const v = video();
        if (!v || (!fingers.size && !inVideoArea(e, v))) return;
        if (fingers.size >= 2) {gesture=null; fingers.clear(); hideOverlay(); return;}
        e.preventDefault();
        e.stopImmediatePropagation();
        fingers.set(e.pointerId, {x:e.clientX, y:e.clientY});
        baseline();
        try { e.target?.setPointerCapture?.(e.pointerId); } catch (_) {}
    }, {capture:true, passive:false});

    window.addEventListener('pointermove', e => {
        if (e.pointerType !== 'touch' || touchStream || !fingers.has(e.pointerId)) return;
        e.preventDefault();
        e.stopImmediatePropagation();
        fingers.set(e.pointerId, {x:e.clientX, y:e.clientY});
        const g=gesture;
        if (!g || g.v !== video() || fingers.size !== g.count) return;
        const p=centroid(), dx=p.x-g.x, dy=p.y-g.y;
        if (!g.mode && Math.max(Math.abs(dx),Math.abs(dy)) < 10) return;
        g.tap=false;
        if (!g.mode) g.mode = g.rightEdge && Math.abs(dy)>Math.abs(dx) ? 'volume'
                            : Math.abs(dx)>=Math.abs(dy) ? 'seek' : 'ignore';
        if (g.mode === 'volume') {
            const volume=clamp(g.volume-dy/(innerHeight*.6),1);
            g.v.volume=volume;
            g.v.muted=false;
            showOverlay('音量 '+Math.round(volume*100)+'%');
        } else if (g.mode === 'seek') {
            g.target=clamp(g.start+seekDelta(dx,g.count),g.duration-.5);
            // Preview the intended time without triggering repeated decoder
            // seeks over Wi-Fi: commit exactly once on finger release.
            report('seek-preview');
            showOverlay(formatTime(g.target)+' / '+formatTime(g.duration));
        }
    }, {capture:true, passive:false});

    function endGesture(e, cancelled) {
        if (e.pointerType !== 'touch' || !fingers.has(e.pointerId)) return;
        e.preventDefault();
        e.stopImmediatePropagation();
        if (!cancelled && gesture && gesture.v === video()) {
            if (gesture.mode==='seek') {
                try { gesture.v.currentTime=gesture.target; report('seek-committed'); } catch (_) { report('seek-error'); }
            } else if (gesture.tap && gesture.count===1) {
                if (gesture.v.paused) gesture.v.play().catch(()=>{});
                else gesture.v.pause();
            }
        }
        fingers.delete(e.pointerId);
        // Never turn a two-finger seek into a one-finger tap on release.
        gesture = null;
        hideOverlay();
        if (fingers.size) fingers.clear();
        suppressClickUntil=performance.now()+350;
    }
    window.addEventListener('pointerup', e=>{ if (!touchStream) endGesture(e,false); }, {capture:true,passive:false});
    window.addEventListener('pointercancel', e=>{
        if (!touchStream && fingers.has(e.pointerId)) {
            report('pointer-cancel');
            endGesture(e,true);
        }
    }, {capture:true,passive:false});

    // Windows WebView2 can deliver touchstart/touchmove even after Chromium
    // cancels pointer events. Prefer this stream whenever it is present.
    // A pointerdown may precede touchstart: upgrading clears pointer state,
    // so exactly one seek/pause action is ever committed.
    const touchPoints = new Map();
    let touchGesture = null;

    function touchCentroid() {
        const p = [...touchPoints.values()];
        return {x:p.reduce((a,v)=>a+v.x,0)/p.length,
                y:p.reduce((a,v)=>a+v.y,0)/p.length};
    }
    function touchBaseline() {
        const v = video();
        if (!v || !touchPoints.size) {touchGesture=null; return;}
        const p = touchCentroid();
        touchGesture = {v, count:touchPoints.size, x:p.x, y:p.y,
            duration:v.duration, start:v.currentTime, target:v.currentTime,
            volume:v.volume, mode:null, tap:true,
            rightEdge:p.x >= innerWidth * .85};
        report('touch-start');
    }
    window.addEventListener('touchstart', e => {
        const v=video();
        if (!v || touchPoints.size >= 2) return;
        const t = e.changedTouches[0];
        if (!t) return;
        if (!touchPoints.size && !inVideoArea({clientX:t.clientX, clientY:t.clientY, target:e.target},v)) return;
        e.preventDefault(); e.stopImmediatePropagation();
        touchStream=true;
        fingers.clear();
        gesture=null;
        hideOverlay();
        for (const p of e.changedTouches) if (touchPoints.size < 2)
            touchPoints.set(p.identifier,{x:p.clientX,y:p.clientY});
        touchBaseline();
    },{capture:true,passive:false});

    window.addEventListener('touchmove', e => {
        if (!touchStream || !touchPoints.size) return;
        e.preventDefault();e.stopImmediatePropagation();
        for (const p of e.changedTouches) if(touchPoints.has(p.identifier))
            touchPoints.set(p.identifier,{x:p.clientX,y:p.clientY});
        const g=touchGesture;
        if (!g || g.v !== video() || touchPoints.size!==g.count) return;
        const p=touchCentroid(), dx=p.x-g.x, dy=p.y-g.y;
        if (!g.mode && Math.max(Math.abs(dx),Math.abs(dy))<10) return;
        g.tap=false;
        if (!g.mode) g.mode=g.rightEdge && Math.abs(dy)>Math.abs(dx) ? 'volume'
            : Math.abs(dx)>=Math.abs(dy) ? 'seek':'ignore';
        if (g.mode==='volume') {
            g.v.volume=clamp(g.volume-dy/(innerHeight*.6),1);
            g.v.muted=false;
            showOverlay('音量 '+Math.round(g.v.volume*100)+'%');
        } else if (g.mode==='seek') {
            g.target=clamp(g.start+seekDelta(dx,g.count),g.duration-.5);
            report('seek-preview');
            showOverlay(formatTime(g.target)+' / '+formatTime(g.duration));
        }
    },{capture:true,passive:false});

    function endTouch(e,cancelled) {
        if (!touchStream || !touchPoints.size) return;
        e.preventDefault();e.stopImmediatePropagation();
        const g=touchGesture;
        if (!cancelled && g && g.v===video()) {
            if (g.mode==='seek') {
                try {g.v.currentTime=g.target;report('seek-committed');} catch (_) {report('seek-error');}
            } else if (g.tap && g.count===1) {
                if (g.v.paused) g.v.play().catch(()=>{}); else g.v.pause();
            }
        }
        touchGesture=null;
        touchPoints.clear();
        touchStream=false;
        hideOverlay();
        suppressClickUntil=performance.now()+350;
    }
    window.addEventListener('touchend', e=>endTouch(e,false),{capture:true,passive:false});
    window.addEventListener('touchcancel', e=>endTouch(e,true),{capture:true,passive:false});
    window.addEventListener('click', e=>{
        if (performance.now()<suppressClickUntil) {
            e.preventDefault(); e.stopImmediatePropagation();
        }
    },true);
    window.addEventListener('blur',()=>{
        fingers.clear(); gesture=null;
        touchPoints.clear(); touchGesture=null; touchStream=false;
        hideOverlay();
    });
})();
