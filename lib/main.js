// ========== 全局变量定义 ==========
var selectedCarriers = []; // 自动选择的载体列表
var hiddenFileTotalSize = 0; // 隐藏文件总大小（字节）
var extractedChunks = []; // 存储提取到的分块数据
var expectedChunkCount = 0; // 预期的分块总数
var processedImagesForDownload = []; // 存储处理后的图片数据，用于下载按钮
var imagesToDecode = []; // 存储所有导入的待提取图片

// ========== 工具函数 ==========
// 格式化文件大小
function formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// 固定高强度密码（用户未输入密码时自动使用，对用户完全透明）
var DEFAULT_HIGH_STRENGTH_PASSWORD = 'PlSt3g0_S3cur3_K3y_2024!@#$QwErTyUiOp';

// 将用户输入的弱口令确定性派生为高强度口令。
// 同一个输入 + 同一个固定种子，每次都会得到同一个输出，便于加密和提取端一致匹配。
var PASSWORD_DERIVATION_SEED = 'PassLok::DeterministicPasswordSeed::2026-04';

function deriveHighStrengthPassword(rawPassword) {
  var input = String(rawPassword || '').trim();
  if (!input) {
    input = DEFAULT_HIGH_STRENGTH_PASSWORD;
  }

  var seed = PASSWORD_DERIVATION_SEED + '|' + input;
  var hash = 2166136261 >>> 0;
  var mixed = '';
  var i;

  for (i = 0; i < seed.length; i++) {
    hash ^= seed.charCodeAt(i);
    hash = Math.imul(hash, 16777619) >>> 0;
    hash ^= hash >>> 13;
    hash = Math.imul(hash ^ (hash >>> 16), 2246822507) >>> 0;
  }

  function nextWord(state) {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return state >>> 0;
  }

  var state = hash ^ 0x9E3779B9;
  var chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*()-_=+[]{}<>?/|~';
  var desiredLength = 64;

  while (mixed.length < desiredLength) {
    state = nextWord(state);
    mixed += chars.charAt(state % chars.length);
  }

  // 保证至少包含大小写字母、数字、符号，避免短弱输入产生低熵样式。
  mixed = mixed.split('');
  mixed[0] = 'A';
  mixed[1] = 'a';
  mixed[2] = '9';
  mixed[3] = '!';
  return mixed.join('');
}

function normalizePasswordChain(passwordValue) {
  var parts = String(passwordValue || '').split('|');
  for (var i = 0; i < parts.length; i++) {
    parts[i] = deriveHighStrengthPassword(parts[i]);
  }
  return parts;
}

// ========== 进度条控制函数 ==========
var progressContainer = null;
var progressBar = null;
var progressText = null;
var progressPercent = null;
var progressDetails = null;
var textBoxProgressContainer = null;
var textBoxProgressBar = null;
var textBoxProgressText = null;
var textBoxProgressPercent = null;
var textBoxProgressDetails = null;
var activeTextBoxConversions = 0;
var progressUiStates = {
    main: null,
    text: null
};
var webpSupportState = null;
var passwordCopyPromptEnabled = true;

// 初始化进度条元素
function initProgressBar() {
    progressContainer = document.getElementById('progressContainer');
    progressBar = document.getElementById('progressBar');
    progressText = document.getElementById('progressText');
    progressPercent = document.getElementById('progressPercent');
    progressDetails = document.getElementById('progressDetails');
}

function initTextBoxProgressBar() {
    textBoxProgressContainer = document.getElementById('textBoxProgressContainer');
    textBoxProgressBar = document.getElementById('textBoxProgressBar');
    textBoxProgressText = document.getElementById('textBoxProgressText');
    textBoxProgressPercent = document.getElementById('textBoxProgressPercent');
    textBoxProgressDetails = document.getElementById('textBoxProgressDetails');
}

// 显示进度条
function clampProgressValue(percent) {
    if (isNaN(percent)) return 0;
    return Math.max(0, Math.min(100, percent));
}

function getProgressElements(key) {
    if (key === 'text') {
        if (!textBoxProgressContainer) initTextBoxProgressBar();
        return {
            container: textBoxProgressContainer,
            bar: textBoxProgressBar,
            text: textBoxProgressText,
            percent: textBoxProgressPercent,
            details: textBoxProgressDetails
        };
    }

    if (!progressContainer) initProgressBar();
    return {
        container: progressContainer,
        bar: progressBar,
        text: progressText,
        percent: progressPercent,
        details: progressDetails
    };
}

function getProgressUiState(key) {
    if (!progressUiStates[key]) {
        progressUiStates[key] = {
            visible: false,
            displayedPercent: 0,
            targetPercent: 0,
            rafId: 0,
            autoTimer: 0,
            hideTimer: 0
        };
    }
    return progressUiStates[key];
}

function renderProgressUi(key) {
    var elements = getProgressElements(key);
    var state = getProgressUiState(key);
    if (!elements.container || !elements.bar || !elements.percent) return;

    var safePercent = clampProgressValue(state.displayedPercent);
    elements.bar.style.width = safePercent.toFixed(2) + '%';
    elements.percent.textContent = Math.round(safePercent) + '%';
}

function animateProgressUi(key) {
    var state = getProgressUiState(key);
    if (state.rafId) return;

    function step() {
        var delta = state.targetPercent - state.displayedPercent;
        if (Math.abs(delta) < 0.12) {
            state.displayedPercent = state.targetPercent;
        } else {
            state.displayedPercent += delta * 0.18;
        }

        renderProgressUi(key);

        if (Math.abs(state.targetPercent - state.displayedPercent) < 0.12) {
            state.displayedPercent = state.targetPercent;
            renderProgressUi(key);
            state.rafId = 0;
            return;
        }

        state.rafId = requestAnimationFrame(step);
    }

    state.rafId = requestAnimationFrame(step);
}

function stopProgressAutoAdvance(key) {
    var state = getProgressUiState(key);
    if (state.autoTimer) {
        clearInterval(state.autoTimer);
        state.autoTimer = 0;
    }
}

function startProgressAutoAdvance(key) {
    var state = getProgressUiState(key);
    if (state.autoTimer) return;

    state.autoTimer = setInterval(function() {
        if (!state.visible) {
            stopProgressAutoAdvance(key);
            return;
        }

        if (state.targetPercent >= 92) return;

        var nextPercent = state.targetPercent + Math.max(0.6, (92 - state.targetPercent) * 0.08);
        state.targetPercent = clampProgressValue(Math.min(92, nextPercent));
        animateProgressUi(key);
    }, 180);
}

function showManagedProgress(key, text, initialPercent) {
    var elements = getProgressElements(key);
    var state = getProgressUiState(key);
    if (!elements.container) return;

    if (state.hideTimer) {
        clearTimeout(state.hideTimer);
        state.hideTimer = 0;
    }

    state.visible = true;
    state.displayedPercent = 0;
    state.targetPercent = clampProgressValue(initialPercent || 0);

    elements.container.style.display = 'block';
    if (text !== undefined && elements.text) {
        elements.text.textContent = text;
    }
    if (elements.details) {
        elements.details.textContent = '';
    }

    renderProgressUi(key);
    startProgressAutoAdvance(key);
    animateProgressUi(key);
}

function updateManagedProgress(key, percent, details, text) {
    var elements = getProgressElements(key);
    var state = getProgressUiState(key);
    if (!elements.container) return;

    var clamped = clampProgressValue(percent);
    state.targetPercent = clamped === 0 ? 0 : Math.max(state.targetPercent, clamped);

    if (text !== undefined && elements.text) {
        elements.text.textContent = text;
    }
    if (details !== undefined && elements.details) {
        elements.details.textContent = details;
    }

    if (clamped >= 99) {
        stopProgressAutoAdvance(key);
    } else {
        startProgressAutoAdvance(key);
    }

    animateProgressUi(key);
}

function finishManagedProgress(key) {
    var elements = getProgressElements(key);
    var state = getProgressUiState(key);
    if (!elements.container) return;

    stopProgressAutoAdvance(key);
    state.visible = false;
    state.targetPercent = 100;
    animateProgressUi(key);

    if (state.hideTimer) {
        clearTimeout(state.hideTimer);
    }
    state.hideTimer = setTimeout(function() {
        elements.container.style.display = 'none';
        state.displayedPercent = 0;
        state.targetPercent = 0;
        renderProgressUi(key);
        if (elements.details) {
            elements.details.textContent = '';
        }
    }, 260);
}

function showProgressBar(text) {
    showManagedProgress('main', text || '处理中...', 2);
}

function updateProgress(percent, details) {
    updateManagedProgress('main', percent, details);
}

function hideProgressBar() {
    finishManagedProgress('main');
}

function showTextBoxProgressBar(text) {
    showManagedProgress('text', text || '正在转换文件...', 3);
}

function updateTextBoxProgressBar(percent, details) {
    updateManagedProgress('text', percent, details);
}

function hideTextBoxProgressBar() {
    finishManagedProgress('text');
}

function beginTextBoxConversionProgress(text, percent, details) {
    activeTextBoxConversions++;
    showTextBoxProgressBar(text || '正在转换文件...');
    updateTextBoxProgressBar(Math.max(4, percent || 0), details || '');
}

function endTextBoxConversionProgress() {
    activeTextBoxConversions = Math.max(0, activeTextBoxConversions - 1);
    if (activeTextBoxConversions === 0) {
        hideTextBoxProgressBar();
    }
}

function loadPasswordCopyPromptState() {
    try {
        var stored = localStorage.getItem('passwordCopyPromptEnabled');
        if (stored !== null) {
            return stored === 'true';
        }
    } catch (e) {
        console.error('加载密码复制提示状态失败', e);
    }
    return true;
}

function savePasswordCopyPromptState(enabled) {
    try {
        localStorage.setItem('passwordCopyPromptEnabled', String(!!enabled));
    } catch (e) {
        console.error('保存密码复制提示状态失败', e);
    }
}

function syncPasswordCopyPromptToggle(enabled) {
    passwordCopyPromptEnabled = !!enabled;
    savePasswordCopyPromptState(passwordCopyPromptEnabled);

    var toggle = document.getElementById('passwordCopyPromptToggle');
    if (toggle) {
        toggle.checked = passwordCopyPromptEnabled;
    }
}

function openPasswordCopyModal(password) {
    var modal = document.getElementById('passwordCopyModal');
    var valueEl = document.getElementById('passwordCopyValue');
    var copyBtn = document.getElementById('passwordCopyButton');
    var neverAsk = document.getElementById('passwordCopyNeverAsk');

    if (!modal || !valueEl || !copyBtn || !neverAsk) return;

    valueEl.textContent = password || '';
    neverAsk.checked = !passwordCopyPromptEnabled;
    modal.style.display = 'flex';
}

function closePasswordCopyModal() {
    var modal = document.getElementById('passwordCopyModal');
    if (modal) {
        modal.style.display = 'none';
    }
}

function copyPasswordFromModal() {
    var valueEl = document.getElementById('passwordCopyValue');
    var password = valueEl ? valueEl.textContent : '';
    if (!password) return;

    var done = function() {
        var btn = document.getElementById('passwordCopyButton');
        if (btn) {
            btn.textContent = '已复制';
            setTimeout(function() {
                btn.textContent = '复制';
            }, 1200);
        }
    };

    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(password).then(done).catch(done);
        return;
    }

    var temp = document.createElement('textarea');
    temp.value = password;
    temp.setAttribute('readonly', 'readonly');
    temp.style.position = 'fixed';
    temp.style.left = '-9999px';
    document.body.appendChild(temp);
    temp.select();
    try {
        document.execCommand('copy');
    } catch (e) {}
    document.body.removeChild(temp);
    done();
}

function runAfterUiPaint(callback) {
    requestAnimationFrame(function() {
        setTimeout(callback, 0);
    });
}

// 异步处理函数 - 避免阻塞UI
function asyncProcess(processFunction, callback) {
    setTimeout(function() {
        try {
            var result = processFunction();
            callback(null, result);
        } catch (error) {
            callback(error, null);
        }
    }, 10); // 10ms 延迟，让UI有机会更新
}

var THUMBNAIL_PLACEHOLDER_DATA_URL = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==';
var THUMBNAIL_MAX_EDGE = 96;
var THUMBNAIL_PREVIEW_QUALITY = 0.12;
var thumbnailRenderQueue = [];
var thumbnailRenderActive = false;
var managedImageSourceStore = Object.create(null);
var managedImageSourceCounter = 0;

function registerManagedImageSource(source) {
    if (!source) return '';

    managedImageSourceCounter++;
    var sourceId = 'managed-image-' + managedImageSourceCounter;
    managedImageSourceStore[sourceId] = source;
    return sourceId;
}

function resolveManagedImageSource(sourceId) {
    if (!sourceId) return '';
    return managedImageSourceStore[sourceId] || '';
}

function releaseManagedImageSource(sourceId) {
    if (!sourceId) return;
    delete managedImageSourceStore[sourceId];
}

function clearManagedImageSourcesForContainer(containerElement) {
    if (!containerElement) return;

    var images = containerElement.querySelectorAll('img[data-source-id], img[data-view-source-id]');
    images.forEach(function(img) {
        releaseManagedImageSource(img.getAttribute('data-source-id'));
        releaseManagedImageSource(img.getAttribute('data-view-source-id'));
    });
}

function getThumbnailPreviewMimeType() {
    return checkWebPSupport() ? 'image/webp' : 'image/jpeg';
}

function getFullImageSourceFromElement(imgElement) {
    if (!imgElement) return '';

    var sourceId = imgElement.getAttribute('data-source-id');
    if (sourceId) {
        var managedSource = resolveManagedImageSource(sourceId);
        if (managedSource) {
            // 确保返回的是字符串，不是 Blob 对象
            if (typeof managedSource === 'string') {
                return managedSource;
            }
        }
    }

    return imgElement.getAttribute('data-fullsrc') || imgElement.getAttribute('src') || '';
}

function getFullscreenImageSourceFromElement(imgElement) {
    if (!imgElement) return '';

    var viewSourceId = imgElement.getAttribute('data-view-source-id');
    if (viewSourceId) {
        var viewSource = resolveManagedImageSource(viewSourceId);
        if (viewSource) {
            // 确保返回的是字符串，不是 Blob 对象
            if (typeof viewSource === 'string') {
                return viewSource;
            }
        }
    }

    return getFullImageSourceFromElement(imgElement);
}

function getContainerHtmlWithFullImageSources(containerElement) {
    if (!containerElement) return '';

    var clone = containerElement.cloneNode(true);
    var images = clone.querySelectorAll('img');

    images.forEach(function(img) {
        var sourceId = img.getAttribute('data-source-id');
        var fullSrc = sourceId ? resolveManagedImageSource(sourceId) : img.getAttribute('data-fullsrc');
        if (fullSrc) {
            img.setAttribute('src', fullSrc);
        }
        img.removeAttribute('data-source-id');
        img.removeAttribute('data-view-source-id');
        img.removeAttribute('data-fullsrc');
        img.removeAttribute('loading');
        img.removeAttribute('decoding');
    });

    return clone.innerHTML.trim();
}

function setThumbnailFallback(imgElement, source, done) {
    if (!imgElement || !imgElement.isConnected) {
        if (done) done();
        return;
    }

    if (typeof source === 'string') {
        imgElement.src = source;
        if (done) done();
        return;
    }

    if (source instanceof Blob) {
        readBlobAsDataUrl(source, function(error, dataUrl) {
            imgElement.src = error ? THUMBNAIL_PLACEHOLDER_DATA_URL : dataUrl;
            if (done) done();
        });
        return;
    }

    imgElement.src = THUMBNAIL_PLACEHOLDER_DATA_URL;
    if (done) done();
}

function createLowQualityThumbnail(source, callback) {
    loadImageFromSource(source, function(loadError, img, cleanup) {
        if (loadError) {
            callback(loadError, null);
            return;
        }

        runAfterUiPaint(function() {
            try {
                var width = img.naturalWidth || img.width || 0;
                var height = img.naturalHeight || img.height || 0;

                if (!width || !height) {
                    cleanup();
                    callback(new Error('缩略图尺寸无效'), null);
                    return;
                }

                var scale = Math.min(1, THUMBNAIL_MAX_EDGE / Math.max(width, height));
                var thumbWidth = Math.max(1, Math.round(width * scale));
                var thumbHeight = Math.max(1, Math.round(height * scale));
                var canvas = document.createElement('canvas');
                var ctx;

                canvas.width = thumbWidth;
                canvas.height = thumbHeight;
                ctx = canvas.getContext('2d', { alpha: false, willReadFrequently: false });

                if (!ctx) {
                    cleanup();
                    callback(new Error('无法创建缩略图画布'), null);
                    return;
                }

                ctx.imageSmoothingEnabled = true;
                if ('imageSmoothingQuality' in ctx) {
                    ctx.imageSmoothingQuality = 'low';
                }
                ctx.drawImage(img, 0, 0, thumbWidth, thumbHeight);

                cleanup();
                callback(null, canvas.toDataURL(getThumbnailPreviewMimeType(), THUMBNAIL_PREVIEW_QUALITY));
            } catch (error) {
                cleanup();
                callback(error, null);
            }
        });
    });
}

function pumpThumbnailRenderQueue() {
    if (thumbnailRenderActive) return;
    thumbnailRenderActive = true;

    function processNextThumbnail() {
        if (thumbnailRenderQueue.length === 0) {
            thumbnailRenderActive = false;
            return;
        }

        var job = thumbnailRenderQueue.shift();

        createLowQualityThumbnail(job.source, function(error, dataUrl) {
            if (job.imgElement && job.imgElement.isConnected) {
                if (error) {
                    setThumbnailFallback(job.imgElement, job.source, function() {
                        setTimeout(processNextThumbnail, 0);
                    });
                    return;
                }

                job.imgElement.src = dataUrl;
                job.imgElement.dataset.thumbnailReady = 'true';
            }

            setTimeout(processNextThumbnail, 0);
        });
    }

    processNextThumbnail();
}

function enqueueThumbnailPreview(imgElement, source) {
    if (!imgElement || !source) return;

    imgElement.src = THUMBNAIL_PLACEHOLDER_DATA_URL;
    thumbnailRenderQueue.push({
        imgElement: imgElement,
        source: source
    });
    pumpThumbnailRenderQueue();
}

function appendManagedImagePreview(container, options) {
    if (!container) return null;

    var config = options || {};
    var item = document.createElement('div');
    var img = document.createElement('img');
    var label = document.createElement('span');

    item.className = config.itemClass || 'image-list-item';
    img.alt = config.fileName || '';
    img.loading = 'lazy';
    img.decoding = 'async';
    img.setAttribute('data-filename', config.fileName || '');

    if (config.imageClass) {
        img.className = config.imageClass;
    }
    
    // 首先处理所有源，将 Blob 转换为 Data URL 并保存
    var fullSourceForStore = config.fullSource;
    var viewSourceForStore = config.viewSource;
    var previewSourceForStore = config.previewSource;
    
    // 收集需要转换的 Blob
    var blobsToConvert = [];
    if (fullSourceForStore && fullSourceForStore instanceof Blob) {
        blobsToConvert.push({ key: 'full', source: fullSourceForStore });
    }
    if (viewSourceForStore && viewSourceForStore instanceof Blob) {
        blobsToConvert.push({ key: 'view', source: viewSourceForStore });
    }
    if (previewSourceForStore && previewSourceForStore instanceof Blob) {
        blobsToConvert.push({ key: 'preview', source: previewSourceForStore });
    }
    
    // 如果有 Blob 需要转换
    if (blobsToConvert.length > 0) {
        var convertedSources = {
            full: fullSourceForStore,
            view: viewSourceForStore,
            preview: previewSourceForStore
        };
        var convertedCount = 0;
        
        function onBlobConverted() {
            convertedCount++;
            if (convertedCount >= blobsToConvert.length) {
                // 所有 Blob 都转换完成，继续处理
                finishSetup(convertedSources.full, convertedSources.view, convertedSources.preview);
            }
        }
        
        blobsToConvert.forEach(function(blobItem) {
            readBlobAsDataUrl(blobItem.source, function(error, dataUrl) {
                if (!error) {
                    convertedSources[blobItem.key] = dataUrl;
                }
                onBlobConverted();
            });
        });
    } else {
        // 没有 Blob 需要转换，直接继续
        finishSetup(fullSourceForStore, viewSourceForStore, previewSourceForStore);
    }
    
    function finishSetup(fullSrc, viewSrc, previewSrc) {
        // 保存原始高清图片源，用于全屏预览
        if (fullSrc) {
            img.setAttribute('data-source-id', registerManagedImageSource(fullSrc));
        }
        if (viewSrc) {
            img.setAttribute('data-view-source-id', registerManagedImageSource(viewSrc));
        }

        // 显示低质量缩略图
        img.src = THUMBNAIL_PLACEHOLDER_DATA_URL;

        label.className = config.labelClass || 'image-filename';
        label.textContent = config.fileName || '';

        item.appendChild(img);
        item.appendChild(label);
        container.appendChild(item);

        // 生成低质量缩略图用于显示
        enqueueThumbnailPreview(img, previewSrc || fullSrc);
    }

    return item;
}

window.clearManagedImageSourcesForContainer = clearManagedImageSourcesForContainer;
window.getFullscreenImageSourceFromElement = getFullscreenImageSourceFromElement;

// ========== WebP转换功能 ==========
// 估算图片当前质量（通过文件大小和尺寸）
function estimateImageQuality(img, fileSize) {
    var width = img.naturalWidth || img.width;
    var height = img.naturalHeight || img.height;
    var pixels = width * height;
    
    if (pixels === 0) return 85;
    
    // 计算压缩比：实际文件大小 / 未压缩大小
    // 未压缩大小 = pixels * 3 (RGB) 或 pixels * 4 (RGBA)
    var uncompressedSize = pixels * 3;
    var compressionRatio = fileSize / uncompressedSize;
    
    // 根据压缩比估算质量
    // JPEG/WebP 压缩比与质量的大致关系：
    // 质量100%: 压缩比约 0.3-0.5 (文件较大)
    // 质量80%: 压缩比约 0.1-0.2
    // 质量60%: 压缩比约 0.05-0.1
    // 质量40%: 压缩比约 0.03-0.06
    // 质量20%: 压缩比约 0.02-0.04
    
    var estimatedQuality;
    if (compressionRatio >= 0.4) {
        // 高质量或PNG
        estimatedQuality = 95;
    } else if (compressionRatio >= 0.2) {
        // 高质量
        estimatedQuality = 85 + (compressionRatio - 0.2) * 50;
    } else if (compressionRatio >= 0.1) {
        // 中高质量
        estimatedQuality = 70 + (compressionRatio - 0.1) * 150;
    } else if (compressionRatio >= 0.05) {
        // 中等质量
        estimatedQuality = 50 + (compressionRatio - 0.05) * 400;
    } else if (compressionRatio >= 0.02) {
        // 低质量
        estimatedQuality = 30 + (compressionRatio - 0.02) * 666;
    } else {
        // 极低质量
        estimatedQuality = 20 + compressionRatio * 500;
    }
    
    return Math.min(100, Math.max(20, Math.round(estimatedQuality)));
}

// 获取质量降低百分比
function isWebPConversionEnabled() {
    var toggle = document.getElementById('webpConverterToggle');
    return !!(toggle && toggle.checked);
}

function getQualityReduction() {
    var span = document.getElementById('webpQualityReduction');
    var value = span ? parseInt(span.textContent) : 20;
    
    // 确保值在0-100范围内
    if (isNaN(value) || value < 0) {
        value = 0;
    } else if (value > 100) {
        value = 100;
    }
    
    return value;
}

function updateMainBoxCapacityInfo() {
    var infoEl = document.getElementById('mainBoxCapacityInfo');
    if (!infoEl || !mainBox) return;

    var textContent = mainBox.textContent || '';
    var totalBytes = new Blob([textContent]).size;
    var totalMB = (totalBytes / (1024 * 1024)).toFixed(2);

    infoEl.textContent = '框中总容量：' + totalMB + ' MB';
}

function getImageMimeTypeFromDataUrl(dataUrl) {
    var match = /^data:([^;,]+)/i.exec(dataUrl || '');
    return match ? match[1].toLowerCase() : '';
}

function getDataUrlPayloadSize(dataUrl) {
    var commaIndex = dataUrl.indexOf(',');
    if (commaIndex === -1) return 0;
    return Math.round((dataUrl.length - commaIndex - 1) * 0.75);
}

function estimateJpegQuality(img, dataUrl) {
    var width = img.naturalWidth || img.width;
    var height = img.naturalHeight || img.height;
    var pixels = width * height;

    if (pixels === 0) return 100;

    var fileSize = getDataUrlPayloadSize(dataUrl);
    var bytesPerPixel = fileSize / pixels;
    var estimatedQuality;

    if (bytesPerPixel >= 1.2) {
        estimatedQuality = 100;
    } else if (bytesPerPixel >= 0.8) {
        estimatedQuality = 90 + (bytesPerPixel - 0.8) * 25;
    } else if (bytesPerPixel >= 0.45) {
        estimatedQuality = 75 + (bytesPerPixel - 0.45) * 42.857;
    } else if (bytesPerPixel >= 0.2) {
        estimatedQuality = 45 + (bytesPerPixel - 0.2) * 120;
    } else if (bytesPerPixel >= 0.08) {
        estimatedQuality = 15 + (bytesPerPixel - 0.08) * 250;
    } else {
        estimatedQuality = bytesPerPixel * 187.5;
    }

    return Math.max(0, Math.min(100, Math.round(estimatedQuality)));
}

function getOriginalImageQuality(img, dataUrl) {
    var mimeType = getImageMimeTypeFromDataUrl(dataUrl);
    var width = img.naturalWidth || img.width;
    var height = img.naturalHeight || img.height;
    var fileSize = getDataUrlPayloadSize(dataUrl);

    if (mimeType === 'image/png') {
        return 100;
    }

    if (mimeType === 'image/jpeg' || mimeType === 'image/jpg') {
        return estimateJpegQualityBySize(width, height, fileSize);
    }

    return estimateImageQuality(img, fileSize);
}

function estimateJpegQualityBySize(width, height, fileSize) {
    var pixels = width * height;

    if (pixels === 0) return 100;

    var bytesPerPixel = fileSize / pixels;
    var estimatedQuality;

    if (bytesPerPixel >= 1.2) {
        estimatedQuality = 100;
    } else if (bytesPerPixel >= 0.8) {
        estimatedQuality = 90 + (bytesPerPixel - 0.8) * 25;
    } else if (bytesPerPixel >= 0.45) {
        estimatedQuality = 75 + (bytesPerPixel - 0.45) * 42.857;
    } else if (bytesPerPixel >= 0.2) {
        estimatedQuality = 45 + (bytesPerPixel - 0.2) * 120;
    } else if (bytesPerPixel >= 0.08) {
        estimatedQuality = 15 + (bytesPerPixel - 0.08) * 250;
    } else {
        estimatedQuality = bytesPerPixel * 187.5;
    }

    return Math.max(0, Math.min(100, Math.round(estimatedQuality)));
}

function getSourceMimeType(source) {
    if (source && source.type) {
        return source.type.toLowerCase();
    }
    if (typeof source === 'string') {
        return getImageMimeTypeFromDataUrl(source);
    }
    return '';
}

function getSourceSize(source) {
    if (source && typeof source.size === 'number') {
        return source.size;
    }
    if (typeof source === 'string') {
        return getDataUrlPayloadSize(source);
    }
    return 0;
}

function getOriginalImageQualityForSource(img, source) {
    var mimeType = getSourceMimeType(source);
    var width = img.naturalWidth || img.width;
    var height = img.naturalHeight || img.height;
    var fileSize = getSourceSize(source);

    if (mimeType === 'image/png') {
        return 100;
    }

    if (mimeType === 'image/jpeg' || mimeType === 'image/jpg') {
        return estimateJpegQualityBySize(width, height, fileSize);
    }

    return estimateImageQuality(img, fileSize);
}

function loadImageFromSource(source, callback) {
    if (source instanceof Blob && typeof createImageBitmap === 'function') {
        createImageBitmap(source).then(function(bitmap) {
            callback(null, bitmap, function() {
                if (bitmap.close) bitmap.close();
            });
        }).catch(function() {
            loadImageElementFallback(source, callback);
        });
        return;
    }

    loadImageElementFallback(source, callback);
}

function loadImageElementFallback(source, callback) {
    var objectUrl = null;
    var img = new Image();

    img.onload = function() {
        callback(null, img, function() {
            if (objectUrl) URL.revokeObjectURL(objectUrl);
        });
    };

    img.onerror = function() {
        if (objectUrl) URL.revokeObjectURL(objectUrl);
        callback(new Error('图片加载失败'), null, null);
    };

    if (source instanceof Blob) {
        objectUrl = URL.createObjectURL(source);
        img.src = objectUrl;
    } else {
        img.src = source;
    }
}

function convertCanvasToWebPBlob(canvas, quality, callback) {
    if (typeof OffscreenCanvas !== 'undefined' && canvas instanceof OffscreenCanvas && typeof canvas.convertToBlob === 'function') {
        canvas.convertToBlob({ type: 'image/webp', quality: quality }).then(function(blob) {
            callback(null, blob);
        }).catch(function(error) {
            callback(error, null);
        });
        return;
    }

    if (canvas.toBlob) {
        canvas.toBlob(function(blob) {
            if (!blob) {
                callback(new Error('WebP转换失败'), null);
                return;
            }
            callback(null, blob);
        }, 'image/webp', quality);
        return;
    }

    try {
        var fallbackDataUrl = canvas.toDataURL('image/webp', quality);
        fetch(fallbackDataUrl).then(function(response) {
            return response.blob();
        }).then(function(blob) {
            callback(null, blob);
        }).catch(function(error) {
            callback(error, null);
        });
    } catch (error) {
        callback(error, null);
    }
}

function readBlobAsDataUrl(blob, callback) {
    var reader = new FileReader();
    reader.onload = function(event) {
        callback(null, event.target.result);
    };
    reader.onerror = function() {
        callback(new Error('Blob读取失败'), null);
    };
    reader.readAsDataURL(blob);
}

function readBlobAsArrayBuffer(blob, callback) {
    if (blob.arrayBuffer) {
        blob.arrayBuffer().then(function(arrayBuffer) {
            callback(null, arrayBuffer);
        }).catch(function(error) {
            callback(error, null);
        });
        return;
    }

    var reader = new FileReader();
    reader.onload = function(event) {
        callback(null, event.target.result);
    };
    reader.onerror = function() {
        callback(new Error('Blob读取失败'), null);
    };
    reader.readAsArrayBuffer(blob);
}

function checkWebPSupport() {
    if (webpSupportState !== null) {
        return webpSupportState;
    }

    try {
        var canvas = document.createElement('canvas');
        canvas.width = 1;
        canvas.height = 1;
        var dataUrl = canvas.toDataURL('image/webp');
        webpSupportState = dataUrl.indexOf('data:image/webp') === 0;
    } catch (error) {
        webpSupportState = false;
    }

    return webpSupportState;
}

function convertToWebP(source, qualityReduction, callback) {
    console.log('convertToWebP 被调用, qualityReduction:', qualityReduction);

    if (!checkWebPSupport()) {
        callback(new Error('浏览器不支持WebP编码'), null, null);
        return;
    }

    loadImageFromSource(source, function(loadError, img, cleanup) {
        if (loadError) {
            callback(loadError, null, null);
            return;
        }

        runAfterUiPaint(function() {
            try {
                var width = img.naturalWidth || img.width;
                var height = img.naturalHeight || img.height;
                var canvas = createOptimizedCanvas(width, height);
                var ctx = canvas.getContext('2d', { alpha: true, willReadFrequently: false });

                if (!ctx) {
                    cleanup();
                    callback(new Error('无法创建WebP转换画布'), null, null);
                    return;
                }

                if (canvas.width !== width) canvas.width = width;
                if (canvas.height !== height) canvas.height = height;
                ctx.drawImage(img, 0, 0, width, height);

                var originalQuality = getOriginalImageQualityForSource(img, source);
                var finalQualityPercent = Math.max(10, Math.min(100, originalQuality - qualityReduction));
                var finalQuality = finalQualityPercent / 100;
                var originalSize = getSourceSize(source);

                convertCanvasToWebPBlob(canvas, finalQuality, function(blobError, webpBlob) {
                    cleanup();

                    if (blobError || !webpBlob) {
                        callback(blobError || new Error('WebP转换失败'), null, null);
                        return;
                    }

                    if (originalSize > 0 && webpBlob.size >= originalSize) {
                        callback(new Error('WebP转换后文件变大，保留原始格式'), null, null);
                        return;
                    }

                    readBlobAsDataUrl(webpBlob, function(dataUrlError, webpDataUrl) {
                        if (dataUrlError) {
                            callback(dataUrlError, null, null);
                            return;
                        }

                        callback(null, webpDataUrl, {
                            blob: webpBlob,
                            originalQuality: originalQuality,
                            qualityReduction: qualityReduction,
                            finalQuality: Math.round(finalQualityPercent),
                            originalSize: originalSize,
                            newSize: webpBlob.size
                        });
                    });
                });
            } catch (error) {
                cleanup();
                callback(error, null, null);
            }
        });
    });
}

// 分块压缩函数 - 避免大文件导致的 "Too many properties to enumerate" 错误
function compressLargeData(data, chunkSize = 1024 * 1024) {
    // 如果数据小于分块大小，直接压缩
    if (data.length <= chunkSize) {
        return LZString.compressToBase64(data).replace(/=+$/,'');
    }
    
    // 分块压缩
    var compressedChunks = [];
    var totalChunks = Math.ceil(data.length / chunkSize);
    
    for (var i = 0; i < data.length; i += chunkSize) {
        var chunk = data.substring(i, Math.min(i + chunkSize, data.length));
        var compressedChunk = LZString.compressToBase64(chunk).replace(/=+$/,'');
        compressedChunks.push(compressedChunk);
    }
    
    // 使用特殊分隔符连接压缩块
    // 格式：CHUNKED:<总块数>:<压缩数据1>|||<压缩数据2>|||...
    return 'CHUNKED:' + totalChunks + ':' + compressedChunks.join('|||');
}

// 分块解压函数
function decompressLargeData(compressedData) {
    // 检查是否为分块压缩数据
    if (!compressedData.startsWith('CHUNKED:')) {
        // 不是分块数据，直接解压
        return LZString.decompressFromBase64(compressedData);
    }
    
    // 解析分块数据
    var parts = compressedData.split(':');
    var totalChunks = parseInt(parts[1]);
    var dataPart = parts.slice(2).join(':'); // 处理数据中可能包含的冒号
    var compressedChunks = dataPart.split('|||');
    
    // 解压每个块
    var decompressedChunks = [];
    for (var i = 0; i < compressedChunks.length; i++) {
        var decompressedChunk = LZString.decompressFromBase64(compressedChunks[i]);
        if (decompressedChunk) {
            decompressedChunks.push(decompressedChunk);
        }
    }
    
    return decompressedChunks.join('');
}

// ========== 二进制数据嵌入功能 ==========
// 智能压缩二进制数据（检测压缩效果，如果变大数据则不压缩）
function smartCompressBinaryData(uint8Array) {
    var originalSize = uint8Array.length;
    
    // 如果数据小于1KB，直接不压缩（压缩开销不划算）
    if (originalSize < 1024) {
        console.log('数据太小，跳过压缩');
        return {
            compressed: false,
            data: uint8Array
        };
    }
    
    // 采样检测：只压缩前64KB数据来判断压缩效果
    var sampleSize = Math.min(65536, originalSize);
    var sampleData = uint8Array.subarray(0, sampleSize);
    
    // 转换样本为字符串
    var sampleString = '';
    for (var i = 0; i < sampleData.length; i++) {
        sampleString += String.fromCharCode(sampleData[i]);
    }
    
    // 压缩样本并转为Base64（避免字符丢失）
    var compressedSample = LZString.compressToBase64(sampleString);
    
    // 计算样本压缩率
    var sampleCompressionRatio = compressedSample.length / sampleString.length;
    
    console.log('样本压缩率:', (sampleCompressionRatio * 100).toFixed(2) + '%');
    
    // 如果样本压缩后变大或基本不变（>0.95），则不压缩全部数据
    if (sampleCompressionRatio > 0.95) {
        console.log('数据不适合压缩（可能是已压缩格式），直接嵌入');
        return {
            compressed: false,
            data: uint8Array
        };
    }
    
    // 数据适合压缩，压缩全部数据
    console.log('数据适合压缩，开始压缩全部数据...');
    
    // 分块处理大数据
    var chunkSize = 1024 * 1024; // 1MB per chunk
    var compressedChunks = [];
    var totalCompressedSize = 0;
    
    for (var i = 0; i < originalSize; i += chunkSize) {
        var end = Math.min(i + chunkSize, originalSize);
        var chunk = uint8Array.subarray(i, end);
        
        var chunkString = '';
        for (var j = 0; j < chunk.length; j++) {
            chunkString += String.fromCharCode(chunk[j]);
        }
        
        // 使用Base64编码避免字符丢失
        var compressedChunk = LZString.compressToBase64(chunkString);
        compressedChunks.push(compressedChunk);
        totalCompressedSize += compressedChunk.length;
    }
    
    console.log('压缩块数量:', compressedChunks.length);
    
    // 构建最终数据格式：
    // [块数量(4字节)][块1长度(4字节)][块1数据][块2长度(4字节)][块2数据]...
    var headerSize = 4 + compressedChunks.length * 4;
    var result = new Uint8Array(headerSize + totalCompressedSize);
    var pos = 0;
    
    // 写入块数量（4字节，小端序）
    result[pos] = compressedChunks.length & 0xFF;
    result[pos + 1] = (compressedChunks.length >> 8) & 0xFF;
    result[pos + 2] = (compressedChunks.length >> 16) & 0xFF;
    result[pos + 3] = (compressedChunks.length >> 24) & 0xFF;
    pos += 4;
    
    // 写入每个块的长度和数据
    for (var i = 0; i < compressedChunks.length; i++) {
        var chunkData = compressedChunks[i];
        
        // 写入块长度（4字节，小端序）
        result[pos] = chunkData.length & 0xFF;
        result[pos + 1] = (chunkData.length >> 8) & 0xFF;
        result[pos + 2] = (chunkData.length >> 16) & 0xFF;
        result[pos + 3] = (chunkData.length >> 24) & 0xFF;
        pos += 4;
        
        // 写入块数据（Base64字符串，每个字符charCode < 128，安全存储）
        for (var j = 0; j < chunkData.length; j++) {
            result[pos + j] = chunkData.charCodeAt(j);
        }
        pos += chunkData.length;
    }
    
    // 最终检查：如果压缩后反而变大，使用原始数据
    if (result.length >= originalSize) {
        console.log('压缩后未减小，使用原始数据');
        return {
            compressed: false,
            data: uint8Array
        };
    }
    
    console.log('压缩成功:', originalSize, '->', result.length, '字节');
    return {
        compressed: true,
        data: result
    };
}

// 解压二进制数据（支持分块格式）
function decompressBinaryData(uint8Array) {
    var pos = 0;
    
    // 读取块数量（4字节，小端序）
    var chunkCount = uint8Array[pos] | (uint8Array[pos + 1] << 8) | (uint8Array[pos + 2] << 16) | (uint8Array[pos + 3] << 24);
    pos += 4;
    
    console.log('解压块数量:', chunkCount);
    
    // 收集所有解压后的数据
    var decompressedParts = [];
    var totalSize = 0;
    
    for (var i = 0; i < chunkCount; i++) {
        // 读取块长度（4字节，小端序）
        var chunkLength = uint8Array[pos] | (uint8Array[pos + 1] << 8) | (uint8Array[pos + 2] << 16) | (uint8Array[pos + 3] << 24);
        pos += 4;
        
        // 读取压缩块数据（Base64字符串）
        var compressedChunk = '';
        for (var j = 0; j < chunkLength; j++) {
            compressedChunk += String.fromCharCode(uint8Array[pos + j]);
        }
        pos += chunkLength;
        
        // 使用Base64解码解压
        var decompressedChunk = LZString.decompressFromBase64(compressedChunk);
        
        if (!decompressedChunk) {
            console.error('解压块', i, '失败');
            return null;
        }
        
        decompressedParts.push(decompressedChunk);
        totalSize += decompressedChunk.length;
    }
    
    // 合并所有解压后的数据
    var result = new Uint8Array(totalSize);
    var offset = 0;
    for (var i = 0; i < decompressedParts.length; i++) {
        var part = decompressedParts[i];
        for (var j = 0; j < part.length; j++) {
            result[offset + j] = part.charCodeAt(j);
        }
        offset += part.length;
    }
    
    console.log('解压成功，总大小:', result.length, '字节');
    return result;
}

// 动态调整容器样式，确保完美衔接
function updateContainerStyles() {
	var hasImages = imageListBox.innerHTML.trim() !== '';
	
	if(hasImages) {
		// 有图片/文件列表
		toolBar1.style.borderBottomLeftRadius = '0';
		toolBar1.style.borderBottomRightRadius = '0';
		toolBar1.style.borderBottom = 'none';
		
		imageListBox.style.borderTop = 'none';
		imageListBox.style.borderBottom = 'none';
		imageListBox.style.borderLeft = '2px solid #4CAF50';
		imageListBox.style.borderRight = '2px solid #4CAF50';
		
		mainBox.style.borderTopLeftRadius = '0';
		mainBox.style.borderTopRightRadius = '0';
		mainBox.style.borderTop = 'none';
	} else {
		// 没有图片/文件列表
		toolBar1.style.borderBottomLeftRadius = '0';
		toolBar1.style.borderBottomRightRadius = '0';
		toolBar1.style.borderBottom = 'none';
		
		mainBox.style.borderTopLeftRadius = '0';
		mainBox.style.borderTopRightRadius = '0';
		mainBox.style.borderTop = 'none';
	}
}

// 动态调整提取页面容器样式
function updateDecodeContainerStyles() {
	var hasImages = imageListBoxDecode.innerHTML.trim() !== '';
	
	if(hasImages) {
		mainBoxDecode.style.borderTopLeftRadius = '15px';
		mainBoxDecode.style.borderTopRightRadius = '15px';
		mainBoxDecode.style.borderTop = '2px solid rgba(76, 175, 80, 0.4)';
	} else {
		mainBoxDecode.style.borderTopLeftRadius = '15px';
		mainBoxDecode.style.borderTopRightRadius = '15px';
		mainBoxDecode.style.borderTop = '2px solid rgba(76, 175, 80, 0.4)';
	}
}

//to load a file into the main box - 支持多个文件，带进度条
function loadFileAsURL(){
	console.log('=== loadFileAsURL 被调用 ===');
	
	var files = mainFile.files;
	console.log('文件数量:', files ? files.length : 0);
	
	if(!files || files.length === 0) return;
	
	// 性能优化：计算文件大小，但不再显示警告弹窗
	var MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
	var MAX_TOTAL_SIZE = 100 * 1024 * 1024; // 100MB
	var totalSize = 0;
	
	for(var i = 0; i < files.length; i++) {
		totalSize += files[i].size;
	}
	
	// 显示进度条
	showProgressBar('正在加载文件...');
	updateProgress(0, '准备读取文件...');
	
	// 检查是否为文件尾追加模式
	var encodeMode = document.getElementById('encodeModeSelect');
	var isTailMode = encodeMode && encodeMode.value === 'tail';
	
	// 使用异步处理文件，避免UI冻结
	var processedFiles = 0;
	var totalFiles = files.length;
	var actualTotalSize = 0; // 实际总容量（包括转换后的大小）
	
	function processFileAsync(index) {
		if (index >= totalFiles) {
			// 所有文件处理完成
			hideProgressBar();
			imageMsg.textContent = '已加载 ' + totalFiles + ' 个文件，总容量：' + formatFileSize(actualTotalSize);
			updateMainBoxCapacityInfo();
			mainFile.type = '';
			mainFile.type = 'file';
			return;
		}
		
		var fileToLoad = files[index];
		var progress = ((index + 1) / totalFiles) * 100;
		updateProgress(progress, '正在处理: ' + fileToLoad.name);
		
		// 使用setTimeout让UI有机会更新
		setTimeout(function() {
			// 在文件尾追加模式下，读取二进制数据并显示预览
			if (isTailMode && fileToLoad.type.slice(0,4) != "text") {
				// 读取二进制数据用于嵌入
				var binaryReader = new FileReader();
				binaryReader.onload = function(e) {
					binaryFilesForTail.push({
						name: fileToLoad.name,
						type: fileToLoad.type,
						data: e.target.result
					});
				};
				binaryReader.readAsArrayBuffer(fileToLoad);
				
				// 同时读取为 data URL 用于显示预览
				var previewReader = new FileReader();
				previewReader.onload = function(e) {
					var dataUrl = e.target.result;
					
					// 检查是否启用WebP转换
					var webpEnabled = isWebPConversionEnabled();
					var isImage = fileToLoad.type.startsWith('image/');
					console.log('文件类型:', fileToLoad.type, '是否图片:', isImage, 'WebP开关:', webpEnabled);
					
					if(isImage && webpEnabled) {
						var qualityReduction = getQualityReduction();
						console.log('开始WebP转换, 质量降低:', qualityReduction + '%');
						updateProgress(progress, '正在转换WebP: ' + fileToLoad.name);
						beginTextBoxConversionProgress('正在转换为 WebP...', progress, fileToLoad.name);
						
						convertToWebP(fileToLoad, qualityReduction, function(error, webpDataUrl, info) {
							endTextBoxConversionProgress();
							if(error) {
								console.error('WebP转换失败:', error);
								// 转换失败，使用原始文件大小
								actualTotalSize += fileToLoad.size;
						appendManagedImagePreview(imageListBox, {
							fileName: fileToLoad.name,
							fullSource: fileToLoad,
							viewSource: fileToLoad,
							previewSource: fileToLoad
						});
							} else {
								// 转换成功，使用WebP数据
								console.log('WebP转换成功:', info);
								// 使用转换后的文件大小
								if (info && info.newSize) {
									actualTotalSize += info.newSize;
								} else {
									actualTotalSize += fileToLoad.size;
								}
								var webpFilename = fileToLoad.name.replace(/\.(jpg|jpeg|png|gif|bmp)$/i, '.webp');
								var webpSource = info && info.blob ? info.blob : webpDataUrl;
								appendManagedImagePreview(imageListBox, {
									fileName: webpFilename,
									fullSource: webpSource,
									viewSource: webpSource,
									previewSource: webpSource
								});
								
								// 更新binaryFilesForTail中的数据
								// 找到对应的文件并更新
								for(var i = 0; i < binaryFilesForTail.length; i++) {
									if(binaryFilesForTail[i].name === fileToLoad.name) {
										readBlobAsArrayBuffer(info.blob, function(arrayBufferError, arrayBuffer) {
											if (!arrayBufferError) {
												binaryFilesForTail[i].data = arrayBuffer;
												binaryFilesForTail[i].type = 'image/webp';
												binaryFilesForTail[i].name = webpFilename;
											}
										});
										break;
									}
								}
							}
							updateContainerStyles();
							// 处理下一个文件
							processFileAsync(index + 1);
						});
					} else {
						// 未启用WebP转换，正常处理
						// 使用原始文件大小
						actualTotalSize += fileToLoad.size;
						// 根据文件类型显示不同的预览 - 性能优化：使用 appendChild 代替 innerHTML +=
						if(fileToLoad.type.startsWith('image/')) {
							appendManagedImagePreview(imageListBox, {
								fileName: fileToLoad.name,
								fullSource: fileToLoad,
								viewSource: fileToLoad,
								previewSource: fileToLoad
							});
						} else {
							var div = document.createElement('div');
							div.className = 'file-list-item';
							div.innerHTML = '<a download="' + fileToLoad.name + '" href="' + dataUrl.replace(/=+$/,'') + '"><span class="file-icon">📄</span> ' + fileToLoad.name + '</a>';
							imageListBox.appendChild(div);
						}
						updateContainerStyles();
						
						// 处理下一个文件
						processFileAsync(index + 1);
					}
				};
				previewReader.readAsDataURL(fileToLoad);
			} else {
				// 非文件尾追加模式，或文本文件，正常处理
				var fileReader = new FileReader();
				fileReader.onload = function(fileLoadedEvent){
					var fileName = fileToLoad.name,
						URLFromFileLoaded = fileLoadedEvent.target.result;

					if(fileToLoad.type.slice(0,4) == "text"){
						if(URLFromFileLoaded.slice(0,2) == '==' && URLFromFileLoaded.slice(-2) == '=='){
							// 性能优化：使用 appendChild 代替 innerHTML +=
							var link = document.createElement('a');
							link.download = fileName;
							link.href = 'data:,' + URLFromFileLoaded;
							link.textContent = fileName;
							mainBox.appendChild(link);
						}else{
							var br = document.createElement('br');
							mainBox.appendChild(br);
							var text = document.createTextNode(URLFromFileLoaded.replace(/  /g,' &nbsp;'));
							mainBox.appendChild(text);
						}
						
						// 同时读取为二进制数据，用于新的文件尾追加功能
						var binaryReader = new FileReader();
						binaryReader.onload = function(e) {
							binaryFilesForTail.push({
								name: fileToLoad.name,
								type: fileToLoad.type,
								data: e.target.result
							});
							
							// 处理下一个文件
							processFileAsync(index + 1);
						};
						binaryReader.readAsArrayBuffer(fileToLoad);
					}else{
						// 检查是否启用WebP转换
						var webpEnabled2 = isWebPConversionEnabled();
						var isImage2 = fileToLoad.type.startsWith('image/');
						console.log('[非尾追加模式] 文件类型:', fileToLoad.type, '是否图片:', isImage2, 'WebP开关:', webpEnabled2);
						
						if(isImage2 && webpEnabled2) {
							var qualityReduction = getQualityReduction();
							console.log('[非尾追加模式] 开始WebP转换, 质量降低:', qualityReduction + '%');
							updateProgress(progress, '正在转换WebP: ' + fileToLoad.name);
							beginTextBoxConversionProgress('正在转换为 WebP...', progress, fileName);
							
							convertToWebP(fileToLoad, qualityReduction, function(error, webpDataUrl, info) {
								endTextBoxConversionProgress();
								if(error) {
									console.error('WebP转换失败:', error);
									// 转换失败，使用原始数据
									var div = document.createElement('div');
									div.className = 'file-list-item';
									div.innerHTML = '<a download="' + fileName + '" href="' + URLFromFileLoaded.replace(/=+$/,'') + '"><span class="file-icon">📄</span> ' + fileName + '</a>';
									imageListBox.appendChild(div);
									updateContainerStyles();
									
									// 存储原始数据到binaryFilesForTail
									var binaryReader = new FileReader();
									binaryReader.onload = function(e) {
										binaryFilesForTail.push({
											name: fileName,
											type: fileToLoad.type,
											data: e.target.result
										});
										processFileAsync(index + 1);
									};
									binaryReader.readAsArrayBuffer(fileToLoad);
								} else {
									// 转换成功，使用WebP数据
									console.log('WebP转换成功:', info);
									var div = document.createElement('div');
									div.className = 'file-list-item';
									var webpFilename = fileName.replace(/\.(jpg|jpeg|png|gif|bmp)$/i, '.webp');
									div.innerHTML = '<a download="' + webpFilename + '" href="' + webpDataUrl + '"><span class="file-icon">🖼️</span> ' + webpFilename + '</a>';
									imageListBox.appendChild(div);
									updateContainerStyles();
									
									readBlobAsArrayBuffer(info.blob, function(arrayBufferError, arrayBuffer) {
										if (!arrayBufferError) {
											binaryFilesForTail.push({
												name: webpFilename,
												type: 'image/webp',
												data: arrayBuffer
											});
										}
										processFileAsync(index + 1);
									});
								}
							});
						} else {
							// 未启用WebP转换，正常处理
							var div = document.createElement('div');
							div.className = 'file-list-item';
							div.innerHTML = '<a download="' + fileName + '" href="' + URLFromFileLoaded.replace(/=+$/,'') + '"><span class="file-icon">📄</span> ' + fileName + '</a>';
							imageListBox.appendChild(div);
							updateContainerStyles();
							
							// 同时读取为二进制数据，用于新的文件尾追加功能
							var binaryReader = new FileReader();
							binaryReader.onload = function(e) {
								binaryFilesForTail.push({
									name: fileToLoad.name,
									type: fileToLoad.type,
									data: e.target.result
								});
								
								// 处理下一个文件
								processFileAsync(index + 1);
							};
							binaryReader.readAsArrayBuffer(fileToLoad);
						}
					}
				};
				
				if(fileToLoad.type.slice(0,4) == "text"){
					fileReader.readAsText(fileToLoad, "UTF-8");
				}else{
					fileReader.readAsDataURL(fileToLoad, "UTF-8");
				}
			}
		}, 10); // 10ms 延迟，让UI有机会更新
	}
	
	// 开始处理第一个文件
	processFileAsync(0);
}

//to load an image into the main box - 支持多个图片
function loadImage(){
	console.log('=== loadImage 被调用 ===');
	
	var files = imgFile.files;
	console.log('图片数量:', files ? files.length : 0);
	
	if(!files || files.length === 0) return;

	var fileList = Array.from(files);
	
	// 性能优化：计算文件大小，但不再显示警告弹窗
	var MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
	var MAX_TOTAL_SIZE = 100 * 1024 * 1024; // 100MB
	var totalSize = 0;
	
	for(var i = 0; i < fileList.length; i++) {
		totalSize += fileList[i].size;
	}
	
	// 检查是否为文件尾追加模式
	var encodeMode = document.getElementById('encodeModeSelect');
	var isTailMode = encodeMode && encodeMode.value === 'tail';

	var totalFiles = fileList.length;
	var processedFiles = 0;
	var actualTotalSize = 0; // 实际总容量（包括转换后的大小）

	function finishImageImport() {
		imageMsg.textContent = '已加载 ' + totalFiles + ' 张图片，总容量：' + formatFileSize(actualTotalSize);
		imgFile.type = '';
		imgFile.type = 'file';
	}

	function handleImageImportError(fileToLoad, error, next) {
		console.error('导入图片失败:', fileToLoad.name, error);
		imageMsg.textContent = '文件 ' + fileToLoad.name + ' 处理失败';
		next();
	}

	function processTailModeImage(fileToLoad, next) {
		var webpEnabled = isWebPConversionEnabled();
		console.log('[loadImage-尾追加] WebP开关:', webpEnabled);

		if (webpEnabled) {
			var qualityReduction = getQualityReduction();
			beginTextBoxConversionProgress('正在转换为 WebP...', 15, fileToLoad.name);
			convertToWebP(fileToLoad, qualityReduction, function(error, webpDataUrl, info) {
				endTextBoxConversionProgress();

				if (error) {
					console.error('WebP转换失败:', error);
					// 转换失败，使用原始文件大小
					actualTotalSize += fileToLoad.size;
					readBlobAsArrayBuffer(fileToLoad, function(arrayBufferError, arrayBuffer) {
						if (!arrayBufferError && arrayBuffer) {
							binaryFilesForTail.push({
								name: fileToLoad.name,
								type: fileToLoad.type,
								data: arrayBuffer
							});
							appendManagedImagePreview(imageListBox, {
								fileName: fileToLoad.name,
								fullSource: fileToLoad,
								viewSource: fileToLoad,
								previewSource: fileToLoad
							});
							updateContainerStyles();
						}
						next();
					});
					return;
				}

				var webpFilename = fileToLoad.name.replace(/\.(jpg|jpeg|png|gif|bmp)$/i, '.webp');
				// 使用转换后的文件大小
				if (info && info.newSize) {
					actualTotalSize += info.newSize;
				} else {
					actualTotalSize += fileToLoad.size;
				}
				readBlobAsArrayBuffer(info.blob, function(arrayBufferError, arrayBuffer) {
					if (!arrayBufferError && arrayBuffer) {
						binaryFilesForTail.push({
							name: webpFilename,
							type: 'image/webp',
							data: arrayBuffer
						});
						var webpSource = info && info.blob ? info.blob : webpDataUrl;
						appendManagedImagePreview(imageListBox, {
							fileName: webpFilename,
							fullSource: webpSource,
							viewSource: webpSource,
							previewSource: webpSource
						});
						updateContainerStyles();
					}
					next();
				});
			});
			return;
		}

		readBlobAsArrayBuffer(fileToLoad, function(arrayBufferError, arrayBuffer) {
			if (!arrayBufferError && arrayBuffer) {
				binaryFilesForTail.push({
					name: fileToLoad.name,
					type: fileToLoad.type,
					data: arrayBuffer
				});
				// 使用原始文件大小
				actualTotalSize += fileToLoad.size;
				appendManagedImagePreview(imageListBox, {
					fileName: fileToLoad.name,
					fullSource: fileToLoad,
					viewSource: fileToLoad,
					previewSource: fileToLoad
				});
				updateContainerStyles();
			}
			next();
		});
	}

	function processNormalModeImage(fileToLoad, next) {
		var webpEnabled = isWebPConversionEnabled();
		console.log('[loadImage-非尾追加] WebP开关:', webpEnabled);

		if (webpEnabled) {
			var qualityReduction = getQualityReduction();
			beginTextBoxConversionProgress('正在转换为 WebP...', 15, fileToLoad.name);
			convertToWebP(fileToLoad, qualityReduction, function(error, webpDataUrl, info) {
				endTextBoxConversionProgress();

				if (error) {
					console.error('WebP转换失败:', error);
					// 转换失败，使用原始文件大小
					actualTotalSize += fileToLoad.size;
					readBlobAsDataUrl(fileToLoad, function(readError, originalDataUrl) {
						if (!readError && originalDataUrl && originalDataUrl.slice(0, 10) === 'data:image') {
							appendManagedImagePreview(imageListBox, {
								fileName: fileToLoad.name,
								fullSource: originalDataUrl.replace(/=+$/,''),
								viewSource: originalDataUrl.replace(/=+$/,''),
								previewSource: originalDataUrl.replace(/=+$/,'')
							});
							updateContainerStyles();
						} else {
							imageMsg.textContent = '文件 ' + fileToLoad.name + ' 不是可识别的图像类型';
						}
						next();
					});
					return;
				}

				var webpFilename = fileToLoad.name.replace(/\.(jpg|jpeg|png|gif|bmp)$/i, '.webp');
				var webpSource = info && info.blob ? info.blob : webpDataUrl;
				// 使用转换后的文件大小
				if (info && info.newSize) {
					actualTotalSize += info.newSize;
				} else {
					actualTotalSize += fileToLoad.size;
				}
				appendManagedImagePreview(imageListBox, {
					fileName: webpFilename,
					fullSource: webpSource,
					viewSource: webpSource,
					previewSource: webpSource
				});
				updateContainerStyles();
				next();
			});
			return;
		}

		readBlobAsDataUrl(fileToLoad, function(readError, originalDataUrl) {
			if (!readError && originalDataUrl && originalDataUrl.slice(0, 10) === 'data:image') {
				// 使用原始文件大小
				actualTotalSize += fileToLoad.size;
				appendManagedImagePreview(imageListBox, {
					fileName: fileToLoad.name,
					fullSource: originalDataUrl.replace(/=+$/,''),
					viewSource: originalDataUrl.replace(/=+$/,''),
					previewSource: originalDataUrl.replace(/=+$/,'')
				});
				updateContainerStyles();
			} else {
				imageMsg.textContent = '文件 ' + fileToLoad.name + ' 不是可识别的图像类型';
			}
			next();
		});
	}

	function processNextImage(index) {
		if (index >= totalFiles) {
			finishImageImport();
			return;
		}

		var fileToLoad = fileList[index];
		imageMsg.textContent = '正在加载第 ' + (index + 1) + '/' + totalFiles + ' 张图片...';

		runAfterUiPaint(function() {
			try {
				if (isTailMode) {
					processTailModeImage(fileToLoad, function() {
						processedFiles++;
						setTimeout(function() {
							processNextImage(index + 1);
						}, 0);
					});
				} else {
					processNormalModeImage(fileToLoad, function() {
						processedFiles++;
						setTimeout(function() {
							processNextImage(index + 1);
						}, 0);
					});
				}
			} catch (error) {
				handleImageImportError(fileToLoad, error, function() {
					processedFiles++;
					setTimeout(function() {
						processNextImage(index + 1);
					}, 0);
				});
			}
		});
	}

	processNextImage(0);
}

// load image for hiding text
var importImage = function(e) {
    var file = e.target.files[0];
    originalCoverFile = file; // 保存原始文件
    var reader = new FileReader();
    reader.onload = function(event) {
        originalCoverDataURL = event.target.result; // 保存原始 data URL
        // set the preview
        document.getElementById('previewContainer').style.display = 'block';
        document.getElementById('preview').src = event.target.result;
        document.getElementById('previewFilename').textContent = file.name;
        
        // 检查是否为文件尾追加模式
        var encodeMode = document.getElementById('encodeModeSelect');
        var isTailMode = encodeMode && encodeMode.value === 'tail';
        
        // 显示图像详细信息
        const previewElement = document.getElementById('preview');
        if (previewElement) {
            previewElement.onload = function() {
                // 只在非文件尾追加模式下计算容量
                if (!isTailMode) {
                    updateCapacity();
                }
                updateImageDetails(previewElement, file, 'imageDetails');
            }
        }
    }
    reader.readAsDataURL(file);
}

// 更新图像详细信息
function updateImageDetails(imgElement, file, detailsElementId) {
    var detailsContainer = document.getElementById(detailsElementId);
    if (!detailsContainer) return;
    
    detailsContainer.innerHTML = '';
    
    // 获取文件扩展名
    var ext = file.name.split('.').pop().toUpperCase();
    
    // 获取文件大小（格式化）
    var fileSize = formatFileSize(file.size);
    
    // 获取图像尺寸
    var width = imgElement.naturalWidth;
    var height = imgElement.naturalHeight;
    
    // 计算PNG和JPG容量
    var pngBits = width * height * 3 - 270;
    var pngMB = (pngBits / (8 * 1024 * 1024)).toFixed(2);
    var jpgBits = Math.floor(pngBits / 20);
    var jpgMB = (jpgBits / (8 * 1024 * 1024)).toFixed(2);
    
    // 创建标签
    var tags = [
        { label: ext, icon: '' },
        { label: width + ' × ' + height, icon: '' },
        { label: fileSize, icon: '' }
    ];
    
    tags.forEach(function(tag) {
        var tagElement = document.createElement('span');
        tagElement.className = 'detail-tag';
        tagElement.textContent = tag.label;
        detailsContainer.appendChild(tagElement);
    });
}

// 格式化文件大小
function formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    var k = 1024;
    var sizes = ['Bytes', 'KB', 'MB', 'GB'];
    var i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// 防抖机制变量
var updateCapacityTimeout = null;
var lastImageSrc = null;
var cachedPngBits = null;
var cachedJpgBits = null;
var isEncodingInProgress = false; // 标志位：是否正在进行编码操作
var encodingCompleteCooldown = 0; // 编码完成后的冷却时间（毫秒）

//show how much text can be hidden in the image - 优化版，带防抖和缓存
function updateCapacity(forceRecalculate = false){
	updateMainBoxCapacityInfo();

	// 如果正在进行编码操作，或者在冷却时间内，直接跳过，完全避免卡顿
	if(isEncodingInProgress || Date.now() < encodingCompleteCooldown) {
		return;
	}

	var combinedContent = getCombinedContent();
	var	textSize = b64EncodeUnicode(combinedContent).replace(/=+$/,'').length * 6;							//text size in bits
	var textSizeMB = (textSize / (8 * 1024 * 1024)).toFixed(2);											//text size in MB

	// 检查是否为文件尾追加模式，如果是则显示当前内容大小
	var encodeMode = document.getElementById('encodeModeSelect');
	var isTailMode = encodeMode && encodeMode.value === 'tail';
	if(isTailMode) {
		imageMsg.textContent = '文件尾追加模式：当前内容 ' + textSizeMB + 'MB';
		return;
	}

	// 防抖：清除之前的定时器
	if(updateCapacityTimeout) {
		clearTimeout(updateCapacityTimeout);
	}

	// 显示处理中消息
	imageMsg.innerHTML = '<span class="blink">处理中</span>';
	
	// 防抖延迟执行
	updateCapacityTimeout = setTimeout(function(){
		// 再次检查编码状态
		if(isEncodingInProgress) {
			return;
		}
		
		try {
			// 检查是否需要重新计算图像容量
			var currentImageSrc = document.getElementById('preview').src;
			var needRecalculateImage = forceRecalculate || lastImageSrc !== currentImageSrc;
			
			var pngBits, jpgBits;
			
			if(needRecalculateImage || cachedPngBits === null) {
				//start measuring png capacity. Subtract 4 bits used to encode k, 48 for the end marker
				var shadowCanvas = document.createElement('canvas'),
					shadowCtx = shadowCanvas.getContext('2d', { willReadFrequently: true });
				shadowCanvas.style.display = 'none';

				shadowCanvas.width = preview.naturalWidth;
				shadowCanvas.height = preview.naturalHeight;
				shadowCtx.drawImage(preview, 0, 0, shadowCanvas.width, shadowCanvas.height);
				
				var imageData = shadowCtx.getImageData(0, 0, shadowCanvas.width, shadowCanvas.height),
					opaquePixels = 0;
				for(var i = 3; i < imageData.data.length; i += 4){				//look at alpha channel values
					if(imageData.data[i] == 255) opaquePixels++					//use pixels with full opacity only
				}
				pngBits = opaquePixels * 3 - 270;								//4 bits used to encode k, 48 for the end marker, 218 buffer for second message
				
				// 缓存结果
				cachedPngBits = pngBits;
				lastImageSrc = currentImageSrc;
				
				//now measure jpeg capacity
				if(document.getElementById('preview').src.slice(11,15) == 'jpeg'){					//true jpeg capacity calculation
					var lumaCoefficients = [],
						count = 0;
					jsSteg.getCoefficients(document.getElementById('preview').src, function(coefficients){
						var subSampling = 1;
						for(var index = 1; index <= 3; index++){						//first luma, then chroma channels, index 0 is always empty
							lumaCoefficients = coefficients[index];
							if(lumaCoefficients){
								if(index != 1) subSampling = Math.floor(coefficients[1].length / lumaCoefficients.length);
				 	 			for (var i = 0; i < lumaCoefficients.length; i++) {
									for (var j = 0; j < 64; j++) {
										if(lumaCoefficients[i][j] != 0) count += subSampling		//if subsampled, multiply the count since it won't be upon re-encoding
				   	 				}
								}
								if(index == 1) var firstCount = count
							}else{
								count += firstCount													//repeat count if the channel appears not to exist (bug in js-steg)
							}
						}
						jpgBits = Math.floor(count - 270);
						cachedJpgBits = jpgBits;
							
							// Convert bits to MB
							var pngMB = (pngBits / (8 * 1024 * 1024)).toFixed(2);
							var jpgMB = (jpgBits / (8 * 1024 * 1024)).toFixed(2);

							imageMsg.textContent = '可隐藏：PNG ' + pngMB + 'MB，JPG ' + jpgMB + 'MB。当前内容：' + textSizeMB + 'MB'
					})
				}else{															//no jpeg, so estimate capacity for a normal image
					jpgBits = Math.floor(pngBits / 20);
					cachedJpgBits = jpgBits;
					
					// Convert bits to MB
					var pngMB = (pngBits / (8 * 1024 * 1024)).toFixed(2);
					var jpgMB = (jpgBits / (8 * 1024 * 1024)).toFixed(2);

					imageMsg.textContent = '可隐藏：PNG ' + pngMB + 'MB，JPG 至少' + jpgMB + 'MB。当前内容：' + textSizeMB + 'MB'
				}
			} else {
				// 使用缓存的结果
				pngBits = cachedPngBits;
				jpgBits = cachedJpgBits;
				
				// Convert bits to MB
				var pngMB = (pngBits / (8 * 1024 * 1024)).toFixed(2);
				var jpgMB = (jpgBits / (8 * 1024 * 1024)).toFixed(2);

				imageMsg.textContent = '可隐藏：PNG ' + pngMB + 'MB，JPG 至少' + jpgMB + 'MB。当前内容：' + textSizeMB + 'MB'
			}
		} catch(e) {
			console.error('updateCapacity error:', e);
			imageMsg.textContent = '计算容量时出错，但图像仍然可用';
		}
	}, 300); // 300ms 防抖延迟
}

var base64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

//UTF8 to base64 and back, from Mozilla Foundation
function b64EncodeUnicode(str) {
    return btoa(encodeURIComponent(str).replace(/%([0-9A-F]{2})/g, function(match, p1) {
        return String.fromCharCode('0x' + p1);
    }));
}

function b64DecodeUnicode(str) {
    return decodeURIComponent(atob(str).split('').map(function(c) {
        return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
    }).join(''));
}

//retrieves base64 string from binary array. No error checking
function fromBin(input){
	var length = input.length - (input.length % 6),
		output = new Array(length / 6),
		index = 0;
	
	for(var i = 0; i < length; i = i+6) {
		index = 0;
		for(var j = 0; j < 6; j++){
			index = 2 * index + input[i+j]
		}
		output[i / 6] = base64.charAt(index)
    }
	return output.join('')
}

//makes the binary equivalent (array) of a base64 string. No error checking
function toBin(input){
	var output = new Array(input.length * 6),
		code = 0,
		digit = 0,
		divider = 32;
	
    for(var i = 0; i < input.length; i++) {
		code = base64.indexOf(input.charAt(i));
		divider = 32;
		for(var j = 0; j < 5; j++){
			digit = code >= divider ? 1 : 0;
			code -= digit * divider;
			divider = divider / 2;
			output[6 * i + j] = digit
		}
		output[6 * i + 5] = code;
    }
	return output
}

// 获取合并内容（图片列表 + 文本框）
function getCombinedContent() {
	var imageContent = getContainerHtmlWithFullImageSources(imageListBox);
	var textContent = mainBox.innerHTML.trim();
	var combined = '';
	
	if(imageContent) {
		combined += '<div class="stego-image-section">' + imageContent + '</div>';
	}
	if(textContent) {
		combined += '<div class="stego-text-section">' + textContent + '</div>';
	}
	
	return combined;
}

// 存储处理后的图像数据
var processedImageData = null;
var processedImageFilename = 'stego-image.png';

// 存储提取的内容
var extractedContent = null;

// 存储原始封面文件和原始 data URL
var originalCoverFile = null;
var originalCoverDataURL = null;

// 存储二进制文件数据，用于文件尾追加（新功能）
var binaryFilesForTail = []; // 存储 {name, type, data: ArrayBuffer}
var textForTail = ''; // 存储纯文本内容

// 启用嵌入屏幕下载按钮
function enableDownload() {
    downloadBtn.disabled = false;
    // 普通模式下恢复按钮文本为"下载"
    if (!processedImagesForDownload || processedImagesForDownload.length === 0) {
        downloadBtn.textContent = '下载';
    }
}

// 启用提取屏幕下载按钮
function enableDecodeDownload() {
    downloadBtnDecode.disabled = false;
}

// 禁用提取屏幕下载按钮
function disableDecodeDownload() {
    downloadBtnDecode.disabled = true;
    extractedContent = null;
}

// 禁用下载按钮
function disableDownload() {
    downloadBtn.disabled = true;
    processedImageData = null;
    // 清空处理后的图片数据
    processedImagesForDownload = [];
    // 恢复按钮文本为"下载"
    downloadBtn.textContent = '下载';
}

// 下载处理后的图像
function downloadProcessedImage() {
    // 检查是否有处理后的多载体图片
    if (processedImagesForDownload && processedImagesForDownload.length > 0) {
        // 载体库模式 - 逐个下载所有文件
        downloadAllImagesSequentially();
        return;
    }
    
    // 普通模式 - 下载单个文件
    if (!processedImageData) {
        imageMsg.textContent = '没有可下载的图像';
        return;
    }
    
    var link = document.createElement('a');
    link.href = processedImageData;
    link.download = processedImageFilename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

// 逐个下载所有图片
function downloadAllImagesSequentially() {
    if (!processedImagesForDownload || processedImagesForDownload.length === 0) {
        return;
    }
    
    var index = 0;
    
    function downloadNext() {
        if (index >= processedImagesForDownload.length) {
            imageMsg.textContent = '所有文件下载完成！';
            return;
        }
        
        var img = processedImagesForDownload[index];
        var link = document.createElement('a');
        link.href = img.data;
        link.download = img.name;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        
        imageMsg.textContent = '正在下载 ' + (index + 1) + '/' + processedImagesForDownload.length + ': ' + img.name;
        
        index++;
        
        // 延迟500ms下载下一个，避免浏览器拦截
        setTimeout(downloadNext, 500);
    }
    
    downloadNext();
}

// 辅助函数：写入 4 字节无符号整数（小端序）
function writeUint32LE(uint8Array, offset, value) {
    uint8Array[offset] = value & 0xFF;
    uint8Array[offset + 1] = (value >> 8) & 0xFF;
    uint8Array[offset + 2] = (value >> 16) & 0xFF;
    uint8Array[offset + 3] = (value >> 24) & 0xFF;
}

// 辅助函数：读取 4 字节无符号整数（小端序）
function readUint32LE(uint8Array, offset) {
    return (uint8Array[offset]) |
           (uint8Array[offset + 1] << 8) |
           (uint8Array[offset + 2] << 16) |
           (uint8Array[offset + 3] << 24);
}

// 辅助函数：写入字符串
function writeString(uint8Array, offset, str) {
    var encoder = new TextEncoder();
    var bytes = encoder.encode(str);
    for (var i = 0; i < bytes.length; i++) {
        uint8Array[offset + i] = bytes[i];
    }
    return bytes.length;
}

// 辅助函数：读取字符串
function readString(uint8Array, offset, length) {
    var decoder = new TextDecoder();
    return decoder.decode(uint8Array.subarray(offset, offset + length));
}

// 简化的文件尾追加函数（使用二进制格式）- 带进度条和异步处理
function appendToFileTail(){    
    // 显示进度条
    showProgressBar('正在准备数据...');
    updateProgress(0, '检查内容...');
    
    // 检查是否有内容需要隐藏
    var hasBinaryFiles = binaryFilesForTail && binaryFilesForTail.length > 0;
    var hasTextContent = mainBox.innerHTML.trim() !== '';
    var rawPassword = String(imagePwd.value || '').trim();
    var pwdArray = normalizePasswordChain(imagePwd.value);
    var password = pwdArray[0];
    
    if(!hasBinaryFiles && !hasTextContent){        
        hideProgressBar();
        imageMsg.textContent = '没有要隐藏的内容';
        return;
    }
    if(!originalCoverFile && preview.src.length < 100){                                                                             
        hideProgressBar();
        imageMsg.textContent = '请在点击此按钮前加载图像';
        return;
    }
    
    // 使用异步处理，避免UI冻结
    setTimeout(function() {
        try {
            updateProgress(10, '准备二进制数据...');
            
            // 准备元数据
            var metadata = {
                version: 1,
                compressed: true,
                files: [],
                password: password
            };
            
            // 收集所有二进制数据
            var totalSize = 0;
            var binaryParts = [];
            
            // 处理二进制文件
            if(hasBinaryFiles) {
                var totalFiles = binaryFilesForTail.length;
                binaryFilesForTail.forEach(function(fileData, index) {
                    var fileProgress = 10 + (index / totalFiles) * 30;
                    updateProgress(fileProgress, '处理文件: ' + fileData.name + ' (' + (index + 1) + '/' + totalFiles + ')');
                    
                    // 添加到元数据
                    metadata.files.push({
                        name: fileData.name,
                        type: fileData.type || 'application/octet-stream',
                        size: fileData.data.byteLength
                    });
                    
                    // 添加到二进制数据
                    binaryParts.push(new Uint8Array(fileData.data));
                    totalSize += fileData.data.byteLength;
                });
            }
            
            // 处理文本内容
            if(hasTextContent) {
                var textContent = mainBox.innerHTML.trim();
                var textEncoder = new TextEncoder();
                var textData = textEncoder.encode(textContent);
                
                metadata.files.push({
                    name: 'text_content.html',
                    type: 'text/html',
                    size: textData.length
                });
                
                binaryParts.push(textData);
                totalSize += textData.length;
            }
            
            updateProgress(50, '合并二进制数据...');
            
            console.log('原始数据总大小:', totalSize, '字节');
            
            // 合并所有二进制数据
            var combinedData = new Uint8Array(totalSize);
            var offset = 0;
            for (var i = 0; i < binaryParts.length; i++) {
                combinedData.set(binaryParts[i], offset);
                offset += binaryParts[i].length;
            }
            
            updateProgress(60, '智能压缩检测...');
            
            console.log('原始数据总大小:', totalSize, '字节');
            
            // 智能压缩二进制数据
            var compressResult = smartCompressBinaryData(combinedData);
            var finalPayloadData = compressResult.data;
            var isCompressed = compressResult.compressed;
            
            if (isCompressed) {
                console.log('压缩后大小:', finalPayloadData.length, '字节');
                console.log('压缩率:', ((1 - finalPayloadData.length / totalSize) * 100).toFixed(2) + '%');
            } else {
                console.log('未压缩，直接嵌入原始数据');
            }
            
            updateProgress(70, '准备元数据...');
            
            // 准备元数据JSON（标记是否压缩）
            metadata.compressed = isCompressed;
            var metadataJson = JSON.stringify(metadata);
            var metadataBytes = new TextEncoder().encode(metadataJson);
            
            console.log('元数据大小:', metadataBytes.length, '字节');
            
            // 构建最终数据格式：
            // [MAGIC][METADATA_LENGTH][METADATA][PAYLOAD_DATA][MAGIC]
            var MAGIC = "PASSLOK_BINARY_TAIL";
            var magicBytes = new TextEncoder().encode(MAGIC);
            
            // 计算总大小
            var totalDataSize = magicBytes.length + 4 + metadataBytes.length + finalPayloadData.length + magicBytes.length;
            
            // 创建最终数据
            var finalData = new Uint8Array(totalDataSize);
            var pos = 0;
            
            // 写入开始标记
            finalData.set(magicBytes, pos);
            pos += magicBytes.length;
            
            // 写入元数据长度（4字节，小端序）
            finalData[pos] = metadataBytes.length & 0xFF;
            finalData[pos + 1] = (metadataBytes.length >> 8) & 0xFF;
            finalData[pos + 2] = (metadataBytes.length >> 16) & 0xFF;
            finalData[pos + 3] = (metadataBytes.length >> 24) & 0xFF;
            pos += 4;
            
            // 写入元数据
            finalData.set(metadataBytes, pos);
            pos += metadataBytes.length;
            
            // 写入负载数据（可能压缩或未压缩）
            finalData.set(finalPayloadData, pos);
            pos += finalPayloadData.length;
            
            // 写入结束标记
            finalData.set(magicBytes, pos);
            
            console.log('最终数据大小:', finalData.length, '字节');
            
            updateProgress(80, '处理图像文件...');
            
            // 设置编码进行中的标志位
            isEncodingInProgress = true;
            
            // 使用原始文件或从 preview.src 获取
            var processImage = function() {
                if (originalCoverFile) {
                    var reader = new FileReader();
                    reader.onload = function(e) {
                        updateProgress(90, '追加数据到图像...');
                        var arrayBuffer = e.target.result;
                        var contentType = originalCoverFile.type || 'image/png';
                        processImageDataBinary(arrayBuffer, contentType, finalData);
                    };
                    reader.readAsArrayBuffer(originalCoverFile);
                } else {
                    // 从 preview.src 获取图像数据
                    fetch(preview.src)
                        .then(response => {
                            var contentType = response.headers.get('content-type');
                            return response.blob().then(blob => ({ blob, contentType }));
                        })
                        .then(({ blob, contentType }) => {
                            updateProgress(90, '追加数据到图像...');
                            return blob.arrayBuffer().then(arrayBuffer => ({ arrayBuffer, contentType }));
                        })
                        .then(({ arrayBuffer, contentType }) => {
                            processImageDataBinary(arrayBuffer, contentType, finalData);
                        })
                        .catch(error => {
                            console.error('Error appending data:', error);
                            hideProgressBar();
                            imageMsg.textContent = '追加数据时出错: ' + error.message;
                        });
                }
            };
            
            processImage();
        } catch (error) {
            hideProgressBar();
            imageMsg.textContent = '处理数据时出错: ' + error.message;
            console.error('Processing error:', error);
        }
    }, 10); // 10ms 延迟，让UI有机会更新
    
    // 处理图像数据的核心函数（二进制版本）
    function processImageDataBinary(arrayBuffer, contentType, dataToAppend) {
        console.log('原始图像大小:', arrayBuffer.byteLength, '字节');
        console.log('追加数据大小:', dataToAppend.length, '字节');
        console.log('最终文件大小:', (arrayBuffer.byteLength + dataToAppend.length), '字节');
        
        // 创建新的 ArrayBuffer
        var newBuffer = new ArrayBuffer(arrayBuffer.byteLength + dataToAppend.length);
        var newUint8Array = new Uint8Array(newBuffer);
        
        // 复制原始图像
        newUint8Array.set(new Uint8Array(arrayBuffer), 0);
        
        // 追加数据
        newUint8Array.set(dataToAppend, arrayBuffer.byteLength);
        
        // 创建新的 blob
        var newBlob = new Blob([newUint8Array], {type: contentType});
        var newUrl = URL.createObjectURL(newBlob);
        
        // 更新预览
        preview.src = newUrl;
        
        // 存储下载数据
        processedImageData = newUrl;
        processedImageFilename = 'stego-image-tail.' + (contentType.includes('png') ? 'png' : 'jpg');
        
        // 启用下载
        enableDownload();
        
        // 隐藏进度条并显示成功消息
        hideProgressBar();
        imageMsg.textContent = '数据已追加到图像文件尾。点击下载按钮保存图像。';
        
        // 设置冷却时间
        if (rawPassword && passwordCopyPromptEnabled) {
            openPasswordCopyModal(rawPassword);
        }

        encodingCompleteCooldown = Date.now() + 10000;
        
        // 清除编码标志位
        setTimeout(function() {
            isEncodingInProgress = false;
        }, 2000);
        
<<<<<<< HEAD
        // 仅清空密码，保留当前待隐藏内容，允许在已导出基础上继续补充文本再次导出
        imagePwd.value = '';
=======
        // 清理
        imagePwd.value = '';
        binaryFilesForTail = [];
        textForTail = '';
>>>>>>> 0dc18f116fc6797a73c2104eea46f8c1e6e32440
    }
}

// ========== 多载体编码功能 ==========
// 处理多个载体的编码，使用文件尾追加，逐个下载
function encodeMultipleCarriers() {
  var text = getCombinedContent();
  var rawPassword = String(imagePwd.value || '').trim();
  
  if(!text){
    imageMsg.textContent = '没有要隐藏的内容';
    return;
  }
  
  if(selectedCarriers.length === 0){
    imageMsg.textContent = '没有选择载体，请先导入隐藏文件';
    return;
  }
  
  imageMsg.innerHTML = '<span class="blink">处理中 (0/' + selectedCarriers.length + ')</span>';
  isEncodingInProgress = true;
  
  var pwdArray = normalizePasswordChain(imagePwd.value);
  
  var password = pwdArray[0];
  
  // 压缩完整内容 - 使用分块压缩避免大文件错误
  var compressedData = compressLargeData(text);
  
  // 准备标记
  var marker = "PASSLOK_STEGO_TAIL";
  
  // 计算每个载体应该存放的数据大小
  var numCarriers = selectedCarriers.length;
  
  // 将压缩数据分成numCarriers份
  var chunkSize = Math.ceil(compressedData.length / numCarriers);
  var dataChunks = [];
  
  for(var i = 0; i < numCarriers; i++) {
    var start = i * chunkSize;
    var end = Math.min(start + chunkSize, compressedData.length);
    var chunk = compressedData.substring(start, end);
    
    // 为每个分块添加索引信息，便于提取时重组
    var chunkWithIndex = i + '|' + numCarriers + '|' + chunk;
    
    var dataToAppend;
    if(password) {
      dataToAppend = marker + password + '|' + chunkWithIndex + marker;
    } else {
      dataToAppend = marker + chunkWithIndex + marker;
    }
    
    dataChunks.push(dataToAppend);
  }
  
  var processedImages = [];
  var completedCount = 0;
  
  // 完成所有编码后的处理
  function onAllEncodingComplete() {
    imagePwd.value = '';
    
    // 设置冷却时间
    encodingCompleteCooldown = Date.now() + 10000;
    setTimeout(function() {
      isEncodingInProgress = false;
    }, 2000);
    
    if(processedImages.length === 0) {
      imageMsg.textContent = '编码失败，没有生成任何图像';
      return;
    }
    
    // 存储处理后的图片数据
    processedImagesForDownload = processedImages;
    
    // 显示完成消息
    imageMsg.textContent = '处理完成！共生成 ' + processedImages.length + ' 个载密体文件，点击下方按钮下载全部';
    
    // 启用原来的下载按钮
    var downloadBtn = document.getElementById('downloadBtn');
    downloadBtn.disabled = false;
    downloadBtn.textContent = '下载';
    if (rawPassword && passwordCopyPromptEnabled) {
      openPasswordCopyModal(rawPassword);
    }
  }
  
  // 逐个处理载体
  function processNextCarrier(index) {
    if(index >= selectedCarriers.length) {
      return;
    }
    
    var carrier = selectedCarriers[index];
    var dataToAppend = dataChunks[index];
    
    imageMsg.innerHTML = '<span class="blink">处理中 (' + (index + 1) + '/' + selectedCarriers.length + ') - ' + carrier.name + '</span>';
    
    // 将dataURL转换为Blob进行处理
    var base64Data = carrier.dataUrl.split(',')[1];
    var byteString = atob(base64Data);
    var ab = new ArrayBuffer(byteString.length);
    var ia = new Uint8Array(ab);
    for(var i = 0; i < byteString.length; i++) {
      ia[i] = byteString.charCodeAt(i);
    }
    
    var contentType = carrier.type || 'image/png';
    
    // 追加数据到文件尾
    var textEncoder = new TextEncoder();
    var dataBytes = textEncoder.encode(dataToAppend);
    
    // 创建新的 ArrayBuffer
    var newBuffer = new ArrayBuffer(ab.byteLength + dataBytes.length);
    var newUint8Array = new Uint8Array(newBuffer);
    
    // 复制原始图像
    newUint8Array.set(new Uint8Array(ab), 0);
    
    // 追加数据
    newUint8Array.set(dataBytes, ab.byteLength);
    
    // 创建新的 blob
    var newBlob = new Blob([newUint8Array], {type: contentType});
    var newUrl = URL.createObjectURL(newBlob);
    
    // 保存处理后的图片
    var extension = contentType.includes('png') ? 'png' : 'jpg';
    var filename = 'stego_' + (index + 1) + '_' + carrier.name.replace(/\.[^/.]+$/, '') + '.' + extension;
    
    processedImages.push({
      name: filename,
      data: newUrl
    });
    
    console.log('载体处理成功:', carrier.name);
    
    completedCount++;
    if(completedCount >= selectedCarriers.length) {
      onAllEncodingComplete();
    } else {
      // 继续处理下一个载体
      processNextCarrier(index + 1);
    }
  }
  
  // 开始处理第一个载体
  processNextCarrier(0);
}

//function to encode mainBox into the image
function encode(){
	var text = getCombinedContent();
	var isPNG = this.id == 'encodePNGBtn';

	if(!text){
		imageMsg.textContent = '没有要隐藏的内容';
		return
	}
	if(!originalCoverDataURL && preview.src.length < 100){																			//no image loaded
		imageMsg.textContent = '请在点击此按钮前加载图像';
		return
	}
	imageMsg.innerHTML = '<span class="blink">处理中</span>';				//Get blinking message started
	
	// 设置编码进行中的标志位，防止updateCapacity被触发
	isEncodingInProgress = true;
	
	// 始终使用压缩 - 使用分块压缩避免大文件错误
	var array2embed = toBin(compressLargeData(text))
	
	var pwdArray = normalizePasswordChain(imagePwd.value); 														//in case there is a hidden message and password
	
	// 智能密码始终禁用
	var iter = 0;
	
	if(pwdArray[1]) var iter2 = 0;		//for hidden message
	if(pwdArray[2]){
		var array2embed2 = toBin(compressLargeData(pwdArray[2]))
	}
	
	function onEncodingComplete(msg) {
		var rawPassword = String(imagePwd.value || '').trim();
		imagePwd.value = '';
		
		// 设置冷却时间：编码完成后的 10 秒内完全禁用 updateCapacity（确保绝对安全）
		encodingCompleteCooldown = Date.now() + 10000;
		
		// 延迟清除编码进行中的标志
		setTimeout(function() {
			isEncodingInProgress = false;
		}, 2000);
		
		if(msg) {
			imageMsg.textContent = msg;
			return;
		}
		
		// Store the image data for download
		processedImageData = preview.src;
		processedImageFilename = 'stego-image.' + (isPNG ? 'png' : 'jpg');
		
		// Enable download button
		enableDownload();
		
		// Update message
		imageMsg.textContent = '数据已隐藏在图像中。点击下载按钮保存图像。';

		if (rawPassword && passwordCopyPromptEnabled) {
			openPasswordCopyModal(rawPassword);
		}
	}
	
	// 先恢复原始图像，再进行编码
	var encodeWithOriginal = function() {
		if(isPNG){
			setTimeout(function(){
				encodePNG(preview,array2embed,pwdArray[0],onEncodingComplete,
				false,iter,															//iter: add extra computations for weak Passwords; false: add extra noise even if compressed
				array2embed2,pwdArray[1],iter2										//for hidden message, if any
				);
				imagePwd.value = ''
			},10)
		}else{
			setTimeout(function(){
				encodeJPG(preview,array2embed,pwdArray[0],onEncodingComplete,
				false,iter,
				array2embed2,pwdArray[1],iter2
				);
				imagePwd.value = ''
			},10)
		}
	};
	
	if(originalCoverDataURL) {
		// 使用原始 data URL
		preview.src = originalCoverDataURL;
		// 等待图像加载完成后再编码
		preview.onload = function() {
			// 编码前临时禁用 onload，防止编码过程中再次触发
			preview.onload = null;
			encodeWithOriginal();
		};
	} else {
		// 没有原始 data URL，直接编码，先禁用 onload
		preview.onload = null;
		encodeWithOriginal();
	}
}

// 存储提取到的文件信息
var extractedFiles = [];

// 给链接添加不可编辑属性
function makeLinksNonEditable(container) {
	var links = container.querySelectorAll('a');
	links.forEach(function(link) {
		link.setAttribute('contenteditable', 'false');
		link.setAttribute('draggable', 'false');
		// 确保链接作为一个整体
		link.style.display = 'inline-block';
		link.style.userSelect = 'all';
		link.style.webkitUserSelect = 'all';
	});
}

// 确保提取页面的链接可以正常跳转
function makeDecodeLinksClickable(container) {
	var links = container.querySelectorAll('a');
	links.forEach(function(link) {
		// 确保链接有 target="_blank" 属性
		if (!link.hasAttribute('target')) {
			link.setAttribute('target', '_blank');
		}
		// 确保链接可以点击（移除可能存在的阻止跳转事件）
		link.style.pointerEvents = 'auto';
	});
	
	// 处理链接标签，让它们可以点击跳转
	var linkTags = container.querySelectorAll('.link-tag');
	linkTags.forEach(function(tag) {
		// 提取 [内容] 中的内容
		var text = tag.textContent;
		var content = text.replace(/^\[|\]$/g, '');
		
		// 检查是否是URL
		var isUrl = /^(https?:\/\/|www\.)/i.test(content);
		
		if (isUrl) {
			// 如果是URL，添加点击跳转
			tag.style.cursor = 'pointer';
			tag.style.textDecoration = 'underline';
			tag.title = '点击打开链接';
			
			tag.addEventListener('click', function(e) {
				e.stopPropagation();
				var url = content;
				if (!url.startsWith('http')) {
					url = 'https://' + url;
				}
				window.open(url, '_blank');
			});
		}
	});
}

// 处理提取的内容，分离图片和文本
<<<<<<< HEAD
function reorderExtractedContentSections(container) {
	var resultContents = container.querySelectorAll('.extracted-result-content');
	resultContents.forEach(function(contentDiv) {
		var textSection = contentDiv.querySelector('.stego-text-section');
		var imageSection = contentDiv.querySelector('.stego-image-section');
		if (textSection && imageSection && textSection.compareDocumentPosition(imageSection) & Node.DOCUMENT_POSITION_PRECEDING) {
			contentDiv.insertBefore(textSection, imageSection);
		}
	});
}

function highlightExtractedTextSections(container) {
	var textSections = container.querySelectorAll('.stego-text-section');
	textSections.forEach(function(section) {
		highlightExtractedTextNode(section);
	});
}

function highlightExtractedTextNode(node) {
	if (!node) return;
	if (node.nodeType === Node.TEXT_NODE) {
		if (!node.textContent || !node.textContent.trim()) return;
		var span = document.createElement('span');
		span.className = 'extracted-text-highlight';
		span.textContent = node.textContent;
		node.parentNode.replaceChild(span, node);
		return;
	}
	if (node.nodeType !== Node.ELEMENT_NODE) return;
	if (node.tagName === 'A' || (node.classList && node.classList.contains('link-tag'))) {
		return;
	}
	Array.from(node.childNodes).forEach(function(child) {
		highlightExtractedTextNode(child);
	});
}

=======
>>>>>>> 0dc18f116fc6797a73c2104eea46f8c1e6e32440
function processExtractedContent(content, isDecodeScreen) {
	var boxElement = isDecodeScreen ? mainBoxDecode : mainBox;
	
	// 重置提取文件列表
	extractedFiles = [];
	
	// 尝试解析内容
	var tempDiv = document.createElement('div');
	tempDiv.innerHTML = content;
<<<<<<< HEAD
	if (isDecodeScreen) {
		reorderExtractedContentSections(tempDiv);
		highlightExtractedTextSections(tempDiv);
	}
	var normalizedContent = tempDiv.innerHTML;
=======
>>>>>>> 0dc18f116fc6797a73c2104eea46f8c1e6e32440
	
	// 无论是否有分离的内容，在提取页面都直接将所有内容放入文本框
	if(isDecodeScreen) {
		// 提取页面：直接显示所有内容
<<<<<<< HEAD
		boxElement.innerHTML = normalizedContent;
		// 更新保存的内容状态
		if (boxElement._lastContent !== undefined) {
			boxElement._lastContent = normalizedContent;
=======
		boxElement.innerHTML = content;
		// 更新保存的内容状态
		if (boxElement._lastContent !== undefined) {
			boxElement._lastContent = content;
>>>>>>> 0dc18f116fc6797a73c2104eea46f8c1e6e32440
		}
		collectExtractedFiles(tempDiv);
		// 给所有链接添加不可编辑属性
		makeLinksNonEditable(boxElement);
		// 确保链接可以跳转
		makeDecodeLinksClickable(boxElement);
		// 为所有图片容器设置不可编辑属性
		var imageContainers = boxElement.querySelectorAll('.cover-image-list-item, .image-list-item, .carrier-library-item');
		imageContainers.forEach(function(container) {
			container.contentEditable = 'false';
		});
		// 为所有图片设置不可编辑属性
		var images = boxElement.querySelectorAll('img');
		images.forEach(function(img) {
			img.contentEditable = 'false';
		});
		
		// 检查每个提取结果块，如果只有图片则隐藏复制按钮
		var resultBlocks = boxElement.querySelectorAll('.extracted-result-block');
		resultBlocks.forEach(function(block) {
			var contentDiv = block.querySelector('.extracted-result-content');
			var copyBtn = block.querySelector('.copy-text-btn');
			if (contentDiv && copyBtn) {
				// 克隆内容div以进行检查
				var cloneDiv = contentDiv.cloneNode(true);
				
				// 移除图片区域容器
				var imageSections = cloneDiv.querySelectorAll('.stego-image-section');
				imageSections.forEach(function(el) { el.remove(); });
				
				// 移除图片列表容器（包含图片和文件名）
				var imageListItems = cloneDiv.querySelectorAll('.image-list-item, .file-list-item');
				imageListItems.forEach(function(el) { el.remove(); });
				
				// 移除图片文件名元素
				var fileNames = cloneDiv.querySelectorAll('.image-filename, .extracted-filename, .decode-filename');
				fileNames.forEach(function(el) { el.remove(); });
				
				// 移除下载链接
				var downloadLinks = cloneDiv.querySelectorAll('a[download]');
				downloadLinks.forEach(function(el) { el.remove(); });
				
				// 移除图片元素
				var imgs = cloneDiv.querySelectorAll('img');
				imgs.forEach(function(el) { el.remove(); });
				
				// 获取纯文本
				var text = cloneDiv.textContent || cloneDiv.innerText;
				text = text.replace(/\s+/g, ' ').trim();
				
				// 如果没有可复制的文本，隐藏复制按钮
				if (text.length === 0) {
					copyBtn.style.display = 'none';
				}
			}
		});
	} else {
		// 嵌入页面：保持原有逻辑
		var imageListBoxTarget = imageListBox;
		var imageSection = tempDiv.querySelector('.stego-image-section');
		var textSection = tempDiv.querySelector('.stego-text-section');
		
		if(imageSection || textSection) {
			// 有分离的内容
			if(imageListBoxTarget && imageSection) {
				imageListBoxTarget.innerHTML = imageSection.innerHTML;
				// 收集提取到的文件信息
				collectExtractedFiles(imageSection);
			}
			if(textSection) {
				boxElement.innerHTML = textSection.innerHTML;
				// 给所有链接添加不可编辑属性
				makeLinksNonEditable(boxElement);
			} else if(imageSection && !imageListBoxTarget) {
				// 直接显示所有内容
				boxElement.innerHTML = content;
				collectExtractedFiles(tempDiv);
				// 给所有链接添加不可编辑属性
				makeLinksNonEditable(boxElement);
			}
		} else {
			// 没有分离的内容，直接显示
			boxElement.innerHTML = content;
			collectExtractedFiles(tempDiv);
			// 给所有链接添加不可编辑属性
			makeLinksNonEditable(boxElement);
		}
	}
	
	// 动态调整提取屏幕的容器样式
	if(isDecodeScreen) {
		updateDecodeContainerStyles();
	}
<<<<<<< HEAD

	return normalizedContent;
=======
>>>>>>> 0dc18f116fc6797a73c2104eea46f8c1e6e32440
}

// 收集提取到的文件信息
function collectExtractedFiles(containerElement) {
	var fileLinks = containerElement.querySelectorAll('a[download][href^="data:"]');
	var images = containerElement.querySelectorAll('img[src^="data:"]');
	
	fileLinks.forEach(function(link) {
		extractedFiles.push({
			type: 'file',
			name: link.getAttribute('download') || 'downloaded_file',
			data: link.getAttribute('href'),
			element: link
		});
	});
	
	images.forEach(function(img, index) {
		var src = img.getAttribute('src');
		var ext = 'png';
		
		if (src.startsWith('data:image/jpeg') || src.startsWith('data:image/jpg')) {
			ext = 'jpg';
		} else if (src.startsWith('data:image/gif')) {
			ext = 'gif';
		} else if (src.startsWith('data:image/webp')) {
			ext = 'webp';
		} else if (src.startsWith('data:image/bmp')) {
			ext = 'bmp';
		}
		
		var originalName = img.getAttribute('alt') || img.getAttribute('title') || img.getAttribute('data-filename') || '';
		
		if (!originalName) {
			var parentElement = img.parentElement;
			if (parentElement) {
				var filenameSpan = parentElement.querySelector('.image-filename');
				if (filenameSpan && filenameSpan.textContent) {
					originalName = filenameSpan.textContent.trim();
				}
			}
		}
		
		if (!originalName) {
			var nextSibling = img.nextElementSibling;
			if (nextSibling && nextSibling.classList && nextSibling.classList.contains('image-filename')) {
				originalName = nextSibling.textContent.trim();
			}
		}
		
		var fileName;
		if (originalName) {
			fileName = originalName;
			if (!fileName.match(/\.(png|jpg|jpeg|gif|webp|bmp)$/i)) {
				fileName = fileName.replace(/\.[^.]+$/, '') + '.' + ext;
			}
		} else {
			fileName = 'extracted_image_' + (index + 1) + '.' + ext;
		}
		
		extractedFiles.push({
			type: 'image',
			name: fileName,
			data: src,
			element: img
		});
	});
}

//extract text from the image
function decode(){  
	// Determine which screen's elements to use
	var isDecodeScreen = decodeScr.style.display !== 'none';
	var msgElement = isDecodeScreen ? imageMsgDecode : imageMsg;
	var pwdElement = isDecodeScreen ? imagePwdDecode : imagePwd;
	var boxElement = isDecodeScreen ? mainBoxDecode : mainBox;
	var previewElement = preview;

	// 检查是否有多个待解码图片
	if (isDecodeScreen && imagesToDecode && imagesToDecode.length > 0) {
		// 有多个图片，使用批量解码
		decodeMultipleImages(imagesToDecode, msgElement, pwdElement, boxElement, isDecodeScreen);
		return;
	}

	// 提取页面没有导入图片时提示用户
	if (isDecodeScreen && (!imagesToDecode || imagesToDecode.length === 0)) {
		msgElement.textContent = '请先导入图像';
		return;
	}

	// 单个图片解码（原有逻辑）
	msgElement.innerHTML = '<span class="blink">处理中</span>';

	var pwdArray = normalizePasswordChain(pwdElement.value);

	// First check for file tail steganography - 始终使用压缩
	checkFileTailStego(previewElement, pwdArray[0], true, function(tailData, tailMsg){
		if(tailMsg && tailMsg.slice(0,6) == 'Reveal'){
			var content = decryptSanitizer(tailData);
			// 获取文件名并包装内容
			var fileName = document.getElementById('previewFilename').textContent || '未知文件';
			var wrappedContent = '<div class="extracted-result-block"><div class="extracted-image-title-row"><div class="extracted-image-title" contenteditable="false" spellcheck="false">' + fileName + ' - 提取结果 1</div><button class="copy-text-btn" contenteditable="false" onclick="copyExtractedText(this)" title="复制纯文本">复制文本</button></div><div class="extracted-result-content">' + content + '</div></div>';
<<<<<<< HEAD
			var renderedContent = processExtractedContent(wrappedContent, isDecodeScreen);
			if(isDecodeScreen) {
				extractedContent = renderedContent;
=======
			processExtractedContent(wrappedContent, isDecodeScreen);
			if(isDecodeScreen) {
				extractedContent = wrappedContent;
>>>>>>> 0dc18f116fc6797a73c2104eea46f8c1e6e32440
				enableDecodeDownload();
			}
			msgElement.textContent = '从文件尾提取成功';
			boxElement.focus();
			pwdElement.value = '';
			return;
		}
		
		// If no file tail data found, try regular steganography - 智能密码始终禁用
		var iter = 0;

		if(pwdArray[1]) var iter2 = 0;

		setTimeout(function(){
			decodeImage(previewElement,pwdArray[0],function(textBin,msg){
				var content;
				// 始终使用压缩 - 使用分块解压
				content = decryptSanitizer(decompressLargeData(fromBin(textBin)))
				// 获取文件名并包装内容
				var fileName = document.getElementById('previewFilename').textContent || '未知文件';
				var wrappedContent = '<div class="extracted-result-block"><div class="extracted-image-title-row"><div class="extracted-image-title" contenteditable="false" spellcheck="false">' + fileName + ' - 提取结果 1</div><button class="copy-text-btn" contenteditable="false" onclick="copyExtractedText(this)" title="复制纯文本">复制文本</button></div><div class="extracted-result-content">' + content + '</div></div>';
<<<<<<< HEAD
			var renderedContent = processExtractedContent(wrappedContent, isDecodeScreen);
				if(isDecodeScreen) {
					extractedContent = renderedContent;
=======
			processExtractedContent(wrappedContent, isDecodeScreen);
				if(isDecodeScreen) {
					extractedContent = wrappedContent;
>>>>>>> 0dc18f116fc6797a73c2104eea46f8c1e6e32440
					enableDecodeDownload();
				}
				if(msg && msg.slice(0,6) == '提取'){
					msg = '提取成功';
					boxElement.focus()
				}else{
					pwdElement.focus()
				}
				pwdElement.value = '';
				msgElement.textContent = msg
				},
				false,iter,
				
				pwdArray[1],function(textBin,msg){
				// 始终使用压缩 - 使用分块解压
				msgElement.innerHTML = decryptSanitizer(decompressLargeData(fromBin(textBin)))
				},
				iter2);
		},10);
	});
}

// 批量解码多个图片
function decodeMultipleImages(images, msgElement, pwdElement, boxElement, isDecodeScreen) {
	var pwdArray = normalizePasswordChain(pwdElement.value);
	
	var password = pwdArray[0];
	var totalImages = images.length;
	var processedCount = 0;
	var extractedDataList = []; // 存储所有提取到的数据

	// 重置分块数据
	extractedChunks = [];
	expectedChunkCount = 0;

	msgElement.innerHTML = '<span class="blink">正在处理第 1/' + totalImages + ' 个图片...</span>';

	// 处理单个图片
	function processSingleImage(imageData, index) {
		// 创建临时图片元素
		var tempImg = new Image();
		tempImg.src = imageData.dataUrl;

		tempImg.onload = function() {
			// 先检查文件尾隐写
			checkFileTailStego(tempImg, password, true, function(tailData, tailMsg) {
				if (tailMsg && tailMsg.slice(0,6) == 'Reveal') {
					// 找到了文件尾数据
					var content = decryptSanitizer(tailData);
					extractedDataList.push({
						imageName: imageData.name,
						content: content
					});
					processedCount++;
					continueProcessing();
				} else {
					// 没有找到文件尾数据，尝试DCT/LSB解码
					var iter = 0;
					decodeImage(tempImg, password, function(textBin, msg) {
						// 检查是否成功提取到数据
						if(textBin && textBin.length > 0 && msg && msg.indexOf('提取成功') !== -1) {
							var content = decryptSanitizer(decompressLargeData(fromBin(textBin)));
							// 再次检查内容是否有效
							if(content && content.trim() !== '' && content !== 'null' && content !== 'undefined') {
								extractedDataList.push({
									imageName: imageData.name,
									content: content
								});
							}
						}
						processedCount++;
						continueProcessing();
					}, false, iter, null, function(textBin, msg) {
						// DCT解码失败，记录无数据
						processedCount++;
						continueProcessing();
					});
				}
			});
		};
	}

	// 继续处理下一个图片或完成
	function continueProcessing() {
		if (processedCount < totalImages) {
			msgElement.innerHTML = '<span class="blink">正在处理第 ' + (processedCount + 1) + '/' + totalImages + ' 个图片...</span>';
			processSingleImage(images[processedCount], processedCount);
		} else {
			// 所有图片处理完毕
			if (extractedDataList.length > 0) {
				// 每个提取结果单独一块区域，标题右侧添加复制按钮
				var allContent = extractedDataList.map(function(item, idx) {
					return '<div class="extracted-result-block"><div class="extracted-image-title-row"><div class="extracted-image-title" contenteditable="false" spellcheck="false">' + item.imageName + ' - 提取结果 ' + (idx + 1) + '</div><button class="copy-text-btn" contenteditable="false" onclick="copyExtractedText(this)" title="复制纯文本">复制文本</button></div><div class="extracted-result-content">' + item.content + '</div></div>';
				}).join('\n');
				
<<<<<<< HEAD
				var renderedContent = processExtractedContent(allContent, isDecodeScreen);
				if(isDecodeScreen) {
					extractedContent = renderedContent;
=======
				processExtractedContent(allContent, isDecodeScreen);
				if(isDecodeScreen) {
					extractedContent = allContent;
>>>>>>> 0dc18f116fc6797a73c2104eea46f8c1e6e32440
					enableDecodeDownload();
				}
				msgElement.textContent = '提取成功！共处理 ' + totalImages + ' 个图片，提取到 ' + extractedDataList.length + ' 个数据';
				boxElement.focus();
				pwdElement.value = '';
			} else {
				msgElement.textContent = '未能从任何图片中提取到数据';
				pwdElement.value = '';
			}
		}
	}

	// 开始处理第一个图片
	processSingleImage(images[0], 0);
}

// Check for file tail steganography
function checkFileTailStego(imageElement, password, compressed, callback){
	// Fetch the image as blob
	fetch(imageElement.src)
		.then(response => response.blob())
		.then(blob => blob.arrayBuffer())
		.then(arrayBuffer => {
			var uint8Array = new Uint8Array(arrayBuffer);
			
			// 查找二进制格式的标记
			var MAGIC = "PASSLOK_BINARY_TAIL";
			var magicBytes = new TextEncoder().encode(MAGIC);
			
			// 从文件尾开始查找标记
			var startIndex = -1;
			var endIndex = -1;
			
			// 查找开始标记（从前往后）
			for (var i = 0; i <= uint8Array.length - magicBytes.length; i++) {
				var found = true;
				for (var j = 0; j < magicBytes.length; j++) {
					if (uint8Array[i + j] !== magicBytes[j]) {
						found = false;
						break;
					}
				}
				if (found) {
					startIndex = i;
					break;
				}
			}
			
			if (startIndex === -1) {
				// 没有找到二进制格式，尝试旧格式
				var decoder = new TextDecoder();
				var imageData = decoder.decode(arrayBuffer);
				
				// Look for our marker
				var marker = "PASSLOK_STEGO_TAIL";
				var oldStartIndex = imageData.indexOf(marker);
				
				if(oldStartIndex !== -1){
					// Found the marker, extract the data
					var oldEndIndex = imageData.indexOf(marker, oldStartIndex + marker.length);
					if(oldEndIndex !== -1){
						var encodedData = imageData.substring(oldStartIndex + marker.length, oldEndIndex);
						console.log('Found old format data:', encodedData.substring(0, 50) + '...');
						
						// Check if password is required
						var passwordIndex = encodedData.indexOf('|');
						var actualData = encodedData;
						
						if(passwordIndex !== -1){
							// 检查这是否是密码（密码后的字符不应是数字，而分块数据的第一个字符是数字）
							var possiblePassword = encodedData.substring(0, passwordIndex);
							var afterFirstPipe = encodedData.substring(passwordIndex + 1);
							var firstCharAfterPipe = afterFirstPipe.charAt(0);
							
							// 如果密码后的第一个字符是数字，说明这可能是分块数据而不是密码
							var isChunkData = !isNaN(parseInt(firstCharAfterPipe)) && firstCharAfterPipe !== '';
							
							if(!isChunkData || password !== ''){
								// 只有在明确有密码输入，或者确定不是分块数据时才验证密码
								var storedPassword = possiblePassword;
								actualData = afterFirstPipe;
								
								// Verify password (only if password is provided)
								if(password !== '' && storedPassword !== password){
									// Wrong password
									callback('', '密码错误');
									return;
								}
							}
						}
						
						console.log('Actual data:', actualData.substring(0, 50) + '...');
						
						// 检查是否是分块数据（格式：index|total|data）
						var chunkSeparatorIndex = actualData.indexOf('|');
						var secondSeparatorIndex = actualData.indexOf('|', chunkSeparatorIndex + 1);
						
						if(chunkSeparatorIndex !== -1 && secondSeparatorIndex !== -1){
							// 这是分块数据
							var chunkIndex = parseInt(actualData.substring(0, chunkSeparatorIndex));
							var chunkTotal = parseInt(actualData.substring(chunkSeparatorIndex + 1, secondSeparatorIndex));
							var chunkData = actualData.substring(secondSeparatorIndex + 1);
							
							console.log('Chunk data found:', 'index=' + chunkIndex + ', total=' + chunkTotal);
							
							// 存储分块数据
							extractedChunks[chunkIndex] = chunkData;
							expectedChunkCount = chunkTotal;
						
							// 检查是否所有分块都已收集
							var allChunksCollected = true;
							for(var i = 0; i < chunkTotal; i++){
								if(!extractedChunks[i]){
									allChunksCollected = false;
									break;
								}
							}
						
							if(allChunksCollected){
								// 所有分块都收集完了，重组所有分块
								var fullCompressedData = extractedChunks.join('');
								console.log('Recombining chunks, total length:', fullCompressedData.length);
								var decodedData;
								try{
									if(compressed){
										decodedData = decompressLargeData(fullCompressedData);
									}else{
										decodedData = b64DecodeUnicode(fullCompressedData);
									}
									if(decodedData){
										console.log('Successfully decoded data');
										// 重置分块数据
										extractedChunks = [];
										expectedChunkCount = 0;
										callback(decodedData, 'Reveal successful');
										return;
									}
								}catch(e){
									console.error('Error decoding file tail data:', e);
								}
							}else{
								// 还需要更多分块
								var collectedCount = extractedChunks.filter(function(c){ return c !== undefined; }).length;
								callback('', '已收集 ' + collectedCount + '/' + chunkTotal + ' 个分块，请继续加载其他载密体图片');
								return;
							}
						}else{
							// 不是分块数据，直接解码完整数据
							console.log('Not chunk data, decoding directly');
							var decodedData;
							try{
								if(compressed){
									decodedData = decompressLargeData(actualData);
								}else{
									decodedData = b64DecodeUnicode(actualData);
								}
								if(decodedData){
									callback(decodedData, 'Reveal successful');
									return;
								}
							}catch(e){
								console.error('Error decoding file tail data:', e);
							}
						}
					}
				}
				
				// No file tail data found
				callback('', '没有找到文件尾隐写数据');
				return;
			}
			
			console.log('Found binary format at position:', startIndex);
			
			// 查找结束标记（从后往前）
			for (var i = uint8Array.length - magicBytes.length; i >= startIndex + magicBytes.length; i--) {
				var found = true;
				for (var j = 0; j < magicBytes.length; j++) {
					if (uint8Array[i + j] !== magicBytes[j]) {
						found = false;
						break;
					}
				}
				if (found) {
					endIndex = i;
					break;
				}
			}
			
			if (endIndex === -1) {
				callback('', '没有找到结束标记');
				return;
			}
			
			console.log('Found end marker at position:', endIndex);
			
			// 读取元数据长度（4字节，小端序）
			var pos = startIndex + magicBytes.length;
			var metadataLength = uint8Array[pos] | (uint8Array[pos + 1] << 8) | (uint8Array[pos + 2] << 16) | (uint8Array[pos + 3] << 24);
			pos += 4;
			
			console.log('Metadata length:', metadataLength);
			
			// 读取元数据
			var metadataBytes = uint8Array.subarray(pos, pos + metadataLength);
			var metadataJson = new TextDecoder().decode(metadataBytes);
			var metadata = JSON.parse(metadataJson);
			
			console.log('Metadata:', metadata);

			if (metadata.password && metadata.password !== password) {
				callback('', '密码错误');
				return;
			}
			
			pos += metadataLength;
			
			// 读取负载数据
			var payloadData = uint8Array.subarray(pos, endIndex);
			
			console.log('Payload data size:', payloadData.length);
			
			// 根据元数据决定是否解压
			var decompressedData;
			if (metadata.compressed) {
				console.log('数据已压缩，开始解压...');
				decompressedData = decompressBinaryData(payloadData);
				
				if (!decompressedData) {
					callback('', '解压数据失败');
					return;
				}
				
				console.log('解压后数据大小:', decompressedData.length);
			} else {
				console.log('数据未压缩，直接使用原始数据');
				decompressedData = payloadData;
			}
			
			// 根据元数据分离文件
			var files = metadata.files;
			var offset = 0;
<<<<<<< HEAD
			var textHtml = '';
			var mediaHtml = '';
=======
			var resultHtml = '';
>>>>>>> 0dc18f116fc6797a73c2104eea46f8c1e6e32440
			
			for (var i = 0; i < files.length; i++) {
				var file = files[i];
				var fileData = decompressedData.subarray(offset, offset + file.size);
				offset += file.size;
				
				console.log('Extracting file:', file.name, 'size:', file.size);
				
				// 转换为Base64用于显示
				var base64 = '';
				for (var j = 0; j < fileData.length; j++) {
					base64 += String.fromCharCode(fileData[j]);
				}
				base64 = btoa(base64);
				
				// 生成HTML
				if (file.type.startsWith('image/')) {
<<<<<<< HEAD
					mediaHtml += '<div class="image-list-item"><img src="data:' + file.type + ';base64,' + base64 + '" data-filename="' + file.name + '"><span class="image-filename">' + file.name + '</span></div>';
				} else if (file.type === 'text/html') {
					// 文本内容
					var textContent = new TextDecoder().decode(fileData);
					textHtml += '<div class="stego-text-section">' + textContent + '</div>';
				} else {
					mediaHtml += '<div class="file-list-item"><a download="' + file.name + '" href="data:' + file.type + ';base64,' + base64 + '"><span class="file-icon">📄</span> ' + file.name + '</a></div>';
				}
			}
			
			var resultHtml = textHtml + mediaHtml;
=======
					resultHtml += '<div class="image-list-item"><img src="data:' + file.type + ';base64,' + base64 + '" data-filename="' + file.name + '"><span class="image-filename">' + file.name + '</span></div>';
				} else if (file.type === 'text/html') {
					// 文本内容
					var textContent = new TextDecoder().decode(fileData);
					resultHtml += textContent;
				} else {
					resultHtml += '<div class="file-list-item"><a download="' + file.name + '" href="data:' + file.type + ';base64,' + base64 + '"><span class="file-icon">📄</span> ' + file.name + '</a></div>';
				}
			}
			
>>>>>>> 0dc18f116fc6797a73c2104eea46f8c1e6e32440
			callback(resultHtml, 'Reveal successful');
		})
		.catch(error => {
			console.error('Error checking file tail steganography:', error);
			callback('', '检查文件尾隐写时出错');
		});
}

//gets the histogram of an array, in this format: 0, 1, -1, 2, -2, ..., n, -n. Inputs are the array and n, output is the histogram. For testing purposes.
function getHistogram(array, n){
	var output = new Array(2*n + 2),
		length = array.length,
		counter1 = 0,
		counter2 = 0;
	
	for(var i = 0; i <= n; i++){
		counter1 = counter2 = 0;
		for(var j = 0; j < length; j++){
			if(array[j] == i) counter1++;
			if(array[j] == -i) counter2++
		}
		output[2*i] = counter1;
		output[2*i+1] = counter2
	}
	return output.slice(1)
}

//this is for showing and hiding text in the Password box
function showPwd(){
	if(showPwdMode.checked){
		imagePwd.type = "text"
	}else{
		imagePwd.type = "password"
	}
}



//for rich text editing
function formatDoc(sCmd, sValue){
	  document.execCommand(sCmd, false, sValue); mainBox.focus()
}

//this one escapes dangerous characters, preserving non-breaking spaces
function escapeHTML(str){
	escapeHTML.replacements = { "&": "&amp;", '"': "&quot;", "'": "&#039;", "<": "&lt;", ">": "&gt;" };
	str = str.replace(/&nbsp;/gi,'non-breaking-space')
	str = str.replace(/[&"'<>]/g, function (m){
		return escapeHTML.replacements[m];
	});
	return str.replace(/non-breaking-space/g,'&nbsp;')
}

//remove XSS vectors using DOMPurify
function decryptSanitizer(string){
	return DOMPurify.sanitize(string, {ADD_DATA_URI_TAGS: ['a', 'img']})
}

//The rest is modified from WiseHash. https://github.com/fruiz500/whisehash
//function to test key strength and come up with appropriate key stretching. Based on WiseHash
function keyStrength(pwd,display) {
	var entropy = entropycalc(pwd);
	
  if(display){
	if(entropy == 0){
		var msg = '这是一个已知的坏密钥!';
		var colorName = 'magenta'
	}else if(entropy < 20){
		var msg = '非常差!';
		var colorName = 'magenta'
	}else if(entropy < 40){
		var msg = '弱!';
		var colorName = 'red'
	}else if(entropy < 60){
		var msg = '中等';
		var colorName = 'orange'
	}else if(entropy < 90){
		var msg = '良好!';
		var colorName = 'green'
	}else if(entropy < 120){
		var msg = '优秀!';
		var colorName = 'blue'
	}else{
		var msg = '过度安全!';
		var colorName = 'cyan'
	}
  }

	var iter = Math.max(1,Math.min(20,Math.ceil(24 - entropy/5)));			//set the scrypt iteration exponent based on entropy: 1 for entropy >= 120, 20(max) for entropy <= 20
		
	msg = '密码熵: ' + Math.round(entropy*100)/100 + ' 位. ' + msg;
	
	if(display){
		document.getElementById('imageMsg').innerHTML = "<span id='pwdMsg'>" + msg + "</span>";
		document.getElementById('pwdMsg').style.color = colorName;
	}
	return iter
};

//takes a string and calculates its entropy in bits, taking into account the kinds of characters used and parts that may be in the general wordlist (reduced credit) or the blacklist (no credit)
function entropycalc(pwd){

//find the raw Keyspace
	var numberRegex = new RegExp("^(?=.*[0-9]).*$", "g");
	var smallRegex = new RegExp("^(?=.*[a-z]).*$", "g");
	var capRegex = new RegExp("^(?=.*[A-Z]).*$", "g");
	var base64Regex = new RegExp("^(?=.*[/+]).*$", "g");
	var otherRegex = new RegExp("^(?=.*[^a-zA-Z0-9/+]).*$", "g");

	pwd = pwd.replace(/\s/g,'');										//no credit for spaces

	var Ncount = 0;
	if(numberRegex.test(pwd)){
		Ncount = Ncount + 10;
	}
	if(smallRegex.test(pwd)){
		Ncount = Ncount + 26;
	}
	if(capRegex.test(pwd)){
		Ncount = Ncount + 26;
	}
	if(base64Regex.test(pwd)){
		Ncount = Ncount + 2;
	}
	if(otherRegex.test(pwd)){
		Ncount = Ncount + 31;											//assume only printable characters
	}

//start by finding words that might be on the blacklist (no credit)
	var pwd = reduceVariants(pwd);
	var wordsFound = pwd.match(blackListExp);							//array containing words found on the blacklist
	if(wordsFound){
		for(var i = 0; i < wordsFound.length;i++){
			pwd = pwd.replace(wordsFound[i],'');						//remove them from the string
		}
	}

//now look for regular words on the wordlist
	wordsFound = pwd.match(wordListExp);									//array containing words found on the regular wordlist
	if(wordsFound){
		wordsFound = wordsFound.filter(function(elem, pos, self) {return self.indexOf(elem) == pos;});	//remove duplicates from the list
		var foundLength = wordsFound.length;							//to give credit for words found we need to count how many
		for(var i = 0; i < wordsFound.length;i++){
			pwd = pwd.replace(new RegExp(wordsFound[i], "g"),'');									//remove all instances
		}
	}else{
		var foundLength = 0;
	}

	pwd = pwd.replace(/(.+?)\1+/g,'$1');								//no credit for repeated consecutive character groups

	if(pwd != ''){
		return (pwd.length*Math.log(Ncount) + foundLength*Math.log(wordLength + blackLength))/Math.LN2
	}else{
		return (foundLength*Math.log(wordLength + blackLength))/Math.LN2
	}
}

//take into account common substitutions, ignore spaces and case
function reduceVariants(string){
	return string.toLowerCase().replace(/[óòöôõo]/g,'0').replace(/[!íìïîi]/g,'1').replace(/[z]/g,'2').replace(/[éèëêe]/g,'3').replace(/[@áàäâãa]/g,'4').replace(/[$s]/g,'5').replace(/[t]/g,'7').replace(/[b]/g,'8').replace(/[g]/g,'9').replace(/[úùüû]/g,'u');
}

//this is for showing and hiding text in password input box
// function showPwd(){
// 	if(imagePwd.type == "password"){
// 		imagePwd.type = "text";
// 		showKey.src = hideImg	
// 	}else{
// 		imagePwd.type = "password";
// 		showKey.src = eyeImg
// 	}
// 	keyStrength(imagePwd.value.trim(),true)
// }

//for showing/hiding password fields
const eyeImg = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABgAAAAYCAMAAADXqc3KAAAASFBMVEUAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACrhKybAAAAF3RSTlMA5Qyz9kEFh3rd1sjDoGsfHRKwQIp+Qzv02bEAAACJSURBVCjPvVBJEoQgDMwCAfeFmfH/P51KkFKL0qN9SXdDVngRy8joHPK4XGyJbtvhohz+3G0ndHPxp0b1mojSqqyZsk+tqphFVN6S8cH+g3wQgwCrGtT3VjhB0BB26QGgN0aAGhDIZP/wUHLrUrk5g4RT83rcbxn3WJA90Y/zgs8nqY94d/b38AeFUhCT+3yIqgAAAABJRU5ErkJggg==",
	hideImg = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABgAAAAYCAMAAADXqc3KAAAAb1BMVEUAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABt6r1GAAAAJHRSTlMAFNTiDPTNBvnaulFBAe/osrGBZCXSwIdnLhzIqKd7XFRLSjAYduwyAAAAuklEQVQoz62QRxbDIAwFhWkhwb07PeH+Z4wQPMjCS89KegP6AjiWSbF9oVzBQNyNlKZZ/s+wwpvLyXlkp7P5umiIcYDIwB0ZLWzrTb3GSQYbMsjDl3wj0fj6TDmpK7F60nnLeDCW2h6rgioBVZgmwlwUJoo6bkC7KRQ9iQ/MzuWtXyjKKcTpmVc8mht4Nu5NV+Y/UAKItaY7byHsOeSkp48uQSahO+kiISfD+ha/nbcLwxwFuzB1hUP5AR4JF1hy2DV7AAAAAElFTkSuQmCC";

// 打开下载弹窗
function openDownloadModal() {
	if (!extractedContent && extractedFiles.length === 0) {
		imageMsgDecode.textContent = '没有可下载的内容';
		return;
	}
	
	// 更新文件列表
	var fileListSection = document.getElementById('fileListSection');
	var extractedFileList = document.getElementById('extractedFileList');
	var downloadAllFilesBtn = document.getElementById('downloadAllFilesBtn');
	
	if (extractedFiles.length > 0) {
		// 有提取到的文件
		fileListSection.style.display = 'block';
		downloadAllFilesBtn.style.display = 'inline-block';
		
		extractedFileList.innerHTML = '';
		extractedFiles.forEach(function(file, index) {
			var fileItem = document.createElement('div');
			fileItem.style.cssText = 'padding: 8px; margin: 5px 0; border: 1px solid rgba(76, 175, 80, 0.25); border-radius: 5px; background: #1a1f26; display: flex; justify-content: space-between; align-items: center; cursor: pointer; transition: background 0.2s ease;';
			fileItem.title = '点击下载';
			
			var fileNameSpan = document.createElement('span');
			fileNameSpan.textContent = file.name;
			fileNameSpan.style.cssText = 'flex-grow: 1; color: #e4e6eb;';
			
			fileItem.appendChild(fileNameSpan);
			
			fileItem.onclick = function() {
				downloadSingleFile(file);
			};
			
			fileItem.onmouseenter = function() {
				fileItem.style.background = '#25303d';
			};
			
			fileItem.onmouseleave = function() {
				fileItem.style.background = '#1a1f26';
			};
			
			extractedFileList.appendChild(fileItem);
		});
	} else {
		// 没有提取到的文件
		fileListSection.style.display = 'none';
		downloadAllFilesBtn.style.display = 'none';
	}
	
	downloadModal.style.display = 'flex';
}

// 关闭下载弹窗
function closeDownloadModal() {
	downloadModal.style.display = 'none';
}

// 下载单个文件
function downloadSingleFile(fileInfo) {
	var link = document.createElement('a');
	link.href = fileInfo.data;
	link.download = fileInfo.name;
	document.body.appendChild(link);
	link.click();
	document.body.removeChild(link);
}

// 下载所有文件
function downloadAllFiles() {
	if (extractedFiles.length === 0) {
		return;
	}
	
	extractedFiles.forEach(function(file) {
		downloadSingleFile(file);
	});
	
	closeDownloadModal();
}

// 打包下载 - 将所有内容打包为ZIP文件
function packageDownload() {
	if (!extractedContent && extractedFiles.length === 0) {
		closeDownloadModal();
		return;
	}
	
	// 创建新的 ZIP 实例
	var zip = new JSZip();
	
	// 处理文本内容
	if (extractedContent) {
		var tempDiv = document.createElement('div');
		tempDiv.innerHTML = extractedContent;
		
		// 先提取文件，然后处理文本
		var fileItems = tempDiv.querySelectorAll('.file-list-item, .image-list-item, .stego-image-section');
		fileItems.forEach(function(item) {
			item.remove();
		});
		
		// 获取纯文本内容
		var textContent = tempDiv.textContent || tempDiv.innerText || '';
		textContent = textContent.replace(/\n\s*\n\s*\n/g, '\n\n').trim();
		
		// 如果有文本内容，添加到 ZIP
		if (textContent.length > 0) {
			zip.file('extracted_text.txt', textContent);
		}
	}
	
	// 处理提取的文件
	extractedFiles.forEach(function(file) {
		// 将 data URL 转换为 Blob
		var dataUrl = file.data;
		var base64Index = dataUrl.indexOf('base64,');
		
		if (base64Index !== -1) {
			var base64Data = dataUrl.substring(base64Index + 7);
			var byteCharacters = atob(base64Data);
			var byteNumbers = new Array(byteCharacters.length);
			
			for (var i = 0; i < byteCharacters.length; i++) {
				byteNumbers[i] = byteCharacters.charCodeAt(i);
			}
			
			var byteArray = new Uint8Array(byteNumbers);
			zip.file(file.name, byteArray);
		}
	});
	
	// 生成 ZIP 文件并下载
	zip.generateAsync({type: 'blob'})
		.then(function(content) {
			var url = URL.createObjectURL(content);
			var link = document.createElement('a');
			link.href = url;
			link.download = 'extracted_content.zip';
			document.body.appendChild(link);
			link.click();
			document.body.removeChild(link);
			URL.revokeObjectURL(url);
			
			closeDownloadModal();
		})
		.catch(function(error) {
			console.error('Error creating ZIP:', error);
			imageMsgDecode.textContent = '创建ZIP文件失败';
		});
}

// 载体库模式折叠栏交互逻辑
document.addEventListener('DOMContentLoaded', function() {
  var carrierLibraryPanel = document.getElementById('carrierLibraryPanel');
  var carrierLibraryToggle = document.getElementById('carrierLibraryToggle');
  var carrierLibraryModeCheckbox = document.getElementById('carrierLibraryMode');
  
  const CARRIER_LIBRARY_MODE_KEY = 'carrierLibraryModeEnabled';
  
  // 从localStorage加载载体库模式状态
  function loadCarrierLibraryModeState() {
    try {
      const stored = localStorage.getItem(CARRIER_LIBRARY_MODE_KEY);
      if (stored !== null) {
        return stored === 'true';
      }
    } catch (e) {
      console.error('加载载体库模式状态失败:', e);
    }
    return false;
  }
  
  // 保存载体库模式状态到localStorage
  function saveCarrierLibraryModeState(enabled) {
    try {
      localStorage.setItem(CARRIER_LIBRARY_MODE_KEY, enabled.toString());
    } catch (e) {
      console.error('保存载体库模式状态失败:', e);
    }
  }
  
  // 存储载体库模式状态
  var carrierLibraryModeEnabled = loadCarrierLibraryModeState();
  
  // 初始化复选框状态
  if (carrierLibraryModeCheckbox) {
    carrierLibraryModeCheckbox.checked = carrierLibraryModeEnabled;
  }
  
  // 切换折叠栏
  carrierLibraryToggle.addEventListener('click', function() {
    if (carrierLibraryPanel.classList.contains('panel-collapsed')) {
      carrierLibraryPanel.classList.remove('panel-collapsed');
      carrierLibraryPanel.classList.add('panel-expanded');
    } else {
      carrierLibraryPanel.classList.remove('panel-expanded');
      carrierLibraryPanel.classList.add('panel-collapsed');
    }
  });
  
  // 切换载体库模式
  carrierLibraryModeCheckbox.addEventListener('change', function() {
    carrierLibraryModeEnabled = this.checked;
    saveCarrierLibraryModeState(carrierLibraryModeEnabled);
    
    if (carrierLibraryModeEnabled) {
      console.log('载体库模式已启用');
      // 切换按钮为载体库模式
      if (window.toggleCoverImageButton) {
        window.toggleCoverImageButton(true);
      }
    } else {
      console.log('载体库模式已禁用');
      // 切换按钮为普通模式
      if (window.toggleCoverImageButton) {
        window.toggleCoverImageButton(false);
      }
    }
  });
  
  // 获取载体库模式状态的函数
  function isCarrierLibraryModeEnabled() {
    return carrierLibraryModeEnabled;
  }
  
  // 将函数暴露到全局作用域，方便其他地方调用
  window.isCarrierLibraryModeEnabled = isCarrierLibraryModeEnabled;
  
  // 载体库功能
  var carrierLibraryData = [];
  const DB_NAME = 'CarrierLibraryDB';
  const DB_VERSION = 1;
  const STORE_NAME = 'carriers';
  var db = null;
  
  // 初始化IndexedDB
  function initIndexedDB() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      
      request.onerror = () => {
        console.error('打开数据库失败:', request.error);
        reject(request.error);
      };
      
      request.onsuccess = () => {
        db = request.result;
        resolve(db);
      };
      
      request.onupgradeneeded = (event) => {
        const database = event.target.result;
        if (!database.objectStoreNames.contains(STORE_NAME)) {
          const store = database.createObjectStore(STORE_NAME, { keyPath: 'id' });
          store.createIndex('name', 'name', { unique: false });
        }
      };
    });
  }
  
  // 显示加载动画
  function showCarrierLibraryLoading() {
    const loadingEl = document.getElementById('carrierLibraryLoading');
    const listEl = document.getElementById('carrierLibraryList');
    const progressEl = document.getElementById('carrierLibraryProgress');
    if (loadingEl) {
      loadingEl.style.display = 'flex';
    }
    if (listEl) {
      listEl.style.opacity = '0.3';
      listEl.style.pointerEvents = 'none';
    }
    if (progressEl) {
      progressEl.textContent = '0 / 0';
    }
  }
  
  // 更新加载进度
  function updateCarrierLibraryProgress(current, total) {
    const progressEl = document.getElementById('carrierLibraryProgress');
    if (progressEl) {
      progressEl.textContent = current + ' / ' + total;
    }
  }
  
  // 隐藏加载动画
  function hideCarrierLibraryLoading() {
    const loadingEl = document.getElementById('carrierLibraryLoading');
    const listEl = document.getElementById('carrierLibraryList');
    if (loadingEl) {
      loadingEl.style.display = 'none';
    }
    if (listEl) {
      listEl.style.opacity = '1';
      listEl.style.pointerEvents = 'auto';
    }
  }
  
  // 从IndexedDB加载载体库数据
  function loadCarrierLibrary() {
    if (!db) {
      initIndexedDB().then(() => {
        loadCarrierLibraryFromDB();
      }).catch((e) => {
        console.error('初始化数据库失败:', e);
        renderCarrierLibrary();
      });
    } else {
      loadCarrierLibraryFromDB();
    }
  }
  
  // 从数据库加载数据
  function loadCarrierLibraryFromDB() {
    const transaction = db.transaction([STORE_NAME], 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.getAll();
    
    request.onsuccess = () => {
      carrierLibraryData = request.result || [];
      renderCarrierLibrary();
    };
    
    request.onerror = () => {
      console.error('加载载体库失败:', request.error);
      carrierLibraryData = [];
      renderCarrierLibrary();
    };
  }
  
  // 保存载体库数据到IndexedDB
  function saveCarrierLibrary() {
    if (!db) return;
    
    const transaction = db.transaction([STORE_NAME], 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    
    // 清空现有数据
    const clearRequest = store.clear();
    
    clearRequest.onsuccess = () => {
      // 添加所有数据
      carrierLibraryData.forEach(item => {
        store.put(item);
      });
    };
    
    clearRequest.onerror = () => {
      console.error('清空载体库失败:', clearRequest.error);
    };
  }
  
  // 渲染载体库列表
  function renderCarrierLibrary() {
    const listEl = document.getElementById('carrierLibraryList');
    if (!listEl) return;
    
    listEl.innerHTML = '';
    
    // 按大小从大到小排序
    const sortedData = [...carrierLibraryData].sort((a, b) => b.size - a.size);
    
    sortedData.forEach((item, displayIndex) => {
      // 找到原始索引
      const originalIndex = carrierLibraryData.findIndex(data => data.id === item.id);
      
      const itemEl = document.createElement('div');
      itemEl.className = 'carrier-library-item';
      itemEl.innerHTML = `
        <div class="image-placeholder">🖼️</div>
        <div class="carrier-library-item-info">
          <div class="carrier-library-item-name">${item.name}</div>
          <div class="carrier-library-item-size">${formatFileSize(item.size)}</div>
        </div>
        <button class="cssbutton carrier-library-item-remove" data-index="${originalIndex}">删除</button>
      `;
      
      // 单击查看大图
      itemEl.addEventListener('click', function(e) {
        if (e.target.closest('.carrier-library-item-remove')) return;
        e.stopPropagation();
        showFullscreenPreview(item);
      });
      
      // 提示信息：单击查看大图，双击选择作为封面
      itemEl.title = '单击查看大图，双击选择作为封面';
      
      // 双击选择图片作为封面
      itemEl.addEventListener('dblclick', function(e) {
        if (e.target.closest('.carrier-library-item-remove')) return;
        e.stopPropagation();
        selectCarrierAsCover(item);
      });
      
      listEl.appendChild(itemEl);
    });
    
    // 绑定删除按钮事件
    listEl.querySelectorAll('.carrier-library-item-remove').forEach(btn => {
      btn.addEventListener('click', function(e) {
        e.stopPropagation();
        const index = parseInt(this.getAttribute('data-index'));
        removeCarrierFromLibrary(index);
      });
    });
  }
  
  // 选择载体库中的图片作为封面
  function selectCarrierAsCover(item) {
    // 创建一个临时的file对象
    const byteString = atob(item.dataUrl.split(',')[1]);
    const mimeString = item.dataUrl.split(',')[0].split(':')[1].split(';')[0];
    const ab = new ArrayBuffer(byteString.length);
    const ia = new Uint8Array(ab);
    for (let i = 0; i < byteString.length; i++) {
      ia[i] = byteString.charCodeAt(i);
    }
    const blob = new Blob([ab], { type: mimeString });
    const file = new File([blob], item.name, { type: mimeString });
    
    // 模拟importImage函数的行为
    originalCoverFile = file;
    originalCoverDataURL = item.dataUrl;
    document.getElementById('previewContainer').style.display = 'block';
    document.getElementById('preview').src = item.dataUrl;
    document.getElementById('previewFilename').textContent = item.name;
    
    const previewElement = document.getElementById('preview');
    if (previewElement) {
      previewElement.onload = function() {
        updateCapacity();
        updateImageDetails(previewElement, file, 'imageDetails');
      };
    }
    
    // 关闭载体库弹窗
    closeCarrierLibraryModal();
  }
  
  // 添加图片到载体库
  function addCarrierToLibrary(file, dataUrl) {
    const item = {
      id: Date.now() + Math.random(),
      name: file.name,
      size: file.size,
      type: file.type,
      dataUrl: dataUrl
    };
    
    if (!db) {
      // 如果数据库还没初始化，先添加到内存
      carrierLibraryData.push(item);
      renderCarrierLibrary();
      return;
    }
    
    const transaction = db.transaction([STORE_NAME], 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.add(item);
    
    request.onsuccess = () => {
      carrierLibraryData.push(item);
      renderCarrierLibrary();
    };
    
    request.onerror = () => {
      console.error('添加载体失败:', request.error);
    };
  }
  
  // 从载体库删除图片
  function removeCarrierFromLibrary(index) {
    const item = carrierLibraryData[index];
    if (!item) return;
    
    if (!db) {
      carrierLibraryData.splice(index, 1);
      renderCarrierLibrary();
      return;
    }
    
    const transaction = db.transaction([STORE_NAME], 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.delete(item.id);
    
    request.onsuccess = () => {
      carrierLibraryData.splice(index, 1);
      renderCarrierLibrary();
    };
    
    request.onerror = () => {
      console.error('删除载体失败:', request.error);
    };
  }
  
  // 清空载体库
  function clearCarrierLibrary() {
    if (carrierLibraryData.length === 0) return;
    if (!confirm('确定要清空载体库吗？')) return;
    
    if (!db) {
      carrierLibraryData = [];
      renderCarrierLibrary();
      return;
    }
    
    const transaction = db.transaction([STORE_NAME], 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.clear();
    
    request.onsuccess = () => {
      carrierLibraryData = [];
      renderCarrierLibrary();
    };
    
    request.onerror = () => {
      console.error('清空载体库失败:', request.error);
    };
  }
  
  // 处理导入的文件 - 优化版，更快导入
  function handleCarrierLibraryFiles(files) {
    if (!files || files.length === 0) return;
    
    showCarrierLibraryLoading();
    
    const fileArray = Array.from(files);
    let totalItems = 0;
    let processedItems = 0;
    let zipProcessed = 0;
    let zipTotal = 0;
    
    // 第一遍：计算总项目数
    const promises = [];
    fileArray.forEach(file => {
      if (file.type.startsWith('image/')) {
        totalItems++;
      } else if (file.name.toLowerCase().endsWith('.zip')) {
        zipTotal++;
        // 异步计算ZIP中的图片数量
        const promise = new Promise((resolve) => {
          const reader = new FileReader();
          reader.onload = function(e) {
            try {
              JSZip.loadAsync(e.target.result).then(function(zip) {
                let zipImageCount = 0;
                zip.forEach(function(relativePath, zipEntry) {
                  if (!zipEntry.dir && /\.(jpg|jpeg|png|gif|bmp|webp)$/i.test(relativePath)) {
                    zipImageCount++;
                  }
                });
                totalItems += zipImageCount;
                resolve();
              }).catch(function() {
                resolve();
              });
            } catch (err) {
              resolve();
            }
          };
          reader.onerror = function() {
            resolve();
          };
          reader.readAsArrayBuffer(file);
        });
        promises.push(promise);
      }
    });
    
    // 等待总数量计算完成后开始处理
    Promise.all(promises).then(() => {
      updateCarrierLibraryProgress(0, totalItems);
      
      const batchSize = 10;
      let fileIndex = 0;
      
      function processNextFile() {
        if (fileIndex >= fileArray.length) {
          return;
        }
        
        const file = fileArray[fileIndex];
        
        if (file.type.startsWith('image/')) {
          // 处理图片文件
          const reader = new FileReader();
          reader.onload = function(e) {
            addCarrierToLibrary(file, e.target.result);
            processedItems++;
            updateCarrierLibraryProgress(processedItems, totalItems);
            checkComplete();
            fileIndex++;
            setTimeout(processNextFile, 0);
          };
          reader.onerror = function() {
            processedItems++;
            updateCarrierLibraryProgress(processedItems, totalItems);
            checkComplete();
            fileIndex++;
            setTimeout(processNextFile, 0);
          };
          reader.readAsDataURL(file);
        } else if (file.name.toLowerCase().endsWith('.zip')) {
          // 处理ZIP压缩包
          handleZipFile(file, function(addedCount) {
            processedItems += addedCount || 0;
            updateCarrierLibraryProgress(processedItems, totalItems);
            zipProcessed++;
            fileIndex++;
            checkComplete();
            setTimeout(processNextFile, 0);
          });
        } else {
          console.log('不支持的文件类型:', file.name);
          processedItems++;
          updateCarrierLibraryProgress(processedItems, totalItems);
          fileIndex++;
          checkComplete();
          setTimeout(processNextFile, 0);
        }
      }
      
      function checkComplete() {
        if (processedItems >= totalItems) {
          setTimeout(hideCarrierLibraryLoading, 300);
        }
      }
      
      // 开始处理
      processNextFile();
    });
  }
  
  // 处理ZIP文件
  function handleZipFile(file, callback) {
    const reader = new FileReader();
    reader.onload = function(e) {
      try {
        JSZip.loadAsync(e.target.result).then(function(zip) {
          // 遍历ZIP中的文件
          const imagePromises = [];
          zip.forEach(function(relativePath, zipEntry) {
            if (!zipEntry.dir && /\.(jpg|jpeg|png|gif|bmp|webp)$/i.test(relativePath)) {
              imagePromises.push(
                zipEntry.async('base64').then(function(data) {
                  const mimeType = getMimeType(relativePath);
                  return {
                    name: relativePath.split('/').pop(),
                    dataUrl: 'data:' + mimeType + ';base64,' + data
                  };
                })
              );
            }
          });
          
          Promise.all(imagePromises).then(function(images) {
            let addedCount = 0;
            images.forEach(function(img) {
              try {
                const byteString = atob(img.dataUrl.split(',')[1]);
                const ab = new ArrayBuffer(byteString.length);
                const ia = new Uint8Array(ab);
                for (let i = 0; i < byteString.length; i++) {
                  ia[i] = byteString.charCodeAt(i);
                }
                const blob = new Blob([ab], { type: getMimeType(img.name) });
                const fileObj = new File([blob], img.name, { type: getMimeType(img.name) });
                addCarrierToLibrary(fileObj, img.dataUrl);
                addedCount++;
              } catch (err) {
                console.error('处理ZIP中的图片失败:', img.name, err);
              }
            });
            if (callback) callback(addedCount);
          }).catch(function(err) {
            console.error('解析ZIP文件失败:', err);
            alert('解析ZIP文件失败');
            if (callback) callback(0);
          });
        }).catch(function(err) {
          console.error('解析ZIP文件失败:', err);
          alert('解析ZIP文件失败');
          if (callback) callback(0);
        });
      } catch (err) {
        console.error('处理ZIP文件失败:', err);
        alert('处理ZIP文件失败');
        if (callback) callback(0);
      }
    };
    reader.onerror = function() {
      if (callback) callback(0);
    };
    reader.readAsArrayBuffer(file);
  }
  
  // 获取文件MIME类型
  function getMimeType(filename) {
    const ext = filename.toLowerCase().split('.').pop();
    const mimeTypes = {
      'jpg': 'image/jpeg',
      'jpeg': 'image/jpeg',
      'png': 'image/png',
      'gif': 'image/gif',
      'bmp': 'image/bmp',
      'webp': 'image/webp'
    };
    return mimeTypes[ext] || 'image/png';
  }
  
  // 打开载体库弹窗
  function openCarrierLibraryModal() {
    const modal = document.getElementById('carrierLibraryModal');
    if (modal) {
      modal.style.display = 'flex';
    }
  }
  
  // 关闭载体库弹窗
  function closeCarrierLibraryModal() {
    const modal = document.getElementById('carrierLibraryModal');
    if (modal) {
      modal.style.display = 'none';
    }
  }
  
  // 显示全屏预览
  function showFullscreenPreview(item) {
    const modal = document.getElementById('fullscreenPreviewModal');
    const img = document.getElementById('fullscreenPreviewImage');
    const nameEl = document.getElementById('fullscreenPreviewName');
    const sizeEl = document.getElementById('fullscreenPreviewSize');
    const closeBtn = document.getElementById('fullscreenPreviewClose');
    
    if (!modal || !img || !nameEl || !sizeEl || !closeBtn) return;
    
    // 设置图片和信息
    img.src = item.fullDataUrl || item.dataUrl;
    nameEl.textContent = item.name;
    sizeEl.textContent = formatFileSize(item.size);
    
    // 显示弹窗
    modal.style.display = 'flex';
    
    // 绑定关闭事件
    closeBtn.onclick = closeFullscreenPreview;
    
    // 点击背景关闭
    modal.onclick = function(e) {
      if (e.target === modal) {
        closeFullscreenPreview();
      }
    };
    
    // 按ESC关闭
    document.addEventListener('keydown', handleEscKey);
  }
  
  // 关闭全屏预览
  function closeFullscreenPreview() {
    const modal = document.getElementById('fullscreenPreviewModal');
    if (modal) {
      modal.style.display = 'none';
    }
    document.removeEventListener('keydown', handleEscKey);
  }
  
  // ESC键处理
  function handleEscKey(e) {
    if (e.key === 'Escape') {
      closeFullscreenPreview();
    }
  }
  
  // 链接标签功能
  function openLinkTagModal() {
    const modal = document.getElementById('linkTagModal');
    const input = document.getElementById('linkTagInput');
    if (modal) {
      modal.style.display = 'flex';
    }
    if (input) {
      input.value = '';
      input.focus();
    }
  }
  
  function closeLinkTagModal() {
    const modal = document.getElementById('linkTagModal');
    if (modal) {
      modal.style.display = 'none';
    }
  }
  
  function insertLinkTag() {
    const input = document.getElementById('linkTagInput');
    const mainBox = document.getElementById('mainBox');
    
    if (!input || !mainBox) return;
    
    const content = input.value.trim();
    if (!content) {
      input.classList.add('input-error');
      input.focus();
      setTimeout(function() {
        input.classList.remove('input-error');
      }, 2000);
      return;
    }
    
    // 创建链接标签元素
    const tagSpan = document.createElement('span');
    tagSpan.className = 'link-tag';
    tagSpan.textContent = '[' + content + ']';
    tagSpan.contentEditable = 'false';
    tagSpan.setAttribute('data-link-tag', 'true');
    
    // 插入到光标位置或末尾
    const selection = window.getSelection();
    if (selection.rangeCount > 0 && mainBox.contains(selection.anchorNode)) {
      const range = selection.getRangeAt(0);
      range.deleteContents();
      range.insertNode(tagSpan);
      
      // 移动光标到标签后面
      range.setStartAfter(tagSpan);
      range.setEndAfter(tagSpan);
      selection.removeAllRanges();
      selection.addRange(range);
    } else {
      mainBox.appendChild(tagSpan);
    }
    
    closeLinkTagModal();
  }
  
  // 绑定链接标签按钮事件
  const insertLinkTagBtn = document.getElementById('insertLinkTagBtn');
  const linkTagCancelBtn = document.getElementById('linkTagCancelBtn');
  const linkTagConfirmBtn = document.getElementById('linkTagConfirmBtn');
  const linkTagModalClose = document.getElementById('linkTagModalClose');
  const linkTagInput = document.getElementById('linkTagInput');
  const linkTagModal = document.getElementById('linkTagModal');
  
  if (insertLinkTagBtn) {
    insertLinkTagBtn.addEventListener('click', openLinkTagModal);
  }
  
  if (linkTagCancelBtn) {
    linkTagCancelBtn.addEventListener('click', closeLinkTagModal);
  }
  
  if (linkTagConfirmBtn) {
    linkTagConfirmBtn.addEventListener('click', insertLinkTag);
  }
  
  if (linkTagModalClose) {
    linkTagModalClose.addEventListener('click', closeLinkTagModal);
  }
  
  if (linkTagModal) {
    linkTagModal.addEventListener('click', function(e) {
      if (e.target === linkTagModal) {
        closeLinkTagModal();
      }
    });
  }
  
  if (linkTagInput) {
    linkTagInput.addEventListener('keydown', function(e) {
      if (e.key === 'Enter') {
        e.preventDefault();
        insertLinkTag();
      } else if (e.key === 'Escape') {
        closeLinkTagModal();
      }
    });
  }
  
  // 防止链接标签被部分删除 - 监听键盘事件
  const mainBox = document.getElementById('mainBox');
  if (mainBox) {
    mainBox.addEventListener('keydown', function(e) {
      const selection = window.getSelection();
      if (selection.rangeCount === 0) return;
      
      const range = selection.getRangeAt(0);
      let currentNode = range.startContainer;
      
      // 检查是否在链接标签内或附近
      let inLinkTag = false;
      let checkNode = currentNode;
      
      while (checkNode && checkNode !== mainBox) {
        if (checkNode.nodeType === 1 && checkNode.classList && checkNode.classList.contains('link-tag')) {
          inLinkTag = true;
          break;
        }
        checkNode = checkNode.parentNode;
      }
      
      // 如果在链接标签内，阻止部分删除
      if (inLinkTag) {
        if (e.key === 'Backspace' || e.key === 'Delete') {
          e.preventDefault();
          // 整个标签选中时才删除
          if (checkNode && checkNode.classList && checkNode.classList.contains('link-tag')) {
            checkNode.remove();
          }
        }
      }
    });
    
    // 阻止链接标签被编辑
    mainBox.addEventListener('input', function(e) {
      const linkTags = mainBox.querySelectorAll('.link-tag');
      linkTags.forEach(function(tag) {
        tag.contentEditable = 'false';
      });
      updateMainBoxCapacityInfo();
    });
  }
  
  // 数字步进器功能
  const HIDDEN_FILE_SIZE_KEY = 'hiddenFileSize';
  const HIDDEN_FILE_RATIO_KEY = 'hiddenFileRatio';
  const WEBP_CONVERTER_ENABLED_KEY = 'webpConverterEnabled';
  const WEBP_QUALITY_REDUCTION_KEY = 'webpQualityReduction';
  
  let currentStepperType = null; // 'size'、'ratio' 或 'webpQuality'
  let originalValue = 0;
  
  // 加载保存的数值
  function loadStepperValues() {
    try {
      const savedSize = localStorage.getItem(HIDDEN_FILE_SIZE_KEY);
      const savedRatio = localStorage.getItem(HIDDEN_FILE_RATIO_KEY);
      const savedWebpEnabled = localStorage.getItem(WEBP_CONVERTER_ENABLED_KEY);
      const savedWebpQuality = localStorage.getItem(WEBP_QUALITY_REDUCTION_KEY);
      const webpToggle = document.getElementById('webpConverterToggle');
      
      if (savedSize !== null) {
        updateHiddenFileSize(parseFloat(savedSize));
      } else {
        updateHiddenFileSize(4.00);
      }
      
      if (savedRatio !== null) {
        updateHiddenFileRatio(parseInt(savedRatio));
      } else {
        updateHiddenFileRatio(10);
      }

      if (webpToggle) {
        webpToggle.checked = savedWebpEnabled === 'true';
      }

      if (savedWebpQuality !== null) {
        updateWebPQualityReduction(parseInt(savedWebpQuality, 10));
      } else {
        updateWebPQualityReduction(20);
      }
    } catch (e) {
      console.error('加载数值失败:', e);
      updateHiddenFileSize(4.00);
      updateHiddenFileRatio(10);
      updateWebPQualityReduction(20);
    }
  }
  
  // 保存数值到localStorage
  function saveStepperValue(type, value) {
    try {
      if (type === 'size') {
        localStorage.setItem(HIDDEN_FILE_SIZE_KEY, value.toString());
      } else if (type === 'ratio') {
        localStorage.setItem(HIDDEN_FILE_RATIO_KEY, value.toString());
      } else if (type === 'webpQuality') {
        localStorage.setItem(WEBP_QUALITY_REDUCTION_KEY, value.toString());
      }
    } catch (e) {
      console.error('保存数值失败:', e);
    }
  }

  function saveWebPConverterState(enabled) {
    try {
      localStorage.setItem(WEBP_CONVERTER_ENABLED_KEY, enabled.toString());
    } catch (e) {
      console.error('保存WebP开关状态失败:', e);
    }
  }
  
  // 更新隐藏文件大小显示
  function updateHiddenFileSize(value) {
    const sizeValue = document.getElementById('hiddenFileSizeValue');
    if (sizeValue) {
      sizeValue.textContent = value.toFixed(2);
    }
  }
  
  // 更新隐藏文件比例显示
  function updateHiddenFileRatio(value) {
    const ratioValue = document.getElementById('hiddenFileRatioValue');
    if (ratioValue) {
      ratioValue.textContent = value;
    }
  }

  function updateWebPQualityReduction(value) {
    const webpQualityValue = document.getElementById('webpQualityReduction');
    if (!webpQualityValue) return;

    value = parseInt(value, 10);
    if (isNaN(value) || value < 0) {
      value = 0;
    } else if (value > 100) {
      value = 100;
    }

    webpQualityValue.textContent = value;
  }
  
  // 打开数字步进器弹窗
  function openNumericStepperModal(type) {
    currentStepperType = type;
    const modal = document.getElementById('numericStepperModal');
    const title = document.getElementById('numericStepperModalTitle');
    const input = document.getElementById('numericStepperInput');
    const minLabel = document.getElementById('stepperMinLabel');
    const maxLabel = document.getElementById('stepperMaxLabel');
    const unitLabel = document.getElementById('stepperUnitLabel');
    
    if (type === 'size') {
      title.textContent = '设置载密体文件大小';
      input.min = '1';
      input.max = '10';
      input.step = '1';
      minLabel.textContent = '1';
      maxLabel.textContent = '10';
      unitLabel.textContent = 'MB';
      const currentValue = parseFloat(document.getElementById('hiddenFileSizeValue').textContent);
      input.value = Math.round(currentValue);
      originalValue = currentValue;
    } else if (type === 'ratio') {
      title.textContent = '设置隐藏文件比例';
      input.min = '1';
      input.max = '50';
      input.step = '1';
      minLabel.textContent = '1';
      maxLabel.textContent = '50';
      unitLabel.textContent = '%';
      const currentValue = parseInt(document.getElementById('hiddenFileRatioValue').textContent);
      input.value = currentValue;
      originalValue = currentValue;
    } else if (type === 'webpQuality') {
      title.textContent = '设置 WebP 质量降低比例';
      input.min = '0';
      input.max = '100';
      input.step = '1';
      minLabel.textContent = '0';
      maxLabel.textContent = '100';
      unitLabel.textContent = '%';
      const currentValue = parseInt(document.getElementById('webpQualityReduction').textContent, 10);
      input.value = isNaN(currentValue) ? 20 : currentValue;
      originalValue = isNaN(currentValue) ? 20 : currentValue;
    }
    
    modal.style.display = 'flex';
  }
  
  // 关闭数字步进器弹窗
  function closeNumericStepperModal() {
    const modal = document.getElementById('numericStepperModal');
    modal.style.display = 'none';
    currentStepperType = null;
  }
  
  // 增加数值
  function increaseStepperValue() {
    const input = document.getElementById('numericStepperInput');
    const min = parseFloat(input.min);
    const max = parseFloat(input.max);
    const step = parseFloat(input.step);
    let value = parseFloat(input.value);
    
    value = Math.min(value + step, max);
    input.value = Math.round(value);
  }
  
  // 减少数值
  function decreaseStepperValue() {
    const input = document.getElementById('numericStepperInput');
    const min = parseFloat(input.min);
    const max = parseFloat(input.max);
    const step = parseFloat(input.step);
    let value = parseFloat(input.value);
    
    value = Math.max(value - step, min);
    input.value = Math.round(value);
  }
  
  // 确认修改
  function confirmStepperValue() {
    const input = document.getElementById('numericStepperInput');
    let value = parseFloat(input.value);
    
    // 验证范围
    const min = parseFloat(input.min);
    const max = parseFloat(input.max);
    value = Math.max(min, Math.min(max, value));
    value = Math.round(value);
    
    if (currentStepperType === 'size') {
      updateHiddenFileSize(value);
      saveStepperValue('size', value);
    } else if (currentStepperType === 'ratio') {
      updateHiddenFileRatio(value);
      saveStepperValue('ratio', value);
    } else if (currentStepperType === 'webpQuality') {
      updateWebPQualityReduction(value);
      saveStepperValue('webpQuality', value);
    }
    
    closeNumericStepperModal();
  }
  
  // 绑定数字步进器事件
  const hiddenFileSizeValue = document.getElementById('hiddenFileSizeValue');
  const hiddenFileRatioValue = document.getElementById('hiddenFileRatioValue');
  const webpConverterToggle = document.getElementById('webpConverterToggle');
  const webpQualityReductionValue = document.getElementById('webpQualityReduction');
  const numericStepperModal = document.getElementById('numericStepperModal');
  const numericStepperClose = document.getElementById('numericStepperModalClose');
  const stepperIncreaseBtn = document.getElementById('stepperIncreaseBtn');
  const stepperDecreaseBtn = document.getElementById('stepperDecreaseBtn');
  const numericStepperCancelBtn = document.getElementById('numericStepperCancelBtn');
  const numericStepperConfirmBtn = document.getElementById('numericStepperConfirmBtn');
  const numericStepperInput = document.getElementById('numericStepperInput');
  
  if (hiddenFileSizeValue) {
    hiddenFileSizeValue.addEventListener('click', function() {
      openNumericStepperModal('size');
    });
  }
  
  if (hiddenFileRatioValue) {
    hiddenFileRatioValue.addEventListener('click', function() {
      openNumericStepperModal('ratio');
    });
  }

  if (webpQualityReductionValue) {
    webpQualityReductionValue.addEventListener('click', function() {
      openNumericStepperModal('webpQuality');
    });
  }

  if (webpConverterToggle) {
    webpConverterToggle.addEventListener('change', function() {
      saveWebPConverterState(this.checked);
    });
  }
  
  if (numericStepperClose) {
    numericStepperClose.addEventListener('click', closeNumericStepperModal);
  }
  
  if (numericStepperModal) {
    numericStepperModal.addEventListener('click', function(e) {
      if (e.target === numericStepperModal) {
        closeNumericStepperModal();
      }
    });
  }
  
  if (stepperIncreaseBtn) {
    stepperIncreaseBtn.addEventListener('click', increaseStepperValue);
  }
  
  if (stepperDecreaseBtn) {
    stepperDecreaseBtn.addEventListener('click', decreaseStepperValue);
  }
  
  if (numericStepperCancelBtn) {
    numericStepperCancelBtn.addEventListener('click', closeNumericStepperModal);
  }
  
  if (numericStepperConfirmBtn) {
    numericStepperConfirmBtn.addEventListener('click', confirmStepperValue);
  }
  
  if (numericStepperInput) {
    numericStepperInput.addEventListener('input', function() {
      const min = parseFloat(this.min);
      const max = parseFloat(this.max);
      let value = parseFloat(this.value);
      
      if (!isNaN(value)) {
        value = Math.max(min, Math.min(max, value));
        this.value = Math.round(value);
      }
    });
    
    numericStepperInput.addEventListener('keydown', function(e) {
      if (e.key === 'Enter') {
        e.preventDefault();
        confirmStepperValue();
      } else if (e.key === 'Escape') {
        closeNumericStepperModal();
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        increaseStepperValue();
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        decreaseStepperValue();
      }
    });
  }
  
  // 初始化加载数值
  loadStepperValues();
  
  // ========== 载体库自动选择功能 ==========
  
  // 计算隐藏文件总大小
  function calculateHiddenFileSize() {
    let totalSize = 0;
    
    // 计算文本框内容大小
    const textContent = mainBox.textContent.trim();
    if (textContent) {
      totalSize += new Blob([textContent]).size;
    }
    
    // 计算图片列表大小
    const imageItems = imageListBox.querySelectorAll('.image-list-item, .file-list-item');
    imageItems.forEach(item => {
      const img = item.querySelector('img');
      const link = item.querySelector('a');
      if (img && img.src) {
        var actualImageSource = getFullImageSourceFromElement(img);
        totalSize += actualImageSource.length * 0.75;
      } else if (link && link.href) {
        // 估算文件大小
        totalSize += link.href.length * 0.75;
      }
    });
    
    // 计算binaryFilesForTail中的文件大小
    binaryFilesForTail.forEach(file => {
      if (file.data) {
        totalSize += file.data.byteLength;
      }
    });
    
    hiddenFileTotalSize = totalSize;
    return totalSize;
  }
  
  // 自适应分配算法 - 安全优先策略
  function autoSelectCarriers() {
    if (carrierLibraryData.length === 0) {
      imageMsg.textContent = '载体库为空，请先导入载体图片';
      return false;
    }
    
    // 获取用户设置的参数
    const targetCarrierSizeMB = parseFloat(document.getElementById('hiddenFileSizeValue').textContent);
    const ratioPercent = parseInt(document.getElementById('hiddenFileRatioValue').textContent);
    
    // 计算隐藏文件大小
    const hiddenSizeBytes = calculateHiddenFileSize();
    if (hiddenSizeBytes === 0) {
      imageMsg.textContent = '请先导入隐藏文件或输入文本';
      return false;
    }
    
    const hiddenSizeMB = hiddenSizeBytes / (1024 * 1024);
    
    // 计算所需载体总大小
    const requiredCarrierTotalSizeMB = hiddenSizeMB / (ratioPercent / 100);
    
    // 目标载体大小范围（向下取整区间）
    const targetCarrierSizeBytes = targetCarrierSizeMB * 1024 * 1024;
    const lowerBoundBytes = (targetCarrierSizeMB - 1) * 1024 * 1024; // 向下1MB
    
    let selectedList = [];
    let currentTotalSize = 0;
    
    // 步骤1：在目标区间内选择载体（从大到小）
    const sortedCarriers = [...carrierLibraryData].sort((a, b) => b.size - a.size);
    
    // 筛选在目标区间内的载体
    const inRangeCarriers = sortedCarriers.filter(carrier => 
      carrier.size >= Math.max(0, lowerBoundBytes) && carrier.size <= targetCarrierSizeBytes
    );
    
    for (const carrier of inRangeCarriers) {
      if (currentTotalSize + carrier.size / (1024 * 1024) <= requiredCarrierTotalSizeMB + 2) {
        selectedList.push(carrier);
        currentTotalSize += carrier.size / (1024 * 1024);
      }
    }
    
    // 步骤2：如果还不够，安全优先策略 - 向下使用更小的载体
    if (currentTotalSize < requiredCarrierTotalSizeMB) {
      // 获取更小的载体（小于lowerBoundBytes）
      const smallerCarriers = sortedCarriers.filter(carrier => carrier.size < lowerBoundBytes);
      
      for (const carrier of smallerCarriers) {
        if (currentTotalSize + carrier.size / (1024 * 1024) <= requiredCarrierTotalSizeMB + 5) {
          selectedList.push(carrier);
          currentTotalSize += carrier.size / (1024 * 1024);
        }
        if (currentTotalSize >= requiredCarrierTotalSizeMB) break;
      }
    }
    
    // 步骤3：如果还是不够，尝试调整比例（不超过50%）
    let adjustedRatio = ratioPercent;
    if (currentTotalSize < requiredCarrierTotalSizeMB && selectedList.length > 0) {
      while (adjustedRatio < 50) {
        adjustedRatio += 1;
        const newRequiredSize = hiddenSizeMB / (adjustedRatio / 100);
        if (currentTotalSize >= newRequiredSize) {
          break;
        }
      }
    }
    
    // 检查是否满足要求
    if (selectedList.length === 0) {
      imageMsg.textContent = '没有找到合适的载体图片';
      return false;
    }
    
    if (currentTotalSize < hiddenSizeMB / (adjustedRatio / 100)) {
      imageMsg.textContent = `载体库容量不足。需要约 ${(hiddenSizeMB / (adjustedRatio / 100)).toFixed(2)}MB，当前可用 ${currentTotalSize.toFixed(2)}MB`;
      return false;
    }
    
    // 保存选择结果
    selectedCarriers = selectedList;
    
    // 显示选择结果信息
    const carrierCount = selectedList.length;
    const totalCarrierSizeMB = currentTotalSize;
    const stegoTotalSizeMB = hiddenSizeMB + totalCarrierSizeMB;
    
    imageMsg.textContent = `已自动选择 ${carrierCount} 个载体，总大小 ${totalCarrierSizeMB.toFixed(2)}MB，可隐藏 ${hiddenSizeMB.toFixed(2)}MB 文件，占比 ${adjustedRatio}%`;
    
    // 启用开始按钮
    document.getElementById('startEncodeBtn').disabled = false;
    
    return true;
  }
  
  // 监听内容变化，自动触发载体选择
  function setupAutoSelectListeners() {
    // 监听文本框变化
    mainBox.addEventListener('input', debounceAutoSelect);
    
    // 监听文件导入
    const originalLoadFileAsURL = loadFileAsURL;
    loadFileAsURL = function() {
      originalLoadFileAsURL.apply(this, arguments);
      setTimeout(() => {
        if (isCarrierLibraryModeEnabled()) {
          autoSelectCarriers();
        }
      }, 500);
    };
    
    const originalLoadImage = loadImage;
    loadImage = function() {
      originalLoadImage.apply(this, arguments);
      setTimeout(() => {
        if (isCarrierLibraryModeEnabled()) {
          autoSelectCarriers();
        }
      }, 500);
    };
  }
  
  // 防抖函数
  let autoSelectTimeout = null;
  function debounceAutoSelect() {
    if (autoSelectTimeout) {
      clearTimeout(autoSelectTimeout);
    }
    autoSelectTimeout = setTimeout(() => {
      if (isCarrierLibraryModeEnabled()) {
        autoSelectCarriers();
      }
    }, 800);
  }
  
  // 修改载体库弹窗，移除手动选择功能
  function modifyCarrierLibraryUI() {
    // 移除双击选择功能
    const originalRender = renderCarrierLibrary;
    renderCarrierLibrary = function() {
      const listEl = document.getElementById('carrierLibraryList');
      if (!listEl) return;
      
      listEl.innerHTML = '';
      
      const sortedData = [...carrierLibraryData].sort((a, b) => b.size - a.size);
      
      sortedData.forEach((item, displayIndex) => {
        const originalIndex = carrierLibraryData.findIndex(data => data.id === item.id);
        
        const itemEl = document.createElement('div');
        itemEl.className = 'carrier-library-item';
        itemEl.innerHTML = `
          <div class="image-placeholder">🖼️</div>
          <div class="carrier-library-item-info">
            <div class="carrier-library-item-name">${item.name}</div>
            <div class="carrier-library-item-size">${formatFileSize(item.size)}</div>
          </div>
          <button class="cssbutton carrier-library-item-remove" data-index="${originalIndex}">删除</button>
        `;
        
        // 仅保留单击查看大图功能
        itemEl.addEventListener('click', function(e) {
          if (e.target.closest('.carrier-library-item-remove')) return;
          e.stopPropagation();
          showFullscreenPreview(item);
        });
        
        // 更新提示信息
        itemEl.title = '单击查看大图';
        
        listEl.appendChild(itemEl);
      });
      
      listEl.querySelectorAll('.carrier-library-item-remove').forEach(btn => {
        btn.addEventListener('click', function(e) {
          e.stopPropagation();
          const index = parseInt(this.getAttribute('data-index'));
          removeCarrierFromLibrary(index);
        });
      });
    };
  }
  
  // 初始化自动选择功能
  function initCarrierAutoSelect() {
    setupAutoSelectListeners();
    modifyCarrierLibraryUI();
    
    // 监听载体库模式切换
    const carrierModeCheckbox = document.getElementById('carrierLibraryMode');
    if (carrierModeCheckbox) {
      carrierModeCheckbox.addEventListener('change', function() {
        if (this.checked) {
          // 启用载体库模式时，切换按钮为载体库模式
          if (window.toggleCoverImageButton) {
            window.toggleCoverImageButton(true);
          }
          // 尝试自动选择
          setTimeout(() => autoSelectCarriers(), 300);
        } else {
          // 禁用时恢复
          if (window.toggleCoverImageButton) {
            window.toggleCoverImageButton(false);
          }
        }
      });
    }
  }
  
  // 将函数暴露到全局
  window.encodeMultipleCarriers = encodeMultipleCarriers;
  window.loadCarrierLibrary = loadCarrierLibrary;
  window.openCarrierLibraryModal = openCarrierLibraryModal;
  window.closeCarrierLibraryModal = closeCarrierLibraryModal;
  window.clearCarrierLibrary = clearCarrierLibrary;
  window.handleCarrierLibraryFiles = handleCarrierLibraryFiles;
  window.showCarrierLibraryLoading = showCarrierLibraryLoading;
  window.hideCarrierLibraryLoading = hideCarrierLibraryLoading;
  window.showFullscreenPreview = showFullscreenPreview;
  window.closeFullscreenPreview = closeFullscreenPreview;
  window.openLinkTagModal = openLinkTagModal;
  window.closeLinkTagModal = closeLinkTagModal;
  window.insertLinkTag = insertLinkTag;
  window.openNumericStepperModal = openNumericStepperModal;
  window.closeNumericStepperModal = closeNumericStepperModal;
  
  // 复制提取结果纯文本
  function copyExtractedText(btn) {
    var resultBlock = btn.closest('.extracted-result-block');
    if (!resultBlock) return;
    
    var contentDiv = resultBlock.querySelector('.extracted-result-content');
    if (!contentDiv) return;
    
    // 克隆内容div以进行处理
    var cloneDiv = contentDiv.cloneNode(true);
    
    // 移除图片区域容器
    var imageSections = cloneDiv.querySelectorAll('.stego-image-section');
    imageSections.forEach(function(el) { el.remove(); });
    
    // 移除图片列表容器（包含图片和文件名）
    var imageListItems = cloneDiv.querySelectorAll('.image-list-item, .file-list-item');
    imageListItems.forEach(function(el) { el.remove(); });
    
    // 移除图片文件名元素
    var fileNames = cloneDiv.querySelectorAll('.image-filename, .extracted-filename, .decode-filename');
    fileNames.forEach(function(el) { el.remove(); });
    
    // 移除下载链接
    var downloadLinks = cloneDiv.querySelectorAll('a[download]');
    downloadLinks.forEach(function(el) { el.remove(); });
    
    // 移除图片元素（只保留alt文本如果有）
    var images = cloneDiv.querySelectorAll('img');
    images.forEach(function(el) { el.remove(); });
    
    // 获取纯文本
    var text = cloneDiv.textContent || cloneDiv.innerText;
    
    // 清理文本：移除多余的空白和换行
    text = text.replace(/\s+/g, ' ').trim();
    
    // 如果文本为空或只有空白，提示用户
    if (!text || text.length === 0) {
      btn.textContent = '无文本可复制';
      setTimeout(function() {
        btn.textContent = '复制文本';
      }, 1500);
      return;
    }
    
    // 复制到剪贴板
    navigator.clipboard.writeText(text).then(function() {
      // 显示复制成功反馈
      var originalText = btn.textContent;
      btn.textContent = '已复制';
      btn.classList.add('copied');
      setTimeout(function() {
        btn.textContent = originalText;
        btn.classList.remove('copied');
      }, 1500);
    }).catch(function(err) {
      console.error('复制失败:', err);
      btn.textContent = '复制失败';
      setTimeout(function() {
        btn.textContent = '复制文本';
      }, 1500);
    });
  }
  window.copyExtractedText = copyExtractedText;
  
  // 初始化加载载体库
  loadCarrierLibrary();
  
  // 初始化载体库自动选择功能
  initCarrierAutoSelect();
  
  // ========== 固定封面图功能 ==========
  
  // IndexedDB配置
  const FIXED_COVER_DB_NAME = 'FixedCoverImageDB';
  const FIXED_COVER_DB_VERSION = 1;
  const FIXED_COVER_STORE_NAME = 'fixedCover';
  let fixedCoverDB = null;
  
  // 初始化IndexedDB
  function initFixedCoverDB() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(FIXED_COVER_DB_NAME, FIXED_COVER_DB_VERSION);
      
      request.onerror = () => {
        console.error('打开固定封面图数据库失败:', request.error);
        reject(request.error);
      };
      
      request.onsuccess = () => {
        fixedCoverDB = request.result;
        resolve(fixedCoverDB);
      };
      
      request.onupgradeneeded = (event) => {
        const database = event.target.result;
        if (!database.objectStoreNames.contains(FIXED_COVER_STORE_NAME)) {
          database.createObjectStore(FIXED_COVER_STORE_NAME, { keyPath: 'id' });
        }
      };
    });
  }
  
  // 加载固定封面图
  function loadFixedCoverImage() {
    if (!fixedCoverDB) {
      initFixedCoverDB().then(() => {
        loadFixedCoverFromDB();
      }).catch((e) => {
        console.error('初始化固定封面图数据库失败:', e);
      });
    } else {
      loadFixedCoverFromDB();
    }
  }
  
  // 从数据库加载固定封面图
  function loadFixedCoverFromDB() {
    try {
      // 检查载体库模式是否启用
      const isCarrierMode = window.isCarrierLibraryModeEnabled && window.isCarrierLibraryModeEnabled();
      if (isCarrierMode) {
        console.log('载体库模式已启用，跳过加载固定封面图');
        return;
      }
      
      const transaction = fixedCoverDB.transaction([FIXED_COVER_STORE_NAME], 'readonly');
      const store = transaction.objectStore(FIXED_COVER_STORE_NAME);
      const request = store.get('fixedCover');
      
      request.onsuccess = () => {
        const coverData = request.result;
        if (coverData && coverData.dataUrl) {
          // 恢复封面图
          originalCoverFile = new File([base64ToBlob(coverData.dataUrl, coverData.type)], coverData.name, { type: coverData.type });
          originalCoverDataURL = coverData.dataUrl;
          document.getElementById('previewContainer').style.display = 'block';
          document.getElementById('preview').src = coverData.dataUrl;
          document.getElementById('previewFilename').textContent = coverData.name;
          
          // 显示图像详细信息
          const previewElement = document.getElementById('preview');
          if (previewElement) {
            previewElement.onload = function() {
              // 检查是否为文件尾追加模式
              const encodeMode = document.getElementById('encodeModeSelect');
              const isTailMode = encodeMode && encodeMode.value === 'tail';
              
              // 只在非文件尾追加模式下计算容量
              if (!isTailMode) {
                updateCapacity();
              }
              updateImageDetails(previewElement, originalCoverFile, 'imageDetails');
            };
          }
          
          // 更新按钮状态
          updateFixCoverButton(true);
        }
      };
      
      request.onerror = () => {
        console.error('加载固定封面图失败:', request.error);
      };
    } catch (e) {
      console.error('加载固定封面图失败:', e);
    }
  }
  
  // 保存固定封面图到数据库
  function saveFixedCoverImage(file, dataUrl) {
    try {
      if (!fixedCoverDB) {
        console.error('数据库未初始化');
        return;
      }
      
      const transaction = fixedCoverDB.transaction([FIXED_COVER_STORE_NAME], 'readwrite');
      const store = transaction.objectStore(FIXED_COVER_STORE_NAME);
      
      const coverData = {
        id: 'fixedCover',
        name: file.name,
        type: file.type,
        dataUrl: dataUrl
      };
      
      const request = store.put(coverData);
      
      request.onsuccess = () => {
        console.log('固定封面图保存成功');
      };
      
      request.onerror = () => {
        console.error('保存固定封面图失败:', request.error);
      };
    } catch (e) {
      console.error('保存固定封面图失败:', e);
    }
  }
  
  // 清除固定封面图
  function clearFixedCoverImage() {
    try {
      if (!fixedCoverDB) {
        console.error('数据库未初始化');
        return;
      }
      
      const transaction = fixedCoverDB.transaction([FIXED_COVER_STORE_NAME], 'readwrite');
      const store = transaction.objectStore(FIXED_COVER_STORE_NAME);
      const request = store.delete('fixedCover');
      
      request.onsuccess = () => {
        console.log('固定封面图清除成功');
        originalCoverFile = null;
        originalCoverDataURL = null;
        document.getElementById('previewContainer').style.display = 'none';
        document.getElementById('preview').src = '';
        document.getElementById('previewFilename').textContent = '';
        updateFixCoverButton(false);
      };
      
      request.onerror = () => {
        console.error('清除固定封面图失败:', request.error);
      };
    } catch (e) {
      console.error('清除固定封面图失败:', e);
    }
  }
  
  // 更新固定封面图按钮状态
  function updateFixCoverButton(isFixed) {
    const fixButton = document.getElementById('fixCoverImageBtn');
    const coverImageBtn = document.getElementById('coverImageBtn');
    const coverImageLabel = document.getElementById('coverImageLabel');
    
    console.log('更新按钮状态:', isFixed, 'fixButton:', fixButton, 'coverImageBtn:', coverImageBtn, 'coverImageLabel:', coverImageLabel);
    
    if (fixButton) {
      if (isFixed) {
        fixButton.classList.add('fixed-cover-mode');
        fixButton.title = '长按取消固定';
        console.log('添加固定封面图彩虹渐变类');
      } else {
        fixButton.classList.remove('fixed-cover-mode');
        fixButton.title = '固定封面图';
        console.log('移除固定封面图彩虹渐变类');
      }
    } else {
      console.error('找不到固定封面图按钮');
    }
    
    // 检查载体库模式是否启用
    const isCarrierMode = window.isCarrierLibraryModeEnabled && window.isCarrierLibraryModeEnabled();
    console.log('载体库模式状态:', isCarrierMode);
    
    // 只有在非载体库模式下才禁用加载封面图按钮
    if (!isCarrierMode) {
      if (coverImageBtn) {
        if (isFixed) {
          coverImageBtn.disabled = true;
          coverImageBtn.style.opacity = '0.45';
          coverImageBtn.style.cursor = 'not-allowed';
          coverImageBtn.style.pointerEvents = 'none';
          console.log('禁用加载封面图按钮');
        } else {
          coverImageBtn.disabled = false;
          coverImageBtn.style.opacity = '1';
          coverImageBtn.style.cursor = 'pointer';
          coverImageBtn.style.pointerEvents = 'auto';
          console.log('启用加载封面图按钮');
        }
      } else {
        console.error('找不到加载封面图按钮');
      }
      
      // 禁用整个label元素，防止点击触发文件选择
      if (coverImageLabel) {
        if (isFixed) {
          coverImageLabel.style.pointerEvents = 'none';
          coverImageLabel.style.opacity = '0.45';
          coverImageLabel.style.cursor = 'not-allowed';
          console.log('禁用加载封面图label');
        } else {
          coverImageLabel.style.pointerEvents = 'auto';
          coverImageLabel.style.opacity = '1';
          coverImageLabel.style.cursor = 'pointer';
          console.log('启用加载封面图label');
        }
      } else {
        console.error('找不到加载封面图label');
      }
    } else {
      console.log('载体库模式已启用，保持加载封面图按钮可用');
    }
  }
  
  // Base64转Blob
  function base64ToBlob(base64, mimeType) {
    const byteCharacters = atob(base64.split(',')[1]);
    const byteNumbers = new Array(byteCharacters.length);
    for (let i = 0; i < byteCharacters.length; i++) {
      byteNumbers[i] = byteCharacters.charCodeAt(i);
    }
    const byteArray = new Uint8Array(byteNumbers);
    return new Blob([byteArray], { type: mimeType });
  }
  
  // 绑定固定封面图按钮事件
  const fixCoverImageBtn = document.getElementById('fixCoverImageBtn');
  if (fixCoverImageBtn) {
    // 点击事件：选择图片
    fixCoverImageBtn.addEventListener('click', function() {
      // 检查是否已经固定
      if (this.classList.contains('fixed-cover-mode')) {
        // 已经固定，长按取消
        return;
      }
      
      // 创建隐藏的文件输入
      const fileInput = document.createElement('input');
      fileInput.type = 'file';
      fileInput.accept = 'image/*';
      fileInput.style.display = 'none';
      
      // 监听文件选择
      fileInput.addEventListener('change', function(e) {
        const file = e.target.files[0];
        if (file) {
          const reader = new FileReader();
          reader.onload = function(event) {
            const dataUrl = event.target.result;
            // 保存并加载封面图
            saveFixedCoverImage(file, dataUrl);
            originalCoverFile = file;
            originalCoverDataURL = dataUrl;
            document.getElementById('previewContainer').style.display = 'block';
            document.getElementById('preview').src = dataUrl;
            document.getElementById('previewFilename').textContent = file.name;
            
            // 显示图像详细信息
            const previewElement = document.getElementById('preview');
            if (previewElement) {
              previewElement.onload = function() {
                // 检查是否为文件尾追加模式
                const encodeMode = document.getElementById('encodeModeSelect');
                const isTailMode = encodeMode && encodeMode.value === 'tail';
                
                // 只在非文件尾追加模式下计算容量
                if (!isTailMode) {
                  updateCapacity();
                }
                updateImageDetails(previewElement, file, 'imageDetails');
              };
            }
            
            // 立即更新按钮状态
            updateFixCoverButton(true);
          };
          reader.readAsDataURL(file);
        }
        // 移除临时输入
        document.body.removeChild(fileInput);
      });
      
      // 添加到页面并触发点击
      document.body.appendChild(fileInput);
      fileInput.click();
    });
    
    // 长按事件：取消固定
    let longPressTimer;
    fixCoverImageBtn.addEventListener('mousedown', function() {
      if (this.classList.contains('fixed-cover-mode')) {
        longPressTimer = setTimeout(() => {
          clearFixedCoverImage();
        }, 500);
      }
    });
    
    fixCoverImageBtn.addEventListener('mouseup', function() {
      clearTimeout(longPressTimer);
    });
    
    fixCoverImageBtn.addEventListener('mouseleave', function() {
      clearTimeout(longPressTimer);
    });
    
    // 移动端触摸事件
    fixCoverImageBtn.addEventListener('touchstart', function(e) {
      if (this.classList.contains('fixed-cover-mode')) {
        longPressTimer = setTimeout(() => {
          clearFixedCoverImage();
        }, 500);
      }
    });
    
    fixCoverImageBtn.addEventListener('touchend', function() {
      clearTimeout(longPressTimer);
    });
  }
  
  // 初始化IndexedDB并加载固定封面图
  initFixedCoverDB().then(() => {
    loadFixedCoverImage();
  }).catch((e) => {
    console.error('初始化固定封面图数据库失败:', e);
  });
  
  // 确保页面加载完成后检查固定封面图状态
  window.addEventListener('load', function() {
    if (fixedCoverDB) {
      loadFixedCoverImage();
    }
  });
  
  // 暴露全局函数：检查是否有固定封面图数据
  window.isFixedCoverImageActive = function() {
    return fixedCoverDB !== null && originalCoverFile !== null && originalCoverDataURL !== null;
  };
  
  // 暴露全局函数：重新加载固定封面图（强制加载，不检查载体库模式）
  window.reloadFixedCoverImage = function() {
    if (!fixedCoverDB) {
      initFixedCoverDB().then(() => {
        forceLoadFixedCoverFromDB();
      }).catch((e) => {
        console.error('初始化固定封面图数据库失败:', e);
      });
    } else {
      forceLoadFixedCoverFromDB();
    }
  };
  
  // 强制从数据库加载固定封面图（不检查载体库模式）
  function forceLoadFixedCoverFromDB() {
    try {
      const transaction = fixedCoverDB.transaction([FIXED_COVER_STORE_NAME], 'readonly');
      const store = transaction.objectStore(FIXED_COVER_STORE_NAME);
      const request = store.get('fixedCover');
      
      request.onsuccess = () => {
        const coverData = request.result;
        if (coverData && coverData.dataUrl) {
          // 恢复封面图
          originalCoverFile = new File([base64ToBlob(coverData.dataUrl, coverData.type)], coverData.name, { type: coverData.type });
          originalCoverDataURL = coverData.dataUrl;
          document.getElementById('previewContainer').style.display = 'block';
          document.getElementById('preview').src = coverData.dataUrl;
          document.getElementById('previewFilename').textContent = coverData.name;
          
          // 显示图像详细信息
          const previewElement = document.getElementById('preview');
          if (previewElement) {
            previewElement.onload = function() {
              // 检查是否为文件尾追加模式
              const encodeMode = document.getElementById('encodeModeSelect');
              const isTailMode = encodeMode && encodeMode.value === 'tail';
              
              // 只在非文件尾追加模式下计算容量
              if (!isTailMode) {
                updateCapacity();
              }
              updateImageDetails(previewElement, originalCoverFile, 'imageDetails');
            };
          }
          
          // 更新按钮状态
          updateFixCoverButton(true);
          console.log('强制加载固定封面图成功');
        }
      };
      
      request.onerror = () => {
        console.error('强制加载固定封面图失败:', request.error);
      };
    } catch (e) {
      console.error('强制加载固定封面图失败:', e);
    }
  }

  var passwordCopyPromptToggle = document.getElementById('passwordCopyPromptToggle');
  var passwordCopySetting = document.getElementById('passwordCopySetting');
  var passwordCopyModal = document.getElementById('passwordCopyModal');
  var passwordCopyModalClose = document.getElementById('passwordCopyModalClose');
  var passwordCopyButton = document.getElementById('passwordCopyButton');
  var passwordCopyNeverAsk = document.getElementById('passwordCopyNeverAsk');
  var passwordCopyLabel = passwordCopySetting ? passwordCopySetting.querySelector('.toggle-label-small') : null;
  var carrierLibraryPanelBody = document.querySelector('#carrierLibraryPanel .panel-body');
  var passwordCopyAnchor = document.getElementById('fixCoverImageBtn');

  if (passwordCopySetting && carrierLibraryPanelBody) {
    if (passwordCopyAnchor && passwordCopyAnchor.parentNode === carrierLibraryPanelBody) {
      carrierLibraryPanelBody.insertBefore(passwordCopySetting, passwordCopyAnchor);
    } else {
      carrierLibraryPanelBody.appendChild(passwordCopySetting);
    }
  }

  if (passwordCopyLabel) {
    passwordCopyLabel.textContent = '用户输入密码是否询问复制';
  }

  syncPasswordCopyPromptToggle(loadPasswordCopyPromptState());

  if (passwordCopyPromptToggle) {
    passwordCopyPromptToggle.addEventListener('change', function() {
      syncPasswordCopyPromptToggle(this.checked);
    });
  }

  if (passwordCopyModalClose) {
    passwordCopyModalClose.addEventListener('click', function() {
      closePasswordCopyModal();
    });
  }

  if (passwordCopyButton) {
    passwordCopyButton.addEventListener('click', function() {
      copyPasswordFromModal();
    });
  }

  if (passwordCopyNeverAsk) {
    passwordCopyNeverAsk.addEventListener('change', function() {
      if (this.checked) {
        syncPasswordCopyPromptToggle(false);
      } else {
        syncPasswordCopyPromptToggle(true);
      }
    });
  }
});
