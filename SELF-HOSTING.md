# 每个人连接自己的 Notion

## 1. 准备数据库

将独立空白模板复制到自己的工作区。公开复制链接目前待维护者发布；向导在链接为空时隐藏复制按钮，提供同样可用的手工字段表。

| 字段 | 类型 | 必需 |
| --- | --- | --- |
| 标题 | Title | 是 |
| 日期 | Date | 是 |
| 记录人 | Select | 是，可填写自己的名字 |
| 标签 | Multi-select | 是 |
| 日记ID | Text / Rich text | 是，已有值不要改 |
| 已删除 | Checkbox | 是，跨设备软删除 |
| 原始创建时间 | Number | 是，保留排序 |
| 同步操作 | Text / Rich text | Worker首次写入可自动补建 |
| 创建时间 | Created time | 推荐 |
| 最后编辑时间 | Last edited time | 推荐 |

正文写在每条记录的页面内容中，不需要另建正文属性。建议视图：全部日记按日期倒序且排除已删除；日历按日期且排除已删除；回收站只显示已删除。

创建 Notion API token 连接，只开启读取、插入、更新内容；不需要用户信息、评论或 Agent 权限。在数据库连接菜单授权它。普通共享链接不能替代连接授权。复制模板不自动复制作者的 Token 或授权。

## 2. 一键进入 Cloudflare 部署

[Deploy to Cloudflare](https://deploy.workers.cloudflare.com/?url=https%3A%2F%2Fgithub.com%2Fsugatsu7-claude%2Ftimeline-diary%2Ftree%2Fmain%2Fworker)

按钮指向独立的 `worker/` 子项目。Cloudflare会复制代码到你自己的GitHub，安装依赖并部署；登录/授权及下面的参数要由本人填写。

| 配置 | 放哪里 | 内容 |
| --- | --- | --- |
| NOTION_TOKEN | Cloudflare Secret | 自己的Notion API token |
| WORKER_SECRET | Cloudflare Secret | 自己生成的随机长连接码，建议32位以上 |
| NOTION_DATABASE_ID | Cloudflare Secret | 自己复制后的数据库链接或数据库ID |
| ALLOWED_ORIGIN | Wrangler变量 | PWA的协议和域名，不含项目路径 |

前三项由 `.dev.vars.example` 告知部署流程提示填写，文件中只有空占位，没有真实凭据。默认 ALLOWED_ORIGIN 适用于公开PWA：`https://sugatsu7-claude.github.io`；自行托管者必须改为自己的来源，向导会显示当前值。仓库不保存用户提供的Secret。

Worker从数据库元数据解析唯一数据源，在当前实例缓存1小时；不会轮询。若数据库中有多个数据源，会停止并提示明确填写 `NOTION_DATA_SOURCE_ID`。旧用户保留已有的这个变量即可，不需要更换为链接模式。

可选CLI部署：在worker目录执行 `npm ci`、`npm run deploy`，按Cloudflare要求配置上述Secret。真实 `.dev.vars`、`.env` 和node_modules已被Git忽略，禁止提交。

## 3. 在 PWA 检查并保存

设置 → 首次连接向导 → 填入自己的Worker根地址和连接码 → 检查连接 → 保存连接。Token不填PWA。

`/setup/check` 使用同样的连接码和来源校验，仅读取数据库/字段结构，不查日记正文、不创建样本、不写Notion。页面不会自动发起连接检查；修改地址或连接码后旧检查失效。失败保留原连接，保存地址与记住的码在本机同一事务提交。

保存不触发同步。返回首页由本人主动点击同步，先用一条测试日记确认两个方向修改。新用户不必使用作者的Worker。

## 已有用户

本版不更换现有连接、不迁移本机存储。仅为了使用向导的检查接口才需更新Worker；正常手动同步继续兼容原有可靠性版Worker。如果检查显示接口不存在，按提示更新Worker，或者继续使用原有设置和同步按钮。

浏览器/PWA的站点存储依然可能因清理或系统回收丢失，记住的连接码不是独立备份。定期将ZIP备份保存到别处。

## 发布模板的最后一步

1. 在Notion中只发布独立的空白模板，确认没有个人记录、私人数据库关联、密钥或个人说明。
2. 开启允许复制，使用未登录浏览器确认可访问且可复制。
3. 将公开URL填进 `setup-config.js` 的 `notionTemplateUrl`，README加入同一链接，再升前端版本。

当前工具不能代替作者切换Notion的公开发布设置，因此代码没有假设私人页面已公开；模板按钮不会跳到无权限页面。

Cloudflare流程依据：[Deploy to Cloudflare 官方文档](https://developers.cloudflare.com/workers/platform/deploy-buttons/)。部署dry-run能验证打包配置，不等同于已用个人Cloudflare/Notion账号完成线上验收。
