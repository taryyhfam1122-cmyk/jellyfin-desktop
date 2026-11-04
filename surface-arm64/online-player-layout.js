// Presentation only: leave Jellyfin's router, cached views and player untouched.
(() => {
    'use strict';
    if (location.origin !== "__JFD_SERVER_ORIGIN__" ||
        document.getElementById('jfd-online-player-layout')) return;

    const style = document.createElement('style');
    style.id = 'jfd-online-player-layout';
    // Jellyfin Web keeps React pages (search) in a separate skinBody beside
    // mainAnimatedPages (legacy library/person pages and videoOsdPage).
    // The HTML video dialog lives outside both. Hide only browsing content
    // while a local online video has a source, including when paused/seeking.
    // visibility preserves layout and scroll offsets; do not add Jellyfin's
    // hide class, detach pages, or hide the OSD/subtitles/player dialogs.
    // Removing/resetting the media source restores the current route without
    // saving and later overwriting router-owned styles or navigation state.
    const browsing = [
        '.skinBody:not(.mainAnimatedPages)',
        '.mainAnimatedPage:not(#videoOsdPage)',
        '.skinHeader:not(.osdHeader)'
    ];
    const playing = 'body:has(.videoPlayerContainer:not(.hide) video[src]:not([src=""]))';
    style.textContent = browsing.flatMap(selector => [
        `${playing} ${selector}`,
        `${playing} ${selector} *`
    ]).join(',\n') + ' { visibility:hidden!important; pointer-events:none!important; }';
    (document.head || document.documentElement).appendChild(style);
})();
