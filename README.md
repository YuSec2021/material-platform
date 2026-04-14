# Claude Code + Codex Harness Engineering

一个面向产品迭代的多代理协作框架：Claude 负责规划、路由和验收，Codex 负责真实代码实现。仓库当前主要包含流程规范、角色定义和运行约束，本身不是业务应用代码仓库。

## 当前项目架构

### 核心角色

项目采用 4 个角色协作：

| 角色 | 运行位置 | 职责 |
| --- | --- | --- |
| Planner | Claude Code | 把用户的短需求扩展为完整产品规格、视觉语言和 sprint 计划 |
| Generator | Codex CLI | 读取规格和已批准的 sprint contract，完成一轮实现、自检和提交 |
| Evaluator | Claude Code + Playwright MCP | 审核 sprint contract，并在真实浏览器中做 live CHECK |
| Orchestrator | Claude Code | 读取文件状态并决定下一步该调用 Planner、Generator 还是 Evaluator |

### 运行边界

当前架构有一个明确边界：

- Claude 不负责写业务代码
- Codex 不负责评估自己的产出
- 进度推进依赖文件产物，而不是聊天上下文

### 状态驱动架构

这个 harness 的核心不是“对话记忆”，而是“文件状态机”：

- `planner-spec.json`
  Planner 产出的产品规格、视觉语言、技术栈和 sprint 列表
- `sprint-contract.md`
  当前 sprint 的可验收合同，必须先经 Evaluator 批准
- `eval-result-{N}.md`
  第 N 个 sprint 的验收结果，只有 Evaluator 可以写
- `eval-trigger.txt`
  Generator 提交后写入的检查信号文件
- `claude-progress.txt`
  跨会话进度日志与交接记录
- `init.sh`
  启动完整开发环境的统一入口

### 上下文清洁设计

这套架构专门考虑了长时间运行时的上下文污染问题。目标不是让模型“记住一切”，而是让模型每一轮都尽量只面对当前有效事实。

设计原则：

- 状态写进文件，不依赖长对话记忆
- 每个 sprint 都是一个独立、可重读的工作单元
- Generator 和 Evaluator 分离，减少“自己骗自己”
- 通过 `claude-progress.txt` 做压缩式交接，而不是无限追加历史

这意味着随着项目变长，系统依赖的是“可重建上下文”，不是“累积上下文”。

### 主文档分层

仓库目前分成三层说明：

1. [AGENTS.md](AGENTS.md)
   工具无关的总规范，也是 Codex 直接读取的 Generator 操作手册，应该视为总纲。
2. [CLAUDE.md](CLAUDE.md)
   Claude Code 侧的运行手册，补充 subagent、MCP、hooks 和 Codex 调用方式。
3. [agents/planner.md](./agents/planner.md)
   [agents/generator.md](./agents/generator.md)
   [agents/evaluator.md](./agents/evaluator.md)
   [agents/orchestrator.md](./agents/orchestrator.md)
   更细粒度的角色提示词和执行规则，是 Claude 侧角色实现的镜像定义。

### 当前实现状态

- 这是一个“流程/协议仓库”，目前只有文档，没有业务代码目录。
- 当前唯一工作流是以 `planner-spec.json` 为中心的 sprint 循环。
- `AGENTS.md`、`CLAUDE.md` 和 `agents/*.md` 已经统一到同一套状态模型。
- 当前推荐把 `AGENTS.md` 作为规范源头，把 `CLAUDE.md` 作为 Claude 运行手册，把 `agents/*.md` 作为角色细则。

## 工作流

完整流程如下：

```text
用户需求
  -> Orchestrator 读取当前文件状态并路由
  -> Planner 生成 planner-spec.json / init.sh / claude-progress.txt
  -> Generator 提议 sprint-contract.md
  -> Evaluator 审核 contract，写入 CONTRACT APPROVED
  -> Generator 实现 sprint、运行测试、提交代码
  -> Generator 写入 eval-trigger.txt
  -> Evaluator 用 Playwright 做真实浏览器验收
  -> 写入 eval-result-{N}.md
  -> PASS 则进入下一轮 sprint，FAIL 则回到 Generator 修复
```

关键门禁只有一个：

- 没有 `CONTRACT APPROVED`，Generator 不能开始编码。

关键状态规则：

- 没有 `planner-spec.json`，先规划
- 有 `sprint-contract.md` 但未批准，先做 contract review
- 有 `eval-trigger.txt`，先做 live CHECK
- 只有 `eval-result-{N}.md` 出现 `SPRINT PASS`，该 sprint 才完成

## 上下文清洁规则

为了减少 AI 垃圾代码、补丁式演化和上下文膨胀，当前架构默认遵守以下规则：

### 1. 文件优先于聊天

- 任何阶段开始前，都优先读取当前文件产物
- 如果文件内容和聊天上下文冲突，以文件为准
- Orchestrator 不根据“记得之前聊过什么”做路由，而是根据磁盘状态做路由

### 2. `claude-progress.txt` 只保留摘要

`claude-progress.txt` 不是会话 transcript，而是滚动 handoff：

- 保留最新项目摘要
- 保留最近 3 个 sprint 条目
- 每个 sprint 条目控制在 3 到 5 行
- 只写状态、关键变更、阻塞点和 evaluator 反馈

旧内容应该被压缩，而不是一直追加。

### 3. 每轮只读最小必要上下文

Generator 在进入实现前，应该只重读：

- `planner-spec.json`
- `sprint-contract.md`
- 当前 sprint 对应的最新 `eval-result-{N}.md`，仅在 retry 时

不要把完整历史聊天当作当前实现依据。

### 4. 提交前做一次清洁检查

每个 sprint 在提交前都应该主动检查：

- 是否留下了调试代码或临时日志
- 是否因为多轮修补产生了重复逻辑
- 是否出现了“包一层再包一层”的低质量抽象
- 当前 diff 是否仍然聚焦于已批准的 sprint，而不是偷偷扩 scope

### 5. 失败修复必须最小化

当 sprint 失败时：

- 只修 Evaluator 指出的问题
- 不借机混入无关重构
- 如果问题已经上升成架构漂移，就应该回到规划层，而不是继续补丁

## 仓库结构

```text
.
├── AGENTS.md
├── CLAUDE.md
└── agents
    ├── evaluator.md
    ├── generator.md
    ├── orchestrator.md
    └── planner.md
```

## 使用方式

### 1. 环境准备

最低要求：

- Claude Code
- Codex CLI
- Node.js / npm
- Python 和 `pytest`
- Playwright MCP
- 一个真实可启动的项目目录

`CLAUDE.md` 中给出的 Codex 安装方式：

```bash
npm install -g @openai/codex
export OPENAI_API_KEY=sk-...
codex --version
```

如果需要 Playwright MCP，可按 `CLAUDE.md` 中的配置接入：

```json
{
  "mcpServers": {
    "playwright": {
      "command": "npx",
      "args": ["@playwright/mcp@latest"]
    }
  }
}
```

### 2. 初始化一个真实项目

这个仓库本身没有 `planner-spec.json`、`init.sh`、测试或应用代码，因此要把它用于真实项目时，通常需要：

1. 在目标项目目录中放入本仓库的规范文件。
2. 初始化 Git 仓库。
3. 让 Planner 先生成：
   - `planner-spec.json`
   - `init.sh`
   - `claude-progress.txt`
4. 确保 `init.sh` 能真正启动前后端和依赖服务。

更实际的理解方式是：

- 这个仓库提供的是“协作协议”
- 真正的应用代码、测试、数据库和运行脚本应该存在于消费这套协议的业务项目中

### 3. Orchestrator 阶段

Orchestrator 是入口。它每次都先读文件状态，再决定走哪条路径：

- 没有 `planner-spec.json` -> 调 Planner
- 发现待审核的 `sprint-contract.md` -> 调 Evaluator 做 contract review
- 发现 `eval-trigger.txt` -> 调 Evaluator 做 live CHECK
- 其他情况 -> 调 Codex 进入下一轮 sprint

如果 `claude-progress.txt` 已经变成长日志，Orchestrator 应该先把它压缩回摘要形式，再继续路由。

### 4. Planner 阶段

当用户给出一个 1 到 4 句的产品需求后，由 Claude 中的 Planner 生成完整规格。

输出物：

- `planner-spec.json`
- `init.sh`
- `claude-progress.txt` 初始记录

### 5. Generator 阶段

由 Orchestrator 通过 Codex CLI 调用 Generator。Generator 不是 Claude subagent，而是外部 Codex 进程。

典型调用：

```bash
codex -a never exec --skip-git-repo-check \
  "Read planner-spec.json. Propose sprint-contract.md for Sprint N. Follow AGENTS.md Generator rules."
```

合同批准后进入实现：

```bash
codex -a never exec --skip-git-repo-check \
  "sprint-contract.md is approved. Implement Sprint N. Commit and write eval-trigger.txt. Follow AGENTS.md."
```

Generator 每次会话的固定启动 ritual：

```bash
cat claude-progress.txt
git log --oneline -10
bash init.sh
```

然后必须先做一次 smoke test，再开始改代码。

在当前架构里，Generator 还应遵守一个额外原则：

- 优先删除坏代码，而不是继续在坏代码上叠加新层

### 6. Evaluator 阶段

Evaluator 有两种模式：

- Contract Review
  审查 `sprint-contract.md` 是否可被浏览器验证
- Live CHECK
  读取 `eval-trigger.txt` 后启动环境，用 Playwright MCP 逐条执行验收步骤

验收结果写入：

- `eval-result-{N}.md`

只有出现 `SPRINT PASS`，当前 sprint 才算结束。

### 7. Sprint FAIL 修复

如果 Evaluator 判定失败，Generator 只能修复 `eval-result-{N}.md` 中明确指出的问题：

```bash
codex -a never exec --skip-git-repo-check \
  "Sprint N failed. Read eval-result-N.md. Fix only the cited issues. Re-commit and update eval-trigger.txt."
```

## 常用命令

```bash
bash init.sh
pytest -q
npx playwright test
cat claude-progress.txt
cat sprint-contract.md
cat eval-trigger.txt
```

## 推荐落地约定

为了让这套 harness 真正稳定运行，建议在真实项目里补齐以下约定：

- 明确唯一的规范来源，以 `AGENTS.md` 为准
- 保证 `init.sh` 幂等，可重复执行
- 让 `pytest -q` 和浏览器 smoke test 都可在本地稳定通过
- 为每个 sprint 保持单次 clean commit
- 不让 Generator 和 Evaluator 修改彼此负责的产物
- 让 Orchestrator 始终基于文件状态做判断，而不是基于对话记忆猜测
- 定期压缩 `claude-progress.txt`，避免它重新变成长上下文容器
- 把“删除临时代码、删除假抽象、删除重复逻辑”当成每轮提交前的固定动作

## 已知注意点

- 当前目录不是 Git 仓库，因此 README 中提到的提交、日志、状态恢复流程暂时无法直接演示。
- 当前仓库仍然是“规范仓库”，还没有配套的最小可运行示例项目。
- 如果你准备继续演进这个仓库，下一步最值得做的是补一套最小可运行示例项目，并让 `init.sh`、测试和验收链路可以直接跑通。
