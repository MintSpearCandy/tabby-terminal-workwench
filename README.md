# Terminal Workwench

一个用于 Tabby 的右侧命令工作侧栏：按场景组织的快捷按钮网格与草稿区，配合强大的模板块系统（参数 / 延时 / JS / 文件），为嵌入式与设备调试工作流而生。

## 核心功能

- **专注执行的侧栏**：场景 Tab（图标 + 颜色）+ 毛玻璃快捷按钮网格 + 按场景持久化的草稿区；右键按钮可编辑 / 复制内容 / 删除，右键按钮区可新增。
- **片段（snippet）数据层**：快捷按钮是对片段的一种调用绑定；未绑定片段也可经快捷搜索调用，为未来的更多调用方式预留。
- **模板块系统**：
  - `{{param}}` 参数：执行前弹窗填写（历史记忆）
  - `{{delay:2000}}` 延时：直接执行模式下逐行发送并等待
  - `{{file:fw}}` 文件：执行时在收集弹窗中点击选择或**拖入文件**，标签渲染为路径；JS 中经 `files.fw` 引用 `name / path / size / sizeMB / mtime` 与惰性 `text`
  - `{{js: ...}}` JS 块：执行瞬间在 vm 沙箱求值（500ms 超时），可引用 `params` / `files` / `clipboardText` / `session`（**目标会话元数据 + 终端输出快照**——直接解析设备输出）/ `now` / `os`
- **快捷搜索**：侧栏搜索按钮或热键（`terminal-workwench.quick-search`，默认无绑定）呼出片段面板，↑↓ 选择、Enter 执行；可按分组层级显示。
- **高危命令确认**：直接发送命中 reboot / rm / fastboot flash 等高危词表时需确认，界面上有独立标记。
- **设置页管理**：与「连接与配置」页同构的树形列表（筛选 / 新建下拉 / 分组折叠 / 拖拽排序），场景与按钮全部表单化管理；16 色色板 + 取色器、场景图标、毛玻璃参数（颜色浓度 / 模糊度 / 亮度）均可调。
- **停靠式布局**：侧栏压缩终端主体而非遮挡，左缘拖动调宽并持久化。

## 安装

在 Tabby 的 `Settings → Plugins` 中搜索并安装：

```text
tabby-terminal-workwench
```

安装后重启 Tabby。也可从 [Releases](https://github.com/MintSpearCandy/tabby-terminal-workwench/releases) 下载 `.tgz` 手动安装。

## 从 tabby-command-workbench 导入

首次启动时，如果检测到 `tabby-command-workbench`（命令工作台）的配置数据，会自动一次性导入场景、快捷按钮与草稿区内容；源数据不会被修改或删除，两个插件可以共存。

## 示例

```
adb -s {{js: const m = session.lines.find(l => /\tdevice$/.test(l)); return m ? m.split('\t')[0] : '未检测到设备'}} shell getprop ro.build.version

echo 刷入 {{file:boot}}（{{js: files.boot.name}} / {{js: files.boot.sizeMB}}MB）

echo 开始 {{js: now.toISOString().slice(11, 19)}}
{{js: '{{delay:1500}}'}}
echo 延时结束
```

## 安全提示

- 快捷按钮和草稿区内容会持久化到 Tabby 配置文件中，不要保存 token、密码等敏感凭据。
- `{{js:}}` 块在你的本机以与 Tabby 相同的权限运行（有超时与上下文隔离，但非安全沙箱）——只写你自己的片段。

## 开发

```bash
npm install
npm test          # 纯逻辑回归测试
npm run typecheck # TypeScript 类型检查
npm run build     # 构建到 dist/
npm run check     # 完整本地门禁
```

## License

MIT
