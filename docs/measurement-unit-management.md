# 计量单位管理

## 实现范围

- PostgreSQL `measurement_units` 是计量单位字典事实源。
- 品名、物料和属性通过 nullable `unit_id` 引用字典。
- 旧 `unit` 字符串暂时保留，用于 API 兼容和未回填数据展示。
- 新前端只提交字典中的 `unit_id`，响应中的 `unit` 由字典符号生成。
- `users.unit` 是组织单位，不属于本功能。

## API

```text
GET    /api/v1/measurement-units
POST   /api/v1/measurement-units
PUT    /api/v1/measurement-units/{unit_id}
DELETE /api/v1/measurement-units/{unit_id}
```

查询支持 `keyword`、`unit_type` 和 `enabled`。删除前会统计
`product_names`、`materials` 和 `attributes` 引用；存在引用时返回
`409 UNIT_IN_USE`。数据库外键同时使用 `ON DELETE RESTRICT`。

## PostgreSQL Schema

根据 `AGENTS.md`，以下命令由人工操作员审查并执行，AI 不执行：

```bash
psql 'postgresql://<user>:<password>@<host>:15432/<database>' \
  --set ON_ERROR_STOP=1 \
  --file backend/db/add_measurement_units.sql
```

该 SQL 仅创建表、字段、索引和外键，不插入或回填业务数据。

## 历史数据

历史 `unit` 字符串继续可读，删除校验也会匹配单位编码、名称和符号。正式回填
前，人工应导出三个旧字段的 distinct 值，确认例如 `KG`、`kg`、`千克`、
`公斤` 的映射，再单独执行经批准的数据迁移命令。

禁止自动按文本猜测历史单位映射。
