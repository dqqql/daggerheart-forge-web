# 匕首之心敌人锻炉 · Daggerheart Forge

本地运行的原创敌人编辑管理工具，提供文件树、多标签 Markdown 编辑器、DeepSeek API 六步分析，以及参照资料、数值理由和最终卡片的格式化展示。

**skill 是独立本体，应用提供编辑、管理与渲染界面。** 整个 `skills/daggerheart-adversary-forge/` 可以直接复制出去使用，应用复用该目录的算法、提示词与数据。

## 下载即用

前往 [Releases](https://github.com/dqqql/daggerheart-forge-web/releases/latest)：

| 下载 | 使用方式 |
| --- | --- |
| `daggerheart-forge-1.0.0-windows-x64.zip` | Windows x64，内含 Node.js；解压到可写目录，双击 `daggerheart-forge/start.cmd` |
| `daggerheart-forge-1.0.0-node.zip` | 跨平台，需 Node.js 22.14+；在解压目录运行 `node build/server.mjs` |
| `daggerheart-adversary-forge-1.0.0.zip` | 仅独立 skill；需 Node.js 22.14+，无需 npm install |
| `SHA256SUMS.txt` | 压缩包校验值，可用 PowerShell `Get-FileHash` 检查 |

界面地址为 `http://127.0.0.1:8787`。Windows 启动器自动打开浏览器；终端需保持运行，用 Ctrl+C 关闭。不需要注册、Cloudflare 或云数据库。

1. 新建文件夹或敌人 Markdown 文件，填写名称、位阶、类型、描述、动机战术和特性。
2. 在设置中填写自己的 DeepSeek API Key，点击开始分析。
3. 查看参照 → 区间 → 推荐 → 特性匹配 → 术语 → 最终卡片。结果来自任务创建时的快照，可复制或写回编辑器。

编辑、管理和已有结果展示均在本机完成。**API 分析仍需联网，会向 DeepSeek 发送当前文稿及参照，使用你的 API 额度。** Key 仅在服务内存中保存，关闭后清除；也可在启动前设置 `DEEPSEEK_API_KEY` 环境变量。离线 skill 证据检索无需 Key。

## 独立使用 skill

将 [skills/daggerheart-adversary-forge](skills/daggerheart-adversary-forge) 整个文件夹复制到支持 SKILL.md 的工具的技能目录，或下载专用压缩包。不要只复制 SKILL.md，脚本与 data 都是必需资源。

在该目录准备 `enemy.json`：

```json
{"name":"灰烬门卫","tier":1,"type":"标准","description":"持盾守门的守卫","motives_tactics":"阻挡闯入者，掩护同伴","features":["盾墙 - 被动：当附近有同伴时，获得防御优势。"],"locked_stats":{"difficulty":12}}
```

```powershell
node --experimental-strip-types .\scripts\cli.ts --input .\enemy.json --output .\evidence.json
```

离线证据包包括候选参照、设计区间、初算数值、特性匹配和 Markdown，标记 `needs_review: true`，需 Agent 或人工审阅。通过 DeepSeek 完成六步分析：配置 `DEEPSEEK_API_KEY`，使用 Markdown 输入并添加 `--analyze`。见 [SKILL.md](skills/daggerheart-adversary-forge/SKILL.md) 和[输入输出契约](skills/daggerheart-adversary-forge/references/contract.md)。

本仓库 skill 采用应用当前的六步输出契约；此前另行安装的 Python skill 不会被覆盖，两者不是彼此的运行依赖。

## 本地数据与升级

数据目录默认为应用根目录下 `data/`，文稿、文件树和分析记录保存在 `forge.sqlite`。清除浏览器缓存不会删除文稿。Key 不写入数据库。

- 备份：关闭服务后复制整个 `data/`，包含存在时的 SQLite WAL 文件。
- 升级：解压新版本，关闭旧版，把 `data/` 放入新版本根目录后启动。不要同时启动两个版本访问同一数据库。
- 自定义位置：启动前设置 `$env:FORGE_DATA_DIR = 'D:\MyForgeData'`。
- 自定义端口：设置 `$env:PORT = '8788'`，访问终端显示地址；始终只监听 127.0.0.1。
- 工作区 JSON 导出与脚本调用见[本地 API](docs/api.md)。

旧云端可信 D1 SQL 备份可在服务关闭时迁入空目录：

```powershell
node .\scripts\import-cloud.mjs 'D:\Backups\forge.sql' 'D:\MyForgeData'
```

迁移保留文稿和分析快照，转换旧七条记录布局为六步，不导入账号、密码或 Key。只对你信任的 SQL 备份执行。云部署已停用，工程不再包含部署命令。

## 开发与结构

需要 Node.js 22.14+、npm：

```powershell
npm ci
npm run dev
```

开发界面为 `http://127.0.0.1:5173`，自动代理本机 API。生产运行：

```powershell
npm run check
npm test
npm run build
npm start
```

```text
skills/daggerheart-adversary-forge/  独立 skill：规则、提示词、脚本、数据与许可
src/                               React 编辑管理与结果渲染
server/                            本地 HTTP API、SQLite、分析队列
shared/                            界面类型与 skill 渲染函数的薄转发层
scripts/                           开发、构建、打包、旧数据迁移
tests/                            本地存储、快照与重试测试
docs/                              API 与发布说明
.github/workflows/                 Windows / Linux CI 与标签发布
```

skill 不导入界面或服务，也没有 npm 运行依赖。应用从该目录构建分析逻辑，修改 skill 脚本后应重新构建应用。`npm run release:prepare` 检查并生成压缩包和校验值；Windows 上额外包含当前 Node.js 可执行文件。推送匹配 package.json 版本的 `v*` 标签自动发布 Release。

参与方式见 [CONTRIBUTING.md](CONTRIBUTING.md)，安全说明见 [SECURITY.md](SECURITY.md)。代码与原创文档采用 [MIT](LICENSE)；SRD、中文翻译及商标不在 MIT 授权范围，见 [NOTICE.md](NOTICE.md)。推荐值是设计建议，不是官方认证。

This product includes materials from the Daggerheart System Reference Document 2.0, © Critical Role, LLC. under the terms of the Darrington Press Community Gaming (DPCGL) License. This project is not affiliated with or endorsed by Darrington Press or Critical Role.
