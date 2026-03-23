# OpenClaw Dashboard Docker 部署说明

本文档聚焦 Docker 部署方式。基础安装、开发方式与通用运行说明请参考 [README.md](./README.md)。

## Docker 概览

项目现在提供单镜像 Docker 部署方式。镜像内部只运行 dashboard server，前端静态资源仍由同一进程托管。

```bash
docker build -t openclaw-dashboard .
```

## 前提条件

- 已安装 Docker
- 有一个可访问的 [OpenClaw](https://github.com/openclaw/openclaw) Gateway，可运行在宿主机或其他 Docker 容器中

仪表盘默认连接到 `127.0.0.1:18789`，可通过 `GW_HOST` 与 `GW_PORT` 调整目标 Gateway 地址。

## 场景一：连接宿主机上的 OpenClaw

如果 OpenClaw 运行在宿主机上，可以将 Gateway 地址显式指向宿主机，并只读挂载 OpenClaw 配置与 sessions 目录：

```bash
docker run -d \
  --name openclaw-dashboard \
  -p 3210:3210 \
  -e PORT=3210 \
  -e GW_HOST=host.docker.internal \
  -e GW_PORT=18789 \
  --add-host=host.docker.internal:host-gateway \
  -v "$HOME/.openclaw/openclaw.json:/home/node/.openclaw/openclaw.json:ro" \
  -v "$HOME/.openclaw/agents/main/sessions:/home/node/.openclaw/agents/main/sessions:ro" \
  -v openclaw-dashboard-data:/data \
  openclaw-dashboard
```

> Linux Docker 环境通常需要 `--add-host=host.docker.internal:host-gateway`。如果你已经显式传入 `OPENCLAW_GATEWAY_TOKEN`，可以不挂载 `openclaw.json`。

## 场景二：连接另一个 Docker 容器中的 OpenClaw

如果 dashboard 和 OpenClaw 在同一个 Docker network 或 compose 项目中运行，可将 `GW_HOST` 设置为 OpenClaw 服务名。

请注意：`GW_HOST=openclaw` 只解决网络连接问题。dashboard 仍然需要读取 `openclaw.json` 与 session 日志，因此必须将同一份 OpenClaw 配置文件和 sessions 数据以只读方式挂载到 dashboard 容器中：

```yaml
services:
  openclaw-dashboard:
    build: .
    ports:
      - "3210:3210"
    environment:
      PORT: 3210
      GW_HOST: openclaw
      GW_PORT: 18789
    volumes:
      - ./docker-data/dashboard:/data
      - ${HOME}/.openclaw/openclaw.json:/home/node/.openclaw/openclaw.json:ro
      - ${HOME}/.openclaw/agents/main/sessions:/home/node/.openclaw/agents/main/sessions:ro
```

## 只读 volume 映射说明

推荐将以下宿主机路径以 **只读** 方式挂载到容器内：

- `~/.openclaw/openclaw.json` → `/home/node/.openclaw/openclaw.json:ro`
- `~/.openclaw/agents/main/sessions` → `/home/node/.openclaw/agents/main/sessions:ro`

这样可以满足两类只读输入：

- 自动发现 `OPENCLAW_GATEWAY_TOKEN`
- 读取 Activity / Task Log 所依赖的 session JSONL 日志

容器内的 `/data` 则应保持可写，用于保存 dashboard 自己生成的运行时状态文件：

- `.device-identity.json`
- `.task-summary-cache.json`

如果 `/data` 不持久化，容器重建后会重新生成设备身份与任务摘要缓存。

## 环境变量补充说明

你也可以在项目根目录创建 `.env` 文件来设置这些变量（参考 `.env.example`）。`.env` 中的值不会覆盖已经存在的环境变量。
