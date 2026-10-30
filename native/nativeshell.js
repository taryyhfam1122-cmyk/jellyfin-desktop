const features = [
    "filedownload",
    "displaylanguage",
    "htmlaudioautoplay",
    "htmlvideoautoplay",
    "externallinks",
    "clientsettings",
    "multiserver",
    "exitmenu",
    "remotecontrol",
    "fullscreenchange",
    "filedownload",
    "remotevideo",
    "displaymode",
    "screensaver",
    "fileinput"
];

const getPlugins = () => {
    const basePlugins = [
        'inputPlugin',
        'updatePlugin'
    ];

    const mpvEnabled = jmpInfo.settings?.main?.enableMPV !== false;
    if (mpvEnabled) {
        return [
            'mpvVideoPlayer',
            'mpvAudioPlayer',
            ...basePlugins
        ];
    }

    return basePlugins;
};

const plugins = getPlugins();

// Plugins are bundled, return class directly
for (const plugin of plugins) {
    window[plugin] = () => {
        return window["_" + plugin];
    };
}

window.NativeShell = {
    openUrl(url, target) {
        window.api.system.openExternalUrl(url);
    },

    downloadFile(downloadInfo) {
        window.api.system.openExternalUrl(downloadInfo.url);
    },

    openClientSettings() {
        showSettingsModal();
    },

    getPlugins() {
        return plugins;
    }
};

function getDeviceProfile() {
    const CodecProfiles = [];

    if (jmpInfo.settings.video.force_transcode_dovi) {
        CodecProfiles.push({
            'Type': 'Video',
            'Conditions': [
                {
                    'Condition': 'NotEquals',
                    'Property': 'VideoRangeType',
                    'Value': 'DOVI'
                }
            ]
        });
    }

    if (jmpInfo.settings.video.force_transcode_hdr) {
        CodecProfiles.push({
            'Type': 'Video',
            'Conditions': [
                {
                    'Condition': 'Equals',
                    'Property': 'VideoRangeType',
                    'Value': 'SDR'
                }
            ]
        });
    }

    if (jmpInfo.settings.video.force_transcode_hi10p) {
        CodecProfiles.push({
            'Type': 'Video',
            'Conditions': [
                {
                    'Condition': 'LessThanEqual',
                    'Property': 'VideoBitDepth',
                    'Value': '8',
                }
            ]
        });
    }

    if (jmpInfo.settings.video.force_transcode_hevc) {
        CodecProfiles.push({
            'Type': 'Video',
            'Codec': 'hevc',
            'Conditions': [
                {
                    'Condition': 'Equals',
                    'Property': 'Width',
                    'Value': '0',
                }
            ],
        });
        CodecProfiles.push({
            'Type': 'Video',
            'Codec': 'h265',
            'Conditions': [
                {
                    'Condition': 'Equals',
                    'Property': 'Width',
                    'Value': '0',
                }
            ],
        });
    }

    if (jmpInfo.settings.video.force_transcode_av1) {
        CodecProfiles.push({
            'Type': 'Video',
            'Codec': 'av1',
            'Conditions': [
                {
                    'Condition': 'Equals',
                    'Property': 'Width',
                    'Value': '0',
                }
            ],
        });
    }

    if (jmpInfo.settings.video.force_transcode_4k) {
        CodecProfiles.push({
            'Type': 'Video',
            'Conditions': [
                {
                    'Condition': 'LessThanEqual',
                    'Property': 'Width',
                    'Value': '1920',
                },
                {
                    'Condition': 'LessThanEqual',
                    'Property': 'Height',
                    'Value': '1080',
                }
            ]
        });
    }

    const DirectPlayProfiles = [{ 'Type': 'Audio' }, { 'Type': 'Photo' }];

    if (!jmpInfo.settings.video.always_force_transcode) {
        DirectPlayProfiles.push({ 'Type': 'Video' });
    }

    return {
        'Name': 'Jellyfin Desktop',
        'MaxStaticBitrate': 1000000000,
        'MusicStreamingTranscodingBitrate': 1280000,
        'TimelineOffsetSeconds': 5,
        'TranscodingProfiles': [
            { 'Type': 'Audio' },
            {
                'Container': 'ts',
                'Type': 'Video',
                'Protocol': 'hls',
                'AudioCodec': 'aac,mp3,ac3,opus,vorbis',
                'VideoCodec': jmpInfo.settings.video.allow_transcode_to_hevc
                    ? (
                        jmpInfo.settings.video.prefer_transcode_to_h265
                            ? 'h265,hevc,h264,mpeg4,mpeg2video'
                            : 'h264,h265,hevc,mpeg4,mpeg2video'
                    )
                    : 'h264,mpeg4,mpeg2video',
                'MaxAudioChannels': jmpInfo.settings.audio.channels === "2.0" ? '2' : '6'
            },
            { 'Container': 'jpeg', 'Type': 'Photo' }
        ],
        DirectPlayProfiles,
        'ResponseProfiles': [],
        'ContainerProfiles': [],
        CodecProfiles,
        'SubtitleProfiles': [
            { 'Format': 'srt', 'Method': 'External' },
            { 'Format': 'srt', 'Method': 'Embed' },
            { 'Format': 'ass', 'Method': 'External' },
            { 'Format': 'ass', 'Method': 'Embed' },
            { 'Format': 'sub', 'Method': 'Embed' },
            { 'Format': 'sub', 'Method': 'External' },
            { 'Format': 'ssa', 'Method': 'Embed' },
            { 'Format': 'ssa', 'Method': 'External' },
            { 'Format': 'smi', 'Method': 'Embed' },
            { 'Format': 'smi', 'Method': 'External' },
            { 'Format': 'pgssub', 'Method': 'Embed' },
            { 'Format': 'dvdsub', 'Method': 'Embed' },
            { 'Format': 'dvbsub', 'Method': 'Embed' },
            { 'Format': 'pgs', 'Method': 'Embed' }
        ]
    };
}

async function createApi() {
    // Can't append script until document exists
    await new Promise(resolve => {
        document.addEventListener('DOMContentLoaded', resolve);
    });

    const channel = await new Promise((resolve) => {
        /*global QWebChannel */
        new QWebChannel(window.qt.webChannelTransport, resolve);
    });
    return channel.objects;
}

const sectionsFromStorage = window.sessionStorage.getItem('sections');
if (sectionsFromStorage) {
    jmpInfo.sections = JSON.parse(sectionsFromStorage);
}

let rawSettings = {};
Object.assign(rawSettings, jmpInfo.settings);
const settingsFromStorage = window.sessionStorage.getItem('settings');
if (settingsFromStorage) {
    rawSettings = JSON.parse(settingsFromStorage);
    Object.assign(jmpInfo.settings, rawSettings);
}

const settingsDescriptionsFromStorage = window.sessionStorage.getItem('settingsDescriptions');
if (settingsDescriptionsFromStorage) {
    jmpInfo.settingsDescriptions = JSON.parse(settingsDescriptionsFromStorage);
}

jmpInfo.settingsDescriptionsUpdate = [];
jmpInfo.settingsUpdate = [];
window.apiPromise = createApi();
window.initCompleted = new Promise(async (resolve) => {
    window.api = await window.apiPromise;
    const settingUpdate = (section, key) => (
        (data) => new Promise(resolve => {
            rawSettings[section][key] = data;
            window.sessionStorage.setItem("settings", JSON.stringify(rawSettings));
            window.api.settings.setValue(section, key, data, resolve);
        })
    );
    const setSetting = (section, key) => {
        Object.defineProperty(jmpInfo.settings[section], key, {
            set: settingUpdate(section, key),
            get: () => rawSettings[section][key]
        });
    };
    for (const settingGroup of Object.keys(rawSettings)) {
        jmpInfo.settings[settingGroup] = {};
        for (const setting of Object.keys(rawSettings[settingGroup])) {
            setSetting(settingGroup, setting, jmpInfo.settings[settingGroup][setting]);
        }
    }
    window.api.settings.sectionValueUpdate.connect(
        (section, data) => {
            Object.assign(rawSettings[section], data);
            for (const callback of jmpInfo.settingsUpdate) {
                try {
                    callback(section, data);
                } catch (e) {
                    console.error("Update handler failed:", e);
                }
            }

            // Settings will be outdated if page reloads, so save them to session storage
            window.sessionStorage.setItem("settings", JSON.stringify(rawSettings));
        }
    );
    window.api.settings.groupUpdate.connect(
        (section, data) => {
            jmpInfo.settingsDescriptions[section] = data.settings;
            for (const callback of jmpInfo.settingsDescriptionsUpdate) {
                try {
                    callback(section, data);
                } catch (e) {
                    console.error("Description update handler failed:", e);
                }
            }

            // Settings will be outdated if page reloads, so save them to session storage
            window.sessionStorage.setItem("settingsDescriptions", JSON.stringify(jmpInfo.settingsDescriptions));
        }
    );

    // Sync cursor visibility with jellyfin-web's mouse idle state
    const observer = new MutationObserver((mutations) => {
        for (const mutation of mutations) {
            if (mutation.attributeName === 'class') {
                const isIdle = document.body.classList.contains('mouseIdle');
                window.api.window.setCursorVisibility(!isIdle);
            }
        }
    });
    observer.observe(document.body, { attributes: true, attributeFilter: ['class'] });

    resolve();
});

window.NativeShell.AppHost = {
    init() {
        return Promise.resolve({
            deviceName: jmpInfo.deviceName,
            appName: "Jellyfin Desktop",
            appVersion: jmpInfo.version
        });
    },
    getDefaultLayout() {
        return jmpInfo.mode;
    },
    supports(command) {
        return features.includes(command.toLowerCase());
    },
    getDeviceProfile,
    getSyncProfile: getDeviceProfile,
    appName() {
        return "Jellyfin Desktop";
    },
    appVersion() {
        return jmpInfo.version;
    },
    deviceName() {
        return jmpInfo.deviceName;
    },
    exit() {
        window.api.system.exit();
    }
};

async function showSettingsModal() {
    await initCompleted;

    const tooltipCSS = `
        .tooltip {
            position: relative;
            display: inline-block;
            margin-left: 0.5rem;
            font-size: 18px;
            vertical-align: sub;
        }

        .tooltip .tooltip-text {
            visibility: hidden;
            width: max-content;
            max-width: 40em;
            background-color: black;
            color: white;
            text-align: left;
            position: absolute;
            z-index: 1;
            border-radius: 6px;
            padding: 5px;
            top: -4px;
            left: 25px;
            border: solid 1px grey;
            font-size: 12px;
        }

        .tooltip:hover .tooltip-text {
            visibility: visible;
        }`;

    var style = document.createElement('style')
    style.innerText = tooltipCSS
    document.head.appendChild(style)

    const modalContainer = document.createElement("div");
    modalContainer.className = "dialogContainer";
    modalContainer.style.backgroundColor = "rgba(0,0,0,0.5)";
    modalContainer.addEventListener("click", e => {
        if (e.target == modalContainer) {
            modalContainer.remove();
        }
    });
    document.body.appendChild(modalContainer);

    const modalContainer2 = document.createElement("div");
    modalContainer2.className = "focuscontainer dialog dialog-fixedSize dialog-small formDialog opened";
    modalContainer.appendChild(modalContainer2);

    const modalHeader = document.createElement("div");
    modalHeader.className = "formDialogHeader";
    modalContainer2.appendChild(modalHeader);

    const title = document.createElement("h3");
    title.className = "formDialogHeaderTitle";
    title.textContent = "Client Settings";
    modalHeader.appendChild(title);

    const modalContents = document.createElement("div");
    modalContents.className = "formDialogContent smoothScrollY";
    modalContents.style.paddingTop = "2em";
    modalContents.style.marginBottom = "6.2em";
    modalContainer2.appendChild(modalContents);

    const settingUpdateHandlers = {};
    for (const sectionOrder of jmpInfo.sections.sort((a, b) => a.order - b.order)) {
        const section = sectionOrder.key;
        const group = document.createElement("fieldset");
        group.className = "editItemMetadataForm editMetadataForm dialog-content-centered";
        group.style.border = 0;
        group.style.outline = 0;
        modalContents.appendChild(group);

        const createSection = async (clear) => {
            if (clear) {
                group.innerHTML = "";
            }

            const values = jmpInfo.settings[section];
            const settings = jmpInfo.settingsDescriptions[section];

            const legend = document.createElement("legend");
            const legendHeader = document.createElement("h2");
            legendHeader.textContent = section;
            legendHeader.style.textTransform = "capitalize";
            legend.appendChild(legendHeader);
            if (section == "other") {
                const legendSubHeader = document.createElement("h4");
                legendSubHeader.textContent = "Use this section to input custom MPV configuration. These will override the above settings.";
                legend.appendChild(legendSubHeader);
            }
            group.appendChild(legend);

            for (const setting of settings) {
                const label = document.createElement("label");
                label.className = "inputContainer";
                label.style.marginBottom = "1.8em";
                label.style.display = "block";

                let helpElement;
                if (setting.help) {
                    helpElement = document.createElement("div");
                    helpElement.className = "tooltip";
                    const helpIcon = document.createElement("span");
                    helpIcon.style.fontSize = "18px"
                    helpIcon.className = "material-icons help_outline";
                    helpElement.appendChild(helpIcon);
                    const tooltipElement = document.createElement("span");
                    tooltipElement.className = "tooltip-text";
                    tooltipElement.innerText = setting.help;
                    helpElement.appendChild(tooltipElement);
                }

                if (setting.options) {
                    const safeValues = {};
                    const control = document.createElement("select");
                    control.className = "emby-select-withcolor emby-select";
                    for (const option of setting.options) {
                        safeValues[String(option.value)] = option.value;
                        const opt = document.createElement("option");
                        opt.value = option.value;
                        opt.selected = option.value == values[setting.key];
                        let optionName = option.title;
                        const swTest = `${section}.${setting.key}.`;
                        const swTest2 = `${section}.`;
                        if (optionName.startsWith(swTest)) {
                            optionName = optionName.substring(swTest.length);
                        } else if (optionName.startsWith(swTest2)) {
                            optionName = optionName.substring(swTest2.length);
                        }
                        opt.appendChild(document.createTextNode(optionName));
                        control.appendChild(opt);
                    }
                    control.addEventListener("change", async (e) => {
                        jmpInfo.settings[section][setting.key] = safeValues[e.target.value];
                    });
                    const labelText = document.createElement('label');
                    labelText.className = "inputLabel";
                    labelText.textContent = (setting.displayName ? setting.displayName : setting.key) + ": ";
                    label.appendChild(labelText);
                    if (helpElement) label.appendChild(helpElement);
                    label.appendChild(control);
                } else if (setting.inputType === "textarea") {
                    const control = document.createElement("textarea");
                    control.className = "emby-select-withcolor emby-select";
                    control.style = "resize: none;"
                    control.value = values[setting.key];
                    control.rows = 5;
                    control.addEventListener("change", e => {
                        jmpInfo.settings[section][setting.key] = e.target.value;
                    });
                    const labelText = document.createElement('label');
                    labelText.className = "inputLabel";
                    labelText.textContent = (setting.displayName ? setting.displayName : setting.key) + ": ";
                    label.appendChild(labelText);
                    if (helpElement) label.appendChild(helpElement);
                    label.appendChild(control);
                } else {
                    const control = document.createElement("input");
                    control.type = "checkbox";
                    control.checked = values[setting.key];
                    control.addEventListener("change", e => {
                        jmpInfo.settings[section][setting.key] = e.target.checked;
                    });
                    label.appendChild(control);
                    label.appendChild(document.createTextNode(" " + (setting.displayName ? setting.displayName : setting.key)));
                    if (helpElement) label.appendChild(helpElement);
                }

                group.appendChild(label);
            }
        };
        settingUpdateHandlers[section] = () => createSection(true);
        createSection();
    }

    const onSectionUpdate = (section) => {
        if (section in settingUpdateHandlers) {
            settingUpdateHandlers[section]();
        }
    };
    jmpInfo.settingsDescriptionsUpdate.push(onSectionUpdate);
    jmpInfo.settingsUpdate.push(onSectionUpdate);

    if (jmpInfo.settings.main.userWebClient) {
        const group = document.createElement("fieldset");
        group.className = "editItemMetadataForm editMetadataForm dialog-content-centered";
        group.style.border = 0;
        group.style.outline = 0;
        modalContents.appendChild(group);
        const legend = document.createElement("legend");
        const legendHeader = document.createElement("h2");
        legendHeader.textContent = "Saved Server";
        legend.appendChild(legendHeader);
        const legendSubHeader = document.createElement("h4");
        legendSubHeader.textContent = (
            "The server you first connected to is your saved server. " +
            "It provides the web client for Jellyfin in the absence of a bundled one. " +
            "You can use this option to change it to another one. This does NOT log you off."
        );
        legend.appendChild(legendSubHeader);
        group.appendChild(legend);

        const resetSavedServer = document.createElement("button");
        resetSavedServer.className = "raised button-cancel block btnCancel emby-button";
        resetSavedServer.textContent = "Reset Saved Server"
        resetSavedServer.style.marginLeft = "auto";
        resetSavedServer.style.marginRight = "auto";
        resetSavedServer.style.maxWidth = "50%";
        resetSavedServer.addEventListener("click", async () => {
            window.jmpInfo.settings.main.userWebClient = '';
            window.location.href = jmpInfo.scriptPath + "/find-webclient.html";
        });
        group.appendChild(resetSavedServer);
    }

    const closeContainer = document.createElement("div");
    closeContainer.className = "formDialogFooter";
    modalContents.appendChild(closeContainer);

    const close = document.createElement("button");
    close.className = "raised button-cancel block btnCancel formDialogFooterItem emby-button";
    close.textContent = "Close"
    close.addEventListener("click", () => {
        modalContainer.remove();
    });
    closeContainer.appendChild(close);
}

let lastFullscreenState = window.jmpInfo.settings.main.fullscreen;

window.jmpInfo.settingsUpdate.push(function(section) {
    if (section === 'main') {
        const currentFullscreenState = window.jmpInfo.settings.main.fullscreen;
        if (currentFullscreenState !== lastFullscreenState) {
            lastFullscreenState = currentFullscreenState;

            if (window.api && window.api.player) {
                window.api.player.notifyFullscreenChange(currentFullscreenState);
                console.log('Player fullscreen notified');
            }

            if (window.Events && window.playbackManager && window.playbackManager._currentPlayer) {
                window.Events.trigger(window.playbackManager._currentPlayer, 'fullscreenchange');
            }
        }
    }
});
// BEGIN CHATGPT_JFD_MOUSECONTROLS_V05
// Mouse controls for Jellyfin Desktop's embedded Qt/WebEngine/libmpv player.
// Seek uses Qt WebChannel native player rather than playbackManager._currentPlayer.
(function () {
    'use strict';
    if (window.__chatgptJfdMouseV05) return;
    window.__chatgptJfdMouseV05 = true;

    const SMALL_MS_PER_PX = 150;
    const LARGE_MS_PER_PX = 900;
    const DRAG_THRESHOLD = 10;
    const SEEK_THROTTLE_MS = 80;
    const HOLD_DELAY_MS = 350;
    const MAX_LOGS = 65;
    let logCount = 0;
    let native = null;
    let activePlayer = null;
    let playbackManager = null;
    let nativePosition = 0;
    let nativeDuration = 0;
    let nativePaused = false;
    let active = null;
    let ignoreNextClick = false;
    let singleClickTimer = null;
    let suppressAuxUntil = 0;
    let osd = null;
    let osdTimer = null;

    function log(message, obj) {
        if (logCount >= MAX_LOGS) return;
        logCount++;
        try { console.info('[JFD Mouse v0.5] ' + message + (obj ? ' ' + JSON.stringify(obj) : '')); }
        catch (_) { console.info('[JFD Mouse v0.5] ' + message); }
    }

    // Dependencies are supplied by the bundled plugins, not jellyfin-web globals.
    window.jfdMouseControls = {
        setManager(manager) { playbackManager = manager; },
        setPlayer(player) {
            activePlayer = player;
            resetFramePreview();
            cancelTouch();
            touchButton((window.navigator?.maxTouchPoints || 0) > 0);
            resetDrag();
            nativePosition = 0;
            nativeDuration = 0;
            nativePaused = false;

        },
        ended(player) {
            if (activePlayer !== player) return;
            activePlayer = null;
            resetFramePreview();
            cancelTouch();
            touchButton(false);
            resetDrag();

        }
    };

    function bindNativePlayer(api) {
        if (!api || !api.player) { log('Qt player unavailable'); return; }
        native = api.player;
        try {
            native.positionUpdate.connect(value => {
                const n = Number(value);
                if (Number.isFinite(n) && n >= 0) nativePosition = n;
            });
            native.updateDuration.connect(value => {
                const n = Number(value);
                if (Number.isFinite(n) && n > 0) nativeDuration = n;
            });
            native.paused.connect(() => { nativePaused = true; });
            native.playing.connect(() => { nativePaused = false; });
            native.stopped.connect(() => {
                nativeDuration = 0;
                resetFramePreview();
                cancelTouch();
                touchButton(false);
                resetDrag();
            });
            log('Qt player connected');
        } catch (error) { log('Qt signal connection failed', {message: String(error)}); }
    }

    function getContext() {
        if (!native) return {error: 'native-player-not-ready'};
        if (!document.querySelector('.videoPlayerContainer')) return {error: 'video-container-not-found'};
        if (!activePlayer || !activePlayer._started || !activePlayer.currentSrc()) return {error: 'video-not-playing'};
        return {manager: playbackManager, native: native, player: activePlayer};
    }

    function eligibleArea(e) {
        if (e.pointerType && e.pointerType !== 'mouse') return 'not-mouse';
        const node = e.target && e.target.nodeType === 1 ? e.target : null;
        if (!node) return 'no-target';
        if (node.closest('button,a,input,textarea,select,[role="button"],[role="slider"],.sliderContainer,.mdl-slider')) return 'ui-control';
        const h = Math.max(1, window.innerHeight);
        if (e.clientY < h * 0.065 || e.clientY > h * 0.88) return 'outside-video-center';
        return null;
    }

    function clamp(value, duration) {
        const maximum = Math.max(0, duration - 500);
        return Math.max(0, Math.min(maximum, value));
    }

    function clock(value) {
        const sec = Math.floor(Math.max(0, value) / 1000);
        const hh = Math.floor(sec / 3600);
        const mm = Math.floor(sec / 60) % 60;
        const ss = String(sec % 60).padStart(2, '0');
        return hh ? `${hh}:${String(mm).padStart(2, '0')}:${ss}` : `${mm}:${ss}`;
    }

    function showSeek(s) {
        if (!document.body) return;
        if (!osd) {
            osd = document.createElement('div');
            osd.id = 'jfd-v05-mouse-seek';
            osd.style.cssText = 'position:fixed;top:10%;left:50%;transform:translateX(-50%);z-index:2147483647;pointer-events:none;color:#fff;background:rgba(0,0,0,.72);padding:9px 14px;border-radius:8px;font:600 16px sans-serif;white-space:pre';
        }
        if (!osd.isConnected) document.body.appendChild(osd);
        const delta = s.target - s.start;
        const speed = Math.abs(s.dx) >= DRAG_THRESHOLD ? s.dx * rate(s) / 1000 : 0;
        osd.textContent = `${delta >= 0 ? '+' : '-'}${clock(Math.abs(delta))}     ${clock(s.target)} / ${clock(s.duration)}\n${s.touch ? `Touch: ${s.count} finger` : `Hold: ${speed > 0 ? '+' : ''}${speed.toFixed(1)} s/s`}`;
        osd.style.display = 'block';
        clearTimeout(osdTimer);
        osdTimer = setTimeout(() => { if (osd) osd.style.display = 'none'; }, 1000);
    }

    // Full-screen seek preview (experimental). Only enabled on this branch.
    // Jellyfin 10.11 supplies a tile manifest under item.Trickplay. Render
    // one cropped frame on a canvas instead of scaling an entire JPEG sheet.
    // This avoids huge GPU textures on Surface/Qt software rendering.
    const frameTileCache = new Map();
    const FRAME_TILE_CACHE_LIMIT = 4;
    let framePreview = null;
    let framePreviewGeneration = 0;

    function hideFramePreview() {
        framePreviewGeneration++;
        if (framePreview) framePreview.root.style.display = 'none';
    }

    function resetFramePreview() {
        hideFramePreview();
        frameTileCache.clear();
    }

    function frameSpec(s) {
        const options = s.player?._currentPlayOptions;
        const item = options?.item;
        const manifest = item?.Trickplay;
        if (!item?.Id || !manifest || typeof manifest !== 'object') return null;
        const mediaSourceId = options.mediaSource?.Id || item.Id;
        const infos = manifest[mediaSourceId] || manifest[item.Id]
            || (Object.keys(manifest).length === 1 ? Object.values(manifest)[0] : null);
        if (!infos || typeof infos !== 'object') return null;
        const widths = Object.keys(infos).map(Number).filter(Number.isFinite).sort((a, b) => b - a);
        if (!widths.length) return null;
        const info = infos[widths[0]];
        const w = Number(info?.Width);
        const h = Number(info?.Height);
        const cols = Number(info?.TileWidth);
        const rows = Number(info?.TileHeight);
        const count = Number(info?.ThumbnailCount);
        const interval = Number(info?.Interval);
        if (![w, h, cols, rows, count, interval].every(v => Number.isFinite(v) && v > 0)) return null;
        const index = Math.max(0, Math.min(count - 1, Math.floor(s.target / interval)));
        const perSheet = Math.floor(cols) * Math.floor(rows);
        const sheet = Math.floor(index / perSheet);
        const localIndex = index % perSheet;
        const x = (localIndex % Math.floor(cols)) * w;
        const y = Math.floor(localIndex / Math.floor(cols)) * h;

        // The currently playing URL is generated by Jellyfin and normally
        // contains ApiKey. Never log the URL/token or put it in telemetry.
        let source;
        try { source = new URL(options.url, window.location.href); }
        catch (_) { return null; }
        if (!['http:', 'https:'].includes(source.protocol)) return null;
        const tokenEntry = [...source.searchParams.entries()]
            .find(([key]) => /^(api_?key|access_?token)$/i.test(key));
        if (!tokenEntry || !tokenEntry[1]) return null;
        const sourceRoot = source.pathname.match(/^(.*?)\/Videos\//i);
        const base = sourceRoot ? sourceRoot[1] : window.location.pathname.replace(/\/web\/.*$/i, '');
        const url = new URL(base.replace(/\/$/, '') + '/Videos/' + encodeURIComponent(item.Id)
            + '/Trickplay/' + encodeURIComponent(String(widths[0])) + '/' + sheet + '.jpg', source.origin);
        url.searchParams.set('api_key', tokenEntry[1]);
        if (mediaSourceId) url.searchParams.set('MediaSourceId', mediaSourceId);
        return {url: url.href, x, y, w, h};
    }

    function ensureFramePreview() {
        if (!document.body) return null;
        if (!framePreview) {
            const root = document.createElement('div');
            root.id = 'jfd-fullscreen-seek-preview';
            root.style.cssText = 'position:fixed;inset:0;background:#000;z-index:2147483645;'
                + 'pointer-events:none;display:none;align-items:center;justify-content:center';
            const canvas = document.createElement('canvas');
            canvas.setAttribute('aria-hidden', 'true');
            canvas.style.cssText = 'display:block;max-width:100vw;max-height:100vh';
            root.appendChild(canvas);
            framePreview = {root, canvas};
        }
        if (!framePreview.root.isConnected) document.body.appendChild(framePreview.root);
        return framePreview;
    }

    function cachedFrameTile(url) {
        if (frameTileCache.has(url)) return frameTileCache.get(url);
        const promise = new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = () => resolve(img);
            img.onerror = () => reject(new Error('trickplay tile failed to load'));
            img.src = url;
        });
        frameTileCache.set(url, promise);
        if (frameTileCache.size > FRAME_TILE_CACHE_LIMIT) {
            frameTileCache.delete(frameTileCache.keys().next().value);
        }
        promise.catch(() => { if (frameTileCache.get(url) === promise) frameTileCache.delete(url); });
        return promise;
    }

    function showFramePreview(s) {
        const spec = frameSpec(s);
        if (!spec) { hideFramePreview(); return; }
        const preview = ensureFramePreview();
        if (!preview) return;
        const generation = ++framePreviewGeneration;
        cachedFrameTile(spec.url).then(img => {
            if (framePreviewGeneration !== generation || activePlayer !== s.player) return;
            const ratio = spec.w / spec.h;
            const targetW = Math.min(window.innerWidth, window.innerHeight * ratio);
            const targetH = targetW / ratio;
            const w = Math.max(1, Math.round(targetW));
            const h = Math.max(1, Math.round(targetH));
            const canvas = preview.canvas;
            if (canvas.width !== w) canvas.width = w;
            if (canvas.height !== h) canvas.height = h;
            canvas.style.width = w + 'px';
            canvas.style.height = h + 'px';
            const context = canvas.getContext('2d');
            if (!context) return;
            context.imageSmoothingEnabled = true;
            context.imageSmoothingQuality = 'high';
            context.clearRect(0, 0, w, h);
            context.drawImage(img, spec.x, spec.y, spec.w, spec.h, 0, 0, w, h);
            preview.root.style.display = 'flex';
        }).catch(() => {
            // No generated image or an authorization problem: keep normal video
            // and time OSD functional; do not interrupt seeking/playback.
            if (framePreviewGeneration === generation) hideFramePreview();
        });
    }

    function seek(s) {
        if (activePlayer !== s.player || !s.player.currentSrc()) return;
        // Keep the web player's final-position cache current even if Stop follows
        // immediately, before the next native positionUpdate signal (500ms).
        s.player._currentTime = Math.round(s.target);
        s.native.seekTo(Math.round(s.target));
        s.player.events.trigger(s.player, 'timeupdate');
        showSeek(s);
        showFramePreview(s);
    }

    function resetDrag() {
        hideFramePreview();
        const s = active;
        active = null;
        if (!s) return;
        clearInterval(s.holdTimer);
        try {
            if (s.captureTarget?.hasPointerCapture(s.pointerId)) {
                s.captureTarget.releasePointerCapture(s.pointerId);
            }
        } catch (_) { /* The original DOM target may already be removed. */ }
    }

    function rate(s) { return s.button === 0 ? SMALL_MS_PER_PX : LARGE_MS_PER_PX; }

    function integrateHold(s, now) {
        const elapsed = Math.max(0, now - Math.max(s.lastTick, s.holdAfter));
        s.lastTick = now;
        // Bound a late frame so a busy UI cannot cause a large surprise jump.
        if (Math.abs(s.dx) >= DRAG_THRESHOLD && elapsed > 0) {
            s.target = clamp(s.target + s.dx * rate(s) * Math.min(elapsed, 250) / 1000, s.duration);
        }
    }

    function updateDrag(s, e) {
        const now = performance.now();
        const dx = e.clientX - s.x0;
        if (!s.dragging) {
            if (Math.abs(dx) < DRAG_THRESHOLD) return;
            s.dragging = true;
            s.lastTick = now;
            s.holdAfter = now + HOLD_DELAY_MS;
            try {
                if (e.pointerId != null && e.target?.setPointerCapture) {
                    e.target.setPointerCapture(e.pointerId);
                    s.captureTarget = e.target;
                    s.pointerId = e.pointerId;
                }
            } catch (_) { /* blur/cancel handlers still stop the gesture. */ }
            s.holdTimer = setInterval(() => {
                if (active !== s || activePlayer !== s.player || !s.player.currentSrc()) {
                    resetDrag();
                    return;
                }
                const previous = s.target;
                integrateHold(s, performance.now());
                if (s.target !== previous) {
                    try { seek(s); } catch (err) { log('hold seek failed', {message: String(err)}); resetDrag(); }
                }
            }, SEEK_THROTTLE_MS);
            log('drag started', {button: s.button, startMs: Math.round(s.start)});
        } else {
            integrateHold(s, now);
        }
        // Retain the original distance-based drag, adding the accumulated hold.
        s.target = clamp(s.target + (dx - s.dx) * rate(s), s.duration);
        s.dx = dx;
    }

    function down(e) {
        if (e.pointerType && e.pointerType !== 'mouse') return;
        if (e.sourceCapabilities?.firesTouchEvents) return;
        if (e.button !== 0 && e.button !== 1 && e.button !== 2) return;
        resetDrag();
        clearTimeout(singleClickTimer);
        const ctx = getContext();
        const area = eligibleArea(e);
        if (ctx.error || area) {
            log('down rejected', {button: e.button, reason: ctx.error || area, tag: e.target && e.target.tagName});
            return;
        }
        log('down accepted', {button: e.button, cachedPosition: Math.round(nativePosition), duration: Math.round(nativeDuration), playerId: ctx.player && ctx.player.id || null});
        if (e.button === 1) {
            e.preventDefault();
            e.stopImmediatePropagation();
            resetDrag();
            suppressAuxUntil = performance.now() + 1000;
            stopPlayback();
            return;
        }
        const position = ctx.player.currentTime();
        const duration = Number(ctx.player.duration());
        if (!Number.isFinite(position) || !Number.isFinite(duration) || duration <= 0) return;
        const s = {
            player: ctx.player,
            native: ctx.native,
            button: e.button,
            x0: e.clientX,
            start: position,
            target: position,
            duration: duration,
            dx: 0,
            holdTimer: null,
            lastTick: 0,
            holdAfter: Infinity,
            dragging: false,
            lastSeek: -100000
        };
        active = s;
        // jellyfin-web schedules play/pause on pointerdown (before a drag can
        // be recognized). Own this gesture from the press, not just the click.
        e.preventDefault();
        e.stopImmediatePropagation();
    }

    function move(e) {
        if (e.pointerType && e.pointerType !== 'mouse') return;
        const s = active;
        if (!s || activePlayer !== s.player) { resetDrag(); return; }
        const buttonBit = s.button === 0 ? 1 : 2;
        if (e.buttons !== buttonBit) { resetDrag(); return; }
        updateDrag(s, e);
        if (!s.dragging) return;
        e.preventDefault();
        e.stopImmediatePropagation();
        if (performance.now() - s.lastSeek >= SEEK_THROTTLE_MS) {
            s.lastSeek = performance.now();
            try { seek(s); }
            catch (err) { log('seek failed', {message: String(err)}); }
        }
    }

    function up(e) {
        if (e.pointerType && e.pointerType !== 'mouse') return;
        const s = active;
        if (!s || e.button !== s.button || activePlayer !== s.player) return;
        updateDrag(s, e);
        if (s.dragging) {
            e.preventDefault();
            e.stopImmediatePropagation();
            try { seek(s); }
            catch (err) { log('seek on release failed', {message: String(err)}); }
            log('drag completed', {button: s.button, deltaMs: Math.round(s.target - s.start), toMs: Math.round(s.target)});
            ignoreNextClick = true;
            setTimeout(() => { ignoreNextClick = false; }, 230);
        } else if (s.button === 2) {
            e.preventDefault();
            e.stopImmediatePropagation();
            try {
                if (activePlayer && typeof activePlayer.paused === 'function') {
                    if (activePlayer.paused()) activePlayer.unpause();
                    else activePlayer.pause();
                } else if (nativePaused) s.native.play();
                else s.native.pause();
                log('right-click play/pause toggled');
            } catch (err) { log('pause toggle failed', {message: String(err)}); }
        }
        resetDrag();
    }

    // Pick one event family. Delayed compatibility mouse events must not
    // repeat the gesture, especially a right-click pause toggle.
    const usePointer = 'PointerEvent' in window;
    window.addEventListener('pointerdown', e => { down(e); }, true);
    window.addEventListener('pointermove', e => { move(e); }, true);
    window.addEventListener('pointerup', e => { up(e); }, true);
    window.addEventListener('pointercancel', resetDrag, true);
    window.addEventListener('lostpointercapture', resetDrag, true);
    window.addEventListener('mouseout', e => { if (!e.relatedTarget && !active?.captureTarget) resetDrag(); }, true);
    document.addEventListener('visibilitychange', () => { if (document.hidden) resetDrag(); });
    window.addEventListener('mousedown', e => { if (!usePointer) down(e); }, true);
    window.addEventListener('mousemove', e => { if (!usePointer) move(e); }, true);
    window.addEventListener('mouseup', e => { if (!usePointer) up(e); }, true);
    window.addEventListener('click', e => {
        if (performance.now() < touchMouseUntil && !eligibleArea(e)) { e.preventDefault(); e.stopImmediatePropagation(); return; }
        if (ignoreNextClick) {
            ignoreNextClick = false;
            e.preventDefault();
            e.stopImmediatePropagation();
            return;
        }
        const ctx = getContext();
        if (e.button !== 0 || ctx.error || eligibleArea(e)) return;
        e.preventDefault();
        e.stopImmediatePropagation();
        clearTimeout(singleClickTimer);
        // Keep ordinary single-click pause and double-click fullscreen. Waiting
        // for click means pressing/holding alone can never pause a drag.
        if (e.detail >= 2) return;
        singleClickTimer = setTimeout(() => {
            if (active || activePlayer !== ctx.player || !ctx.player.currentSrc()) return;
            if (ctx.player.paused()) ctx.player.unpause();
            else ctx.player.pause();
        }, 300);
    }, true);
    window.addEventListener('auxclick', e => {
        if (performance.now() < suppressAuxUntil || (!getContext().error && !eligibleArea(e))) { e.preventDefault(); e.stopImmediatePropagation(); }
    }, true);
    window.addEventListener('dragstart', e => {
        if (active) e.preventDefault();
    }, true);
    window.addEventListener('contextmenu', e => {
        if (!getContext().error && !eligibleArea(e)) { e.preventDefault(); e.stopImmediatePropagation(); }
    }, true);
    window.addEventListener('wheel', e => {
        if (e.ctrlKey || e.deltaY === 0 || getContext().error || eligibleArea(e)) return;
        e.preventDefault();
        e.stopImmediatePropagation();
        try {
            const volume = Number(activePlayer.getVolume());
            if (!Number.isFinite(volume)) return;
            const value = Math.max(0, Math.min(100, volume + (e.deltaY < 0 ? 5 : -5)));
            activePlayer.setVolume(value);
            log('volume changed', {volume: value});
        } catch (err) { log('volume change failed', {message: String(err)}); }
    }, {capture: true, passive: false});
    window.addEventListener('blur', () => { resetDrag(); clearTimeout(singleClickTimer); });

    // Touch v0.1: a separate gesture state; the mouse v0.5 math is unchanged.
    const fingers = new Map();
    let touchGesture = null;
    let touchMouseUntil = 0;
    let touchBlocked = false;
    let stopButton = null;

    function cancelTouch() {
        hideFramePreview();
        touchGesture = null;
        fingers.clear();
        touchBlocked = false;
    }
    function stopPlayback() {
        const ctx = getContext();
        if (ctx.error || !ctx.manager?.stop) return;
        cancelTouch();
        resetDrag();
        clearTimeout(singleClickTimer);
        Promise.resolve(ctx.manager.stop(ctx.player)).catch(err => log('stop failed', {error: String(err)}));
    }
    function touchButton(show) {
        if (!show) { if (stopButton) stopButton.style.display = 'none'; return; }
        if (!document.body) return;
        if (!stopButton) {
            stopButton = document.createElement('button');
            stopButton.type = 'button';
            stopButton.textContent = '■ 停止';
            stopButton.setAttribute('aria-label', '再生を停止して視聴位置を保存');
            stopButton.style.cssText = 'position:fixed;right:18px;top:8%;min-width:88px;min-height:48px;z-index:2147483646;border:1px solid #aaa;border-radius:10px;background:#202028dd;color:white;font:600 17px sans-serif;touch-action:manipulation';
            stopButton.addEventListener('click', stopPlayback);
        }
        if (!stopButton.isConnected) document.body.appendChild(stopButton);
        stopButton.style.display = 'block';
    }
    // This applies only to the playback view, never the library pages. Native
    // pan/zoom must be disabled before pointerdown for two-finger delivery.
    const touchStyle = document.createElement('style');
    touchStyle.textContent = '#videoOsdPage,.videoPlayerContainer{touch-action:none}';
    (document.head || document.body)?.appendChild(touchStyle);

    function touchArea(e) {
        return !getContext().error && !eligibleArea({target:e.target, clientY:e.clientY});
    }
    function touchConsume(e) {
        e.preventDefault();
        e.stopImmediatePropagation();
        touchMouseUntil = performance.now() + 800;
    }
    function touchBaseline() {
        const points = [...fingers.values()];
        const count = points.length;
        const player = activePlayer;
        const position = player?.currentTime();
        const duration = Number(player?.duration());
        if (!player || !Number.isFinite(position) || !(duration > 0)) { touchGesture = null; return; }
        const x = points.reduce((n,p) => n+p.x,0)/count;
        const y = points.reduce((n,p) => n+p.y,0)/count;
        touchGesture = {player, native, button:count === 2 ? 2 : 0, start:position,
            target:position, duration, x, y, dx:0, count, touch:true, mode:null,
            tap:count === 1, rightEdge:count === 1 && x >= window.innerWidth * .85,
            volume:Number(player.getVolume())};
    }
    function touchMove(e) {
        const point = fingers.get(e.pointerId);
        if (!point) return;
        point.x = e.clientX; point.y = e.clientY;
        const s = touchGesture;
        if (!s || touchBlocked || activePlayer !== s.player) return;
        const points = [...fingers.values()];
        const dx = points.reduce((n,p)=>n+p.x,0)/points.length-s.x;
        const dy = points.reduce((n,p)=>n+p.y,0)/points.length-s.y;
        if (!s.mode && Math.max(Math.abs(dx),Math.abs(dy)) < DRAG_THRESHOLD) return;
        s.tap = false;
        if (!s.mode) s.mode = s.rightEdge && Math.abs(dy)>Math.abs(dx) ? 'volume' : Math.abs(dx)>=Math.abs(dy) ? 'seek' : 'ignore';
        if (s.mode === 'volume') {
            const value = Math.max(0,Math.min(100,Math.round(s.volume-dy*100/(window.innerHeight*.6))));
            s.player.setVolume(value);
            log('touch volume', {volume:value});
        } else if (s.mode === 'seek') {
            s.dx = dx;
            s.target = clamp(s.start + dx*(s.count===2 ? LARGE_MS_PER_PX : SMALL_MS_PER_PX),s.duration);
            const now = performance.now();
            if (!s.lastSeek || now-s.lastSeek>=SEEK_THROTTLE_MS) { s.lastSeek=now; seek(s); }
        }
    }
    window.addEventListener('pointerdown', e => {
        if (e.pointerType !== 'touch') return;
        if (!touchArea(e)) {
            if (fingers.size) { touchBlocked=true; touchGesture=null; }
            return;
        }
        touchConsume(e);
        resetDrag(); clearTimeout(singleClickTimer);
        touchButton(true);
        fingers.set(e.pointerId,{x:e.clientX,y:e.clientY});
        if (fingers.size>2) { touchBlocked=true; touchGesture=null; return; }
        if (!touchBlocked) touchBaseline();
        try { e.target.setPointerCapture(e.pointerId); } catch (_) {}
    }, {capture:true,passive:false});
    window.addEventListener('pointermove', e => {
        if (e.pointerType!=='touch' || !fingers.has(e.pointerId)) return;
        touchConsume(e); touchMove(e);
    }, {capture:true,passive:false});
    window.addEventListener('pointerup', e => {
        if (e.pointerType!=='touch' || !fingers.has(e.pointerId)) return;
        touchConsume(e); touchMove(e);
        const s=touchGesture;
        if (s && !touchBlocked && activePlayer===s.player) {
            if (s.mode==='seek') seek(s);
            else if (s.tap && s.count===1) {
                if (s.player.paused()) s.player.unpause(); else s.player.pause();
            }
        }
        fingers.delete(e.pointerId);
        // Never turn a two-finger gesture into a tap/one-finger seek on lift.
        touchGesture=null;
        if (fingers.size) touchBlocked=true; else cancelTouch();
    }, {capture:true,passive:false});
    window.addEventListener('pointercancel', cancelTouch, true);
    window.addEventListener('lostpointercapture', e => { if (fingers.has(e.pointerId)) cancelTouch(); }, true);
    window.addEventListener('blur', cancelTouch);
    document.addEventListener('visibilitychange', () => { if (document.hidden) cancelTouch(); });

    if (window.apiPromise && typeof window.apiPromise.then === 'function') {
        window.apiPromise.then(bindNativePlayer).catch(err => log('Qt API promise failed', {error: String(err)}));
    } else {
        const apiTimer = setInterval(() => {
            if (window.api && window.api.player) {
                bindNativePlayer(window.api);
                clearInterval(apiTimer);
            }
        }, 180);
        setTimeout(() => clearInterval(apiTimer), 60000);
    }
    log('script initialized');
})();
// END CHATGPT_JFD_MOUSECONTROLS_V05
