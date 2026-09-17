#!/bin/bash
# JuanerAI Prism · 棱镜内容工作台 一键启动
# 双击运行：自动装依赖（首次）、初始化数据（首次）、同时拉起后端与前端，并打开浏览器。
# 关闭本终端窗口即停止全部服务。

cd "$(dirname "$0")" || exit 1

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  JuanerAI Prism · 棱镜内容工作台"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Node 检查
if ! command -v node >/dev/null 2>&1; then
  echo "❌ 未找到 Node.js，请先安装 Node 24+：https://nodejs.org"
  read -r -p "按回车退出…"
  exit 1
fi

# 首次运行：安装依赖
if [ ! -d node_modules ]; then
  echo "▶ 首次运行，安装依赖…"
  npm install --no-audit --no-fund || { echo "❌ 依赖安装失败"; read -r -p "按回车退出…"; exit 1; }
fi

# 首次运行或数据缺失：初始化示范数据
if [ ! -f data/prism.db ]; then
  echo "▶ 初始化示范数据（决策红利用例）…"
  npm run seed --silent
fi

# 清理残留进程
lsof -ti:8787 | xargs kill 2>/dev/null
lsof -ti:5173 | xargs kill 2>/dev/null

# 退出时回收子进程
cleanup() {
  echo
  echo "▶ 正在停止服务…"
  kill "$SERVER_PID" "$WEB_PID" 2>/dev/null
  exit 0
}
trap cleanup INT TERM EXIT

echo "▶ 启动后端  http://127.0.0.1:8787"
npm run dev:server --silent &
SERVER_PID=$!

echo "▶ 启动前端  http://localhost:5173"
npm run dev:web --silent &
WEB_PID=$!

# 等前端就绪后打开浏览器
for i in $(seq 1 30); do
  if curl -s -o /dev/null http://localhost:5173/; then
    break
  fi
  sleep 0.5
done

echo "▶ 打开浏览器…"
open http://localhost:5173

echo
echo "✅ Prism 已运行。关闭本窗口即停止服务。"
echo "   最终发布永远需要人类总编批准。"
wait
