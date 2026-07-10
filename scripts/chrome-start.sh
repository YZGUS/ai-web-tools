#!/bin/bash
# 启动带远程调试端口的 Chrome（独立 profile，Chrome 136+ 必需）
PORT="${CHROME_DEBUG_PORT:-9222}"
CHROME_BIN="${CHROME_BIN:-/Applications/Google Chrome.app/Contents/MacOS/Google Chrome}"
USER_DATA_DIR="${CHROME_USER_DATA_DIR:-$HOME/chrome-debug-profile}"

cdp_ok() { curl -sf "http://127.0.0.1:${PORT}/json/version" >/dev/null 2>&1; }

if cdp_ok; then
  echo "✅ Chrome CDP 已在 :${PORT}"
  exit 0
fi

echo "🚀 启动调试 Chrome :${PORT} profile=${USER_DATA_DIR}"
mkdir -p "$USER_DATA_DIR"
PROXY_ARGS=()
if [[ -n "${CHROME_PROXY:-}" ]]; then
  PROXY_ARGS=(--proxy-server="${CHROME_PROXY}")
elif nc -z -w 1 127.0.0.1 7897 2>/dev/null; then
  PROXY_ARGS=(--proxy-server="http://127.0.0.1:7897")
fi

"$CHROME_BIN" \
  --remote-debugging-port="${PORT}" \
  --user-data-dir="${USER_DATA_DIR}" \
  --no-first-run \
  --disable-blink-features=AutomationControlled \
  "${PROXY_ARGS[@]}" \
  >/dev/null 2>&1 &

for i in $(seq 1 30); do
  cdp_ok && echo "✅ CDP 就绪" && exit 0
  sleep 1
done
echo "❌ 超时"
exit 1
