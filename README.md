# 造物工坊 · AI 商品图生成器

本地 Web 应用：上传商品照片 → 选择场景/比例/文案平台 → 调用阿里云百炼（通义千问）生成电商主图与营销文案。交互对齐 [造物图](https://ai.fireflyiv.com/)，品牌与接口为独立实现。

## 模型

| 用途 | 默认模型 | 说明 |
|------|----------|------|
| 商品图 | `qwen-image-2.0-pro` | 图编辑：保留商品主体，替换场景与光影 |
| 文案 | `qwen-plus` | 按小红书 / 淘宝京东 / 朋友圈 / 抖音出 JSON |

可在 `.env` 用 `QWEN_IMAGE_MODEL`、`QWEN_COPY_MODEL` 覆盖。

## 准备密钥

1. 打开 [阿里云百炼](https://bailian.console.aliyun.com/) 创建 API Key  
2. 复制 `product-studio/.env.example` 为 `.env`，填写：

```
DASHSCOPE_API_KEY=sk-...
```

未配置 Key 时，页面会显示服务未就绪，生成按钮不可用。

## 打开即用（单端口）

先构建前端，再用一个 FastAPI 同时提供页面和接口：

```powershell
cd 'D:\ai code\rpa\product-studio\frontend'
npm run build
cd 'D:\ai code\rpa\product-studio'
.\start.ps1
```

浏览器打开 http://127.0.0.1:8000

公网临时链接（电脑需保持开机）：用 Cloudflare 快速隧道，见 `scripts/public-tunnel.ps1`。链接任何人可访问，会消耗你的百炼额度；接口已做每 IP 每小时 8 次限制。

长期托管（电脑关机也在）：推荐 **Koyeb Hobby 免费实例**（不休眠）。把本目录推到 GitHub 后，用 Docker 部署，环境变量只填 `DASHSCOPE_API_KEY`（不要把 `.env` 提交进仓库）。备选 Render 免费版会 15 分钟无访问休眠，首次打开要等约 1 分钟。

## 启动（开发：前后端分离）

在 **两个终端** 中分别启动后端与前端。依赖安装走 D 盘缓存，venv 放在本目录。

PowerShell：

```powershell
$env:PIP_CACHE_DIR = 'D:\caches\pip'
$env:NPM_CONFIG_CACHE = 'D:\caches\npm'
$env:UV_CACHE_DIR = 'D:\caches\uv'
New-Item -ItemType Directory -Force -Path $env:PIP_CACHE_DIR, $env:NPM_CONFIG_CACHE, $env:UV_CACHE_DIR | Out-Null

cd 'D:\ai code\rpa\product-studio'
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r backend\requirements.txt
uvicorn backend.app:app --app-dir . --reload --port 8000
```

若 `uvicorn` 找不到模块，改用：

```powershell
cd 'D:\ai code\rpa\product-studio'
.\.venv\Scripts\Activate.ps1
$env:PYTHONPATH = (Get-Location).Path
python -m uvicorn backend.app:app --reload --host 127.0.0.1 --port 8000
```

前端：

```powershell
$env:NPM_CONFIG_CACHE = 'D:\caches\npm'
cd 'D:\ai code\rpa\product-studio\frontend'
npm install
npm run dev
```

浏览器打开 http://127.0.0.1:5173 （Vite 将 `/api` 代理到 8000）。

## 接口

- `GET /api/health` — 是否已配置密钥  
- `POST /api/generate` — JSON：`image_base64`、`scene`（studio/forest/cafe/luxury）、`ratio`（1:1 / 3:4 / 4:3）、`platform`（xiaohongshu/taobao/moments/douyin）、`product_name`、`extra`

最近作品保存在浏览器 `localStorage`，无登录。
