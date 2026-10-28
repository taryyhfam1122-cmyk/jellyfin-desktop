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
// ChatGPT Jellyfin Desktop Mouse-Only controls - diagnostic prototype v0.2
// REPLACES the entire old v0.1 block at the end of native/nativeshell.js.
// BEGIN CHATGPT_JFD_MOUSECONTROLS_V02
(function () {
    'use strict';
    if (window.__chatgptDesktopMouseV02) return;
    window.__chatgptDesktopMouseV02 = true;

    const SMALL_MS_PER_PX = 150;  // 15 seconds per 100px
    const LARGE_MS_PER_PX = 900;  // 90 seconds per 100px
    const DRAG_THRESHOLD_PX = 10;
    const UPDATE_INTERVAL_MS = 85;
    const DEBUG_LIMIT = 35;
    let diagnosticCount = 0;
    let activeDrag = null;
    let suppressClick = false;
    let statusBox = null;
    let statusTimer = null;
    let lastPointerDown = -1e9;
    let lastPointerMove = -1e9;
    let lastPointerUp = -1e9;

    function diagnostic(message, details) {
        if (diagnosticCount++ >= DEBUG_LIMIT) return;
        console.info('[JFD Mouse v0.2] ' + message + (details ? ' ' + JSON.stringify(details) : ''));
    }

    function getPlayerContext() {
        const manager = window.playbackManager;
        const player = manager && manager._currentPlayer;
        if (!player || player.id !== 'mpvvideoplayer') return {reject: 'mpv-player-not-selected'};
        if (typeof player.currentTime !== 'function') return {reject: 'currentTime-unavailable'};

        const durationCandidates = [
            typeof player.duration === 'function' ? Number(player.duration()) : NaN,
            typeof manager.duration === 'function' ? Number(manager.duration(player)) : NaN
        ];
        const duration = durationCandidates.find(x => Number.isFinite(x) && x > 0);
        if (!duration) return {reject: 'duration-not-ready'};

        const now = Number(player.currentTime());
        return {
            manager: manager,
            player: player,
            duration: duration,
            position: Number.isFinite(now) && now >= 0 ? now : 0
        };
    }

    function allowedArea(e) {
        const node = e.target && e.target.nodeType === 1 ? e.target : null;
        if (!node) return 'missing-dom-target';
        if (node.closest('button, a, input, textarea, select, [role="button"], [role="slider"], .sliderContainer, .mdl-slider')) {
            return 'interactive-control';
        }
        const height = Math.max(1, window.innerHeight || 1);
        // Exclude the top navigation and bottom seek bar, but do NOT exclude
        // whole video OSD containers (they can cover the entire viewport).
        if (e.clientY < height * 0.07 || e.clientY > height * 0.87) return 'osd-edge-area';
        return null;
    }

    function asClock(milliseconds) {
        const seconds = Math.max(0, Math.floor(milliseconds / 1000));
        const h = Math.floor(seconds / 3600);
        const m = Math.floor((seconds % 3600) / 60);
        const s = String(seconds % 60).padStart(2, '0');
        return h ? `${h}:${String(m).padStart(2, '0')}:${s}` : `${m}:${s}`;
    }

    function showSeek(target, duration, change) {
        if (!document.body) return;
        if (!statusBox) {
            statusBox = document.createElement('div');
            statusBox.style.cssText = 'position:fixed;z-index:2147483647;pointer-events:none;top:12%;left:50%;transform:translateX(-50%);background:rgba(0,0,0,.72);color:white;border-radius:8px;padding:8px 14px;font:600 15px sans-serif;white-space:pre';
        }
        if (!statusBox.isConnected) document.body.appendChild(statusBox);
        statusBox.textContent = `${change >= 0 ? '+' : '-'}${asClock(Math.abs(change))}   ${asClock(target)} / ${asClock(duration)}`;
        statusBox.style.display = 'block';
        clearTimeout(statusTimer);
        statusTimer = setTimeout(() => { if (statusBox) statusBox.style.display = 'none'; }, 900);
    }

    function resetDrag() { activeDrag = null; }

    function pointerDown(e) {
        if (e.pointerType && e.pointerType !== 'mouse') return;
        if (e.button !== 0 && e.button !== 1 && e.button !== 2) return;
        const ctx = getPlayerContext();
        const reason = allowedArea(e);
        if (ctx.reject || reason) {
            diagnostic('down rejected', {
                button: e.button,
                reason: ctx.reject || reason,
                target: e.target && e.target.tagName,
                videoContainer: Boolean(document.querySelector('.videoPlayerContainer'))
            });
            return;
        }
        diagnostic('down accepted', {button: e.button, durationMs: Math.round(ctx.duration)});
        if (e.button === 1) {
            e.preventDefault();
            e.stopImmediatePropagation();
            resetDrag();
            try {
                if (typeof ctx.manager.stop === 'function') ctx.manager.stop();
                else diagnostic('stop not available');
            } catch (error) {
                console.error('[JFD Mouse v0.2] Stop error', error);
            }
            return;
        }
        activeDrag = {
            button: e.button,
            x0: e.clientX,
            startMs: ctx.position,
            targetMs: ctx.position,
            durationMs: ctx.duration,
            player: ctx.player,
            lastUpdate: -1e9,
            dragging: false
        };
        if (e.button === 2) e.preventDefault();
    }

    function pointerMove(e) {
        if (e.pointerType && e.pointerType !== 'mouse') return;
        const state = activeDrag;
        if (!state) return;
        const bit = state.button === 0 ? 1 : 2;
        if ((e.buttons & bit) === 0) { resetDrag(); return; }
        const dx = e.clientX - state.x0;
        if (!state.dragging && Math.abs(dx) < DRAG_THRESHOLD_PX) return;
        if (!state.dragging) {
            state.dragging = true;
            diagnostic('drag started', {button: state.button, dx: dx});
        }
        e.preventDefault();
        e.stopImmediatePropagation();
        const rate = state.button === 0 ? SMALL_MS_PER_PX : LARGE_MS_PER_PX;
        state.targetMs = Math.max(0, Math.min(state.durationMs - 500, state.startMs + dx * rate));
        const now = performance.now();
        if (now - state.lastUpdate >= UPDATE_INTERVAL_MS) {
            state.lastUpdate = now;
            state.player.currentTime(state.targetMs);
            showSeek(state.targetMs, state.durationMs, state.targetMs - state.startMs);
        }
    }

    function pointerUp(e) {
        if (e.pointerType && e.pointerType !== 'mouse') return;
        const state = activeDrag;
        if (!state || e.button !== state.button) return;
        if (state.dragging) {
            e.preventDefault();
            e.stopImmediatePropagation();
            state.player.currentTime(state.targetMs);
            showSeek(state.targetMs, state.durationMs, state.targetMs - state.startMs);
            suppressClick = true;
            setTimeout(() => { suppressClick = false; }, 240);
            diagnostic('drag completed', {button: state.button, deltaMs: Math.round(state.targetMs - state.startMs)});
        } else if (state.button === 2) {
            e.preventDefault();
            e.stopImmediatePropagation();
            try {
                if (state.player.paused()) state.player.unpause();
                else state.player.pause();
                diagnostic('right-click pause toggled');
            } catch (error) { console.error('[JFD Mouse v0.2] Pause error', error); }
        }
        resetDrag();
    }

    // QtWebEngine delivers pointer events to most pages; keep mouse fallback.
    window.addEventListener('pointerdown', e => {
        lastPointerDown = performance.now();
        pointerDown(e);
    }, true);
    window.addEventListener('pointermove', e => {
        lastPointerMove = performance.now();
        pointerMove(e);
    }, true);
    window.addEventListener('pointerup', e => {
        lastPointerUp = performance.now();
        pointerUp(e);
    }, true);
    window.addEventListener('pointercancel', resetDrag, true);

    window.addEventListener('mousedown', e => {
        if (performance.now() - lastPointerDown < 40) return;
        pointerDown(e);
    }, true);
    window.addEventListener('mousemove', e => {
        if (performance.now() - lastPointerMove < 40) return;
        pointerMove(e);
    }, true);
    window.addEventListener('mouseup', e => {
        if (performance.now() - lastPointerUp < 40) return;
        pointerUp(e);
    }, true);

    window.addEventListener('click', e => {
        if (suppressClick) {
            suppressClick = false;
            e.preventDefault();
            e.stopImmediatePropagation();
        }
    }, true);
    window.addEventListener('contextmenu', e => {
        if (getPlayerContext().player && !allowedArea(e)) {
            e.preventDefault();
            e.stopImmediatePropagation();
        }
    }, true);
    window.addEventListener('wheel', e => {
        const ctx = getPlayerContext();
        if (!ctx.player || allowedArea(e) || e.ctrlKey || e.deltaY === 0) return;
        const volume = Number(ctx.player.getVolume());
        if (!Number.isFinite(volume)) return;
        e.preventDefault();
        e.stopImmediatePropagation();
        ctx.player.setVolume(Math.max(0, Math.min(100, volume + (e.deltaY < 0 ? 5 : -5))));
        diagnostic('wheel volume changed');
    }, {capture: true, passive: false});
    window.addEventListener('blur', resetDrag);
    diagnostic('script initialized');
})();
// END CHATGPT_JFD_MOUSECONTROLS_V02

