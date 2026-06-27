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
    renderPending: false
};

// Offscreen Canvas for caching full-resolution adjustments
const sourceCanvas = document.getElementById('source-canvas');
const sourceCtx = sourceCanvas.getContext('2d');

// Constants
const MAX_PREVIEW_DIMENSION = 1200; // Limit preview size for real-time 60fps editing

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

// Browser-based SHA-256 and License Key generation for web fallback
async function generateBrowserKey(hwid) {
    const _p1 = "PhotoEditorPRO";
    const _p2 = "Licensing";
    const _p3 = "System";
    const _p4 = "SecretSalt";
    const _p5 = "2026_@#$!";
    const salt = [_p1, _p2, _p3, _p4, _p5].join("_");

    // Phase 1: SHA256 of hwid + salt (lowercase hex format)
    const msg1 = new TextEncoder().encode(hwid + salt);
    const buf1 = await crypto.subtle.digest('SHA-256', msg1);
    const hash1 = Array.from(new Uint8Array(buf1)).map(b => b.toString(16).padStart(2, '0')).join('').toLowerCase();
    
    // Phase 2: Reverse hash1
    const reversedHash1 = hash1.split('').reverse().join('');
    
    // Phase 3: SHA256 of reversedHash1 + salt + hwid (uppercase hex format)
    const msg2 = new TextEncoder().encode(reversedHash1 + salt + hwid);
    const buf2 = await crypto.subtle.digest('SHA-256', msg2);
    const hash2 = Array.from(new Uint8Array(buf2)).map(b => b.toString(16).padStart(2, '0')).join('').toUpperCase();
    
    // Phase 4: Format as XXXXX-XXXXX-XXXXX-XXXXX
    const cleanHex = hash2.substring(0, 20);
    let serial = "";
    for (let i = 0; i < cleanHex.length; i += 5) {
        if (i > 0) serial += "-";
        serial += cleanHex.substring(i, i + 5);
    }
    return serial;
}

// License Validation Flow
async function checkLicense() {
    const overlay = document.getElementById('license-overlay');
    const displayHwid = document.getElementById('display-hwid');
    const inputKey = document.getElementById('input-license-key');
    const btnActivate = document.getElementById('btn-activate-license');
    const btnCopyHwid = document.getElementById('btn-copy-hwid');
    const errorMsg = document.getElementById('license-error-msg');
    
    if (!overlay) return;

    let isLicensed = false;
    let hwid = "";

    if (window.licenseAPI) {
        // Electron Environment
        isLicensed = await window.licenseAPI.checkLicense();
        hwid = await window.licenseAPI.getHWID();
    } else {
        // Browser Fallback (e.g. development server)
        hwid = "BROWSER-MODE-DEMO-HWID-2026";
        const savedKey = localStorage.getItem('license_key');
        const expectedKey = await generateBrowserKey(hwid);
        isLicensed = (savedKey === expectedKey);
    }

    if (isLicensed) {
        overlay.style.display = 'none';
        return;
    }

    // Show Overlay
    overlay.style.display = 'flex';
    displayHwid.textContent = hwid;

    // Hook up Copy Button
    btnCopyHwid.addEventListener('click', () => {
        navigator.clipboard.writeText(hwid);
        const icon = btnCopyHwid.querySelector('i');
        if (icon) {
            icon.setAttribute('data-lucide', 'check');
            lucide.createIcons();
            setTimeout(() => {
                icon.setAttribute('data-lucide', 'copy');
                lucide.createIcons();
            }, 2000);
        }
    });

    // Hook up Activate Button
    btnActivate.addEventListener('click', async () => {
        const key = inputKey.value.trim().toUpperCase();
        if (!key) return;

        let success = false;
        if (window.licenseAPI) {
            success = await window.licenseAPI.verifyAndSave(key);
        } else {
            const expectedKey = await generateBrowserKey(hwid);
            if (key === expectedKey) {
                localStorage.setItem('license_key', key);
                success = true;
            }
        }

        if (success) {
            errorMsg.style.display = 'none';
            overlay.style.display = 'none';
            lucide.createIcons();
        } else {
            errorMsg.style.display = 'block';
            inputKey.classList.add('error-pulse');
            setTimeout(() => inputKey.classList.remove('error-pulse'), 500);
        }
    });
}

let wasmExports = null;

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
        wasmExports = result.instance.exports;
        
        console.log("Rust WebAssembly Engine loaded!");
        
        if (progress) progress.style.width = '100%';
        if (loadingText) loadingText.textContent = '影像引擎載入成功！';
        
        await new Promise(r => setTimeout(r, 300));
        if (splash) {
            splash.classList.add('fade-out');
        }
    } catch (err) {
        console.error("Failed to load Wasm, using JS fallback engine:", err);
        if (loadingText) loadingText.textContent = 'Wasm 載入失敗，正在使用 JS 引擎...';
        await new Promise(r => setTimeout(r, 800));
        if (splash) {
            splash.classList.add('fade-out');
        }
    }
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
    }
}

function applyPresetWithIntensity(presetName, intensity) {
    if (!state.originalImage || !PRESETS[presetName]) return;
    state.activePreset = presetName;
    
    const targetPreset = PRESETS[presetName];
    const blended = {};
    
    const keys = ['exposure', 'contrast', 'temperature', 'tint', 'saturation', 'highlights', 'shadows', 'whites', 'blacks', 'vibrance', 'clarity', 'dehaze', 'sharpening', 'noiseReduction', 'vignette', 'grain'];
    
    keys.forEach(key => {
        const targetVal = targetPreset[key] !== undefined ? targetPreset[key] : 0;
        blended[key] = Math.round(targetVal * (intensity / 100));
    });
    
    state.adjustments = { ...state.adjustments, ...blended };
    
    Object.keys(blended).forEach(key => {
        if (inputs[key]) {
            inputs[key].value = blended[key];
            const sliderControl = inputs[key].closest('.slider-control');
            const valDisplay = sliderControl ? sliderControl.querySelector('.val-display') : null;
            if (valDisplay) {
                valDisplay.textContent = blended[key] > 0 ? `+${blended[key]}` : blended[key];
            }
        }
    });
    
    requestRender();
}

function setupAutoEnhance() {
    const btnAutoEnhance = document.getElementById('btn-auto-enhance');
    if (btnAutoEnhance) {
        btnAutoEnhance.addEventListener('click', () => {
            if (!state.originalImage) return;
            
            // Analyze the preview image data
            const data = state.previewImageData.data;
            const len = data.length;
            
            let sumLuminance = 0;
            const buckets = new Uint32Array(256);
            
            // Sample every 64th pixel for performance
            for (let i = 0; i < len; i += 64) {
                const r = data[i];
                const g = data[i+1];
                const b = data[i+2];
                const y = Math.round(0.2126 * r + 0.7152 * g + 0.0722 * b);
                sumLuminance += y;
                buckets[y]++;
            }
            
            const sampleCount = len / 64;
            const avgLuminance = sumLuminance / sampleCount;
            
            let count = 0;
            let shadowThreshold = 0;
            let highlightThreshold = 255;
            
            for (let i = 0; i < 256; i++) {
                count += buckets[i];
                if (count >= sampleCount * 0.1 && shadowThreshold === 0) {
                    shadowThreshold = i;
                }
                if (count >= sampleCount * 0.9 && highlightThreshold === 255) {
                    highlightThreshold = i;
                }
            }
            
            let autoExposure = 0;
            if (avgLuminance < 110) {
                autoExposure = Math.round((120 - avgLuminance) * 0.4);
            } else if (avgLuminance > 140) {
                autoExposure = Math.round((125 - avgLuminance) * 0.3);
            }
            autoExposure = Math.max(-30, Math.min(40, autoExposure));
            
            const dynamicRange = highlightThreshold - shadowThreshold;
            let autoContrast = 0;
            if (dynamicRange < 180) {
                autoContrast = Math.round((180 - dynamicRange) * 0.4);
            } else {
                autoContrast = 10;
            }
            autoContrast = Math.max(0, Math.min(40, autoContrast));
            
            let autoShadows = 0;
            if (shadowThreshold < 30) {
                autoShadows = Math.round((30 - shadowThreshold) * 1.2);
            }
            autoShadows = Math.max(0, Math.min(50, autoShadows));
            
            let autoHighlights = 0;
            if (highlightThreshold > 220) {
                autoHighlights = -Math.round((highlightThreshold - 220) * 0.8);
            }
            autoHighlights = Math.max(-50, Math.min(0, autoHighlights));
            
            const autoSaturation = 8;
            const autoVibrance = 15;
            
            const targets = {
                exposure: autoExposure,
                contrast: autoContrast,
                shadows: autoShadows,
                highlights: autoHighlights,
                saturation: autoSaturation,
                vibrance: autoVibrance,
                whites: 5,
                blacks: -5
            };
            
            animateSlidersTo(targets);
            
            btnAutoEnhance.classList.add('btn-auto-enhance-active');
            setTimeout(() => {
                btnAutoEnhance.classList.remove('btn-auto-enhance-active');
            }, 2000);
        });
    }
}

function setupFrames() {
    const frameBtns = document.querySelectorAll('.frame-btn');
    frameBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            frameBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            state.activeFrame = btn.dataset.frame;
            saveHistoryState();
            requestRender();
        });
    });
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

    // Check for license key activation
    checkLicense();

    // Start WASM Loading and splash animation
    initWasm();

    setupDragAndDrop();
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
    setupLegalModal();

    recomputeAllCurveLUTs();
}

// Drag & Drop Setup
function setupDragAndDrop() {
    const handleDragOver = (e) => {
        e.preventDefault();
        e.stopPropagation();
        dropzone.classList.add('dragover');
    };
    
    const handleDragLeave = (e) => {
        e.preventDefault();
        e.stopPropagation();
        dropzone.classList.remove('dragover');
    };
    
    const handleDrop = (e) => {
        e.preventDefault();
        e.stopPropagation();
        dropzone.classList.remove('dragover');
        
        const files = e.dataTransfer.files;
        if (files.length > 0) {
            handleImageFile(files[0]);
        }
    };

    dropzone.addEventListener('dragover', handleDragOver);
    dropzone.addEventListener('dragenter', handleDragOver);
    dropzone.addEventListener('dragleave', handleDragLeave);
    dropzone.addEventListener('drop', handleDrop);
    
    // Clicking dropzone opens file dialog
    dropzone.addEventListener('click', () => fileInput.click());
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
    });
}

function loadSampleImage() {
    showLoading(true);
    state.originalFileName = 'sample-landscape';
    state.originalFormat = 'image/jpeg';
    
    const img = new Image();
    img.onload = () => {
        setupImages(img);
    };
    img.onerror = (err) => {
        showLoading(false);
        console.error(err);
        alert('無法載入範例圖片！');
    };
    img.src = './sample.jpg';
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

// Toolbar Setup (Undo, Redo, Zoom, Download, Reset)
function setupToolbar() {
    btnUndo.addEventListener('click', undo);
    btnRedo.addEventListener('click', redo);
    
    btnZoomIn.addEventListener('click', () => adjustZoom(20));
    btnZoomOut.addEventListener('click', () => adjustZoom(-20));
    btnZoomFit.addEventListener('click', toggleZoomFit);
    
    if (btnReset) {
        btnReset.addEventListener('click', resetAdjustments);
    }
    
    // Compare Button (Hold down to see original image)
    const startCompare = () => {
        if (!state.originalImage) return;
        state.isComparing = true;
        btnCompare.classList.add('active');
        requestRender();
    };

    const stopCompare = () => {
        if (!state.originalImage) return;
        state.isComparing = false;
        btnCompare.classList.remove('active');
        requestRender();
    };

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

    btnDownload.addEventListener('click', downloadHighResImage);

    // Zoom & Pan Mouse Interaction inside canvas wrapper
    canvasWrapper.addEventListener('mousedown', startPanning);
    window.addEventListener('mousemove', panImage);
    window.addEventListener('mouseup', stopPanning);
    
    // Mouse wheel zoom
    canvasWrapper.addEventListener('wheel', (e) => {
        if (!state.originalImage) return;
        e.preventDefault();
        
        const zoomFactor = e.deltaY < 0 ? 10 : -10;
        adjustZoom(zoomFactor);
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
        if (!state.originalImage) return;

        // Ctrl + Z
        if (e.ctrlKey && e.key === 'z') {
            e.preventDefault();
            undo();
        }
        // Ctrl + Y
        if (e.ctrlKey && e.key === 'y') {
            e.preventDefault();
            redo();
        }
        // Ctrl + 0 (Fit zoom)
        if (e.ctrlKey && e.key === '0') {
            e.preventDefault();
            toggleZoomFit();
        }
        // Ctrl + = or Ctrl + + (Zoom In)
        if (e.ctrlKey && (e.key === '=' || e.key === '+')) {
            e.preventDefault();
            adjustZoom(25);
        }
        // Ctrl + - (Zoom Out)
        if (e.ctrlKey && e.key === '-') {
            e.preventDefault();
            adjustZoom(-25);
        }
    });
}

/* ==========================================
 * CORE IMAGE LOADING
 * ========================================== */

function handleImageFile(file) {
    if (!file.type.startsWith('image/')) {
        alert('請上傳有效的相片檔案！');
        return;
    }

    showLoading(true);
    
    state.originalFileName = file.name.substring(0, file.name.lastIndexOf('.')) || 'edited-photo';
    state.originalFormat = file.type;
    
    const reader = new FileReader();
    reader.onload = (event) => {
        const img = new Image();
        img.onload = () => {
            setupImages(img);
        };
        img.onerror = () => {
            showLoading(false);
            alert('載入圖片時出錯！');
        };
        img.src = event.target.result;
    };
    reader.readAsDataURL(file);
}

function setupImages(img) {
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
    document.getElementById('input-straighten').value = 0;
    document.getElementById('straighten-val').textContent = '0°';
    document.getElementById('crop-aspect').value = 'free';
    
    // Reset Curves
    state.curves = {
        rgb: [{ x: 0, y: 0 }, { x: 255, y: 255 }],
        red: [{ x: 0, y: 0 }, { x: 255, y: 255 }],
        green: [{ x: 0, y: 0 }, { x: 255, y: 255 }],
        blue: [{ x: 0, y: 0 }, { x: 255, y: 255 }]
    };
    state.activeCurveChannel = 'rgb';
    state.selectedCurvePoint = -1;
    recomputeAllCurveLUTs();
    
    // Reset HSL
    state.hsl = {
        hue: { red: 0, orange: 0, yellow: 0, green: 0, aqua: 0, blue: 0, purple: 0, magenta: 0 },
        saturation: { red: 0, orange: 0, yellow: 0, green: 0, aqua: 0, blue: 0, purple: 0, magenta: 0 },
        luminance: { red: 0, orange: 0, yellow: 0, green: 0, aqua: 0, blue: 0, purple: 0, magenta: 0 }
    };
    state.activeHslTab = 'hue';
    document.querySelectorAll('.hsl-tab-btn').forEach(btn => btn.classList.remove('active'));
    const defaultHslTab = document.querySelector('.hsl-tab-btn[data-tab="hue"]');
    if (defaultHslTab) defaultHslTab.classList.add('active');
    updateHslSlidersUI();
    
    // Calculate preview size (bound within MAX_PREVIEW_DIMENSION)
    let pWidth = img.width;
    let pHeight = img.height;
    if (pWidth > MAX_PREVIEW_DIMENSION || pHeight > MAX_PREVIEW_DIMENSION) {
        if (pWidth > pHeight) {
            pHeight = Math.round((pHeight * MAX_PREVIEW_DIMENSION) / pWidth);
            pWidth = MAX_PREVIEW_DIMENSION;
        } else {
            pWidth = Math.round((pWidth * MAX_PREVIEW_DIMENSION) / pHeight);
            pHeight = MAX_PREVIEW_DIMENSION;
        }
    }
    
    state.previewWidth = pWidth;
    state.previewHeight = pHeight;
    
    // Initialize Offscreen Preview Canvas
    state.previewCanvas = document.createElement('canvas');
    state.previewCanvas.width = pWidth;
    state.previewCanvas.height = pHeight;
    state.previewCtx = state.previewCanvas.getContext('2d');
    state.previewCtx.drawImage(img, 0, 0, pWidth, pHeight);
    
    // Cache raw preview image data for speed
    state.previewImageData = state.previewCtx.getImageData(0, 0, pWidth, pHeight);
    
    // Set up viewport editor canvas dimensions
    state.editorCanvas.width = pWidth;
    state.editorCanvas.height = pHeight;
    
    // Display Dimensions Info
    dimensionsDisplay.textContent = `${state.width} × ${state.height} px`;
    
    // Reset all adjustments
    resetAdjustmentsState();
    
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
    
    // Reset selected frame
    state.activeFrame = 'none';
    const frameBtns = document.querySelectorAll('.frame-btn');
    frameBtns.forEach(btn => {
        if (btn.dataset.frame === 'none') {
            btn.classList.add('active');
        } else {
            btn.classList.remove('active');
        }
    });
    
    // Adjust layout zoom
    fitImageToViewport();
    
    showLoading(false);
    requestRender();
}

/* ==========================================
 * PRESET AND ADJUSTMENT CONTROL
 * ========================================== */

function applyPreset(presetName) {
    if (!state.originalImage || !PRESETS[presetName]) return;
    state.activePreset = presetName;
    
    // Highlight the active preset button
    clearPresetHighlights();
    const activeBtn = Array.from(presetButtons).find(btn => btn.dataset.preset === presetName);
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
    animateSlidersTo(PRESETS[presetName]);
}

function clearPresetHighlights() {
    presetButtons.forEach(btn => btn.classList.remove('active'));
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
        
        if (input.type === 'range') {
            const defVal = (key === 'watermarkSize' || key === 'watermarkOpacity') ? 50 : 0;
            input.value = defVal;
            const sliderControl = input.closest('.slider-control');
            const valDisplay = sliderControl ? sliderControl.querySelector('.val-display') : null;
            if (valDisplay) {
                valDisplay.textContent = String(defVal);
            }
        } else if (input.tagName === 'SELECT') {
            if (key === 'watermarkColor') input.value = '#ffffff';
            else if (key === 'watermarkPosition') input.value = 'bottom-right';
        } else if (input.type === 'text') {
            input.value = '';
        }
    });
    
    clearPresetHighlights();
    const origBtn = Array.from(presetButtons).find(btn => btn.dataset.preset === 'original');
    if (origBtn) origBtn.classList.add('active');
}
function resetAdjustments() {
    if (!state.originalImage) return;
    
    resetAdjustmentsState();
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
    if (!state.originalImage) return;
    
    // If comparing mode, render original preview image directly
    if (state.isComparing) {
        state.editorCtx.putImageData(state.previewImageData, 0, 0);
        drawHistogram(state.previewImageData);
        return;
    }
    
    // Get target imageData container
    const outputImageData = state.editorCtx.createImageData(state.previewWidth, state.previewHeight);
    
    // Generate pre-blurred data if sharpening or noise reduction is active
    let blurredData = null;
    if (state.adjustments.sharpening > 0 || state.adjustments.noiseReduction > 0) {
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = state.previewWidth;
        tempCanvas.height = state.previewHeight;
        const tempCtx = tempCanvas.getContext('2d');
        tempCtx.filter = 'blur(1.5px)';
        tempCtx.drawImage(state.previewCanvas, 0, 0);
        blurredData = tempCtx.getImageData(0, 0, state.previewWidth, state.previewHeight).data;
    }
    
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
        drawWatermark(state.editorCtx, state.previewWidth, state.previewHeight, state.adjustments);
    }
    
    // Draw artistic frame if configured
    if (state.activeFrame && state.activeFrame !== 'none') {
        drawFrame(state.editorCtx, state.previewWidth, state.previewHeight, state.activeFrame);
    }
    
    // Update live histogram
    drawHistogram(outputImageData);
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
    
    const srcPtr = wasmExports.alloc(len);
    const srcHeap = new Uint8Array(wasmExports.memory.buffer, srcPtr, len);
    srcHeap.set(srcImageData.data);
    
    const dstPtr = wasmExports.alloc(len);
    
    let blurredPtr = 0;
    if (blurred) {
        blurredPtr = wasmExports.alloc(len);
        const blurredHeap = new Uint8Array(wasmExports.memory.buffer, blurredPtr, len);
        blurredHeap.set(blurred);
    }
    
    const curvesBuffer = new Uint8Array(1024);
    curvesBuffer.set(state.curveLUTs.rgb, 0);
    curvesBuffer.set(state.curveLUTs.red, 256);
    curvesBuffer.set(state.curveLUTs.green, 512);
    curvesBuffer.set(state.curveLUTs.blue, 768);
    
    const curvesPtr = wasmExports.alloc(1024);
    const curvesHeap = new Uint8Array(wasmExports.memory.buffer, curvesPtr, 1024);
    curvesHeap.set(curvesBuffer);
    
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
    
    const hslPtr = wasmExports.alloc(24 * 4);
    const hslHeap = new Float32Array(wasmExports.memory.buffer, hslPtr, 24);
    hslHeap.set(hslBuffer);
    
    const expFactor = adj.exposure;
    const contrastFactor = adj.contrast;
    
    const tRed = adj.temperature > 0 ? adj.temperature * 0.5 : adj.temperature * 0.2;
    const tBlue = adj.temperature > 0 ? -adj.temperature * 0.5 : -adj.temperature * 0.75;
    const tGreen = adj.temperature > 0 ? adj.temperature * 0.08 : adj.temperature * 0.08;

    const tintRed = adj.tint * 0.25;
    const tintGreen = -adj.tint * 0.35;
    const tintBlue = adj.tint * 0.25;

    const satFactor = (adj.saturation + 100) / 100;
    
    const hFactor = adj.highlights * 0.35;
    const sFactor = adj.shadows * 0.35;
    const wFactor = adj.whites * 0.25;
    const bFactor = adj.blacks * 0.25;
    
    const vibFactor = adj.vibrance * 0.01;
    const clarityFactor = adj.clarity * 0.01;
    const dhFactor = adj.dehaze * 0.01;
    
    const sharpFactor = adj.sharpening * 0.01 * 1.5;
    const nrFactor = adj.noiseReduction * 0.01 * 0.8;
    const vigFactor = adj.vignette * 0.01;
    const grainFactor = adj.grain * 0.01;
    
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
    const hasSplitToning = (adj.splitHighlightSat > 0 || adj.splitShadowSat > 0) ? 1 : 0;
    const balanceFactor = adj.splitBalance * 0.01;
    
    wasmExports.process_pixels(
        srcPtr,
        dstPtr,
        len,
        w,
        h,
        expFactor,
        contrastFactor,
        tRed, tGreen, tBlue,
        tintRed, tintGreen, tintBlue,
        satFactor,
        hFactor, sFactor, wFactor, bFactor,
        vibFactor, clarityFactor, dhFactor,
        sharpFactor, nrFactor, vigFactor, grainFactor,
        hR, hG, hB,
        sR, sG, sB,
        hasSplitToning,
        balanceFactor,
        hasCurves,
        curvesPtr,
        hasHsl,
        hslPtr,
        blurredPtr
    );
    
    const dstHeap = new Uint8Array(wasmExports.memory.buffer, dstPtr, len);
    dstImageData.data.set(dstHeap);
    
    wasmExports.dealloc(srcPtr, len);
    wasmExports.dealloc(dstPtr, len);
    wasmExports.dealloc(curvesPtr, 1024);
    wasmExports.dealloc(hslPtr, 24 * 4);
    if (blurredPtr) {
        wasmExports.dealloc(blurredPtr, len);
    }
}

function applyFilterPipeline(srcData, dstData, adj, blurred = null) {
    if (wasmExports) {
        applyFilterPipelineWasm(srcData, dstData, adj, blurred);
    } else {
        applyFilterPipelineJS(srcData, dstData, adj, blurred);
    }
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
    
    // 3. Color Temperature precomputation
    const tRed = adj.temperature > 0 ? adj.temperature * 0.5 : adj.temperature * 0.2;
    const tBlue = adj.temperature > 0 ? -adj.temperature * 0.5 : -adj.temperature * 0.75;
    const tGreen = adj.temperature > 0 ? adj.temperature * 0.08 : adj.temperature * 0.08;

    // 4. Tint precomputation
    const tintRed = adj.tint * 0.25;
    const tintGreen = -adj.tint * 0.35;
    const tintBlue = adj.tint * 0.25;

    // 5. Saturation precomputation
    const satFactor = (adj.saturation + 100) / 100;
    
    // Advanced Tone controls precomputation
    const hFactor = adj.highlights * 0.35;
    const sFactor = adj.shadows * 0.35;
    const wFactor = adj.whites * 0.25;
    const bFactor = adj.blacks * 0.25;
    
    // Presence precomputation
    const vibFactor = adj.vibrance * 0.01;
    const clarityFactor = adj.clarity * 0.01;
    const dhFactor = adj.dehaze * 0.01;
    
    // Details & Effects precomputation
    const sharpFactor = adj.sharpening * 0.01 * 1.5;
    const nrFactor = adj.noiseReduction * 0.01 * 0.8;
    const vigFactor = adj.vignette * 0.01;
    const grainFactor = adj.grain * 0.01;
    
    // Split Toning precomputation
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
    const hasSplitToning = (adj.splitHighlightSat > 0 || adj.splitShadowSat > 0);
    const balanceFactor = adj.splitBalance * 0.01;

    // Precheck: Are curves active?
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
                const vn = v / 255;
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
            
            r = state.curveLUTs.red[Math.round(rc)];
            g = state.curveLUTs.green[Math.round(gc)];
            b = state.curveLUTs.blue[Math.round(bc)];
            
            r = state.curveLUTs.rgb[Math.round(r)];
            g = state.curveLUTs.rgb[Math.round(g)];
            b = state.curveLUTs.rgb[Math.round(b)];
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
            const noise = (((i * 9301 + 49297) % 233280) / 233280 - 0.5) * grainFactor * 0.12 * 255;
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

function updateCanvasTransform() {
    canvasWrapper.style.transform = `translate(${state.pan.x}px, ${state.pan.y}px) scale(${state.zoom / 100})`;
    zoomDisplay.textContent = `${Math.round(state.zoom)}%`;
    
    if (state.zoom > 100 || !state.isFit) {
        canvasWrapper.classList.add('grab-mode');
    } else {
        canvasWrapper.classList.remove('grab-mode');
    }
}

function adjustZoom(amount) {
    if (!state.originalImage) return;
    
    state.isFit = false;
    const oldZoom = state.zoom;
    state.zoom = Math.max(10, Math.min(500, state.zoom + amount));
    
    if (state.zoom !== oldZoom) {
        state.pan.x = (state.pan.x * state.zoom) / oldZoom;
        state.pan.y = (state.pan.y * state.zoom) / oldZoom;
    }
    
    updateCanvasTransform();
}

function toggleZoomFit() {
    if (!state.originalImage) return;
    
    if (state.isFit) {
        state.isFit = false;
        state.zoom = 100;
        state.pan = { x: 0, y: 0 };
    } else {
        fitImageToViewport();
    }
    updateCanvasTransform();
}

function fitImageToViewport() {
    const viewport = document.getElementById('viewport');
    const vw = viewport.clientWidth - 80;
    const vh = viewport.clientHeight - 80;
    
    const wRatio = vw / state.previewWidth;
    const hRatio = vh / state.previewHeight;
    const fitRatio = Math.min(wRatio, hRatio, 1.0);
    
    state.zoom = fitRatio * 100;
    state.isFit = true;
    state.pan = { x: 0, y: 0 };
    updateCanvasTransform();
}

// Pan interactions
function startPanning(e) {
    if (!state.originalImage) return;
    
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
    if (state.historyIndex < state.history.length - 1) {
        state.history = state.history.slice(0, state.historyIndex + 1);
    }
    
    // Save complete snapshot of all Lightroom controls
    const snapshot = {
        adjustments: { ...state.adjustments },
        curves: JSON.parse(JSON.stringify(state.curves)),
        hsl: JSON.parse(JSON.stringify(state.hsl)),
        cropTransform: JSON.parse(JSON.stringify(state.cropTransform))
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
    if (state.historyIndex > 0) {
        state.historyIndex--;
        restoreHistoryState();
    }
}

function redo() {
    if (state.historyIndex < state.history.length - 1) {
        state.historyIndex++;
        restoreHistoryState();
    }
}

function restoreHistoryState() {
    const snapshot = JSON.parse(state.history[state.historyIndex]);
    state.adjustments = snapshot.adjustments;
    state.curves = snapshot.curves;
    state.hsl = snapshot.hsl;
    state.cropTransform = snapshot.cropTransform;

    // Update inputs visual values
    Object.keys(state.adjustments).forEach(key => {
        const input = inputs[key];
        if (input) {
            input.value = state.adjustments[key];
            const sliderControl = input.closest('.slider-control');
            const valDisplay = sliderControl ? sliderControl.querySelector('.val-display') : null;
            if (valDisplay) {
                const val = state.adjustments[key];
                valDisplay.textContent = typeof val === 'number' && val > 0 ? `+${val}` : val;
            }
        }
    });
    

    
    // Update HSL sliders visual values
    updateHslSlidersUI();
    
    // Recompute Curve LUTs and redraw curve editor
    recomputeAllCurveLUTs();
    drawCurveEditor();
    
    // Recompute Cropped Preview Canvas if cropTransform changed
    updateCroppedPreview();
    
    // Check if it matches any presets to highlight buttons
    let matchedPreset = 'custom';
    
    // Checks if advanced elements are at default state (curves identity, HSL zero, crop null)
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
    
    const isCropDefault = (state.cropTransform.crop === null && state.cropTransform.rotate === 0 && state.cropTransform.straighten === 0 && !state.cropTransform.flipH && !state.cropTransform.flipV);
    
    if (isHslDefault && isCurvesDefault && isCropDefault) {
        Object.keys(PRESETS).forEach(pName => {
            const preset = PRESETS[pName];
            let match = true;
            Object.keys(preset).forEach(key => {
                if (preset[key] !== state.adjustments[key]) match = false;
            });
            if (match) matchedPreset = pName;
        });
    }
    
    state.activePreset = matchedPreset;
    clearPresetHighlights();
    const activeBtn = Array.from(presetButtons).find(btn => btn.dataset.preset === matchedPreset);
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

function downloadHighResImage() {
    if (!state.originalImage) return;
    
    showLoading(true);
    
    setTimeout(() => {
        try {
            // Get cropped, rotated, flipped canvas at full resolution
            const croppedCanvas = getCroppedCanvas(state.originalImage, false);
            const croppedCtx = croppedCanvas.getContext('2d');
            const w = croppedCanvas.width;
            const h = croppedCanvas.height;
            
            const srcImageData = croppedCtx.getImageData(0, 0, w, h);
            const dstImageData = croppedCtx.createImageData(w, h);
            
            // Generate blurred data if sharpening or noise reduction is active
            let blurredData = null;
            if (state.adjustments.sharpening > 0 || state.adjustments.noiseReduction > 0) {
                const tempCanvas = document.createElement('canvas');
                tempCanvas.width = w;
                tempCanvas.height = h;
                const tempCtx = tempCanvas.getContext('2d');
                tempCtx.filter = 'blur(1.5px)';
                tempCtx.drawImage(croppedCanvas, 0, 0);
                blurredData = tempCtx.getImageData(0, 0, w, h).data;
            }
            
            applyFilterPipeline(srcImageData, dstImageData, state.adjustments, blurredData);
            
            croppedCtx.putImageData(dstImageData, 0, 0);
            
            // Draw watermark if configured
            if (state.adjustments.watermarkText) {
                drawWatermark(croppedCtx, w, h, state.adjustments);
            }
            
            // Draw artistic frame if configured
            if (state.activeFrame && state.activeFrame !== 'none') {
                drawFrame(croppedCtx, w, h, state.activeFrame);
            }
            const dataUrl = croppedCanvas.toDataURL(state.originalFormat, 0.95);
            const link = document.createElement('a');
            
            let suffix = '';
            if (state.activePreset !== 'original' && state.activePreset !== 'custom') {
                suffix = `-${state.activePreset}`;
            } else if (state.activePreset === 'custom') {
                suffix = '-edited';
            }
            
            let ext = 'jpg';
            if (state.originalFormat === 'image/png') ext = 'png';
            else if (state.originalFormat === 'image/webp') ext = 'webp';
            
            link.download = `${state.originalFileName}${suffix}.${ext}`;
            link.href = dataUrl;
            
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        } catch (error) {
            console.error(error);
            alert('儲存相片時發生錯誤，請再試一次。');
        } finally {
            showLoading(false);
        }
    }, 100);
}

/* ==========================================
 * SMOOTH PRESET TRANSITIONS & GUI LOADING HELPERS
 * ========================================== */

function animateSlidersTo(targets) {
    const steps = 15;
    const duration = 250; // ms
    const stepTime = duration / steps;
    
    const defaultAdjustments = {
        exposure: 0, contrast: 0, temperature: 0, tint: 0, saturation: 0,
        highlights: 0, shadows: 0, whites: 0, blacks: 0,
        vibrance: 0, clarity: 0, dehaze: 0,
        sharpening: 0, noiseReduction: 0, vignette: 0, grain: 0
    };
    
    const fullTargets = { ...defaultAdjustments, ...targets };
    const startValues = { ...state.adjustments };
    let currentStep = 0;
    
    const interval = setInterval(() => {
        currentStep++;
        const ratio = currentStep / steps;
        
        Object.keys(fullTargets).forEach(key => {
            const start = startValues[key] !== undefined ? startValues[key] : 0;
            const target = fullTargets[key];
            const currentVal = Math.round(start + (target - start) * ratio);
            
            state.adjustments[key] = currentVal;
            
            // Update Slider UI
            if (inputs[key]) {
                inputs[key].value = currentVal;
                const valDisplay = inputs[key].closest('.slider-control').querySelector('.val-display');
                if (valDisplay) {
                    valDisplay.textContent = currentVal > 0 ? `+${currentVal}` : currentVal;
                }
            }
        });
        
        requestRender();
        
        if (currentStep >= steps) {
            clearInterval(interval);
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
            if (points.length < 10) {
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

function setupCropMode() {
    const btnToggle = document.getElementById('btn-crop-toggle');
    const cropToolbar = document.getElementById('crop-toolbar');
    const overlay = document.getElementById('crop-overlay-container');
    
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
        updateCroppedPreview();
    });
    inputStraighten.addEventListener('change', () => {
        const cropBoxEl = document.getElementById('crop-box');
        if (cropBoxEl) cropBoxEl.classList.remove('straightening');
        saveHistoryState();
    });
    
    document.getElementById('crop-aspect').addEventListener('change', () => {
        if (state.isCropMode) {
            resetActiveCropBox();
        }
    });
    
    setupCropInteraction();
}

function enterCropMode() {
    state.isCropMode = true;
    document.getElementById('btn-crop-toggle').classList.add('active');
    document.getElementById('crop-toolbar').style.display = 'block';
    document.getElementById('crop-overlay-container').style.display = 'block';
    
    // Backup the crop state
    state.backupCropTransform = JSON.parse(JSON.stringify(state.cropTransform));
    
    if (state.cropTransform.crop) {
        state.activeCropBox = { ...state.cropTransform.crop };
    } else {
        state.activeCropBox = { x: 0, y: 0, w: 1, h: 1 };
    }
    drawCropBoxUI();
}

function exitCropMode(apply) {
    state.isCropMode = false;
    document.getElementById('btn-crop-toggle').classList.remove('active');
    document.getElementById('crop-toolbar').style.display = 'none';
    document.getElementById('crop-overlay-container').style.display = 'none';
    
    if (apply) {
        const cb = state.activeCropBox;
        if (cb.x < 0.01 && cb.y < 0.01 && cb.w > 0.99 && cb.h > 0.99) {
            state.cropTransform.crop = null;
        } else {
            state.cropTransform.crop = { ...cb };
        }
        updateCroppedPreview();
        saveHistoryState();
    } else {
        // Cancel: Restore backup state
        if (state.backupCropTransform) {
            state.cropTransform = state.backupCropTransform;
        }
        
        // Restore straighten slider visually
        const straightenSlider = document.getElementById('input-straighten');
        if (straightenSlider) {
            straightenSlider.value = state.cropTransform.straighten;
            document.getElementById('straighten-val').textContent = `${state.cropTransform.straighten > 0 ? '+' : ''}${state.cropTransform.straighten}°`;
        }
        
        // Redraw preview using restored transforms
        updateCroppedPreview();
    }
}

function resetActiveCropBox() {
    const aspect = document.getElementById('crop-aspect').value;
    let aspectVal = null;
    if (aspect === '1:1') aspectVal = 1;
    else if (aspect === '4:3') aspectVal = 4/3;
    else if (aspect === '16:9') aspectVal = 16/9;
    else if (aspect === '3:2') aspectVal = 3/2;
    else if (aspect === '5:7') aspectVal = 5/7;
    else if (aspect === 'original') aspectVal = state.width / state.height;
    
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

function updateCroppedPreview() {
    if (!state.originalImage) return;
    showLoading(true);
    setTimeout(() => {
        state.previewCanvas = getCroppedCanvas(state.originalImage, true);
        state.previewCtx = state.previewCanvas.getContext('2d');
        state.previewWidth = state.previewCanvas.width;
        state.previewHeight = state.previewCanvas.height;
        state.previewImageData = state.previewCtx.getImageData(0, 0, state.previewWidth, state.previewHeight);
        
        state.editorCanvas.width = state.previewWidth;
        state.editorCanvas.height = state.previewHeight;
        
        fitImageToViewport();
        showLoading(false);
        requestRender();
    }, 50);
}

function getCroppedCanvas(sourceImg, preview = false) {
    const srcW = sourceImg.width;
    const srcH = sourceImg.height;
    
    const tempCanvas = document.createElement('canvas');
    const tempCtx = tempCanvas.getContext('2d');
    
    const transform = state.cropTransform;
    const crop = transform.crop || { x: 0, y: 0, w: 1, h: 1 };
    const rotate = transform.rotate;
    const straighten = transform.straighten * Math.PI / 180;
    const flipH = transform.flipH;
    const flipV = transform.flipV;
    
    const cx = crop.x * srcW;
    const cy = crop.y * srcH;
    const cw = crop.w * srcW;
    const ch = crop.h * srcH;
    
    const isSwapped = (rotate === 90 || rotate === 270);
    const finalW = isSwapped ? ch : cw;
    const finalH = isSwapped ? cw : ch;
    
    let destW = finalW;
    let destH = finalH;
    
    if (preview && (finalW > MAX_PREVIEW_DIMENSION || finalH > MAX_PREVIEW_DIMENSION)) {
        if (finalW > finalH) {
            destH = Math.round((finalH * MAX_PREVIEW_DIMENSION) / finalW);
            destW = MAX_PREVIEW_DIMENSION;
        } else {
            destW = Math.round((finalW * MAX_PREVIEW_DIMENSION) / finalH);
            destH = MAX_PREVIEW_DIMENSION;
        }
    }
    
    tempCanvas.width = destW;
    tempCanvas.height = destH;
    
    tempCtx.save();
    tempCtx.translate(destW / 2, destH / 2);
    tempCtx.scale(flipH ? -1 : 1, flipV ? -1 : 1);
    tempCtx.rotate(straighten);
    tempCtx.rotate(rotate * Math.PI / 180);
    
    const drawW = isSwapped ? destH : destW;
    const drawH = isSwapped ? destW : destH;
    
    tempCtx.drawImage(
        sourceImg,
        cx, cy, cw, ch,
        -drawW / 2, -drawH / 2, drawW, drawH
    );
    
    tempCtx.restore();
    return tempCanvas;
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
    
    const aspect = document.getElementById('crop-aspect').value;
    let aspectVal = null;
    if (aspect === '1:1') aspectVal = 1;
    else if (aspect === '4:3') aspectVal = 4 / 3;
    else if (aspect === '16:9') aspectVal = 16 / 9;
    else if (aspect === '3:2') aspectVal = 3 / 2;
    else if (aspect === '5:7') aspectVal = 5 / 7;
    else if (aspect === 'original') aspectVal = state.width / state.height;
    
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
    ctx.font = `500 ${baseSize}px 'Plus Jakarta Sans', 'Noto Sans TC', sans-serif`;
    
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

// Kickstart Application
init();

