# PostgreSQL 唯一事实源切换方案

## 1. 目标

- PostgreSQL 17+ 成为物料中台唯一的关系型事实源。
- 应用、后台任务、本地开发、Docker Compose 和自动化测试均不得回退到
  SQLite。
- SQLite 仅作为切换前的只读归档，不再参与运行时读写。
- 只迁移人工批准的类目域数据；其他 SQLite 业务数据不迁移。
- Milvus 替代 Qdrant，保持为可重建的派生检索索引，不作为业务事实源。
- 不迁移 Qdrant 中的 point；所有 Milvus 向量必须从 PostgreSQL 业务数据
  重新生成。

## 2. 当前状态

- `backend/app/database.py` 在缺少 `DATABASE_URL` 时回退到
  `backend/material_retrieval.db`。
- `init.sh` 仅在 `USE_POSTGRES=1` 时为本地后端注入 PostgreSQL URL。
- 应用启动及多个业务函数仍调用 `Base.metadata.create_all()`。
- `backend/app/main.py` 仍包含 `PRAGMA`、`sqlite_master` 和 SQLite 专用的
  运行时表结构修补。
- Docker Compose 后端已经使用 PostgreSQL，但本地 `bash init.sh` 默认仍是
  SQLite。
- PostgreSQL 已存在 40 张表和少量种子数据，但当前运行中的后端仍连接
  SQLite。

当前 SQLite 类目域：

| 数据 | 数量 |
| --- | ---: |
| 类目库 | 32 |
| 类目 | 13,849 |
| 类目属性 | 12 |
| 引用不存在类目库的类目 | 257 |
| 引用不存在父类目的类目 | 91 |

候选业务类目库：

| ID | Code | 名称 | 类目数 | 属性数 | 丢失父节点 |
| ---: | --- | --- | ---: | ---: | ---: |
| 445 | `CLIB-897952FF` | 三横标准类目 | 13,498 | 1 | 91 |

其余数据中包含 `Sprint`、`Eval`、`Debug` 等测试记录，禁止按整库方式直接
复制。

## 3. 目标架构

```text
Browser / API client
        |
        v
FastAPI + SQLAlchemy
        |
        +---- PostgreSQL 17+  唯一业务事实源
        |
        +---- Milvus          可删除、可重建的派生索引

SQLite                  只读归档，不被应用加载
Qdrant                  Milvus-only 版本上线时直接移除
```

唯一运行时连接变量：

```bash
DATABASE_URL=postgresql+psycopg://<user>:<password>@<host>:<port>/<database>
```

PostgreSQL 服务端最低版本为 17。应用启动、部署检查和迁移工具必须拒绝
`server_version_num < 170000` 的数据库连接。

后端必须在以下情况启动失败：

- `DATABASE_URL` 缺失；
- URL 不是 `postgresql://` 或 `postgresql+psycopg://`；
- PostgreSQL 无法连接；
- Schema 版本未达到当前 Alembic head。

## 4. 实施工作包

### 4.1 PostgreSQL Schema 基线

1. 以 `backend/db/postgresql_schema.sql` 和 SQLAlchemy models 为输入建立
   Alembic。
2. 生成首个 PostgreSQL baseline revision，覆盖当前 40 张业务表、主键、
   唯一约束、外键、序列和索引。
3. 新数据库只允许通过 `alembic upgrade head` 初始化。
4. 删除以 `Base.metadata.create_all()` 代替迁移的启动行为。
5. 未来所有 Schema 变更必须增加新的 Alembic revision。

建议新增：

```text
backend/alembic.ini
backend/alembic/env.py
backend/alembic/versions/0001_postgresql_baseline.py
```

### 4.2 数据库连接重接

修改 `backend/app/database.py`：

- 删除 `DB_PATH` 和 SQLite 默认 URL；
- 要求 `DATABASE_URL` 必填；
- 拒绝 SQLite scheme；
- 使用 PostgreSQL pool、`pool_pre_ping` 和连接超时；
- 对外提供一个统一 `engine` 和 `SessionLocal`；
- 日志中只输出脱敏后的 host、port、database，禁止输出密码。

修改 `backend/app/main.py`：

- 删除所有 SQLite `PRAGMA`、`sqlite_master` 分支；
- 删除运行时 `ALTER TABLE`、补列、补索引逻辑；
- 删除业务请求路径中的 `Base.metadata.create_all()`；
- 保留幂等的最小种子逻辑，但种子只能写入已经完成 Alembic migration 的
  PostgreSQL；
- 健康检查增加 PostgreSQL `SELECT 1` 和当前 Schema revision 状态。

修改 `init.sh`：

- 删除 `USE_POSTGRES`；
- PostgreSQL 为强制依赖；
- 等待 PostgreSQL ready；
- 注入明确的 `DATABASE_URL`；
- 执行 `alembic upgrade head`，失败立即停止；
- 迁移成功后才启动 FastAPI；
- 禁止打印“回退 SQLite”提示或创建 `.db` 文件。

修改 Docker Compose：

- 数据库凭据改由 `.env` 或 secrets 注入；
- 后端继续等待 PostgreSQL healthy；
- 后端启动命令先执行 Alembic，再启动 Uvicorn；
- PostgreSQL volume 是唯一关系型持久化卷。

### 4.3 类目域迁移工具

建议新增：

```text
backend/scripts/migrate_categories_sqlite_to_postgres.py
backend/scripts/verify_category_migration.py
docs/category-migration-runbook.md
```

迁移工具只处理：

1. `category_libraries`
2. `categories`
3. `category_attributes`

工具必须具备：

- SQLite 只读连接；
- PostgreSQL 单事务写入；
- `--dry-run` 默认模式；
- `--execute` 显式执行模式；
- `--library-id` 可重复参数，禁止默认迁移全部类目库；
- 保留原始主键；
- 两阶段类目写入；
- 外键、重复 code、循环层级和属性引用校验；
- JSON/文本迁移报告；
- 完整回滚；
- sequence 修正；
- 重复运行保护。

两阶段类目写入：

1. 先插入所有类目，临时将 `parent_category_id` 写为 `NULL`；
2. 所有 ID 存在后，再批量恢复有效父子关系。

这是因为 PostgreSQL 会立即执行自引用外键，而 SQLite 历史数据并不保证父
节点先于子节点被读取。

### 4.4 脏数据策略

默认策略必须是 `fail`，禁止静默修复。

对于类目库 `445` 的 91 个丢失父节点，需要人工选择以下一种策略：

1. `fail`：先在 SQLite 归档副本中人工补齐父节点，然后迁移；
2. `detach`：保留类目，将失效的 `parent_category_id` 改为 `NULL`，提升为
   根类目，并输出逐条修复报告；
3. `exclude`：不迁移失效节点及其后代，并输出排除清单。

推荐使用 `detach` 保留 13,498 条类目，但必须由人工批准迁移报告。

禁止使用名称关键字自动判断业务/测试数据。迁移范围必须使用人工确认的
`category_library.id` 白名单；当前建议从 ID `445` 开始。

### 4.5 测试重接

- 后端数据库测试改用一次性 PostgreSQL database 或 schema。
- 每次测试创建独立资源，结束后删除。
- 测试不得打开或修改 `backend/material_retrieval.db`。
- 测试夹具执行 Alembic baseline，而不是 `create_all()`。
- 增加以下测试：
  - 缺少 `DATABASE_URL` 时启动失败；
  - SQLite URL 被拒绝；
  - PostgreSQL 不可用时不回退；
  - Schema revision 不正确时启动失败；
  - 类目迁移 dry-run；
  - 合成数据迁移、父子关系、属性和 sequence；
  - 应用重启后 PostgreSQL 数据仍存在；
  - SQLite 文件 hash 和 mtime 不变。

数据迁移脚本只能使用合成的临时 SQLite/PostgreSQL 数据自动测试，禁止自动
对真实数据库执行。

## 5. 人工数据迁移流程

根据 `AGENTS.md`，以下命令只能由人工操作员审查并执行。AI 只负责生成脚本、
解释输出及进行只读验证。

### 5.1 停写与备份

人工操作：

```bash
cp -p backend/material_retrieval.db \
  "backend/material_retrieval.pre-postgresql-$(date +%Y%m%d_%H%M%S).db"
```

```bash
sqlite3 "file:backend/material_retrieval.db?mode=ro" \
  "PRAGMA integrity_check;"
```

目标 PostgreSQL 已存在数据时，人工先备份：

```bash
pg_dump "$DATABASE_URL" \
  --format=custom \
  --file="postgresql-before-category-migration-$(date +%Y%m%d_%H%M%S).dump"
```

### 5.2 初始化全新 PostgreSQL

建议使用全新的目标数据库，而不是在当前种子数据库中原地覆盖。

现有 PostgreSQL 15 数据目录不能直接挂载给 PostgreSQL 17。必须由人工创建
新的 PostgreSQL 17 volume/database，并通过逻辑备份恢复或本方案的类目迁移
工具导入；禁止对旧 volume 执行原地复用或自动升级。

人工操作。`prepare-postgres` 会先单独提交 `public.aios` 迁移登记表，再执行
业务 Schema DDL：

```bash
export POSTGRES_URL='postgresql://material:<password>@<host>:15432/material_retrieval'

backend/.venv/bin/python \
  backend/scripts/migrate_sqlite_to_postgres_milvus.py \
  prepare-postgres \
  --postgres-url "$POSTGRES_URL" \
  --confirm I_UNDERSTAND_THIS_WRITES_DATA
```

### 5.3 只读预检

人工操作：

```bash
backend/.venv/bin/python \
  backend/scripts/migrate_sqlite_to_postgres_milvus.py \
  plan \
  --sqlite backend/material_retrieval.db \
  --library-id 445 \
  --orphan-parent-policy detach \
  --output category-migration-plan.json
```

人工必须检查报告：

- 只包含批准的类目库；
- 预计迁移 13,498 个类目；
- 预计迁移 1 条类目属性；
- 91 个失效父节点全部列出；
- 没有重复 code；
- 没有层级循环；
- 没有失效属性引用；
- 没有 SQLite 写操作。

### 5.4 正式迁移

仅人工确认 dry-run 报告后执行：

```bash
backend/.venv/bin/python \
  backend/scripts/migrate_sqlite_to_postgres_milvus.py \
  migrate-postgres \
  --sqlite backend/material_retrieval.db \
  --postgres-url "$POSTGRES_URL" \
  --approved-plan category-migration-plan.json \
  --confirm I_UNDERSTAND_THIS_WRITES_DATA
```

脚本会重新生成完整报告并与 `--approved-plan` 逐字段比较；SQLite SHA-256、
数据范围或策略发生任何变化时都会拒绝执行。

### 5.5 Sequence 修正

由迁移脚本在同一事务中执行：

```sql
SELECT setval(
  'category_libraries_id_seq',
  COALESCE((SELECT max(id) FROM category_libraries), 1),
  true
);

SELECT setval(
  'categories_id_seq',
  COALESCE((SELECT max(id) FROM categories), 1),
  true
);

SELECT setval(
  'category_attributes_id_seq',
  COALESCE((SELECT max(id) FROM category_attributes), 1),
  true
);
```

## 6. Milvus 重建与 Qdrant 退役

Qdrant point 不复制到 Milvus。Milvus collection 必须从 PostgreSQL
`categories` 重新生成，详细设计见 `docs/milvus-cutover-plan.md`。

切换原则：

1. PostgreSQL 类目迁移成功；
2. 应用连接 PostgreSQL 启动；
3. Milvus 使用全新的 `category_vectors` collection；
4. 通过向量重建命令从 PostgreSQL 写入 Milvus；
5. 校验 Milvus entity 的 `category_id` 全部存在于 PostgreSQL；
6. 切换应用读写到 Milvus；
7. 同一版本直接移除 Qdrant 配置、服务和代码。

Milvus 使用一个共享 collection，通过 `category_library_id` 标量字段过滤，
不再为每个类目库创建独立 collection：

```text
category_vectors
```

现有 `qdrant_enabled` 字段不保留历史值。Alembic 直接删除旧列并新增
`vector_index_enabled BOOLEAN NOT NULL DEFAULT false`。重建期间保持关闭，
完成并验证后再由人工启用，避免用户查询到半成品索引。

## 7. 切流步骤

1. 合并并部署 PostgreSQL-only 应用代码，但暂不开放写流量。
2. 人工备份 SQLite 和目标 PostgreSQL。
3. 人工执行 Alembic。
4. 人工执行类目迁移 dry-run。
5. 人工批准并执行类目迁移。
6. 设置生产 `DATABASE_URL`。
7. 启动后端，确认 Schema revision 和 PostgreSQL health。
8. 运行最小幂等种子。
9. 人工触发 Milvus 全量重建。
10. 执行 API、类目树、属性和重启验证。
11. 开放写流量。
12. 将 SQLite 文件移出运行目录并改为只读归档。

Milvus 人工重建命令（`MIGRATION_KEY` 取自预检报告）：

```bash
export MILVUS_URI='http://192.168.100.100:19530'
export MIGRATION_KEY='<category-migration-plan.json 中的 migration_key>'

backend/.venv/bin/python \
  backend/scripts/migrate_sqlite_to_postgres_milvus.py \
  rebuild-milvus \
  --postgres-url "$POSTGRES_URL" \
  --migration-key "$MIGRATION_KEY" \
  --milvus-uri "$MILVUS_URI" \
  --milvus-database material_retrieval \
  --collection category_vectors \
  --confirm I_UNDERSTAND_THIS_WRITES_DATA
```

## 8. 验收

### 数据库

- 进程环境中存在 PostgreSQL `DATABASE_URL`。
- `SHOW server_version_num` 返回值大于或等于 `170000`。
- PostgreSQL Schema revision 等于 Alembic head。
- 应用代码中不存在 SQLite fallback、`PRAGMA` 或 `sqlite_master`。
- 应用启动不调用 `Base.metadata.create_all()`。
- SQLite 缺失时系统仍能正常启动和使用。

### 类目数据

- 迁移报告与人工批准报告 hash 匹配。
- 类目库 `445` 存在。
- 迁移类目数与批准报告一致。
- 类目属性数与批准报告一致。
- 无类目库孤儿、父类目孤儿和属性孤儿。
- sequence 均大于或等于当前最大 ID。
- 类目树可以正常分页、展开和查询。

### 事实源

- 新增、编辑、删除类目只改变 PostgreSQL。
- 重启后数据保持。
- SQLite 文件 hash、mtime 和 size 始终不变。
- Milvus entity 可以由 PostgreSQL 数据完全重建。
- 应用和部署配置中不存在 `QDRANT_URL` 或 Qdrant 客户端调用。
- 停止 PostgreSQL 后，后端失败并且不会自动连接 SQLite。

## 9. 回滚边界

开放 PostgreSQL 写流量前：

- 可以停止新版本，恢复旧应用和只读归档的 SQLite。

开放 PostgreSQL 写流量后：

- 禁止直接切回 SQLite，否则会丢失 PostgreSQL 中的新写入。
- 应用回滚只能继续使用 PostgreSQL，或者恢复切流后的 PostgreSQL backup。
- Milvus 始终可以删除并从 PostgreSQL 重建。

## 10. 建议实施顺序

1. PostgreSQL-only 连接和 Alembic基线；
2. 删除 SQLite 运行时逻辑；
3. PostgreSQL 测试夹具；
4. 类目迁移脚本及合成数据测试；
5. Milvus adapter、重建工具及 Qdrant 退役；
6. 完整回归和部署演练；
7. 人工 dry-run；
8. 人工正式迁移和切流。
