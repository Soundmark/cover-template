/**
 * 图纸尺寸识别 - Blueprint 模块
 * 流程：导入图片 → 裁剪图纸(固定框+图片缩放) → 输入格子数→生成网格→触屏对齐验证
 */
const BlueprintApp = (() => {
  // ── 状态 ──
  let state = {
    step: 1,
    originalImage: null,
    originalWidth: 0,
    originalHeight: 0,
    croppedImage: null,

    // 步骤 2 —— 固定裁剪框（屏幕坐标，相对 canvas-wrapper）
    cropFrame: { x: 0, y: 0, w: 0, h: 0 },
    imgPanX: 0,
    imgPanY: 0,
    imgZoom: 1,

    // 步骤 3 —— 网格对齐
    gridW: 0,
    gridH: 0,
    gridGenerated: false,
    currentMode: 'image',       // 'image' | 'grid'
    imageOffX: 0,
    imageOffY: 0,
    imageScale: 1,
    gridOffX: 0,
    gridOffY: 0,
    gridScale: 1,
  };

  // 裁剪框拖拽（handle resize + frame move）
  let cropDrag = null;
  // 步骤 2 图片触屏状态
  let imgTouch = null;
  // 步骤 3 触屏/鼠标状态
  let alignDrag = null;

  // ── DOM 缓存 ──
  const $ = (id) => document.getElementById(id);
  let els = {};

  let toastTimer = null;
  function toast(msg) {
    const el = els.toast;
    if (!el) return;
    el.textContent = msg;
    el.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => (el.hidden = true), 2400);
  }

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

  function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }

  // 可靠地获取 wrapper 实际像素尺寸（使用 getBoundingClientRect）
  function getWrapperSize() {
    const rect = els.canvasWrapper.getBoundingClientRect();
    return { cw: Math.round(rect.width), ch: Math.round(rect.height) };
  }

  // ── 初始化 ──
  function init() {
    els = {
      tabBtns:          document.querySelectorAll('.tab-btn'),
      blueprintWorkspace: $('blueprint-workspace'),
      emptyState:       $('empty-state'),
      workspace:        $('workspace'),
      uploadZone:       $('bp-upload-zone'),
      imageInput:       $('bp-image-input'),
      canvasContainer:  $('bp-canvas-container'),
      canvasWrapper:    $('bp-canvas-wrapper'),
      canvas:           $('bp-canvas'),
      cropStage:        $('bp-crop-stage'),
      cropRect:         $('bp-crop-rect'),
      actionStep1:      $('bp-action-step1'),
      actionStep2:      $('bp-action-step2'),
      actionStep3:      $('bp-action-step3'),
      startCrop:        $('bp-start-crop'),
      confirmCrop:      $('bp-confirm-crop'),
      cancelCrop:       $('bp-cancel-crop'),
      resetImage:       $('bp-reset-image'),
      restart:          $('bp-restart'),
      toast:            $('toast'),
      gridW:            $('bp-grid-w'),
      gridH:            $('bp-grid-h'),
      generateGrid:     $('bp-generate-grid'),
      modeToggle:       $('bp-mode-toggle'),
      modeBtns:         document.querySelectorAll('.mode-btn'),
    };
    bindEvents();
    switchTab('cover');
  }

  // ── Tab 切换 ──
  function switchTab(tabName) {
    els.tabBtns.forEach((btn) =>
      btn.classList.toggle('active', btn.dataset.tab === tabName)
    );
    els.blueprintWorkspace.hidden = tabName !== 'blueprint';
    // 通过 main.app 控制封面 tab 的显隐，内部 empty/workspace 状态由 app.js 维持
    document.querySelector('.app').hidden = tabName !== 'cover';
    // 切回封面时重绘 canvas（display:none 恢复后 canvas 可能不会自动重绘）
    if (tabName === 'cover' && typeof render === 'function') render();
  }

  // ── 步骤控制 ──
  function setStep(step) {
    state.step = step;

    document.querySelectorAll('.bp-step').forEach((el) => {
      const n = Number(el.dataset.step);
      el.classList.remove('active', 'completed');
      if (n < step) el.classList.add('completed');
      if (n === step) el.classList.add('active');
    });

    els.actionStep1.hidden  = step !== 1;
    els.actionStep2.hidden  = step !== 2;
    els.actionStep3.hidden  = step !== 3;
    els.cropStage.hidden    = step !== 2;

    if (step === 2 && state.originalImage) {
      renderCanvas();
      initCropFrame();
    } else if (step === 3 && state.croppedImage) {
      requestAnimationFrame(() => renderAlignmentCanvas());
    }
  }

  // ════════════════════════════════════════
  //  步骤 1-2：上传 → 固定裁剪框
  // ════════════════════════════════════════

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
      state.imgPanX = 0;
      state.imgPanY = 0;
      state.imgZoom = fitImageZoom(img);

      els.uploadZone.hidden = true;
      els.canvasContainer.hidden = false;

      // 延迟一帧确保布局完成后再渲染，避免 canvas 尺寸取到 0
      requestAnimationFrame(() => setStep(2));
    } catch {
      toast('图片加载失败');
    }
  }

  function fitImageZoom(img) {
    const { cw, ch } = getWrapperSize();
    if (cw <= 0 || ch <= 0) return 1;
    // 默认让图片适配预览区（留边距），用户可双指放大
    return Math.min(cw / img.width, ch / img.height) * 0.85;
  }

  // ── 绘制图片（步骤 2） ──
  function renderCanvas() {
    const canvas = els.canvas;
    const img = state.originalImage;
    if (!img) return;

    const { cw, ch } = getWrapperSize();
    canvas.width = cw;
    canvas.height = ch;
    canvas.style.width = cw + 'px';
    canvas.style.height = ch + 'px';

    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#2a2a2a';
    ctx.fillRect(0, 0, cw, ch);

    ctx.save();
    ctx.translate(cw / 2 + state.imgPanX, ch / 2 + state.imgPanY);
    ctx.scale(state.imgZoom, state.imgZoom);
    ctx.drawImage(img, -img.width / 2, -img.height / 2);
    ctx.restore();
  }

  // ── 固定裁剪框 ──
  function initCropFrame() {
    const { cw, ch } = getWrapperSize();
    const margin = 0.1;
    state.cropFrame = {
      x: Math.round(cw * margin),
      y: Math.round(ch * margin),
      w: Math.round(cw * (1 - 2 * margin)),
      h: Math.round(ch * (1 - 2 * margin)),
    };
    updateCropFrame();
  }

  function updateCropFrame() {
    const f = state.cropFrame;
    const el = els.cropRect;
    if (!el) return;
    el.style.left = f.x + 'px';
    el.style.top = f.y + 'px';
    el.style.width = f.w + 'px';
    el.style.height = f.h + 'px';
  }

  // ════════════════════════════════════════
  //  步骤 2：裁剪框交互（手柄 resize + 框拖拽）
  // ════════════════════════════════════════

  function onCropFrameStart(e) {
    // 检查是否点到了手柄或裁剪框
    const handle = e.target.closest('.handle');
    const rectEl = e.target.closest('.crop-rect');
    if (!rectEl && !handle) return 'image';  // 点击到图片区域

    // 禁止框拖拽时触屏默认行为
    e.preventDefault();

    const wrapperRect = els.canvasWrapper.getBoundingClientRect();
    const mx = (e.clientX || e.touches[0].clientX) - wrapperRect.left;
    const my = (e.clientY || e.touches[0].clientY) - wrapperRect.top;

    cropDrag = {
      type: handle ? handle.dataset.handle : 'move',
      startX: mx,
      startY: my,
      frame: { ...state.cropFrame },
    };
    return 'frame';
  }

  function onCropFrameMove(mx, my) {
    if (!cropDrag) return;
    const dx = mx - cropDrag.startX;
    const dy = my - cropDrag.startY;
    const sf = cropDrag.frame;
    const { cw, ch } = getWrapperSize();
    let { x, y, w, h } = sf;

    switch (cropDrag.type) {
      case 'move':
        x = clamp(sf.x + dx, 0, cw - sf.w);
        y = clamp(sf.y + dy, 0, ch - sf.h);
        break;
      case 'se': w = sf.w + dx; h = sf.h + dy; break;
      case 'e':  w = sf.w + dx; break;
      case 's':  h = sf.h + dy; break;
      case 'nw': x = sf.x + dx; y = sf.y + dy; w = sf.w - dx; h = sf.h - dy; break;
      case 'n':  y = sf.y + dy; h = sf.h - dy; break;
      case 'w':  x = sf.x + dx; w = sf.w - dx; break;
      case 'ne': y = sf.y + dy; w = sf.w + dx; h = sf.h - dy; break;
      case 'sw': x = sf.x + dx; w = sf.w - dx; h = sf.h + dy; break;
    }

    // 最小尺寸
    w = Math.max(30, w);
    h = Math.max(30, h);

    // 裁切边界
    if (x + w > cw) { w = cw - x; }
    if (y + h > ch) { h = ch - y; }
    x = Math.max(0, x);
    y = Math.max(0, y);

    state.cropFrame = { x, y, w, h };
    updateCropFrame();
  }

  function onCropFrameEnd() { cropDrag = null; }

  // ════════════════════════════════════════
  //  步骤 2：图片触屏平移/缩放（裁剪框外区域）
  // ════════════════════════════════════════

  function onImgTouchStart(e) {
    imgTouch = null;
    const t = e.touches;
    if (t.length === 1) {
      imgTouch = {
        type: 'pan',
        x: t[0].clientX,
        y: t[0].clientY,
        panX: state.imgPanX,
        panY: state.imgPanY,
        frameX: state.cropFrame.x,
        frameY: state.cropFrame.y,
      };
    } else if (t.length === 2) {
      const dx = t[0].clientX - t[1].clientX;
      const dy = t[0].clientY - t[1].clientY;
      imgTouch = {
        type: 'zoom',
        dist: Math.hypot(dx, dy),
        zoom: state.imgZoom,
      };
    }
  }

  function onImgTouchMove(e) {
    if (!imgTouch) return;
    e.preventDefault();
    const t = e.touches;

    if (imgTouch.type === 'pan' && t.length === 1) {
      const dx = t[0].clientX - imgTouch.x;
      const dy = t[0].clientY - imgTouch.y;
      const { cw, ch } = getWrapperSize();
      state.imgPanX = imgTouch.panX + dx;
      state.imgPanY = imgTouch.panY + dy;
      state.cropFrame.x = clamp(imgTouch.frameX + dx, 0, cw - state.cropFrame.w);
      state.cropFrame.y = clamp(imgTouch.frameY + dy, 0, ch - state.cropFrame.h);
      renderCanvas();
      updateCropFrame();
    } else if (imgTouch.type === 'zoom' && t.length >= 2) {
      const dx = t[0].clientX - t[1].clientX;
      const dy = t[0].clientY - t[1].clientY;
      const nd = Math.hypot(dx, dy);
      state.imgZoom = clamp(imgTouch.zoom * (nd / imgTouch.dist), 0.05, 20);
      renderCanvas();
    }
  }

  function onImgTouchEnd(e) {
    if (e.touches.length === 0) imgTouch = null;
  }

  // ════════════════════════════════════════
  //  步骤 2：桌面端图片缩放（滚轮）和平移（拖拽）
  // ════════════════════════════════════════

  let imgMousePan = null;

  function onCanvasMouseDown(e) {
    if (state.step !== 2 || !state.originalImage) return;
    // 只忽略手柄（裁剪框内部通过 CSS pointer-events: none 穿透到 canvas）
    if (e.target.closest('.handle')) return;
    imgMousePan = {
      x: e.clientX, y: e.clientY,
      panX: state.imgPanX, panY: state.imgPanY,
      frameX: state.cropFrame.x, frameY: state.cropFrame.y,
    };
  }

  function onCanvasMouseMove(e) {
    // 步骤 2：图片平移（同时平移裁剪框，实现整体视图拖动）
    if (state.step === 2 && imgMousePan) {
      const dx = e.clientX - imgMousePan.x;
      const dy = e.clientY - imgMousePan.y;
      const { cw, ch } = getWrapperSize();
      state.imgPanX = imgMousePan.panX + dx;
      state.imgPanY = imgMousePan.panY + dy;
      state.cropFrame.x = clamp(imgMousePan.frameX + dx, 0, cw - state.cropFrame.w);
      state.cropFrame.y = clamp(imgMousePan.frameY + dy, 0, ch - state.cropFrame.h);
      renderCanvas();
      updateCropFrame();
      return;
    }
    // 步骤 3：对齐拖拽
    if (state.step === 3 && alignDrag) {
      const dx = e.clientX - alignDrag.x;
      const dy = e.clientY - alignDrag.y;
      if (state.currentMode === 'image') {
        state.imageOffX = alignDrag.imgOffX + dx;
        state.imageOffY = alignDrag.imgOffY + dy;
      } else {
        state.gridOffX = alignDrag.gridOffX + dx;
        state.gridOffY = alignDrag.gridOffY + dy;
      }
      renderAlignmentCanvas();
    }
  }

  function onCanvasMouseUp() {
    imgMousePan = null;
    alignDrag = null;
  }

  function onCanvasWheel(e) {
    if (state.step === 2 && state.originalImage) {
      e.preventDefault();
      const delta = -e.deltaY * 0.002;
      state.imgZoom = clamp(state.imgZoom + delta, 0.05, 20);
      renderCanvas();
      return;
    }
    if (state.step === 3 && state.croppedImage) {
      e.preventDefault();
      const delta = -e.deltaY * 0.002;
      if (state.currentMode === 'image') {
        state.imageScale = clamp(state.imageScale + delta, 0.05, 20);
      } else {
        state.gridScale = clamp(state.gridScale + delta, 0.05, 20);
      }
      renderAlignmentCanvas();
    }
  }

  // ════════════════════════════════════════
  //  步骤 2：裁剪框鼠标事件
  // ════════════════════════════════════════

  function onFrameMouseDown(e) {
    // 点击手柄进入裁剪框 resize 模式
    if (!e.target.closest('.handle')) return;
    if (onCropFrameStart(e) === 'frame') {
      // 阻止图片平移
      imgMousePan = null;
    }
  }

  // ════════════════════════════════════════
  //  步骤 2：裁剪框触屏事件
  // ════════════════════════════════════════

  function onFrameTouchStart(e) {
    if (e.touches.length !== 1) return;
    const target = e.target;
    if (!target.classList.contains('handle')) return;

    // 只处理手柄拖拽，忽略裁剪框内部触摸（穿透到 wrapper 实现整体平移）
    e.preventDefault();
    e.stopPropagation();

    const touch = e.touches[0];
    const ev = { clientX: touch.clientX, clientY: touch.clientY, target, preventDefault: () => e.preventDefault() };
    const action = onCropFrameStart(ev);
    if (action === 'frame') {
      imgTouch = null;
    }
  }

  function onFrameTouchMove(e) {
    if (!cropDrag || e.touches.length !== 1) return;
    const rect = els.canvasWrapper.getBoundingClientRect();
    onCropFrameMove(e.touches[0].clientX - rect.left, e.touches[0].clientY - rect.top);
  }

  function onFrameTouchEnd(e) {
    if (e.touches.length === 0) onCropFrameEnd();
  }

  // ════════════════════════════════════════
  //  确认裁剪 → 像素裁剪
  // ════════════════════════════════════════

  function handleConfirmCrop() {
    const frame = state.cropFrame;
    const { cw, ch } = getWrapperSize();
    const img = state.originalImage;

    // 裁剪框中心在屏幕坐标上的位置
    const fcx = frame.x + frame.w / 2;
    const fcy = frame.y + frame.h / 2;

    // 反向映射到图片坐标
    const imgCX = (fcx - cw / 2 - state.imgPanX) / state.imgZoom;
    const imgCY = (fcy - ch / 2 - state.imgPanY) / state.imgZoom;
    const cropW = frame.w / state.imgZoom;
    const cropH = frame.h / state.imgZoom;

    // 图片坐标系：原点在图片中心
    const left = imgCX - cropW / 2 + img.width / 2;
    const top  = imgCY - cropH / 2 + img.height / 2;
    const right = left + cropW;
    const bottom = top + cropH;

    const sx = Math.max(0, Math.round(left));
    const sy = Math.max(0, Math.round(top));
    const sw = Math.min(Math.round(right) - sx, img.width - sx);
    const sh = Math.min(Math.round(bottom) - sy, img.height - sy);

    if (sw < 1 || sh < 1) {
      toast('裁剪区域无效，请调整');
      return;
    }

    // 离屏 Canvas 裁剪
    const oc = document.createElement('canvas');
    oc.width = sw;
    oc.height = sh;
    const octx = oc.getContext('2d');
    octx.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);
    const dataUrl = oc.toDataURL();

    const cropped = new Image();
    cropped.onload = () => {
      state.croppedImage = cropped;
      state.gridGenerated = false;
      state.currentMode = 'image';
      state.imageOffX = 0;
      state.imageOffY = 0;
      state.imageScale = fitImageZoom(cropped);
      state.gridOffX = 0;
      state.gridOffY = 0;
      state.gridScale = 1;
      els.gridW.value = '';
      els.gridH.value = '';
      els.modeToggle.hidden = true;
      setStep(3);
    };
    cropped.src = dataUrl;
  }

  // ════════════════════════════════════════
  //  步骤 3：渲染 —— 裁剪图 + 网格
  // ════════════════════════════════════════

  function renderAlignmentCanvas() {
    const canvas = els.canvas;
    const img = state.croppedImage;
    if (!img) return;

    const { cw, ch } = getWrapperSize();
    if (cw <= 0 || ch <= 0) return;

    canvas.width = cw;
    canvas.height = ch;
    canvas.style.width = cw + 'px';
    canvas.style.height = ch + 'px';

    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, cw, ch);

    // 1) 绘制图纸（限制偏移，确保不消失）
    const dispW = img.width * state.imageScale;
    const dispH = img.height * state.imageScale;
    const maxOffX = Math.abs((dispW - cw) / 2) + 20;
    const maxOffY = Math.abs((dispH - ch) / 2) + 20;
    state.imageOffX = clamp(state.imageOffX, -maxOffX, maxOffX);
    state.imageOffY = clamp(state.imageOffY, -maxOffY, maxOffY);

    ctx.save();
    const icx = cw / 2 + state.imageOffX;
    const icy = ch / 2 + state.imageOffY;
    ctx.translate(icx, icy);
    ctx.scale(state.imageScale, state.imageScale);
    ctx.drawImage(img, -img.width / 2, -img.height / 2);
    ctx.restore();

    // 2) 绘制网格
    if (state.gridGenerated && state.gridW > 0 && state.gridH > 0) {
      drawGrid(ctx, cw, ch);
    }
  }

  function drawGrid(ctx, cw, ch) {
    const { gridW, gridH, gridOffX, gridOffY, gridScale } = state;
    const cellSize = Math.min(cw / gridW, ch / gridH) * gridScale;
    const gridPixelW = cellSize * gridW;
    const gridPixelH = cellSize * gridH;
    const gcx = cw / 2 + gridOffX;
    const gcy = ch / 2 + gridOffY;
    const gx0 = gcx - gridPixelW / 2;
    const gy0 = gcy - gridPixelH / 2;

    ctx.save();
    ctx.strokeStyle = '#ff2442';
    ctx.lineWidth = 1.5;

    for (let i = 0; i <= gridW; i++) {
      const x = gx0 + i * cellSize;
      ctx.beginPath();
      ctx.moveTo(x, gy0);
      ctx.lineTo(x, gy0 + gridPixelH);
      ctx.stroke();
    }
    for (let i = 0; i <= gridH; i++) {
      const y = gy0 + i * cellSize;
      ctx.beginPath();
      ctx.moveTo(gx0, y);
      ctx.lineTo(gx0 + gridPixelW, y);
      ctx.stroke();
    }
    ctx.restore();
  }

  // ── 生成网格 ──
  function handleGenerateGrid() {
    const w = parseInt(els.gridW.value, 10);
    const h = parseInt(els.gridH.value, 10);
    if (!w || !h || w < 1 || h < 1) {
      toast('请输入有效的格子数');
      return;
    }

    if (state.gridGenerated) {
      // 重新生成时，保持已有格子的实际像素大小不变，
      // 并且网格左上角位置固定，格数变化时往右/下扩展
      const { cw, ch } = getWrapperSize();
      if (cw > 0 && ch > 0) {
        const oldCellPx = Math.min(cw / state.gridW, ch / state.gridH) * state.gridScale;

        // 计算当前网格的左上角坐标
        const oldPixelW = oldCellPx * state.gridW;
        const oldPixelH = oldCellPx * state.gridH;
        const anchorX = (cw / 2 + state.gridOffX) - oldPixelW / 2;
        const anchorY = (ch / 2 + state.gridOffY) - oldPixelH / 2;

        // 更新缩放，保持格子像素大小
        const newBaseCell = Math.min(cw / w, ch / h);
        state.gridScale = oldCellPx / newBaseCell;

        // 重算偏移，使新网格左上角锚定在原位置
        const newPixelW = oldCellPx * w;
        const newPixelH = oldCellPx * h;
        state.gridOffX = anchorX + newPixelW / 2 - cw / 2;
        state.gridOffY = anchorY + newPixelH / 2 - ch / 2;
      }
    } else {
      state.gridOffX = 0;
      state.gridOffY = 0;
      state.gridScale = 1;
    }
    state.gridW = w;
    state.gridH = h;
    state.gridGenerated = true;
    state.currentMode = 'image';
    els.modeToggle.hidden = false;
    updateModeButtons();
    renderAlignmentCanvas();
  }

  // ── 模式切换 ──
  function switchMode(mode) {
    state.currentMode = mode;
    updateModeButtons();
  }

  function updateModeButtons() {
    els.modeBtns.forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.mode === state.currentMode);
    });
  }

  // ════════════════════════════════════════
  //  步骤 3：触屏手势
  // ════════════════════════════════════════

  function onAlignTouchStart(e) {
    e.preventDefault();
    const t = e.touches;
    if (t.length === 1) {
      alignDrag = {
        type: 'drag',
        x: t[0].clientX, y: t[0].clientY,
        imgOffX: state.imageOffX, imgOffY: state.imageOffY,
        gridOffX: state.gridOffX, gridOffY: state.gridOffY,
      };
    } else if (t.length === 2) {
      const dx = t[0].clientX - t[1].clientX;
      const dy = t[0].clientY - t[1].clientY;
      alignDrag = {
        type: 'pinch',
        dist: Math.hypot(dx, dy),
        imgScale: state.imageScale,
        gridScale: state.gridScale,
      };
    }
  }

  function onAlignTouchMove(e) {
    if (!alignDrag) return;
    e.preventDefault();
    const t = e.touches;

    if (alignDrag.type === 'drag' && t.length === 1) {
      const dx = t[0].clientX - alignDrag.x;
      const dy = t[0].clientY - alignDrag.y;
      if (state.currentMode === 'image') {
        state.imageOffX = alignDrag.imgOffX + dx;
        state.imageOffY = alignDrag.imgOffY + dy;
      } else {
        state.gridOffX = alignDrag.gridOffX + dx;
        state.gridOffY = alignDrag.gridOffY + dy;
      }
      renderAlignmentCanvas();
    } else if (alignDrag.type === 'pinch' && t.length >= 2) {
      const dx = t[0].clientX - t[1].clientX;
      const dy = t[0].clientY - t[1].clientY;
      const nd = Math.hypot(dx, dy);
      const ratio = nd / alignDrag.dist;
      if (state.currentMode === 'image') {
        state.imageScale = clamp(alignDrag.imgScale * ratio, 0.05, 20);
      } else {
        state.gridScale = clamp(alignDrag.gridScale * ratio, 0.05, 20);
      }
      alignDrag.dist = nd;
      alignDrag.imgScale = state.imageScale;
      alignDrag.gridScale = state.gridScale;
      renderAlignmentCanvas();
    }
  }

  function onAlignTouchEnd(e) {
    if (e.touches.length === 0) {
      alignDrag = null;
    } else if (e.touches.length === 1 && alignDrag && alignDrag.type === 'pinch') {
      alignDrag = {
        type: 'drag',
        x: e.touches[0].clientX, y: e.touches[0].clientY,
        imgOffX: state.imageOffX, imgOffY: state.imageOffY,
        gridOffX: state.gridOffX, gridOffY: state.gridOffY,
      };
    }
  }

  // ── 步骤 3 鼠标拖拽（桌面端） ──
  function onAlignMouseDown(e) {
    if (state.step !== 3 || !state.croppedImage) return;
    alignDrag = {
      type: 'drag',
      x: e.clientX, y: e.clientY,
      imgOffX: state.imageOffX, imgOffY: state.imageOffY,
      gridOffX: state.gridOffX, gridOffY: state.gridOffY,
    };
  }

  // ════════════════════════════════════════
  //  重置
  // ════════════════════════════════════════

  function resetImage() {
    state.originalImage = null;
    state.originalWidth = 0;
    state.originalHeight = 0;
    state.croppedImage = null;
    state.cropFrame = { x: 0, y: 0, w: 0, h: 0 };
    state.imgPanX = 0;
    state.imgPanY = 0;
    state.imgZoom = 1;
    state.gridGenerated = false;
    state.imageOffX = 0;
    state.imageOffY = 0;
    state.imageScale = 1;
    state.gridOffX = 0;
    state.gridOffY = 0;
    state.gridScale = 1;
    cropDrag = null;
    imgTouch = null;
    alignDrag = null;
    imgMousePan = null;

    els.uploadZone.hidden = false;
    els.canvasContainer.hidden = true;
    els.modeToggle.hidden = true;

    setStep(1);
  }

  function restart() { resetImage(); }

  // ════════════════════════════════════════
  //  事件绑定
  // ════════════════════════════════════════

  function bindEvents() {
    // Tab
    els.tabBtns.forEach((btn) =>
      btn.addEventListener('click', () => switchTab(btn.dataset.tab))
    );

    // 上传
    els.uploadZone.addEventListener('click', () => els.imageInput.click());
    els.imageInput.addEventListener('change', (e) => {
      if (e.target.files[0]) handleImageUpload(e.target.files[0]);
    });
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

    // 步骤 1
    els.startCrop.addEventListener('click', () => {
      if (!state.originalImage) { toast('请先上传图片'); return; }
      requestAnimationFrame(() => setStep(2));
    });
    els.resetImage.addEventListener('click', resetImage);

    // 步骤 2：裁剪
    els.confirmCrop.addEventListener('click', handleConfirmCrop);
    els.cancelCrop.addEventListener('click', resetImage);

    // 步骤 3：网格
    els.generateGrid.addEventListener('click', handleGenerateGrid);
    els.modeBtns.forEach((btn) =>
      btn.addEventListener('click', () => switchMode(btn.dataset.mode))
    );
    els.restart.addEventListener('click', restart);

    // ── 步骤 2：裁剪框事件（mouse + touch） ──
    els.cropRect.addEventListener('mousedown', onFrameMouseDown);
    els.cropRect.addEventListener('touchstart', onFrameTouchStart, { passive: false });
    els.cropRect.addEventListener('touchmove', onFrameTouchMove, { passive: false });
    els.cropRect.addEventListener('touchend', onFrameTouchEnd);

    // ── 步骤 2：图片交互 ──
    // 触屏：两指缩放 / 单指平移
    els.canvasWrapper.addEventListener('touchstart', (e) => {
      if (state.step !== 2) return;
      onImgTouchStart(e);
    }, { passive: false });
    els.canvasWrapper.addEventListener('touchmove', (e) => {
      if (state.step !== 2) return;
      // cropDrag 非空说明正在拖拽手柄，由 onFrameTouchMove 处理
      if (cropDrag) return;
      onImgTouchMove(e);
    }, { passive: false });
    els.canvasWrapper.addEventListener('touchend', onImgTouchEnd);

    // ── 步骤 2：桌面端 ──
    els.canvas.addEventListener('mousedown', onCanvasMouseDown);
    els.canvas.addEventListener('wheel', (e) => {
      if (state.step === 2) onCanvasWheel(e);
    }, { passive: false });

    // ── 步骤 3：触屏对齐 ──
    els.canvasWrapper.addEventListener('touchstart', (e) => {
      if (state.step === 3) onAlignTouchStart(e);
    }, { passive: false });
    els.canvasWrapper.addEventListener('touchmove', (e) => {
      if (state.step === 3) onAlignTouchMove(e);
    }, { passive: false });
    els.canvasWrapper.addEventListener('touchend', (e) => {
      if (state.step === 3) onAlignTouchEnd(e);
    });

    // ── 步骤 3：鼠标对齐 + 滚轮 ──
    els.canvas.addEventListener('mousedown', (e) => {
      if (state.step === 3) onAlignMouseDown(e);
    });
    els.canvas.addEventListener('wheel', (e) => {
      if (state.step === 3) onCanvasWheel(e);
    }, { passive: false });

    // ── 全局 ──
    window.addEventListener('mousemove', onCanvasMouseMove);
    window.addEventListener('mouseup', onCanvasMouseUp);
  }

  // ════════════════════════════════════════
  //  启动
  // ════════════════════════════════════════

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  return { switchTab };
})();
