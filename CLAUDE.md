# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 项目概述

Tabby 终端插件 `tabby-terminal-workwench`：右侧停靠的命令工作侧栏（场景 Tab + 快捷按钮网格 + 草稿区）。

产品原则：**侧栏专注执行，轻量管理靠右键**——右键快捷按钮卡片可编辑/复制/删除，右键按钮区域可新增（`ContextMenuService` + `ButtonEditModalComponent`，编辑窗口复用设置页的 `ButtonEditorComponent`，同一套编辑语义）；场景管理与完整管理仍在 `设置 → Terminal Workwench` 表单完成。所有改动经 `config$` 即时同步到侧栏。前身 tabby-command-workbench 是 2000+ 行手搓 DOM service，本产品用 Angular 组件化，不要退回手搓 DOM 的做法（右键菜单这种纯 DOM 小部件除外）。

UI 文案为中文，代码注释为英文，保持现状。

## 常用命令

```bash
npm test          # 纯逻辑回归测试（scripts/test-model.js，无测试框架）
npm run typecheck # tsc --noEmit
npm run build     # clean + webpack 打包到 dist/（webpack mode 为 development）
npm run watch     # webpack --watch
npm run check     # 完整门禁：test + typecheck + build + npm pack --dry-run
```

- 测试是单个 node 脚本：给 `require` 注册 `.ts` 转译钩子后直接 `require('../src/*.ts')`，用 `node:assert/strict` 断言。没有单测文件粒度，按 console.log 分节（model / width clamp / workbench import / command sequence / sortable geometry）；新增纯逻辑就在对应模块加函数、在脚本里加断言段。
- 只有 `src/model.ts`、`workbenchImport.ts`、`commandSequence.ts`、`sortableGeometry.ts` 这类不依赖 Angular/tabby 的模块可测。组件和服务无法脱离 Tabby 宿主运行（webpack 把 `@angular/*`、`rxjs`、`tabby-*`、`electron` 全部 external，由宿主在运行时提供）。

## 架构

### 入口与启动链

`src/index.ts` 注册 4 个 multi provider，构成两条启动钩子：

- `ToolbarButtonProvider`（app 启动即实例化，是最早可靠钩点）和 `TerminalDecorator.attach`（首个终端挂载，兜底）都调用 `WorkwenchBootService.ensure()`——幂等，等 `store.ready$` 后 `mountSidebar(SidebarRootComponent)` 并订阅 `config$ → dock.applyState`。
- `ConfigProvider` 提供默认值；`SettingsTabProvider` 挂设置页。

### 侧栏宿主与循环导入陷阱（关键约束）

`SidebarHostService` 用 `createComponent + ApplicationRef.attachView + document.body.appendChild` 把 Angular 组件挂到 app-root 之外（与 Tabby 内置 NgbModal 同构）。

**宿主服务绝不能静态 import 组件**：组件经 DI 装饰器元数据又 import 回服务时，模块循环求值会在运行时抛 TDZ `Cannot access 'X' before initialization`，且 typecheck/build 全绿、插件静默消失。因此 `mountSidebar`/`openModal` 都以 `Type<T>` 形参接收组件类型，由 boot.service / executor.service 传入。

### 数据流：WorkwenchStore 是唯一数据入口

**数据层级（v2）**：`Snippet`（片段）是基本内容单元（name/text/color）；`QuickButton` 是调用片段的绑定（`type: 'quick-button'` 判别符 + `snippetId` 引用 + action/appendCR/dangerAccepted），`type` 字段为未来的其他调用方式（palette、热键等）预留联合扩展；`Scene` 同时持有 `snippets` 与 `buttons`（场景即片段的当前分组，后续可演进为独立"分组"概念）。UI 渲染/执行一律经 `resolveSceneButtons()` 做绑定×片段 join（悬挂绑定过滤）。v1 内联按钮在 normalize 时自动拆分迁移，`needsV2Migration()` 用结构检测判断是否回写（`version` 叶子等于声明默认值会被 ConfigProxy 从 YAML 丢弃，不能作依据）。删除绑定时回收无引用的孤儿片段。

**虚拟「无组别」组**：保留 id `ungrouped`（`constants.ts`）。创建/移动按钮的统一入口是 `store.saveButton(fromSceneId, toSceneId, snippet, binding)`——from 为 null 是创建，不同则是跨场景移动；目标是 `ungrouped` 且不存在时按需创建，清空后由 `pruneUngrouped` 自动删除并回退 activeSceneId。可见性规则：`isSceneVisible()` / `visibleScenes()`（无 snippets 的 ungrouped 隐藏），normalize 加载时也会丢弃空的 ungrouped；侧栏 Tab 条、设置页树、`findActiveScene` 一律走 visible 过滤。编辑弹窗带「组别」选择器（创建默认无组别，侧栏右键新增默认当前场景）。

**调用方式（invoker）**：快捷按钮是第一种；快捷搜索面板（`PaletteModalComponent`，由 `PaletteService` 统一开关——侧栏目标栏搜索按钮 + 热键 `terminal-workwench.quick-search`（默认无绑定）两个入口）是第二种——搜索所有可见场景的片段，↑↓/Enter/点击执行。palette 执行复用片段已有绑定的语义，未绑定片段合成临时 fill 绑定（id 前缀 `palette-`）。新调用方式照此模式：找到 snippet → 决定绑定语义 → 走 `ExecutorService.execute()`。

**插件热键的两个坑**：① 插件热键子树必须在 ConfigProvider defaults 里声明（`hotkeys: { 'terminal-workwench': { 'quick-search': [] } }`），否则 ConfigProxy 加载/保存时直接丢弃用户绑定（热键表显示 Add...）；② `HotkeyProvider` 构造器会被 `HotkeysService` 在**其自身构造器内**实例化——此时 provider 链上任何服务都不能再同步注入 `HotkeysService`（DI 创建循环 → token undefined → Angular bootstrap 中断 → 整个插件静默消失）；解法是 `Injector` + `queueMicrotask` 延迟解析（见 `palette.service.ts`）。

`services/store.service.ts` 持有归一化后的不可变模型，`config$`（BehaviorSubject）广播；一切变更走 store 方法（不可变更新 → 逐字段写回 Tabby ConfigProxy → 立即或防抖 save）。

Tabby ConfigProxy 的坑（store 注释里也有记录）：

- **判断"用户是否有数据"必须用 `config.readRaw()` 解析 YAML**——proxy 的结构化默认值会造出幻影非空对象；叶子值等于默认值时会从 YAML 里消失（`importedFromWorkbench: false` 是自擦除的）。
- 数组只有整数组赋值才能持久化。
- 自身 save 触发的 `changed$` 回声用时间窗（`SELF_SAVE_SUPPRESS_MS`）抑制；外部变更重归一化时必须保留会话态 `open`。

**`open` 双态**：`open` = 会话可见性（工具栏按钮/侧栏 × 控制，`setOpen` 不落盘）；`openDefault` = 持久化启动默认（设置页开关，`setOpenDefault` 落盘）。设置页两个开关用独立 handler，不要捆绑。

### 一次性 workbench 导入

`workbenchImport.ts` 的决策矩阵（`decideWorkbenchImport`，入参只来自 readRaw YAML）：已导入或已有自有数据 → skip/mark-only；无自有数据且 workbench 有 `categories` → import 并标记。`commonCommands` 丢弃，源数据永不修改。`configProvider.ts` 把 `WORKBENCH_SOURCE_KEY`（`commandWorkbench`）声明为 null 默认，防止本插件无关的 save 把导入源从 YAML 里挤掉。

### 终端交互与执行语义

- `TerminalBridgeService`：唯一了解终端 Tab 的地方——活动终端解析（activeTab → Split 的 focused → hasFocus 兜底）、多行填充用的合成 `ClipboardEvent` 粘贴（目标 `.xterm-helper-textarea`，失败回退 `sendInput`）、侧栏头部的目标状态灯（`ConnectableTerminalTabComponent` instanceof 判定远程，`session.open`/`sessionChanged$`/`closed$` 驱动）。
- `ExecutorService` 渲染管线（`renderSnippetContent`，fill/copy 共用）：`{{param}}` 弹窗（在剥离 js/file 标签后的纯文本上收集）→ `{{file}}` 系统文件选择（取消即中止）→ `{{js:}}` vm 沙箱求值（注入 params/files/clipboardText/session/now/os，500ms 超时）→ 常规替换 → 序列解析（`{{delay}}`）→ 发送/填充/复制。高危确认在渲染后做（确认的是实际文本）。
- **模板对象家族**（`jsTemplate.ts` / `fileTemplate.ts` / `commandSequence.ts`）：`{{js:...}}` 含语句关键字按函数体、否则表达式包裹；扫描器跟踪引号/花括号深度，`}}` 不误终止。`{{file:key}}` 经 DOM input + `webUtils.getPathForFile` 拿绝对路径（**不要用 `@electron/remote`——用户插件 require 链不可达，skill 有记录**）；`file` 是参数保留名。`session` 上下文（`sessionContext.ts`）含 profile 元数据与 xterm buffer 纯文本快照（`frontend.xterm`，最近 50 行，`translateToString` 天然剥 ANSI）。
- `DockLayoutService`：停靠机制 = body 级 `twx-docked` class + `--twx-width` CSS 变量 + 显式压缩 Tabby `.content` 容器宽度（CSS 做不到，靠 DOM 回溯查找）+ 触发 layout 重算。

### 样式约定

`styles.ts`（GLOBAL_STYLES）+ `theme.ts`（THEME_TOKENS）由 `SidebarHostService.ensureStyles()` 注入为单个 `<style>` 元素——不走 webpack scss。规则：只用 `--twx-*` token 不写死颜色；class 一律 `twx-` 前缀。组件模板包在 `<twx-xxx>` 自定义宿主标签里（默认 `display:inline`），**新增组件必须在 styles.ts 给宿主加 flex 参与规则**，否则内部 section 不参与侧栏 flex 列分配。

## 调试与验证环境

调试 Tabby 核心/插件行为前先读 `tabby-debug`（或 `tabby-plugin-debug`）skill，不要凭空猜 Tabby 内部结构。

- 隔离验证实例：`D:\Env\TabbyEnv\instances\twx`（CDP 端口 9240），截图等产物放 `test-env/`。
- 部署：把 `dist/` **作为子目录**整体拷到实例的 `data\plugins\node_modules\tabby-terminal-workwench\` 并拷 `package.json`。平铺 `dist\*` 到包根会让 `main: dist/index.js` 解析失败——插件完全不加载且无报错。
- `scripts/cdpEval.js "expr"` / `scripts/cdpConsole.js`：对运行中的实例求值/看控制台；加载失败时在 renderer 里 `require('<dist/index.js>')` 看 throw。
- 改实例 config.yaml 一律用 node 或 Write 工具（PowerShell Set-Content 的 BOM + GBK 乱码会毁掉文件，导致 renderer 卡死）。
