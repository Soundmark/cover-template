# 图纸尺寸识别 - 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在封面制作工具中添加「图纸尺寸识别」Tab，实现图片导入、裁剪、格子选择，最终计算并显示格子数量。

**Architecture:** 通过 `hidden` 属性切换 Tab 显示，复用现有 Canvas 裁剪交互模式，新建 blueprint.js 处理图纸识别逻辑。

**Tech Stack:** 纯 HTML/CSS/JavaScript，无框架，复用现有 Canvas API 和事件处理模式。

---

## Global Constraints

- 所有尺寸计算基于原图像素尺寸，不受缩放影响
- Tab 切换使用 `hidden` 属性控制显示/隐藏
- 格子框只能在裁剪区域内绘制
- 结果只显示格子数量（如 "10 x 15"）

---

## 文件结构

| 文件 | 职责 |
|------|------|
| index.html | 添加 Tab 导航和图纸识别区域 HTML 结构 |
| styles.css | Tab 样式、blueprint 区域样式 |
| blueprint.js | 图纸识别核心逻辑（状态管理、Canvas 渲染、交互） |

---

## Task 1: 修改 index.html - 添加 Tab 导航和结构

**Files:**
- Modify: `index.html:1-202`（整个文件）

**Interfaces:**
- Consumes: 无
- Produces: 新增 Tab 结构和 blueprint 工作区 DOM

- [ ] **Step 1: 在 `<body>` 开头添加 Tab 导航**

在 `<main class="app">` 之前添加：

```html
<!-- Tab 导航 -->
<nav class="tab-nav">
  <button class="tab-btn active" data-tab="cover">封面制作</button>
  <button class="tab-btn" data-tab="blueprint">图纸尺寸识别</button>
</nav>
```

- [ ] **Step 2: 在空状态 section 前添加 blueprint 工作区**

在 `<section id="empty-state">` 之前添加：

```html
<!-- 图纸尺寸识别工作区 -->
<section id="blueprint-workspace" class="blueprint-workspace" hidden>
  <div class="bp-container">
    <!-- 步骤指示器 -->
    <div class="bp-steps">
      <div class="bp-step active" data-step="1">
        <span class="bp-step-num">1</span>
        <span class="bp-step-label">导入图片</span>
      </div>
      <div class="bp-step" data-step="2">
        <span class="bp-step-num">2</span>
        <span class="bp-step-label">裁剪图纸</span>
      </div>
      <div class="bp-step" data-step="3">
        <span class="bp-step-num">3</span>
        <span class="bp-step-label">选择格子</span>
      </div>
      <div class="bp-step" data-step="4">
        <span class="bp-step-num">4</span>
        <span class="bp-step-label">结果</span>
      </div>
    </div>

    <!-- 主内容区 -->
    <div class="bp-main">
      <!-- 图片预览区 -->
      <div class="bp-preview-panel">
        <div class="bp-upload-zone" id="bp-upload-zone">
          <p>点击或拖拽上传图片</p>
          <input id="bp-image-input" type="file" accept="image/*" hidden />
        </div>
        <div class="bp-canvas-container" id="bp-canvas-container" hidden>
          <div class="bp-canvas-wrapper" id="bp-canvas-wrapper">
            <canvas id="bp-canvas"></canvas>
            <div class="bp-overlay" id="bp-overlay">
              <!-- 裁剪框 -->
              <div class="bp-crop-box" id="bp-crop-box" hidden></div>
              <!-- 格子框 -->
              <div class="bp-grid-box" id="bp-grid-box" hidden></div>
            </div>
          </div>
          <!-- 缩放控制 -->
          <div class="bp-zoom-controls" id="bp-zoom-controls" hidden>
            <button class="bp-zoom-btn" id="bp-zoom-out">−</button>
            <span class="bp-zoom-level" id="bp-zoom-level">100%</span>
            <button class="bp-zoom-btn" id="bp-zoom-in">+</button>
          </div>
        </div>
      </div>

      <!-- 操作面板 -->
      <div class="bp-actions-panel">
        <!-- 步骤1: 导入后显示裁剪按钮 -->
        <div class="bp-action-step" id="bp-action-step1" hidden>
          <button class="btn primary" id="bp-start-crop">开始裁剪图纸区域</button>
          <button class="btn" id="bp-reset-image">重新选择图片</button>
        </div>

        <!-- 步骤2: 裁剪确认 -->
        <div class="bp-action-step" id="bp-action-step2" hidden>
          <p class="hint">拖动裁剪框选择图纸区域</p>
          <button class="btn primary" id="bp-confirm-crop">确认裁剪</button>
          <button class="btn" id="bp-cancel-crop">取消</button>
        </div>

        <!-- 步骤3: 选择格子 -->
        <div class="bp-action-step" id="bp-action-step3" hidden>
          <p class="hint">在裁剪区域内拖动选择一个最小格子</p>
          <button class="btn primary" id="bp-confirm-grid">确认格子</button>
          <button class="btn" id="bp-redo-crop">重新裁剪</button>
        </div>

        <!-- 步骤4: 结果展示 -->
        <div class="bp-action-step" id="bp-action-step4" hidden>
          <div class="bp-result">
            <h3>图纸尺寸</h3>
            <div class="bp-result-value" id="bp-result-value">— × —</div>
            <p class="hint">宽 × 高 (格子数量)</p>
          </div>
          <button class="btn" id="bp-restart">重新开始</button>
        </div>
      </div>
    </div>
  </div>
</section>
```

- [ ] **Step 3: 修改现有工作区结构，添加 data-tab 属性**

将 `<section id="workspace">` 改为：

```html
<section id="workspace" class="workspace" data-tab-content="cover" hidden>
```

- [ ] **Step 4: 修改空状态 section，添加 data-tab 属性**

将 `<section id="empty-state">` 改为：

```html
<section id="empty-state" class="empty-state" data-tab-content="cover" hidden>
```

- [ ] **Step 5: 在 `<script src="app.js">` 之前添加 blueprint.js 引用**

```html
<script src="blueprint.js"></script>
<script src="app.js"></script>
```

---

## Task 2: 修改 styles.css - 添加 Tab 和 Blueprint 样式

**Files:**
- Modify: `styles.css:1-506`（追加到文件末尾）

- [ ] **Step 1: 添加 Tab 导航样式**

```css
/* ============ Tab 导航 ============ */
.tab-nav {
  display: flex;
  gap: 4px;
  margin-bottom: 16px;
  background: var(--panel);
  padding: 4px;
  border-radius: 12px;
  box-shadow: var(--shadow);
}

.tab-btn {
  flex: 1;
  padding: 10px 16px;
  border: none;
  background: transparent;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 500;
  color: var(--text-soft);
  cursor: pointer;
  transition: all 0.15s;
}

.tab-btn:hover {
  background: var(--bg);
}

.tab-btn.active {
  background: var(--accent);
  color: #fff;
}
```

- [ ] **Step 2: 添加 Blueprint 工作区样式**

```css
/* ============ Blueprint 工作区 ============ */
.blueprint-workspace {
  height: 100%;
  display: flex;
  flex-direction: column;
}

.bp-container {
  background: var(--panel);
  border-radius: 16px;
  padding: 16px;
  box-shadow: var(--shadow);
  height: 100%;
  display: flex;
  flex-direction: column;
  gap: 16px;
  overflow: hidden;
}

/* 步骤指示器 */
.bp-steps {
  display: flex;
  gap: 8px;
  flex-shrink: 0;
}

.bp-step {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  background: var(--bg);
  border-radius: 8px;
  opacity: 0.5;
}

.bp-step.active {
  opacity: 1;
  background: var(--accent-soft);
}

.bp-step.completed {
  opacity: 1;
}

.bp-step-num {
  width: 24px;
  height: 24px;
  border-radius: 50%;
  background: var(--text-soft);
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  font-weight: 700;
}

.bp-step.active .bp-step-num {
  background: var(--accent);
}

.bp-step.completed .bp-step-num {
  background: #4caf50;
}

.bp-step-label {
  font-size: 13px;
  color: var(--text-soft);
}

.bp-step.active .bp-step-label {
  color: var(--text);
  font-weight: 500;
}

/* 主内容区 */
.bp-main {
  display: flex;
  flex: 1;
  gap: 16px;
  overflow: hidden;
}

/* 预览区 */
.bp-preview-panel {
  flex: 1;
  background: #fafafa;
  border-radius: 12px;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  position: relative;
}

/* 上传区域 */
.bp-upload-zone {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 2px dashed var(--border);
  border-radius: 12px;
  margin: 16px;
  cursor: pointer;
  transition: all 0.15s;
}

.bp-upload-zone:hover {
  border-color: var(--accent);
  background: var(--accent-soft);
}

.bp-upload-zone p {
  color: var(--text-soft);
  margin: 0;
}

/* Canvas 容器 */
.bp-canvas-container {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.bp-canvas-wrapper {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: auto;
  padding: 16px;
  position: relative;
}

#bp-canvas {
  max-width: 100%;
  max-height: 100%;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.08);
}

.bp-overlay {
  position: absolute;
  pointer-events: none;
}

.bp-crop-box,
.bp-grid-box {
  position: absolute;
  border: 2px dashed var(--accent);
  background: rgba(255, 36, 66, 0.1);
  pointer-events: auto;
  cursor: move;
}

.bp-grid-box {
  border-color: #4caf50;
  background: rgba(76, 175, 80, 0.2);
  cursor: nwse-resize;
}

/* 缩放控制 */
.bp-zoom-controls {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  padding: 8px;
  background: var(--panel);
  border-top: 1px solid var(--border);
}

.bp-zoom-btn {
  width: 32px;
  height: 32px;
  border: 1px solid var(--border);
  background: #fff;
  border-radius: 6px;
  font-size: 18px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
}

.bp-zoom-btn:hover {
  background: var(--bg);
}

.bp-zoom-level {
  font-size: 13px;
  color: var(--text-soft);
  min-width: 48px;
  text-align: center;
}

/* 操作面板 */
.bp-actions-panel {
  width: 240px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.bp-action-step {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.bp-action-step .hint {
  font-size: 12px;
  color: var(--text-soft);
  margin: 0;
}

/* 结果展示 */
.bp-result {
  background: var(--bg);
  border-radius: 12px;
  padding: 16px;
  text-align: center;
}

.bp-result h3 {
  margin: 0 0 8px;
  font-size: 14px;
  color: var(--text-soft);
}

.bp-result-value {
  font-size: 36px;
  font-weight: 700;
  color: var(--accent);
  margin: 8px 0;
}

.bp-result .hint {
  margin: 0;
}
```

- [ ] **Step 3: 添加移动端适配**

```css
/* ============ Blueprint 移动端适配 ============ */
@media (max-width: 800px) {
  .bp-main {
    flex-direction: column;
  }

  .bp-actions-panel {
    width: 100%;
    flex-direction: row;
    flex-wrap: wrap;
  }

  .bp-action-step {
    flex: 1;
    min-width: 150px;
  }

  .bp-result-value {
    font-size: 28px;
  }

  .bp-steps {
    flex-wrap: wrap;
  }

  .bp-step {
    flex: 1 1 45%;
  }

  .bp-step-label {
    display: none;
  }
}
```

---

## Task 3: 创建 blueprint.js - 图纸识别核心逻辑

**Files:**
- Create: `blueprint.js`

**Interfaces:**
- Consumes: 无外部依赖，使用 `fileToDataURL` 和 `loadImage` 工具函数
- Produces: 全局 `BlueprintApp` 对象处理所有 blueprint 逻辑

- [ ] **Step 1: 创建文件头和状态管理**

```javascript
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
```

- [ ] **Step 2: 初始化和 DOM 绑定**

```javascript
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
```

- [ ] **Step 3: Tab 切换逻辑**

```javascript
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
```

- [ ] **Step 4: 步骤控制和 UI 更新**

```javascript
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
```

- [ ] **Step 5: 图片导入**

```javascript
  async function handleImageUpload(file) {
    if (!file || !file.type.startsWith('image/')) {
      toast('请上传图片文件', true);
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
      toast('图片加载失败', true);
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
```

- [ ] **Step 6: 缩放控制**

```javascript
  function handleZoom(delta) {
    const newZoom = Math.max(state.minZoom, Math.min(state.maxZoom, state.zoom + delta));
    if (newZoom !== state.zoom) {
      state.zoom = newZoom;
      renderCanvas();
    }
  }
```

- [ ] **Step 7: 裁剪框逻辑**

```javascript
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
```

- [ ] **Step 8: 格子框逻辑**

```javascript
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
```

- [ ] **Step 9: 计算和结果**

```javascript
  function confirmCrop() {
    // 从原图裁剪出图纸区域
    const { x, y, w, h } = state.cropRect;
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(w);
    canvas.height = Math.round(h);
    const ctx = canvas.getContext('2d');
    ctx.drawImage(state.originalImage, x, y, w, h, 0, 0, canvas.width, canvas.height);

    state.croppedWidth = canvas.width;
    state.croppedHeight = canvas.height;

    // 计算格子尺寸（基于裁剪区域）
    // 格子框的坐标是相对于原图的，需要转换到裁剪后的坐标系
    const gridX = state.gridRect.x - x;
    const gridY = state.gridRect.y - y;
    const gridW = state.gridRect.w;
    const gridH = state.gridRect.h;

    // 计算格子数量
    const cols = Math.floor(w / gridW);
    const rows = Math.floor(h / gridH);

    state.resultValue.textContent = `${cols} × ${rows}`;
    setStep(4);
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
```

- [ ] **Step 10: 重置和重新开始**

```javascript
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
```

- [ ] **Step 11: 事件绑定**

```javascript
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
```

- [ ] **Step 12: 初始化并导出**

```javascript
  // 初始化
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  return { switchTab };
})();
```

---

## Task 4: 集成测试

- [ ] **Step 1: 在浏览器中打开 index.html**

验证 Tab 导航显示正常。

- [ ] **Step 2: 切换到「图纸尺寸识别」Tab**

验证 blueprint 工作区显示，步骤1状态正确。

- [ ] **Step 3: 上传一张测试图片**

验证图片显示，步骤切换到2。

- [ ] **Step 4: 拖动裁剪框，点击确认**

验证格子框显示，步骤切换到3。

- [ ] **Step 5: 调整格子框，点击确认**

验证结果显示正确的格子数量。

- [ ] **Step 6: 测试重新开始功能**

验证可以重新开始整个流程。

- [ ] **Step 7: 测试缩放功能**

验证 +/- 按钮正常工作。

- [ ] **Step 8: 测试移动端适配**

调整浏览器窗口大小，验证布局正常。

---

## 任务清单汇总

- [ ] Task 1: 修改 index.html - 添加 Tab 导航和结构
- [ ] Task 2: 修改 styles.css - 添加 Tab 和 Blueprint 样式
- [ ] Task 3: 创建 blueprint.js - 图纸识别核心逻辑
- [ ] Task 4: 集成测试

---

## 自我审查

1. **Spec 覆盖**: 设计文档的所有功能点都有对应的任务实现
2. **占位符检查**: 无 TBD/TODO，所有步骤都有完整代码
3. **类型一致性**: 状态管理使用统一的对象结构，函数命名清晰
