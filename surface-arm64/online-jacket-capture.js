// Runs ONLY in the user's authenticated Jellyfin Web page at the moment they
// request a media download. Credentials never leave the page; the native app
// receives only a small JPEG thumbnail and an item id.
(() => {
    'use strict';
    const itemId = "__JFD_ITEM_ID__";
    if (!/^[a-f0-9]{32}$/i.test(itemId) || !/^https?:$/.test(location.protocol)) return;
    (async () => {
        try {
            let token = '';
            const raw = localStorage.getItem('jellyfin_credentials');
            if (raw) {
                const saved = JSON.parse(raw);
                const servers = Array.isArray(saved.Servers) ? saved.Servers : [];
                const matchesCurrent = s =>
                    [s.ManualAddress, s.LocalAddress, s.Address].some(addr => {
                        if (typeof addr !== 'string') return false;
                        try { return new URL(addr).origin === location.origin; }
                        catch (_) { return false; }
                    });
                const matching = servers.find(s => s.AccessToken && matchesCurrent(s));
                const selected = matching || (servers.length === 1 ? servers[0] : null);
                if (typeof selected?.AccessToken === 'string') token = selected.AccessToken;
            }
            // Store only title/folder names. The access token stays inside the
            // authenticated WebView and is NEVER included in the native message.
            try {
                const details = new URL('/Items/' + itemId, location.origin);
                details.searchParams.set('Fields', 'Path');
                const infoResponse = await fetch(details.href, {
                    credentials: 'same-origin',
                    headers: token ? { 'X-Emby-Token': token } : {}
                });
                if (infoResponse.ok) {
                    const item = await infoResponse.json();
                    const parts = typeof item.Path === 'string'
                        ? item.Path.replace(/\\/g, '/').split('/').filter(Boolean) : [];
                    const rootIndex = parts.findIndex(p =>
                        /^(JAV(?:\(1280\)|\(Un\)|\(UN\))?|ANIME|3D)$/i.test(p));
                    const folders = rootIndex >= 0 ? parts.slice(rootIndex, -1).slice(0,14) : [];
                    window.chrome?.webview?.postMessage({
                        type:'jfd-offline-meta', itemId,
                        title:typeof item.Name==='string'?item.Name.slice(0,512):'',
                        folders
                    });
                }
            } catch (_) { /* No metadata: file remains visible under 未分類. */ }

            const url = new URL('/Items/' + itemId + '/Images/Primary', location.origin);
            url.searchParams.set('maxWidth', '480');
            url.searchParams.set('quality', '80');
            url.searchParams.set('format', 'Jpg');
            const response = await fetch(url.href, {
                credentials: 'same-origin',
                headers: token ? { 'X-Emby-Token': token } : {}
            });
            if (!response.ok) return;
            const blob = await response.blob();
            if (blob.size < 200 || blob.size > 2_000_000 || !blob.type.startsWith('image/')) return;
            const dataUrl = await new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = () => resolve(reader.result);
                reader.onerror = reject;
                reader.readAsDataURL(blob);
            });
            if (typeof dataUrl !== 'string' || !dataUrl.includes(',')) return;
            window.chrome?.webview?.postMessage({
                type: 'jfd-cover-image', itemId, image: dataUrl.substring(dataUrl.indexOf(',') + 1)
            });
        } catch (_) { /* A missing cover must never interrupt a video download. */ }
    })();
})();
