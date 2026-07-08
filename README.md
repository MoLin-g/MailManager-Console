# MailManager Console

一站式邮箱资产运营与 GPT 账号管理平台。

基于 Node.js + SQLite 的自托管系统，支持多用户隔离、邮箱资产管理、GPT 账号仓库、API 开放接口。

## 功能总览

- **邮箱资产管理** — 批量导入 Outlook/Hotmail 邮箱，刷新 Token 加密存储，自动扫描分类
- **GPT 账号仓库** — 手动导入 / 注册机 API 上报，支持导出 Sub2/CPA/Cockpit 格式
- **邮件实时查看** — 收件箱 + 垃圾箱双文件夹轮询，验证码自动提取
- **邮箱分配 API** — `POST /api/mailboxes/reserve` 原子预留，防止并发冲突
- **自动化巡检** — CPA 凭证扫描删除、GPT Token 刷新（Microsoft Graph OAuth）
- **Wenas 卡密集成** — 卡密同步、核检任务提交与结果回写
- **API 中心** — 创建/启用/禁用 API Key，查看调用日志，开放接口文档
- **用户管理** — 管理员创建账户、重置密码、禁用/启用、删除
- **邀请码注册** — 支持有效期和最大使用次数限制
- **系统设置** — 注册开关、管理员配置

## 技术栈

| 层级 | 技术 |
|------|------|
| 后端 | Node.js 原生 `http` 模块 |
| 数据库 | better-sqlite3（WAL 模式） |
| 加密 | AES-256-GCM（Token 加密）/ PBKDF2-SHA256（密码哈希） |
| 前端 | 纯 HTML/CSS/JS（无框架），Feather Icons |
| 部署 | Docker 22-bookworm-slim + docker-compose |

## 快速开始

```bash
cp .env.example .env
docker-compose up -d --build
```

浏览器打开：

```text
http://127.0.0.1:8009
```

本地 Node 开发（需要 Node 18+）：

```bash
npm install
npm start
```

## 环境变量

```env
ADMIN_USERNAME=admin          # 默认管理员用户名
ADMIN_PASSWORD=admin123       # 默认管理员密码
DATA_KEY=change-this-secret   # 加密密钥（勿更换，否则 Token 无法解密）
PORT=8009                     # 服务端口
HOST=0.0.0.0                  # 监听地址
REGISTRATION_ENABLED=false    # 是否开放注册
```

## 邮箱分配 API

外部注册机通过 API Key 分配邮箱：

```bash
# 预留邮箱（consume=true 立即标记已用，防止并发）
curl -X POST "http://127.0.0.1:8009/api/mailboxes/reserve" \
  -H "Authorization: Bearer mak_xxx" \
  -H "Content-Type: application/json" \
  -d '{"category":"safe","consume":true}'

# 轮询验证码
curl -H "Authorization: Bearer mak_xxx" \
  "http://127.0.0.1:8009/api/mail/code?email=user@hotmail.com&keyword=code,验证码,verification code,OpenAI,ChatGPT&limit=10&folders=inbox,junk"

# 超时/无码上报
curl -X POST "http://127.0.0.1:8009/api/mailboxes/report-code" \
  -H "Authorization: Bearer mak_xxx" \
  -H "Content-Type: application/json" \
  -d '{"email":"user@hotmail.com","result":"timeout","detail":"180s no verification code"}'
```

## GPT 账号 API

```bash
curl -X POST "http://127.0.0.1:8009/api/gpt-accounts/report" \
  -H "Authorization: Bearer mak_xxx" \
  -H "Content-Type: application/json" \
  -d '{"dedupe_key":"batch-001:user@example.com","result":"success","account":{"email":"user@example.com","password":"pass"},"auth_file":{"email":"user@example.com","refresh_token":"rt_xxx"}}'
```

Web 控制台支持导入、筛选、归档、删除、导出 GPT 账号。

## 数据库表

| 表名 | 说明 |
|------|------|
| `users` | 用户（含角色、禁用状态） |
| `accounts` | 邮箱资产（主表，含分类/状态/生命周期字段） |
| `gpt_accounts` | GPT 账号 |
| `api_keys` | API 密钥（SHA-256 哈希存储） |
| `api_key_logs` | API 调用日志 |
| `api_events` | 操作审计日志 |
| `mail_rules` | 邮件分类规则 |
| `mail_query_links` | 邮件查询链接 |
| `sessions` | 登录会话 |
| `invites` | 邀请码 |
| `settings` | 系统设置（KV） |
| `gpt_jobs` | GPT 任务队列 |
| `gpt_error_rules` | GPT 错误分类规则 |
| `gpt_exports` | GPT 导出记录 |
| `gpt_events` | GPT 事件日志 |
| `phone_code_pool` | 手机号池 |
| `wenas_configs` | Wenas 集成配置 |

## 安全注意事项

- 不要将 `.env`、`data/`、SQLite 文件、API Key 提交到公开仓库
- 生产环境使用 HTTPS 反向代理
- 公开查询链接和 API Key 均为持票凭证，妥善保管
- `DATA_KEY` 一旦设置请勿更换，否则已加密的 Refresh Token 将无法解密

## 验证

```bash
node --check server.js
node --check public/assets/app.js
```

## License

MIT
