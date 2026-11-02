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

    // Keep the pointer visible on library/details screens. Only the video
    // player's idle state may hide it; movement makes it visible again.
    const viewingVideo = () => {
        if (/\/(?:video|player)(?:[/?]|$)/i.test(window.location.hash)) return true;
        return [...document.querySelectorAll('.videoPlayerContainer')].some(el =>
            !el.classList.contains('hide') && el.getClientRects().length > 0 &&
            getComputedStyle(el).visibility !== 'hidden');
    };
    const revealCursor = () => {
        try { window.api.window.setCursorVisibility(true); } catch (_) {}
    };
    const observer = new MutationObserver((mutations) => {
        if (mutations.some(mutation => mutation.attributeName === 'class')) {
            const isIdle = document.body.classList.contains('mouseIdle');
            window.api.window.setCursorVisibility(!isIdle || !viewingVideo());
        }
    });
    observer.observe(document.body, { attributes: true, attributeFilter: ['class'] });
    let lastCursorReveal = 0;
    window.addEventListener('pointermove', event => {
        if (event.pointerType && event.pointerType !== 'mouse') return;
        if (Date.now() - lastCursorReveal < 125) return;
        lastCursorReveal = Date.now();
        revealCursor();
    }, true);
    window.addEventListener('mousemove', event => {
        if ('PointerEvent' in window) return;
        if (Date.now() - lastCursorReveal < 125) return;
        lastCursorReveal = Date.now();
        revealCursor();
    }, true);
    window.addEventListener('hashchange', () => {
        if (!viewingVideo()) {
            document.body.classList.remove('mouseIdle');
            revealCursor();
        }
    });
    revealCursor();

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
// BEGIN CHATGPT_JFD_FULLSCREEN_HOME_CLOSE_V01
// Only expose a native app-exit button on fullscreen library/home screens.
// The player retains its existing fullscreen UI and mouse gestures.
(function () {
    'use strict';
    if (window.__jfdFullscreenHomeCloseV01) return;
    window.__jfdFullscreenHomeCloseV01 = true;

    const BUTTON_ID = 'jfd-fullscreen-home-close';
    const TAB_ID = 'jfd-home-fullscreen-tab';

    // The Qt window owns fullscreen. Use the same host action as F11, rather
    // than the HTML fullscreen API which only affects the browser content.
    function ensureFullscreenTab() {
        let tab = document.getElementById(TAB_ID);
        if (tab) return tab;
        tab = document.createElement('button');
        tab.id = TAB_ID;
        tab.type = 'button';
        tab.setAttribute('aria-label', '全画面・通常表示を切り替える');
        tab.title = '全画面と通常表示を切り替える';
        tab.style.cssText = 'position:fixed;top:23px;left:calc(50% + 236px);right:auto;min-width:122px;height:42px;'
            + 'z-index:4100;display:none;padding:0 11px;'
            + 'border:0;border-radius:5px;background:transparent;'
            + 'color:#e8e8e8;font:600 14px/1 system-ui,sans-serif;cursor:pointer;'
            + 'user-select:none;touch-action:manipulation;';
        tab.addEventListener('click', function (event) {
            event.preventDefault();
            event.stopPropagation();
            if (window.api?.input?.executeActions)
                window.api.input.executeActions(['host:fullscreen']);
            // The actual window-state update arrives via settingsUpdate.
            scheduleRefresh();
        });
        document.body.appendChild(tab);
        return tab;
    }
    let videoActive = false;
    let refreshQueued = false;

    function ensureButton() {
        let button = document.getElementById(BUTTON_ID);
        if (button) return button;
        button = document.createElement('button');
        button.id = BUTTON_ID;
        button.type = 'button';
        button.textContent = '\u00d7';
        button.title = 'Jellyfin Desktopを終了';
        button.setAttribute('aria-label', 'Jellyfin Desktopを終了');
        button.style.cssText = 'position:fixed;top:96px;right:12px;width:44px;height:44px;'
            + 'z-index:2147483646;display:none;align-items:center;justify-content:center;'
            + 'border:1px solid #666;border-radius:8px;background:rgba(24,24,28,.87);'
            + 'color:#fff;font:normal 30px/1 Arial,sans-serif;cursor:pointer;'
            + 'user-select:none;touch-action:manipulation;';
        button.addEventListener('click', function (event) {
            event.preventDefault();
            event.stopPropagation();
            // Same exit method as Jellyfin's existing native exit menu.
            if (window.api && window.api.system && typeof window.api.system.exit === 'function')
                window.api.system.exit();
        });
        document.body.appendChild(button);
        return button;
    }

    function refresh() {
        if (!document.body) return;
        const fullscreen = !!window.jmpInfo?.settings?.main?.fullscreen;
        // Do not show on top of video controls or while a video is loading.
        const show = fullscreen && !videoActive &&
            !document.querySelector('.videoPlayerContainer');
        const hasVideo = videoActive || !!document.querySelector('.videoPlayerContainer');
        const tab = !hasVideo ? ensureFullscreenTab() : document.getElementById(TAB_ID);
        if (tab) {
            tab.style.display = !hasVideo ? 'block' : 'none';
            tab.textContent = fullscreen ? '▣ 通常表示' : '⛶ 全画面';
            tab.setAttribute('aria-pressed', fullscreen ? 'true' : 'false');
        }
        const button = show ? ensureButton() : document.getElementById(BUTTON_ID);
        if (button) button.style.display = show ? 'flex' : 'none';
    }

    function scheduleRefresh() {
        if (refreshQueued) return;
        refreshQueued = true;
        setTimeout(function () {
            refreshQueued = false;
            refresh();
        }, 0);
    }

    window.jfdFullscreenHomeClose = {
        setVideoActive(active) {
            videoActive = !!active;
            scheduleRefresh();
        },
        refresh: scheduleRefresh
    };

    window.jmpInfo.settingsUpdate.push(function (section) {
        if (section === 'main') scheduleRefresh();
    });
    window.addEventListener('popstate', scheduleRefresh);
    window.addEventListener('hashchange', scheduleRefresh);

    function isVideoElementChange(records) {
        for (const record of records) {
            for (const nodes of [record.addedNodes, record.removedNodes]) {
                for (const node of nodes) {
                    if (node.nodeType !== 1) continue;
                    if (node.matches?.('.videoPlayerContainer') ||
                        node.querySelector?.('.videoPlayerContainer')) return true;
                }
            }
        }
        return false;
    }

    function startWatching() {
        scheduleRefresh();
        // Jellyfin navigates within a single document; the player dialog may
        // disappear after the playback-stop callback, so observe its removal.
        const observer = new MutationObserver(function (records) {
            if (isVideoElementChange(records)) scheduleRefresh();
        });
        observer.observe(document.body, {childList: true, subtree: true});
    }

    if (document.readyState === 'loading')
        document.addEventListener('DOMContentLoaded', startWatching, {once: true});
    else if (document.body)
        startWatching();
})();
// END CHATGPT_JFD_FULLSCREEN_HOME_CLOSE_V01

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
        preloadFrame(player) { preloadFrame(player); },
        setPlayer(player) {
            activePlayer = player;
            window.jfdFullscreenHomeClose?.setVideoActive(true);
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
            window.jfdFullscreenHomeClose?.setVideoActive(false);
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
                window.jfdFullscreenHomeClose?.setVideoActive(false);
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
    // Read-only playback state for the SearchHub overlay controller. Never
    // expose the media URL or Jellyfin authentication information.
    window.__jfdDesktopPlayerActive = () => !getContext().error;

    function eligibleArea(e) {
        if (e.pointerType && e.pointerType !== 'mouse') return 'not-mouse';
        const node = e.target && e.target.nodeType === 1 ? e.target : null;
        if (!node) return 'no-target';
        // Even when a native player remains mounted behind it, SearchHub
        // owns all scrolling and navigation input within its overlay.
        if (node.closest('#jfsh-v1')) return 'searchhub-overlay';
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
    const MINI_PREVIEW_WIDTH = 320;

    function hideFramePreview() {
        framePreviewGeneration++;
        if (framePreview) framePreview.root.style.display = 'none';
    }

    function resetFramePreview() {
        hideFramePreview();
        frameTileCache.clear();
        if (framePreview) framePreview.lastFrameKey = null;
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
        return {url: url.href, x, y, w, h, index, sheet, perSheet, count};
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
            framePreview = {root, canvas, lastFrameKey: null};
        }
        if (!framePreview.root.isConnected) document.body.appendChild(framePreview.root);
        return framePreview;
    }

    function cachedFrameTile(url) {
        if (frameTileCache.has(url)) {
            const cached = frameTileCache.get(url);
            // Refresh the tile's LRU position.
            frameTileCache.delete(url);
            frameTileCache.set(url, cached);
            return cached;
        }
        const promise = new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = () => {
                // Resolve after Chromium has decoded the JPEG, rather than
                // making the first on-screen draw decode a 960px*4x4 sheet.
                if (typeof img.decode === 'function') {
                    Promise.resolve(img.decode()).then(() => resolve(img), () => resolve(img));
                } else {
                    resolve(img);
                }
            };
            img.onerror = () => reject(new Error('trickplay tile failed to load'));
            img.src = url;
        });
        frameTileCache.set(url, promise);
        if (frameTileCache.size > FRAME_TILE_CACHE_LIMIT) {
            frameTileCache.delete(frameTileCache.keys().next().value);
        }
        promise.catch(() => {
            if (frameTileCache.get(url) === promise) frameTileCache.delete(url);
        });
        return promise;
    }

    function preloadFrame(player) {
        if (!player?._currentPlayOptions) return;
        const position = Number(player.currentTime()) || Number(player._currentPlayOptions.playerStartPositionTicks || 0) / 10000;
        const spec = frameSpec({player, target: position});
        if (spec) cachedFrameTile(spec.url).catch(() => {});
    }

    function showFramePreview(s) {
        const spec = frameSpec(s);
        if (!spec) { hideFramePreview(); return; }
        const preview = ensureFramePreview();
        if (!preview) return;
        const key = spec.url + ':' + spec.index;
        if (preview.root.style.display === 'flex' && preview.lastFrameKey === key) return;
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
            preview.lastFrameKey = key;
            preview.root.style.display = 'flex';
        }).catch(() => {
            // No generated image or an authorization problem: keep normal video
            // and time OSD functional; do not interrupt seeking/playback.
            if (framePreviewGeneration === generation) hideFramePreview();
        });
    }

    // Separate preview from decoding. A native MPV seek every 80ms competes
    // with high-res JPEG loading and can make the preview unresponsive.
    // During dragging, preview images and the timestamp update immediately.
    // Commit the native seek exactly once at release, so existing play/pause,
    // position reporting and subsequent playback still use real libmpv.
    function seek(s, commit = false) {
        if (activePlayer !== s.player || !s.player.currentSrc()) return;
        const hasTrickplay = Boolean(frameSpec(s));
        if (!commit && hasTrickplay) {
            showSeek(s);
            showFramePreview(s);
            return;
        }
        // Keep Jellyfin's final-position cache current before stop/close.
        s.player._currentTime = Math.round(s.target);
        s.native.seekTo(Math.round(s.target));
        s.player.events.trigger(s.player, 'timeupdate');
        showSeek(s);
        if (!commit) showFramePreview(s);
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
            y0: e.clientY,
            verticalMode: null,
            startRate: Number(ctx.player.getPlaybackRate?.() || 1),
            startVolume: Number(ctx.player.getVolume?.() || 50),
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

    function updateMouseVertical(s,e) {
        const dy=e.clientY-s.y0;
        if(s.verticalMode==='speed'){
            const base=Math.round(s.startRate*100);
            const speed=Math.max(50,Math.min(400,base+Math.round(-dy/50)*5))/100;
            if(speed!==Number(s.player.getPlaybackRate()))s.player.setPlaybackRate(speed);
            showTouchValue('再生速度 '+speed.toFixed(2)+'×');
        }else if(s.verticalMode==='volume'){
            const volume=Math.max(0,Math.min(100,
                Math.round(s.startVolume-dy*100/(window.innerHeight*.6))));
            s.player.setVolume(volume);
            showTouchValue('音量 '+volume+'%');
        }
    }
    function move(e) {
        if (e.pointerType && e.pointerType !== 'mouse') return;
        const s = active;
        if (!s || activePlayer !== s.player) { resetDrag(); return; }
        const buttonBit = s.button === 0 ? 1 : 2;
        if (e.buttons !== buttonBit) { resetDrag(); return; }
        const dx=e.clientX-s.x0,dy=e.clientY-s.y0;
        if(s.button===0 && !s.dragging && !s.verticalMode &&
            Math.abs(dy)>=DRAG_THRESHOLD && Math.abs(dy)>Math.abs(dx)){
            if(s.x0<=window.innerWidth*.15)s.verticalMode='speed';
            else if(s.x0>=window.innerWidth*.85)s.verticalMode='volume';
        }
        if(s.verticalMode) {
            e.preventDefault();e.stopImmediatePropagation();
            updateMouseVertical(s,e);
            return;
        }
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
        if(s.verticalMode){
            e.preventDefault();e.stopImmediatePropagation();
            updateMouseVertical(s,e);
            resetDrag();hideTouchValue();
            ignoreNextClick=true;
            setTimeout(()=>{ignoreNextClick=false;},230);
            return;
        }
        updateDrag(s, e);
        if (s.dragging) {
            e.preventDefault();
            e.stopImmediatePropagation();
            try { seek(s, true); }
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
    // Desktop mouse parity: double click in the upper 25% toggles native
    // fullscreen; double click elsewhere in the video stops playback and
    // navigates home through Jellyfin's playback manager.
    window.addEventListener('dblclick', e => {
        if (e.button !== 0 || e.sourceCapabilities?.firesTouchEvents) return;
        const ctx=getContext();
        if(ctx.error) return;
        const node=e.target?.nodeType===1?e.target:null;
        if(!node || node.closest('button,a,input,textarea,select,[role="button"],[role="slider"],.sliderContainer,.mdl-slider,.videoOsdBottom'))return;
        clearTimeout(singleClickTimer);
        e.preventDefault();e.stopImmediatePropagation();
        if(e.clientY<window.innerHeight*.25) {
            if(window.api?.input?.executeActions)
                window.api.input.executeActions(['host:fullscreen']);
            else ctx.player.toggleFullscreen?.();
        } else {
            // A movie started from SearchHub returns to its exact works list.
            // Other movies preserve the desktop's original Stop -> Home behavior.
            const fromSearchHub = window.__jfdDesktopSearchHub?.hasPendingReturn?.() === true;
            void stopPlayback().then(() => {
                if (fromSearchHub) {
                    // Allow Jellyfin to finish reporting playback before
                    // restoring the overlay and its previous list position.
                    setTimeout(() => {
                        if (window.__jfdDesktopSearchHub?.returnToResults?.() !== true)
                            window.location.hash='#/home';
                    }, 350);
                } else {
                    window.location.hash='#/home';
                }
            });
        }
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
            // Jellyfin playback progress expects an integer VolumeLevel. A fractional
            // volume can make the server reject progress reports (HTTP 400),
            // preventing watched history from being recorded.
            const value = Math.round(Math.max(0, Math.min(100, volume + (e.deltaY < 0 ? 5 : -5))));
            activePlayer.setVolume(value);
            log('volume changed', {volume: value});
        } catch (err) { log('volume change failed', {message: String(err)}); }
    }, {capture: true, passive: false});
    window.addEventListener('blur', () => { resetDrag(); clearTimeout(singleClickTimer); });

    // Jellyfin Web 10.11 sets the seekbar bubble's thumb to the source
    // trickplay width (e.g. 960px). Scale its *layout and background*
    // together; cropping the element to 320px would show the wrong sprite.
    // Chromium's zoom scales the original background-position offsets too.
    function miniatureScale(width, viewportWidth) {
        if (!(width > 0)) return 1;
        return Math.min(1, MINI_PREVIEW_WIDTH / width, Math.max(1, viewportWidth - 32) / width);
    }

    function resizeSeekbarPreview() {
        document.querySelectorAll('.chapterThumbContainer .chapterThumbWrapper').forEach(wrapper => {
            const original = Number.parseFloat(wrapper.style.width);
            const scale = miniatureScale(original, window.innerWidth);
            if (Number(wrapper.style.zoom || 1) !== scale) wrapper.style.zoom = String(scale);
        });
    }

    function watchSeekbarPreviews() {
        if (!document.body || typeof MutationObserver === 'undefined') return;
        const observer = new MutationObserver(records => {
            const added = records.some(record => Array.from(record.addedNodes).some(node =>
                node.nodeType === 1 && (
                    node.matches?.('.chapterThumbContainer,.chapterThumbWrapper') ||
                    node.querySelector?.('.chapterThumbContainer .chapterThumbWrapper')
                )));
            if (added) resizeSeekbarPreview();
        });
        observer.observe(document.body, {childList: true, subtree: true});
        resizeSeekbarPreview();
    }
    if (document.body) watchSeekbarPreviews();
    else document.addEventListener('DOMContentLoaded', watchSeekbarPreviews, {once: true});


    // Surface v0.9 gesture parity for touchscreen Windows x64 (Qt + MPV).
    // Keep all existing mouse drag, wheel and middle-click behavior above.
    const fingers = new Map();
    let touchGesture = null;
    let touchMouseUntil = 0;
    let touchBlocked = false;
    let stopButton = null;
    let pendingTouchTap = null;
    const TAP_WINDOW=400;
    const TOUCH_SPEED_PIXELS=50;
    function touchClockNow() { return performance.now(); }
    function cancelPendingTap() {
        if(pendingTouchTap) clearTimeout(pendingTouchTap.timer);
        pendingTouchTap=null;
    }
    function cancelTouch(clearTap=true) {
        const g=touchGesture;
        if(g?.holdTimer != null) clearInterval(g.holdTimer);
        touchGesture=null;
        fingers.clear();
        touchBlocked=false;
        hideFramePreview();
        if(clearTap) cancelPendingTap();
    }
    // Jellyfin's playbackManager remains the primary reporter. When its stop
    // was processed but the resumable position is still absent, use the official
    // per-user-item partial-update API. This does not create duplicate playback
    // sessions or change favorites, ratings, PlayCount, or Played state.
    const historyAudits = new Set();
    const recentResumeCheck = {status:'not-checked',at:0};
    async function verifySearchPlaybackStop(itemId, positionMs, durationMs, options) {
        if (!/^[0-9a-f-]{16,64}$/i.test(itemId || '')) return;
        // Match Jellyfin's ordinary resume rules: substantial partial playback
        // of a video at least five minutes long, not at its beginning or end.
        if (!Number.isFinite(positionMs) || !Number.isFinite(durationMs) ||
            durationMs < 300000 || positionMs < 120000 ||
            positionMs < durationMs * .05 || positionMs >= durationMs * .90)
            return;
        const api=window.ApiClient;
        if (!api || typeof api.getCurrentUserId!=='function' ||
            typeof api.getUrl!=='function' || typeof api.fetch!=='function') return;
        const userId=api.getCurrentUserId();
        if (!userId || historyAudits.has(itemId)) return;
        historyAudits.add(itemId);
        const desiredTicks=Math.round(positionMs*10000);
        const setStatus=status=>{
            recentResumeCheck.status=status;recentResumeCheck.at=Date.now();
            log('SearchHub Continue Watching: '+status);
        };
        const itemUrl=api.getUrl('Users/'+encodeURIComponent(userId)+'/Items/'+encodeURIComponent(itemId));
        const readItem=async()=>{
            const result=await api.fetch({url:itemUrl,type:'GET',dataType:'json'});
            return typeof result==='string' ? JSON.parse(result) : result;
        };
        const readPosition=item=>Number(item?.UserData?.PlaybackPositionTicks || 0);
        const savedOrCompleted=item=>{
            if (item?.UserData?.Played===true) return true;
            const ticks=readPosition(item);
            return Number.isFinite(ticks) && ticks>0 &&
                Math.abs(ticks-desiredTicks)<150000000;
        };
        try {
            // The normal Jellyfin stop may finish its server-side update after
            // its own Promise resolves. Check before attempting any fallback.
            await new Promise(resolve=>setTimeout(resolve,650));
            let item=await readItem();
            if (!item || String(item.Id || '').toLowerCase() !== itemId.toLowerCase()) {
                setStatus('item-mismatch');return;
            }
            if (savedOrCompleted(item)) {setStatus('saved-by-jellyfin');return;}
            const previousTicks=readPosition(item);
            if (Number.isFinite(previousTicks) && previousTicks > desiredTicks+150000000) {
                setStatus('newer-server-progress-preserved');return;
            }
            // Older Jellyfin 10.11 servers may accept a playback stop but fail
            // to persist resume position. Update only that single user-data
            // field as documented; do not mark played or overwrite other fields.
            await api.fetch({
                url:api.getUrl('UserItems/'+encodeURIComponent(itemId)+'/UserData'),
                type:'POST',contentType:'application/json',
                data:JSON.stringify({PlaybackPositionTicks:desiredTicks})
            });
            item=await readItem();
            if (savedOrCompleted(item)) setStatus('saved-by-userdata-fallback');
            else setStatus('server-did-not-save-position');
        } catch (error) {
            setStatus('save-error');
            log('SearchHub Continue Watching check failed',
                {error:String(error).slice(0,160)});
        } finally {
            historyAudits.delete(itemId);
        }
    }
    window.__jfdDesktopResumeCheck = recentResumeCheck;
    function stopPlayback() {
        const ctx = getContext();
        if(ctx.error || !ctx.manager?.stop) return Promise.resolve(false);
        cancelTouch(); resetDrag(); clearTimeout(singleClickTimer);
        // Capture a real current position before the player clears it.
        // SearchHub is the only playback path eligible for the fallback.
        const expectedItemId=window.__jfdDesktopSearchHub?.pendingPlaybackItemId?.();
        const playingItemId=ctx.player._currentPlayOptions?.item?.Id;
        // The user may have navigated to another player item after opening
        // SearchHub. Never update metadata for the wrong item.
        const itemId=typeof playingItemId==='string' && typeof expectedItemId==='string' &&
            playingItemId.toLowerCase()===expectedItemId.toLowerCase()
            ? expectedItemId : null;
        const positionMs=Number(ctx.player.currentTime?.());
        const durationMs=Number(ctx.player.duration?.());
        const options=ctx.player._currentPlayOptions;
        // Wait for Jellyfin's normal stop/reporting lifecycle before changing
        // routes; navigating away early can lose the recent-playback entry.
        return Promise.resolve(ctx.manager.stop(ctx.player))
            .then(()=>{
                if (itemId) void verifySearchPlaybackStop(itemId,positionMs,durationMs,options);
                return true;
            })
            .catch(err=>{log('stop failed',{error:String(err)});return false;});
    }
    function touchButton(show) {
        if(!show){ if(stopButton) stopButton.style.display='none'; return; }
        if(!document.body) return;
        if(!stopButton){
            stopButton=document.createElement('button');
            stopButton.type='button';stopButton.textContent='■ 停止';
            stopButton.setAttribute('aria-label','再生を停止して視聴位置を保存');
            stopButton.style.cssText='position:fixed;right:18px;top:8%;min-width:88px;min-height:48px;z-index:2147483646;border:1px solid #aaa;border-radius:10px;background:#202028dd;color:white;font:600 17px sans-serif;touch-action:manipulation';
            stopButton.addEventListener('click',stopPlayback);
        }
        if(!stopButton.isConnected) document.body.appendChild(stopButton);
        stopButton.style.display='block';
    }
    const touchStyle=document.createElement('style');
    touchStyle.textContent='#videoOsdPage,.videoPlayerContainer{touch-action:none}';
    (document.head||document.body)?.appendChild(touchStyle);
    function touchArea(e) {
        if (e.target?.closest?.('#jfsh-v1')) return false;
        return !getContext().error && !eligibleArea({target:e.target,clientY:e.clientY});
    }
    function touchConsume(e) {
        e.preventDefault();e.stopImmediatePropagation();
        touchMouseUntil=performance.now()+800;
    }
    function touchDelta(dx) {
        const d=Math.abs(dx), stops=[[0,0],[50,15000],[100,60000],[150,105000],[250,300000]];
        let ms=300000+(d-250)*1950;
        for(let i=1;i<stops.length;i++)if(d<=stops[i][0]){
            const [x0,y0]=stops[i-1],[x1,y1]=stops[i];
            ms=y0+(d-x0)*(y1-y0)/(x1-x0);
            break;
        }
        return Math.sign(dx)*Math.min(900000,ms);
    }
    function updateTouchRate(s,dy) {
        const base=Math.round(s.startRate*100),steps=Math.round(-dy/TOUCH_SPEED_PIXELS);
        const speed=Math.max(50,Math.min(400,base+steps*5))/100;
        if(speed!==Number(s.player.getPlaybackRate())) {
            s.player.setPlaybackRate(speed);
        }
        showTouchValue('再生速度 '+speed.toFixed(2)+'×');
    }
    let touchValue=null;
    function showTouchValue(label){
        if(!document.body)return;
        if(!touchValue) {
            touchValue=document.createElement('div');
            touchValue.id='jfd-surface-touch-value';
            touchValue.style.cssText='position:fixed;top:41%;left:50%;transform:translate(-50%,-50%);z-index:2147483646;pointer-events:none;padding:14px 25px;background:#111d;color:#fff;border:1px solid #fff5;border-radius:12px;font:600 22px sans-serif';
        }
        if(!touchValue.isConnected) document.body.appendChild(touchValue);
        touchValue.textContent=label;touchValue.style.display='block';
    }
    function hideTouchValue(){if(touchValue)touchValue.style.display='none';}
    function toggleTouchPlay(player) {
        if(player.paused())player.unpause();else player.pause();
    }
    function toggleTouchFullscreen(player) {
        // The Qt host handles the actual window state, not HTML5 fullscreen.
        if(window.api?.input?.executeActions)
            window.api.input.executeActions(['host:fullscreen']);
        else if(typeof player.toggleFullscreen==='function')
            player.toggleFullscreen();
    }
    function resolveTouchTap(entry) {
        if(pendingTouchTap!==entry)return;
        pendingTouchTap=null;
        if(entry.count===1)toggleTouchPlay(entry.player);
        else if(entry.count===2)toggleTouchFullscreen(entry.player);
    }
    function touchFinishTap(s) {
        const now=touchClockNow();
        const center=s.x>=window.innerWidth*.32&&s.x<=window.innerWidth*.68&&
            s.y>=window.innerHeight*.25&&s.y<=window.innerHeight*.75;
        const prev=pendingTouchTap;
        const matched=center&&prev&&prev.player===s.player&&now-prev.at<=TAP_WINDOW&&
            Math.abs(prev.x-s.x)<85&&Math.abs(prev.y-s.y)<85;
        if(matched) {
            clearTimeout(prev.timer);
            prev.count++;prev.x=s.x;prev.y=s.y;prev.at=now;
            if(prev.count===3){pendingTouchTap=null;stopPlayback();}
            else prev.timer=setTimeout(()=>resolveTouchTap(prev),TAP_WINDOW);
            return;
        }
        if(prev){clearTimeout(prev.timer);resolveTouchTap(prev);}
        if(!center){toggleTouchPlay(s.player);return;}
        const entry={player:s.player,x:s.x,y:s.y,at:now,count:1,timer:null};
        pendingTouchTap=entry;
        entry.timer=setTimeout(()=>resolveTouchTap(entry),TAP_WINDOW);
    }
    function touchAdvanceHold(s,now) {
        if(s.mode!=='seek')return;
        const elapsed=Math.max(0,Math.min(.5,(now-s.lastTick)/1000));
        s.lastTick=now;
        if(!elapsed||!s.rate)return;
        s.holdOffset+=s.rate*elapsed;
        s.target=clamp(s.start+s.travel+s.holdOffset,s.duration);
    }
    function touchSetDelta(s,dx) {
        if(s.holdOnly&&Math.abs(dx)<10)return;
        s.holdOnly=false;
        s.dx=dx;s.travel=touchDelta(dx);s.rate=s.travel;
        s.lastTick=touchClockNow();
        s.target=clamp(s.start+s.travel+s.holdOffset,s.duration);
        touchSeek(s);
    }
    function touchSeek(s,force=false){
        const now=touchClockNow();
        if(!force && now-s.lastSeek<250)return;
        s.lastSeek=now;
        seek(s,force);
    }
    function touchStartHold(s) {
        s.startedAt=touchClockNow();s.lastTick=s.startedAt;
        s.holdOffset=0;s.travel=0;s.rate=0;s.holdOnly=false;
        s.lastSeek=-Infinity;
        s.holdTimer=setInterval(()=>{
            if(touchGesture!==s||touchBlocked||fingers.size!==1||activePlayer!==s.player||!s.player.currentSrc()){
                if(s.holdTimer!=null)clearInterval(s.holdTimer);
                s.holdTimer=null;return;
            }
            const now=touchClockNow();
            // Leftmost 15% is for speed; rewind hold begins just beyond it.
            if(!s.mode && now-s.startedAt>=500 &&
               ((s.x>window.innerWidth*.15&&s.x<window.innerWidth*.32)||s.x>window.innerWidth*.68)){
                s.mode='seek';s.tap=false;s.holdOnly=true;
                s.rate=s.x<window.innerWidth*.32?-15000:15000;
                s.lastTick=now;return;
            }
            if(s.mode!=='seek')return;
            const before=s.target;
            touchAdvanceHold(s,now);
            if(s.target!==before)touchSeek(s);
        },250);
    }
    function touchBaseline(e) {
        const player=activePlayer;
        const position=Number(player?.currentTime()),duration=Number(player?.duration());
        if(!player||!Number.isFinite(position)||!(duration>0))return;
        const startRate=Number(player.getPlaybackRate?.()||1);
        const s={player,native,button:0,start:position,target:position,duration,
            x:e.clientX,y:e.clientY,dx:0,tap:true,mode:null,count:1,touch:true,
            rightEdge:e.clientX>=window.innerWidth*.85,
            leftEdge:e.clientX<=window.innerWidth*.15,
            startRate:Number.isFinite(startRate)?Math.max(.5,Math.min(4,Math.round(startRate*20)/20)):1,
            volume:Number(player.getVolume()),holdTimer:null};
        touchGesture=s;touchStartHold(s);
    }
    function touchMove(e) {
        const point=fingers.get(e.pointerId);
        if(!point)return;
        point.x=e.clientX;point.y=e.clientY;
        const s=touchGesture;
        if(!s||touchBlocked||activePlayer!==s.player)return;
        const dx=e.clientX-s.x,dy=e.clientY-s.y;
        if(!s.mode && Math.max(Math.abs(dx),Math.abs(dy))<10)return;
        s.tap=false;
        if(!s.mode)s.mode=s.rightEdge&&Math.abs(dy)>Math.abs(dx)?'volume':
            s.leftEdge&&Math.abs(dy)>Math.abs(dx)?'speed':
            Math.abs(dx)>=Math.abs(dy)?'seek':'ignore';
        if(s.mode==='volume'){
            const volume=Math.max(0,Math.min(100,Math.round(s.volume-dy*100/(window.innerHeight*.6))));
            s.player.setVolume(volume);showTouchValue('音量 '+volume+'%');
        }else if(s.mode==='speed')updateTouchRate(s,dy);
        else if(s.mode==='seek')touchSetDelta(s,dx);
    }
    window.addEventListener('pointerdown',e=>{
        if(e.target?.closest?.('#jfsh-v1')) return;
        if(e.pointerType!=='touch')return;
        if(touchBlocked){touchConsume(e);return;}
        if(fingers.size){
            touchConsume(e);
            if(touchGesture?.holdTimer!=null)clearInterval(touchGesture.holdTimer);
            touchGesture=null;touchBlocked=true;fingers.set(e.pointerId,{x:e.clientX,y:e.clientY});
            hideFramePreview();hideTouchValue();return;
        }
        if(!touchArea(e))return;
        touchConsume(e);resetDrag();clearTimeout(singleClickTimer);touchButton(true);
        fingers.set(e.pointerId,{x:e.clientX,y:e.clientY});touchBaseline(e);
        try{e.target?.setPointerCapture?.(e.pointerId);}catch(_){}
    },{capture:true,passive:false});
    window.addEventListener('pointermove',e=>{
        if(e.pointerType!=='touch'||!fingers.has(e.pointerId))return;
        touchConsume(e);if(!touchBlocked)touchMove(e);
    },{capture:true,passive:false});
    window.addEventListener('pointerup',e=>{
        if(e.pointerType!=='touch'||!fingers.has(e.pointerId))return;
        touchConsume(e);
        if(!touchBlocked) {
            touchMove(e);
            const s=touchGesture;
            if(s&&activePlayer===s.player){
                if(s.mode==='seek'){touchAdvanceHold(s,touchClockNow());touchSeek(s,true);}
                else if(s.tap)touchFinishTap(s);
            }
        }
        if(touchGesture?.holdTimer!=null)clearInterval(touchGesture.holdTimer);
        touchGesture=null;
        fingers.delete(e.pointerId);
        hideFramePreview();hideTouchValue();
        if(!fingers.size)touchBlocked=false;
    },{capture:true,passive:false});
    window.addEventListener('pointercancel',e=>{if(e.pointerType==='touch'&&fingers.has(e.pointerId))cancelTouch();},true);
    window.addEventListener('lostpointercapture',e=>{if(fingers.has(e.pointerId))cancelTouch();},true);
    window.addEventListener('blur',()=>cancelTouch());
    document.addEventListener('visibilitychange',()=>{if(document.hidden)cancelTouch();});

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

// BEGIN CHATGPT_SEARCHHUB_CENTER_LAUNCH_V16
// Independent of the SearchHub global guard: the server's Injector may load first.
(() => {
  const apply = () => {
    if (!document.head || document.getElementById('jfsh-launch-center-v16')) return;
    const style = document.createElement('style');
    style.id = 'jfsh-launch-center-v16';
    style.textContent = '#jfsh-launch {top:23px!important;left:calc(50% + 108px)!important;right:auto!important;transform:none!important;}';
    document.head.appendChild(style);
  };
  apply();
  if (document.readyState === 'loading')
    document.addEventListener('DOMContentLoaded', apply, {once:true});
})();
// END CHATGPT_SEARCHHUB_CENTER_LAUNCH_V16
// BEGIN JFD_DESKTOP_PLAYBACK_UI_V23
// Also applies when the server's JavaScript Injector registers SearchHub first.
(() => {
  const STYLE='jfd-desktop-playback-ui-v23';
  const ACTIVE='jfd-desktop-playback-active';
  function visible(el) {
    if (!el || !el.isConnected) return false;
    const r=el.getBoundingClientRect();
    if (!r || r.width<120 || r.height<90) return false;
    const css=getComputedStyle(el);
    return css.visibility!=='hidden' && css.display!=='none';
  }
  function isPlaying() {
    try { if (window.__jfdDesktopPlayerActive?.() === true) return true; }
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
  window.__jfdDesktopPlaybackUI=Object.freeze({isPlaying,sync});
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
// END JFD_DESKTOP_PLAYBACK_UI_V23
// BEGIN JFD_DESKTOP_LAUNCHER_RECOVERY_V23
// Keep a launcher available after the SearchHub close button, even when a
// Jellyfin server-side Injector owns the main SearchHub registration.
(() => {
  const BUTTON_ID='jfsh-launch';
  const SEARCH_ID='jfsh-v1';
  const STYLE_ID='jfd-desktop-launcher-v23';
  function ensureLauncherStyle() {
    if (!document.head || document.getElementById(STYLE_ID)) return;
    const style=document.createElement('style');
    style.id=STYLE_ID;
    style.textContent='#jfsh-launch {top:23px!important;left:calc(50% + 108px)!important;right:auto!important;transform:none!important;}';
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
    const playing=window.__jfdDesktopPlaybackUI?.isPlaying?.()===true;
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
      button.style.setProperty('top','23px','important');
      button.style.setProperty('left','calc(50% + 108px)','important');
      button.style.setProperty('transform','none','important');
      button.style.setProperty('right','auto','important');
      button.style.display=hidden?'none':'';
    }
    return Boolean(button && !hidden);
  }
  window.__jfdDesktopLauncher=Object.freeze({repair:repairLauncher});
  repairLauncher();
  if(document.readyState==='loading')
    document.addEventListener('DOMContentLoaded',repairLauncher,{once:true});
  window.addEventListener('hashchange',repairLauncher);
  setInterval(repairLauncher,500);
})();
// END JFD_DESKTOP_LAUNCHER_RECOVERY_V23
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
    #jfsh-launch {position:fixed;top:23px;left:calc(50% + 108px);right:auto;transform:none;z-index:4100;border:0;background:transparent;color:#e8e8e8;border-radius:5px;padding:0 11px;height:42px;font:600 14px system-ui,sans-serif;box-shadow:none;cursor:pointer;white-space:nowrap}
    #jfsh-launch:hover{background:#333;color:#fff}#${ID}{position:fixed;inset:0;z-index:990000;background:#0b111bed;color:#eef4ff;overflow-y:auto;overflow-x:hidden;overscroll-behavior:contain;touch-action:pan-y;-webkit-overflow-scrolling:touch;font:14px/1.5 system-ui,sans-serif}
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
    @media(max-width:650px){#jfsh-launch{top:23px;left:calc(50% + 108px);right:auto;padding:0 7px}#${ID} .jfsh-shell{padding:15px 12px 65px}#${ID} h2{font-size:20px}#${ID} .jfsh-grid{grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}#${ID} .jfsh-people{grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}#${ID} .jfsh-name{font-size:12px;padding:6px}#${ID} .jfsh-people .jfsh-name{font-size:13px;min-height:34px}#${ID} .jfsh-page{min-width:37px;min-height:40px;padding:7px}#${ID} .jfsh-page-step{min-width:69px}#${ID} .jfsh-catgrid{grid-template-columns:1fr 1fr;gap:8px}#${ID} .jfsh-category{padding:12px 9px;flex-wrap:wrap}#${ID} .jfsh-category small{width:100%}}
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
    state.api=currentApi();if(!document.body)return;
    if(!state.api){window.alert('検索一覧のデータ取得機能が準備できていません。Jellyfinにログイン後、ホーム画面で「更新」を押して再試行してください。');return;}
    const activeUser=state.api.getCurrentUserId();
    if(state.userId && state.userId!==activeUser){state.libraries=[];state.fetchedMoviesKey='';state.fetchedPersonsKey='';}
    state.userId=activeUser;state.opened=true;
    searchOverlayHash=window.location.hash || '#/home';
    ensureStyle();const root=document.createElement('div');root.id=ID;
    root.setAttribute('role','dialog');root.setAttribute('aria-label','Jellyfin検索ハブ');root.setAttribute('aria-modal','true');
    document.body.appendChild(root);
    // Prevent native mouse/gesture seek from taking over the search overlay.
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
  function handleSearchBack() {
    if (!state.opened) return false;
    if (state.detail) backToParentList();
    return true; // The search overlay stays open even on its top-level list.
  }
  // Native WebView/browser Back may navigate the underlying Jellyfin page
  // rather than clicking the SearchHub overlay's own back button.
  function handleNativeSearchBack(event) {
    if (!state.opened || !state.detail) return;
    if (event?.cancelable) event.preventDefault();
    handleSearchBack();
    if (window.location.hash !== searchOverlayHash)
      window.location.hash = searchOverlayHash;
  }
  let searchOverlayHash = '#/home';
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
    window.__jfdDesktopPlaybackUI?.sync?.();
    window.__jfdDesktopLauncher?.repair?.();
  }

  // Restore the exact actress/series result set after opening details or playing a movie.
  let lastSelection = null;
  let playPoll = null;
  function restoreNativePointer() {
    try { window.api?.window?.setCursorVisibility?.(true); } catch (_) {}
  }
  function playbackVisible() {
    if (window.__jfdDesktopPlaybackUI?.isPlaying?.() === true) return true;
    if (/\/(?:video|player)(?:[/?]|$)/i.test(window.location.hash)) return true;
    return [...document.querySelectorAll('.videoPlayerContainer')].some(el =>
      !el.classList.contains('hide') && el.getClientRects().length > 0 &&
      getComputedStyle(el).visibility !== 'hidden');
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
  // Windows mouse thumb buttons (XBUTTON1/XBUTTON2) arrive as button 3/4.
  // Capture them before the embedded browser interprets Back as Home.
  // This is independent of the overlay's on-screen "← 一覧へ" button.
  const handleMouseThumbBack = event => {
    if (event.button !== 3 || !state.opened || !state.detail) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    handleSearchBack();
  };
  window.addEventListener('pointerdown',handleMouseThumbBack,true);
  window.addEventListener('mousedown',handleMouseThumbBack,true);
  window.addEventListener('mouseup',handleMouseThumbBack,true);
  window.addEventListener('auxclick',handleMouseThumbBack,true);
  window.addEventListener('popstate',handleNativeSearchBack);
  window.addEventListener('hashchange',()=>{
    if (state.opened) {
      if (state.detail) handleNativeSearchBack();
      return;
    }
    // Jellyfin's own toolbar Back uses router navigation, not XBUTTON1.
    // When it leaves a SearchHub-opened detail page, restore the saved works.
    if (lastSelection && !playbackVisible() &&
        !/\/details(?:[?\/]|$)/i.test(window.location.hash)) {
      const api=currentApi();
      if (api && api.getCurrentUserId()===lastSelection.userId) {
        returnToResults();
        return;
      }
    }
    restoreNativePointer();updateReturnButton();
  });
  // Intercept Jellyfin's on-screen Back button before its delegated router
  // handler navigates to Home. This applies only to SearchHub detail pages.
  document.addEventListener('click',event=>{
    if (!lastSelection || state.opened || playbackVisible()) return;
    if (!/\/details(?:[?\/]|$)/i.test(window.location.hash)) return;
    const target=event.target?.closest?.(
      '.headerBackButton,.btnBack,.backButton,.navBack,.btnBackButton,[data-action="back"],[is="emby-button"].headerButtonLeft');
    if (!target || target.closest('#jfsh-return-to-cast')) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    returnToResults();
  },true);
  // Jellyfin versions differ in the CSS name of their page Back button.
  // The accessibility label also covers icon-only buttons on both WebEngine
  // and WebView2; an explicit Home button is never treated as Back.
  function isSearchBackControl(node) {
    const control=node?.closest?.('button,a,[role="button"],.emby-button');
    if (!control || control.closest('#jfsh-return-to-cast')) return false;
    const className=typeof control.className==='string' ? control.className : '';
    const label=[
      control.getAttribute?.('aria-label'),control.getAttribute?.('title'),
      control.textContent
    ].filter(Boolean).join(' ').trim();
    return /(^|\s)(headerBackButton|btnBack|backButton|navBack|btnBackButton)(\s|$)/i.test(className) ||
      /^(戻る|Back|Go back|←|‹)(\s|$)/i.test(label) ||
      control.dataset?.action === 'back';
  }
  document.addEventListener('click',event=>{
    if (!lastSelection || state.opened || !window.location.hash.includes('/details')) return;
    if (!isSearchBackControl(event.target)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    returnToResults();
  },true);
  // The browser's thumb-button Back would otherwise leave a SearchHub
  // detail page for Home, bypassing the saved actress/works navigation.
  const handleSearchDetailMouseBack = event => {
    if (event.button !== 3 || state.opened || !lastSelection || playbackVisible()) return;
    const api=currentApi();
    if (!api || api.getCurrentUserId() !== lastSelection.userId) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    returnToResults();
  };
  ['pointerdown','mousedown','mouseup','auxclick'].forEach(type =>
    window.addEventListener(type,handleSearchDetailMouseBack,true));
  window.__jfdDesktopSearchHub=Object.freeze({
    hasPendingReturn() {
      const api=currentApi();
      return Boolean(lastSelection && api && lastSelection.userId===api.getCurrentUserId());
    },
    returnToResults() { return returnToResults(); },
    // Read-only item id for checking that Jellyfin saved SearchHub playback.
    pendingPlaybackItemId() {
      const api=currentApi();
      return lastSelection && api && lastSelection.userId===api.getCurrentUserId()
        ? lastSelection.itemId : null;
    },
    handleBack() { return handleSearchBack(); }
  });
  function attachButton() {
    updateReturnButton();
    // Keep the launcher discoverable in embedded WebEngine clients even when
    // the web application's ApiClient is exposed after initial document creation.
    if (!document.body || !document.head) return;
    const hidden=Boolean(document.fullscreenElement) || playbackVisible() || state.opened;
    const existing=document.getElementById('jfsh-launch');
    if(existing){existing.style.display=hidden?'none':'';return;}
    ensureStyle();const b=document.createElement('button');b.id='jfsh-launch';
    b.textContent='🔎 検索一覧';b.type='button';b.title='女優・シリーズ・ジャンル一覧';
    b.style.display=hidden?'none':'';
    document.body.appendChild(b);
  }
  attachButton();
  document.addEventListener('DOMContentLoaded',attachButton,{once:true});
  window.addEventListener('load',attachButton,{once:true});
  // SPA login transitions: lightweight periodic check. Never patch fetch, Jellyfin routing, or application files.
  const timer=setInterval(attachButton,2500);
  window.addEventListener('pagehide',()=>clearInterval(timer),{once:true});
})();
}
// END CHATGPT_JELLYFIN_SEARCHHUB_V15
