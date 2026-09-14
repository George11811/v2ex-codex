#!/usr/bin/env bash
# 批量截图：Chrome 的 --screenshot 是异步落盘的（父进程先退出），
# 所以只能「全部启动 → 轮询等文件出现」。浏览器不可用时静默跳过。
set -u
cd "$(dirname "$0")/.."

CHROME="/c/Program Files/Google/Chrome/Application/chrome.exe"
[ -x "$CHROME" ] || { echo "no chrome, skip"; exit 0; }

PORT="${PORT:-8899}"
BASE="http://127.0.0.1:$PORT"
OUT="ref/shots"
mkdir -p "$OUT"

# 仓库根目录：脚本可以在任意目录下调用。Chrome 的 --user-data-dir / --screenshot
# 需要绝对路径，但不能把本机路径硬编码进仓库。
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
case "$(uname -s)" in
  MINGW*|MSYS*|CYGWIN*)
    # git-bash 下 pwd 形如 /e/foo，Windows 版 Chrome 要 E:/foo。
    # 这里刻意不用 sed 反向引用 —— 反斜杠+数字穿过多层转义太容易写错。
    DRIVE="$(printf '%s' "$ROOT" | cut -c2 | tr '[:lower:]' '[:upper:]')"
    ROOT_WIN="$DRIVE:$(printf '%s' "$ROOT" | cut -c3-)"
    ;;
  *) ROOT_WIN="$ROOT" ;;
esac

# 预检：测试台没起来的话，Chrome 会把每个页面都渲染成连接错误页，
# 而产物是一堆尺寸一模一样的 23KB 空白图 —— 不看内容根本发现不了。
if ! curl -sf -o /dev/null --max-time 5 "$BASE/"; then
  echo "ERROR: test harness not reachable at $BASE"
  echo "      先跑: node tools/test-harness.js $PORT"
  exit 1
fi
echo "harness OK at $BASE"

rm -f "$OUT"/*.png

# name|path|size|theme
TARGETS=(
  "topic|/t/1241734?probe=1|1500,1000|"
  "topic-light|/t/1241734|1500,1000|light"
  "composer|/t/1241734?demo=1|1500,1000|"
  "agent-hover|/t/1241734?demo=agent|1500,1000|"
  "img-preview|/t/1241734?demo=img|1500,1000|"
  "boss|/t/1241734?demo=boss|1500,1000|"
  "boss-dark|/t/1241734?demo=boss|1500,1000|dark"
  "settings|/?demo=settings|1500,1000|"
  "settings-dark|/?demo=settings|1500,1000|dark"
  "home|/|1500,1000|"
  "dark-home|/|1500,1000|dark"   # 对比度测量基准
  "light-home|/|1500,1000|light" # 对比度测量基准
  "node|/go/programming|1500,1000|"
  "planes|/planes?probe=1|1500,1000|"
  "member|/member/pwinner|1500,1000|dark"
  "narrow|/t/1241734|1000,900|"
)

pids=()
for t in "${TARGETS[@]}"; do
  IFS='|' read -r name path size theme <<< "$t"
  url="$BASE$path"
  if [ -n "$theme" ]; then
    # 注意：路径里可能已经带了 ?demo=xxx，必须区分 ? 和 &
    case "$path" in
      *\?*) url="$BASE$path&theme=$theme" ;;
      *)    url="$BASE$path?theme=$theme" ;;
    esac
  fi
  prof=".prof-$name"
  rm -rf "$prof"
  "$CHROME" --headless=new --disable-gpu --no-sandbox --no-first-run --no-default-browser-check \
    --user-data-dir="$ROOT_WIN/$prof" --window-size="$size" --hide-scrollbars \
    --virtual-time-budget=5000 --screenshot="$ROOT_WIN/$OUT/$name.png" \
    "$url" >/dev/null 2>&1 &
  pids+=($!)
  echo "launched $name -> $url"
done

echo "waiting for screenshots (chrome writes them asynchronously)…"
deadline=$((SECONDS + 240))
while [ $SECONDS -lt $deadline ]; do
  done_count=$(ls "$OUT"/*.png 2>/dev/null | wc -l)
  [ "$done_count" -ge "${#TARGETS[@]}" ] && break
  sleep 5
done

# 关键：文件出现 ≠ 写完。上一次运行残留的 Chrome 可能还在异步落盘，
# 会把新图覆写成旧内容（害得我调了半天“为什么改了没变化”）。
# 所以再等一会儿，并校验文件尺寸稳定后才收工。
stable=0
prev=""
for _ in $(seq 1 12); do
  cur=$(ls -la "$OUT"/*.png 2>/dev/null | awk '{print $5}' | tr '\n' ',')
  if [ -n "$cur" ] && [ "$cur" = "$prev" ]; then
    stable=$((stable + 1))
    [ $stable -ge 2 ] && break
  else
    stable=0
  fi
  prev="$cur"
  sleep 5
done

# 清理临时 profile。Chrome 异步写盘时这些文件还锁着，删不掉很正常 —— 静音掉，
# 反正是 gitignore 的。关键是别把这一大堆 ENOENT/EBUSY 混进结果里。
for d in .prof-*; do [ -d "$d" ] && rm -rf "$d" >/dev/null 2>&1; done
echo "--- result ---"
ls -la "$OUT"
