(() => {
    'use strict';
    // Inject only on the Jellyfin server chosen in the app. No access tokens
    // are read, logged, or passed to native code.
    if (location.origin !== "__JFD_SERVER_ORIGIN__" || window.__jfdSurfaceTouchV1) return;
    window.__jfdSurfaceTouchV1 = true;
    const fingers = new Map();
    const blockedPointers = new Set();
    let gesture = null;
    let suppressClickUntil = 0;
    let overlay = null;
    let touchStream = false;
    let touchBlocked = false;
    let pendingCenterTap = null;

    // Single tap: play/pause. Double tap: upper 25% toggles native
    // fullscreen; everywhere else in the video stops playback and goes home.
    // Triple-tap gestures are no longer assigned any action.
    const DOUBLE_TAP_WINDOW_MS=400;
    const TOP_FULLSCREEN_FRACTION=.25;
    function playPause(v) {
        if(v.paused)v.play().catch(()=>{});else v.pause();
    }
    function toggleFullscreen() {
        try {
            window.chrome?.webview?.postMessage({type:'jfd-player-action',action:'toggle-fullscreen'});
            report('top-double-fullscreen');
        } catch (_) {}
    }
    function closeVideoHome(v) {
        v.pause();
        report('double-tap-home');
        try {window.chrome?.webview?.postMessage({type:'jfd-player-action',action:'stop-home'});}
        catch (_) {}
    }
    function resolveSingleTap(entry) {
        if(pendingCenterTap!==entry)return;
        pendingCenterTap=null;
        playPause(entry.v);
    }
    function finishTap(g) {
        if(!g || g.count!==1)return;
        const x=g.x,y=g.y,now=Date.now();
        const upper=y<innerHeight*TOP_FULLSCREEN_FRACTION;
        const pending=pendingCenterTap;
        const pair=pending && pending.v===g.v &&
            pending.upper===upper && now-pending.at<=DOUBLE_TAP_WINDOW_MS &&
            Math.abs(x-pending.x)<85 && Math.abs(y-pending.y)<85;
        if(pair) {
            clearTimeout(pending.timer);
            pendingCenterTap=null;
            if(upper)toggleFullscreen();
            else closeVideoHome(g.v);
            return;
        }
        if(pending){
            clearTimeout(pending.timer);
            resolveSingleTap(pending);
        }
        const entry={v:g.v,x,y,upper,at:now,timer:null};
        pendingCenterTap=entry;
        entry.timer=setTimeout(()=>resolveSingleTap(entry),DOUBLE_TAP_WINDOW_MS);
    }

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

    // v0.6: same seek range as v0.5 with HALF the finger travel (CSS px).
    // 10px=3s, 50px=15s, 100px=60s, 150px=105s, 250px=300s.
    function seekDelta(dx) {
        const distance = Math.abs(dx);
        const stops = [[0,0],[50,15],[100,60],[150,105],[250,300]];
        let seconds = 300 + (distance - 250) * 1.95;
        for (let i=1; i<stops.length; i++) {
            if (distance <= stops[i][0]) {
                const [x0,y0] = stops[i-1], [x1,y1] = stops[i];
                seconds = y0 + (distance-x0)*(y1-y0)/(x1-x0);
                break;
            }
        }
        return Math.sign(dx) * Math.min(900, seconds);
    }
    function clamp(value, max) { return Math.max(0, Math.min(max, value)); }
    // Left 15%: each 50 CSS pixels of vertical travel changes playback speed
    // by exactly 0.05x. Keep 0.5x..4.0x and the original 25px threshold.
    const SPEED_STEP_PX=50;
    const SPEED_STEP=0.05;
    const MIN_PLAYBACK_RATE=0.5;
    const MAX_PLAYBACK_RATE=4.0;
    function playbackRateAt(startRate,dy) {
        // Use integer hundredths to avoid accumulating floating-point errors.
        const deltaSteps=Math.round(-dy/SPEED_STEP_PX);
        const baseHundredths=Math.round(startRate*100);
        const nextHundredths=Math.max(MIN_PLAYBACK_RATE*100,
            Math.min(MAX_PLAYBACK_RATE*100,baseHundredths+deltaSteps*5));
        return nextHundredths/100;
    }
    function updatePlaybackSpeed(g,dy) {
        const rate=playbackRateAt(g.startPlaybackRate,dy);
        if (rate!==g.v.playbackRate) {
            try { g.v.playbackRate=rate; report('speed-changed'); }
            catch (_) { report('speed-error'); }
        }
        const displayed=Number.isFinite(g.v.playbackRate) ? g.v.playbackRate : g.startPlaybackRate;
        showOverlay('再生速度 '+displayed.toFixed(2)+'×');
    }
    // Update playback while the finger is on screen, at most every 250ms.
    // A stationary finger continues seeking until release; the preview follows each update.
    function liveSeek(g, force=false) {
        const now = performance.now();
        if (!force && now-g.lastSeekAt < 250) return;
        if (Math.abs(g.target-g.lastSentTarget) < .5) return;
        try {
            g.v.currentTime=g.target;
            g.lastSentTarget=g.target;
            g.lastSeekAt=now;
            report('seek-live');
        } catch (_) { report('seek-error'); }
    }

    function stopHold(g) {
        if(g && g.holdTimer!=null) {
            clearInterval(g.holdTimer);
            g.holdTimer=null;
        }
    }
    function advanceHold(g, now) {
        if(g.mode!=='seek') return;
        const elapsed=Math.max(0,Math.min(.5,(now-g.lastTickAt)/1000));
        g.lastTickAt=now;
        if(!elapsed || !g.rate) return;
        g.holdOffset+=g.rate*elapsed;
        g.target=clamp(g.start+g.travelDelta+g.holdOffset,g.duration-.5);
    }
    function updateSwipe(g,dx) {
        if(g.holdOnly && Math.abs(dx)<10) return;
        g.holdOnly=false;
        const seconds=seekDelta(dx);
        g.travelDelta=seconds;
        g.rate=seconds;  // video seconds per held second; signed
        g.lastTickAt=performance.now();
        g.target=clamp(g.start+g.travelDelta+g.holdOffset,g.duration-.5);
        report('seek-preview');
        showSeekOverlay(g.target,g.duration);
        liveSeek(g);
    }
    function startHold(g,isActive) {
        g.startedAt=performance.now(); g.lastTickAt=g.startedAt;
        g.rate=0; g.travelDelta=0; g.holdOffset=0; g.holdOnly=false;
        g.holdTimer=setInterval(()=>{
            if(!isActive() || g.v!==video()){stopHold(g);return;}
            const now=performance.now();
            // Leftmost 15% is reserved for vertical speed control.
            // Keep the existing hold-to-rewind in the adjacent left zone.
            if(!g.mode && now-g.startedAt>=500 &&
                ((g.x>innerWidth*.15 && g.x<innerWidth*.32) || g.x>innerWidth*.68)) {
                g.mode='seek'; g.tap=false; g.holdOnly=true;
                g.rate=g.x<innerWidth*.32 ? -15 : 15;
                g.lastTickAt=now;
                report('seek-hold');
                showSeekOverlay(g.target,g.duration);
                return;
            }
            if(g.mode!=='seek') return;
            advanceHold(g,now);
            report('seek-preview');
            showSeekOverlay(g.target,g.duration);
            liveSeek(g);
        },250);
    }
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
    function hideOverlay() {
        if (overlay) overlay.style.display='none';
        window.__jfdTrickplayPreview?.hide();
    }
    function showSeekOverlay(target,duration) {
        if(window.__jfdTrickplayPreview?.show(target,duration)!==true)
            showOverlay(formatTime(target)+' / '+formatTime(duration));
        else if(overlay) overlay.style.display='none';
    }
    function baseline() {
        const v = video();
        if (!v || !fingers.size) {gesture = null; return;}
        report('gesture-start');
        const p = centroid();
        stopHold(gesture);
        gesture = {
            v, count: fingers.size, x: p.x, y:p.y, duration:v.duration,
            start:v.currentTime, target:v.currentTime, volume:v.volume,
            lastSentTarget:v.currentTime, lastSeekAt:-Infinity,
            mode:null, tap:true, rightEdge:p.x >= innerWidth*.85,
            leftEdge:p.x <= innerWidth*.15,
            startPlaybackRate:Math.max(.5,Math.min(4,Math.round((v.playbackRate || 1)*20)/20))
        };
        const current=gesture;
        startHold(current,()=>gesture===current && fingers.size===1 && !touchStream);
        window.__jfdTrickplayPreview?.prefetch(v.currentTime,v.duration);
    }
    window.addEventListener('pointerdown', e => {
        if (e.pointerType !== 'touch' || touchStream) return;
        if (blockedPointers.size) {
            blockedPointers.add(e.pointerId);
            e.preventDefault(); e.stopImmediatePropagation();
            return;
        }
        const v = video();
        if (!v || (!fingers.size && !inVideoArea(e, v))) return;
        if (fingers.size) {
            // Multi-touch cancels the gesture until *all* fingers are up.
            for (const id of fingers.keys()) blockedPointers.add(id);
            blockedPointers.add(e.pointerId);
            stopHold(gesture);
            gesture=null; fingers.clear(); hideOverlay();
            e.preventDefault(); e.stopImmediatePropagation();
            return;
        }
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
                            : g.leftEdge && Math.abs(dy)>Math.abs(dx) ? 'speed'
                            : Math.abs(dx)>=Math.abs(dy) ? 'seek' : 'ignore';
        if (g.mode === 'volume') {
            const volume=clamp(g.volume-dy/(innerHeight*.6),1);
            g.v.volume=volume;
            g.v.muted=false;
            showOverlay('音量 '+Math.round(volume*100)+'%');
        } else if (g.mode === 'speed') {
            updatePlaybackSpeed(g,dy);
        } else if (g.mode === 'seek') {
            updateSwipe(g,dx);
        }
    }, {capture:true, passive:false});

    function endGesture(e, cancelled) {
        if (e.pointerType !== 'touch' || !fingers.has(e.pointerId)) return;
        e.preventDefault();
        e.stopImmediatePropagation();
        if (!cancelled && gesture && gesture.v === video()) {
            if (gesture.mode==='seek') {
                advanceHold(gesture,performance.now());
                liveSeek(gesture,true);
                report('seek-committed');
            } else if (gesture.tap && gesture.count===1) {
                finishTap(gesture);
            }
        }
        fingers.delete(e.pointerId);
        stopHold(gesture);
        // Never turn a two-finger seek into a one-finger tap on release.
        gesture = null;
        hideOverlay();
        if (fingers.size) fingers.clear();
        suppressClickUntil=performance.now()+350;
    }
    window.addEventListener('pointerup', e=>{
        if (blockedPointers.delete(e.pointerId)) {
            e.preventDefault(); e.stopImmediatePropagation();
            suppressClickUntil=performance.now()+350;
            return;
        }
        if (!touchStream) endGesture(e,false);
    }, {capture:true,passive:false});
    window.addEventListener('pointercancel', e=>{
        if (blockedPointers.delete(e.pointerId)) return;
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
        stopHold(touchGesture);
        touchGesture = {v, count:touchPoints.size, x:p.x, y:p.y,
            duration:v.duration, start:v.currentTime, target:v.currentTime,
            lastSentTarget:v.currentTime, lastSeekAt:-Infinity,
            volume:v.volume, mode:null, tap:true,
            rightEdge:p.x >= innerWidth * .85,
            leftEdge:p.x <= innerWidth * .15,
            startPlaybackRate:Math.max(.5,Math.min(4,Math.round((v.playbackRate || 1)*20)/20))};
        const current=touchGesture;
        startHold(current,()=>touchGesture===current && touchStream && !touchBlocked && touchPoints.size===1);
        window.__jfdTrickplayPreview?.prefetch(v.currentTime,v.duration);
        report('touch-start');
    }
    window.addEventListener('touchstart', e => {
        const v=video();
        if (!v) return;
        if (touchBlocked) {
            e.preventDefault(); e.stopImmediatePropagation();
            return;
        }
        if ((e.touches?.length ?? 0)>1 || touchPoints.size + e.changedTouches.length>1) {
            if (touchStream || touchPoints.size) {
                touchBlocked=true;
                touchStream=true;
                stopHold(touchGesture); stopHold(gesture);
                touchGesture=null;
                touchPoints.clear();
                fingers.clear();
                blockedPointers.clear();
                gesture=null;
                hideOverlay();
                e.preventDefault(); e.stopImmediatePropagation();
            }
            return;
        }
        const t = e.changedTouches[0];
        if (!t) return;
        if (!touchPoints.size && !inVideoArea({clientX:t.clientX, clientY:t.clientY, target:e.target},v)) return;
        e.preventDefault(); e.stopImmediatePropagation();
        touchStream=true;
        stopHold(gesture);
        fingers.clear();
        blockedPointers.clear();
        gesture=null;
        hideOverlay();
        touchPoints.set(t.identifier,{x:t.clientX,y:t.clientY});
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
            : g.leftEdge && Math.abs(dy)>Math.abs(dx) ? 'speed'
            : Math.abs(dx)>=Math.abs(dy) ? 'seek':'ignore';
        if (g.mode==='volume') {
            g.v.volume=clamp(g.volume-dy/(innerHeight*.6),1);
            g.v.muted=false;
            showOverlay('音量 '+Math.round(g.v.volume*100)+'%');
        } else if (g.mode==='speed') {
            updatePlaybackSpeed(g,dy);
        } else if (g.mode==='seek') {
            updateSwipe(g,dx);
        }
    },{capture:true,passive:false});

    function endTouch(e,cancelled) {
        if (!touchStream || !touchPoints.size) return;
        e.preventDefault();e.stopImmediatePropagation();
        const g=touchGesture;
        if (!cancelled && g && g.v===video()) {
            if (g.mode==='seek') {
                advanceHold(g,performance.now());
                liveSeek(g,true);
                report('seek-committed');
            } else if (g.tap && g.count===1) {
                finishTap(g);
            }
        }
        stopHold(touchGesture);
        touchGesture=null;
        touchPoints.clear();
        touchStream=false;
        hideOverlay();
        suppressClickUntil=performance.now()+350;
    }
    function finishTouchStream(e,cancelled) {
        if (touchBlocked) {
            e.preventDefault(); e.stopImmediatePropagation();
            if (!e.touches || !e.touches.length) {
                touchBlocked=false;
                touchStream=false;
                touchPoints.clear();
                touchGesture=null;
                suppressClickUntil=performance.now()+350;
            }
            return;
        }
        endTouch(e,cancelled);
    }
    window.addEventListener('touchend', e=>finishTouchStream(e,false),{capture:true,passive:false});
    window.addEventListener('touchcancel', e=>finishTouchStream(e,true),{capture:true,passive:false});
    window.addEventListener('click', e=>{
        if (performance.now()<suppressClickUntil) {
            e.preventDefault(); e.stopImmediatePropagation();
        }
    },true);
    window.addEventListener('blur',()=>{
        stopHold(gesture); stopHold(touchGesture);
        fingers.clear(); blockedPointers.clear(); gesture=null;
        touchPoints.clear(); touchGesture=null; touchStream=false; touchBlocked=false;
        hideOverlay();
        if(pendingCenterTap) {
            clearTimeout(pendingCenterTap.timer);
            pendingCenterTap=null;
        }
    });
})();
