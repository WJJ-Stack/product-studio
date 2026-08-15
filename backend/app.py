from __future__ import annotations

import asyncio
import json
import os
import re
from typing import Any

import httpx
from dotenv import load_dotenv
from collections import defaultdict
from time import time

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
load_dotenv(os.path.join(ROOT, ".env"))

DASHSCOPE_BASE = os.getenv("DASHSCOPE_BASE_URL", "https://dashscope.aliyuncs.com").rstrip("/")
IMAGE_MODEL = os.getenv("QWEN_IMAGE_MODEL", "qwen-image-2.0-pro")
COPY_MODEL = os.getenv("QWEN_COPY_MODEL", "qwen-plus")

SCENES: dict[str, str] = {
    "studio": (
        "将商品置于专业极简摄影棚：纯净浅灰或米白无缝背景，柔和箱灯与轮廓光，"
        "干净高质感电商主图，轻微倒影，无杂物、无人脸、无多余文字水印。"
    ),
    "forest": (
        "将商品置于自然森系场景：柔和日光、浅景深绿植与木质纹理，清新有机氛围，"
        "商品仍是画面绝对主体，包装清晰可读。"
    ),
    "cafe": (
        "将商品置于生活咖啡馆桌面：暖色灯光、木质桌面、浅景深咖啡杯与窗边光，"
        "生活感但专业构图，商品居中突出。"
    ),
    "luxury": (
        "将商品置于轻奢鎏金场景：暗金与香槟金光泽、丝绸或大理石质感、高级暗调光影，"
        "奢华但不喧宾夺主，商品包装与外形必须完整清晰。"
    ),
}

RATIO_SIZE: dict[str, str] = {
    "1:1": "1328*1328",
    "3:4": "1104*1472",
    "4:3": "1472*1104",
}

PLATFORM_HINTS: dict[str, str] = {
    "xiaohongshu": "小红书种草：口语化、有情绪、含 3-6 个话题标签风格的 tags。",
    "taobao": "淘宝/京东详情主图文案：卖点短句、参数感、转化导向。",
    "moments": "微信朋友圈：一两段短文，亲切分享，少标签。",
    "douyin": "抖音口播钩子：前 3 秒抓住注意力，短句换行感。",
}

app = FastAPI(title="AI 商品图工坊")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


class GenerateRequest(BaseModel):
    image_base64: str = Field(..., min_length=32)
    scene: str = "studio"
    ratio: str = "1:1"
    platform: str = "xiaohongshu"
    product_name: str = Field(..., min_length=1, max_length=80)
    extra: str = ""


def _api_key() -> str:
    return (os.getenv("DASHSCOPE_API_KEY") or "").strip()


@app.get("/api/health")
def health() -> dict[str, Any]:
    key = _api_key()
    return {
        "ok": bool(key),
        "image_model": IMAGE_MODEL,
        "copy_model": COPY_MODEL,
        "message": "千问服务就绪" if key else "未配置 DASHSCOPE_API_KEY",
    }


def _normalize_data_url(raw: str) -> str:
    s = raw.strip()
    if s.startswith("data:"):
        return s
    return f"data:image/jpeg;base64,{s}"


def _approx_bytes(data_url: str) -> int:
    if "," in data_url:
        b64 = data_url.split(",", 1)[1]
    else:
        b64 = data_url
    return int(len(b64) * 3 / 4)


def _extract_json(text: str) -> dict[str, Any]:
    text = text.strip()
    fence = re.search(r"```(?:json)?\s*([\s\S]*?)```", text)
    if fence:
        text = fence.group(1).strip()
    try:
        data = json.loads(text)
        if isinstance(data, dict):
            return data
    except json.JSONDecodeError:
        pass
    start, end = text.find("{"), text.rfind("}")
    if start >= 0 and end > start:
        data = json.loads(text[start : end + 1])
        if isinstance(data, dict):
            return data
    return {"title": text[:80], "body": text, "tags": []}


async def _qwen_image(client: httpx.AsyncClient, key: str, image: str, prompt: str, size: str) -> str:
    url = f"{DASHSCOPE_BASE}/api/v1/services/aigc/multimodal-generation/generation"
    payload = {
        "model": IMAGE_MODEL,
        "input": {
            "messages": [
                {
                    "role": "user",
                    "content": [
                        {"image": image},
                        {"text": prompt},
                    ],
                }
            ]
        },
        "parameters": {
            "n": 1,
            "prompt_extend": True,
            "size": size,
        },
    }
    resp = await client.post(
        url,
        headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json"},
        json=payload,
        timeout=180.0,
    )
    body = resp.json() if resp.content else {}
    if resp.status_code == 429:
        raise HTTPException(429, "千问生图繁忙，请稍后再试")
    if resp.status_code >= 500:
        raise HTTPException(502, "千问生图服务暂时不可用")
    if resp.status_code >= 400:
        msg = body.get("message") or body.get("code") or resp.text[:300]
        raise HTTPException(400, f"生图失败：{msg}")

    try:
        content = body["output"]["choices"][0]["message"]["content"]
        if isinstance(content, str):
            return content
        for item in content:
            if isinstance(item, dict):
                if item.get("image"):
                    return item["image"]
                if item.get("url"):
                    return item["url"]
        raise KeyError("no image")
    except (KeyError, IndexError, TypeError) as exc:
        raise HTTPException(502, f"生图返回无法解析：{json.dumps(body, ensure_ascii=False)[:400]}") from exc


async def _qwen_copy(client: httpx.AsyncClient, key: str, req: GenerateRequest) -> dict[str, Any]:
    hint = PLATFORM_HINTS.get(req.platform, PLATFORM_HINTS["xiaohongshu"])
    user = (
        f"商品名称：{req.product_name.strip()}\n"
        f"补充描述：{(req.extra or '无').strip()}\n"
        f"场景：{req.scene}\n"
        f"平台要求：{hint}\n"
        "只输出 JSON：{\"title\":\"爆款标题\",\"body\":\"正文\",\"tags\":[\"标签\"]}"
    )
    url = f"{DASHSCOPE_BASE}/compatible-mode/v1/chat/completions"
    payload = {
        "model": COPY_MODEL,
        "messages": [
            {
                "role": "system",
                "content": "你是电商营销文案编辑。必须只输出合法 JSON，不要 markdown。",
            },
            {"role": "user", "content": user},
        ],
        "temperature": 0.8,
    }
    resp = await client.post(
        url,
        headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json"},
        json=payload,
        timeout=60.0,
    )
    body = resp.json() if resp.content else {}
    if resp.status_code == 429:
        raise HTTPException(429, "千问文案繁忙，请稍后再试")
    if resp.status_code >= 400:
        msg = body.get("error", {}).get("message") if isinstance(body.get("error"), dict) else None
        raise HTTPException(400, f"文案失败：{msg or resp.text[:300]}")
    try:
        text = body["choices"][0]["message"]["content"]
    except (KeyError, IndexError, TypeError) as exc:
        raise HTTPException(502, "文案返回无法解析") from exc
    data = _extract_json(text)
    tags = data.get("tags") or []
    if isinstance(tags, str):
        tags = [t.strip() for t in re.split(r"[,\s#]+", tags) if t.strip()]
    return {
        "title": str(data.get("title") or req.product_name),
        "body": str(data.get("body") or ""),
        "tags": [str(t).lstrip("#") for t in tags][:8],
    }


@app.post("/api/generate")
async def generate(req: GenerateRequest) -> dict[str, Any]:
    key = _api_key()
    if not key:
        raise HTTPException(503, "未配置 DASHSCOPE_API_KEY，请在 product-studio/.env 填写百炼密钥")

    image = _normalize_data_url(req.image_base64)
    if _approx_bytes(image) > 10 * 1024 * 1024:
        raise HTTPException(400, "图片超过 10MB")

    scene_prompt = SCENES.get(req.scene, SCENES["studio"])
    size = RATIO_SIZE.get(req.ratio, RATIO_SIZE["1:1"])
    extra = (req.extra or "").strip()
    prompt = (
        f"这是商品「{req.product_name.strip()}」的照片。"
        "必须完整保留商品外形、材质、颜色和包装上的文字，不要替换成别的产品，不要扭曲瓶身或标签。"
        f"只改变拍摄场景、光影与构图。{scene_prompt}"
    )
    if extra:
        prompt += f" 额外要求：{extra}"
    prompt += " 专业电商摄影，高清，主体锐利。"

    async with httpx.AsyncClient() as client:
        img_task = _qwen_image(client, key, image, prompt, size)
        copy_task = _qwen_copy(client, key, req)
        image_out, copy_out = await asyncio.gather(img_task, copy_task)

    return {
        "image": image_out,
        "title": copy_out["title"],
        "body": copy_out["body"],
        "tags": copy_out["tags"],
        "scene": req.scene,
        "ratio": req.ratio,
        "platform": req.platform,
        "product_name": req.product_name.strip(),
    }


_RATE: dict[str, list[float]] = defaultdict(list)
_RATE_WINDOW = 3600
_RATE_MAX = int(os.getenv("GENERATE_RATE_MAX", "8"))


@app.middleware("http")
async def rate_limit_generate(request: Request, call_next):
    if request.url.path == "/api/generate" and request.method == "POST":
        ip = request.client.host if request.client else "unknown"
        now = time()
        hits = [t for t in _RATE[ip] if now - t < _RATE_WINDOW]
        if len(hits) >= _RATE_MAX:
            raise HTTPException(429, "本小时生成次数已用完，请稍后再试")
        hits.append(now)
        _RATE[ip] = hits
    return await call_next(request)


DIST = os.path.join(ROOT, "frontend", "dist")
if os.path.isdir(DIST):
    assets = os.path.join(DIST, "assets")
    if os.path.isdir(assets):
        app.mount("/assets", StaticFiles(directory=assets), name="assets")

    @app.get("/{full_path:path}")
    def spa(full_path: str):
        if full_path.startswith("api"):
            raise HTTPException(404, "Not Found")
        target = os.path.normpath(os.path.join(DIST, full_path or "index.html"))
        if not target.startswith(os.path.normpath(DIST)):
            raise HTTPException(404, "Not Found")
        if full_path and os.path.isfile(target):
            return FileResponse(target)
        return FileResponse(os.path.join(DIST, "index.html"))

