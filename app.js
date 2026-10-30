/**
 * Photo Editor PRO - Client-Side Image Processing Engine
 */

// Application State
const state = {
    // Images and Canvases
    originalImage: null,           // HTMLImageElement of full size uploaded image
    originalFileName: 'edited-photo',
    originalFormat: 'image/jpeg',
    
    // Scale Down Preview
    previewCanvas: null,           // Offscreen canvas containing resized image (input for filters)
    previewCtx: null,
    previewImageData: null,        // Original raw pixels of preview canvas
    
    // Main Viewport Elements
    editorCanvas: document.getElementById('editor-canvas'),
    editorCtx: document.getElementById('editor-canvas').getContext('2d'),
    
    // Image Dimensions
    width: 0,
    height: 0,
    previewWidth: 0,
    previewHeight: 0,
    
    // Adjustment Parameters (Standard & Advanced Lightroom Features)
    adjustments: {
        exposure: 0,
        contrast: 0,
        temperature: 0,
        tint: 0,
        saturation: 0,
        
        // Advanced Tone controls
        highlights: 0,
        shadows: 0,
        whites: 0,
        blacks: 0,
        
        // Presence
        vibrance: 0,
        clarity: 0,
        dehaze: 0,
        
        // Detail & Effects
        sharpening: 0,
        noiseReduction: 0,
        vignette: 0,
        grain: 0,

        // Split Toning
        splitHighlightHue: 0,
        splitHighlightSat: 0,
        splitShadowHue: 0,
        splitShadowSat: 0,
        splitBalance: 0,

        // Watermark
        watermarkText: '',
        watermarkSize: 50,
        watermarkOpacity: 50,
        watermarkColor: '#ffffff',
        watermarkPosition: 'bottom-right'
    },
    
    // Spline Curves State
    curves: {
        rgb: [{ x: 0, y: 0 }, { x: 255, y: 255 }],
        red: [{ x: 0, y: 0 }, { x: 255, y: 255 }],
        green: [{ x: 0, y: 0 }, { x: 255, y: 255 }],
        blue: [{ x: 0, y: 0 }, { x: 255, y: 255 }]
    },
    activeCurveChannel: 'rgb',
    selectedCurvePoint: -1,
    curveLUTs: {
        rgb: new Uint8Array(256),
        red: new Uint8Array(256),
        green: new Uint8Array(256),
        blue: new Uint8Array(256)
    },
    
    // HSL Colors mixer
    hsl: {
        hue: { red: 0, orange: 0, yellow: 0, green: 0, aqua: 0, blue: 0, purple: 0, magenta: 0 },
        saturation: { red: 0, orange: 0, yellow: 0, green: 0, aqua: 0, blue: 0, purple: 0, magenta: 0 },
        luminance: { red: 0, orange: 0, yellow: 0, green: 0, aqua: 0, blue: 0, purple: 0, magenta: 0 }
    },
    activeHslTab: 'hue',
    
    // Crop & Rotate Transform System
    cropTransform: {
        crop: null, // null means uncropped, otherwise {x, y, w, h} fractions [0..1]
        rotate: 0, // degrees: 0, 90, 180, 270
        straighten: 0, // micro straightening angle in degrees: [-45..45]
        flipH: false,
        flipV: false
    },
    backupCropTransform: null,
    isCropMode: false,
    activeCropBox: { x: 0, y: 0, w: 1, h: 1 }, // temporary user-interactive crop coordinates [0..1]
    
    // Artistic Frame Selection
    activeFrame: 'none',
    
    // Preset blending intensity (0..100)
    presetIntensity: 100,
    
    // Active Preset
    activePreset: 'original',
    
    // Zoom and Pan
    zoom: 100,                     // Zoom percentage
    isFit: true,                   // Whether zoom fits the screen
    pan: { x: 0, y: 0 },
    isPanning: false,
    panStart: { x: 0, y: 0 },
    
    // History (Undo / Redo)
    history: [],
    historyIndex: -1,
    maxHistory: 30,
    
    // Comparison State
    isComparing: false,
    
    // Rendering management
    renderPending: false,
    blurCache: null,               // Cached blurred copy of previewImageData (sharpen / noise reduction input)
    outputImageData: null,         // Reusable output buffer for render()
    presetAnimation: null,         // Active slider animation timer
    previewRebuildPending: false,
    previewMaxDim: 1200,                  // Current preview resolution (raised while zoomed in)
    detailTimer: null,
    sourceUrl: null,               // Object URL of the loaded file (revoked on replace)
    
    // User saved presets (persisted in localStorage)
    customPresets: {}
};

// Constants
const MAX_PREVIEW_DIMENSION = 1200; // Base preview size for real-time 60fps editing
const MAX_DETAIL_DIMENSION = 2400;  // Upper bound when the preview is re-rendered sharper while zoomed in
const MAX_EXPORT_PIXELS = 120 * 1000 * 1000; // Safety cap so huge exports do not exhaust canvas memory
const MAX_EXPORT_SIDE = 16384;               // Chromium canvas side limit
const MIN_ZOOM = 5;
const MAX_ZOOM = 800;
const SLIDER_DEFAULTS = { watermarkSize: 50, watermarkOpacity: 50 };
const TONE_KEYS = ['exposure', 'contrast', 'temperature', 'tint', 'saturation', 'highlights', 'shadows', 'whites', 'blacks', 'vibrance', 'clarity', 'dehaze'];
const EFFECT_KEYS = ['sharpening', 'noiseReduction', 'vignette', 'grain'];
const PRESET_KEYS = [...TONE_KEYS, ...EFFECT_KEYS];

function safeStorageGet(key) {
    try { return localStorage.getItem(key); } catch (e) { return null; }
}
function safeStorageSet(key, value) {
    try { localStorage.setItem(key, value); return true; } catch (e) { return false; }
}

function clamp(v, lo, hi) {
    return v < lo ? lo : (v > hi ? hi : v);
}

// Small non-blocking notification (replaces alert() for informational messages)
let toastTimer = null;
function showToast(message, type = 'info') {
    let toast = document.getElementById('toast');
    if (!toast) {
        toast = document.createElement('div');
        toast.id = 'toast';
        toast.setAttribute('role', 'status');
        toast.setAttribute('aria-live', 'polite');
        document.body.appendChild(toast);
    }
    toast.textContent = message;
    toast.className = `toast show toast-${type}`;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove('show'), 2600);
}

function isTypingTarget(el) {
    if (!el) return false;
    const tag = el.tagName;
    return tag === 'TEXTAREA' || tag === 'SELECT' || (tag === 'INPUT' && !['range', 'button', 'checkbox'].includes(el.type));
}

// DOM Elements
const dropzone = document.getElementById('dropzone');
const fileInput = document.getElementById('file-input');
const btnSelectFile = document.getElementById('btn-select-file');
const uploadBtnTrigger = document.querySelector('.upload-btn-trigger');
const editorContainer = document.getElementById('editor-container');
const canvasWrapper = document.getElementById('canvas-wrapper');
const loadingOverlay = document.getElementById('loading-overlay');
const dimensionsDisplay = document.getElementById('dimensions-display');

// Control Inputs
const inputs = {
    exposure: document.getElementById('input-exposure'),
    contrast: document.getElementById('input-contrast'),
    temperature: document.getElementById('input-temperature'),
    tint: document.getElementById('input-tint'),
    saturation: document.getElementById('input-saturation'),
    highlights: document.getElementById('input-highlights'),
    shadows: document.getElementById('input-shadows'),
    whites: document.getElementById('input-whites'),
    blacks: document.getElementById('input-blacks'),
    vibrance: document.getElementById('input-vibrance'),
    clarity: document.getElementById('input-clarity'),
    dehaze: document.getElementById('input-dehaze'),
    sharpening: document.getElementById('input-sharpening'),
    noiseReduction: document.getElementById('input-noise-reduction'),
    vignette: document.getElementById('input-vignette'),
    grain: document.getElementById('input-grain'),
    
    // Split Toning
    splitHighlightHue: document.getElementById('input-split-highlight-hue'),
    splitHighlightSat: document.getElementById('input-split-highlight-sat'),
    splitShadowHue: document.getElementById('input-split-shadow-hue'),
    splitShadowSat: document.getElementById('input-split-shadow-sat'),
    splitBalance: document.getElementById('input-split-balance'),

    // Watermark
    watermarkText: document.getElementById('input-watermark-text'),
    watermarkSize: document.getElementById('input-watermark-size'),
    watermarkOpacity: document.getElementById('input-watermark-opacity'),
    watermarkColor: document.getElementById('input-watermark-color'),
    watermarkPosition: document.getElementById('input-watermark-position')
};

// Toolbar Buttons
const btnUndo = document.getElementById('btn-undo');
const btnRedo = document.getElementById('btn-redo');
const btnZoomIn = document.getElementById('btn-zoom-in');
const btnZoomOut = document.getElementById('btn-zoom-out');
const btnZoomFit = document.getElementById('btn-zoom-fit');
const zoomDisplay = document.getElementById('zoom-display');
const btnCompare = document.getElementById('btn-compare');
const btnCropToggle = document.getElementById('btn-crop-toggle');
const btnDownload = document.getElementById('btn-download');
const btnReset = document.getElementById('btn-reset');

// Preset Buttons
const presetButtons = document.querySelectorAll('.preset-btn');

// Preset Definitions (Original 6 + 5 New Beautiful Filters = 11 Presets)
const PRESETS = {
    'original': { exposure: 0, contrast: 0, temperature: 0, tint: 0, saturation: 0 },
    'warm-vintage': { exposure: 12, contrast: 18, temperature: 30, tint: 8, saturation: 15 },
    'cool-cyan': { exposure: 5, contrast: 10, temperature: -35, tint: -12, saturation: -8 },
    'high-contrast-mono': { exposure: 15, contrast: 55, temperature: 0, tint: 0, saturation: -100 },
    'cinematic': { exposure: -6, contrast: 25, temperature: 18, tint: -18, saturation: 12 },
    'sunset': { exposure: 18, contrast: 12, temperature: 48, tint: 22, saturation: 35 },
    
    // 5 New Filters
    'lomo-retro': { exposure: 5, contrast: 25, temperature: -10, tint: 15, saturation: 25 },
    'soft-pastel': { exposure: 25, contrast: -15, temperature: 10, tint: 5, saturation: -12 },
    'midnight-drama': { exposure: -15, contrast: 30, temperature: -45, tint: -15, saturation: 10 },
    'emerald-forest': { exposure: 8, contrast: 12, temperature: -15, tint: -25, saturation: 15 },
    'cyberpunk': { exposure: 5, contrast: 25, temperature: -30, tint: 40, saturation: 30 }
};

/* ==========================================
 * INITIALIZATION & EVENT LISTENERS
 * ========================================== */

let wasmExports = null;
let wasmFailures = 0;

async function initWasm() {
    const progress = document.querySelector('.splash-progress');
    const loadingText = document.querySelector('.splash-loading-text');
    const splash = document.getElementById('splash-screen');
    
    try {
        if (progress) progress.style.width = '20%';
        if (loadingText) loadingText.textContent = '初始化界面模組...';
        
        await new Promise(r => setTimeout(r, 100));
        
        if (progress) progress.style.width = '50%';
        if (loadingText) loadingText.textContent = '載入 Rust 核心處理引擎...';
        
        let wasmBuffer;
        if (window.wasmAPI) {
            wasmBuffer = await window.wasmAPI.loadWasm();
        } else {
            const response = await fetch('image_processor.wasm');
            wasmBuffer = await response.arrayBuffer();
        }
        
        if (!wasmBuffer) {
            throw new Error("Empty Wasm buffer");
        }
        
        if (progress) progress.style.width = '80%';
        if (loadingText) loadingText.textContent = '編譯 WebAssembly 元件...';
        
        const result = await WebAssembly.instantiate(wasmBuffer, {});
        const exports = result.instance.exports;
        if (typeof exports.process_pixels !== 'function' || typeof exports.alloc !== 'function' ||
            typeof exports.dealloc !== 'function' || !exports.memory) {
            throw new Error("Wasm module is missing required exports");
        }
        wasmExports = exports;
        requestRender();
        
        console.log("Rust WebAssembly Engine loaded!");
        
        if (progress) progress.style.width = '100%';
        if (loadingText) loadingText.textContent = '影像引擎載入成功！';
        
        await new Promise(r => setTimeout(r, 300));
        if (splash) {
            splash.classList.add('fade-out');
        }
    } catch (err) {
        console.error("Failed to load Wasm, using JS fallback engine:", err);
        wasmExports = null;
        if (loadingText) loadingText.textContent = 'Wasm 載入失敗，正在使用 JS 引擎...';
        await new Promise(r => setTimeout(r, 800));
        if (splash) {
            splash.classList.add('fade-out');
        }
    }
}

/* ---- Slider UI helpers ---- */

function formatSliderValue(input, val) {
    if (typeof val !== 'number') return String(val);
    // Unsigned sliders (min >= 0) are shown without a leading "+"
    const unsigned = parseFloat(input.min) >= 0;
    return (!unsigned && val > 0) ? `+${val}` : String(val);
}

function setSliderUI(key, val) {
    const input = inputs[key];
    if (!input) return;
    input.value = val;
    if (input.type === 'range') {
        const sliderControl = input.closest('.slider-control');
        const valDisplay = sliderControl ? sliderControl.querySelector('.val-display') : null;
        if (valDisplay) valDisplay.textContent = formatSliderValue(input, val);
    }
}

function getPresetButtons() {
    return document.querySelectorAll('.preset-btn');
}

function getPresetDefinition(name) {
    if (PRESETS[name]) return PRESETS[name];
    if (name && name.startsWith('my:')) return state.customPresets[name.slice(3)] || null;
    return null;
}

function setupPresetIntensity() {
    const inputIntensity = document.getElementById('input-preset-intensity');
    const valDisplay = document.getElementById('preset-intensity-val');
    if (inputIntensity && valDisplay) {
        inputIntensity.addEventListener('input', () => {
            state.presetIntensity = parseInt(inputIntensity.value);
            valDisplay.textContent = state.presetIntensity;
            if (state.activePreset && state.activePreset !== 'custom' && state.activePreset !== 'original') {
                applyPresetWithIntensity(state.activePreset, state.presetIntensity);
            }
        });
        inputIntensity.addEventListener('change', () => {
            if (state.originalImage) saveHistoryState();
        });
    }
}

function applyPresetWithIntensity(presetName, intensity) {
    const targetPreset = getPresetDefinition(presetName);
    if (!state.originalImage || !targetPreset) return;
    cancelPresetAnimation();
    state.activePreset = presetName;
    
    const blended = {};
    PRESET_KEYS.forEach(key => {
        const targetVal = targetPreset[key] !== undefined ? targetPreset[key] : 0;
        blended[key] = Math.round(targetVal * (intensity / 100));
    });
    
    Object.assign(state.adjustments, blended);
    Object.keys(blended).forEach(key => setSliderUI(key, blended[key]));
    
    requestRender();
}

function setupAutoEnhance() {
    const btnAutoEnhance = document.getElementById('btn-auto-enhance');
    if (btnAutoEnhance) {
        btnAutoEnhance.addEventListener('click', () => {
            if (!state.originalImage || !state.previewImageData) return;
            
            // Analyze the preview image data
            const data = state.previewImageData.data;
            const len = data.length;
            
            let sumLuminance = 0;
            let sampleCount = 0;
            const buckets = new Uint32Array(256);
            
            // Sample every 16th pixel for performance
            for (let i = 0; i + 2 < len; i += 64) {
                const y = Math.round(0.2126 * data[i] + 0.7152 * data[i+1] + 0.0722 * data[i+2]);
                sumLuminance += y;
                buckets[y]++;
                sampleCount++;
            }
            if (sampleCount === 0) return;
            
            const avgLuminance = sumLuminance / sampleCount;
            
            // 10th / 90th luminance percentiles (-1 = not found yet, so a black level of 0 is handled correctly)
            let count = 0;
            let shadowThreshold = -1;
            let highlightThreshold = -1;
            for (let i = 0; i < 256; i++) {
                count += buckets[i];
                if (shadowThreshold < 0 && count >= sampleCount * 0.1) shadowThreshold = i;
                if (highlightThreshold < 0 && count >= sampleCount * 0.9) highlightThreshold = i;
            }
            if (shadowThreshold < 0) shadowThreshold = 0;
            if (highlightThreshold < 0) highlightThreshold = 255;
            
            let autoExposure = 0;
            if (avgLuminance < 110) {
                autoExposure = Math.round((120 - avgLuminance) * 0.4);
            } else if (avgLuminance > 140) {
                autoExposure = Math.round((125 - avgLuminance) * 0.3);
            }
            autoExposure = clamp(autoExposure, -30, 40);
            
            const dynamicRange = highlightThreshold - shadowThreshold;
            let autoContrast = 0;
            if (dynamicRange < 180) {
                autoContrast = Math.round((180 - dynamicRange) * 0.4);
            } else {
                autoContrast = 10;
            }
            autoContrast = clamp(autoContrast, 0, 40);
            
            let autoShadows = 0;
            if (shadowThreshold < 30) {
                autoShadows = Math.round((30 - shadowThreshold) * 1.2);
            }
            autoShadows = clamp(autoShadows, 0, 50);
            
            let autoHighlights = 0;
            if (highlightThreshold > 220) {
                autoHighlights = -Math.round((highlightThreshold - 220) * 0.8);
            }
            autoHighlights = clamp(autoHighlights, -50, 0);
            
            const targets = {
                exposure: autoExposure,
                contrast: autoContrast,
                shadows: autoShadows,
                highlights: autoHighlights,
                saturation: 8,
                vibrance: 15,
                whites: 5,
                blacks: -5
            };
            
            // Auto enhance only touches tone & presence; colour balance, clarity, dehaze and effects are kept
            state.activePreset = 'custom';
            clearPresetHighlights();
            animateSlidersTo(targets, {
                keepKeys: ['temperature', 'tint', 'clarity', 'dehaze', ...EFFECT_KEYS]
            });
            
            btnAutoEnhance.classList.add('btn-auto-enhance-active');
            setTimeout(() => {
                btnAutoEnhance.classList.remove('btn-auto-enhance-active');
            }, 2000);
        });
    }
}

function setActiveFrame(frame) {
    state.activeFrame = frame || 'none';
    document.querySelectorAll('.frame-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.frame === state.activeFrame);
    });
}

function setupFrames() {
    const frameBtns = document.querySelectorAll('.frame-btn');
    frameBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            if (!state.originalImage) return;
            setActiveFrame(btn.dataset.frame);
            saveHistoryState();
            requestRender();
        });
    });
}

/* ---- Custom (user saved) presets ---- */

const CUSTOM_PRESET_STORAGE_KEY = 'pep_custom_presets';
const MAX_CUSTOM_PRESETS = 24;

function loadCustomPresets() {
    try {
        const raw = safeStorageGet(CUSTOM_PRESET_STORAGE_KEY);
        const parsed = raw ? JSON.parse(raw) : {};
        const clean = {};
        if (parsed && typeof parsed === 'object') {
            Object.keys(parsed).slice(0, MAX_CUSTOM_PRESETS).forEach(name => {
                const src = parsed[name];
                if (!src || typeof src !== 'object') return;
                const preset = {};
                PRESET_KEYS.forEach(k => {
                    const v = Number(src[k]);
                    preset[k] = Number.isFinite(v) ? clamp(Math.round(v), -100, 100) : 0;
                });
                clean[String(name).slice(0, 20)] = preset;
            });
        }
        state.customPresets = clean;
    } catch (e) {
        state.customPresets = {};
    }
}

function persistCustomPresets() {
    return safeStorageSet(CUSTOM_PRESET_STORAGE_KEY, JSON.stringify(state.customPresets));
}

function renderCustomPresets() {
    const list = document.getElementById('custom-presets-list');
    if (!list) return;
    list.textContent = '';
    const names = Object.keys(state.customPresets);
    if (names.length === 0) {
        const empty = document.createElement('p');
        empty.className = 'custom-presets-empty';
        empty.textContent = '尚未儲存任何自訂預設';
        list.appendChild(empty);
        return;
    }
    names.forEach(name => {
        const row = document.createElement('div');
        row.className = 'custom-preset-row';
        
        const btn = document.createElement('button');
        btn.className = 'preset-btn';
        btn.dataset.preset = `my:${name}`;
        btn.textContent = name;
        btn.title = name;
        if (state.activePreset === `my:${name}`) btn.classList.add('active');
        btn.addEventListener('click', () => applyPreset(`my:${name}`));
        
        const del = document.createElement('button');
        del.className = 'custom-preset-delete';
        del.title = `刪除「${name}」`;
        del.setAttribute('aria-label', `刪除預設 ${name}`);
        del.textContent = '×';
        del.addEventListener('click', () => {
            delete state.customPresets[name];
            persistCustomPresets();
            if (state.activePreset === `my:${name}`) state.activePreset = 'custom';
            renderCustomPresets();
        });
        
        row.appendChild(btn);
        row.appendChild(del);
        list.appendChild(row);
    });
}

function setupCustomPresets() {
    loadCustomPresets();
    renderCustomPresets();
    
    const nameInput = document.getElementById('input-custom-preset-name');
    const btnSave = document.getElementById('btn-save-custom-preset');
    if (!nameInput || !btnSave) return;
    
    const save = () => {
        if (!state.originalImage) {
            showToast('請先載入相片再儲存預設', 'error');
            return;
        }
        const name = nameInput.value.trim().slice(0, 20);
        if (!name) {
            nameInput.focus();
            return;
        }
        const isNew = !(name in state.customPresets);
        if (isNew && Object.keys(state.customPresets).length >= MAX_CUSTOM_PRESETS) {
            showToast(`最多只能儲存 ${MAX_CUSTOM_PRESETS} 個自訂預設`, 'error');
            return;
        }
        const preset = {};
        PRESET_KEYS.forEach(k => { preset[k] = Number(state.adjustments[k]) || 0; });
        state.customPresets[name] = preset;
        if (!persistCustomPresets()) showToast('瀏覽器禁止儲存資料，預設僅在本次使用有效', 'error');
        else showToast(`已儲存預設「${name}」`, 'success');
        nameInput.value = '';
        state.activePreset = `my:${name}`;
        clearPresetHighlights();
        renderCustomPresets();
    };
    btnSave.addEventListener('click', save);
    nameInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') save();
    });
}

// Update feedback: a glass card with jelly motion, driven by status messages from the main process.
function setupUpdateUI() {
    const api = window.updateAPI;
    const card = document.getElementById('update-card');
    const btnCheck = document.getElementById('btn-check-update');
    if (!api || !card) return; // browser / dev server: there is no updater

    const title = document.getElementById('update-title');
    const desc = document.getElementById('update-desc');
    const fill = document.getElementById('update-fill');
    const percentEl = document.getElementById('update-percent');
    const speedEl = document.getElementById('update-speed');
    const actions = document.getElementById('update-actions');
    const btnClose = document.getElementById('update-close');
    const checkLabel = btnCheck && btnCheck.querySelector('.btn-label');

    let hideTimer = null;
    let leaveTimer = null;

    if (btnCheck) {
        btnCheck.style.display = '';
        btnCheck.addEventListener('click', () => {
            // Instant feedback, before the main process has answered
            setChecking(true);
            setContent('正在檢查更新…', '正在連線到 GitHub，請稍候', []);
            show('checking');
            api.checkForUpdates();
        });
    }

    function setChecking(on) {
        if (!btnCheck) return;
        btnCheck.classList.toggle('is-checking', on);
        if (checkLabel) checkLabel.textContent = on ? '檢查中…' : '檢查更新';
    }

    function hide() {
        clearTimeout(hideTimer);
        if (card.hidden || card.classList.contains('leaving')) return;
        card.classList.add('leaving');
        clearTimeout(leaveTimer);
        leaveTimer = setTimeout(() => {
            card.hidden = true;
            card.classList.remove('leaving');
        }, 380);
    }

    function show(state) {
        clearTimeout(hideTimer);
        clearTimeout(leaveTimer);
        const wasHidden = card.hidden || card.classList.contains('leaving');
        card.classList.remove('leaving');
        if (wasHidden) {
            // Restart the entrance animation
            card.hidden = false;
            card.style.animation = 'none';
            void card.offsetWidth;
            card.style.animation = '';
        }
        card.dataset.state = state;
    }

    function button(label, onClick, primary) {
        const b = document.createElement('button');
        b.className = 'glass-btn jelly' + (primary ? ' primary' : '');
        b.textContent = label;
        b.addEventListener('click', onClick);
        return b;
    }

    function setContent(titleText, descText, buttons) {
        title.textContent = titleText;
        desc.textContent = descText;
        actions.replaceChildren(...buttons);
    }

    const mb = (bytes) => (bytes / 1048576).toFixed(1);

    api.onStatus((s) => {
        if (s.state !== 'checking') setChecking(false);

        switch (s.state) {
            case 'checking':
                setContent('正在檢查更新…', '正在連線到 GitHub，請稍候', []);
                show('checking');
                break;
            case 'uptodate':
                setContent('已是最新版本', `目前版本 ${s.current}，沒有可用的更新`, []);
                show('uptodate');
                hideTimer = setTimeout(hide, 3200);
                break;
            case 'available':
                setContent(`發現新版本 ${s.version}`, `目前版本為 ${s.current}，要現在下載更新嗎？`, [
                    button('稍後', hide, false),
                    button('下載更新', () => {
                        setContent('準備下載…', '正在向伺服器要求更新檔', []);
                        show('downloading');
                        api.downloadUpdate();
                    }, true)
                ]);
                show('available');
                break;
            case 'downloading': {
                const pct = Math.max(0, Math.min(100, s.percent || 0));
                if (card.dataset.state !== 'downloading') {
                    setContent('正在下載更新…', '下載期間可以繼續編輯相片', []);
                    show('downloading');
                }
                fill.style.width = pct + '%';
                percentEl.textContent = Math.floor(pct) + '%';
                speedEl.textContent = s.total ? `${mb(s.transferred)} / ${mb(s.total)} MB · ${mb(s.speed)} MB/s` : '';
                if (pct > 0) {
                    title.textContent = '正在下載更新…';
                    desc.textContent = '下載期間可以繼續編輯相片';
                }
                break;
            }
            case 'downloaded':
                setContent(`${s.version} 已準備好`, '重新啟動即可完成安裝，也可以稍後在關閉程式時自動安裝。', [
                    button('稍後', () => { api.installLater(); hide(); }, false),
                    button('重新啟動並安裝', () => {
                        setContent('正在重新啟動…', '安裝完成後會自動開啟新版本', []);
                        api.installUpdate();
                    }, true)
                ]);
                show('downloaded');
                break;
            case 'portable':
                setContent('免安裝版無法自動更新', '請到 GitHub 下載最新版本，或改用安裝版以取得自動更新。', [
                    button('取消', hide, false),
                    button('開啟下載頁面', () => { api.openReleasesPage(); hide(); }, true)
                ]);
                show('portable');
                break;
            case 'dev':
                setContent('開發模式', '開發模式不支援自動更新。', []);
                show('dev');
                hideTimer = setTimeout(hide, 3200);
                break;
            case 'error':
                setContent('檢查更新失敗', '無法取得更新資訊，請確認網路連線後再試一次。', [
                    button('關閉', hide, false),
                    button('重試', () => {
                        setChecking(true);
                        show('checking');
                        setContent('正在檢查更新…', '正在連線到 GitHub，請稍候', []);
                        api.checkForUpdates();
                    }, true)
                ]);
                show('error');
                break;
        }
    });

    btnClose.addEventListener('click', hide);

    // The glass highlight follows the pointer
    card.addEventListener('pointermove', (e) => {
        const r = card.getBoundingClientRect();
        card.style.setProperty('--mx', ((e.clientX - r.left) / r.width * 100).toFixed(1) + '%');
        card.style.setProperty('--my', ((e.clientY - r.top) / r.height * 100).toFixed(1) + '%');
    });
    // Keep the card while the pointer rests on it
    card.addEventListener('pointerenter', () => clearTimeout(hideTimer));

    if (window.lucide) lucide.createIcons();
}

function setupLegalModal() {
    const legalOverlay = document.getElementById('legal-overlay');
    const btnLegal = document.getElementById('btn-legal');
    const btnCloseLegal = document.getElementById('btn-close-legal');
    const btnLegalConfirm = document.getElementById('btn-legal-confirm');

    if (btnLegal && legalOverlay) {
        btnLegal.addEventListener('click', () => {
            legalOverlay.style.display = 'flex';
        });
    }
    
    if (btnCloseLegal && legalOverlay) {
        btnCloseLegal.addEventListener('click', () => {
            legalOverlay.style.display = 'none';
        });
    }
    
    if (btnLegalConfirm && legalOverlay) {
        btnLegalConfirm.addEventListener('click', () => {
            legalOverlay.style.display = 'none';
        });
    }
}

function init() {
    // 嚴禁逆向工程與除錯：禁用滑鼠右鍵選單與開發者快捷鍵
    document.addEventListener('contextmenu', e => e.preventDefault());
    window.addEventListener('keydown', (e) => {
        if ((e.ctrlKey && e.shiftKey && (e.key === 'I' || e.key === 'i' || e.key === 'J' || e.key === 'j')) ||
            (e.ctrlKey && (e.key === 'U' || e.key === 'u')) ||
            e.key === 'F12') {
            e.preventDefault();
            e.stopPropagation();
        }
    }, true);

    // Start WASM Loading and splash animation
    initWasm();

    setupDragAndDrop();
    setupPasteImport();
    setupFileInputs();
    setupSliders();
    setupToolbar();
    setupPresetButtons();
    setupWindowEvents();
    
    // Advanced Lightroom features setup
    setupAccordions();
    setupHslMixer();
    setupCurveEditor();
    setupCropMode();

    // New Feature setups
    setupPresetIntensity();
    setupAutoEnhance();
    setupFrames();
    setupCustomPresets();
    setupExportDialog();
    setupBatchDialog();
    setupUpdateUI();
    setupLegalModal();

    recomputeAllCurveLUTs();
    if (window.lucide) lucide.createIcons();
}

// Drag & Drop Setup
// Listens on the whole window: an image dropped anywhere replaces the current photo, and a drop
// outside the dropzone no longer makes the Electron window navigate to the dropped file.
function setupDragAndDrop() {
    let dragDepth = 0;
    const hasFiles = (e) => e.dataTransfer && Array.from(e.dataTransfer.types || []).includes('Files');
    const setDragging = (on) => {
        dropzone.classList.toggle('dragover', on);
        document.body.classList.toggle('drag-active', on);
    };
    
    window.addEventListener('dragenter', (e) => {
        if (!hasFiles(e)) return;
        e.preventDefault();
        dragDepth++;
        setDragging(true);
    });
    
    window.addEventListener('dragover', (e) => {
        if (!hasFiles(e)) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = 'copy';
    });
    
    window.addEventListener('dragleave', (e) => {
        if (!hasFiles(e)) return;
        e.preventDefault();
        dragDepth = Math.max(0, dragDepth - 1);
        if (dragDepth === 0) setDragging(false);
    });
    
    window.addEventListener('drop', (e) => {
        if (!hasFiles(e)) return;
        e.preventDefault();
        dragDepth = 0;
        setDragging(false);
        
        const files = Array.from(e.dataTransfer.files || []);
        const imageFile = files.find(isImageFile);
        if (imageFile) {
            handleImageFile(imageFile);
        } else if (files.length > 0) {
            showToast('請拖曳有效的相片檔案（JPG、PNG、WebP 等）', 'error');
        }
    });
    
    // Clicking dropzone opens file dialog
    dropzone.addEventListener('click', () => fileInput.click());
}

// Paste an image straight from the clipboard (Ctrl+V)
function setupPasteImport() {
    window.addEventListener('paste', (e) => {
        const items = e.clipboardData ? Array.from(e.clipboardData.items || []) : [];
        const item = items.find(it => it.kind === 'file' && it.type.startsWith('image/'));
        if (!item) return;
        const file = item.getAsFile();
        if (!file) return;
        e.preventDefault();
        handleImageFile(file, 'pasted-image');
    });
}

// File Inputs Setup
function setupFileInputs() {
    btnSelectFile.addEventListener('click', (e) => {
        e.stopPropagation(); // Avoid triggering parent dropzone click
        fileInput.click();
    });

    const btnSampleFile = document.getElementById('btn-sample-file');
    if (btnSampleFile) {
        btnSampleFile.addEventListener('click', (e) => {
            e.stopPropagation(); // Avoid triggering parent dropzone click
            loadSampleImage();
        });
    }

    uploadBtnTrigger.addEventListener('click', () => {
        fileInput.click();
    });

    fileInput.addEventListener('change', (e) => {
        if (e.target.files.length > 0) {
            handleImageFile(e.target.files[0]);
        }
        // Allow picking the same file again later
        fileInput.value = '';
    });
}

async function loadSampleImage() {
    showLoading(true);
    try {
        let blob;
        if (window.sampleAPI) {
            // Electron: bytes come from the main process (file:// images would taint the canvas)
            const bytes = await window.sampleAPI.loadSample();
            if (!bytes) throw new Error('sample not available');
            blob = new Blob([bytes], { type: 'image/jpeg' });
        } else {
            const response = await fetch('./sample.jpg');
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            blob = await response.blob();
        }
        await handleImageFile(new File([blob], 'sample-landscape.jpg', { type: 'image/jpeg' }));
    } catch (err) {
        console.error(err);
        showLoading(false);
        showToast('無法載入範例圖片！', 'error');
    }
}

// Setup Slider Change Listeners
function setupSliders() {
    Object.keys(inputs).forEach(key => {
        const input = inputs[key];
        if (!input) return;

        const isRange = input.type === 'range';
        const sliderControl = input.closest('.slider-control');
        const valDisplay = sliderControl ? sliderControl.querySelector('.val-display') : null;

        const updateValue = () => {
            let val;
            if (isRange) {
                val = parseInt(input.value);
                if (valDisplay) {
                    valDisplay.textContent = val > 0 ? `+${val}` : val;
                }
            } else {
                val = input.value;
            }
            
            state.adjustments[key] = val;
            cancelPresetAnimation();
            
            // Remove active preset highlight because we tweaked manual sliders
            if (state.activePreset !== 'custom') {
                clearPresetHighlights();
                state.activePreset = 'custom';
            }
            
            requestRender();
        };

        if (isRange) {
            input.addEventListener('input', updateValue);
            input.addEventListener('change', () => {
                saveHistoryState();
            });
            
            // Double-click a slider (or its label) to reset just that control
            const resetOne = () => {
                if (!state.originalImage) return;
                const defVal = SLIDER_DEFAULTS[key] !== undefined ? SLIDER_DEFAULTS[key] : 0;
                if (parseInt(input.value) === defVal) return;
                input.value = defVal;
                updateValue();
                saveHistoryState();
            };
            input.addEventListener('dblclick', resetOne);
            const label = sliderControl ? sliderControl.querySelector('label') : null;
            if (label) label.addEventListener('dblclick', resetOne);
        } else {
            // Text inputs, select elements, etc.
            input.addEventListener('input', updateValue);
            input.addEventListener('change', () => {
                saveHistoryState();
            });
        }
    });
}
// Preset Buttons Setup
function setupPresetButtons() {
    presetButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            const presetName = btn.dataset.preset;
            applyPreset(presetName);
        });
    });
}

// Hold-to-compare (button or the backslash key): shows the untouched preview while held
function startCompare() {
    if (!state.originalImage || state.isCropMode || state.isComparing) return;
    state.isComparing = true;
    btnCompare.classList.add('active');
    requestRender();
}

function stopCompare() {
    if (!state.isComparing) return;
    state.isComparing = false;
    btnCompare.classList.remove('active');
    requestRender();
}

// Toolbar Setup (Undo, Redo, Zoom, Download, Reset)
function setupToolbar() {
    btnUndo.addEventListener('click', undo);
    btnRedo.addEventListener('click', redo);
    
    btnZoomIn.addEventListener('click', () => adjustZoom(1.25));
    btnZoomOut.addEventListener('click', () => adjustZoom(1 / 1.25));
    btnZoomFit.addEventListener('click', toggleZoomFit);
    
    if (btnReset) {
        btnReset.addEventListener('click', resetAdjustments);
    }
    
    // Compare Button (Hold down to see original image)
    btnCompare.addEventListener('mousedown', startCompare);
    btnCompare.addEventListener('mouseup', stopCompare);
    btnCompare.addEventListener('mouseleave', stopCompare);
    
    // Touch support for Compare
    btnCompare.addEventListener('touchstart', (e) => {
        e.preventDefault();
        startCompare();
    });
    btnCompare.addEventListener('touchend', (e) => {
        e.preventDefault();
        stopCompare();
    });
    window.addEventListener('blur', stopCompare);

    btnDownload.addEventListener('click', downloadHighResImage);

    // Zoom & Pan Mouse Interaction inside canvas wrapper
    canvasWrapper.addEventListener('mousedown', startPanning);
    window.addEventListener('mousemove', panImage);
    window.addEventListener('mouseup', stopPanning);
    
    // Mouse wheel zoom (towards the cursor). Listening on the whole viewport so the area around the
    // image works too; trackpad pinch (ctrl+wheel) and mouse wheel both end up here.
    document.getElementById('viewport').addEventListener('wheel', (e) => {
        if (!state.originalImage) return;
        e.preventDefault();
        
        const delta = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY;
        const factor = Math.exp(-clamp(delta, -120, 120) * (e.ctrlKey ? 0.01 : 0.0015));
        adjustZoom(factor, e.clientX, e.clientY);
    }, { passive: false });
}

// Window resize adjust fit
function setupWindowEvents() {
    window.addEventListener('resize', () => {
        if (state.originalImage && state.isFit) {
            fitImageToViewport();
        }
    });

    // Keyboard Shortcuts
    window.addEventListener('keydown', (e) => {
        const mod = e.ctrlKey || e.metaKey;
        const key = (e.key || '').toLowerCase();
        const typing = isTypingTarget(e.target);
        
        // Modal dialogs: Escape closes them, everything else is left alone
        const openModal = Array.from(document.querySelectorAll('.modal-overlay'))
            .find(m => m.style.display !== 'none');
        if (openModal) {
            if (key === 'escape') {
                const closeBtn = openModal.querySelector('.modal-close, #btn-export-cancel');
                if (closeBtn) closeBtn.click();
            }
            return;
        }
        
        // Ctrl+O: open a photo (works before an image is loaded)
        if (mod && key === 'o') {
            e.preventDefault();
            fileInput.click();
            return;
        }
        
        if (!state.originalImage) return;
        
        // Crop mode: Enter applies, Escape cancels
        if (state.isCropMode && !typing) {
            if (key === 'enter') { e.preventDefault(); exitCropMode(true); return; }
            if (key === 'escape') { e.preventDefault(); exitCropMode(false); return; }
        }
        
        if (mod) {
            // While typing in a text field Ctrl+Z / Ctrl+Y belong to the field itself
            if (key === 'z' && !typing) {
                e.preventDefault();
                if (e.shiftKey) redo(); else undo();
            } else if (key === 'y' && !typing) {
                e.preventDefault();
                redo();
            } else if (key === 's') {
                e.preventDefault();
                downloadHighResImage();
            } else if (key === '0') {
                e.preventDefault();
                toggleZoomFit();
            } else if (key === '=' || key === '+') {
                e.preventDefault();
                adjustZoom(1.25);
            } else if (key === '-') {
                e.preventDefault();
                adjustZoom(1 / 1.25);
            }
            return;
        }
        
        if (typing || e.repeat) return;
        
        // Hold the backslash key to compare with the original
        if (e.key === '\\') {
            e.preventDefault();
            startCompare();
        }
    });
    
    window.addEventListener('keyup', (e) => {
        if (e.key === '\\') stopCompare();
    });
}

/* ==========================================
 * CORE IMAGE LOADING
 * ========================================== */

function isImageFile(file) {
    if (!file) return false;
    return (file.type && file.type.startsWith('image/')) || /\.(jpe?g|png|webp|gif|bmp|avif)$/i.test(file.name || '');
}

async function decodeImageFile(file) {
    // ImageBitmap decodes off the main thread and honours EXIF orientation
    if (typeof createImageBitmap === 'function') {
        try {
            return await createImageBitmap(file);
        } catch (e) {
            // fall through to <img> decoding
        }
    }
    const url = URL.createObjectURL(file);
    try {
        return await new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = () => resolve(img);
            img.onerror = () => reject(new Error('decode failed'));
            img.src = url;
        });
    } finally {
        // The decoded <img> keeps its own pixel data; the URL is no longer needed
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
}

let imageLoadToken = 0;

async function handleImageFile(file, fallbackName) {
    if (!isImageFile(file)) {
        showToast('請上傳有效的相片檔案！', 'error');
        return;
    }

    const token = ++imageLoadToken;
    showLoading(true);
    
    try {
        const img = await decodeImageFile(file);
        if (token !== imageLoadToken) return; // a newer load superseded this one
        if (!img.width || !img.height) throw new Error('empty image');
        
        const dot = file.name ? file.name.lastIndexOf('.') : -1;
        state.originalFileName = (dot > 0 ? file.name.substring(0, dot) : file.name) || fallbackName || 'edited-photo';
        state.originalFormat = file.type || 'image/png';
        setupImages(img);
    } catch (err) {
        if (token !== imageLoadToken) return;
        console.error(err);
        showLoading(false);
        showToast('載入圖片時出錯，檔案可能已損毀或格式不支援', 'error');
    }
}

function setupImages(img) {
    cancelPresetAnimation();
    
    // Release the previous source bitmap
    if (state.originalImage && state.originalImage !== img && typeof state.originalImage.close === 'function') {
        state.originalImage.close();
    }
    
    state.originalImage = img;
    state.width = img.width;
    state.height = img.height;
    
    // Reset Crop & Rotate transform system
    state.cropTransform = {
        crop: null,
        rotate: 0,
        straighten: 0,
        flipH: false,
        flipV: false
    };
    state.isCropMode = false;
    document.getElementById('crop-toolbar').style.display = 'none';
    document.getElementById('crop-overlay-container').style.display = 'none';
    document.getElementById('btn-crop-toggle').classList.remove('active');
    syncStraightenUI();
    document.getElementById('crop-aspect').value = 'free';
    
    // Reset Curves
    resetCurvesState();
    
    // Reset HSL
    resetHslState();
    
    // Reset preset intensity
    state.presetIntensity = 100;
    const inputIntensity = document.getElementById('input-preset-intensity');
    const intensityVal = document.getElementById('preset-intensity-val');
    if (inputIntensity) inputIntensity.value = 100;
    if (intensityVal) intensityVal.textContent = '100';
    
    // Reset all adjustments & frame
    resetAdjustmentsState();
    setActiveFrame('none');
    
    // Build the (down-scaled) preview canvas and everything cached from it
    state.isComparing = false;
    state.zoom = 100;
    state.pan = { x: 0, y: 0 };
    state.previewMaxDim = MAX_PREVIEW_DIMENSION;
    clearTimeout(state.detailTimer);
    rebuildPreview();
    
    // History setup
    state.history = [];
    state.historyIndex = -1;
    saveHistoryState(); // Store initial state (all sliders zero)
    
    // UI Transitions
    dropzone.classList.remove('active');
    editorContainer.style.display = 'flex';
    
    // Enable toolbar elements
    btnUndo.disabled = true;
    btnRedo.disabled = true;
    btnZoomIn.disabled = false;
    btnZoomOut.disabled = false;
    btnZoomFit.disabled = false;
    btnCompare.disabled = false;
    if (btnCropToggle) btnCropToggle.disabled = false;
    btnDownload.disabled = false;
    if (btnReset) btnReset.disabled = false;
    
    // Enable Auto-Enhance button
    const btnAutoEnhance = document.getElementById('btn-auto-enhance');
    if (btnAutoEnhance) btnAutoEnhance.disabled = false;
    
    // Adjust layout zoom (the editor container is visible now, so it has a real size)
    fitImageToViewport();
    
    showLoading(false);
    requestRender();
}

function resetCurvesState() {
    state.curves = {
        rgb: [{ x: 0, y: 0 }, { x: 255, y: 255 }],
        red: [{ x: 0, y: 0 }, { x: 255, y: 255 }],
        green: [{ x: 0, y: 0 }, { x: 255, y: 255 }],
        blue: [{ x: 0, y: 0 }, { x: 255, y: 255 }]
    };
    state.activeCurveChannel = 'rgb';
    state.selectedCurvePoint = -1;
    document.querySelectorAll('.curve-chan-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.channel === 'rgb');
    });
    recomputeAllCurveLUTs();
    drawCurveEditor();
}

function resetHslState() {
    state.hsl = {
        hue: { red: 0, orange: 0, yellow: 0, green: 0, aqua: 0, blue: 0, purple: 0, magenta: 0 },
        saturation: { red: 0, orange: 0, yellow: 0, green: 0, aqua: 0, blue: 0, purple: 0, magenta: 0 },
        luminance: { red: 0, orange: 0, yellow: 0, green: 0, aqua: 0, blue: 0, purple: 0, magenta: 0 }
    };
    state.activeHslTab = 'hue';
    document.querySelectorAll('.hsl-tab-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.tab === 'hue');
    });
    const hslList = document.querySelector('.hsl-sliders-list');
    if (hslList) hslList.dataset.activeTab = 'hue';
    updateHslSlidersUI();
}

function syncStraightenUI() {
    const slider = document.getElementById('input-straighten');
    const display = document.getElementById('straighten-val');
    const val = state.cropTransform.straighten;
    if (slider) slider.value = val;
    if (display) display.textContent = `${val > 0 ? '+' : ''}${val}°`;
}

/* ==========================================
 * PRESET AND ADJUSTMENT CONTROL
 * ========================================== */

function applyPreset(presetName) {
    const preset = getPresetDefinition(presetName);
    if (!state.originalImage || !preset) return;
    state.activePreset = presetName;
    
    // Highlight the active preset button
    clearPresetHighlights();
    const activeBtn = Array.from(getPresetButtons()).find(btn => btn.dataset.preset === presetName);
    if (activeBtn) activeBtn.classList.add('active');
    
    // Reset intensity slider to 100
    const inputIntensity = document.getElementById('input-preset-intensity');
    const valDisplay = document.getElementById('preset-intensity-val');
    if (inputIntensity && valDisplay) {
        inputIntensity.value = 100;
        valDisplay.textContent = "100";
        state.presetIntensity = 100;
    }
    
    // Smoothly animate sliders to preset values for premium UX feel
    animateSlidersTo(preset);
}

function clearPresetHighlights() {
    getPresetButtons().forEach(btn => btn.classList.remove('active'));
}
function resetAdjustmentsState() {
    state.adjustments = {
        exposure: 0,
        contrast: 0,
        temperature: 0,
        tint: 0,
        saturation: 0,
        highlights: 0,
        shadows: 0,
        whites: 0,
        blacks: 0,
        vibrance: 0,
        clarity: 0,
        dehaze: 0,
        sharpening: 0,
        noiseReduction: 0,
        vignette: 0,
        grain: 0,

        // Split Toning
        splitHighlightHue: 0,
        splitHighlightSat: 0,
        splitShadowHue: 0,
        splitShadowSat: 0,
        splitBalance: 0,

        // Watermark
        watermarkText: '',
        watermarkSize: 50,
        watermarkOpacity: 50,
        watermarkColor: '#ffffff',
        watermarkPosition: 'bottom-right'
    };
    state.activePreset = 'original';
    
    // Reset Slider GUI
    Object.keys(inputs).forEach(key => {
        const input = inputs[key];
        if (!input) return;
        setSliderUI(key, state.adjustments[key]);
    });
    
    clearPresetHighlights();
    const origBtn = Array.from(getPresetButtons()).find(btn => btn.dataset.preset === 'original');
    if (origBtn) origBtn.classList.add('active');
}
function resetAdjustments() {
    if (!state.originalImage) return;
    
    cancelPresetAnimation();
    // "Reset all": sliders, curves, HSL mixer and frame (crop / rotation is kept, it has its own cancel)
    resetAdjustmentsState();
    resetCurvesState();
    resetHslState();
    setActiveFrame('none');
    saveHistoryState();
    requestRender();
}

/* ==========================================
 * RENDERING ENGINE (PIXEL MANIPULATION)
 * ========================================== */

function requestRender() {
    if (state.renderPending) return;
    
    state.renderPending = true;
    requestAnimationFrame(() => {
        render();
        state.renderPending = false;
    });
}

function render() {
    if (!state.originalImage || !state.previewImageData) return;
    
    // If comparing mode, render original preview image directly
    if (state.isComparing) {
        state.editorCtx.putImageData(state.previewImageData, 0, 0);
        drawHistogram(state.previewImageData);
        return;
    }
    
    const w = state.previewWidth;
    const h = state.previewHeight;
    
    // Reuse the output buffer between frames (avoids allocating several MB per slider tick)
    if (!state.outputImageData || state.outputImageData.width !== w || state.outputImageData.height !== h) {
        state.outputImageData = state.editorCtx.createImageData(w, h);
    }
    const outputImageData = state.outputImageData;
    
    // Pre-blurred data is only needed for sharpening / noise reduction. It depends only on the
    // preview image, so it is computed once and cached until the preview changes.
    const blurredData = (state.adjustments.sharpening > 0 || state.adjustments.noiseReduction > 0)
        ? getBlurredPreview()
        : null;
    
    // Apply adjustment filter pipeline
    applyFilterPipeline(
        state.previewImageData, 
        outputImageData, 
        state.adjustments,
        blurredData
    );
    
    // Draw onto displayed canvas
    state.editorCtx.putImageData(outputImageData, 0, 0);
    
    // Draw watermark if configured
    if (state.adjustments.watermarkText) {
        drawWatermark(state.editorCtx, w, h, state.adjustments);
    }
    
    // Draw artistic frame if configured
    if (state.activeFrame && state.activeFrame !== 'none') {
        drawFrame(state.editorCtx, w, h, state.activeFrame);
    }
    
    // Update live histogram
    drawHistogram(outputImageData);
}

// Blur used as the low-pass reference for sharpening / noise reduction.
function getBlurData(sourceCanvas, radius) {
    const w = sourceCanvas.width;
    const h = sourceCanvas.height;
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = w;
    tempCanvas.height = h;
    const tempCtx = tempCanvas.getContext('2d', { willReadFrequently: true });
    tempCtx.filter = `blur(${radius}px)`;
    tempCtx.drawImage(sourceCanvas, 0, 0);
    return tempCtx.getImageData(0, 0, w, h).data;
}

function getBlurredPreview() {
    if (!state.blurCache) {
        state.blurCache = getBlurData(state.previewCanvas, getBlurRadius(Math.max(state.previewWidth, state.previewHeight)));
    }
    return state.blurCache;
}

function drawFrame(ctx, w, h, frameType) {
    if (!frameType || frameType === 'none') return;
    
    ctx.save();
    
    if (frameType === 'classic-white') {
        const borderWidth = Math.max(12, Math.round(w * 0.04));
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, w, borderWidth);
        ctx.fillRect(0, h - borderWidth, w, borderWidth);
        ctx.fillRect(0, 0, borderWidth, h);
        ctx.fillRect(w - borderWidth, 0, borderWidth, h);
        
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.15)';
        ctx.lineWidth = 1;
        ctx.strokeRect(borderWidth + 2, borderWidth + 2, w - 2 * borderWidth - 4, h - 2 * borderWidth - 4);
        
    } else if (frameType === 'polaroid') {
        const paddingSides = Math.max(10, Math.round(w * 0.03));
        const paddingTop = Math.max(10, Math.round(h * 0.03));
        const paddingBottom = Math.max(35, Math.round(h * 0.12));
        
        ctx.fillStyle = '#faf9f6';
        ctx.fillRect(0, 0, w, paddingTop);
        ctx.fillRect(0, h - paddingBottom, w, paddingBottom);
        ctx.fillRect(0, 0, paddingSides, h);
        ctx.fillRect(w - paddingSides, 0, paddingSides, h);
        
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.12)';
        ctx.lineWidth = 1;
        ctx.strokeRect(paddingSides, paddingTop, w - 2 * paddingSides, h - paddingTop - paddingBottom);
        
    } else if (frameType === 'midnight-slate') {
        const borderWidth = Math.max(8, Math.round(w * 0.025));
        ctx.fillStyle = '#1e293b';
        ctx.fillRect(0, 0, w, borderWidth);
        ctx.fillRect(0, h - borderWidth, w, borderWidth);
        ctx.fillRect(0, 0, borderWidth, h);
        ctx.fillRect(w - borderWidth, 0, borderWidth, h);
        
        ctx.strokeStyle = '#38bdf8';
        ctx.lineWidth = 1.5;
        ctx.strokeRect(borderWidth - 3, borderWidth - 3, w - 2 * borderWidth + 6, h - 2 * borderWidth + 6);
        
    } else if (frameType === 'neon-glow') {
        const borderWidth = Math.max(6, Math.round(w * 0.015));
        ctx.fillStyle = '#090b0e';
        ctx.fillRect(0, 0, w, borderWidth);
        ctx.fillRect(0, h - borderWidth, w, borderWidth);
        ctx.fillRect(0, 0, borderWidth, h);
        ctx.fillRect(w - borderWidth, 0, borderWidth, h);
        
        const gradient = ctx.createLinearGradient(0, 0, w, h);
        gradient.addColorStop(0, '#d946ef');
        gradient.addColorStop(1, '#06b6d4');
        
        ctx.strokeStyle = gradient;
        ctx.lineWidth = 3;
        ctx.strokeRect(borderWidth / 2, borderWidth / 2, w - borderWidth, h - borderWidth);
        
        ctx.shadowColor = '#06b6d4';
        ctx.shadowBlur = 10;
        ctx.strokeStyle = 'rgba(6, 182, 212, 0.5)';
        ctx.strokeRect(borderWidth + 1, borderWidth + 1, w - 2 * borderWidth - 2, h - 2 * borderWidth - 2);
    }
    
    ctx.restore();
}

function applyFilterPipelineWasm(srcImageData, dstImageData, adj, blurred = null) {
    if (!wasmExports) return;
    
    const w = srcImageData.width;
    const h = srcImageData.height;
    const len = srcImageData.data.length;
    
    // Every allocation is released in `finally`, even if the module traps part-way through
    const allocations = [];
    const allocate = (size) => {
        const ptr = wasmExports.alloc(size);
        allocations.push([ptr, size]);
        return ptr;
    };
    
    try {
        const srcPtr = allocate(len);
        new Uint8Array(wasmExports.memory.buffer, srcPtr, len).set(srcImageData.data);
        
        const dstPtr = allocate(len);
        
        let blurredPtr = 0;
        if (blurred) {
            blurredPtr = allocate(len);
            new Uint8Array(wasmExports.memory.buffer, blurredPtr, len).set(blurred);
        }
        
        const curvesBuffer = new Uint8Array(1024);
        curvesBuffer.set(state.curveLUTs.rgb, 0);
        curvesBuffer.set(state.curveLUTs.red, 256);
        curvesBuffer.set(state.curveLUTs.green, 512);
        curvesBuffer.set(state.curveLUTs.blue, 768);
        
        const curvesPtr = allocate(1024);
        new Uint8Array(wasmExports.memory.buffer, curvesPtr, 1024).set(curvesBuffer);
        
        let hasCurves = 0;
        for (let j = 0; j < 1024; j++) {
            if (curvesBuffer[j] !== (j % 256)) {
                hasCurves = 1;
                break;
            }
        }
        
        const hslBuffer = new Float32Array(24);
        const hslChannels = ['red', 'orange', 'yellow', 'green', 'aqua', 'blue', 'purple', 'magenta'];
        let hasHsl = 0;
        
        hslChannels.forEach((chan, idx) => {
            hslBuffer[idx] = state.hsl.hue[chan];
            hslBuffer[8 + idx] = state.hsl.saturation[chan];
            hslBuffer[16 + idx] = state.hsl.luminance[chan];
            
            if (state.hsl.hue[chan] !== 0 || state.hsl.saturation[chan] !== 0 || state.hsl.luminance[chan] !== 0) {
                hasHsl = 1;
            }
        });
        
        const hslPtr = allocate(24 * 4);
        new Float32Array(wasmExports.memory.buffer, hslPtr, 24).set(hslBuffer);
        
        const p = computePipelineParams(adj);
        
        wasmExports.process_pixels(
            srcPtr,
            dstPtr,
            len,
            w,
            h,
            adj.exposure,
            adj.contrast,
            p.tRed, p.tGreen, p.tBlue,
            p.tintRed, p.tintGreen, p.tintBlue,
            p.satFactor,
            p.hFactor, p.sFactor, p.wFactor, p.bFactor,
            p.vibFactor, p.clarityFactor, p.dhFactor,
            p.sharpFactor, p.nrFactor, p.vigFactor, p.grainFactor,
            p.hR, p.hG, p.hB,
            p.sR, p.sG, p.sB,
            p.hasSplitToning ? 1 : 0,
            p.balanceFactor,
            hasCurves,
            curvesPtr,
            hasHsl,
            hslPtr,
            blurredPtr
        );
        
        dstImageData.data.set(new Uint8Array(wasmExports.memory.buffer, dstPtr, len));
    } finally {
        allocations.forEach(([ptr, size]) => wasmExports.dealloc(ptr, size));
    }
}

// Slider values -> per-pixel factors (shared by the Wasm and JS engines so they cannot drift apart)
function computePipelineParams(adj) {
    const tRed = adj.temperature > 0 ? adj.temperature * 0.5 : adj.temperature * 0.2;
    const tBlue = adj.temperature > 0 ? -adj.temperature * 0.5 : -adj.temperature * 0.75;
    const tGreen = adj.temperature * 0.08;
    
    let hR = 0, hG = 0, hB = 0;
    if (adj.splitHighlightSat > 0) {
        const [rTemp, gTemp, bTemp] = hslToRgb(adj.splitHighlightHue, adj.splitHighlightSat / 100, 0.5);
        hR = (rTemp - 128) * 0.5;
        hG = (gTemp - 128) * 0.5;
        hB = (bTemp - 128) * 0.5;
    }
    
    let sR = 0, sG = 0, sB = 0;
    if (adj.splitShadowSat > 0) {
        const [rTemp, gTemp, bTemp] = hslToRgb(adj.splitShadowHue, adj.splitShadowSat / 100, 0.5);
        sR = (rTemp - 128) * 0.5;
        sG = (gTemp - 128) * 0.5;
        sB = (bTemp - 128) * 0.5;
    }
    
    return {
        tRed, tGreen, tBlue,
        tintRed: adj.tint * 0.25,
        tintGreen: -adj.tint * 0.35,
        tintBlue: adj.tint * 0.25,
        satFactor: (adj.saturation + 100) / 100,
        hFactor: adj.highlights * 0.35,
        sFactor: adj.shadows * 0.35,
        wFactor: adj.whites * 0.25,
        bFactor: adj.blacks * 0.25,
        vibFactor: adj.vibrance * 0.01,
        clarityFactor: adj.clarity * 0.01,
        dhFactor: adj.dehaze * 0.01,
        sharpFactor: adj.sharpening * 0.01 * 1.5,
        nrFactor: adj.noiseReduction * 0.01 * 0.8,
        vigFactor: adj.vignette * 0.01,
        grainFactor: adj.grain * 0.01,
        hR, hG, hB, sR, sG, sB,
        hasSplitToning: (adj.splitHighlightSat > 0 || adj.splitShadowSat > 0),
        balanceFactor: adj.splitBalance * 0.01
    };
}

// Deterministic per-pixel noise in [-0.5, 0.5). Must match grain_noise() in src-rust/src/lib.rs.
function grainNoise(px) {
    let h = Math.imul(px, 0x9E3779B1);
    h ^= h >>> 15;
    h = Math.imul(h, 0x85EBCA77);
    h ^= h >>> 13;
    h = Math.imul(h, 0xC2B2AE3D);
    h ^= h >>> 16;
    return (h >>> 8) / 16777216 - 0.5;
}

function applyFilterPipeline(srcData, dstData, adj, blurred = null) {
    if (wasmExports) {
        try {
            applyFilterPipelineWasm(srcData, dstData, adj, blurred);
            return;
        } catch (err) {
            // e.g. out of Wasm memory on a very large export: continue with the JS engine
            console.error("Wasm engine failed, falling back to JS engine:", err);
            wasmFailures++;
            if (wasmFailures >= 3) wasmExports = null;
        }
    }
    applyFilterPipelineJS(srcData, dstData, adj, blurred);
}

/**
 * Optimized Pixel Filter Pipeline (JS Fallback)
 */
function applyFilterPipelineJS(srcData, dstData, adj, blurred = null) {
    const src = srcData.data;
    const dst = dstData.data;
    const len = src.length;
    
    // Preview dimensions and center for vignette
    const previewW = srcData.width;
    const previewH = srcData.height;
    const cx = previewW / 2;
    const cy = previewH / 2;
    const maxDistSq = cx * cx + cy * cy;
    
    // 1. Exposure precomputation
    const expFactor = Math.pow(2, adj.exposure / 50); // Scale channels
    
    // 2. Contrast precomputation
    const contrastFactor = (259 * (adj.contrast + 255)) / (255 * (259 - adj.contrast));
    
    // 3. Everything else (temperature, tint, tone, presence, effects, split toning)
    const {
        tRed, tGreen, tBlue, tintRed, tintGreen, tintBlue, satFactor,
        hFactor, sFactor, wFactor, bFactor,
        vibFactor, clarityFactor, dhFactor,
        sharpFactor, nrFactor, vigFactor, grainFactor,
        hR, hG, hB, sR, sG, sB, hasSplitToning, balanceFactor
    } = computePipelineParams(adj);

    // Precheck: Are curves active?
    const curveRgb = state.curveLUTs.rgb;
    const curveRed = state.curveLUTs.red;
    const curveGreen = state.curveLUTs.green;
    const curveBlue = state.curveLUTs.blue;
    let hasCurves = false;
    for (const ch of ['rgb', 'red', 'green', 'blue']) {
        const lut = state.curveLUTs[ch];
        for (let j = 0; j < 256; j++) {
            if (lut[j] !== j) {
                hasCurves = true;
                break;
            }
        }
        if (hasCurves) break;
    }
    
    // Precheck: Are HSL mixer adjustments active?
    let hasHsl = false;
    const hslChannels = ['red', 'orange', 'yellow', 'green', 'aqua', 'blue', 'purple', 'magenta'];
    for (const tab of ['hue', 'saturation', 'luminance']) {
        for (const chan of hslChannels) {
            if (state.hsl[tab][chan] !== 0) {
                hasHsl = true;
                break;
            }
        }
        if (hasHsl) break;
    }
    
    for (let i = 0; i < len; i += 4) {
        let r = src[i];
        let g = src[i+1];
        let b = src[i+2];
        const a = src[i+3];
        
        // --- 0. SHARPENING & NOISE REDUCTION ---
        if (blurred) {
            const br = blurred[i];
            const bg = blurred[i+1];
            const bb = blurred[i+2];
            
            // Sharpening
            if (adj.sharpening > 0) {
                r += (r - br) * sharpFactor;
                g += (g - bg) * sharpFactor;
                b += (b - bb) * sharpFactor;
            }
            // Noise Reduction
            if (adj.noiseReduction > 0) {
                r += (br - r) * nrFactor;
                g += (bg - g) * nrFactor;
                b += (bb - b) * nrFactor;
            }
        }
        
        // --- 1. EXPOSURE ---
        r = r * expFactor;
        g = g * expFactor;
        b = b * expFactor;
        
        // --- 2. TEMPERATURE & TINT ---
        r += tRed + tintRed;
        g += tGreen + tintGreen;
        b += tBlue + tintBlue;
        
        // --- 3. LUMINANCE & TONE CONTROLS (Highlights, Shadows, Whites, Blacks) ---
        let y = (0.2126 * r + 0.7152 * g + 0.0722 * b);
        let yNorm = y / 255;
        if (yNorm > 1) yNorm = 1; else if (yNorm < 0) yNorm = 0;
        
        const mShadow = (1 - yNorm) * (1 - yNorm);
        const mHighlight = yNorm * yNorm;
        
        const toneShift = (sFactor * mShadow) + (hFactor * mHighlight) + (wFactor * yNorm) + (bFactor * (1 - yNorm));
        r += toneShift;
        g += toneShift;
        b += toneShift;
        
        // --- 4. CLARITY ---
        if (adj.clarity !== 0) {
            // Midtone S-curve contrast boost
            const sCurve = (v) => {
                const vn = v < 0 ? 0 : (v > 255 ? 1 : v / 255);
                return (3 * vn * vn - 2 * vn * vn * vn) * 255;
            };
            if (clarityFactor > 0) {
                r += (sCurve(r) - r) * clarityFactor;
                g += (sCurve(g) - g) * clarityFactor;
                b += (sCurve(b) - b) * clarityFactor;
            } else {
                r += (r - sCurve(r)) * clarityFactor;
                g += (g - sCurve(g)) * clarityFactor;
                b += (b - sCurve(b)) * clarityFactor;
            }
        }
        
        // --- 5. DEHAZE ---
        if (adj.dehaze !== 0) {
            const yL = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
            const blackPull = -25 * dhFactor * (1 - (yL > 1 ? 1 : (yL < 0 ? 0 : yL)));
            r += blackPull; g += blackPull; b += blackPull;
            
            const dhContrast = 1 + dhFactor * 0.25;
            r = dhContrast * (r - 128) + 128;
            g = dhContrast * (g - 128) + 128;
            b = dhContrast * (b - 128) + 128;
        }
        
        // --- 6. CONTRAST ---
        r = contrastFactor * (r - 128) + 128;
        g = contrastFactor * (g - 128) + 128;
        b = contrastFactor * (b - 128) + 128;
        
        // --- 7. VIBRANCE ---
        if (adj.vibrance !== 0) {
            const rn = r < 0 ? 0 : (r > 255 ? 255 : r);
            const gn = g < 0 ? 0 : (g > 255 ? 255 : g);
            const bn = b < 0 ? 0 : (b > 255 ? 255 : b);
            const max = Math.max(rn, gn, bn) / 255;
            const min = Math.min(rn, gn, bn) / 255;
            const sat = (max - min) / (max + 1e-5);
            const vFactor = vibFactor * (1 - sat) * 1.5;
            
            const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
            r += (r - lum) * vFactor;
            g += (g - lum) * vFactor;
            b += (b - lum) * vFactor;
        }
        
        // --- 8. SATURATION ---
        const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
        r = luminance + (r - luminance) * satFactor;
        g = luminance + (g - luminance) * satFactor;
        b = luminance + (b - luminance) * satFactor;
        
        // --- 9. HSL COLOR MIXER ---
        if (hasHsl) {
            let rc = r < 0 ? 0 : (r > 255 ? 255 : r);
            let gc = g < 0 ? 0 : (g > 255 ? 255 : g);
            let bc = b < 0 ? 0 : (b > 255 ? 255 : b);
            
            let [h, s, l] = rgbToHsl(rc, gc, bc);
            const w = getHslWeights(h);
            
            const dH = (w.red * state.hsl.hue.red + w.orange * state.hsl.hue.orange + w.yellow * state.hsl.hue.yellow +
                        w.green * state.hsl.hue.green + w.aqua * state.hsl.hue.aqua + w.blue * state.hsl.hue.blue +
                        w.purple * state.hsl.hue.purple + w.magenta * state.hsl.hue.magenta) * 0.3;
            
            const dS = (w.red * state.hsl.saturation.red + w.orange * state.hsl.saturation.orange + w.yellow * state.hsl.saturation.yellow +
                        w.green * state.hsl.saturation.green + w.aqua * state.hsl.saturation.aqua + w.blue * state.hsl.saturation.blue +
                        w.purple * state.hsl.saturation.purple + w.magenta * state.hsl.saturation.magenta) * 0.01;
            
            const dL = (w.red * state.hsl.luminance.red + w.orange * state.hsl.luminance.orange + w.yellow * state.hsl.luminance.yellow +
                        w.green * state.hsl.luminance.green + w.aqua * state.hsl.luminance.aqua + w.blue * state.hsl.luminance.blue +
                        w.purple * state.hsl.luminance.purple + w.magenta * state.hsl.luminance.magenta) * 0.01;
            
            h = (h + dH + 360) % 360;
            
            if (dS < 0) s = s * (1 + dS);
            else s = s + (1 - s) * dS;
            
            if (dL < 0) l = l * (1 + dL);
            else l = l + (1 - l) * dL;
            
            const [ro, go, bo] = hslToRgb(h, s, l);
            r = ro; g = go; b = bo;
        }
        
        // --- 10. TONE CURVES ---
        if (hasCurves) {
            let rc = r < 0 ? 0 : (r > 255 ? 255 : r);
            let gc = g < 0 ? 0 : (g > 255 ? 255 : g);
            let bc = b < 0 ? 0 : (b > 255 ? 255 : b);
            
            r = curveRed[rc | 0];
            g = curveGreen[gc | 0];
            b = curveBlue[bc | 0];
            
            r = curveRgb[r];
            g = curveRgb[g];
            b = curveRgb[b];
        }
        
        // --- 10.5. SPLIT TONING ---
        if (hasSplitToning) {
            const yL = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
            const wHigh = Math.max(0, Math.min(1, (yL - 0.5 - balanceFactor * 0.4) * 2 + 0.5));
            const wShadow = 1 - wHigh;
            r += hR * wHigh + sR * wShadow;
            g += hG * wHigh + sG * wShadow;
            b += hB * wHigh + sB * wShadow;
        }
        
        // --- 11. VIGNETTE ---
        if (adj.vignette !== 0) {
            const idx = i / 4;
            const pxX = idx % previewW;
            const pxY = Math.floor(idx / previewW);
            
            const dx = pxX - cx;
            const dy = pxY - cy;
            const distSq = dx * dx + dy * dy;
            const rNorm = distSq / maxDistSq;
            
            const blend = rNorm * (2 - rNorm);
            if (vigFactor < 0) {
                const vAmt = 1 + vigFactor * blend;
                r *= vAmt; g *= vAmt; b *= vAmt;
            } else {
                const vAmt = vigFactor * blend;
                r = r + (255 - r) * vAmt;
                g = g + (255 - g) * vAmt;
                b = b + (255 - b) * vAmt;
            }
        }
        
        // --- 12. FILM GRAIN ---
        if (adj.grain > 0) {
            const noise = grainNoise(i >> 2) * grainFactor * 0.12 * 255;
            r += noise; g += noise; b += noise;
        }
        
        // --- 13. CLAMPING & WRITING ---
        dst[i]   = r < 0 ? 0 : (r > 255 ? 255 : r);
        dst[i+1] = g < 0 ? 0 : (g > 255 ? 255 : g);
        dst[i+2] = b < 0 ? 0 : (b > 255 ? 255 : b);
        dst[i+3] = a;
    }
}

/* ==========================================
 * ZOOM & PAN SYSTEM
 * ========================================== */

function getTrueZoom() {
    if (!state.originalImage || !state.previewWidth) return state.zoom;
    return state.zoom * state.previewWidth / getFinalSize().w;
}

// Blur radius used for sharpening / noise reduction. 1.5px at the 1200px reference size, scaled with the
// canvas so the effect looks the same in the preview, the zoomed-in detail preview and the export.
function getBlurRadius(canvasMaxSide) {
    const fullSize = getFinalSize();
    const reference = Math.min(Math.max(fullSize.w, fullSize.h), MAX_PREVIEW_DIMENSION);
    return Math.max(0.5, 1.5 * canvasMaxSide / reference);
}

// While zoomed in, the preview is re-rendered at a higher resolution so detail stays sharp.
// Hysteresis avoids flip-flopping; the on-screen size is kept constant by rescaling `zoom`.
function scheduleDetailUpdate() {
    clearTimeout(state.detailTimer);
    state.detailTimer = setTimeout(updatePreviewDetail, 220);
}

function updatePreviewDetail() {
    if (!state.originalImage || state.isCropMode || state.isComparing) return;
    const fullSize = getFinalSize();
    const fullMax = Math.max(fullSize.w, fullSize.h);
    const displayedMax = Math.max(state.previewWidth, state.previewHeight) * state.zoom / 100;
    const wanted = clamp(Math.ceil(displayedMax * (window.devicePixelRatio || 1)),
        MAX_PREVIEW_DIMENSION, Math.min(fullMax, MAX_DETAIL_DIMENSION));
    const current = state.previewMaxDim;
    if (!(wanted > current * 1.25 || wanted < current / 1.5)) return;
    if (wanted === current) return;
    
    const oldWidth = state.previewWidth;
    state.previewMaxDim = wanted;
    rebuildPreview();
    state.zoom *= oldWidth / state.previewWidth;
    // Swap without the CSS transition so the (visually identical) change does not animate
    canvasWrapper.style.transition = 'none';
    updateCanvasTransform();
    void canvasWrapper.offsetWidth;
    canvasWrapper.style.transition = '';
    render(); // paint the new resolution immediately instead of one frame later
}

function updateCanvasTransform() {
    canvasWrapper.style.transform = `translate(${state.pan.x}px, ${state.pan.y}px) scale(${state.zoom / 100})`;
    // The label shows the scale relative to the real image, not to the (down-scaled) preview
    zoomDisplay.textContent = `${Math.round(getTrueZoom())}%`;
    
    if (state.zoom > 100 || !state.isFit) {
        canvasWrapper.classList.add('grab-mode');
    } else {
        canvasWrapper.classList.remove('grab-mode');
    }
}

// Zoom around a point (defaults to the viewport centre) so the pixel under the cursor stays put
function zoomTo(newZoom, clientX, clientY) {
    if (!state.originalImage) return;
    newZoom = clamp(newZoom, MIN_ZOOM, MAX_ZOOM);
    const oldZoom = state.zoom;
    if (Math.abs(newZoom - oldZoom) < 0.01) return;
    
    const rect = editorContainer.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    const ax = (clientX !== undefined ? clientX : centerX) - centerX;
    const ay = (clientY !== undefined ? clientY : centerY) - centerY;
    const ratio = newZoom / oldZoom;
    
    state.pan.x = ax - ratio * (ax - state.pan.x);
    state.pan.y = ay - ratio * (ay - state.pan.y);
    state.zoom = newZoom;
    state.isFit = false;
    
    updateCanvasTransform();
    scheduleDetailUpdate();
}

// Multiplicative zoom step (each click/keypress changes the size by the same visual amount)
function adjustZoom(factor, clientX, clientY) {
    zoomTo(state.zoom * factor, clientX, clientY);
}

function toggleZoomFit() {
    if (!state.originalImage) return;
    
    if (state.isFit) {
        // True 100% (one screen pixel per image pixel); the detail preview follows once it settles
        state.isFit = false;
        state.zoom = 100 * getFinalSize().w / state.previewWidth;
        state.pan = { x: 0, y: 0 };
        updateCanvasTransform();
        scheduleDetailUpdate();
    } else {
        fitImageToViewport();
    }
}

function fitImageToViewport() {
    if (!state.previewWidth || !state.previewHeight) return;
    const viewport = document.getElementById('viewport');
    const vw = viewport.clientWidth - 80;
    const vh = viewport.clientHeight - 80;
    if (vw <= 0 || vh <= 0) return; // viewport hidden / not laid out yet
    
    // Fitting needs no extra detail: go back to the base preview resolution
    if (state.previewMaxDim !== MAX_PREVIEW_DIMENSION && !state.isCropMode) {
        clearTimeout(state.detailTimer);
        state.previewMaxDim = MAX_PREVIEW_DIMENSION;
        rebuildPreview();
    }
    
    const wRatio = vw / state.previewWidth;
    const hRatio = vh / state.previewHeight;
    const fitRatio = Math.min(wRatio, hRatio, 1.0);
    
    state.zoom = Math.max(MIN_ZOOM, fitRatio * 100);
    state.isFit = true;
    state.pan = { x: 0, y: 0 };
    updateCanvasTransform();
}

// Pan interactions
function startPanning(e) {
    if (!state.originalImage || e.button !== 0) return;
    
    state.isPanning = true;
    canvasWrapper.classList.remove('grab-mode');
    canvasWrapper.classList.add('grabbing-mode');
    
    state.panStart = {
        x: e.clientX - state.pan.x,
        y: e.clientY - state.pan.y
    };
}

function panImage(e) {
    if (!state.isPanning) return;
    
    state.pan.x = e.clientX - state.panStart.x;
    state.pan.y = e.clientY - state.panStart.y;
    
    state.isFit = false;
    updateCanvasTransform();
}

function stopPanning() {
    if (!state.isPanning) return;
    state.isPanning = false;
    canvasWrapper.classList.remove('grabbing-mode');
    if (state.zoom > 100 || !state.isFit) {
        canvasWrapper.classList.add('grab-mode');
    }
}

/* ==========================================
 * HISTORY SYSTEM (UNDO / REDO)
 * ========================================== */

function saveHistoryState() {
    if (!state.originalImage) return;
    if (state.historyIndex < state.history.length - 1) {
        state.history = state.history.slice(0, state.historyIndex + 1);
    }
    
    // Save complete snapshot of all Lightroom controls
    const snapshot = {
        adjustments: { ...state.adjustments },
        curves: state.curves,
        hsl: state.hsl,
        cropTransform: state.cropTransform,
        activeFrame: state.activeFrame
    };
    
    const currentSnapshotStr = JSON.stringify(snapshot);
    
    if (state.history.length > 0 && state.history[state.history.length - 1] === currentSnapshotStr) {
        return;
    }
    
    state.history.push(currentSnapshotStr);
    
    if (state.history.length > state.maxHistory) {
        state.history.shift();
    }
    
    state.historyIndex = state.history.length - 1;
    updateHistoryButtons();
}

function undo() {
    if (state.isCropMode) return;
    cancelPresetAnimation();
    if (state.historyIndex > 0) {
        state.historyIndex--;
        restoreHistoryState();
    }
}

function redo() {
    if (state.isCropMode) return;
    cancelPresetAnimation();
    if (state.historyIndex < state.history.length - 1) {
        state.historyIndex++;
        restoreHistoryState();
    }
}

// Finds the preset whose values equal the current adjustments (every preset key is compared)
function findMatchingPreset(adj) {
    const matches = (preset) => PRESET_KEYS.every(key => (preset[key] || 0) === (Number(adj[key]) || 0));
    let found = null;
    Object.keys(PRESETS).forEach(name => {
        if (matches(PRESETS[name]) && (found === null || found === 'original')) found = name;
    });
    if (found === null) {
        Object.keys(state.customPresets).forEach(name => {
            if (found === null && matches(state.customPresets[name])) found = `my:${name}`;
        });
    }
    return found;
}

function restoreHistoryState() {
    const snapshot = JSON.parse(state.history[state.historyIndex]);
    const previousCrop = JSON.stringify(state.cropTransform);
    
    state.adjustments = snapshot.adjustments;
    state.curves = snapshot.curves;
    state.hsl = snapshot.hsl;
    state.cropTransform = snapshot.cropTransform;

    // Update inputs visual values
    Object.keys(state.adjustments).forEach(key => setSliderUI(key, state.adjustments[key]));
    
    // Frame
    setActiveFrame(snapshot.activeFrame || 'none');
    
    // Update HSL sliders visual values
    updateHslSlidersUI();
    
    // Recompute Curve LUTs and redraw curve editor
    recomputeAllCurveLUTs();
    drawCurveEditor();
    
    // Rebuild the preview only when the crop / rotation actually changed
    syncStraightenUI();
    if (JSON.stringify(state.cropTransform) !== previousCrop) {
        updateCroppedPreview();
    } else {
        requestRender();
    }
    
    // Check if it matches any presets to highlight buttons.
    // Only meaningful while the advanced elements are at their default state.
    let isHslDefault = true;
    for (const tab of ['hue', 'saturation', 'luminance']) {
        for (const chan in state.hsl[tab]) {
            if (state.hsl[tab][chan] !== 0) isHslDefault = false;
        }
    }
    
    let isCurvesDefault = true;
    for (const ch of ['rgb', 'red', 'green', 'blue']) {
        const points = state.curves[ch];
        if (points.length !== 2 || points[0].x !== 0 || points[0].y !== 0 || points[1].x !== 255 || points[1].y !== 255) {
            isCurvesDefault = false;
        }
    }
    
    let matchedPreset = 'custom';
    if (isHslDefault && isCurvesDefault) {
        matchedPreset = findMatchingPreset(state.adjustments) || 'custom';
    }
    
    state.activePreset = matchedPreset;
    clearPresetHighlights();
    const activeBtn = Array.from(getPresetButtons()).find(btn => btn.dataset.preset === matchedPreset);
    if (activeBtn) activeBtn.classList.add('active');
    
    updateHistoryButtons();
}

function updateHistoryButtons() {
    btnUndo.disabled = state.historyIndex <= 0;
    btnRedo.disabled = state.historyIndex >= state.history.length - 1;
}

/* ==========================================
 * HIGH RESOLUTION IMAGE EXPORT
 * ========================================== */

const EXPORT_FORMATS = {
    'image/jpeg': { ext: 'jpg', label: 'JPEG', lossy: true },
    'image/png': { ext: 'png', label: 'PNG', lossy: false },
    'image/webp': { ext: 'webp', label: 'WebP', lossy: true }
};
const EXPORT_SETTINGS_KEY = 'pep_export_settings';

// Formats the canvas can encode; anything else (gif, bmp, avif, ...) falls back to a sensible one
function normalizeExportFormat(type) {
    if (EXPORT_FORMATS[type]) return type;
    return (type === 'image/gif' || type === 'image/svg+xml') ? 'image/png' : 'image/jpeg';
}

function loadExportSettings() {
    const defaults = { format: null, quality: 92, scale: 1 };
    try {
        const saved = JSON.parse(safeStorageGet(EXPORT_SETTINGS_KEY) || '{}');
        return {
            format: EXPORT_FORMATS[saved.format] ? saved.format : defaults.format,
            quality: clamp(Number(saved.quality) || defaults.quality, 50, 100),
            scale: [1, 0.75, 0.5, 0.25].includes(Number(saved.scale)) ? Number(saved.scale) : defaults.scale
        };
    } catch (e) {
        return defaults;
    }
}

function getFinalSize() {
    const t = state.cropTransform;
    const swapped = t.rotate === 90 || t.rotate === 270;
    const tw = swapped ? state.originalImage.height : state.originalImage.width;
    const th = swapped ? state.originalImage.width : state.originalImage.height;
    const crop = (!state.isCropMode && t.crop) ? t.crop : { x: 0, y: 0, w: 1, h: 1 };
    return { w: Math.max(1, Math.round(crop.w * tw)), h: Math.max(1, Math.round(crop.h * th)) };
}

function updateDimensionsDisplay() {
    if (!state.originalImage) return;
    const size = getFinalSize();
    dimensionsDisplay.textContent = `${size.w} × ${size.h} px`;
}

// Largest scale (<= requested) that keeps the export inside canvas limits
function getSafeExportScale(requested) {
    const size = getFinalSize();
    let scale = requested;
    if (size.w * size.h * scale * scale > MAX_EXPORT_PIXELS) {
        scale = Math.sqrt(MAX_EXPORT_PIXELS / (size.w * size.h));
    }
    if (Math.max(size.w, size.h) * scale > MAX_EXPORT_SIDE) {
        scale = MAX_EXPORT_SIDE / Math.max(size.w, size.h);
    }
    return scale;
}

function setupExportDialog() {
    const overlay = document.getElementById('export-overlay');
    if (!overlay) return;
    
    const selFormat = document.getElementById('export-format');
    const rngQuality = document.getElementById('export-quality');
    const qualityVal = document.getElementById('export-quality-val');
    const qualityRow = document.getElementById('export-quality-row');
    const selScale = document.getElementById('export-scale');
    const sizeInfo = document.getElementById('export-size-info');
    const btnDownloadNow = document.getElementById('btn-export-download');
    const btnCopy = document.getElementById('btn-export-copy');
    const btnCancel = document.getElementById('btn-export-cancel');
    const btnClose = document.getElementById('btn-close-export');
    
    let exporting = false;
    
    const refresh = () => {
        const fmt = EXPORT_FORMATS[selFormat.value];
        qualityRow.style.display = fmt.lossy ? '' : 'none';
        qualityVal.textContent = rngQuality.value;
        
        const size = getFinalSize();
        const requested = parseFloat(selScale.value);
        const safe = getSafeExportScale(requested);
        const w = Math.max(1, Math.round(size.w * safe));
        const h = Math.max(1, Math.round(size.h * safe));
        const mp = (w * h / 1e6).toFixed(1);
        sizeInfo.textContent = `輸出尺寸：${w} × ${h} px（約 ${mp} MP）` +
            (safe < requested - 1e-6 ? '　⚠️ 超過瀏覽器畫布上限，已自動縮小' : '');
    };
    
    const close = () => {
        if (exporting) return;
        overlay.style.display = 'none';
    };
    
    const persist = () => {
        safeStorageSet(EXPORT_SETTINGS_KEY, JSON.stringify({
            format: selFormat.value,
            quality: parseInt(rngQuality.value),
            scale: parseFloat(selScale.value)
        }));
    };
    
    const run = async (mode) => {
        if (exporting) return;
        exporting = true;
        btnDownloadNow.disabled = true;
        btnCopy.disabled = true;
        persist();
        try {
            const ok = await exportImage({
                mime: selFormat.value,
                quality: parseInt(rngQuality.value) / 100,
                scale: parseFloat(selScale.value),
                mode
            });
            if (ok) {
                exporting = false;
                close();
            }
        } finally {
            exporting = false;
            btnDownloadNow.disabled = false;
            btnCopy.disabled = false;
        }
    };
    
    selFormat.addEventListener('change', refresh);
    rngQuality.addEventListener('input', refresh);
    selScale.addEventListener('change', refresh);
    btnDownloadNow.addEventListener('click', () => run('download'));
    btnCopy.addEventListener('click', () => run('copy'));
    btnCancel.addEventListener('click', close);
    btnClose.addEventListener('click', close);
    overlay.addEventListener('mousedown', (e) => {
        if (e.target === overlay) close();
    });
    overlay.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !(e.target instanceof HTMLButtonElement) && !(e.target instanceof HTMLSelectElement)) {
            e.preventDefault();
            run('download');
        }
    });
    
    window.openExportDialog = () => {
        if (!state.originalImage) return;
        if (state.isCropMode) {
            showToast('請先套用或取消裁切', 'error');
            return;
        }
        const saved = loadExportSettings();
        selFormat.value = saved.format || normalizeExportFormat(state.originalFormat);
        rngQuality.value = saved.quality;
        selScale.value = String(saved.scale);
        refresh();
        overlay.style.display = 'flex';
        btnDownloadNow.focus();
    };
}

function downloadHighResImage() {
    if (typeof window.openExportDialog === 'function') window.openExportDialog();
}

// Runs the current adjustments, watermark and frame over a canvas in place (shared by export and batch).
function applyEditsToCanvas(canvas) {
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    const w = canvas.width;
    const h = canvas.height;

    const srcImageData = ctx.getImageData(0, 0, w, h);
    const dstImageData = ctx.createImageData(w, h);

    // The blur radius scales with the canvas so sharpening looks the same at full size
    let blurredData = null;
    if (state.adjustments.sharpening > 0 || state.adjustments.noiseReduction > 0) {
        blurredData = getBlurData(canvas, getBlurRadius(Math.max(w, h)));
    }

    applyFilterPipeline(srcImageData, dstImageData, state.adjustments, blurredData);
    ctx.putImageData(dstImageData, 0, 0);

    if (state.adjustments.watermarkText) {
        drawWatermark(ctx, w, h, state.adjustments);
    }
    if (state.activeFrame && state.activeFrame !== 'none') {
        drawFrame(ctx, w, h, state.activeFrame);
    }
}

function canvasToBlob(canvas, mime, quality) {
    return new Promise((resolve) => canvas.toBlob(resolve, mime, quality));
}

// Renders the edited photo at full resolution and either downloads it or copies it to the clipboard.
// Resolves true on success.
async function exportImage({ mime, quality, scale, mode }) {
    if (!state.originalImage) return false;
    
    showLoading(true);
    // Let the loading overlay paint before the heavy synchronous work starts
    await new Promise(r => setTimeout(r, 50));
    
    try {
        const safeScale = getSafeExportScale(scale);
        
        // Get cropped, rotated, flipped canvas at full resolution
        const exportCanvas = getCroppedCanvas(state.originalImage, { scale: safeScale });
        const exportCtx = exportCanvas.getContext('2d', { willReadFrequently: true });
        const w = exportCanvas.width;
        const h = exportCanvas.height;
        
        applyEditsToCanvas(exportCanvas);
        
        // JPEG has no alpha channel: composite over white instead of letting transparency turn black
        const targetMime = mode === 'copy' ? 'image/png' : mime;
        if (targetMime === 'image/jpeg') {
            exportCtx.save();
            exportCtx.globalCompositeOperation = 'destination-over';
            exportCtx.fillStyle = '#ffffff';
            exportCtx.fillRect(0, 0, w, h);
            exportCtx.restore();
        }
        
        const blob = await canvasToBlob(exportCanvas, targetMime, quality);
        if (!blob || blob.type !== targetMime) {
            throw new Error(`Encoding as ${targetMime} is not supported`);
        }
        
        if (mode === 'copy') {
            await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
            showToast('已複製到剪貼簿', 'success');
        } else {
            let suffix = '';
            if (state.activePreset !== 'original' && state.activePreset !== 'custom') {
                const presetLabel = state.activePreset.replace(/^my:/, '');
                suffix = `-${presetLabel.replace(/[^\w\u4e00-\u9fff-]+/g, '_')}`;
            } else if (state.activePreset === 'custom') {
                suffix = '-edited';
            }
            const safeName = (state.originalFileName || 'edited-photo').replace(/[\\/:*?"<>|]+/g, '_');
            
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.download = `${safeName}${suffix}.${EXPORT_FORMATS[targetMime].ext}`;
            link.href = url;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            setTimeout(() => URL.revokeObjectURL(url), 10000);
            
            if (safeScale < scale - 1e-6) {
                showToast('圖片超過畫布上限，已自動縮小後儲存', 'info');
            } else {
                showToast('相片已儲存', 'success');
            }
        }
        return true;
    } catch (error) {
        console.error(error);
        showToast(mode === 'copy' ? '複製失敗：瀏覽器未允許存取剪貼簿' : '儲存相片時發生錯誤，請再試一次', 'error');
        return false;
    } finally {
        showLoading(false);
    }
}

/* ==========================================
 * SMOOTH PRESET TRANSITIONS & GUI LOADING HELPERS
 * ========================================== */

function cancelPresetAnimation() {
    if (state.presetAnimation) {
        clearInterval(state.presetAnimation);
        state.presetAnimation = null;
    }
}

function animateSlidersTo(targets, options = {}) {
    const keepKeys = options.keepKeys || [];
    const steps = 15;
    const duration = 250; // ms
    const stepTime = duration / steps;
    
    // Any previous animation is superseded (rapid clicks must not fight each other)
    cancelPresetAnimation();
    
    const fullTargets = {};
    PRESET_KEYS.forEach(key => {
        if (!keepKeys.includes(key)) fullTargets[key] = 0;
    });
    Object.assign(fullTargets, targets);
    
    const startValues = { ...state.adjustments };
    let currentStep = 0;
    
    state.presetAnimation = setInterval(() => {
        currentStep++;
        const ratio = currentStep / steps;
        
        Object.keys(fullTargets).forEach(key => {
            const start = Number(startValues[key]) || 0;
            const target = fullTargets[key];
            const currentVal = Math.round(start + (target - start) * ratio);
            
            state.adjustments[key] = currentVal;
            setSliderUI(key, currentVal);
        });
        
        requestRender();
        
        if (currentStep >= steps) {
            cancelPresetAnimation();
            saveHistoryState(); // Save final snapshot after transition
        }
    }, stepTime);
}

/* ==========================================
 * GUI LOADING HELPERS
 * ========================================== */

function showLoading(show) {
    if (show) {
        loadingOverlay.classList.add('active');
    } else {
        loadingOverlay.classList.remove('active');
    }
}

/* ==========================================
 * LIGHTROOM DEVELOP MODULE ADVANCED FEATURES
 * ========================================== */

// --- 1. ACCORDIONS ---
function setupAccordions() {
    const accordions = document.querySelectorAll('.accordion-item');
    accordions.forEach(item => {
        const header = item.querySelector('.accordion-header');
        const content = item.querySelector('.accordion-content');
        
        header.addEventListener('click', () => {
            const isActive = item.classList.contains('active');
            
            if (isActive) {
                item.classList.remove('active');
                content.style.maxHeight = null;
            } else {
                item.classList.add('active');
                content.style.maxHeight = content.scrollHeight + 'px';
                
                setTimeout(() => {
                    if (item.classList.contains('active')) {
                        content.style.maxHeight = '2000px'; // Allow dropdowns inside to open
                    }
                }, 300);
            }
        });
        
        if (item.classList.contains('active')) {
            content.style.maxHeight = '2000px';
        }
    });
}

// --- 2. HSL MIXER ---
function setupHslMixer() {
    const tabBtns = document.querySelectorAll('.hsl-tab-btn');
    const container = document.querySelector('.hsl-sliders-list');
    
    tabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            tabBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            
            const tab = btn.dataset.tab;
            state.activeHslTab = tab;
            container.dataset.activeTab = tab;
            
            updateHslSlidersUI();
        });
    });
    
    const hslInputs = document.querySelectorAll('.hsl-input');
    hslInputs.forEach(input => {
        const color = input.dataset.color;
        const valDisplay = input.closest('.slider-control').querySelector('.val-display');
        
        input.addEventListener('input', () => {
            const val = parseInt(input.value);
            state.hsl[state.activeHslTab][color] = val;
            valDisplay.textContent = val > 0 ? `+${val}` : val;
            
            if (state.activePreset !== 'custom') {
                clearPresetHighlights();
                state.activePreset = 'custom';
            }
            requestRender();
        });
        
        input.addEventListener('change', () => {
            saveHistoryState();
        });
    });
}

function updateHslSlidersUI() {
    const tab = state.activeHslTab;
    const hslInputs = document.querySelectorAll('.hsl-input');
    hslInputs.forEach(input => {
        const color = input.dataset.color;
        const val = state.hsl[tab][color];
        input.value = val;
        const valDisplay = input.closest('.slider-control').querySelector('.val-display');
        if (valDisplay) {
            valDisplay.textContent = val > 0 ? `+${val}` : val;
        }
    });
}

// HSL Fast Conversions
function rgbToHsl(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    let h, s, l = (max + min) / 2;

    if (max === min) {
        h = s = 0;
    } else {
        const d = max - min;
        s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
        switch (max) {
            case r: h = (g - b) / d + (g < b ? 6 : 0); break;
            case g: h = (b - r) / d + 2; break;
            case b: h = (r - g) / d + 4; break;
        }
        h *= 60;
    }
    return [h, s, l];
}

function hueToRgb(p, q, t) {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1/6) return p + (q - p) * 6 * t;
    if (t < 1/2) return q;
    if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
    return p;
}

function hslToRgb(h, s, l) {
    let r, g, b;
    h /= 360;

    if (s === 0) {
        r = g = b = l;
    } else {
        const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
        const p = 2 * l - q;
        r = hueToRgb(p, q, h + 1/3);
        g = hueToRgb(p, q, h);
        b = hueToRgb(p, q, h - 1/3);
    }
    return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)];
}

function getHslWeights(h) {
    const weights = { red: 0, orange: 0, yellow: 0, green: 0, aqua: 0, blue: 0, purple: 0, magenta: 0 };
    if (h >= 0 && h < 30) {
        const r = (h - 0) / 30;
        weights.orange = r; weights.red = 1 - r;
    } else if (h >= 30 && h < 60) {
        const r = (h - 30) / 30;
        weights.yellow = r; weights.orange = 1 - r;
    } else if (h >= 60 && h < 120) {
        const r = (h - 60) / 60;
        weights.green = r; weights.yellow = 1 - r;
    } else if (h >= 120 && h < 180) {
        const r = (h - 120) / 60;
        weights.aqua = r; weights.green = 1 - r;
    } else if (h >= 180 && h < 240) {
        const r = (h - 180) / 60;
        weights.blue = r; weights.aqua = 1 - r;
    } else if (h >= 240 && h < 270) {
        const r = (h - 240) / 30;
        weights.purple = r; weights.blue = 1 - r;
    } else if (h >= 270 && h < 300) {
        const r = (h - 270) / 30;
        weights.magenta = r; weights.purple = 1 - r;
    } else {
        const r = (h - 300) / 60;
        weights.red = r; weights.magenta = 1 - r;
    }
    return weights;
}

// --- 3. TONE CURVES ---
function setupCurveEditor() {
    const canvas = document.getElementById('curve-canvas');
    if (!canvas) return;
    
    const channelBtns = document.querySelectorAll('.curve-chan-btn');
    channelBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            channelBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            state.activeCurveChannel = btn.dataset.channel;
            state.selectedCurvePoint = -1;
            drawCurveEditor();
        });
    });
    
    document.getElementById('btn-reset-curve').addEventListener('click', () => {
        const chan = state.activeCurveChannel;
        state.curves[chan] = [{ x: 0, y: 0 }, { x: 255, y: 255 }];
        state.selectedCurvePoint = -1;
        recomputeCurveLUT(chan);
        drawCurveEditor();
        saveHistoryState();
        requestRender();
    });
    
    let isDragging = false;
    
    const getMousePos = (e) => {
        const rect = canvas.getBoundingClientRect();
        const x = Math.max(0, Math.min(255, Math.round(((e.clientX - rect.left) / rect.width) * 255)));
        const y = Math.max(0, Math.min(255, Math.round((1 - (e.clientY - rect.top) / rect.height) * 255)));
        return { x, y };
    };
    
    const curveInfo = document.querySelector('.curve-point-info');

    canvas.addEventListener('mousedown', (e) => {
        if (!state.originalImage) return;
        const pos = getMousePos(e);
        const chan = state.activeCurveChannel;
        const points = state.curves[chan];
        
        let foundIdx = -1;
        for (let i = 0; i < points.length; i++) {
            const p = points[i];
            const dist = Math.hypot(p.x - pos.x, p.y - pos.y);
            if (dist < 10) {
                foundIdx = i;
                break;
            }
        }
        
        if (foundIdx !== -1) {
            state.selectedCurvePoint = foundIdx;
            isDragging = true;
        } else {
            // Two control points on (almost) the same X would make the spline degenerate
            const tooClose = points.some(p => Math.abs(p.x - pos.x) < 3);
            if (!tooClose && points.length < 10) {
                points.push(pos);
                points.sort((a, b) => a.x - b.x);
                state.selectedCurvePoint = points.findIndex(p => p.x === pos.x && p.y === pos.y);
                isDragging = true;
                recomputeCurveLUT(chan);
                requestRender();
            }
        }
        
        if (curveInfo && state.selectedCurvePoint !== -1) {
            const pt = points[state.selectedCurvePoint];
            curveInfo.textContent = `輸入: ${pt.x}, 輸出: ${pt.y}`;
        }
        
        drawCurveEditor();
    });
    
    window.addEventListener('mousemove', (e) => {
        if (!isDragging || state.selectedCurvePoint === -1) return;
        const pos = getMousePos(e);
        const chan = state.activeCurveChannel;
        const points = state.curves[chan];
        const idx = state.selectedCurvePoint;
        
        if (idx === 0) {
            points[idx].y = pos.y;
        } else if (idx === points.length - 1) {
            points[idx].y = pos.y;
        } else {
            const minX = points[idx - 1].x + 1;
            const maxX = points[idx + 1].x - 1;
            points[idx].x = Math.max(minX, Math.min(maxX, pos.x));
            points[idx].y = pos.y;
        }
        
        if (curveInfo) {
            curveInfo.textContent = `輸入: ${points[idx].x}, 輸出: ${points[idx].y}`;
        }
        
        recomputeCurveLUT(chan);
        drawCurveEditor();
        requestRender();
    });
    
    window.addEventListener('mouseup', () => {
        if (isDragging) {
            isDragging = false;
            if (curveInfo) {
                curveInfo.textContent = '點擊曲線可新增控制點，雙擊控制點可刪除';
            }
            saveHistoryState();
        }
    });
    
    canvas.addEventListener('dblclick', (e) => {
        if (!state.originalImage) return;
        const pos = getMousePos(e);
        const chan = state.activeCurveChannel;
        const points = state.curves[chan];
        
        let foundIdx = -1;
        for (let i = 1; i < points.length - 1; i++) {
            const p = points[i];
            const dist = Math.hypot(p.x - pos.x, p.y - pos.y);
            if (dist < 10) {
                foundIdx = i;
                break;
            }
        }
        
        if (foundIdx !== -1) {
            points.splice(foundIdx, 1);
            state.selectedCurvePoint = -1;
            if (curveInfo) {
                curveInfo.textContent = '點擊曲線可新增控制點，雙擊控制點可刪除';
            }
            recomputeCurveLUT(chan);
            drawCurveEditor();
            saveHistoryState();
            requestRender();
        }
    });
}

function recomputeCurveLUT(chan) {
    state.curveLUTs[chan] = getSplineLUT(state.curves[chan]);
}

function recomputeAllCurveLUTs() {
    Object.keys(state.curves).forEach(chan => {
        recomputeCurveLUT(chan);
    });
}

function getSplineLUT(points) {
    const lut = new Uint8Array(256);
    const n = points.length;
    if (n === 2) {
        for (let i = 0; i < 256; i++) {
            const t = i / 255;
            lut[i] = Math.max(0, Math.min(255, Math.round(points[0].y + (points[1].y - points[0].y) * t)));
        }
        return lut;
    }
    
    const sorted = [...points].sort((a, b) => a.x - b.x);
    const xs = sorted.map(p => p.x);
    const ys = sorted.map(p => p.y);
    
    const dx = new Array(n - 1);
    const dy = new Array(n - 1);
    const ms = new Array(n - 1);
    for (let i = 0; i < n - 1; i++) {
        dx[i] = xs[i+1] - xs[i];
        dy[i] = ys[i+1] - ys[i];
        ms[i] = dy[i] / (dx[i] || 1e-5);
    }
    
    const c1s = new Array(n);
    c1s[0] = ms[0];
    for (let i = 1; i < n - 1; i++) {
        c1s[i] = (ms[i-1] + ms[i]) / 2;
    }
    c1s[n-1] = ms[n-2];
    
    for (let i = 0; i < n - 1; i++) {
        if (ms[i] === 0) {
            c1s[i] = 0;
            c1s[i+1] = 0;
        } else {
            const a = c1s[i] / ms[i];
            const b = c1s[i+1] / ms[i];
            const h = Math.hypot(a, b);
            if (h > 9) {
                const t = 3 / h;
                c1s[i] = t * a * ms[i];
                c1s[i+1] = t * b * ms[i];
            }
        }
    }
    
    const c2s = new Array(n - 1);
    const c3s = new Array(n - 1);
    for (let i = 0; i < n - 1; i++) {
        c2s[i] = (3 * ms[i] - 2 * c1s[i] - c1s[i+1]) / (dx[i] || 1e-5);
        c3s[i] = (c1s[i] + c1s[i+1] - 2 * ms[i]) / ((dx[i] * dx[i]) || 1e-5);
    }
    
    for (let i = 0; i < 256; i++) {
        const x = i;
        let idx = 0;
        for (let j = 0; j < n - 1; j++) {
            if (x >= xs[j] && x <= xs[j+1]) {
                idx = j;
                break;
            }
        }
        if (x > xs[n-1]) idx = n - 2;
        
        const h = x - xs[idx];
        const val = ys[idx] + c1s[idx] * h + c2s[idx] * h * h + c3s[idx] * h * h * h;
        lut[i] = Math.max(0, Math.min(255, Math.round(val)));
    }
    return lut;
}

function drawCurveEditor() {
    const canvas = document.getElementById('curve-canvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const size = canvas.width;
    
    ctx.clearRect(0, 0, size, size);
    
    // Draw Grid
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
    ctx.lineWidth = 1;
    for (let i = 1; i < 4; i++) {
        const pos = (i / 4) * size;
        ctx.beginPath(); ctx.moveTo(0, pos); ctx.lineTo(size, pos); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(pos, 0); ctx.lineTo(pos, size); ctx.stroke();
    }
    
    // Diagonal
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
    ctx.setLineDash([4, 4]);
    ctx.beginPath(); ctx.moveTo(0, size); ctx.lineTo(size, 0); ctx.stroke();
    ctx.setLineDash([]);
    
    const channel = state.activeCurveChannel;
    const points = state.curves[channel];
    const lut = state.curveLUTs[channel];
    
    // Curve Path
    ctx.strokeStyle = getChannelColor(channel);
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, size - (lut[0] / 255) * size);
    for (let i = 1; i < 256; i++) {
        const x = (i / 255) * size;
        const y = size - (lut[i] / 255) * size;
        ctx.lineTo(x, y);
    }
    ctx.stroke();
    
    // Control Points
    points.forEach((p, idx) => {
        const cx = (p.x / 255) * size;
        const cy = size - (p.y / 255) * size;
        
        ctx.beginPath();
        ctx.arc(cx, cy, 5, 0, 2 * Math.PI);
        if (state.selectedCurvePoint === idx) {
            ctx.fillStyle = '#ffffff';
            ctx.strokeStyle = getChannelColor(channel);
            ctx.lineWidth = 2;
        } else {
            ctx.fillStyle = getChannelColor(channel);
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = 1;
        }
        ctx.fill();
        ctx.stroke();
    });
}

function getChannelColor(chan) {
    switch (chan) {
        case 'red': return '#ef4444';
        case 'green': return '#10b981';
        case 'blue': return '#3b82f6';
        default: return '#6366f1';
    }
}

// --- 4. CROP & ROTATE ---
let dragType = null;
let dragStartMouse = { x: 0, y: 0 };
let dragStartBox = { x: 0, y: 0, w: 1, h: 1 };

function getAspectValue() {
    const aspect = document.getElementById('crop-aspect').value;
    if (aspect === '1:1') return 1;
    if (aspect === '4:3') return 4 / 3;
    if (aspect === '16:9') return 16 / 9;
    if (aspect === '3:2') return 3 / 2;
    if (aspect === '5:7') return 5 / 7;
    if (aspect === 'original') {
        // Aspect of the image as currently rotated (not of the untouched source)
        const t = state.cropTransform;
        const swapped = t.rotate === 90 || t.rotate === 270;
        return swapped ? state.height / state.width : state.width / state.height;
    }
    return null;
}

function setupCropMode() {
    const btnToggle = document.getElementById('btn-crop-toggle');
    
    btnToggle.addEventListener('click', () => {
        if (!state.originalImage) return;
        if (state.isCropMode) {
            exitCropMode(false);
        } else {
            enterCropMode();
        }
    });
    
    document.getElementById('btn-crop-cancel').addEventListener('click', () => {
        exitCropMode(false);
    });
    
    document.getElementById('btn-crop-apply').addEventListener('click', () => {
        exitCropMode(true);
    });
    
    document.getElementById('btn-crop-rotate-left').addEventListener('click', () => {
        state.cropTransform.rotate = (state.cropTransform.rotate + 270) % 360;
        updateCroppedPreview();
        if (state.isCropMode) resetActiveCropBox();
    });
    
    document.getElementById('btn-crop-rotate-right').addEventListener('click', () => {
        state.cropTransform.rotate = (state.cropTransform.rotate + 90) % 360;
        updateCroppedPreview();
        if (state.isCropMode) resetActiveCropBox();
    });
    
    document.getElementById('btn-crop-flip-h').addEventListener('click', () => {
        state.cropTransform.flipH = !state.cropTransform.flipH;
        updateCroppedPreview();
    });
    
    document.getElementById('btn-crop-flip-v').addEventListener('click', () => {
        state.cropTransform.flipV = !state.cropTransform.flipV;
        updateCroppedPreview();
    });
    
    const inputStraighten = document.getElementById('input-straighten');
    const displayStraighten = document.getElementById('straighten-val');
    inputStraighten.addEventListener('input', () => {
        const val = parseFloat(inputStraighten.value);
        state.cropTransform.straighten = val;
        displayStraighten.textContent = `${val > 0 ? '+' : ''}${val}°`;
        const cropBoxEl = document.getElementById('crop-box');
        if (cropBoxEl) cropBoxEl.classList.add('straightening');
        scheduleCroppedPreview();
    });
    inputStraighten.addEventListener('change', () => {
        // History is saved once, when the crop is applied (a cancel must leave no trace)
        const cropBoxEl = document.getElementById('crop-box');
        if (cropBoxEl) cropBoxEl.classList.remove('straightening');
    });
    inputStraighten.addEventListener('dblclick', () => {
        inputStraighten.value = 0;
        inputStraighten.dispatchEvent(new Event('input'));
        inputStraighten.dispatchEvent(new Event('change'));
    });
    
    document.getElementById('crop-aspect').addEventListener('change', () => {
        if (state.isCropMode) {
            resetActiveCropBox();
        }
    });
    
    setupCropInteraction();
}

function enterCropMode() {
    if (state.isComparing) return;
    state.isCropMode = true;
    document.getElementById('btn-crop-toggle').classList.add('active');
    document.getElementById('crop-toolbar').style.display = 'block';
    document.getElementById('crop-overlay-container').style.display = 'block';
    
    // Backup the crop state
    state.backupCropTransform = JSON.parse(JSON.stringify(state.cropTransform));
    
    // While cropping, the full (rotated / straightened but uncropped) image is shown and the crop box
    // is expressed relative to it, so an existing crop can be refined instead of re-applied on a crop.
    updateCroppedPreview();
    
    if (state.cropTransform.crop) {
        state.activeCropBox = { ...state.cropTransform.crop };
    } else {
        state.activeCropBox = { x: 0, y: 0, w: 1, h: 1 };
    }
    drawCropBoxUI();
}

function exitCropMode(apply) {
    if (!state.isCropMode) return;
    state.isCropMode = false;
    document.getElementById('btn-crop-toggle').classList.remove('active');
    document.getElementById('crop-toolbar').style.display = 'none';
    document.getElementById('crop-overlay-container').style.display = 'none';
    
    if (apply) {
        const cb = state.activeCropBox;
        if (cb.x < 0.01 && cb.y < 0.01 && cb.w > 0.99 && cb.h > 0.99) {
            state.cropTransform.crop = null;
        } else {
            state.cropTransform.crop = { x: cb.x, y: cb.y, w: cb.w, h: cb.h };
        }
        updateCroppedPreview();
        saveHistoryState();
    } else {
        // Cancel: Restore backup state
        if (state.backupCropTransform) {
            state.cropTransform = state.backupCropTransform;
        }
        syncStraightenUI();
        
        // Redraw preview using restored transforms
        updateCroppedPreview();
    }
    state.backupCropTransform = null;
}

function resetActiveCropBox() {
    const aspectVal = getAspectValue();
    
    if (!aspectVal) {
        state.activeCropBox = { x: 0, y: 0, w: 1, h: 1 };
    } else {
        const container = document.getElementById('crop-overlay-container');
        const rect = container.getBoundingClientRect();
        const pctAspect = aspectVal * (rect.height / rect.width);
        
        let w = 1.0;
        let h = 1.0 / pctAspect;
        if (h > 1.0) {
            h = 1.0;
            w = pctAspect;
        }
        
        state.activeCropBox = {
            x: (1.0 - w) / 2,
            y: (1.0 - h) / 2,
            w: w,
            h: h
        };
    }
    drawCropBoxUI();
}

// Rebuilds the preview canvas (and everything cached from it) from the original image
// using the current crop / rotate / straighten / flip settings. Returns true if its size changed.
function rebuildPreview() {
    const canvas = getCroppedCanvas(state.originalImage, {
        maxDim: state.isCropMode ? MAX_PREVIEW_DIMENSION : state.previewMaxDim,
        ignoreCrop: state.isCropMode
    });
    const sizeChanged = canvas.width !== state.previewWidth || canvas.height !== state.previewHeight;
    
    state.previewCanvas = canvas;
    state.previewCtx = canvas.getContext('2d', { willReadFrequently: true });
    state.previewWidth = canvas.width;
    state.previewHeight = canvas.height;
    state.previewImageData = state.previewCtx.getImageData(0, 0, canvas.width, canvas.height);
    state.blurCache = null;
    state.outputImageData = null;
    
    if (state.editorCanvas.width !== canvas.width || state.editorCanvas.height !== canvas.height) {
        state.editorCanvas.width = canvas.width;
        state.editorCanvas.height = canvas.height;
    }
    
    updateDimensionsDisplay();
    return sizeChanged;
}

function updateCroppedPreview() {
    if (!state.originalImage) return;
    const sizeChanged = rebuildPreview();
    if (sizeChanged || state.isFit) fitImageToViewport();
    requestRender();
}

// Coalesces rapid updates (e.g. dragging the straighten slider) into one rebuild per frame
function scheduleCroppedPreview() {
    if (state.previewRebuildPending) return;
    state.previewRebuildPending = true;
    requestAnimationFrame(() => {
        state.previewRebuildPending = false;
        updateCroppedPreview();
    });
}

// Scale needed so a copy of the image rotated by `angle` still covers the whole w x h frame
function getStraightenFillScale(w, h, angle) {
    const a = Math.abs(angle);
    if (a < 1e-9) return 1;
    return Math.cos(a) + Math.sin(a) * Math.max(w / h, h / w);
}

/**
 * Renders the source image with the current rotate / flip / straighten / crop applied.
 *   scale     - multiplier on the (cropped) output size
 *   maxDim    - optional cap on the longest output side (used for the preview)
 *   ignoreCrop - draw the whole transformed image (used while the crop box is being edited)
 * The crop rectangle is expressed in fractions of the transformed (rotated) image.
 */
function getCroppedCanvas(sourceImg, { scale = 1, maxDim = 0, ignoreCrop = false } = {}) {
    const srcW = sourceImg.width;
    const srcH = sourceImg.height;
    
    const transform = state.cropTransform;
    const crop = (!ignoreCrop && transform.crop) ? transform.crop : { x: 0, y: 0, w: 1, h: 1 };
    const angle = transform.straighten * Math.PI / 180;
    
    // Size of the image after the 90-degree rotation
    const isSwapped = (transform.rotate === 90 || transform.rotate === 270);
    const tw = isSwapped ? srcH : srcW;
    const th = isSwapped ? srcW : srcH;
    
    const cx = crop.x * tw;
    const cy = crop.y * th;
    const cw = crop.w * tw;
    const ch = crop.h * th;
    
    let k = scale;
    if (maxDim > 0 && Math.max(cw, ch) * k > maxDim) {
        k = maxDim / Math.max(cw, ch);
    }
    const destW = Math.max(1, Math.round(cw * k));
    const destH = Math.max(1, Math.round(ch * k));
    
    const canvas = document.createElement('canvas');
    canvas.width = destW;
    canvas.height = destH;
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    
    // Destination <- (crop window of the transformed image)
    ctx.scale(destW / cw, destH / ch);
    ctx.translate(-cx, -cy);
    
    // Transformed image space: straighten (zoomed so no empty corners show), flip, then 90-degree rotation
    const fill = getStraightenFillScale(tw, th, angle);
    ctx.translate(tw / 2, th / 2);
    ctx.rotate(angle);
    ctx.scale(fill * (transform.flipH ? -1 : 1), fill * (transform.flipV ? -1 : 1));
    ctx.rotate(transform.rotate * Math.PI / 180);
    
    ctx.drawImage(sourceImg, -srcW / 2, -srcH / 2, srcW, srcH);
    return canvas;
}

function setupCropInteraction() {
    const box = document.getElementById('crop-box');
    const container = document.getElementById('crop-overlay-container');
    
    box.addEventListener('mousedown', (e) => {
        if (!state.isCropMode) return;
        e.stopPropagation();
        
        const handle = e.target;
        if (handle.classList.contains('crop-handle')) {
            if (handle.classList.contains('handle-tl')) dragType = 'tl';
            else if (handle.classList.contains('handle-tr')) dragType = 'tr';
            else if (handle.classList.contains('handle-bl')) dragType = 'bl';
            else if (handle.classList.contains('handle-br')) dragType = 'br';
            else if (handle.classList.contains('handle-t')) dragType = 't';
            else if (handle.classList.contains('handle-b')) dragType = 'b';
            else if (handle.classList.contains('handle-l')) dragType = 'l';
            else if (handle.classList.contains('handle-r')) dragType = 'r';
        } else {
            dragType = 'move';
        }
        
        dragStartMouse = { x: e.clientX, y: e.clientY };
        dragStartBox = { ...state.activeCropBox };
        
        document.addEventListener('mousemove', handleCropDrag);
        document.addEventListener('mouseup', stopCropDrag);
    });
}

function handleCropDrag(e) {
    if (!dragType) return;
    e.preventDefault();
    
    const container = document.getElementById('crop-overlay-container');
    const rect = container.getBoundingClientRect();
    
    let dx = (e.clientX - dragStartMouse.x) / rect.width;
    let dy = (e.clientY - dragStartMouse.y) / rect.height;
    
    const aspectVal = getAspectValue();
    
    const box = { ...dragStartBox };
    
    if (dragType === 'move') {
        box.x = dragStartBox.x + dx;
        box.y = dragStartBox.y + dy;
        
        if (box.x < 0) box.x = 0;
        if (box.y < 0) box.y = 0;
        if (box.x + box.w > 1) box.x = 1 - box.w;
        if (box.y + box.h > 1) box.y = 1 - box.h;
    } else {
        let newX = box.x;
        let newY = box.y;
        let newW = box.w;
        let newH = box.h;
        
        if (dragType.includes('r')) newW = dragStartBox.w + dx;
        if (dragType.includes('l')) {
            newX = dragStartBox.x + dx;
            newW = dragStartBox.w - dx;
        }
        if (dragType.includes('b')) newH = dragStartBox.h + dy;
        if (dragType.includes('t')) {
            newY = dragStartBox.y + dy;
            newH = dragStartBox.h - dy;
        }
        
        if (aspectVal) {
            const pctAspect = aspectVal * (rect.height / rect.width);
            if (dragType === 'br') newH = newW / pctAspect;
            else if (dragType === 'tr') {
                newH = newW / pctAspect;
                newY = dragStartBox.y + (dragStartBox.h - newH);
            } else if (dragType === 'bl') {
                newH = newW / pctAspect;
            } else if (dragType === 'tl') {
                newH = newW / pctAspect;
                newY = dragStartBox.y + (dragStartBox.h - newH);
            } else if (dragType === 'r' || dragType === 'l') {
                newH = newW / pctAspect;
            } else if (dragType === 'b' || dragType === 't') {
                newW = newH * pctAspect;
            }
        }
        
        const minSize = 0.05;
        if (newW < minSize) {
            if (dragType.includes('l')) newX = dragStartBox.x + dragStartBox.w - minSize;
            newW = minSize;
        }
        if (newH < minSize) {
            if (dragType.includes('t')) newY = dragStartBox.y + dragStartBox.h - minSize;
            newH = minSize;
        }
        
        if (newX < 0) { newW += newX; newX = 0; }
        if (newY < 0) { newH += newY; newY = 0; }
        if (newX + newW > 1) newW = 1 - newX;
        if (newY + newH > 1) newH = 1 - newY;
        
        if (aspectVal) {
            const pctAspect = aspectVal * (rect.height / rect.width);
            if (Math.abs(newW / newH - pctAspect) > 0.001) {
                if (newW / newH > pctAspect) newW = newH * pctAspect;
                else newH = newW / pctAspect;
            }
        }
        
        box.x = newX;
        box.y = newY;
        box.w = newW;
        box.h = newH;
    }
    
    state.activeCropBox = box;
    drawCropBoxUI();
    const cropBoxEl = document.getElementById('crop-box');
    if (cropBoxEl) cropBoxEl.classList.add('straightening');
}

function stopCropDrag() {
    dragType = null;
    document.removeEventListener('mousemove', handleCropDrag);
    document.removeEventListener('mouseup', stopCropDrag);
    const cropBoxEl = document.getElementById('crop-box');
    if (cropBoxEl) cropBoxEl.classList.remove('straightening');
}

function drawCropBoxUI() {
    const cb = state.activeCropBox;
    const box = document.getElementById('crop-box');
    if (!box) return;
    box.style.left = (cb.x * 100) + '%';
    box.style.top = (cb.y * 100) + '%';
    box.style.width = (cb.w * 100) + '%';
    box.style.height = (cb.h * 100) + '%';
}

// --- 5. LIVE HISTOGRAM ---
function drawHistogram(imageData) {
    const canvas = document.getElementById('histogram-canvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const w = canvas.width;
    const h = canvas.height;
    
    ctx.clearRect(0, 0, w, h);
    
    const data = imageData.data;
    const len = data.length;
    
    const rHist = new Uint32Array(256);
    const gHist = new Uint32Array(256);
    const bHist = new Uint32Array(256);
    const yHist = new Uint32Array(256);
    
    // Fast count sampling
    for (let i = 0; i < len; i += 64) {
        const r = data[i];
        const g = data[i+1];
        const b = data[i+2];
        const y = Math.round(0.2126 * r + 0.7152 * g + 0.0722 * b);
        rHist[r]++;
        gHist[g]++;
        bHist[b]++;
        yHist[y]++;
    }
    
    let maxFreq = 0;
    for (let i = 0; i < 256; i++) {
        if (rHist[i] > maxFreq) maxFreq = rHist[i];
        if (gHist[i] > maxFreq) maxFreq = gHist[i];
        if (bHist[i] > maxFreq) maxFreq = bHist[i];
        if (yHist[i] > maxFreq) maxFreq = yHist[i];
    }
    
    if (maxFreq === 0) return;
    
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    
    const drawChannel = (hist, color, fillColor) => {
        ctx.beginPath();
        ctx.moveTo(0, h);
        for (let i = 0; i < 256; i++) {
            const x = (i / 255) * w;
            const y = h - (hist[i] / maxFreq) * (h - 8);
            ctx.lineTo(x, y);
        }
        ctx.lineTo(w, h);
        ctx.closePath();
        ctx.fillStyle = fillColor;
        ctx.fill();
        ctx.strokeStyle = color;
        ctx.lineWidth = 1.5;
        ctx.stroke();
    };
    
    drawChannel(rHist, 'rgba(239, 68, 68, 0.85)', 'rgba(239, 68, 68, 0.12)');
    drawChannel(gHist, 'rgba(16, 185, 129, 0.85)', 'rgba(16, 185, 129, 0.12)');
    drawChannel(bHist, 'rgba(59, 130, 246, 0.85)', 'rgba(59, 130, 246, 0.12)');
    drawChannel(yHist, 'rgba(255, 255, 255, 0.55)', 'rgba(255, 255, 255, 0.04)');
    
    ctx.restore();
}

function drawWatermark(ctx, width, height, adj) {
    if (!adj.watermarkText) return;
    
    ctx.save();
    
    // Scale text size proportional to the image width
    const baseSize = Math.max(12, Math.round(width * 0.02 * (adj.watermarkSize / 50)));
    ctx.font = `500 ${baseSize}px 'Plus Jakarta Sans', 'Noto Sans TC', 'Microsoft JhengHei', 'PingFang TC', 'Noto Sans CJK TC', sans-serif`;
    
    // Watermark color & opacity
    ctx.fillStyle = adj.watermarkColor || '#ffffff';
    ctx.globalAlpha = (adj.watermarkOpacity !== undefined ? adj.watermarkOpacity : 50) / 100;
    
    // Set text alignment based on position
    const pos = adj.watermarkPosition || 'bottom-right';
    const padding = baseSize;
    let x = 0;
    let y = 0;
    
    ctx.textBaseline = 'middle';
    
    if (pos === 'bottom-right') {
        ctx.textAlign = 'right';
        x = width - padding;
        y = height - padding;
    } else if (pos === 'bottom-left') {
        ctx.textAlign = 'left';
        x = padding;
        y = height - padding;
    } else if (pos === 'top-right') {
        ctx.textAlign = 'right';
        x = width - padding;
        y = padding;
    } else if (pos === 'top-left') {
        ctx.textAlign = 'left';
        x = padding;
        y = padding;
    } else if (pos === 'center') {
        ctx.textAlign = 'center';
        x = width / 2;
        y = height / 2;
    }
    
    ctx.fillText(adj.watermarkText, x, y);
    ctx.restore();
}

/* ==========================================
 * BATCH PROCESSING
 * ========================================== */

// Minimal ZIP writer (STORE method: photos are already compressed). Returns a Blob.
const CRC_TABLE = (() => {
    const table = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
        let c = n;
        for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
        table[n] = c >>> 0;
    }
    return table;
})();

function crc32(bytes) {
    let c = 0xFFFFFFFF;
    for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xFF] ^ (c >>> 8);
    return (c ^ 0xFFFFFFFF) >>> 0;
}

function buildZip(entries) {
    const encoder = new TextEncoder();
    const now = new Date();
    const dosTime = (now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1);
    const dosDate = ((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate();
    const parts = [];
    const central = [];
    let offset = 0;

    for (const { name, data } of entries) {
        const nameBytes = encoder.encode(name);
        const crc = crc32(data);

        const local = new DataView(new ArrayBuffer(30));
        local.setUint32(0, 0x04034b50, true);
        local.setUint16(4, 20, true);
        local.setUint16(6, 0x0800, true); // UTF-8 file names
        local.setUint16(8, 0, true);      // stored
        local.setUint16(10, dosTime, true);
        local.setUint16(12, dosDate, true);
        local.setUint32(14, crc, true);
        local.setUint32(18, data.length, true);
        local.setUint32(22, data.length, true);
        local.setUint16(26, nameBytes.length, true);
        parts.push(local.buffer, nameBytes, data);

        const cen = new DataView(new ArrayBuffer(46));
        cen.setUint32(0, 0x02014b50, true);
        cen.setUint16(4, 20, true);
        cen.setUint16(6, 20, true);
        cen.setUint16(8, 0x0800, true);
        cen.setUint16(10, 0, true);
        cen.setUint16(12, dosTime, true);
        cen.setUint16(14, dosDate, true);
        cen.setUint32(16, crc, true);
        cen.setUint32(20, data.length, true);
        cen.setUint32(24, data.length, true);
        cen.setUint16(28, nameBytes.length, true);
        cen.setUint32(42, offset, true);
        central.push(cen.buffer, nameBytes);

        offset += 30 + nameBytes.length + data.length;
    }

    let centralSize = 0;
    for (const p of central) centralSize += p.byteLength;
    const end = new DataView(new ArrayBuffer(22));
    end.setUint32(0, 0x06054b50, true);
    end.setUint16(8, entries.length, true);
    end.setUint16(10, entries.length, true);
    end.setUint32(12, centralSize, true);
    end.setUint32(16, offset, true);

    return new Blob([...parts, ...central, end.buffer], { type: 'application/zip' });
}

// Applies the current look (adjustments, watermark, frame) to many photos and saves them as one ZIP.
// Crop / rotate / straighten are per-photo and are not applied.
function setupBatchDialog() {
    const overlay = document.getElementById('batch-overlay');
    const btnOpen = document.getElementById('btn-batch');
    if (!overlay || !btnOpen) return;

    const btnPick = document.getElementById('btn-batch-pick');
    const fileInput = document.getElementById('batch-file-input');
    const summary = document.getElementById('batch-summary');
    const selFormat = document.getElementById('batch-format');
    const rngQuality = document.getElementById('batch-quality');
    const qualityVal = document.getElementById('batch-quality-val');
    const qualityRow = document.getElementById('batch-quality-row');
    const selScale = document.getElementById('batch-scale');
    const progress = document.getElementById('batch-progress');
    const btnStart = document.getElementById('btn-batch-start');
    const btnCancel = document.getElementById('btn-batch-cancel');
    const btnClose = document.getElementById('btn-close-batch');

    let files = [];
    let running = false;
    let cancelRequested = false;

    const refresh = () => {
        qualityRow.style.display = EXPORT_FORMATS[selFormat.value].lossy ? '' : 'none';
        qualityVal.textContent = rngQuality.value;
        summary.textContent = files.length ? `已選擇 ${files.length} 張相片` : '尚未選擇相片';
        btnStart.disabled = running || files.length === 0;
    };

    const close = () => {
        if (running) return;
        overlay.style.display = 'none';
    };

    const uniqueName = (used, base, ext) => {
        let name = `${base}.${ext}`;
        for (let n = 2; used.has(name.toLowerCase()); n++) name = `${base}-${n}.${ext}`;
        used.add(name.toLowerCase());
        return name;
    };

    const run = async () => {
        if (running || !files.length) return;
        running = true;
        cancelRequested = false;
        btnStart.disabled = true;
        btnPick.disabled = true;
        btnClose.disabled = true;
        btnCancel.textContent = '停止';

        const mime = selFormat.value;
        const quality = parseInt(rngQuality.value) / 100;
        const requested = parseFloat(selScale.value);
        safeStorageSet(EXPORT_SETTINGS_KEY, JSON.stringify({ format: mime, quality: parseInt(rngQuality.value), scale: requested }));

        const entries = [];
        const used = new Set();
        const failed = [];

        for (let i = 0; i < files.length; i++) {
            if (cancelRequested) break;
            const file = files[i];
            progress.textContent = `處理中 ${i + 1} / ${files.length}：${file.name}`;
            // Let the progress text paint between photos
            await new Promise(r => setTimeout(r, 20));

            let img = null;
            try {
                img = await decodeImageFile(file);
                let scale = requested;
                if (img.width * img.height * scale * scale > MAX_EXPORT_PIXELS) scale = Math.sqrt(MAX_EXPORT_PIXELS / (img.width * img.height));
                if (Math.max(img.width, img.height) * scale > MAX_EXPORT_SIDE) scale = MAX_EXPORT_SIDE / Math.max(img.width, img.height);

                const canvas = document.createElement('canvas');
                canvas.width = Math.max(1, Math.round(img.width * scale));
                canvas.height = Math.max(1, Math.round(img.height * scale));
                const ctx = canvas.getContext('2d', { willReadFrequently: true });
                ctx.imageSmoothingEnabled = true;
                ctx.imageSmoothingQuality = 'high';
                ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

                applyEditsToCanvas(canvas);

                if (mime === 'image/jpeg') {
                    ctx.save();
                    ctx.globalCompositeOperation = 'destination-over';
                    ctx.fillStyle = '#ffffff';
                    ctx.fillRect(0, 0, canvas.width, canvas.height);
                    ctx.restore();
                }

                const blob = await canvasToBlob(canvas, mime, quality);
                if (!blob || blob.type !== mime) throw new Error('encode failed');

                const dot = file.name.lastIndexOf('.');
                const base = ((dot > 0 ? file.name.substring(0, dot) : file.name) || 'photo').replace(/[\\/:*?"<>|]+/g, '_');
                entries.push({
                    name: uniqueName(used, `${base}-edited`, EXPORT_FORMATS[mime].ext),
                    data: new Uint8Array(await blob.arrayBuffer())
                });
            } catch (e) {
                console.error('Batch item failed:', file.name, e);
                failed.push(file.name);
            } finally {
                if (img && typeof img.close === 'function') img.close();
            }
        }

        if (entries.length) {
            const url = URL.createObjectURL(buildZip(entries));
            const link = document.createElement('a');
            link.download = `photo-editor-batch-${entries.length}.zip`;
            link.href = url;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            setTimeout(() => URL.revokeObjectURL(url), 10000);
        }

        const stopped = cancelRequested;
        running = false;
        btnPick.disabled = false;
        btnClose.disabled = false;
        btnCancel.textContent = '關閉';

        if (entries.length) {
            progress.textContent = `完成：已儲存 ${entries.length} 張` + (failed.length ? `，${failed.length} 張失敗` : '') + (stopped ? '（已提前停止）' : '');
            showToast(failed.length ? `批次完成，${failed.length} 張處理失敗` : '批次處理完成', failed.length ? 'info' : 'success');
        } else {
            progress.textContent = stopped ? '已停止' : '沒有成功處理任何相片';
            if (!stopped) showToast('批次處理失敗', 'error');
        }
        refresh();
    };

    btnOpen.addEventListener('click', () => {
        if (!state.originalImage) {
            showToast('請先開啟一張相片並調整出想要的效果', 'error');
            return;
        }
        if (state.isCropMode) {
            showToast('請先套用或取消裁切', 'error');
            return;
        }
        const saved = loadExportSettings();
        selFormat.value = saved.format || 'image/jpeg';
        rngQuality.value = saved.quality;
        selScale.value = String(saved.scale);
        progress.textContent = '';
        refresh();
        overlay.style.display = 'flex';
    });

    btnPick.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', () => {
        files = Array.from(fileInput.files || []).filter(isImageFile);
        fileInput.value = '';
        progress.textContent = '';
        refresh();
    });
    selFormat.addEventListener('change', refresh);
    rngQuality.addEventListener('input', refresh);
    btnStart.addEventListener('click', run);
    btnCancel.addEventListener('click', () => {
        if (running) cancelRequested = true;
        else close();
    });
    btnClose.addEventListener('click', close);
    overlay.addEventListener('mousedown', (e) => {
        if (e.target === overlay) close();
    });
}

// Kickstart Application
init();

