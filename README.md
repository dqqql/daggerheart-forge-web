# 敌人锻炉网页

独立于 `daggerheart-adversary-forge` skill 的桌面网页工程。React + Vite 提供 VS Code 风格的文件树、Markdown 即时排版和七步只读分析；Cloudflare Pages Functions、D1、Worker Workflows 处理账号、保存与后台任务。

## 开发

需要 Node.js 22、Cloudflare Wrangler 登录。运行 `npm install`、`npx wrangler d1 migrations apply daggerheart-forge --local`、`npm run build`、`npx wrangler pages dev dist --persist-to <项目目录>\.wrangler\state`。后台 Workflow 需另起终端运行 `npx wrangler dev --config worker/wrangler.jsonc --persist-to <项目目录>\.wrangler\state`；两个进程须共用本地 D1 状态目录。`npm test`、`npm run check` 检查核心算法与 TypeScript。

在项目根目录与 `worker/` 目录分别放置不提交的 `.dev.vars`，两处 `ENCRYPTION_KEY` 必须相同，内容为随机 32 字节的 base64。根目录开发配置另加 `REGISTRATION_ENABLED=true`。生产环境把相同的密钥分别设置为 Pages 和 Worker 的 Secret。不得提交密钥或玩家的 DeepSeek Key。

## 部署准备

1. 仓库保持私有。`worker/data/adversaries.json` 来源于原 skill 中文站点快照中 `source_status == "srd"` 的 264 条；`benchmarks.json` 只保留融合数值区间和 SRD 样本数，不包含第三方指南原文或历史工作簿内容。原始 `sources/` 未复制到本仓库。
2. 用户已确认 SRD 内容可以公开分发。站点的“版权与来源”面板载明 DPCGL 2.0、官方 SRD、中文快照及本站的整理修改；SRD 敌人与特性的弹窗仍不设置逐条跳转链接。
3. D1 数据库名为 `daggerheart-forge`；运行 `npx wrangler d1 migrations apply daggerheart-forge --remote`。两个 Wrangler 配置必须指向同一个 D1 ID。
4. 先部署内部 Worker：`npx wrangler deploy --config worker/wrangler.jsonc`。它设置了 `workers_dev=false`，只通过 Pages 的 Service Binding 接收启动请求。使用 `npx wrangler secret put ENCRYPTION_KEY --config worker/wrangler.jsonc` 设置密钥。
5. Cloudflare Pages 项目已连接本私有仓库的 `main`，构建命令为 `npm run build`，输出目录为 `dist`。Wrangler 配置含 D1 `DB`、服务绑定 `FORGE_WORKER` 和生产注册开关 `REGISTRATION_ENABLED=true`；Pages Secret `ENCRYPTION_KEY` 已配置。`main` 推送触发生产自动部署。

## 接口与边界

`/api/auth/{register,login,logout,me}` 管理账号；`/api/nodes` 管理文件树与 Markdown；`/api/key` 保存或删除加密密钥；`/api/runs` 创建和读取快照任务。每个请求按会话用户限定数据。密码使用 PBKDF2-SHA-256 与独立盐；会话为 HttpOnly、SameSite=Strict Cookie。用户名密码首版不提供自助找回。

后台固定七步：SRD 参照、基准、推荐值及基础数据块、逐特性匹配、术语建议、机制复核、最终卡片。模型结果须通过结构校验，失败步骤保留错误并可重试。数值与匹配仍属于创作建议，不宣称官方认证。站内引用不提供跳转链接，数据内部保留原始 URL 供维护核查。
