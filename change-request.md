# Change Request

## Type: minor_feature

## Title
优化 AI 链路追踪页面布局 + 深色主题支持

## Description
优化 AI 链路追踪页面 `/debug/trace`：
1. 左右分栏布局：左侧按时间倒序展示最新链路日志列表，支持日期过滤；右侧展示选中链路的 span 树，支持树状展开
2. 添加深色主题适配，确保字体颜色在深色背景下清晰可见

## Background
当前 AI 链路追踪页面只有简单的 trace 列表，缺少过滤功能和左右分栏布局。Sprint 31 已完成后进入维护阶段。

## Scope
- 改造 `TraceDebugPage.tsx` 为左右分栏布局
- 左侧面板：trace 列表（按时间倒序），日期范围过滤
- 右侧面板：选中 trace 的 span 树（可展开/折叠），深色主题适配
- 仅修改 `TraceDebugPage.tsx` 及相关样式，不涉及 API 变更

## Success criteria
- 左侧列表按时间倒序，最新trace置顶
- 支持按日期范围过滤trace列表
- 右侧面板显示选中trace的层级span树，可展开/折叠子节点
- 深色主题下所有字体和图标清晰可见，无被覆盖情况
- 页面在 light/dark 主题下均可正常使用