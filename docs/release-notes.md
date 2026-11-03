# 1.0.0 — 本地版

- Windows x64：下载 `daggerheart-forge-1.0.0-windows-x64.zip`，解压后双击 `daggerheart-forge/start.cmd`。自带 Node.js，无需安装 npm 或构建工具。
- macOS / Linux / 已安装 Node.js 的 Windows：下载 `daggerheart-forge-1.0.0-node.zip`，进入 `daggerheart-forge`，用 Node.js 22.14+ 运行 `node build/server.mjs`，访问终端地址。
- 只用 skill：下载 `daggerheart-adversary-forge-1.0.0.zip`。整个文件夹独立可复制，离线检索不联网，API 六步分析按需调用 DeepSeek。
- `SHA256SUMS.txt` 提供各压缩包 SHA-256；`Get-FileHash <文件> -Algorithm SHA256` 可核验。

编辑器、文件管理、六步分析结果与卡片渲染均在本地运行。文稿和历史快照保存在应用目录下 `data/forge.sqlite`，不再使用 Cloudflare、账号、注册或云数据库。DeepSeek Key 只保存在本机进程内存中，重启后需重新填写。

升级前关闭应用并备份整个 `data/`，将其复制到新解压目录即可。程序不会上传旧数据库；API 分析会把当前文稿与参照发给 DeepSeek。已有云端可信 SQL 备份可用 `node scripts/import-cloud.mjs <备份路径> <空数据目录>` 迁移文稿与分析记录，不导入账号和密钥。

软件代码使用 MIT；SRD 与中文资料来源单独见 NOTICE.md。
