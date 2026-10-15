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

## 部署与更新

站点已发布两处：

| 方式 | 地址 | 说明 |
|---|---|---|
| 平台托管 | <https://zhouhao-portfolio.app.workbuddy.host/> | 国内访问快，改完内容在对话里说一声即可重新发布 |
| GitHub Pages | <https://zhou-hao52.github.io/> | 永久地址，仓库 `zhou-hao52/zhou-hao52.github.io` |

**关于推送**：本机网络下 `github.com` 的 HTTPS 被阻断（TCP 能连上、TLS 被重置），
所以不能用常规 `git push` / `gh auth login --web`。改完内容后用项目根目录的脚本推送：

```bash
python tools/08_push_github.py
```

该脚本走 `api.github.com`（可达），用 Git Data API（blobs → tree → commit → ref）
整体推送，token 自动从系统凭据管理器读取，无需手动配置。
追加 `--enable-pages` 可同时检查 Pages 状态，`--dry-run` 只列出待上传文件。

若日后网络恢复，也可用常规方式：`git remote add origin git@github.com:zhou-hao52/zhou-hao52.github.io.git`
（SSH 22 端口实测可达，但需先把本机 `~/.ssh/id_ed25519.pub` 加到 GitHub 账号的 SSH keys 里）。

## 以后部署别的站点

GitHub Pages 的地址规则：**用户页每个账号只能有一个**（`zhou-hao52.github.io`，占根域，已被本站占用），
但**项目页不限数量**——任意其它仓库都对应一个独立地址：

```
https://zhou-hao52.github.io/<仓库名>/
```

一个仓库就是一个站点，互不干扰。要部署新站点，一条命令：

```bash
cd "D:\OneDrive\Desktop\简历优化"
python tools\08_push_github.py --dir <站点目录> --repo <仓库名> --create --enable-pages
```

仓库不存在会自动创建（公开），随后自动开启 Pages 并打印访问地址。

常用参数：

| 参数 | 作用 |
|---|---|
| `--dir` | 要部署的本地目录（默认项目内的 `site/`） |
| `--repo` | 仓库名，决定子路径；不写则用目录名 |
| `--create` | 仓库不存在时自动新建 |
| `--enable-pages` | 推送后开启并检查 Pages |
| `--custom-domain` | 绑定自定义域名，如 `www.example.com` |
| `--dry-run` | 只列出待上传文件与最终地址，不推送 |
| `--owner` | 换账号或组织（组织可另得一个根域 `org.github.io`） |

**一个硬性要求**：项目页跑在子路径下，所以站点内部必须用**相对路径**引用资源
（写 `assets/x.css` 而不是 `/assets/x.css`），否则会 404。本站已经是相对路径，改文案不会破坏这点。

想要更好看的地址可以买域名（`.com` 约 ¥50/年），再 `--custom-domain` 绑上来，任意 Pages 仓库都能绑。

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
