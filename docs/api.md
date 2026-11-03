# 本地 API

生产地址为 `http://127.0.0.1:8787`。先启动本地应用。浏览器通过 `GET /api/session` 获取 HttpOnly 会话；脚本从本地数据目录读取 `.api-token`，在每次请求中发送 `Authorization: Bearer <token>`。令牌随服务启动轮换，请勿发布该文件。服务拒绝外部 Host、跨站 Origin 和跨站 Fetch。

PowerShell 示例（在项目或解压目录执行）：

```powershell
$forgeToken = (Get-Content -Raw .\data\.api-token).Trim()
$forgeHeaders = @{ Authorization = "Bearer $forgeToken" }
$forgeBase = 'http://127.0.0.1:8787/api'
$forgeFile = Invoke-RestMethod "$forgeBase/nodes" -Method Post -Headers $forgeHeaders -ContentType 'application/json; charset=utf-8' -Body (@{kind='file'; name='敌人.md'} | ConvertTo-Json)
$forgeText = Get-Content -Raw -Encoding utf8 .\enemy.md
Invoke-RestMethod "$forgeBase/nodes/$($forgeFile.id)" -Method Patch -Headers $forgeHeaders -ContentType 'application/json; charset=utf-8' -Body (@{content=$forgeText} | ConvertTo-Json)
```

API Key 可在界面设置，或在启动服务前配置 `DEEPSEEK_API_KEY` 环境变量。密钥仅在内存中生效。用 `POST /api/runs` 的 `file_id` 创建分析，再轮询 `/api/runs/<id>`。

| 方法与路径（前缀 `/api`） | 输入 / 结果 |
| --- | --- |
| GET `/health` | `{ok:true, mode:"local"}` |
| GET `/nodes` | `{nodes:[...]}`，不含文稿正文 |
| POST `/nodes` | `{kind:"file"或"folder", name, parent_id?:null或文件夹ID}` → `{id}` |
| GET `/nodes/<id>` | `{node}`，含 content |
| PATCH `/nodes/<id>` | 可选 `{name, content, parent_id}`；拒绝循环目录 |
| DELETE `/nodes/<id>` | 递归删除目录内文稿；历史分析快照保留 |
| GET `/key` | `{configured}`；不返回密钥 |
| PUT `/key` | `{key}`，仅保存在内存 |
| DELETE `/key` | 清除当前密钥；已排队任务使用创建时捕获的密钥 |
| POST `/runs` | `{file_id}` → HTTP 202 `{id}`，使用文稿快照 |
| GET `/runs?file=<id>` | `{runs:[...]}`，最近 20 次，省略步骤与快照 |
| GET `/runs/<id>` | `{run}`，含 snapshot、status、current_step、steps |
| POST `/runs/<id>/retry` | 重试失败任务；保留已完成步骤 |
| GET `/export` | `{version:1,nodes,runs}`，完整工作区 JSON，无 Key |

任务在本机串行执行。服务重启后，未完成任务变为 failed，可重新设置 Key 后重试；不会自动续跑和产生 API 费用。六步的 result 格式见 skill 内 `references/contract.md`。请求体上限 1 MiB，单篇文稿上限 200,000 字符。错误对象为 `{error:"原因"}`；校验失败 400、会话失效 401、来源拒绝 403、不存在 404、请求过大 413。

## 使用独立 skill API

不需要启动界面或本地服务，也可以把 skill 文件夹复制到任意目录执行：

```powershell
$env:DEEPSEEK_API_KEY = '你的密钥'
node --experimental-strip-types .\scripts\cli.ts --input .\enemy.md --analyze --output .\analysis.json
Remove-Item Env:DEEPSEEK_API_KEY
```

纯离线证据检索用 JSON 输入，去掉 `--analyze`；无需 API Key。详细操作见 skill 的 SKILL.md。
