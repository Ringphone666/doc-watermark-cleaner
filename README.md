# 留白 · Word 水印工具

一个无需后端、在浏览器本地处理旧版 Word `.doc` 图片水印的静态工具。

部署后的默认地址：https://ringphone666.github.io/doc-watermark-cleaner/

## 使用

1. 选择 Word 97–2003 `.doc` 文件（最大 32 MB）。
2. 检查图片预览。明确命名的水印默认勾选；页眉横幅等未明确命名的图片需要手动勾选。
3. 下载副本，在原来的 Word / WPS 中对照检查。

文件不会上传。页面无第三方依赖、分析脚本、远程字体或文档存储。

## 实现

`core.mjs` 解析 CFB 复合文件的 FAT / DIFAT / MiniFAT，通过 Word FIB 定位 OfficeArt 图形记录，读取图片对象名称与可用缩略图。所选图形的 `fHidden` 位设为开启，不重写文件、不移动正文、不重新保存公式。匹配的完整品牌页脚语句替换为等长全角空白。导出时校验每个更改字节均位于允许范围。

**这是隐藏显示，并非从文件中彻底删除图片或版权元数据。** 不是文档脱敏工具。

## 范围

- 支持未加密的 Word 97–2003 CFB `.doc`，仅处理含可识别显示标记的图片对象。
- 不支持 `.docx`、PDF、扫描图片内的水印、任意页脚文字替换或所有 OfficeArt 变体。异常结构会中止处理。
- 没有重新排版步骤；字体或软件环境不同仍可能导致原件与副本都出现不同分页。
- 未明确命名的图片默认不勾选，避免误选题图。无预览图片需要使用者自行确认。
- 只处理你有权修改的文件。

## 本地运行

使用任意静态文件服务器提供本目录，例如 `python3 -m http.server 8000`，访问 http://localhost:8000。

运行测试：`node --test test.mjs`。本地私有真实样本可额外指定 `DOC_FIXTURE=/path/source.doc EXPECTED_DOC=/path/verified.doc node --test test.mjs`；真实文档不包含在此仓库。

GitHub Pages：选择 **Deploy from a branch → main → /(root)** 即可。无需构建。
