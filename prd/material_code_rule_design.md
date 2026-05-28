# 物料库级自定义编码规则功能设计文档

## 1. 文档概述

### 1.1 文档目的

本文档用于描述“物料库级自定义编码规则管理”功能的产品设计方案，支持企业在新增物料库时定义专属物料编码规则，并在物料库管理中查看、维护、版本化管理编码规则。当编码规则发生调整时，系统支持生成新规则版本，并可根据新规则对已有物料执行批量重编码，实现旧编码到新编码的自动替换与全过程追溯。

### 1.2 适用范围

本功能适用于物料主数据治理系统中的以下场景：

```text
1. 企业新增物料库时，需要自定义该物料库的物料编码规则；
2. 不同物料库需要使用不同编码规则；
3. 物料编码规则需要支持查看、编辑、版本管理；
4. 规则变更后，需要支持对已有物料批量重新生成编码；
5. 编码替换后，需要保留旧编码与新编码的映射关系；
6. 后续需要支持物料编码追溯、回滚、导出和审计。
```

---

## 2. 业务背景

在物料主数据治理过程中，不同企业、不同业务域、不同物料库往往存在不同的编码管理规则。例如，备品备件库可能采用“企业前缀 + 类目编码 + 流水号”的编码方式，原材料库可能采用“物料类型 + 材质 + 规格 + 流水号”的编码方式。

如果系统将编码逻辑写死，将无法满足不同企业对编码规则的差异化管理需求。因此，需要将物料编码规则抽象为可配置能力，并绑定到具体物料库。

本功能通过“物料库级编码规则配置 + 规则版本管理 + 编码生成引擎 + 批量重编码机制”实现企业自定义编码规则的灵活配置和安全变更。

---

## 3. 功能目标

### 3.1 核心目标

```text
1. 支持在新增物料库时定义该物料库的编码规则；
2. 支持编码规则由多个编码段组合生成；
3. 支持在物料库管理中查看当前编码规则；
4. 支持编码规则版本管理；
5. 支持修改编码规则后生成新版本；
6. 支持新规则仅对新增物料生效；
7. 支持新规则对已有物料批量重编码；
8. 支持重编码前预览新旧编码映射关系；
9. 支持编码冲突、字段缺失、非法字符等校验；
10. 支持替换物料编码后保留历史映射与操作日志。
```

### 3.2 设计原则

```text
1. 编码规则不写死，必须可配置；
2. 编码规则绑定物料库，而不是全局唯一；
3. 编码规则修改必须生成新版本，不能覆盖历史规则；
4. 批量替换编码前必须预览；
5. 编码替换后必须保留旧编码与新编码映射；
6. 编码生成过程必须可追溯；
7. 当前编码可以变化，历史编码不能丢失；
8. 编码规则变更属于高风险操作，必须有校验、确认和日志。
```

---

## 4. 业务角色

| 角色 | 说明 |
|---|---|
| 系统管理员 | 负责系统基础配置、权限配置 |
| 物料库管理员 | 负责新增物料库、配置编码规则 |
| 主数据治理人员 | 负责物料标准化、编码生成、重编码确认 |
| 审核人员 | 负责审核编码规则变更、查看变更记录 |
| 普通业务用户 | 查看物料信息、通过编码查询物料 |

---

## 5. 功能范围

### 5.1 包含功能

```text
1. 新增物料库时配置编码规则；
2. 编码规则段配置；
3. 流水号策略配置；
4. 编码规则预览；
5. 当前编码规则查看；
6. 编码规则版本管理；
7. 编码规则编辑；
8. 新规则生效方式选择；
9. 批量重编码预览；
10. 编码冲突检测；
11. 批量替换物料编码；
12. 新旧编码映射保存；
13. 编码变更记录查看；
14. 编码映射导出；
15. 重编码失败记录查看。
```

### 5.2 暂不包含功能

```text
1. 跨系统同步外部 ERP、SRM、WMS 编码；
2. 外部系统编码引用自动修复；
3. 编码规则审批流；
4. 编码规则图形化拖拽高级设计器；
5. 多语言编码规则配置；
6. 基于 AI 自动推荐最佳编码规则。
```

上述能力可作为后续版本扩展。

---

## 6. 业务流程设计

### 6.1 新增物料库并配置编码规则流程

```text
用户进入新增物料库页面
        ↓
填写物料库基础信息
        ↓
开启自动编码
        ↓
配置编码规则
        ↓
配置流水号策略
        ↓
系统生成编码预览
        ↓
用户确认创建物料库
        ↓
系统生成编码规则 V1
        ↓
V1 设置为当前启用规则
        ↓
后续新增物料按 V1 自动生成编码
```

示例：

```text
物料库名称：柳钢备品备件库
物料库编码：LG-SPARE
编码规则：LG + 一级类目编码 + 二级类目编码 + 三级类目编码 + 5位流水号
生成示例：LG020200100001
```

### 6.2 查看物料库编码规则流程

```text
用户进入物料库管理
        ↓
选择目标物料库
        ↓
进入“编码规则”页签
        ↓
查看当前规则版本
        ↓
查看编码结构、流水号策略、启用时间
        ↓
可继续查看历史版本、重编码记录、新旧编码映射
```

### 6.3 修改编码规则流程

```text
用户进入物料库管理
        ↓
点击“编辑编码规则”
        ↓
系统加载当前规则版本
        ↓
用户修改编码结构
        ↓
填写变更原因
        ↓
系统生成新规则草稿版本
        ↓
用户选择生效方式
        ↓
生成预览
        ↓
确认生效
```

生效方式包括：

```text
1. 仅对新增物料生效；
2. 对当前物料库全部物料重编码；
3. 对选中物料重编码。
```

### 6.4 修改规则但不替换历史编码流程

```text
当前规则 V1 启用
        ↓
用户编辑规则
        ↓
系统生成 V2
        ↓
用户选择“仅新增物料生效”
        ↓
V1 变为已停用
        ↓
V2 变为启用
        ↓
旧物料编码保持不变
        ↓
新物料按 V2 生成编码
```

### 6.5 修改规则并替换全部物料编码流程

```text
当前规则 V1 启用
        ↓
用户编辑规则
        ↓
系统生成 V2 草稿
        ↓
用户选择“全部物料重编码”
        ↓
系统扫描物料库下全部物料
        ↓
按 V2 规则生成候选新编码
        ↓
生成新旧编码映射预览
        ↓
执行编码唯一性、合法性、完整性校验
        ↓
用户确认执行
        ↓
系统批量更新物料主数据编码
        ↓
保存旧编码与新编码映射
        ↓
V1 停用，V2 启用
        ↓
生成编码变更批次记录
```

---

## 7. 功能模块设计

### 7.1 物料库管理模块

#### 功能说明

用于维护企业不同物料库，包括物料库基础信息、编码规则、规则版本、物料清单、重编码记录和编码映射关系。

#### 页面结构

```text
物料库管理
 ├── 物料库列表
 ├── 新增物料库
 ├── 物料库详情
 │    ├── 基础信息
 │    ├── 编码规则
 │    ├── 规则版本
 │    ├── 物料列表
 │    ├── 重编码记录
 │    └── 编码映射
```

#### 物料库列表字段

| 字段 | 说明 |
|---|---|
| 物料库名称 | 物料库显示名称 |
| 物料库编码 | 物料库唯一标识 |
| 物料库类型 | 如备品备件库、原材料库、设备库 |
| 当前规则版本 | 当前启用的编码规则版本 |
| 自动编码 | 是否启用自动编码 |
| 是否允许重编码 | 是否允许规则变更后批量重编码 |
| 物料数量 | 当前物料库下物料数量 |
| 状态 | 启用、停用、重编码中 |
| 最近更新时间 | 最近修改时间 |

### 7.2 新增物料库功能

#### 功能说明

用户新增物料库时，必须同步配置编码规则。如果企业暂不启用自动编码，也可以关闭自动编码，但后续新增物料需手工维护编码。

#### 表单字段

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| 物料库名称 | 文本 | 是 | 如“柳钢备品备件库” |
| 物料库编码 | 文本 | 是 | 如“LG-SPARE” |
| 物料库类型 | 下拉 | 是 | 备品备件、原材料、设备等 |
| 所属企业 | 下拉 | 是 | 当前企业或组织 |
| 自动编码 | 开关 | 是 | 是否启用系统自动生成编码 |
| 是否允许重编码 | 开关 | 是 | 规则修改后是否允许重编码 |
| 编码规则名称 | 文本 | 是 | 规则显示名称 |
| 编码规则配置 | 规则配置器 | 是 | 定义编码组成 |
| 流水号策略 | 表单 | 视规则而定 | 配置流水号生成方式 |
| 编码预览 | 只读 | 否 | 展示编码生成效果 |

### 7.3 编码规则配置模块

#### 功能说明

编码规则由多个编码段组成，系统按照编码段顺序拼接生成最终物料编码。

#### 支持的编码段类型

| 编码段类型 | 示例 | 说明 |
|---|---|---|
| 固定文本 | `LG` | 企业前缀、业务前缀 |
| 物料库编码 | `SPARE` | 当前物料库编码 |
| 类目编码 | `0202001` | 来自物料分类树 |
| 属性编码 | `FKM`、`304` | 来自物料属性映射 |
| 日期字段 | `2026`、`2605` | 年、年月、年月日 |
| 流水号 | `00001` | 自动递增序号 |
| 分隔符 | `-`、`_` | 可选展示分隔符 |
| 校验位 | `7` | 可选，用于防止录入错误 |

#### 推荐默认规则

```text
企业前缀 + 一级类目编码 + 二级类目编码 + 三级类目编码 + 5位流水号
```

示例：

```text
LG020200100001
```

含义：

```text
LG = 企业前缀
02 = 一级类目：备品备件
02 = 二级类目：密封件
001 = 三级类目：O型圈
00001 = 当前类目下流水号
```

### 7.4 流水号策略配置

#### 功能说明

流水号用于保证编码唯一性，是编码规则中最关键的部分。

#### 配置项

| 配置项 | 说明 | 示例 |
|---|---|---|
| 流水号长度 | 固定几位 | 5 |
| 起始值 | 从哪个数字开始 | 1 |
| 步长 | 每次递增多少 | 1 |
| 补位方式 | 左侧补 0 | 00001 |
| 流水作用域 | 按什么范围独立计数 | 按三级类目 |
| 是否按年重置 | 每年是否归零 | 否 |
| 是否按月重置 | 每月是否归零 | 否 |
| 达到最大值处理 | 报错或扩位 | 报错 |

#### 流水作用域

| 作用域 | 说明 |
|---|---|
| 全局流水 | 当前物料库内所有物料共用一个流水号 |
| 按规则流水 | 每个编码规则版本独立流水 |
| 按类目流水 | 每个物料小类独立流水 |
| 按前缀流水 | 每个编码前缀独立流水 |
| 按年份流水 | 每年独立流水 |
| 按年月流水 | 每个月独立流水 |
| 按类目 + 属性流水 | 如每个“类目 + 材质”独立流水 |

#### 推荐默认策略

```text
按三级类目独立流水，不按日期重置。
```

示例：

```text
O型圈类目：LG0202001 当前流水号 00056
下一个编码：LG020200100057

轴承类目：LG0203001 当前流水号 00012
下一个编码：LG020300100013
```

### 7.5 编码规则预览功能

#### 功能说明

用户配置编码规则时，系统应根据模拟物料数据实时生成编码预览，帮助用户判断规则是否正确。

#### 预览输入

```text
物料名称：O型圈
所属类目：备品备件 > 密封件 > O型圈
材质：氟橡胶
规格型号：d31x3mm
```

#### 预览输出

```text
LG020200100001
```

#### 异常提示示例

如果编码规则中包含“材质编码”，但测试物料没有材质属性，应提示：

```text
当前编码规则需要“材质”属性，但测试物料未维护材质，无法生成编码。
```

### 7.6 编码规则版本管理模块

#### 功能说明

每次修改编码规则时，系统不覆盖旧规则，而是生成新的规则版本。

#### 版本规则

```text
1. 新增物料库时自动生成 V1；
2. 每次修改编码规则生成 V2、V3、V4；
3. 同一物料库同一时间只能有一个启用版本；
4. 已启用或已停用的规则版本不允许直接修改；
5. 历史版本仅允许查看，不允许覆盖；
6. 当前版本可被新版本替代；
7. 每个版本必须记录变更原因。
```

#### 版本状态

| 状态 | 说明 |
|---|---|
| 草稿 | 新规则正在编辑中 |
| 预览中 | 已生成重编码预览 |
| 启用 | 当前正在使用 |
| 已停用 | 被新版本替代 |
| 启用失败 | 规则启用失败 |
| 已归档 | 历史归档版本 |

#### 版本列表字段

| 字段 | 说明 |
|---|---|
| 版本号 | V1、V2、V3 |
| 规则名称 | 编码规则名称 |
| 编码结构 | 编码段组成 |
| 生效方式 | 新增生效、全部重编码、部分重编码 |
| 状态 | 启用、停用等 |
| 创建人 | 创建规则版本的人 |
| 创建时间 | 规则创建时间 |
| 生效时间 | 规则正式生效时间 |
| 变更原因 | 用户填写的变更说明 |

### 7.7 批量重编码模块

#### 功能说明

当用户修改编码规则后，可选择对已有物料执行批量重编码。系统根据新规则重新生成物料编码，并将旧编码替换为新编码。

#### 支持模式

| 模式 | 说明 |
|---|---|
| 仅新增物料生效 | 历史物料编码不变，新物料使用新规则 |
| 全部物料重编码 | 当前物料库下所有物料重新生成编码 |
| 选中物料重编码 | 仅对用户选中的物料重新生成编码 |

#### 重编码前置条件

```text
1. 当前物料库允许重编码；
2. 新编码规则配置完整；
3. 新规则已生成预览；
4. 所有物料均可生成合法编码；
5. 不存在新编码冲突；
6. 用户确认执行。
```

### 7.8 重编码预览功能

#### 功能说明

执行批量重编码前，系统必须生成预览结果，展示每个物料的旧编码、新编码和校验状态。

#### 预览字段

| 字段 | 说明 |
|---|---|
| 物料 ID | 物料唯一标识 |
| 物料名称 | 标准物料名称 |
| 规格型号 | 物料规格 |
| 所属类目 | 当前物料类目 |
| 旧编码 | 当前有效编码 |
| 新编码 | 按新规则生成的编码 |
| 校验状态 | 通过、失败 |
| 失败原因 | 如属性缺失、编码冲突 |

#### 预览示例

| 物料名称 | 旧编码 | 新编码 | 状态 |
|---|---|---|---|
| O型圈 d31x3mm | LG020200100001 | LG0202001FKM00001 | 通过 |
| O型圈 d33.2x2.4mm | LG020200100002 | LG0202001FKM00002 | 通过 |
| O型圈 d50x5mm | LG020200100003 | - | 缺少材质属性 |
| 深沟球轴承 6205 | LG020300100001 | LG0203001STL00001 | 通过 |

### 7.9 编码校验规则

#### 规则完整性校验

编码规则至少应包含一个能够保证差异化的编码段。

推荐组合：

```text
类目编码 + 流水号
固定前缀 + 类目编码 + 流水号
物料库编码 + 流水号
```

不允许规则：

```text
仅固定文本
仅企业前缀
仅日期
```

#### 编码唯一性校验

系统必须校验：

```text
1. 新编码在当前物料库内是否重复；
2. 新编码与已有物料编码是否冲突；
3. 如果企业要求全局唯一，还需校验企业内是否重复。
```

建议默认规则：

```text
同一企业内物料编码唯一。
```

#### 编码合法性校验

推荐编码只允许：

```text
大写字母
数字
中划线
下划线
```

推荐正则：

```regex
^[A-Z0-9_-]+$
```

不建议允许：

```text
中文
空格
特殊符号
全角字符
不可见字符
```

#### 属性完整性校验

如果规则中包含属性编码段，例如：

```text
材质编码
品牌编码
规格类型编码
```

则物料必须存在对应属性值，并且该属性值必须有编码映射。

示例：

```text
材质=氟橡胶 → FKM
材质=丁腈橡胶 → NBR
材质=不锈钢304 → 304
```

如果缺失映射，应提示：

```text
物料存在材质属性“聚氨酯”，但编码规则未配置对应属性编码映射。
```

#### 编码长度校验

需要支持最大长度限制。

例如：

```text
物料编码最大长度：64 位
展示编码最大长度：128 位
```

如果生成编码超过限制，应阻止保存或执行。

### 7.10 编码映射管理模块

#### 功能说明

当系统执行重编码后，需要保留旧编码与新编码之间的映射关系，用于追溯、查询、导入兼容和外部系统对账。

#### 映射关系

```text
旧编码 → 新编码
```

示例：

| 旧编码 | 新编码 | 变更原因 |
|---|---|---|
| LG020200100001 | LG0202001FKM00001 | 编码规则 V1 升级 V2 |
| LG020200100002 | LG0202001FKM00002 | 编码规则 V1 升级 V2 |

#### 支持操作

```text
1. 查看编码映射；
2. 按旧编码查询新编码；
3. 按新编码查询旧编码；
4. 按变更批次筛选；
5. 导出编码映射；
6. 查看编码变更历史。
```

---

## 8. 页面设计

### 8.1 新增物料库页面

```text
新增物料库
------------------------------------------------
一、基础信息
物料库名称：
物料库编码：
物料库类型：
所属企业：
状态：

二、编码设置
是否启用自动编码：是 / 否
是否允许重编码：是 / 否

三、编码规则
规则名称：
编码结构：
[固定文本 LG] + [类目编码] + [流水号]

四、流水号设置
流水号长度：
起始值：
步长：
补位方式：
流水作用域：
是否按年重置：

五、编码预览
测试类目：
测试属性：
预览编码：

[取消] [保存]
```

### 8.2 物料库详情页面

```text
物料库详情：柳钢备品备件库
------------------------------------------------
基础信息 | 编码规则 | 规则版本 | 物料列表 | 重编码记录 | 编码映射
```

### 8.3 编码规则页签

#### 展示内容

```text
当前规则版本：V2
当前状态：启用
编码结构：LG + 类目编码 + 材质编码 + 5位流水号
流水号策略：按类目 + 材质独立流水
生效时间：2026-05-15 10:00:00
最近修改人：张三
变更原因：新增材质编码段
```

#### 操作按钮

```text
编辑规则
查看历史版本
重编码全部物料
导出编码映射
```

### 8.4 编辑编码规则页面

```text
编辑编码规则
------------------------------------------------
当前版本：V2
编辑后版本：V3

编码结构：
[固定文本 LG] + [类目编码] + [属性编码：材质] + [流水号 5位]

生效方式：
○ 仅对新增物料生效
○ 对当前物料库全部物料重编码
○ 对选中物料重编码

变更原因：
[请输入本次规则调整原因]

[取消] [生成预览]
```

### 8.5 重编码预览页面

```text
重编码预览
------------------------------------------------
物料库：柳钢备品备件库
旧规则版本：V2
新规则版本：V3
影响物料数量：12500
可成功重编码：12480
异常数量：20

异常类型：
缺少属性：12
编码冲突：5
类目编码缺失：3

明细列表：
物料名称 | 旧编码 | 新编码 | 状态 | 失败原因

[下载预览结果]
[返回修改规则]
[确认执行重编码]
```

---

## 9. 数据模型设计

### 9.1 物料库表：`material_library`

```sql
CREATE TABLE material_library (
    id BIGINT PRIMARY KEY,
    tenant_id BIGINT NOT NULL,
    library_code VARCHAR(64) NOT NULL,
    library_name VARCHAR(128) NOT NULL,
    library_type VARCHAR(64),
    current_rule_version_id BIGINT,
    auto_code_enabled BOOLEAN DEFAULT TRUE,
    recode_enabled BOOLEAN DEFAULT TRUE,
    status VARCHAR(32) DEFAULT 'enabled',
    created_by BIGINT,
    created_at TIMESTAMP,
    updated_at TIMESTAMP,
    UNIQUE (tenant_id, library_code)
);
```

| 字段 | 说明 |
|---|---|
| tenant_id | 企业 ID |
| library_code | 物料库编码 |
| library_name | 物料库名称 |
| current_rule_version_id | 当前启用编码规则版本 |
| auto_code_enabled | 是否启用自动编码 |
| recode_enabled | 是否允许重编码 |
| status | 物料库状态 |

### 9.2 编码规则版本表：`material_code_rule_version`

```sql
CREATE TABLE material_code_rule_version (
    id BIGINT PRIMARY KEY,
    tenant_id BIGINT NOT NULL,
    material_library_id BIGINT NOT NULL,
    version_no INT NOT NULL,
    rule_name VARCHAR(128) NOT NULL,
    rule_config JSON NOT NULL,
    separator VARCHAR(8),
    status VARCHAR(32) NOT NULL,
    effective_time TIMESTAMP,
    expire_time TIMESTAMP,
    change_reason VARCHAR(512),
    created_by BIGINT,
    created_at TIMESTAMP,
    UNIQUE (material_library_id, version_no)
);
```

| 字段 | 说明 |
|---|---|
| material_library_id | 所属物料库 |
| version_no | 规则版本号 |
| rule_config | 编码规则 JSON |
| separator | 编码段分隔符 |
| status | 草稿、启用、停用等 |
| change_reason | 规则变更原因 |

### 9.3 流水号表：`material_code_serial`

```sql
CREATE TABLE material_code_serial (
    id BIGINT PRIMARY KEY,
    tenant_id BIGINT NOT NULL,
    material_library_id BIGINT NOT NULL,
    rule_version_id BIGINT NOT NULL,
    scope_key VARCHAR(128) NOT NULL,
    current_value BIGINT NOT NULL DEFAULT 0,
    created_at TIMESTAMP,
    updated_at TIMESTAMP,
    UNIQUE (tenant_id, material_library_id, rule_version_id, scope_key)
);
```

### 9.4 物料主表核心字段：`material_master`

```sql
CREATE TABLE material_master (
    id BIGINT PRIMARY KEY,
    tenant_id BIGINT NOT NULL,
    material_library_id BIGINT NOT NULL,
    material_code VARCHAR(128) NOT NULL,
    material_name VARCHAR(256) NOT NULL,
    specification VARCHAR(256),
    category_id BIGINT,
    original_code VARCHAR(128),
    previous_code VARCHAR(128),
    code_rule_version_id BIGINT,
    code_change_count INT DEFAULT 0,
    code_status VARCHAR(32) DEFAULT 'normal',
    created_at TIMESTAMP,
    updated_at TIMESTAMP,
    UNIQUE (tenant_id, material_code)
);
```

| 字段 | 说明 |
|---|---|
| material_code | 当前有效物料编码 |
| original_code | 原始编码 |
| previous_code | 上一次编码 |
| code_rule_version_id | 当前编码使用的规则版本 |
| code_change_count | 编码变更次数 |
| code_status | 正常、已重编码、已作废 |

### 9.5 编码变更批次表：`material_code_change_batch`

```sql
CREATE TABLE material_code_change_batch (
    id BIGINT PRIMARY KEY,
    tenant_id BIGINT NOT NULL,
    material_library_id BIGINT NOT NULL,
    old_rule_version_id BIGINT NOT NULL,
    new_rule_version_id BIGINT NOT NULL,
    change_mode VARCHAR(32) NOT NULL,
    total_count INT DEFAULT 0,
    success_count INT DEFAULT 0,
    failed_count INT DEFAULT 0,
    status VARCHAR(32) NOT NULL,
    change_reason VARCHAR(512),
    created_by BIGINT,
    created_at TIMESTAMP,
    completed_at TIMESTAMP
);
```

`change_mode` 取值：

| 值 | 说明 |
|---|---|
| NEW_ONLY | 仅新增物料生效 |
| RECODE_ALL | 全部物料重编码 |
| RECODE_SELECTED | 选中物料重编码 |

### 9.6 编码变更明细表：`material_code_change_detail`

```sql
CREATE TABLE material_code_change_detail (
    id BIGINT PRIMARY KEY,
    batch_id BIGINT NOT NULL,
    material_id BIGINT NOT NULL,
    old_code VARCHAR(128) NOT NULL,
    new_code VARCHAR(128),
    status VARCHAR(32) NOT NULL,
    error_message VARCHAR(512),
    created_at TIMESTAMP
);
```

### 9.7 编码映射表：`material_code_mapping`

```sql
CREATE TABLE material_code_mapping (
    id BIGINT PRIMARY KEY,
    tenant_id BIGINT NOT NULL,
    material_library_id BIGINT NOT NULL,
    material_id BIGINT NOT NULL,
    old_code VARCHAR(128) NOT NULL,
    new_code VARCHAR(128) NOT NULL,
    old_rule_version_id BIGINT,
    new_rule_version_id BIGINT,
    change_batch_id BIGINT,
    change_type VARCHAR(64),
    status VARCHAR(32) DEFAULT 'active',
    created_by BIGINT,
    created_at TIMESTAMP
);
```

---

## 10. 编码规则 JSON 设计

### 10.1 示例规则

```json
{
  "ruleName": "柳钢备品备件编码规则",
  "separator": "",
  "segments": [
    {
      "order": 1,
      "type": "fixed",
      "name": "企业前缀",
      "config": {
        "value": "LG"
      }
    },
    {
      "order": 2,
      "type": "category_path",
      "name": "类目路径编码",
      "config": {
        "levels": [1, 2, 3],
        "lengths": [2, 2, 3]
      }
    },
    {
      "order": 3,
      "type": "serial",
      "name": "流水号",
      "config": {
        "length": 5,
        "start": 1,
        "step": 1,
        "scope": "category",
        "padding": "left_zero"
      }
    }
  ]
}
```

### 10.2 增加属性编码段示例

```json
{
  "ruleName": "柳钢备品备件编码规则V2",
  "separator": "",
  "segments": [
    {
      "order": 1,
      "type": "fixed",
      "name": "企业前缀",
      "config": {
        "value": "LG"
      }
    },
    {
      "order": 2,
      "type": "category_path",
      "name": "类目路径编码",
      "config": {
        "levels": [1, 2, 3],
        "lengths": [2, 2, 3]
      }
    },
    {
      "order": 3,
      "type": "attribute",
      "name": "材质编码",
      "config": {
        "attributeCode": "material",
        "mapping": {
          "氟橡胶": "FKM",
          "丁腈橡胶": "NBR",
          "不锈钢304": "304"
        },
        "required": true
      }
    },
    {
      "order": 4,
      "type": "serial",
      "name": "流水号",
      "config": {
        "length": 5,
        "start": 1,
        "step": 1,
        "scope": "category_material",
        "padding": "left_zero"
      }
    }
  ]
}
```

---

## 11. 后端接口设计

### 11.1 新增物料库

```http
POST /api/material-libraries
```

请求示例：

```json
{
  "libraryName": "柳钢备品备件库",
  "libraryCode": "LG-SPARE",
  "libraryType": "SPARE_PARTS",
  "autoCodeEnabled": true,
  "recodeEnabled": true,
  "codeRule": {
    "ruleName": "默认编码规则",
    "separator": "",
    "segments": [
      {
        "type": "fixed",
        "config": {
          "value": "LG"
        }
      },
      {
        "type": "category_path",
        "config": {
          "levels": [1, 2, 3],
          "lengths": [2, 2, 3]
        }
      },
      {
        "type": "serial",
        "config": {
          "length": 5,
          "scope": "category",
          "padding": "left_zero"
        }
      }
    ]
  }
}
```

### 11.2 查看当前编码规则

```http
GET /api/material-libraries/{libraryId}/code-rule/current
```

返回示例：

```json
{
  "libraryId": 1001,
  "currentVersion": 2,
  "ruleName": "柳钢备品备件编码规则",
  "status": "active",
  "separator": "",
  "segments": [
    {
      "type": "fixed",
      "name": "企业前缀",
      "value": "LG"
    },
    {
      "type": "category_path",
      "name": "类目编码"
    },
    {
      "type": "serial",
      "name": "流水号",
      "length": 5
    }
  ]
}
```

### 11.3 查询编码规则版本列表

```http
GET /api/material-libraries/{libraryId}/code-rule/versions
```

### 11.4 新增编码规则版本

```http
POST /api/material-libraries/{libraryId}/code-rule/versions
```

请求示例：

```json
{
  "ruleName": "柳钢备品备件编码规则V3",
  "changeReason": "新增材质编码段",
  "ruleConfig": {
    "separator": "",
    "segments": [
      {
        "type": "fixed",
        "config": {
          "value": "LG"
        }
      },
      {
        "type": "category_path",
        "config": {
          "levels": [1, 2, 3],
          "lengths": [2, 2, 3]
        }
      },
      {
        "type": "attribute",
        "config": {
          "attributeCode": "material",
          "mapping": {
            "氟橡胶": "FKM",
            "丁腈橡胶": "NBR",
            "不锈钢304": "304"
          }
        }
      },
      {
        "type": "serial",
        "config": {
          "length": 5,
          "scope": "category_material",
          "padding": "left_zero"
        }
      }
    ]
  }
}
```

### 11.5 生成重编码预览

```http
POST /api/material-libraries/{libraryId}/code-rule/versions/{versionId}/recode-preview
```

请求示例：

```json
{
  "changeMode": "RECODE_ALL"
}
```

返回示例：

```json
{
  "batchId": 90001,
  "totalCount": 12500,
  "successCount": 12480,
  "failedCount": 20,
  "errors": [
    {
      "materialId": 101,
      "materialName": "O型圈 d50x5mm",
      "oldCode": "LG020200100003",
      "errorMessage": "缺少材质属性，无法生成编码"
    }
  ]
}
```

### 11.6 执行重编码

```http
POST /api/material-code-change-batches/{batchId}/execute
```

### 11.7 查询编码映射

```http
GET /api/material-libraries/{libraryId}/code-mappings
```

支持筛选条件：

```text
oldCode
newCode
batchId
materialName
changeTime
```

---

## 12. 编码生成引擎设计

### 12.1 核心逻辑

```text
输入：企业 ID、物料库 ID、物料信息、编码规则版本
输出：物料编码
```

生成步骤：

```text
1. 获取物料库当前启用编码规则；
2. 解析 rule_config 中的编码段；
3. 按 segment.order 排序；
4. 逐段生成编码内容；
5. 如遇流水号段，获取对应作用域的下一个流水号；
6. 拼接所有编码段；
7. 执行编码合法性校验；
8. 执行编码唯一性校验；
9. 返回最终编码。
```

### 12.2 伪代码

```python
def generate_material_code(tenant_id, library_id, material, rule_version):
    rule_config = rule_version.rule_config
    segments = sorted(rule_config["segments"], key=lambda x: x["order"])

    parts = []

    for segment in segments:
        segment_type = segment["type"]
        config = segment["config"]

        if segment_type == "fixed":
            parts.append(config["value"])

        elif segment_type == "category_path":
            category_code = get_category_path_code(
                material.category_id,
                config["levels"],
                config["lengths"]
            )
            parts.append(category_code)

        elif segment_type == "attribute":
            attr_code = get_attribute_code(
                material.attributes,
                config["attributeCode"],
                config.get("mapping", {})
            )
            parts.append(attr_code)

        elif segment_type == "date":
            date_part = format_date(config["format"])
            parts.append(date_part)

        elif segment_type == "serial":
            scope_key = build_scope_key(material, config["scope"])
            serial = next_serial(
                tenant_id,
                library_id,
                rule_version.id,
                scope_key,
                config["length"]
            )
            parts.append(serial)

    separator = rule_config.get("separator", "")
    code = separator.join(parts) if separator else "".join(parts)

    validate_code_format(code)
    validate_code_unique(tenant_id, code)

    return code
```

---

## 13. 并发控制设计

### 13.1 问题说明

多个用户同时创建物料，或者批量重编码时，可能同时申请同一流水号，导致编码重复。

### 13.2 解决方案

推荐使用：

```text
数据库事务 + 行级锁 + 唯一索引
```

流水号获取逻辑：

```sql
BEGIN;

SELECT current_value
FROM material_code_serial
WHERE tenant_id = ?
  AND material_library_id = ?
  AND rule_version_id = ?
  AND scope_key = ?
FOR UPDATE;

UPDATE material_code_serial
SET current_value = current_value + 1
WHERE tenant_id = ?
  AND material_library_id = ?
  AND rule_version_id = ?
  AND scope_key = ?;

COMMIT;
```

唯一索引兜底：

```sql
CREATE UNIQUE INDEX uk_tenant_material_code
ON material_master(tenant_id, material_code);
```

---

## 14. 重编码执行策略

### 14.1 小批量物料

如果物料数量较少，例如几百条以内，可以使用单事务执行。

优点：

```text
一致性强；
失败可整体回滚。
```

缺点：

```text
不适合大批量数据；
锁表时间较长。
```

### 14.2 大批量物料

如果物料数量较多，例如几万条、几十万条，建议分批执行。

策略：

```text
1. 先生成完整预览结果；
2. 将预览结果写入变更明细表；
3. 用户确认后按批次更新；
4. 每批处理 500 或 1000 条；
5. 每批独立事务；
6. 记录成功与失败数量；
7. 支持失败重试。
```

### 14.3 执行期间锁定物料库

重编码期间，物料库应进入特殊状态：

```text
recoding：重编码中
```

在该状态下禁止：

```text
1. 新增物料；
2. 修改物料编码；
3. 修改编码规则；
4. 再次发起重编码；
5. 删除物料库。
```

---

## 15. 回滚设计

### 15.1 回滚场景

```text
1. 重编码后发现编码规则配置错误；
2. 外部系统无法识别新编码；
3. 用户误操作执行了全部重编码；
4. 批量替换后业务方要求恢复旧编码。
```

### 15.2 回滚逻辑

```text
1. 根据编码变更批次找到所有变更明细；
2. 将 material_master.material_code 从 new_code 恢复为 old_code；
3. 将 previous_code 更新为回滚前的新编码；
4. 将 code_change_count 增加；
5. 将编码映射状态标记为已回滚；
6. 将规则版本恢复到旧版本；
7. 记录回滚日志。
```

### 15.3 回滚限制

如果新编码已经被外部系统引用，回滚存在业务风险。系统应提示：

```text
当前编码可能已被外部系统引用，回滚前请确认相关业务系统是否允许恢复旧编码。
```

---

## 16. 权限设计

| 权限点 | 说明 |
|---|---|
| material_library:create | 新增物料库 |
| material_library:view | 查看物料库 |
| code_rule:view | 查看编码规则 |
| code_rule:edit | 编辑编码规则 |
| code_rule:version:view | 查看规则版本 |
| code_rule:preview | 生成重编码预览 |
| code_rule:recode | 执行重编码 |
| code_rule:rollback | 执行编码回滚 |
| code_mapping:export | 导出编码映射 |
| operation_log:view | 查看操作日志 |

建议将“执行重编码”和“回滚编码”设置为高风险权限，仅授予管理员或主数据负责人。

---

## 17. 操作日志设计

### 17.1 需要记录的操作

```text
1. 新增物料库；
2. 修改物料库信息；
3. 新增编码规则版本；
4. 修改编码规则；
5. 生成重编码预览；
6. 执行批量重编码；
7. 执行编码回滚；
8. 导出编码映射；
9. 手工修改物料编码。
```

### 17.2 日志字段

| 字段 | 说明 |
|---|---|
| 操作人 | 谁执行的 |
| 操作时间 | 什么时候执行 |
| 操作类型 | 新增、修改、重编码、回滚 |
| 操作对象 | 物料库、编码规则、物料 |
| 操作前内容 | 变更前数据 |
| 操作后内容 | 变更后数据 |
| 操作结果 | 成功、失败 |
| 失败原因 | 异常信息 |
| IP 地址 | 操作来源 |

---

## 18. 异常处理

### 18.1 缺少类目编码

```text
当前物料未维护类目编码，无法根据编码规则生成物料编码。
```

### 18.2 缺少属性编码

```text
当前编码规则包含“材质编码”，但物料未维护材质属性。
```

### 18.3 属性值未配置映射

```text
属性值“聚氨酯”未配置对应编码映射，请先完善属性编码字典。
```

### 18.4 编码冲突

```text
新编码与已有物料编码重复，请调整编码规则或流水号策略。
```

### 18.5 物料库正在重编码

```text
当前物料库正在执行重编码任务，暂不允许新增物料或修改编码规则。
```

### 18.6 流水号超出最大值

```text
当前流水号已达到最大值，请调整流水号长度或扩展编码规则。
```

---

## 19. 产品约束与风险控制

### 19.1 规则变更约束

```text
1. 已启用规则不允许直接编辑；
2. 修改规则必须生成新版本；
3. 新版本必须填写变更原因；
4. 新规则启用前必须校验；
5. 批量重编码前必须生成预览；
6. 存在异常时默认不允许执行全量重编码。
```

### 19.2 编码替换风险

物料编码可能被以下业务引用：

```text
1. BOM；
2. 采购申请；
3. 采购订单；
4. 库存台账；
5. 出入库单；
6. 设备台账；
7. 供应商报价；
8. 历史报表；
9. 外部 ERP、SRM、WMS 系统。
```

因此系统应明确提示：

```text
批量重编码将修改当前物料库下物料的有效编码，请确认相关业务系统是否允许编码变更。
```

### 19.3 推荐控制方式

```text
1. 默认启用“重编码预览”；
2. 默认保留旧编码映射；
3. 默认记录编码变更批次；
4. 默认限制高风险操作权限；
5. 默认支持导出新旧编码映射；
6. 默认不删除历史编码。
```

---

## 20. 验收标准

### 20.1 新增物料库验收

```text
1. 用户可以新增物料库；
2. 新增物料库时可以配置编码规则；
3. 保存后自动生成编码规则 V1；
4. V1 自动设置为当前启用规则；
5. 新增物料时可以按 V1 自动生成编码。
```

### 20.2 编码规则查看验收

```text
1. 用户可以在物料库详情中查看当前编码规则；
2. 可以查看编码结构；
3. 可以查看流水号策略；
4. 可以查看当前规则版本；
5. 可以查看历史规则版本。
```

### 20.3 编码规则修改验收

```text
1. 用户修改编码规则时不会覆盖原规则；
2. 系统会生成新版本；
3. 用户可以选择生效方式；
4. 仅新增物料生效时，历史编码不变；
5. 全部重编码时，系统生成预览。
```

### 20.4 重编码验收

```text
1. 系统可以生成旧编码与新编码映射预览；
2. 系统可以检测编码冲突；
3. 系统可以检测属性缺失；
4. 系统可以检测非法编码；
5. 用户确认后可以批量替换物料编码；
6. 替换后物料主表显示新编码；
7. 系统保留旧编码与新编码映射；
8. 系统记录编码变更批次；
9. 系统记录操作日志。
```

### 20.5 并发验收

```text
1. 多用户同时新增物料时，不会生成重复编码；
2. 重编码期间不允许再次修改规则；
3. 重编码期间不允许新增物料；
4. 数据库唯一索引可以兜底防止重复编码。
```

---

## 21. 后续扩展方向

```text
1. 编码规则审批流；
2. 编码规则模板市场；
3. AI 推荐编码规则；
4. 编码规则拖拽式设计器；
5. 外部 ERP/SRM/WMS 编码同步；
6. 编码变更影响分析；
7. 编码规则模拟测试；
8. 编码质量评分；
9. 批量导入旧编码映射；
10. 多组织、多工厂编码规则继承。
```

---

## 22. 总结

本功能的核心是将物料编码规则从固定代码逻辑升级为**物料库级可配置能力**。

最终产品能力可以概括为：

```text
新增物料库时定义编码规则；
编码规则绑定物料库；
编码规则支持多版本管理；
修改规则不覆盖历史版本；
新规则可选择仅对新增物料生效；
也可选择对已有物料批量重编码；
重编码前必须生成新旧编码映射预览；
重编码后自动替换当前物料编码；
系统保留旧编码、新编码、规则版本和操作记录；
实现物料编码全生命周期可追溯。
```

建议将该能力作为物料治理系统中的核心基础能力之一，模块名称可以命名为：

```text
物料库编码规则管理
```

或：

```text
物料编码规则引擎
```
