## Title: AI模型配置架构重构 — 模型网关 + 能力映射双界面

## Type: major_feature

## Description

### Problem Statement

当前 `ModelConfig`（模型提供商）和 `AIAgentConfig`（AI Agent配置）字段大量重复，前端两界面职责不清：

- **ModelConfig**: base_url, api_key, timeout, provider, model_name
- **AIAgentConfig**: base_url, api_key, timeout, provider, model_name + temperature, max_tokens, config_key
- 两套映射表 `capability_model_mapping` / `capability_agent_mapping` 功能相同
- 无法直观看出"哪个功能使用哪个模型"

### Proposed Solution

拆分为两个正交视图：

**1. 模型网关（AI管理 → 模型网关）**
- 统一管理所有可用模型（base_url、api_key、timeout、temperature、max_tokens）
- 模型有启用/禁用状态和连接测试
- 合并 `ModelConfig` + `AIAgentConfig` 为一张 `Model` 表
- 模型列表卡片展示，状态一目了然

**2. 能力映射（AI管理 → 能力映射）**
- 每个能力（category_recognition、material_add 等）绑定具体模型
- 支持 primary + fallback 双模型
- 清晰展示"功能 → 模型"映射关系
- 合并两张映射表为一张 `CapabilityMapping`

### Scope

**后端**
- 新建 `Model` 表（合并 ModelConfig + AIAgentConfig 字段）
- 新建 `CapabilityMapping` 表（合并 capability_model_mapping + capability_agent_mapping）
- 删除 `AIAgentConfig` 表、`capability_agent_mapping` 表、`ModelConfig` 表
- 重写 `model_for_capability()` 查询逻辑
- 确保向后兼容迁移脚本

**前端**
- 模型网关页面：显示所有模型的卡片列表，含状态、操作
- 能力映射页面：能力 → 模型 的映射配置表
- 删除"AI Agent配置"和"模型提供商"旧页面

**数据迁移**
- 将现有 ModelConfig 数据迁移到新 Model 表
- 将现有 AIAgentConfig 数据迁移到新 Model 表
- 将现有映射关系迁移到新 CapabilityMapping 表

### Success Criteria

- [ ] 新 Model 表包含原来 ModelConfig + AIAgentConfig 的所有字段
- [ ] 模型网关页面显示所有模型，含连接状态
- [ ] 能力映射页面可配置 capability → model 的 primary + fallback 映射
- [ ] 现有功能（如 category_recognition、material_add）仍能正确找到模型
- [ ] category_recognition 能力使用新的能力映射机制
- [ ] 删除旧表不造成功能影响
- [ ] 所有测试通过

## Priority: High

## Notes
- 当前已有 414 个 mock provider 假数据和 166 个测试 provider（已全部清理）
- ModelConfig 有 414 个 mock 记录，AIAgentConfig 数量待确认
- 涉及表结构迁移，需确保迁移后原有 category_recognition 功能仍正常