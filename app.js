// 小红书封面生成器 — 第二轮重写
// 状态:
//   localStorage.coverTemplateDataUrl   模板 PNG 的 dataURL
//   localStorage.coverTemplateState     所有可调字段的 JSON

const LS_TEMPLATE = "coverTemplateDataUrl";
const LS_STATE = "coverTemplateState";

const DEFAULT_STATE = {
  canvasWidth: 1080,
  canvasHeight: 1440,
  mainImageDataUrl: null,
  mainImageY: 200,
  mainImageWidth: 920,
  mainImageHeight: 800,
  aspectRatio: 920 / 800, // 1.15
  title: "",
  titleY: 1180,
  titleFontSize: 72,
  titleColor: "#FFFFFF",
  // 星星难度评级
  starCount: 0,
  starSize: 50,
  starSpacing: 10,
  starX: 540,
  starY: 100,
  starImageDataUrl: null,
};

const FONT_STACK =
  '"Noto Sans SC", system-ui, -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif';

const state = {
  templateImage: null,
  mainImage: null, // 裁剪后的 HTMLImageElement
  starImage: null, // 星星贴图
  ...DEFAULT_STATE,
};

// 原始(未裁剪)主图,仅在裁剪弹窗打开期间持有
const cropState = {
  rawImage: null,        // HTMLImageElement
  rawWidth: 0,
  rawHeight: 0,
  // 裁剪框在原图坐标系中的位置和大小(像素)
  rect: { x: 0, y: 0, w: 0, h: 0 },
  aspectRatio: 1,
  // 缩放比例:原图像素 → 屏幕像素(用于裁剪框定位)
  scale: 1,
};

// ============== DOM ==============
const $ = (id) => document.getElementById(id);
const els = {
  emptyState: $("empty-state"),
  workspace: $("workspace"),
  templateInput: $("template-input"),
  reuploadBtn: $("reupload-btn"),
  titleInput: $("title-input"),
  titleFontSize: $("title-font-size"),
  titleColor: $("title-color"),
  titleY: $("title-y"),
  mainImageInput: $("main-image-input"),
  mainImageY: $("main-image-y"),
  mainImageW: $("main-image-w"),
  mainImageH: $("main-image-h"),
  canvasW: $("canvas-w"),
  canvasH: $("canvas-h"),
  resetBtn: $("reset-btn"),
  downloadBtn: $("download-btn"),
  clearBtn: $("clear-btn"),
  canvas: $("preview"),
  // 星星
  starImageInput: $("star-image-input"),
  starCount: $("star-count"),
  starSize: $("star-size"),
  starSpacing: $("star-spacing"),
  starX: $("star-x"),
  starY: $("star-y"),
  // 裁剪
  cropModal: $("crop-modal"),
  cropCanvas: $("crop-canvas"),
  cropStage: $("crop-stage"),
  cropRect: $("crop-rect"),
  cropW: $("crop-w"),
  cropH: $("crop-h"),
  cropCancel: $("crop-cancel"),
  cropConfirm: $("crop-confirm"),
  toast: $("toast"),
};

// ============== Toast ==============
let toastTimer = null;
function toast(msg, isDanger = false) {
  els.toast.textContent = msg;
  els.toast.classList.toggle("danger", isDanger);
  els.toast.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (els.toast.hidden = true), 2400);
}

// ============== localStorage ==============
function loadTemplate() {
  return localStorage.getItem(LS_TEMPLATE);
}
function loadState() {
  const raw = localStorage.getItem(LS_STATE);
  if (!raw) return { ...DEFAULT_STATE };
  try {
    return { ...DEFAULT_STATE, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULT_STATE };
  }
}
function saveState() {
  // 写盘 debounce,避免每次 input 都打一次 localStorage
  clearTimeout(saveState._t);
  saveState._t = setTimeout(() => {
    try {
      const persist = { ...state };
      delete persist.templateImage;
      delete persist.mainImage;
      delete persist.starImage;
      localStorage.setItem(LS_STATE, JSON.stringify(persist));
    } catch (e) {
      toast("保存失败,可能是存储已满", true);
    }
  }, 200);
}
function saveStateNow() {
  clearTimeout(saveState._t);
  try {
    const persist = { ...state };
    delete persist.templateImage;
    delete persist.mainImage;
    delete persist.starImage;
    localStorage.setItem(LS_STATE, JSON.stringify(persist));
  } catch (e) {
    toast("保存失败,可能是存储已满", true);
  }
}
function setTemplate(dataUrl) {
  try {
    localStorage.setItem(LS_TEMPLATE, dataUrl);
    return true;
  } catch {
    toast("模板太大,请压缩到 1MB 以内", true);
    return false;
  }
}

// ============== 图片加载 ==============
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

// ============== 渲染 ==============
function drawCoverImage(ctx, img, x, y, w, h) {
  // 缩放填满 w×h(保持原图比例),多余裁剪
  const scale = Math.max(w / img.width, h / img.height);
  const dw = img.width * scale;
  const dh = img.height * scale;
  const dx = x + (w - dw) / 2;
  const dy = y + (h - dh) / 2;
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  ctx.drawImage(img, dx, dy, dw, dh);
  ctx.restore();
}

function wrapLines(ctx, text, maxWidth) {
  if (!text) return [];
  const lines = [];
  for (const rawLine of text.split("\n")) {
    if (!rawLine) {
      lines.push("");
      continue;
    }
    let line = "";
    for (const ch of rawLine) {
      const test = line + ch;
      if (ctx.measureText(test).width > maxWidth && line) {
        lines.push(line);
        line = ch;
      } else {
        line = test;
      }
    }
    if (line) lines.push(line);
  }
  return lines;
}

function drawCenteredText(ctx, text, opts) {
  if (!text) return;
  const { x, y, maxWidth, fontSize, color } = opts;
  ctx.save();
  ctx.font = `900 ${fontSize}px ${FONT_STACK}`;
  ctx.fillStyle = color;
  ctx.textBaseline = "alphabetic";
  ctx.textAlign = "center";
  const lines = wrapLines(ctx, text, maxWidth);
  const lineHeight = fontSize * 1.15;
  const totalH = lines.length * lineHeight;
  const firstBaseline = y - totalH / 2 + lineHeight / 2;
  lines.forEach((line, i) => {
    ctx.fillText(line, x, firstBaseline + i * lineHeight);
  });
  ctx.restore();
}

function drawStars(ctx, count, x, y, size, spacing, img) {
  if (!count || !img) return;
  for (let i = 0; i < count; i++) {
    const sx = x + i * (size + spacing);
    ctx.drawImage(img, sx, y, size, size);
  }
}

function render() {
  if (!state.templateImage) return;
  const cw = Number(state.canvasWidth) || 1080;
  const ch = Number(state.canvasHeight) || 1440;
  const canvas = els.canvas;
  canvas.width = cw;
  canvas.height = ch;
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, cw, ch);
  ctx.drawImage(state.templateImage, 0, 0, cw, ch);

  const mw = Number(state.mainImageWidth) || 0;
  const mh = Number(state.mainImageHeight) || 0;
  const my = Number(state.mainImageY) || 0;
  if (state.mainImage && mw > 0 && mh > 0) {
    const mx = (cw - mw) / 2;
    drawCoverImage(ctx, state.mainImage, mx, my, mw, mh);
  }

  const titleX = cw / 2;
  const titleY = Number(state.titleY) || 0;
  const maxW = Math.max(200, cw - 80);
  drawCenteredText(ctx, state.title || "", {
    x: titleX,
    y: titleY,
    maxWidth: maxW,
    fontSize: Number(state.titleFontSize) || 72,
    color: state.titleColor || "#FFFFFF",
  });

  // 星星难度评级
  const starCount = Number(state.starCount) || 0;
  if (state.starImage && starCount > 0) {
    const starX = Number(state.starX) || 0;
    const starY = Number(state.starY) || 0;
    const starSize = Number(state.starSize) || 50;
    const starSpacing = Number(state.starSpacing) || 10;
    drawStars(ctx, starCount, starX, starY, starSize, starSpacing, state.starImage);
  }
}

// ============== UI 同步 ==============
function syncStateToUI() {
  els.titleInput.value = state.title || "";
  els.titleFontSize.value = state.titleFontSize;
  els.titleColor.value = state.titleColor;
  els.titleY.value = state.titleY;
  els.mainImageY.value = state.mainImageY;
  els.mainImageW.value = state.mainImageWidth;
  els.mainImageH.value = state.mainImageHeight;
  els.canvasW.value = state.canvasWidth;
  els.canvasH.value = state.canvasHeight;
  // 星星
  els.starCount.value = state.starCount;
  els.starSize.value = state.starSize;
  els.starSpacing.value = state.starSpacing;
  els.starX.value = state.starX;
  els.starY.value = state.starY;
}
function showEmpty() {
  els.emptyState.hidden = false;
  els.workspace.hidden = true;
}
function showWorkspace() {
  els.emptyState.hidden = true;
  els.workspace.hidden = false;
}

// ============== 实时更新 ==============
function updateField(key, value) {
  state[key] = value;
  saveState();
  render();
}

// 主图宽高绑定纵横比
function updateMainImageSize(changedKey, newValue) {
  newValue = Math.max(1, Number(newValue) || 0);
  const ratio = state.aspectRatio || 1;
  if (changedKey === "mainImageWidth") {
    state.mainImageWidth = newValue;
    state.mainImageHeight = Math.round(newValue / ratio);
  } else {
    state.mainImageHeight = newValue;
    state.mainImageWidth = Math.round(newValue * ratio);
  }
  els.mainImageW.value = state.mainImageWidth;
  els.mainImageH.value = state.mainImageHeight;
  saveState();
  render();
}

// ============== 裁剪弹窗 ==============
function openCropModal() {
  if (!cropState.rawImage) return;
  els.cropModal.hidden = false;
  drawCropCanvas();
  initCropRect();
  syncCropRectToUI();
  bindCropEvents();
}
function closeCropModal() {
  els.cropModal.hidden = true;
  unbindCropEvents();
  cropState.rawImage = null;
}
function drawCropCanvas() {
  // 适配到 .crop-stage 容器,保持原图比例
  const stage = els.cropStage.getBoundingClientRect();
  const maxW = stage.width - 4;
  const maxH = stage.height - 4;
  const scale = Math.min(maxW / cropState.rawWidth, maxH / cropState.rawHeight, 1);
  cropState.scale = scale;
  const dispW = Math.round(cropState.rawWidth * scale);
  const dispH = Math.round(cropState.rawHeight * scale);
  els.cropCanvas.width = dispW;
  els.cropCanvas.height = dispH;
  els.cropCanvas.style.width = dispW + "px";
  els.cropCanvas.style.height = dispH + "px";
  // overlay 居中放置,与 canvas 同尺寸和位置
  const overlay = els.cropCanvas.parentElement.querySelector(".crop-overlay");
  const stageW = els.cropStage.clientWidth;
  const stageH = els.cropStage.clientHeight;
  const canvasOffsetX = (stageW - dispW) / 2;
  const canvasOffsetY = (stageH - dispH) / 2;
  overlay.style.width = dispW + "px";
  overlay.style.height = dispH + "px";
  overlay.style.top = canvasOffsetY + "px";
  overlay.style.left = canvasOffsetX + "px";
  const ctx = els.cropCanvas.getContext("2d");
  ctx.drawImage(cropState.rawImage, 0, 0, dispW, dispH);
}

function initCropRect() {
  // 默认:和 state.aspectRatio 比例、尽量大、居中
  const ratio = cropState.aspectRatio;
  const imgR = cropState.rawWidth / cropState.rawHeight;
  let w, h;
  if (ratio > imgR) {
    h = cropState.rawHeight;
    w = h * ratio;
  } else {
    w = cropState.rawWidth;
    h = w / ratio;
  }
  cropState.rect = {
    x: (cropState.rawWidth - w) / 2,
    y: (cropState.rawHeight - h) / 2,
    w,
    h,
  };
  layoutCropRect();
}

function layoutCropRect() {
  const { x, y, w, h } = cropState.rect;
  const s = cropState.scale;
  const el = els.cropRect;
  el.style.left = x * s + "px";
  el.style.top = y * s + "px";
  el.style.width = w * s + "px";
  el.style.height = h * s + "px";
}

function syncCropRectToUI() {
  els.cropW.value = Math.round(cropState.rect.w);
  els.cropH.value = Math.round(cropState.rect.h);
}

function applyCropRect() {
  // 输入框 → 裁剪框(以宽为准,纵横比联动)
  let w = Math.max(1, Number(els.cropW.value) || 1);
  const ratio = cropState.aspectRatio;
  let h = Math.round(w / ratio);
  w = Math.round(w);
  // 不能超过原图
  if (w > cropState.rawWidth) {
    w = cropState.rawWidth;
    h = Math.round(w / ratio);
  }
  if (h > cropState.rawHeight) {
    h = cropState.rawHeight;
    w = Math.round(h * ratio);
  }
  // 居中(如果框超出原图,平移回范围内)
  const cx = cropState.rect.x + cropState.rect.w / 2;
  const cy = cropState.rect.y + cropState.rect.h / 2;
  cropState.rect.w = w;
  cropState.rect.h = h;
  cropState.rect.x = Math.max(0, Math.min(cropState.rawWidth - w, cx - w / 2));
  cropState.rect.y = Math.max(0, Math.min(cropState.rawHeight - h, cy - h / 2));
  layoutCropRect();
  syncCropRectToUI();
}

let cropDrag = null; // { type, startMouse, startRect }

function onCropMouseDown(e) {
  const handle = e.target.closest(".handle");
  const target = handle || e.target.closest(".crop-rect");
  if (!target || !els.cropRect.contains(target) && target !== els.cropRect) return;
  e.preventDefault();
  const stageRect = els.cropStage.getBoundingClientRect();
  const s = cropState.scale;
  cropDrag = {
    type: handle ? handle.dataset.handle : "move",
    startMouse: { x: (e.clientX - stageRect.left) / s, y: (e.clientY - stageRect.top) / s },
    startRect: { ...cropState.rect },
  };
}
function onCropMouseMove(e) {
  if (!cropDrag) return;
  const stageRect = els.cropStage.getBoundingClientRect();
  const s = cropState.scale;
  const cur = { x: (e.clientX - stageRect.left) / s, y: (e.clientY - stageRect.top) / s };
  const dx = cur.x - cropDrag.startMouse.x;
  const dy = cur.y - cropDrag.startMouse.y;
  const start = cropDrag.startRect;
  const ratio = cropState.aspectRatio;
  let x, y, w, h;

  if (cropDrag.type === "move") {
    x = start.x + dx;
    y = start.y + dy;
    w = start.w;
    h = start.h;
  } else {
    // 角/边:约束纵横比,以对边为锚点
    let nw = start.w, nh = start.h, nx = start.x, ny = start.y;
    if (cropDrag.type.includes("e")) nw = start.w + dx;
    if (cropDrag.type.includes("w")) { nw = start.w - dx; nx = start.x + dx; }
    if (cropDrag.type.includes("s")) nh = start.h + dy;
    if (cropDrag.type.includes("n")) { nh = start.h - dy; ny = start.y + dy; }
    // 纵横比约束:以已计算维度为准,联动另一维度
    if (cropDrag.type === "n" || cropDrag.type === "s") {
      // 上下边:锁定宽度(nw),调整高度
      nh = nw / ratio;
      if (cropDrag.type === "n") ny = start.y + (start.h - nh);
    } else if (cropDrag.type === "e" || cropDrag.type === "w") {
      // 左右边:锁定高度(nh),调整宽度
      nw = nh * ratio;
    } else {
      // 角拖动:以拖动增加量较大的维度为准
      const ratioDiff = Math.abs(nw / start.w - 1) - Math.abs(nh / start.h - 1);
      if (ratioDiff >= 0) {
        nh = nw / ratio;
      } else {
        nw = nh * ratio;
      }
    }
    nw = Math.max(1, nw);
    nh = Math.max(1, nh);
    x = nx; y = ny; w = nw; h = nh;
  }

  // 限制在原图范围内
  if (x < 0) { w += x; x = 0; }
  if (y < 0) { h += y; y = 0; }
  if (x + w > cropState.rawWidth) w = cropState.rawWidth - x;
  if (y + h > cropState.rawHeight) h = cropState.rawHeight - y;
  w = Math.max(1, w);
  h = Math.max(1, h);

  cropState.rect = { x, y, w, h };
  layoutCropRect();
  syncCropRectToUI();
}
function onCropMouseUp() {
  cropDrag = null;
}
function bindCropEvents() {
  els.cropStage.addEventListener("mousedown", onCropMouseDown);
  window.addEventListener("mousemove", onCropMouseMove);
  window.addEventListener("mouseup", onCropMouseUp);
}
function unbindCropEvents() {
  els.cropStage.removeEventListener("mousedown", onCropMouseDown);
  window.removeEventListener("mousemove", onCropMouseMove);
  window.removeEventListener("mouseup", onCropMouseUp);
}

async function confirmCrop() {
  // 把 cropState.rect 区域从原图画到新 canvas,转 dataURL
  const { x, y, w, h } = cropState.rect;
  const out = document.createElement("canvas");
  out.width = Math.round(w);
  out.height = Math.round(h);
  const ctx = out.getContext("2d");
  ctx.drawImage(cropState.rawImage, x, y, w, h, 0, 0, out.width, out.height);
  const dataUrl = out.toDataURL("image/png");
  // 更新 state
  state.mainImageDataUrl = dataUrl;
  state.mainImageWidth = Math.round(w);
  state.mainImageHeight = Math.round(h);
  state.aspectRatio = w / h;
  // 加载裁剪后的图
  try {
    state.mainImage = await loadImage(dataUrl);
  } catch {
    toast("主图加载失败", true);
    closeCropModal();
    return;
  }
  // 同步 UI
  els.mainImageW.value = state.mainImageWidth;
  els.mainImageH.value = state.mainImageHeight;
  saveStateNow();
  closeCropModal();
  render();
  toast("主图已更新");
}

// ============== 启动 ==============
async function bootstrap() {
  // 清理旧 key(项目还在第二轮,直接丢弃)
  localStorage.removeItem("coverTemplateConfig");
  localStorage.removeItem("coverTemplateFields");

  const tplData = loadTemplate();
  const persisted = loadState();
  Object.assign(state, persisted);

  if (!tplData) {
    showEmpty();
    return;
  }
  try {
    state.templateImage = await loadImage(tplData);
  } catch {
    showEmpty();
    toast("模板加载失败,请重新上传", true);
    return;
  }
  if (state.mainImageDataUrl) {
    try {
      state.mainImage = await loadImage(state.mainImageDataUrl);
    } catch {
      state.mainImage = null;
    }
  }
  if (state.starImageDataUrl) {
    try {
      state.starImage = await loadImage(state.starImageDataUrl);
    } catch {
      state.starImage = null;
    }
  }
  syncStateToUI();
  showWorkspace();
  await document.fonts.ready;
  render();
}

// ============== 异步事件处理器(避免 void 上下文中返回 Promise) ==============
async function handleTemplateUpload(e) {
  const file = e.target.files[0];
  if (!file) return;
  const dataUrl = await fileToDataURL(file);
  if (!setTemplate(dataUrl)) { e.target.value = ""; return; }
  try {
    state.templateImage = await loadImage(dataUrl);
  } catch {
    toast("模板解析失败", true);
    e.target.value = "";
    return;
  }
  if (els.workspace.hidden) {
    syncStateToUI();
    showWorkspace();
    await document.fonts.ready;
  }
  render();
  toast("模板已更新");
  e.target.value = "";
}

async function handleMainImageUpload(e) {
  const file = e.target.files[0];
  if (!file) return;
  try {
    const dataUrl = await fileToDataURL(file);
    cropState.rawImage = await loadImage(dataUrl);
    cropState.rawWidth = cropState.rawImage.width;
    cropState.rawHeight = cropState.rawImage.height;
    cropState.aspectRatio = state.aspectRatio || DEFAULT_STATE.aspectRatio;
  } catch {
    toast("主图加载失败", true);
    e.target.value = "";
    return;
  }
  openCropModal();
  e.target.value = "";
}

async function handleStarImageUpload(e) {
  const file = e.target.files[0];
  if (!file) return;
  try {
    const dataUrl = await fileToDataURL(file);
    state.starImageDataUrl = dataUrl;
    state.starImage = await loadImage(dataUrl);
    saveStateNow();
    render();
    toast("星星贴图已加载");
  } catch {
    toast("星星贴图加载失败", true);
  }
  e.target.value = "";
}

async function handleDownload() {
  const blob = await new Promise((resolve) => els.canvas.toBlob(resolve, "image/png"));
  if (!blob) {
    toast("导出失败", true);
    return;
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `cover-${new Date().toISOString().slice(0, 10)}.png`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// ============== 事件 ==============
function bindEvents() {
  // 上传模板
  els.templateInput.addEventListener("change", (e) => {
    void handleTemplateUpload(e);
  });

  // 换模板
  els.reuploadBtn.addEventListener("click", () => els.templateInput.click());

  // 标题字段
  els.titleInput.addEventListener("input", (e) => updateField("title", e.target.value));
  els.titleFontSize.addEventListener("input", (e) => updateField("titleFontSize", Number(e.target.value) || 12));
  els.titleColor.addEventListener("input", (e) => updateField("titleColor", e.target.value));
  els.titleY.addEventListener("input", (e) => updateField("titleY", Number(e.target.value) || 0));

  // 画布
  els.canvasW.addEventListener("input", (e) => updateField("canvasWidth", Math.max(100, Number(e.target.value) || 1080)));
  els.canvasH.addEventListener("input", (e) => updateField("canvasHeight", Math.max(100, Number(e.target.value) || 1440)));

  // 主图 Y
  els.mainImageY.addEventListener("input", (e) => updateField("mainImageY", Number(e.target.value) || 0));

  // 主图宽高(绑纵横比)
  els.mainImageW.addEventListener("input", (e) => updateMainImageSize("mainImageWidth", e.target.value));
  els.mainImageH.addEventListener("input", (e) => updateMainImageSize("mainImageHeight", e.target.value));

  // 主图文件 → 弹裁剪
  els.mainImageInput.addEventListener("change", (e) => {
    void handleMainImageUpload(e);
  });

  // 星星
  els.starImageInput.addEventListener("change", (e) => {
    void handleStarImageUpload(e);
  });
  els.starCount.addEventListener("change", (e) => updateField("starCount", Number(e.target.value) || 0));
  els.starSize.addEventListener("input", (e) => updateField("starSize", Math.max(10, Number(e.target.value) || 50)));
  els.starSpacing.addEventListener("input", (e) => updateField("starSpacing", Math.max(0, Number(e.target.value) || 0)));
  els.starX.addEventListener("input", (e) => updateField("starX", Number(e.target.value) || 0));
  els.starY.addEventListener("input", (e) => updateField("starY", Number(e.target.value) || 0));

  // 裁剪弹窗
  els.cropCancel.addEventListener("click", closeCropModal);
  els.cropConfirm.addEventListener("click", confirmCrop);
  els.cropW.addEventListener("input", applyCropRect);
  els.cropH.addEventListener("input", applyCropRect);
  els.cropModal.addEventListener("click", (e) => {
    if (e.target === els.cropModal) closeCropModal();
  });

  // 重置字段(只重置表单,保留模板)
  els.resetBtn.addEventListener("click", () => {
    state.title = DEFAULT_STATE.title;
    state.titleY = DEFAULT_STATE.titleY;
    state.titleFontSize = DEFAULT_STATE.titleFontSize;
    state.titleColor = DEFAULT_STATE.titleColor;
    state.mainImageDataUrl = null;
    state.mainImage = null;
    state.mainImageY = DEFAULT_STATE.mainImageY;
    state.mainImageWidth = DEFAULT_STATE.mainImageWidth;
    state.mainImageHeight = DEFAULT_STATE.mainImageHeight;
    state.aspectRatio = DEFAULT_STATE.aspectRatio;
    state.starCount = DEFAULT_STATE.starCount;
    state.starSize = DEFAULT_STATE.starSize;
    state.starSpacing = DEFAULT_STATE.starSpacing;
    state.starX = DEFAULT_STATE.starX;
    state.starY = DEFAULT_STATE.starY;
    els.mainImageInput.value = "";
    els.starImageInput.value = "";
    syncStateToUI();
    saveStateNow();
    render();
  });

  // 下载
  els.downloadBtn.addEventListener("click", () => {
    void handleDownload();
  });

  // 清空
  els.clearBtn.addEventListener("click", () => {
    if (!confirm("确定清空所有数据?模板和所有配置都会删除。")) return;
    localStorage.removeItem(LS_TEMPLATE);
    localStorage.removeItem(LS_STATE);
    Object.assign(state, DEFAULT_STATE, { templateImage: null, mainImage: null });
    els.mainImageInput.value = "";
    showEmpty();
  });
}

bindEvents();
bootstrap();
