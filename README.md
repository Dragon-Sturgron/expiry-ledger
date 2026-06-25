# Expiry Ledger / 临期账本

EdgeOne Makers 预构建部署版。

## 本版核心变化

- 数据模式改为 **商品资料库 + 效期记录**。
- 商品资料保存名称、分类、条码、图片、默认保质期。
- 添加效期记录时引用商品资料，只填写数量、日期、到期时间等时效信息。
- 支持七牛云 Kodo 图片上传；KV 只保存图片 URL，不保存图片文件。
- 首页显示效期记录，也可以切换查看商品资料。
- 仍然支持访问密码、EdgeOne KV、微信公众号绑定和临期/过期通知。

## EdgeOne Makers 部署

本项目已经包含 `dist/`，并在 `edgeone.json` 中设置：

```json
{
  "installCommand": "echo skip install",
  "buildCommand": "echo skip build",
  "outputDirectory": "dist"
}
```

因此 EdgeOne Makers 会跳过 npm install 和构建，直接部署 dist。

## GitHub 上传

上传以下文件/目录：

```text
dist/
src/
edge-functions/
index.html
package.json
package-lock.json
edgeone.json
vite.config.js
README.md
.gitignore
.env.example
```

不要上传：

```text
node_modules/
.edgeone/
.env
.env.local
.npmrc
```

## 必须配置

### EdgeOne KV 绑定

在 EdgeOne Makers 项目中绑定 KV 命名空间，变量名必须是：

```text
EXPIRE_KV
```

### 访问密码

环境变量：

```text
ACCESS_PASSWORD=你的访问密码
ACCESS_AUTH_SALT=一串自定义随机字符
```

## 七牛云 Kodo 图片上传配置

环境变量：

```text
QINIU_ACCESS_KEY=七牛云 AccessKey
QINIU_SECRET_KEY=七牛云 SecretKey
QINIU_BUCKET=空间名称
QINIU_DOMAIN=https://你的图片访问域名
QINIU_UPLOAD_URL=https://upload.qiniup.com
```

说明：

- `QINIU_DOMAIN` 是图片访问域名，可以是七牛测试域名或你绑定的 CDN 域名。
- `QINIU_UPLOAD_URL` 按空间区域填写，华东常用 `https://upload.qiniup.com`，华南可用 `https://upload-z2.qiniup.com` 或七牛控制台提供的上传域名。
- 七牛空间需要允许网页跨域上传；如遇 CORS 问题，请在七牛控制台配置跨域来源为你的网站域名。

## 微信公众号通知配置

```text
WX_APPID=公众号 AppID
WX_SECRET=公众号 AppSecret
WX_TEMPLATE_ID=模板消息 ID
SITE_URL=https://你的正式域名
NOTIFY_SECRET=手动触发通知密钥
```

## 数据结构

商品资料：

```text
product_xxx
```

效期记录：

```text
record_xxx
```

旧版 `item_` 数据会在列表中兼容显示，但新增数据会使用新版 `record_` / `product_` 结构。


## 配置方式更新

本版已将七牛云图片上传和微信公众号通知参数移入页面「设置」中配置。EdgeOne Makers 环境变量只需要保留访问密码等基础参数；七牛云和微信参数可以在需要使用时再进入页面填写并保存。
