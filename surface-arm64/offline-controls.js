// Offline-only playback gestures. The Jellyfin online script is intentionally untouched.
// Only local video state and fixed native actions are used; no API keys or URLs are handled.
(() => {
    'use strict';
    const video = document.getElementById('jfd-offline-video');
    const area = document.getElementById('jfd-offline-touch');
    const bar = document.getElementById('jfd-offline-seek');
    const clock = document.getElementById('jfd-offline-clock');
    const play = document.getElementById('jfd-offline-play');
    const rate = document.getElementById('jfd-offline-rate');
    const indicator = document.getElementById('jfd-offline-indicator');
    if (!video || !area || !bar || !clock || !play || !rate || !indicator) return;

    const doubleTapMs = 400;
    const upperFraction = .25;
    const stepPx = 50;
    let drag = null;
    let pendingTap = null;
    let holdTimer = null;
    let hideTimer = null;
    let scrubbing = false;

    function fmt(value) {
        let t = Math.max(0, Math.floor(Number.isFinite(value) ? value : 0));
        const s = String(t % 60).padStart(2, '0');
        t = Math.floor(t / 60);
        const m = String(t % 60).padStart(2, '0');
        return t >= 60 ? Math.floor(t / 60) + ':' + m + ':' + s : t + ':' + s;
    }
    function duration() {
        return Number.isFinite(video.duration) && video.duration > 0 ? video.duration : 0;
    }
    function clamp(n, limit) { return Math.min(Math.max(0, n), Math.max(0, limit)); }
    // Same travel-to-seek profile as Surface's online touch player.
    function seekDelta(dx) {
        const distance = Math.abs(dx);
        const stops = [[0, 0], [50, 15], [100, 60], [150, 105], [250, 300]];
        let seconds = 300 + (distance - 250) * 1.95;
        for (let i = 1; i < stops.length; i++) {
            if (distance <= stops[i][0]) {
                const [x0, y0] = stops[i - 1], [x1, y1] = stops[i];
                seconds = y0 + (distance - x0) * (y1 - y0) / (x1 - x0);
                break;
            }
        }
        return Math.sign(dx) * Math.min(900, seconds);
    }
    function show(message) {
        indicator.textContent = message;
        indicator.hidden = false;
        clearTimeout(hideTimer);
        hideTimer = setTimeout(() => { indicator.hidden = true; }, 950);
    }
    function update() {
        const d = duration();
        bar.max = String(Math.max(1, d));
        if (!scrubbing) bar.value = String(clamp(video.currentTime || 0, d));
        clock.textContent = fmt(scrubbing ? Number(bar.value) : video.currentTime) + ' / ' + fmt(d);
        play.textContent = video.paused ? '▶ 再生' : '⏸ 一時停止';
        rate.textContent = video.playbackRate.toFixed(2) + '×';
    }
    function setTime(t) {
        const d = duration();
        if (!d) return;
        video.currentTime = clamp(t, Math.max(0, d - .05));
        update();
    }
    function togglePlay() {
        if (video.paused) video.play().catch(() => show('この形式は外部プレーヤーで再生してください'));
        else video.pause();
        update();
    }
    function send(action) {
        try { window.chrome?.webview?.postMessage({ type: 'jfd-offline-action', action }); }
        catch (_) { }
    }
    function clearHold() {
        if (holdTimer) clearInterval(holdTimer);
        holdTimer = null;
    }
    function applySpeed(dy) {
        const steps = Math.round(-dy / stepPx);
        const hundredths = Math.max(50, Math.min(400, Math.round(drag.startRate * 100) + steps * 5));
        video.playbackRate = hundredths / 100;
        show('再生速度 ' + video.playbackRate.toFixed(2) + '×');
        update();
    }
    function updateDrag(dx, dy) {
        if (!drag) return;
        if (!drag.mode) {
            if (drag.startX < drag.rect.width * .15 && Math.abs(dy) > 25 && Math.abs(dy) > Math.abs(dx))
                drag.mode = 'speed';
            else if (Math.abs(dx) > 12 && Math.abs(dx) > Math.abs(dy) * 1.15)
                drag.mode = 'seek';
        }
        if (drag.mode === 'speed') { applySpeed(dy); return; }
        if (drag.mode === 'seek') {
            drag.dx = dx;
            drag.target = clamp(drag.startTime + seekDelta(dx) + drag.holdOffset, duration() - .05);
            show(fmt(drag.target) + ' / ' + fmt(duration()));
            if (performance.now() - drag.lastSeek > 200) {
                setTime(drag.target);
                drag.lastSeek = performance.now();
            }
            if (!holdTimer) {
                holdTimer = setInterval(() => {
                    if (!drag || drag.mode !== 'seek' || Math.abs(drag.dx) < 15) return;
                    const speed = seekDelta(drag.dx);
                    drag.holdOffset += speed * .2;
                    drag.target = clamp(drag.startTime + seekDelta(drag.dx) + drag.holdOffset, duration() - .05);
                    setTime(drag.target);
                    show(fmt(drag.target) + ' / ' + fmt(duration()));
                }, 200);
            }
        }
    }
    function finishTap(x, y, rect) {
        const at = Date.now();
        const upper = y < rect.height * upperFraction;
        const prev = pendingTap;
        if (prev && at - prev.at <= doubleTapMs && prev.upper === upper &&
            Math.abs(prev.x - x) < 85 && Math.abs(prev.y - y) < 85) {
            clearTimeout(prev.timer);
            pendingTap = null;
            if (upper) send('toggle-fullscreen');
            else { video.pause(); send('list'); }
            return;
        }
        if (prev) { clearTimeout(prev.timer); pendingTap = null; togglePlay(); }
        const tap = { at, x, y, upper, timer: null };
        tap.timer = setTimeout(() => {
            if (pendingTap !== tap) return;
            pendingTap = null;
            togglePlay();
        }, doubleTapMs);
        pendingTap = tap;
    }

    area.addEventListener('pointerdown', e => {
        if (drag || !e.isPrimary || e.button !== 0) return;
        if (e.pointerType === 'mouse' && e.detail > 1) return;
        const rect = area.getBoundingClientRect();
        drag = { id: e.pointerId, rect, startX: e.clientX - rect.left,
            startY: e.clientY - rect.top, startTime: video.currentTime || 0,
            startRate: video.playbackRate, target: video.currentTime || 0,
            mode: null, dx: 0, holdOffset: 0, lastSeek: 0 };
        area.setPointerCapture(e.pointerId);
        e.preventDefault();
    });
    area.addEventListener('pointermove', e => {
        if (!drag || drag.id !== e.pointerId) return;
        updateDrag(e.clientX - drag.rect.left - drag.startX, e.clientY - drag.rect.top - drag.startY);
        e.preventDefault();
    });
    function finishPointer(e, cancel = false) {
        if (!drag || drag.id !== e.pointerId) return;
        const d = drag;
        if (!cancel && d.mode === 'seek') setTime(d.target);
        if (!cancel && !d.mode) finishTap(e.clientX - d.rect.left, e.clientY - d.rect.top, d.rect);
        drag = null;
        clearHold();
        if (area.hasPointerCapture?.(e.pointerId)) area.releasePointerCapture(e.pointerId);
        e.preventDefault();
    }
    area.addEventListener('pointerup', e => finishPointer(e));
    area.addEventListener('pointercancel', e => finishPointer(e, true));
    area.addEventListener('lostpointercapture', () => { drag = null; clearHold(); });
    area.addEventListener('contextmenu', e => e.preventDefault());

    document.getElementById('jfd-offline-back').addEventListener('click', () => { video.pause(); send('list'); });
    play.addEventListener('click', togglePlay);
    document.getElementById('jfd-offline-rewind').addEventListener('click', () => setTime(video.currentTime - 10));
    document.getElementById('jfd-offline-forward').addEventListener('click', () => setTime(video.currentTime + 10));
    bar.addEventListener('input', () => {
        scrubbing = true;
        setTime(Number(bar.value));
        clock.textContent = fmt(Number(bar.value)) + ' / ' + fmt(duration());
    });
    bar.addEventListener('change', () => { setTime(Number(bar.value)); scrubbing = false; update(); });
    video.addEventListener('loadedmetadata', update);
    video.addEventListener('timeupdate', update);
    video.addEventListener('durationchange', update);
    video.addEventListener('play', update);
    video.addEventListener('pause', update);
    video.addEventListener('ratechange', update);
    video.addEventListener('error', () => show('再生できない場合は「保存済み」から外部プレーヤーを選択'));
    document.addEventListener('keydown', e => {
        if (e.target === bar) return;
        if (e.key === 'ArrowRight') { setTime(video.currentTime + 10); e.preventDefault(); }
        else if (e.key === 'ArrowLeft') { setTime(video.currentTime - 10); e.preventDefault(); }
        else if (e.code === 'Space') { togglePlay(); e.preventDefault(); }
        else if (e.key === 'Escape') { video.pause(); send('list'); e.preventDefault(); }
    });
    update();
})();
