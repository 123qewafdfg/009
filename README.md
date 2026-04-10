# PassLok 图像隐写术

这是一个可直接上传到静态网站托管平台的前端站点。

## 目录结构

- `index.html`：站点入口文件
- `assets/css`：样式文件
- `assets/js`：脚本文件
- `assets/icons`：站点图标
- `sw.js`：离线缓存 Service Worker
- `site.webmanifest`：PWA 基础配置

## 托管要求

- 需要支持静态文件托管
- 建议使用 HTTPS，以便浏览器正常启用 Service Worker
- 上传时保持目录结构不变

## 可直接部署的平台

- Cloudflare Pages
- Vercel 静态站点
- Netlify
- GitHub Pages
- 腾讯云静态网站托管

## 部署说明

1. 将当前目录全部文件原样上传。
2. 确保首页文件名为 `index.html`。
3. 不要改动 `assets`、`sw.js`、`site.webmanifest` 的相对路径。
