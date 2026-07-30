/**
 * 图纸尺寸识别 - Blueprint 模块
 * 流程：导入图片 → 裁剪图纸(固定框+图片缩放) → 输入格子数→生成网格→触屏对齐验证
 */
const BlueprintApp = (() => {
  // ── 状态 ──
  let state = {
    step: 1,
    originalImage: null,
    originalDataUrl: null,
    originalWidth: 0,
    originalHeight: 0,
    croppedImage: null,
    croppedDataUrl: null,

    // 步骤 2 —— 固定裁剪框（屏幕坐标，相对 canvas-wrapper）
    cropFrame: { x: 0, y: 0, w: 0, h: 0 },
    imgPanX: 0,
    imgPanY: 0,
    imgZoom: 1,

    // 步骤 3 —— 网格对齐
    gridW: 0,
    gridH: 0,
    gridGenerated: false,
    currentMode: 'image',       // 'image' | 'grid' | 'all'
    imageOffX: 0,
    imageOffY: 0,
    imageScale: 1,
    gridOffX: 0,
    gridOffY: 0,
    gridScale: 1,

    // 步骤 4 —— 创作（在网格上涂色）
    gridPaint: {},              // key "row,col" → beadColor id
    craftTool: 'paint',         // 'paint' | 'pick' | 'erase'
    activeColorId: 'A01',
    previewMode: false,
  };

  // 裁剪框拖拽（handle resize + frame move）
  let cropDrag = null;
  // 步骤 2 图片触屏状态
  let imgTouch = null;
  // 步骤 3 触屏/鼠标状态
  let alignDrag = null;
  // 步骤 4 涂色拖拽状态
  let craftDrag = null;
  // 步骤 4 撤销栈（每个笔画前的 gridPaint 快照）
  let paintHistory = [];

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

  // ── localStorage 缓存 ──
  const LS_BP_STATE = 'blueprintState';

  function saveCache() {
    if (!state.originalImage) return;  // 没上传图片就不缓存
    try {
      const persist = { ...state };
      delete persist.originalImage;
      delete persist.croppedImage;
      localStorage.setItem(LS_BP_STATE, JSON.stringify(persist));
    } catch (e) { /* 存储满，静默忽略 */ }
  }

  function saveCacheDebounced() {
    clearTimeout(saveCacheDebounced._t);
    saveCacheDebounced._t = setTimeout(saveCache, 300);
  }

  function clearCache() {
    localStorage.removeItem(LS_BP_STATE);
  }

  async function loadCache() {
    const raw = localStorage.getItem(LS_BP_STATE);
    if (!raw) return false;
    try {
      const saved = JSON.parse(raw);
      if (!saved.step || saved.step < 2 || saved.step > 4) return false;
      if (!saved.originalDataUrl) return false;

      // 恢复状态（不含 Image 对象）
      Object.assign(state, saved);

      // 从 dataURL 恢复图片
      state.originalImage = await loadImage(saved.originalDataUrl);
      if (saved.croppedDataUrl) {
        state.croppedImage = await loadImage(saved.croppedDataUrl);
      }

      return true;
    } catch {
      return false;
    }
  }

  // ── 初始化 ──
  let _pendingRestore = false;

  async function init() {
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
      startCraft:       $('bp-start-craft'),
      actionStep4:      $('bp-action-step4'),
      craftBtns:        document.querySelectorAll('.craft-btn'),
      currentSwatch:    $('bp-current-swatch'),
      currentId:        $('bp-current-id'),
      currentColor:     $('bp-current-color'),
      palette:          $('bp-palette'),
      paletteModal:     $('bp-palette-modal'),
      paletteClose:     $('bp-palette-close'),
      undo:             $('bp-undo'),
      resetModal:       $('bp-reset-modal'),
      resetCancel:      $('bp-reset-cancel'),
      resetConfirm:     $('bp-reset-confirm'),
      backToAlign:      $('bp-back-to-align'),
      restart2:         $('bp-restart2'),
      previewBtn:       $('bp-preview'),
      exportBtn:        $('bp-export'),
    };
    bindEvents();

    // 恢复缓存（仅恢复数据，等切换到 blueprint tab 时再渲染 UI）
    const restored = await loadCache();
    if (restored) {
      _pendingRestore = true;
      els.uploadZone.hidden = true;
      els.canvasContainer.hidden = false;
    }

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

    // 切换到 blueprint 时，如果有缓存的会话需要恢复，延迟一帧等布局完成
    if (tabName === 'blueprint' && _pendingRestore) {
      _pendingRestore = false;
      requestAnimationFrame(() => {
        if (state.step === 2 && state.originalImage) {
          // 重置 pan/zoom，因为 cropFrame 会被 initCropFrame 重新计算
          state.imgPanX = 0;
          state.imgPanY = 0;
          state.imgZoom = fitImageZoom(state.originalImage);
          setStep(2);
        } else if (state.step === 3 && state.croppedImage) {
          els.gridW.value = state.gridW || '';
          els.gridH.value = state.gridH || '';
          els.modeToggle.hidden = !state.gridGenerated;
          els.startCraft.hidden = !state.gridGenerated;
          updateModeButtons();
          setStep(3);
        } else if (state.step === 4 && state.croppedImage) {
          els.gridW.value = state.gridW || '';
          els.gridH.value = state.gridH || '';
          els.modeToggle.hidden = !state.gridGenerated;
          els.startCraft.hidden = !state.gridGenerated;
          setStep(4);
        }
      });
    }
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
    els.actionStep4.hidden  = step !== 4;
    els.cropStage.hidden    = step !== 2;

    if (step === 2 && state.originalImage) {
      renderCanvas();
      initCropFrame();
    } else if (step === 3 && state.croppedImage) {
      els.startCraft.hidden = !state.gridGenerated;
      requestAnimationFrame(() => renderAlignmentCanvas());
    } else if (step === 4 && state.croppedImage) {
      ensurePaletteBuilt();
      updateCraftToolButtons();
      updateCurrentColorDisplay();
      updatePreviewButton();
      requestAnimationFrame(() => renderCreationCanvas());
    }

    saveCache();
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
      state.originalDataUrl = dataUrl;
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
    ctx.imageSmoothingEnabled = false;
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
    state.cropFrame = { x: 0, y: 0, w: cw, h: ch };
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
    let { x, y, w, h } = sf;

    switch (cropDrag.type) {
      case 'move':
        x = sf.x + dx;
        y = sf.y + dy;
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
      state.imgPanX = imgTouch.panX + dx;
      state.imgPanY = imgTouch.panY + dy;
      state.cropFrame.x = imgTouch.frameX + dx;
      state.cropFrame.y = imgTouch.frameY + dy;
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
    if (e.touches.length === 0) { imgTouch = null; saveCache(); }
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
    // 步骤 4：涂色拖拽
    if (state.step === 4 && craftDrag) {
      onCraftMove(e.clientX, e.clientY);
      return;
    }
    // 步骤 2：图片平移（同时平移裁剪框，实现整体视图拖动）
    if (state.step === 2 && imgMousePan) {
      const dx = e.clientX - imgMousePan.x;
      const dy = e.clientY - imgMousePan.y;
      state.imgPanX = imgMousePan.panX + dx;
      state.imgPanY = imgMousePan.panY + dy;
      state.cropFrame.x = imgMousePan.frameX + dx;
      state.cropFrame.y = imgMousePan.frameY + dy;
      renderCanvas();
      updateCropFrame();
      return;
    }
    // 步骤 2：裁剪框拖拽（手柄 resize / 框移动）
    if (state.step === 2 && cropDrag) {
      const rect = els.canvasWrapper.getBoundingClientRect();
      onCropFrameMove(e.clientX - rect.left, e.clientY - rect.top);
      return;
    }
    // 步骤 3：对齐拖拽
    if (state.step === 3 && alignDrag) {
      const dx = e.clientX - alignDrag.x;
      const dy = e.clientY - alignDrag.y;
      if (state.currentMode === 'image') {
        state.imageOffX = alignDrag.imgOffX + dx;
        state.imageOffY = alignDrag.imgOffY + dy;
      } else if (state.currentMode === 'grid') {
        state.gridOffX = alignDrag.gridOffX + dx;
        state.gridOffY = alignDrag.gridOffY + dy;
      } else {
        state.imageOffX = alignDrag.imgOffX + dx;
        state.imageOffY = alignDrag.imgOffY + dy;
        state.gridOffX = alignDrag.gridOffX + dx;
        state.gridOffY = alignDrag.gridOffY + dy;
      }
      renderAlignmentCanvas();
    }
  }

  function onCanvasMouseUp() {
    // 步骤 4：结束涂色
    if (state.step === 4) {
      onCraftEnd();
      return;
    }
    imgMousePan = null;
    alignDrag = null;
    onCropFrameEnd();
    saveCache();
  }

  function onCanvasWheel(e) {
    if (state.step === 2 && state.originalImage) {
      e.preventDefault();
      const delta = -e.deltaY * 0.002;
      state.imgZoom = clamp(state.imgZoom + delta, 0.05, 20);
      renderCanvas();
      saveCacheDebounced();
      return;
    }
    if (state.step === 3 && state.croppedImage) {
      e.preventDefault();
      const delta = -e.deltaY * 0.002;
      if (state.currentMode === 'image') {
        state.imageScale = clamp(state.imageScale + delta, 0.05, 20);
      } else if (state.currentMode === 'grid') {
        state.gridScale = clamp(state.gridScale + delta, 0.05, 20);
      } else {
        const factor = 1 + delta;
        const newImgS = clamp(state.imageScale * factor, 0.05, 200);
        const newGrdS = clamp(state.gridScale * factor, 0.05, 200);
        const f = Math.min(newImgS / state.imageScale, newGrdS / state.gridScale);
        state.imageScale = clamp(state.imageScale * f, 0.05, 200);
        state.gridScale = clamp(state.gridScale * f, 0.05, 200);
        const midX = (state.imageOffX + state.gridOffX) / 2;
        const midY = (state.imageOffY + state.gridOffY) / 2;
        state.imageOffX = midX + (state.imageOffX - midX) * f;
        state.imageOffY = midY + (state.imageOffY - midY) * f;
        state.gridOffX = midX + (state.gridOffX - midX) * f;
        state.gridOffY = midY + (state.gridOffY - midY) * f;
      }
      renderAlignmentCanvas();
      saveCacheDebounced();
    }
    if (state.step === 4 && state.craftTool === "move") {
      e.preventDefault();
      const delta = -e.deltaY * 0.002;
      const factor = 1 + delta;
      const newImgS = clamp(state.imageScale * factor, 0.05, 200);
      const newGrdS = clamp(state.gridScale * factor, 0.05, 200);
      const f = Math.min(newImgS / state.imageScale, newGrdS / state.gridScale);
      state.imageScale = clamp(state.imageScale * f, 0.05, 200);
      state.gridScale = clamp(state.gridScale * f, 0.05, 200);
      const midX = (state.imageOffX + state.gridOffX) / 2;
      const midY = (state.imageOffY + state.gridOffY) / 2;
      state.imageOffX = midX + (state.imageOffX - midX) * f;
      state.imageOffY = midY + (state.imageOffY - midY) * f;
      state.gridOffX = midX + (state.gridOffX - midX) * f;
      state.gridOffY = midY + (state.gridOffY - midY) * f;
      renderCreationCanvas();
      saveCacheDebounced();
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
    if (e.touches.length === 0) { onCropFrameEnd(); saveCache(); }
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
    octx.imageSmoothingEnabled = false;
    octx.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);
    const dataUrl = oc.toDataURL();

    const cropped = new Image();
    cropped.onload = () => {
      state.croppedImage = cropped;
      state.croppedDataUrl = dataUrl;
      state.gridGenerated = false;
      state.currentMode = 'image';
      state.imageOffX = 0;
      state.imageOffY = 0;
      state.imageScale = fitImageZoom(cropped);
      state.gridOffX = 0;
      state.gridOffY = 0;
      state.gridScale = 1;
      // 新裁剪图：清空旧的涂色与取色缓存
      state.gridPaint = {};
      state.craftTool = 'paint';
      _imageSampleCanvas = null;
      paintHistory = [];
      els.gridW.value = '';
      els.gridH.value = '';
      els.modeToggle.hidden = true;
      els.startCraft.hidden = true;
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

    const ctx = setupCanvas(canvas, cw, ch);
    drawImageAndGrid(ctx, cw, ch);
  }

  // 初始化 canvas 尺寸并清空（步骤 3/4 共用）
  function setupCanvas(canvas, cw, ch) {
    canvas.width = cw;
    canvas.height = ch;
    canvas.style.width = cw + 'px';
    canvas.style.height = ch + 'px';
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, cw, ch);
    return ctx;
  }

  // 画图纸 + 网格（步骤 3/4 共用）
  function drawImageAndGrid(ctx, cw, ch) {
    const img = state.croppedImage;
    if (!img) return;

    ctx.save();
    const icx = cw / 2 + state.imageOffX;
    const icy = ch / 2 + state.imageOffY;
    ctx.translate(icx, icy);
    ctx.scale(state.imageScale, state.imageScale);
    ctx.drawImage(img, -img.width / 2, -img.height / 2);
    ctx.restore();

    if (state.gridGenerated && state.gridW > 0 && state.gridH > 0) {
      drawGrid(ctx, cw, ch);
    }
  }

  // 网格几何（cellSize / 左上角 gx0,gy0 / 总像素宽高），drawGrid / 涂色 / 命中检测共用
  function getGridGeometry(cw, ch) {
    const { gridW, gridH, gridOffX, gridOffY, gridScale } = state;
    const cellSize = Math.min(cw / gridW, ch / gridH) * gridScale;
    const gridPixelW = cellSize * gridW;
    const gridPixelH = cellSize * gridH;
    const gcx = cw / 2 + gridOffX;
    const gcy = ch / 2 + gridOffY;
    const gx0 = gcx - gridPixelW / 2;
    const gy0 = gcy - gridPixelH / 2;
    return { cellSize, gridPixelW, gridPixelH, gx0, gy0 };
  }

  function drawGrid(ctx, cw, ch, color) {
    const { gridW, gridH } = state;
    const { cellSize, gridPixelW, gridPixelH, gx0, gy0 } = getGridGeometry(cw, ch);

    ctx.save();
    ctx.strokeStyle = color || '#ff2442';
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

  // ── 步骤 4：渲染（图纸 + 网格 + 涂色层） ──
  function renderCreationCanvas() {
    const canvas = els.canvas;
    const img = state.croppedImage;
    if (!img) return;

    const { cw, ch } = getWrapperSize();
    if (cw <= 0 || ch <= 0) return;

    const ctx = setupCanvas(canvas, cw, ch);

    if (state.previewMode) {
      // 预览模式：白色背景 + 涂色色块（无底图、无网格）
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, cw, ch);
      drawPaintedCells(ctx, cw, ch);
    } else {
      drawImageAndGrid(ctx, cw, ch);
      drawPaintedCells(ctx, cw, ch);
      // 只在已涂色格子区域覆盖绿色网格线
      {
        const { cellSize, gx0, gy0 } = getGridGeometry(cw, ch);
        ctx.save();
        ctx.beginPath();
        for (const key in state.gridPaint) {
          const [r, col] = key.split(",").map(Number);
          ctx.rect(gx0 + col * cellSize, gy0 + r * cellSize, cellSize, cellSize);
        }
        ctx.clip();
        drawGrid(ctx, cw, ch, '#2ecc40');
        ctx.restore();
      }
    }
  }

  // 绘制已涂色格子（不透明色块 + 边框标记）
  function drawPaintedCells(ctx, cw, ch) {
    const { cellSize, gx0, gy0 } = getGridGeometry(cw, ch);
    if (cellSize <= 0) return;
    const colorMap = buildColorIdMap();
    const pad = Math.max(0, cellSize * 0.04);

    ctx.save();
    for (const key in state.gridPaint) {
      const id = state.gridPaint[key];
      const c = colorMap[id];
      if (!c) continue;
      const [r, col] = key.split(",").map(Number);
      const x = gx0 + col * cellSize + pad;
      const y = gy0 + r * cellSize + pad;
      const s = cellSize - pad * 2;
      // 不透明填充
      ctx.fillStyle = c.hex;
      ctx.fillRect(x, y, s, s);
      // 深色边框标记已涂色格子
      ctx.strokeStyle = "rgba(0,0,0,0.25)";
      ctx.lineWidth = 1;
      ctx.strokeRect(x, y, s, s);
    }
    ctx.restore();
  }
  // ════════════════════════════════════════
  //  步骤 4：创作（涂色 / 吸色 / 橡皮）
  // ════════════════════════════════════════

  // beadColor id → 颜色对象 的映射（静态，构建一次）
  let _colorIdMap = null;
  function buildColorIdMap() {
    if (_colorIdMap) return _colorIdMap;
    _colorIdMap = {};
    if (typeof BEAD_PALETTE !== 'undefined') {
      for (const c of BEAD_PALETTE) _colorIdMap[c.id] = c;
    }
    return _colorIdMap;
  }

  // 取色用离屏 canvas（裁剪图原始分辨率），按 dataUrl 复用
  let _imageSampleCanvas = null;
  function ensureImageSampleCanvas() {
    const img = state.croppedImage;
    if (!img) return null;
    if (_imageSampleCanvas && _imageSampleCanvas._src === state.croppedDataUrl) {
      return _imageSampleCanvas;
    }
    const c = document.createElement('canvas');
    c.width = img.width;
    c.height = img.height;
    const ctx = c.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(img, 0, 0);
    c._src = state.croppedDataUrl;
    _imageSampleCanvas = c;
    return c;
  }

  // ── 调色板 ──
  let _paletteBuilt = false;
  function ensurePaletteBuilt() {
    if (_paletteBuilt) return;
    buildPalette();
    _paletteBuilt = true;
  }

  function buildPalette() {
    const container = els.palette;
    if (!container) return;
    container.innerHTML = '';
    if (typeof BEAD_PALETTE === 'undefined') return;

    // 按首字母分组，保持出现顺序
    const groups = {};
    const order = [];
    for (const c of BEAD_PALETTE) {
      const g = c.id.charAt(0);
      if (!groups[g]) { groups[g] = []; order.push(g); }
      groups[g].push(c);
    }

    for (const g of order) {
      const groupEl = document.createElement('div');
      groupEl.className = 'bp-palette-group';

      const title = document.createElement('div');
      title.className = 'bp-palette-group-title';
      title.textContent = g;

      const row = document.createElement('div');
      row.className = 'bp-palette-row';
      for (const c of groups[g]) {
        const sw = document.createElement('button');
        sw.className = 'bp-swatch';
        sw.dataset.id = c.id;
        sw.style.background = c.hex;
        sw.title = c.id;
        sw.addEventListener('click', () => {
          state.activeColorId = c.id;
          updateCurrentColorDisplay();
          renderPaletteActive();
          saveCache();
          closePaletteModal();
        });
        row.appendChild(sw);
      }

      groupEl.appendChild(title);
      groupEl.appendChild(row);
      container.appendChild(groupEl);
    }
    renderPaletteActive();
  }

  function renderPaletteActive() {
    const id = state.activeColorId;
    if (!els.palette) return;
    els.palette.querySelectorAll('.bp-swatch').forEach((sw) => {
      sw.classList.toggle('active', sw.dataset.id === id);
    });
  }

  function updateCurrentColorDisplay() {
    const c = buildColorIdMap()[state.activeColorId];
    if (c) {
      els.currentSwatch.style.background = c.hex;
      els.currentId.textContent = c.id;
    } else {
      els.currentSwatch.style.background = '#ccc';
      els.currentId.textContent = '—';
    }
  }

  function updateCraftToolButtons() {
    els.craftBtns.forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.craft === state.craftTool);
    });
  }

  function switchCraftTool(tool) {
    state.craftTool = tool;
    craftDrag = null;
    updateCraftToolButtons();
    saveCache();
  }

  function openPaletteModal() {
    ensurePaletteBuilt();
    els.paletteModal.hidden = false;
  }

  function closePaletteModal() {
    els.paletteModal.hidden = true;
  }

  function openResetModal() {
    els.resetModal.hidden = false;
  }

  function closeResetModal() {
    els.resetModal.hidden = true;
  }

  function confirmReset() {
    closeResetModal();
    restart();
  }

  // ── 命中检测：屏幕坐标 → 格子 ──
  function pointerCellHit(clientX, clientY) {
    const rect = els.canvasWrapper.getBoundingClientRect();
    const x = clientX - rect.left;
    const y = clientY - rect.top;
    const { cw, ch } = getWrapperSize();
    return cellAtCanvas(x, y, cw, ch);
  }

  // canvas 坐标 → 命中的格子，越界返回 null
  function cellAtCanvas(x, y, cw, ch) {
    if (!state.gridGenerated || state.gridW <= 0 || state.gridH <= 0) return null;
    const { cellSize, gx0, gy0 } = getGridGeometry(cw, ch);
    if (cellSize <= 0) return null;
    const col = Math.floor((x - gx0) / cellSize);
    const row = Math.floor((y - gy0) / cellSize);
    if (col < 0 || col >= state.gridW || row < 0 || row >= state.gridH) return null;
    return { row, col };
  }

  // 用当前工具作用于一个格子，返回是否发生变化
  function applyCraftToCell(row, col) {
    const key = row + ',' + col;
    if (state.craftTool === 'paint') {
      if (state.gridPaint[key] === state.activeColorId) return false;
      state.gridPaint[key] = state.activeColorId;
      return true;
    }
    if (state.craftTool === 'erase') {
      if (!(key in state.gridPaint)) return false;
      delete state.gridPaint[key];
      return true;
    }
    return false;
  }

  // ── 涂色 / 橡皮 / 移动（拖拽） ──
  function onCraftStart(clientX, clientY) {
    // 吸色：单击取色，不进入拖拽
    if (state.craftTool === 'pick') {
      pickCellAt(clientX, clientY);
      return;
    }
    // 移动：整体平移图纸 + 网格（保持两者相对对齐）
    if (state.craftTool === 'move') {
      craftDrag = {
        type: 'move',
        startX: clientX, startY: clientY,
        imgOffX: state.imageOffX, imgOffY: state.imageOffY,
        gridOffX: state.gridOffX, gridOffY: state.gridOffY,
      };
      return;
    }
    // 涂色 / 橡皮：进入笔画（记录撤销快照）
    const hit = pointerCellHit(clientX, clientY);
    if (!hit) return;
    craftDrag = {
      type: 'stroke',
      lastKey: null,
      preSnapshot: deepCopyPaint(),
      pushed: false,
    };
    strokeApply(hit.row, hit.col);
  }

  function onCraftMove(clientX, clientY) {
    if (!craftDrag) return;
    if (craftDrag.type === 'move') {
      const dx = clientX - craftDrag.startX;
      const dy = clientY - craftDrag.startY;
      state.imageOffX = craftDrag.imgOffX + dx;
      state.imageOffY = craftDrag.imgOffY + dy;
      state.gridOffX = craftDrag.gridOffX + dx;
      state.gridOffY = craftDrag.gridOffY + dy;
      renderCreationCanvas();
      return;
    }
    if (craftDrag.type === 'stroke') {
      const hit = pointerCellHit(clientX, clientY);
      if (!hit) return;
      strokeApply(hit.row, hit.col);
    }
  }

  // 笔画内：涂/擦一个格子，首次有效改动时压入撤销快照
  function strokeApply(row, col) {
    const key = row + ',' + col;
    if (key === craftDrag.lastKey) return;
    craftDrag.lastKey = key;
    const changed = applyCraftToCell(row, col);
    if (changed && !craftDrag.pushed) {
      paintHistory.push(craftDrag.preSnapshot);
      craftDrag.pushed = true;
      if (paintHistory.length > 50) paintHistory.shift();
    }
    if (changed) renderCreationCanvas();
  }

  function onCraftEnd() {
    if (craftDrag) {
      if (craftDrag.type === 'move' || craftDrag.pushed) saveCache();
      craftDrag = null;
    }
  }

  function deepCopyPaint() {
    return JSON.parse(JSON.stringify(state.gridPaint));
  }

  // 撤销最近一次涂色/擦除笔画
  function undoPaint() {
    if (!paintHistory.length) {
      toast('没有可撤销的操作');
      return;
    }
    state.gridPaint = paintHistory.pop();
    renderCreationCanvas();
    saveCache();
  }

  // 切换预览模式
  function togglePreview() {
    state.previewMode = !state.previewMode;
    updatePreviewButton();
    renderCreationCanvas();
    saveCache();
  }

  // 导出涂色结果为 PNG（按涂色区域裁剪，不受视口限制）
  function exportPNG() {
    const canvas = els.canvas;
    if (!canvas || !state.croppedImage) return;
    if (!state.gridGenerated || state.gridW <= 0 || state.gridH <= 0) return;

    const keys = Object.keys(state.gridPaint);
    if (!keys.length) { toast('没有已涂色的格子'); return; }

    // 计算涂色格子的包围盒（行列范围）
    let minR = Infinity, maxR = -Infinity, minC = Infinity, maxC = -Infinity;
    for (const key of keys) {
      const [r, col] = key.split(',').map(Number);
      if (r < minR) minR = r;
      if (r > maxR) maxR = r;
      if (col < minC) minC = col;
      if (col > maxC) maxC = col;
    }

    // 用当前视口的 cellSize 作为基准，放大 4 倍提升导出清晰度
    const { cw, ch } = getWrapperSize();
    if (cw <= 0 || ch <= 0) return;
    const { cellSize: baseCell } = getGridGeometry(cw, ch);
    if (baseCell <= 0) return;
    const scale = 4;
    const cellSize = baseCell * scale;

    const pad = Math.max(0, cellSize * 0.04);
    const cols = maxC - minC + 1;
    const rows = maxR - minR + 1;
    const exportW = Math.round(cols * cellSize);
    const exportH = Math.round(rows * cellSize);

    const tmp = document.createElement('canvas');
    tmp.width = exportW;
    tmp.height = exportH;
    const tctx = tmp.getContext('2d');

    // 白色背景
    tctx.fillStyle = '#ffffff';
    tctx.fillRect(0, 0, exportW, exportH);

    // 涂色格子
    const colorMap = buildColorIdMap();
    for (const key of keys) {
      const id = state.gridPaint[key];
      const c = colorMap[id];
      if (!c) continue;
      const [r, col] = key.split(',').map(Number);
      const x = (col - minC) * cellSize + pad;
      const y = (r - minR) * cellSize + pad;
      const s = cellSize - pad * 2;
      tctx.fillStyle = c.hex;
      tctx.fillRect(x, y, s, s);
    }

    tmp.toBlob((blob) => {
      if (!blob) { toast('导出失败'); return; }
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'craft-' + new Date().toISOString().slice(0, 10) + '.png';
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      toast('导出成功');
    }, 'image/png');
  }

  function updatePreviewButton() {
    if (els.previewBtn) {
      els.previewBtn.classList.toggle("active", state.previewMode);
    }
  }

  // 步骤 4 触屏（单指：涂色拖拽 / 吸色单击）
  function onCraftTouchStart(e) {
    // 移动模式双指缩放
    if (state.craftTool === "move" && e.touches.length === 2) {
      e.preventDefault();
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      craftDrag = {
        type: "pinch",
        dist: Math.hypot(dx, dy),
        imgScale: state.imageScale,
        gridScale: state.gridScale,
        imgOffX: state.imageOffX,
        imgOffY: state.imageOffY,
        gridOffX: state.gridOffX,
        gridOffY: state.gridOffY,
      };
      return;
    }
    if (e.touches.length !== 1) return;
    e.preventDefault();
    const t = e.touches[0];
    onCraftStart(t.clientX, t.clientY);
  }
  function onCraftTouchMove(e) {
    // 双指缩放
    if (craftDrag && craftDrag.type === "pinch" && e.touches.length >= 2) {
      e.preventDefault();
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      const nd = Math.hypot(dx, dy);
      const ratio = nd / craftDrag.dist;
      const newImgS3 = clamp(craftDrag.imgScale * ratio, 0.05, 200);
      const newGrdS3 = clamp(craftDrag.gridScale * ratio, 0.05, 200);
      const r = Math.min(newImgS3 / craftDrag.imgScale, newGrdS3 / craftDrag.gridScale);
      state.imageScale = clamp(craftDrag.imgScale * r, 0.05, 200);
      state.gridScale = clamp(craftDrag.gridScale * r, 0.05, 200);
      const midX = (craftDrag.imgOffX + craftDrag.gridOffX) / 2;
      const midY = (craftDrag.imgOffY + craftDrag.gridOffY) / 2;
      state.imageOffX = midX + (craftDrag.imgOffX - midX) * r;
      state.imageOffY = midY + (craftDrag.imgOffY - midY) * r;
      state.gridOffX = midX + (craftDrag.gridOffX - midX) * r;
      state.gridOffY = midY + (craftDrag.gridOffY - midY) * r;
      renderCreationCanvas();
      return;
    }
    if (!craftDrag || e.touches.length !== 1) return;
    e.preventDefault();
    const t = e.touches[0];
    onCraftMove(t.clientX, t.clientY);
  }
  function onCraftTouchEnd(e) {
    if (e.touches.length === 0) {
      if (craftDrag && craftDrag.type === "pinch") saveCache();
      onCraftEnd();
    }
  }

  // ── 吸色：取格子覆盖图片区域的平均色 → 匹配最近 beadColor ──
  function pickCellAt(clientX, clientY) {
    const hit = pointerCellHit(clientX, clientY);
    if (!hit) return;
    const img = state.croppedImage;
    if (!img) return;
    const sample = ensureImageSampleCanvas();
    if (!sample) return;

    const { cw, ch } = getWrapperSize();
    const { cellSize, gx0, gy0 } = getGridGeometry(cw, ch);
    // 格子中心 canvas 坐标
    const ccx = gx0 + (hit.col + 0.5) * cellSize;
    const ccy = gy0 + (hit.row + 0.5) * cellSize;
    // 反算图片像素坐标（与 drawImageAndGrid 的正向变换互逆）
    const icx = cw / 2 + state.imageOffX;
    const icy = ch / 2 + state.imageOffY;
    const imgPxX = (ccx - icx) / state.imageScale + img.width / 2;
    const imgPxY = (ccy - icy) / state.imageScale + img.height / 2;
    // 采样区域 = 一个格子在图片像素里的尺寸
    const cellImg = cellSize / state.imageScale;
    const sx = Math.max(0, Math.round(imgPxX - cellImg / 2));
    const sy = Math.max(0, Math.round(imgPxY - cellImg / 2));
    const ex = Math.min(img.width, Math.round(imgPxX + cellImg / 2));
    const ey = Math.min(img.height, Math.round(imgPxY + cellImg / 2));
    if (ex - sx < 1 || ey - sy < 1) {
      toast('该格子不在图片范围内');
      return;
    }

    const data = sample.getContext('2d').getImageData(sx, sy, ex - sx, ey - sy).data;
    let r = 0, g = 0, b = 0, n = 0;
    for (let i = 0; i < data.length; i += 4) {
      r += data[i]; g += data[i + 1]; b += data[i + 2]; n++;
    }
    if (n === 0) { toast('该格子不在图片范围内'); return; }
    const best = findClosestBeadColor(Math.round(r / n), Math.round(g / n), Math.round(b / n));
    if (best) {
      state.activeColorId = best.id;
      updateCurrentColorDisplay();
      renderPaletteActive();
      saveCache();
      toast('已匹配颜色 ' + best.id);
    }
  }

  // redmean 加权欧氏距离匹配最近 beadColor
  function findClosestBeadColor(r, g, b) {
    if (typeof BEAD_PALETTE === 'undefined') return null;
    let best = null, bestDist = Infinity;
    for (const c of BEAD_PALETTE) {
      const rmean = (r + c.r) / 2;
      const dr = r - c.r, dg = g - c.g, db = b - c.b;
      const dist =
        (2 + rmean / 256) * dr * dr +
        4 * dg * dg +
        (2 + (255 - rmean) / 256) * db * db;
      if (dist < bestDist) { bestDist = dist; best = c; }
    }
    return best;
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
    els.startCraft.hidden = false;
    updateModeButtons();
    renderAlignmentCanvas();
    saveCache();
  }

  // ── 模式切换 ──
  function switchMode(mode) {
    state.currentMode = mode;
    updateModeButtons();
    saveCache();
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
        imgOffX: state.imageOffX,
        imgOffY: state.imageOffY,
        gridOffX: state.gridOffX,
        gridOffY: state.gridOffY,
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
      } else if (state.currentMode === 'grid') {
        state.gridOffX = alignDrag.gridOffX + dx;
        state.gridOffY = alignDrag.gridOffY + dy;
      } else {
        state.imageOffX = alignDrag.imgOffX + dx;
        state.imageOffY = alignDrag.imgOffY + dy;
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
      } else if (state.currentMode === 'grid') {
        state.gridScale = clamp(alignDrag.gridScale * ratio, 0.05, 20);
      } else {
        const newImgS2 = clamp(alignDrag.imgScale * ratio, 0.05, 200);
        const newGrdS2 = clamp(alignDrag.gridScale * ratio, 0.05, 200);
        const r = Math.min(newImgS2 / alignDrag.imgScale, newGrdS2 / alignDrag.gridScale);
        state.imageScale = clamp(alignDrag.imgScale * r, 0.05, 200);
        state.gridScale = clamp(alignDrag.gridScale * r, 0.05, 200);
        const midX = (alignDrag.imgOffX + alignDrag.gridOffX) / 2;
        const midY = (alignDrag.imgOffY + alignDrag.gridOffY) / 2;
        state.imageOffX = midX + (alignDrag.imgOffX - midX) * r;
        state.imageOffY = midY + (alignDrag.imgOffY - midY) * r;
        state.gridOffX = midX + (alignDrag.gridOffX - midX) * r;
        state.gridOffY = midY + (alignDrag.gridOffY - midY) * r;
      }
      alignDrag.dist = nd;
      alignDrag.imgScale = state.imageScale;
      alignDrag.gridScale = state.gridScale;
      alignDrag.imgOffX = state.imageOffX;
      alignDrag.imgOffY = state.imageOffY;
      alignDrag.gridOffX = state.gridOffX;
      alignDrag.gridOffY = state.gridOffY;
      renderAlignmentCanvas();
    }
  }

  function onAlignTouchEnd(e) {
    if (e.touches.length === 0) {
      alignDrag = null;
      saveCache();
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
    state.originalDataUrl = null;
    state.originalWidth = 0;
    state.originalHeight = 0;
    state.croppedImage = null;
    state.croppedDataUrl = null;
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
    state.gridPaint = {};
    state.craftTool = 'paint';
    _imageSampleCanvas = null;
    paintHistory = [];
    cropDrag = null;
    imgTouch = null;
    alignDrag = null;
    imgMousePan = null;
    craftDrag = null;

    els.uploadZone.hidden = false;
    els.canvasContainer.hidden = true;
    els.modeToggle.hidden = true;
    els.startCraft.hidden = true;

    clearCache();
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
    els.restart.addEventListener('click', openResetModal);

    // 步骤 4：创作
    els.startCraft.addEventListener('click', () => {
      if (!state.gridGenerated) { toast('请先生成网格'); return; }
      setStep(4);
    });
    els.craftBtns.forEach((btn) =>
      btn.addEventListener('click', () => switchCraftTool(btn.dataset.craft))
    );
    els.currentColor.addEventListener('click', openPaletteModal);
    els.paletteClose.addEventListener('click', closePaletteModal);
    els.paletteModal.addEventListener('click', (e) => {
      if (e.target === els.paletteModal) closePaletteModal();
    });
    els.undo.addEventListener('click', undoPaint);
    els.resetCancel.addEventListener('click', closeResetModal);
    els.resetConfirm.addEventListener('click', confirmReset);
    els.resetModal.addEventListener('click', (e) => {
      if (e.target === els.resetModal) closeResetModal();
    });
    els.backToAlign.addEventListener('click', () => setStep(3));
    els.restart2.addEventListener('click', openResetModal);
    els.previewBtn.addEventListener('click', togglePreview);
    els.exportBtn.addEventListener('click', exportPNG);

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

    // ── 步骤 3/4：触屏 ──
    els.canvasWrapper.addEventListener('touchstart', (e) => {
      if (state.step === 3) onAlignTouchStart(e);
      else if (state.step === 4) onCraftTouchStart(e);
    }, { passive: false });
    els.canvasWrapper.addEventListener('touchmove', (e) => {
      if (state.step === 3) onAlignTouchMove(e);
      else if (state.step === 4) onCraftTouchMove(e);
    }, { passive: false });
    els.canvasWrapper.addEventListener('touchend', (e) => {
      if (state.step === 3) onAlignTouchEnd(e);
      else if (state.step === 4) onCraftTouchEnd(e);
    });

    // ── 步骤 3/4：鼠标 ──
    els.canvas.addEventListener('mousedown', (e) => {
      if (state.step === 3) onAlignMouseDown(e);
      else if (state.step === 4) onCraftStart(e.clientX, e.clientY);
    });
    els.canvas.addEventListener('wheel', (e) => {
      if (state.step === 3 || state.step === 4) onCanvasWheel(e);
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
