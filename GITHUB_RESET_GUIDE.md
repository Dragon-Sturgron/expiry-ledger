# GitHub 清空后重新上传步骤

## 推荐方式：直接删除仓库后重建

如果仓库还没有重要历史记录，这是最简单的方式：

1. 打开 GitHub 仓库 `expiry-ledger`。
2. 进入 `Settings`。
3. 拉到最底部 `Danger Zone`。
4. 点击 `Delete this repository`。
5. 按提示输入仓库名确认删除。
6. 重新创建一个同名仓库：`expiry-ledger`。
7. 上传本项目压缩包解压后的所有文件。

## 保留仓库，只清空文件：Git 命令方式

```bash
git clone https://github.com/Dragon-Sturgron/expiry-ledger.git
cd expiry-ledger

# 删除旧文件，但保留 .git
git rm -r .

# 把新版项目文件复制进这个目录
# 注意不要复制 node_modules、.env、.edgeone

git add .
git commit -m "reset expiry ledger project"
git push
```

## GitHub 网页方式

GitHub 网页端不适合批量清空很多文件。
如果旧文件很多，建议使用“删除仓库后重建”或使用 Git 命令。

如果只想网页操作：

1. 进入仓库文件列表。
2. 逐个打开旧文件。
3. 点击右上角垃圾桶图标删除。
4. 删除旧目录下所有文件后，再上传新版文件。

不推荐这种方式，文件多时很慢。
