# 小红书封面生成器

把 PSD 模板导出的 PNG 上传一次,以后每天打开网页填个标题、换张主图,一键下载成 PNG 拿去发小红书。

## 用法

### 第一次

1. 打开网页
2. 点「上传模板」,选一张从 PSD 导出的 PNG
3. 弹出位置配置弹窗 —— 填入画布尺寸、主图矩形坐标、标题位置,保存
4. 进入工作区,可以开始用了

### 日常

- 在左侧填大标题、上传主图
- 调字号、字色、X/Y 偏移
- 右边实时预览
- 点「⬇ 下载 PNG」存到本地

### 调位置

右上角「⚙️ 调整位置」随时可以改矩形和坐标,适合发现哪里没对齐时回来微调。

## 本地预览

```sh
cd cover-template
python3 -m http.server 8000
```

浏览器打开 http://localhost:8000 即可。

(直接双击 `index.html` 也能跑,但推荐起一个本地服务,避免某些浏览器的 `file://` 协议限制。)

## 部署到 GitHub Pages

1. 在 GitHub 新建一个公开仓库,名字比如 `cover-template`(小写连字符)
2. 推到 `main` 分支
3. 仓库 `Settings → Pages → Build and deployment → Source: Deploy from a branch → Branch: main / root`
4. 等几十秒,访问 `https://<你的用户名>.github.io/cover-template/`

之后每次 `git push` 就会自动重新部署。

> 提示:GitHub Pages 走 HTTPS,Canvas 的 `toDataURL` 不会遇到 CORS 问题(模板存在 localStorage,不是跨域图片)。

## 验收清单

- [ ] 首次打开 → 看到「上传模板」空状态
- [ ] 上传 PSD 导出的 PNG → 弹出配置弹窗
- [ ] 配置矩形和标题位置 → 关闭弹窗 → 预览显示原图
- [ ] 输入标题 → 标题按配置位置显示
- [ ] 改字号/颜色 → 实时变化
- [ ] 上传主图 → 主图按 cover 模式填满矩形(多余部分裁剪)
- [ ] 改 X/Y 偏移 → 标题微调
- [ ] 点下载 → 拿到 PNG,尺寸 = 配置的画布尺寸(用 macOS 预览或 `file` 命令验证)
- [ ] 刷新页面 → 模板和配置保留
- [ ] 点页面底部「清空所有数据」 → 回到首次状态

## 数据存在哪

模板 PNG 和位置配置都存在浏览器的 `localStorage` 里,**不会上传到任何服务器**。

- `coverTemplateDataUrl`:模板 PNG 的 dataURL
- `coverTemplateConfig`:位置/字号 JSON

换浏览器、换电脑、清浏览器数据后需要重新上传。

## 文件结构

```
cover-template/
├── index.html     单页 UI
├── styles.css     样式
├── app.js         渲染/上传/下载逻辑(纯 JS,无依赖)
└── README.md      本文件
```

不需要 npm install,没有构建步骤。
