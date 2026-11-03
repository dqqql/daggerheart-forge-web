# 参与贡献

需要 Node.js 22.14+ 和 npm。运行 `npm ci`、`npm run dev`，打开终端显示的 `http://127.0.0.1:5173`。开发界面代理本机 8787 API；`npm start` 用于运行已构建版本。

提交前运行 `npm run check`、`npm test`、`npm run build`。服务测试使用临时数据库和模拟分析，不消耗 API 额度。

锻造算法、提示词和参考数据只在 `skills/daggerheart-adversary-forge/` 维护。该目录不能导入外层应用或依赖应用安装的 npm 包；移动出去后应仍能运行离线 CLI。界面、任务队列、SQLite 与本地 HTTP API 分别属于 `src/` 与 `server/`。

不要提交用户数据库、API Key、云端备份或模型生成的个人文稿。数据变更应说明来源、SRD 标记边界与基准计算口径，不能把自创内容标为官方。PR 请说明行为变化及验证结果。
