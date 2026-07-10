#!/bin/bash
CDP="${CHROME_CDP_URL:-http://127.0.0.1:9222}"
PORT="${CDP##*:}"; PORT="${PORT%%/*}"
if curl -sf "http://127.0.0.1:${PORT}/json/version" >/dev/null 2>&1; then
  echo "✅ Chrome CDP 已就绪: $CDP"
  exit 0
fi
echo "❌ 未检测到 CDP — 请 npm run chrome:start"
exit 1
