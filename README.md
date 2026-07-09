# Netdisk Paste Downloader

一个用于 Chrome 的网盘分享下载辅助插件。把百度网盘或夸克网盘分享文字粘进插件弹窗，插件会自动识别分享链接和提取码，并在网页里尝试完成提取、选择文件和下载。

## 功能

- 支持百度网盘分享链接
- 支持夸克网盘分享链接
- 支持一次粘贴多段分享文字
- 自动识别链接、提取码、访问码
- 自动打开分享页、填写提取码、选择文件、点击下载
- 不读取、不导出 cookies，直接使用当前 Chrome 已登录状态

## 安装

1. 下载或克隆本项目。
2. 打开 Chrome，进入 `chrome://extensions/`。
3. 打开右上角“开发者模式”。
4. 点击“加载已解压的扩展程序”。
5. 选择项目里的 `extension` 文件夹。

macOS 示例路径：

```text
/Users/edy/Documents/vscode/down_data/extension
```

Windows 示例路径：

```text
D:\down_data\extension
```

## 使用

1. 先在当前 Chrome 里登录百度网盘或夸克网盘。
2. 点击浏览器右上角插件图标。
3. 粘贴分享文字。
4. 点击“开始”。

百度网盘示例：

```text
通过网盘分享的文件：01.mp4
链接: https://pan.baidu.com/s/xxxxxxxx 提取码: abcd
```

夸克网盘示例：

```text
我用夸克网盘给你分享了「壁纸_1.jpg」，点击链接或复制整段内容，打开「夸克APP」即可获取。
链接：https://pan.quark.cn/s/xxxxxxxx
提取码：abcd
```

插件会分别打开识别出的分享页面。页面右下角会出现“网盘插件”状态提示。

## 更新插件

如果修改了插件代码，需要回到 `chrome://extensions/`，点击本插件卡片上的“重新加载”按钮。

## 注意事项

- 本插件不会绕过验证码、风控、会员限制、平台权限或付费限制。
- 遇到验证码、浏览器下载确认、登录确认时，需要手动处理。
- 仅用于下载你有权限访问的分享文件。
- 网盘网页经常改版，如果按钮失效，需要根据新页面结构更新选择器。

## 目录

```text
extension/
  manifest.json
  popup.html
  popup.css
  popup.js
  background.js
  content.js
```

## 许可证

MIT
