/**
 * 图纸尺寸识别 - Blueprint 模块
 * 功能：图片导入 → 裁剪图纸 → 选择最小格子 → 计算格子数量
 */

const BlueprintApp = (() => {
  // 状态
  let state = {
    step: 1,           // 当前步骤 1-4
    originalImage: null,   // 原图 HTMLImageElement
    originalWidth: 0,
    originalHeight: 0,
    croppedImage: null,   // 裁剪后的图纸 HTMLImageElement
    croppedWidth: 0,
    croppedHeight: 0,
    cropRect: { x: 0, y: 0, w: 0, h: 0 },      // 裁剪框位置
    gridRect: { x: 0, y: 0, w: 0, h: 0 },      // 格子框位置
    zoom: 1,            // 当前缩放比例
    minZoom: 0.1,
    maxZoom: 5,
  };

  // DOM 元素
  const $ = (id) => document.getElementById(id);
  let els = {};

  // Toast 提示
  let toastTimer = null;
  function toast(msg) {
    const toastEl = els.toast;
    if (!toastEl) return;
    toastEl.textContent = msg;
    toastEl.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => (toastEl.hidden = true), 2400);
  }

  // 图片加载工具
  function loadImage(src) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = src;
    });
  }

  function fileToDataURL(file) {
    return new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result);
      r.onerror = reject;
      r.readAsDataURL(file);
    });
  }

  function init() {
    // 缓存 DOM 元素
    els = {
      tabBtns: document.querySelectorAll('.tab-btn'),
      tabContents: document.querySelectorAll('[data-tab-content]'),
      blueprintWorkspace: $('blueprint-workspace'),
      emptyState: $('empty-state'),
      workspace: $('workspace'),
      uploadZone: $('bp-upload-zone'),
      imageInput: $('bp-image-input'),
      canvasContainer: $('bp-canvas-container'),
      canvasWrapper: $('bp-canvas-wrapper'),
      canvas: $('bp-canvas'),
      overlay: $('bp-overlay'),
      cropBox: $('bp-crop-box'),
      gridBox: $('bp-grid-box'),
      zoomControls: $('bp-zoom-controls'),
      zoomLevel: $('bp-zoom-level'),
      zoomIn: $('bp-zoom-in'),
      zoomOut: $('bp-zoom-out'),
      actionStep1: $('bp-action-step1'),
      actionStep2: $('bp-action-step2'),
      actionStep3: $('bp-action-step3'),
      actionStep4: $('bp-action-step4'),
      startCrop: $('bp-start-crop'),
      confirmCrop: $('bp-confirm-crop'),
      cancelCrop: $('bp-cancel-crop'),
      confirmGrid: $('bp-confirm-grid'),
      redoCrop: $('bp-redo-crop'),
      restart: $('bp-restart'),
      resetImage: $('bp-reset-image'),
      resultValue: $('bp-result-value'),
      toast: $('toast'),
    };

    bindEvents();
    // Tab 切换默认激活封面制作
    switchTab('cover');
  }

  function switchTab(tabName) {
    els.tabBtns.forEach(btn => {
      btn.classList.toggle('active', btn.dataset.tab === tabName);
    });

    els.tabContents.forEach(content => {
      content.hidden = content.dataset.tabContent !== tabName;
    });

    // 显示/隐藏空状态和工作区
    if (tabName === 'cover') {
      if (els.workspace.hidden && els.emptyState.hidden) {
        els.emptyState.hidden = false;
      }
    } else {
      els.blueprintWorkspace.hidden = false;
    }
  }

  function setStep(step) {
    state.step = step;

    // 更新步骤指示器
    document.querySelectorAll('.bp-step').forEach(el => {
      const n = Number(el.dataset.step);
      el.classList.remove('active', 'completed');
      if (n < step) el.classList.add('completed');
      if (n === step) el.classList.add('active');
    });

    // 显示/隐藏操作按钮
    els.actionStep1.hidden = step !== 1;
    els.actionStep2.hidden = step !== 2;
    els.actionStep3.hidden = step !== 3;
    els.actionStep4.hidden = step !== 4;

    // 显示/隐藏裁剪框和格子框
    els.cropBox.hidden = step < 2 || step > 2;
    els.gridBox.hidden = step < 3 || step > 3;
  }

  async function handleImageUpload(file) {
    if (!file || !file.type.startsWith('image/')) {
      toast('请上传图片文件');
      return;
    }

    try {
      const dataUrl = await fileToDataURL(file);
      const img = await loadImage(dataUrl);

      state.originalImage = img;
      state.originalWidth = img.width;
      state.originalHeight = img.height;

      // 绘制图片到 Canvas
      renderCanvas();
      els.uploadZone.hidden = true;
      els.canvasContainer.hidden = false;
      els.zoomControls.hidden = false;

      setStep(2);
    } catch (e) {
      toast('图片加载失败');
    }
  }

  function renderCanvas() {
    const canvas = els.canvas;
    const img = state.originalImage;
    if (!img) return;

    // 根据缩放计算显示尺寸
    const displayWidth = img.width * state.zoom;
    const displayHeight = img.height * state.zoom;

    canvas.width = displayWidth;
    canvas.height = displayHeight;
    canvas.style.width = displayWidth + 'px';
    canvas.style.height = displayHeight + 'px';

    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0, displayWidth, displayHeight);

    // 更新 overlay 尺寸
    els.overlay.style.width = displayWidth + 'px';
    els.overlay.style.height = displayHeight + 'px';
    els.overlay.style.left = canvas.offsetLeft + 'px';
    els.overlay.style.top = canvas.offsetTop + 'px';

    // 更新缩放显示
    els.zoomLevel.textContent = Math.round(state.zoom * 100) + '%';

    // 重绘裁剪框和格子框
    updateCropBox();
    updateGridBox();
  }

  function handleZoom(delta) {
    const newZoom = Math.max(state.minZoom, Math.min(state.maxZoom, state.zoom + delta));
    if (newZoom !== state.zoom) {
      state.zoom = newZoom;
      renderCanvas();
    }
  }

  function initCropBox() {
    // 默认裁剪整个图纸区域
    state.cropRect = {
      x: 0,
      y: 0,
      w: state.originalWidth,
      h: state.originalHeight
    };
    updateCropBox();
  }

  function updateCropBox() {
    const { x, y, w, h } = state.cropRect;
    els.cropBox.style.left = (x * state.zoom) + 'px';
    els.cropBox.style.top = (y * state.zoom) + 'px';
    els.cropBox.style.width = (w * state.zoom) + 'px';
    els.cropBox.style.height = (h * state.zoom) + 'px';
  }

  let cropDrag = null;

  function onCropBoxMouseDown(e) {
    e.preventDefault();
    const rect = els.canvas.getBoundingClientRect();
    cropDrag = {
      type: 'move',
      startMouse: {
        x: (e.clientX - rect.left) / state.zoom,
        y: (e.clientY - rect.top) / state.zoom
      },
      startRect: { ...state.cropRect }
    };
  }

  function onCropBoxMouseMove(e) {
    if (!cropDrag) return;
    const rect = els.canvas.getBoundingClientRect();
    const cur = {
      x: (e.clientX - rect.left) / state.zoom,
      y: (e.clientY - rect.top) / state.zoom
    };
    const dx = cur.x - cropDrag.startMouse.x;
    const dy = cur.y - cropDrag.startMouse.y;

    let x = cropDrag.startRect.x + dx;
    let y = cropDrag.startRect.y + dy;
    let w = cropDrag.startRect.w;
    let h = cropDrag.startRect.h;

    // 限制在原图范围内
    x = Math.max(0, Math.min(state.originalWidth - w, x));
    y = Math.max(0, Math.min(state.originalHeight - h, y));

    state.cropRect = { x, y, w, h };
    updateCropBox();
  }

  function onCropBoxMouseUp() {
    cropDrag = null;
  }

  function showGridSelector() {
    els.gridBox.hidden = false;

    // 初始化格子框在裁剪区域内中心位置
    const crop = state.cropRect;
    const initSize = Math.min(crop.w, crop.h) * 0.2;
    state.gridRect = {
      x: crop.x + (crop.w - initSize) / 2,
      y: crop.y + (crop.h - initSize) / 2,
      w: initSize,
      h: initSize
    };
    updateGridBox();
  }

  function updateGridBox() {
    const { x, y, w, h } = state.gridRect;
    els.gridBox.style.left = (x * state.zoom) + 'px';
    els.gridBox.style.top = (y * state.zoom) + 'px';
    els.gridBox.style.width = (w * state.zoom) + 'px';
    els.gridBox.style.height = (h * state.zoom) + 'px';
  }

  let gridDrag = null;

  function onGridBoxMouseDown(e) {
    e.preventDefault();
    e.stopPropagation();
    const rect = els.canvas.getBoundingClientRect();
    gridDrag = {
      type: e.target === els.gridBox ? 'move' : 'resize',
      startMouse: {
        x: (e.clientX - rect.left) / state.zoom,
        y: (e.clientY - rect.top) / state.zoom
      },
      startRect: { ...state.gridRect }
    };
  }

  function onGridBoxMouseMove(e) {
    if (!gridDrag) return;
    const rect = els.canvas.getBoundingClientRect();
    const cur = {
      x: (e.clientX - rect.left) / state.zoom,
      y: (e.clientY - rect.top) / state.zoom
    };
    const dx = cur.x - gridDrag.startMouse.x;
    const dy = cur.y - gridDrag.startMouse.y;

    const crop = state.cropRect;
    let x, y, w, h;

    if (gridDrag.type === 'move') {
      x = gridDrag.startRect.x + dx;
      y = gridDrag.startRect.y + dy;
      w = gridDrag.startRect.w;
      h = gridDrag.startRect.h;

      // 限制在裁剪区域内
      x = Math.max(crop.x, Math.min(crop.x + crop.w - w, x));
      y = Math.max(crop.y, Math.min(crop.y + crop.h - h, y));
    } else {
      // resize - 从右下角拖动
      x = gridDrag.startRect.x;
      y = gridDrag.startRect.y;
      w = Math.max(10, gridDrag.startRect.w + dx);
      h = Math.max(10, gridDrag.startRect.h + dy);

      // 限制在裁剪区域内
      if (x + w > crop.x + crop.w) w = crop.x + crop.w - x;
      if (y + h > crop.y + crop.h) h = crop.y + crop.h - y;

      // 保持正方形
      const size = Math.min(w, h);
      w = size;
      h = size;
    }

    state.gridRect = { x, y, w, h };
    updateGridBox();
  }

  function onGridBoxMouseUp() {
    gridDrag = null;
  }

  function handleConfirmGrid() {
    // 计算格子数量
    const crop = state.cropRect;
    const grid = state.gridRect;

    const cols = Math.floor(crop.w / grid.w);
    const rows = Math.floor(crop.h / grid.h);

    state.resultValue.textContent = `${cols} × ${rows}`;
    setStep(4);
  }

  function resetImage() {
    state.originalImage = null;
    state.originalWidth = 0;
    state.originalHeight = 0;
    state.croppedImage = null;
    state.cropRect = { x: 0, y: 0, w: 0, h: 0 };
    state.gridRect = { x: 0, y: 0, w: 0, h: 0 };
    state.zoom = 1;

    els.uploadZone.hidden = false;
    els.canvasContainer.hidden = true;
    els.zoomControls.hidden = true;

    setStep(1);
  }

  function restart() {
    resetImage();
  }

  function bindEvents() {
    // Tab 切换
    els.tabBtns.forEach(btn => {
      btn.addEventListener('click', () => switchTab(btn.dataset.tab));
    });

    // 图片上传
    els.uploadZone.addEventListener('click', () => els.imageInput.click());
    els.imageInput.addEventListener('change', (e) => {
      if (e.target.files[0]) handleImageUpload(e.target.files[0]);
    });

    // 拖拽上传
    els.uploadZone.addEventListener('dragover', (e) => {
      e.preventDefault();
      els.uploadZone.style.borderColor = 'var(--accent)';
    });
    els.uploadZone.addEventListener('dragleave', () => {
      els.uploadZone.style.borderColor = '';
    });
    els.uploadZone.addEventListener('drop', (e) => {
      e.preventDefault();
      els.uploadZone.style.borderColor = '';
      if (e.dataTransfer.files[0]) handleImageUpload(e.dataTransfer.files[0]);
    });

    // 缩放
    els.zoomIn.addEventListener('click', () => handleZoom(0.1));
    els.zoomOut.addEventListener('click', () => handleZoom(-0.1));

    // 裁剪操作
    els.startCrop.addEventListener('click', () => {
      initCropBox();
      setStep(2);
    });
    els.confirmCrop.addEventListener('click', () => {
      showGridSelector();
      setStep(3);
    });
    els.cancelCrop.addEventListener('click', resetImage);

    // 格子操作
    els.confirmGrid.addEventListener('click', handleConfirmGrid);
    els.redoCrop.addEventListener('click', () => {
      initCropBox();
      setStep(2);
    });

    // 重置
    els.resetImage.addEventListener('click', resetImage);
    els.restart.addEventListener('click', restart);

    // 裁剪框拖拽
    els.cropBox.addEventListener('mousedown', onCropBoxMouseDown);
    els.gridBox.addEventListener('mousedown', onGridBoxMouseDown);
    window.addEventListener('mousemove', (e) => {
      onCropBoxMouseMove(e);
      onGridBoxMouseMove(e);
    });
    window.addEventListener('mouseup', () => {
      onCropBoxMouseUp();
      onGridBoxMouseUp();
    });

    // 触摸支持
    els.cropBox.addEventListener('touchstart', (e) => {
      if (e.touches.length === 1) {
        const touch = e.touches[0];
        onCropBoxMouseDown({ clientX: touch.clientX, clientY: touch.clientY, preventDefault: () => e.preventDefault() });
      }
    });
    els.gridBox.addEventListener('touchstart', (e) => {
      if (e.touches.length === 1) {
        const touch = e.touches[0];
        onGridBoxMouseDown({ clientX: touch.clientX, clientY: touch.clientY, preventDefault: () => e.preventDefault(), stopPropagation: () => e.stopPropagation() });
      }
    });
    window.addEventListener('touchmove', (e) => {
      if (e.touches.length === 1) {
        const touch = e.touches[0];
        onCropBoxMouseMove({ clientX: touch.clientX, clientY: touch.clientY });
        onGridBoxMouseMove({ clientX: touch.clientX, clientY: touch.clientY });
      }
    });
    window.addEventListener('touchend', () => {
      onCropBoxMouseUp();
      onGridBoxMouseUp();
    });
  }

  // 初始化
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  return { switchTab };
})();
