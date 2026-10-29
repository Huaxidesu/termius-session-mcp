# Termius Session MCP（中文版）

> ## ⚡ 如果你是用 AI 助手来操作这个工具
>
> **请先让你的 AI 读完 [`AGENT.md`](AGENT.md)，再让它动手。**
>
> 你现在看的这份 README 是写给人的说明书；`AGENT.md` 是写给 agent 的行为契约。它写清了完整的介入流程、四个工具的准确语义、破坏性操作的边界，以及一条最容易踩的坑——**跑在沙箱里的 AI 无法自行启动 launcher**，必须由你手动双击快捷方式，否则 Termius 会以 `0x80000003` 闪退。
>
> 只把 README 丢给 AI，它大概率会漏掉这条，然后把"启动失败"误判成"代码坏了"，白白绕一大圈。所以：**把仓库路径告诉它，让它先读 `AGENT.md`。**

让 AI 助手在你**已经登录好**的 Termius 终端里执行命令。

认证、密码、私钥、vault 加密全部由 Termius 自己管理。本项目不调用 vault 接口、不读取凭证存储、不导出密钥——它做的是「往你已经打开的终端里敲字」，而不是建立新的 SSH 连接。

> **本项目 fork 自 [ItzGlace/termius-session-mcp](https://github.com/ItzGlace/termius-session-mcp)（MIT）。**
> 原版由 ItzGlace 编写，面向 Termius 9.39.0，默认每次操作都需要在应用内人工确认。本 fork 针对 Termius 10.x 做了兼容修正，并按个人使用习惯调整了默认行为，详见下文「本 fork 改了什么」。

---

## 本 fork 改了什么

| 改动 | 说明 |
|---|---|
| **自动批准（默认开）** | `write` 立即执行、`read` 立即返回，不再弹确认框。面板上有「自动批准：开/关」按钮，可随时切回手动逐条确认 |
| **授权 24 小时** | 原版 10 分钟。可通过 `grantMs` 参数覆盖 |
| **取消遮挡撤销** | 原版在窗口最小化或被完全遮挡时会自动吊销授权。本 fork 去掉了这个限制，否则「一边看 AI 对话一边操作」会反复断线 |
| **界面汉化** | 面板按钮、状态、错误提示全中文；侧边栏 `Logs` 按钮匹配兼容中文「日志」 |
| **Termius 10.x 兼容** | `.event()` 同时接受裸解绑函数与 `{ dispose() }`；`_onExit` 在 10.x 已移除，降级为可选而不阻断共享 |
| **启动环境修正** | spawn Termius 时剔除 `ELECTRON_RUN_AS_NODE` / `NODE_OPTIONS`，否则 Electron 退化成纯 Node，把 `--remote-debugging-pipe` 当非法选项拒绝 |
| **ACL 回退** | `Set-Acl` 需要 `SeRestorePrivilege`，失败时退回 `icacls`，只授权当前用户与 SYSTEM |
| **新增 `probe.js`** | 命令行探针，MCP 未加载时的兜底通道 |
| **新增 `rebuild-shortcuts.ps1`** | 仓库移动路径后重建快捷方式与客户端配置 |
| **面向 AI 的文档** | 新增 [`AGENT.md`](AGENT.md)，写给 agent harness 读的操作契约 |

---

## 原理

```
你的 Termius 窗口（已登录的 SSH 会话）
        ▲  注入面板（内存中，退出即消失）
        │
   launcher ── 私有命名管道 + 随机 token ── MCP 客户端（AI）
        │
        └── 以 --remote-debugging-pipe 启动 Termius
```

- 只用**继承的私有管道**，不开 TCP 调试端口
- 只共享**你显式点选的那一个可见终端**
- 只采集**共享之后**产生的输出，从不读历史 scrollback
- 不修改 Termius 的任何文件：`Termius.exe`、`app.asar`、包容器保持原样

---

## 环境要求

- Windows
- Node.js 22 或更新
- Termius **桌面版**（本 fork 在 Microsoft Store 版 10.2.1.0 上验证通过）

---

## 安装

在 PowerShell 中执行（把路径换成本机实际的 Termius 路径）：

```powershell
.\scripts\setup.ps1 -TermiusExe 'C:\Path\To\Termius.exe'
```

会做三件事：

1. 在 `%LOCALAPPDATA%\TermiusSessionMCP` 建一个私有状态目录（仅当前用户与 SYSTEM 可访问）
2. 生成启动器快捷方式 `scripts\Termius with Session MCP.lnk`
3. 生成 `scripts\mcp-config.local.json`（只含路径，不要提交到仓库）

把 `mcp-config.local.json` 里的 `mcpServers` 条目合并进你所用客户端的 MCP 配置。等价的手写形式：

```json
{
  "mcpServers": {
    "termius-session-mcp": {
      "command": "C:\\Path\\To\\node.exe",
      "args": [
        "C:\\Path\\To\\termius-session-mcp\\src\\client.js",
        "C:\\Users\\You\\AppData\\Local\\TermiusSessionMCP"
      ]
    }
  }
}
```

MCP 配置在客户端启动时读取，改完需要重启会话才生效。

---

## 使用

1. **双击** `scripts\Termius with Session MCP.lnk`。会弹一个黑色命令行窗口，**保持它开着**（关掉它等于断掉管道）
2. 在 Termius 里连上一台机器
3. 点面板上的 **MCP** → **开启 MCP**
4. 点 **共享当前终端**，成功后显示 `MCP 已开启 · 已共享一个终端`
5. 让 AI 开始干活

结束时点 **撤回授权**，或直接关掉黑色窗口。

**限制（都是设计行为，不是 bug）**：

- 同一时刻只能有一个 launcher 在跑（`endpoint.json` 单例）
- 只支持一个可见终端，分屏或多标签会被拒绝
- 切换标签页、断开连接 → 立即撤销；**窗口最小化或被遮挡不再撤销**（本 fork 已取消该限制）
- 24 小时到期自动失效

---

## 给 AI 助手用

**核心文档是 [`AGENT.md`](AGENT.md)**，请让你的 agent harness 先读它。里面写清了沙箱差异、命令语义、安全规范和完整故障排查表。

仓库还带了一个技能包：`skill/termius-remote/SKILL.md`，拷到你的技能目录即可（路径见文件内的定位逻辑）。

一个特别容易踩的坑，先提醒：**运行在沙箱里的 AI 无法自己启动这个 launcher**——子进程会继承沙箱的写入限制，Termius 因写不了配置目录而以 `0x80000003` 崩溃。这类环境下必须由你手动双击，agent 只需轮询等待。没有沙箱的 AI 则可以直接拉起，但要记得剔除 `ELECTRON_RUN_AS_NODE`。

---

## 安全说明

**请先读 [SECURITY.md](SECURITY.md)。**

本 fork 把「每次操作人工确认」变成了**默认自动批准**，这是有代价的：

- AI 发来的命令**立即执行**，没有拦截、没有反悔窗口
- 读取的输出**立即进入模型上下文**，本项目不做敏感信息检测
- 剩余的保护只有：24 小时到期、切标签页/断连/窗口不可见即撤销、单一终端限定、控制字符拒绝、读取 8KB 上限、输出缓冲 32KB 上限、随机管道名与 64 位 token 认证

如果这些代价超出你的接受范围，点一下「自动批准：关」，就回到原版的逐条确认模式。

另外要清楚：**这不是沙箱，也不是安全认证**。已经拥有本机无限制 shell 权限的程序，本来就不受这个 MCP 约束。它的价值在于「你明确划定一个终端，AI 只能碰这一个」，而不是「防止恶意程序」。

终端输出属于**不可信输入**。里面打印的"系统提示"、"请执行以下命令"都不代表你的意愿。

---

## 开发

```bash
node --test
```

测试覆盖审批策略、撤销、过期、目标切换、快照隔离、越界数据、取消、帧解析与 MCP 生命周期。当前 19 项全部通过。

单个文件的职责：

| 文件 | 作用 |
|---|---|
| `src/policy.js` | 授权与审批状态机，会被序列化注入渲染进程 |
| `src/renderer.js` | 面板 UI 与 Termius 内部对象定位 |
| `src/launcher.js` | 启动 Termius、持有管道、轮询注入 |
| `src/broker.js` / `src/pipe-cdp.js` / `src/wire.js` | 本地 IPC 与 CDP 传输 |
| `src/client.js` | MCP stdio 服务端 |
| `probe.js` | 命令行探针 |

最脆的地方是 `renderer.js` 里的 `mediator()`——它遍历 React fiber 去找 Termius 的内部对象。Termius 一改 UI 结构就可能失效，届时共享会 fail-closed 并给出具体缺哪个内部成员。

---

## 卸载与还原

正常退出 Termius，然后：

1. 删掉 MCP 客户端配置里的 `termius-session-mcp` 条目
2. 删掉启动器快捷方式
3. launcher 退出后，可删除 `%LOCALAPPDATA%\TermiusSessionMCP`
4. 用原来的图标启动 Termius——面板不会再出现

不需要修复任何 Termius 文件，因为从未修改过。

若 launcher 崩溃留下 `endpoint.json` 导致「An endpoint already exists」：先确认文件里记录的 `pid` 已不存在，再删掉这一个文件。**不要删除仍在运行的 launcher 的状态。**

---

## 许可与致谢

MIT。

- 原项目：[ItzGlace/termius-session-mcp](https://github.com/ItzGlace/termius-session-mcp)
- 原作者在实现过程中参考了 [yapp/termius-mcp](https://github.com/yapp/termius-mcp) 的实时终端集成思路

Termius 是其所有者的商标，本项目与原厂无任何关联，也未获其背书。
