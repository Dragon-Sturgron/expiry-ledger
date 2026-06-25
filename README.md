# Expiry Ledger（临期账本）

适配腾讯 EdgeOne Makers 的移动端网页项目。

## 功能

- 访问密码保护：通过 `ACCESS_PASSWORD` 环境变量控制。
- 商品/物品临期记录：新增、编辑、删除、详情、分类、标签、搜索。
- 条形码/二维码扫码：浏览器 HTTPS 环境下调用摄像头识别。
- 图片链接展示。
- 模板库：保存常用物品模板并复用。
- 数据存储：EdgeOne KV，绑定变量名必须为 `EXPIRE_KV`。
- 微信公众号绑定：通过网页授权获取 openid。
- 临期/过期通知：通过公众号模板消息发送，定时任务每天 08:00 执行 `/api/notify/run`。

## EdgeOne Makers 部署说明

本包是“预构建部署版”：已经包含 `dist/`，并且 `edgeone.json` 已设置跳过依赖安装和构建。

```json
{
  "installCommand": "echo skip install",
  "buildCommand": "echo skip build",
  "outputDirectory": "dist"
}
```

这样可以避免 EdgeOne 构建环境卡在 `npm install`。

## 需要配置的参数

### KV 绑定

- `EXPIRE_KV`：EdgeOne KV 命名空间绑定变量，不是普通环境变量。

### 环境变量

```env
ACCESS_PASSWORD=你的访问密码
ACCESS_AUTH_SALT=可选，建议填写一串复杂字符

WX_APPID=你的公众号AppID
WX_SECRET=你的公众号AppSecret
WX_TEMPLATE_ID=你的公众号模板消息ID
SITE_URL=https://你的正式域名

NOTIFY_SECRET=可选，手动触发通知接口时使用
```

## GitHub 上传内容

需要上传：

- `dist/`
- `src/`
- `edge-functions/`
- `index.html`
- `package.json`
- `package-lock.json`
- `edgeone.json`
- `vite.config.js`
- `README.md`
- `.gitignore`
- `.env.example`

不要上传：

- `node_modules/`
- `.edgeone/`
- `.env`
- `.env.local`

## 本地二次开发

```bash
npm install --registry=https://registry.npmmirror.com
npm run dev
```

每次改前端后，先本地构建再提交：

```bash
npm run build
git add .
git commit -m "update"
git push
```
