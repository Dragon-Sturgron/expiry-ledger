# 临期账本 · 药品效期管理（完整恢复版）

这是完整可部署版本，不需要再从旧仓库复制任何源码。

## 包含内容

- Vue 3 + Vite 手机端
- 药品蓝白医疗 UI
- 药品资料
- 药品效期记录
- 条码扫码
- 临期 / 过期统计
- 未来 30 天趋势
- 提醒设置
- EdgeOne Pages Functions
- EdgeOne KV
- 访问密码
- 七牛云图片上传
- 微信公众号绑定
- 定时临期通知
- `/admin/` 后台配置页

## 仓库结构

```text
.
├── edge-functions/
│   ├── api/
│   │   ├── auth/
│   │   ├── image/
│   │   ├── notify/
│   │   ├── upload/
│   │   ├── wechat/
│   │   ├── products.js
│   │   ├── records.js
│   │   ├── settings.js
│   │   ├── items.js
│   │   └── templates.js
│   └── utils/
├── scripts/
├── src/
├── edgeone.json
├── index.html
├── package.json
└── vite.config.js
```


## 2.2.0 UI 交互

- 首页底部只保留：`首页 / + / 我的`。
- 中间 `+` 固定打开“新增临期记录”。
- 首页四个统计卡片直接控制下方内容，不再显示额外筛选栏：
  - `全部药品`：默认，显示全部临期记录；
  - `即将过期`：只显示临期记录；
  - `已过期`：只显示已过期记录；
  - `我的分类`：先显示分类，选择分类后显示对应记录。
- 新增临期记录页按新版蓝白 UI 重新设计，包含：名称、分类、图片、标签、数量、数量预警、生产日期、期限、失效日期、提醒、条形码/二维码、存放位置、备注、同时保存到模板库。
- 药品资料管理从“我的”页面进入，不占用底部导航。

## EdgeOne 部署

1. 新建 GitHub 仓库，把本压缩包中的所有文件上传到仓库根目录。
2. EdgeOne Pages / Makers 创建项目并连接该仓库。
3. 绑定 KV 命名空间，变量名必须是：

```text
EXPIRE_KV
```

4. 如需访问密码，环境变量设置：

```text
ACCESS_PASSWORD=你的访问密码
ACCESS_TOKEN_SECRET=建议再设置一个随机长字符串
```

5. 构建设置通常会从 `edgeone.json` 自动读取：

```text
Install: npm install
Build: npm run build
Output: dist
```

6. 部署后：
   - 首页：`https://你的域名/`
   - 后台：`https://你的域名/admin/`

## 七牛云

进入 `/admin/` 填写：

- AccessKey
- SecretKey
- Bucket
- 图片公开访问域名
- 上传域名（默认 `https://upload.qiniup.com`）

## 微信公众号

进入 `/admin/` 填写：

- AppID
- AppSecret
- 模板消息 ID
- 网站域名

保存后点击“绑定微信”。

> 微信模板消息字段会因你实际选择的公众号模板而不同。当前代码默认使用 `thing1`、`date2`、`thing3` 三个字段。如果你的模板字段不同，只需修改 `edge-functions/utils/wx.js` 中 `sendTemplateMessage()` 的 `data`。

## 数据

该恢复版使用单 JSON 文档方式保存每个用户的药品、效期记录和设置，适合你目前少人数使用，也能显著降低每次请求的 KV 调用数量。

主要键：

```text
expiry_ledger_default_products
expiry_ledger_default_records
expiry_ledger_default_settings
expiry_ledger_default_wechat
```

## 本地前端开发

```bash
npm install
npm run dev
```

注意：本地 Vite 只负责前端，EdgeOne Functions / KV 最好在 EdgeOne 平台或 EdgeOne 本地开发工具中调试。


## v2.4 UI 调整

- 新增/编辑临期记录：提醒不再单独设置提前天数，统一使用“药品提醒设置”。
- 单条记录仍可通过开关决定是否参与提醒。
- 标签改为底部弹出的标签选择器，支持搜索、多选、新增，长按可编辑或删除。
- 已有旧记录里的 `remindDays` 字段继续兼容，但通知逻辑不再读取它。
