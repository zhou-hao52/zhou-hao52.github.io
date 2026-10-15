# 周昊 · 个人作品集

零构建的纯静态单页作品集。没有框架、没有依赖、没有构建步骤 —— 打开 `index.html` 就能看。

## 怎么改文案

**所有文字都在 `index.html` 里**，按章节顺序排好，直接编辑对应段落即可：

| 章节 | 在 index.html 里的位置 |
|---|---|
| 01 Intro 首屏 | `<section id="intro" class="hero">` |
| 02 Selected Works 项目 | `<section id="works" class="works">` |
| 03 Design 美工 | `<section id="design" class="design">` |
| 04 Journey 荣誉时间线 | `<section id="journey" class="journey">` |
| 05 Contact 页脚 | `<footer id="contact" class="foot">` |

改完保存、刷新浏览器即可看到效果，不需要任何命令。

## 本地预览

```bash
python -m http.server 8099 -d site
```

然后打开 `http://127.0.0.1:8099/`。直接用 `file://` 双击打开也可以，只是首屏动态山脊会因为浏览器的模块加载限制自动降级成静态图（这是设计好的降级路径，不是故障）。

## 目录结构

```
site/
├─ index.html              整站唯一的内容源
├─ 404.html                404 页
├─ favicon.svg  og.png     图标与社交分享图
├─ robots.txt  sitemap.xml
└─ assets/
    ├─ css/base.css        设计令牌 + 重置 + 通用组件（导航/页脚/灯箱/滚动动画）
    ├─ css/sections.css    五个章节各自的布局
    ├─ js/main.js          导航高亮、深浅色切换、质量档位、灯箱、视频懒加载
    ├─ js/hero-ridge.js    首屏「信号山脊」Canvas 2D 绘制
    ├─ fonts/              Instrument Serif（latin 子集，OFL 授权，自托管）
    ├─ img/                作品封面、海报、PPT 页图（webp + avif 双份）
    └─ video/              4 段演示视频（H.264）与海报帧
```

## 设计系统

配色与字号的令牌集中在 `assets/css/base.css` 顶部的 `:root`：

- 纸白 `--paper: #f1efea`／墨黑 `--ink: #121212`／信号红 `--signal: #e5482d`／珞珈绿 `--luojia: #2f5d50`
- 深色章节（Design、页脚）用 `--lab-bg: #0c0c0d` 与酸绿点缀 `--lab-acid: #c8ff3c`
- 标题字体 Instrument Serif，正文走系统字体栈，中文自动落到宋体

## 几个可以调的地方

- **质量档位**：右上角「质量 Auto」按钮在 Auto / High / Balanced / Lite 之间循环，选择记在 `localStorage` 的 `sd:tier`，决定首屏山脊的分辨率与正弦阶数。
- **山脊高度**：`assets/js/hero-ridge.js` 里的 `RESERVE`（底部为不透明信息带预留的像素高度）与 `LAYERS` 各层的 `base` / `amp`。
- **深浅色切换**：章节上的 `data-tone="dark"` 会驱动导航文字变色，新增深色章节照抄这个属性即可。
- **视频**：`preload="none"`，滚进视口前 200px 才加载，所以首屏不会下载任何视频。

## 无障碍与降级

- `prefers-reduced-motion: reduce` 下所有动画与山脊动效停止（山脊退化为静态一帧）。
- 关闭 JavaScript 时首屏显示静态 `ridge.svg`，内容全部可读。
- 页内所有图片都带 `width` / `height`，避免布局抖动。
- 灯箱支持 Esc 关闭、点击遮罩关闭，并把焦点还给触发元素。

## 授权

`assets/fonts/` 下的 Instrument Serif 为 SIL Open Font License 1.1，可自由自托管。
站内所有作品图与视频版权归作者本人所有。
