# Qdrant 到 Milvus 切换方案

## 1. 原则

- PostgreSQL 是唯一业务事实源。
- Milvus 只保存由 PostgreSQL 类目数据生成的向量和检索 payload。
- 不复制 Qdrant point，不保留 Qdrant collection ID 或内部元数据。
- 向量切换必须可重复、可校验；失败时关闭向量能力并从 PostgreSQL 重建，
  不回滚到 Qdrant，也不能反向写回 PostgreSQL。
- 根据 `AGENTS.md`，正式重建、切流、删除 collection 和停止 Qdrant 必须由
  人工执行；AI 只能提供实现、命令和只读验证。

## 2. 当前 Qdrant 使用面

当前实现位于 `backend/app/main.py`，包括：

- 连接配置：`QDRANT_URL`
- collection 命名：`category_library_<library_id>`
- 64 维本地确定性 embedding
- Cosine 距离
- collection 创建、删除和健康检查
- category point upsert/delete
- 类目库全量 re-embed
- 按类目库向量搜索
- `qdrant_enabled` 数据字段、API 字段和前端文案
- `/api/v1/health/qdrant`

Qdrant point payload：

```text
category_id
level1
level2
level3
level4
level5
path_string
```

## 3. Milvus 数据模型

使用单一 collection：

```text
category_vectors
```

字段：

| 字段 | Milvus 类型 | 说明 |
| --- | --- | --- |
| `category_id` | `INT64` primary key | PostgreSQL `categories.id` |
| `category_library_id` | `INT64` | 查询过滤条件 |
| `embedding` | `FLOAT_VECTOR(64)` | 当前确定性类目向量 |
| `code` | `VARCHAR(64)` | 类目编码 |
| `level1` | `VARCHAR` | 一级路径 |
| `level2` | `VARCHAR` nullable/empty | 二级路径 |
| `level3` | `VARCHAR` nullable/empty | 三级路径 |
| `level4` | `VARCHAR` nullable/empty | 四级路径 |
| `level5` | `VARCHAR` nullable/empty | 五级路径 |
| `path_string` | `VARCHAR` | 完整路径 |
| `source_updated_at` | `VARCHAR` | PostgreSQL 数据版本时间 |

索引：

```text
vector field: embedding
metric: COSINE
index: HNSW
```

搜索必须包含：

```text
category_library_id == <requested_library_id>
```

`category_id` 在 PostgreSQL 中全局唯一，因此可以直接作为 Milvus primary
key。使用共享 collection 可以避免大量小 collection，并简化全量校验和
生命周期管理。

## 4. 代码解耦

先建立 provider-neutral 接口，不在业务路由中直接调用 Milvus SDK：

```text
backend/app/vector_store/base.py
backend/app/vector_store/milvus.py
backend/app/vector_store/service.py
```

接口至少包括：

```python
class CategoryVectorStore(Protocol):
    def health(self) -> dict: ...
    def ensure_schema(self) -> None: ...
    def upsert_category(self, record: CategoryVectorRecord) -> None: ...
    def delete_category(self, category_id: int) -> None: ...
    def search(self, library_id: int, vector: list[float], limit: int) -> list[VectorMatch]: ...
    def rebuild(self, records: Iterable[CategoryVectorRecord]) -> RebuildResult: ...
```

业务层只依赖 `CategoryVectorStore`，不得出现 Qdrant/Milvus HTTP 数据结构。

Milvus 配置：

```bash
MILVUS_URI=http://192.168.100.100:19530
MILVUS_TOKEN=
MILVUS_DATABASE=material_retrieval
MILVUS_CATEGORY_COLLECTION=category_vectors
CATEGORY_EMBEDDING_DIM=64
```

应用启动时必须验证：

- Milvus 可连接；
- collection schema 与预期一致；
- vector dimension 为 64；
- metric 为 Cosine；
- 不满足时将向量功能标记为 unavailable，禁止回退 Qdrant。PostgreSQL
  CRUD 继续可用，向量检索/重建端点返回明确的 `503`，待 Milvus 恢复后由
  outbox 重试和全量重建校正。

## 5. API 与数据字段

数据库：

```text
DROP category_libraries.qdrant_enabled
ADD category_libraries.vector_index_enabled BOOLEAN NOT NULL DEFAULT false
```

当前向量功能未投入使用，因此不继承 `qdrant_enabled` 的历史值。Alembic
直接删除旧列并新增默认关闭的 `vector_index_enabled`；Milvus 重建和验收
完成后再由人工启用指定类目库。

API：

```text
qdrant_enabled
    -> vector_index_enabled

GET /api/v1/health/qdrant
    -> GET /api/v1/health/vector-store
```

前端：

- “Qdrant 启用”改为“向量检索启用”；
- 不在业务 UI 暴露具体向量数据库品牌；
- 健康/运维页面可以显示 provider=`milvus`。

本次直接进行不兼容替换：

- 删除请求和响应中的 `qdrant_enabled`；
- 删除 `/api/v1/health/qdrant`；
- 不提供字段 alias、旧端点转发或兼容适配；
- 不记录弃用日志；
- 后端、OpenAPI、前端和测试在同一版本统一使用新字段和新端点。

## 6. Docker Compose

Milvus standalone 需要独立的 Milvus 服务及其官方要求的元数据/对象存储
依赖。实施时从 Milvus 官方 standalone Compose 模板固化具体版本，并至少
包含：

```text
milvus-etcd
milvus-minio
milvus-standalone
```

后端只连接 `milvus-standalone:19530`。

在 Milvus-only 版本中直接删除：

```text
qdrant service
qdrant_data volume declaration
QDRANT_URL
QDRANT_HTTP_PORT
QDRANT_GRPC_PORT
```

不得让 Milvus 与现有其他项目的 MinIO/etcd 共用未隔离的数据目录。

Milvus 具体镜像版本需要在实施前单独锁定；禁止使用 `latest`。

## 7. 重建工具

建议新增：

```text
backend/scripts/rebuild_milvus_categories.py
backend/scripts/verify_milvus_categories.py
```

重建来源只能是 PostgreSQL。

工具行为：

1. 检查 PostgreSQL Schema revision；
2. 查询 `vector_index_enabled=true` 的类目库；
3. 按 ID 分页读取类目；
4. 根据 PostgreSQL 父子关系生成路径；
5. 使用当前 `category_embedding()` 算法生成 64 维向量；
6. 首次切换时写入尚未对外使用的 `category_vectors` collection；
7. 校验数量、ID、维度和抽样检索；
8. 人工确认通过后启动 Milvus-only 应用。

首次切换期间应用尚未开放 Milvus 查询，因此不需要兼容 collection 或观察
期。后续生产重建仍应使用新 collection 加 alias 切换，避免用户查询到
半成品索引。

## 8. 一致性验证

至少验证：

- Milvus entity 数等于所有启用类目库的 PostgreSQL 类目数；
- Milvus `category_id` 集合是 PostgreSQL 对应 ID 集合的精确子集/等集；
- 不存在引用已删除 PostgreSQL 类目的 entity；
- 每条向量维度为 64；
- 按类目库过滤不会返回其他库的数据；
- 抽样查询的 top-k ID、score 和路径结构符合预期；
- 新增、更新、移动、删除类目后 Milvus 同步正确；
- PostgreSQL 提交失败时 Milvus 不产生孤立写入；
- Milvus 不可用时业务数据仍保存在 PostgreSQL，并可稍后重建。

建议将实时同步改为 outbox/job：

1. PostgreSQL 事务提交类目变更和 vector outbox 事件；
2. worker 消费事件写 Milvus；
3. 成功后标记事件完成；
4. 失败可重试；
5. 全量重建负责最终一致性校正。

这比当前请求内同步 Qdrant 更能保证 PostgreSQL 的事实源地位，避免 Milvus
故障导致业务事务回滚或产生跨系统不一致。

## 9. 人工切换步骤

以下仅是供人工审查执行的操作顺序，AI 不执行：

1. 停止当前应用写流量；
2. 停止 Qdrant，确认当前系统没有依赖其在线数据；
3. 部署同时删除 Qdrant 代码、配置、依赖和 Compose service 的
   Milvus-only 版本；
4. 启动隔离的 Milvus standalone；
5. 运行 Milvus schema 初始化；
6. 从 PostgreSQL 重建 `category_vectors`；
7. 运行数量、ID、维度和抽样检索验证；
8. 设置 `MILVUS_CATEGORY_COLLECTION=category_vectors`；
9. 启动后端并检查 `/api/v1/health/vector-store`；
10. 开放 Milvus 查询和 outbox 同步；
11. 人工删除不再使用的 Qdrant volume。

## 10. 回滚

- 不保留 Qdrant 代码、API、容器或数据作为回滚路径。
- PostgreSQL 始终不回滚，仍是唯一业务事实源。
- Milvus 初始化或重建失败时，保持 `vector_index_enabled=false`，业务 CRUD
  继续使用 PostgreSQL，向量端点返回 `503`。
- 修复后从 PostgreSQL 重新创建 `category_vectors`。
- 后续版本回滚只能回滚到仍使用 PostgreSQL + Milvus 接口的应用版本。
