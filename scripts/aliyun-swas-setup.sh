#!/bin/bash
set -euo pipefail
# 在阿里云轻量 Ubuntu 上安装 Docker 并启动造物工坊（需已把代码放到 /opt/product-studio）
export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get install -y ca-certificates curl git
if ! command -v docker >/dev/null 2>&1; then
  curl -fsSL https://get.docker.com | sh
fi
systemctl enable --now docker
cd /opt/product-studio
if [ ! -f .env ]; then
  echo "请先创建 /opt/product-studio/.env ，写入 DASHSCOPE_API_KEY=你的密钥"
  exit 1
fi
docker compose up -d --build
echo "已启动。用 http://服务器公网IP 打开。"
