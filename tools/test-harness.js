// 本地测试台：把 ref/*.html（真实 V2EX 页面）按 V2EX 的路径伺服，
// 并在 <head> 顶部注入用户脚本（等价于 @run-at document-start），
// 然后跑一组断言，把结果写进 <pre id="v2cx-test"> 供 --dump-dom 读取。
// 用法: node tools/test-harness.js [port]

const http = require("http");
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const PORT = Number(process.argv[2] || 8899);

const PAGES = {
  "/": "ref/home.html",
  "/t/1241734": "ref/topic.html",
  "/t/1241706": "ref/bigtopic.html",
  "/go/programming": "ref/node.html",
  "/recent": "ref/recent.html",
  "/member/pwinner": "ref/member.html",
  "/planes": "ref/planes.html",
  "/settings": "ref/home.html" // 未接管路由的样本
};

// 每次请求都重新读盘，并且禁掉缓存：
// 否则改完用户脚本后旧进程 / 浏览器磁盘缓存会静默返回旧版本，
// 截图和测试结果会看起来“没变化”。
function readUscript() {
  return fs.readFileSync(path.join(ROOT, "v2ex-codex.user.js"), "utf8");
}

const TEST_SNIPPET = `
<pre id="v2cx-test" style="display:none"></pre>
<script>
(function () {
  var PROBE = location.search.indexOf("probe") >= 0;
  var errors = [];
  window.addEventListener("error", function (e) {
    errors.push("window.error: " + (e.message || e.type));
  });
  window.addEventListener("unhandledrejection", function (e) {
    errors.push("unhandledrejection: " + (e.reason && e.reason.message || e.reason));
  });
  function q(sel) { return document.querySelectorAll(sel).length; }
  function report() {
   try {
    var lines = [];
    function check(name, ok, extra) {
      lines.push((ok ? "PASS" : "FAIL") + " | " + name + (extra ? " | " + extra : ""));
    }
    check("html.v2cx 已加上", document.documentElement.classList.contains("v2cx"));
    check("rail 已渲染", q(".v2cx-rail") === 1);
    check("rail 导航项 >= 4", q(".v2cx-rail-nav .v2cx-rail-item") >= 4);
    var locked = document.documentElement.classList.contains("v2cx-locked");
    lines.push("INFO | locked=" + locked + " path=" + location.pathname);
    if (locked) {
      check("main 已渲染", q(".v2cx-main") === 1);
      check("顶栏存在", q(".v2cx-topbar") === 1);
      check("内容非空", q(".v2cx-thread-inner *") > 5, "nodes=" + q(".v2cx-thread-inner *"));
    }
    // 按路由细分
    var p = location.pathname;
    if (p.indexOf("/t/") === 0 && locked) {
      check("OP 气泡", q(".v2cx-turn-user-bubble") === 1);
      check("回复楼层 >= 1", q(".v2cx-turn-agent") >= 1, "n=" + q(".v2cx-turn-agent"));
      // .v2cx-worked 同时用于 OP 行、每层回复行、以及每条「补充」行，
      // 所以只能断言 >= 楼层数 + 1（OP），不能要求严格相等。
      check("worked 行 >= 楼层 + OP", q(".v2cx-worked") >= q(".v2cx-turn-agent") + 1,
        q(".v2cx-worked") + " vs " + q(".v2cx-turn-agent"));
      check("详情页无重复大标题", document.querySelectorAll(".v2cx-detail-title").length === 0);
      var _cm = document.querySelector(".v2cx-topbar .v2cx-model");
      check("标题在顶栏里", !!_cm && (_cm.textContent || "").trim().length > 0);
    }
    if ((p === "/" || p === "/recent" || p === "/go/programming") && locked) {
      check("列表行 >= 10", q(".v2cx-row") >= 10, "n=" + q(".v2cx-row"));
      check("版块 chips >= 8", q(".v2cx-fchip") >= 8);
      check("行标题非空", (document.querySelector(".v2cx-row-title")||{}).textContent.trim().length > 0);
    }
    if (p === "/member/pwinner" && locked) {
      check("会员卡片", q(".v2cx-card h1") >= 1);
    }
    if (p === "/planes" && locked) {
      check("节点分组 >= 3", q(".v2cx-card-links") >= 3);
    }
    if (p === "/settings") {
      check("未接管路由不加 locked", !locked);
      check("未接管路由不渲染 main", q(".v2cx-main") === 0);
    }
    // 代码面板（可能在窄屏被 display:none 隐藏，但 DOM 应在）
    check("代码面板存在", q(".v2cx-code-panel") === 1);
    check("代码行 > 20", q(".v2cx-code-line") > 20, "n=" + q(".v2cx-code-line"));
    check("语法高亮生效", q(".v2cx-code-body .tk-k") > 5);
    check("无 JS 异常", errors.length === 0, errors.join(" ;; "));
    lines.push("INFO | --cx-bg=" + getComputedStyle(document.documentElement).getPropertyValue("--cx-bg").trim());
    lines.push("INFO | --cx-rail-bg=" + getComputedStyle(document.documentElement).getPropertyValue("--cx-rail-bg").trim());
    lines.push("INFO | box-bg-var=[" + getComputedStyle(document.documentElement).getPropertyValue("--box-background-color").trim() + "]");
    lines.push("INFO | body-bg=" + getComputedStyle(document.body).backgroundColor);
    lines.push("INFO | light-class=" + document.documentElement.classList.contains("v2cx-light"));
    lines.push("INFO | vsize=" + window.innerWidth + "x" + window.innerHeight);
    var pre = document.getElementById("v2cx-test");
    pre.textContent = "\\n" + lines.join("\\n") + "\\n";
    if (PROBE) {
      pre.style.cssText = "display:block;position:fixed;left:8px;top:8px;z-index:99999;" +
        "background:#fff;color:#000;font:12px/1.5 monospace;padding:10px 14px;" +
        "border:2px solid #000;max-height:96vh;overflow:auto;white-space:pre";
      document.body.appendChild(pre);
    }
   } catch (e) {
     var box = document.getElementById("v2cx-test");
     if (box) { box.style.cssText = "display:block;position:fixed;left:8px;top:8px;z-index:99999;background:#fff;color:#c00;font:12px monospace;padding:8px;border:2px solid #c00;white-space:pre"; box.textContent = "PROBE THREW: " + (e && e.message || e); document.body.appendChild(box); }
   }
  }
  window.addEventListener("load", function () {
    setTimeout(report, 400);
  });
  setTimeout(report, 1500); // 兜底
})();
</script>
`;

function serve(res, status, body, type) {
  res.writeHead(status, {
    "Content-Type": type || "text/html; charset=utf-8",
    "Cache-Control": "no-store, no-cache, must-revalidate",
    Pragma: "no-cache",
    Expires: "0"
  });
  res.end(body);
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, "http://x");
  const pathname = url.pathname;

  if (pathname === "/v2ex-codex.user.js") {
    return serve(res, 200, readUscript(), "text/javascript; charset=utf-8");
  }
  if (pathname === "/__test.js") {
    return serve(res, 200, TEST_SNIPPET, "text/html; charset=utf-8");
  }
  const rel = PAGES[pathname];
  if (!rel) return serve(res, 404, "not found: " + pathname);

  // ── 第一步：先把原始页面「洗成纯标记」──
  // 剥离所有脚本与外部样式：
  //   * V2EX 的内联脚本会调 protectTraffic() 等定义在外部 combo.js 里的函数，
  //     留着只会制造与用户脚本无关的报错噪音；
  //   * 外部 CSS 会真的联网，而且会让 isDarkMode() 读到 V2EX 自己的变量，
  //     测试就不只测用户脚本了。
  // 必须在注入之前做，否则会把注入的用户脚本一起删掉。
  let html = fs
    .readFileSync(path.join(ROOT, rel), "utf8")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<link[^>]+rel="stylesheet"[^>]*>/gi, "")
    .replace(/<ins class="adsbygoogle"[\s\S]*?<\/ins>/gi, "");

  // ── 第二步：注入 ──
  // 注入点紧跟 <head>（阻塞脚本，等价 @run-at document-start）。
  // ?theme=light|dark → 在用户脚本之前写 localStorage，用于双主题截图。
  const theme = url.searchParams.get("theme");
  const pre = theme
    ? `<script>try{localStorage.setItem("v2cx:theme",${JSON.stringify(theme)})}catch(e){}<\/script>`
    : "";
  const inject = pre + `<script src="/v2ex-codex.user.js"><\/script>`;
  html = html.includes("<head>")
    ? html.replace("<head>", "<head>" + inject)
    : inject + html;

  // 断言脚本放最后（在用户脚本之后执行）
  html = html.includes("</body>")
    ? html.replace("</body>", demoScript(url) + TEST_SNIPPET + "</body>")
    : html + TEST_SNIPPET;

  serve(res, 200, html);
});

/**
 * 截图用的演示注入：
 *   ?demo=1      往底部输入框填 markdown 并开预览
 *   ?demo=agent  强制显形前几条 hover 工具栏（截图里没法真的 hover）
 *   ?demo=boss   触发应急伪装视图（连按两下 Esc）
 */
function demoScript(url) {
  const demo = url.searchParams.get("demo");

  if (demo === "agent") {
    // 用 JS 精确指定几条回复显形（:nth-child 不可靠），
    // 并滚到回复区 —— 否则首屏全是 OP 正文，装饰和工具栏都在屏幕外。
    return `<script>setTimeout(function(){
      var turns = document.querySelectorAll(".v2cx-turn-agent");
      [0, 2, 4].forEach(function(i){
        var t = turns[i];
        if (!t) return;
        var bar = t.parentElement.querySelector(".v2cx-actions");
        if (bar) { bar.style.opacity = "1"; bar.style.pointerEvents = "auto"; }
      });
      if (turns[0]) turns[0].scrollIntoView({ block: "start" });
    }, 300);<\/script>`;
  }

  if (demo === "img") {
    // 滚到正文里的第一张图并触发鼠标悬停 → 悬浮大图预览
    return `<script>setTimeout(function(){
      var imgs = document.querySelectorAll(".v2cx-cooked img, .v2cx-turn-user-bubble img");
      var target = null;
      for (var i = 0; i < imgs.length; i++) {
        if (imgs[i].dataset.noPreview !== "1") { target = imgs[i]; break; }
      }
      if (!target) return;
      target.scrollIntoView({ block: "center" });
      var fire = function(){ target.dispatchEvent(new MouseEvent("mouseover", { bubbles: true })); };
      // 等缩略图加载完再 hover，否则截图会拍到「载入中」占位
      if (target.complete) setTimeout(fire, 150);
      else target.addEventListener("load", function(){ setTimeout(fire, 150); }, { once: true });
    }, 300);<\/script>`;
  }

  if (demo === "quotes") {
    // 滚到第一张引用卡片
    return `<script>setTimeout(function(){
      var q = document.querySelector(".v2cx-quote");
      if (q) q.scrollIntoView({ block: "center" });
    }, 300);<\/script>`;
  }

  if (demo === "settings") {
    return `<script>setTimeout(function(){
      var b = document.querySelector("[data-settings-open]");
      if (b) b.click();
    }, 350);<\/script>`;
  }

  if (demo === "boss") {
    return `<script>setTimeout(function(){
      var w = window;
      var ev = function(){ w.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })); };
      ev(); setTimeout(ev, 60);
    }, 300);<\/script>`;
  }

  if (demo !== "1") return "";
  const text = [
    "# 已应用到 topic_cache.rs",
    "",
    "把 **TTL 淘汰** 改成惰性惰除，顺带补一个回归用例：",
    "",
    "- 读取路径不再阻塞",
    "- `evict_stale()` 现在返回清理条数",
    "",
    "> 注意：V2EX 主题每页 100 楼，分页要跟原生对齐。",
    "",
    "```rust",
    "let gone = cache.evict_stale();",
    "assert_eq!(gone, 1);",
    "```"
  ].join("\n");
  return `<script>setTimeout(function(){
    var e=document.querySelector("[data-compose]");
    if(!e) return;
    e.textContent=${JSON.stringify(text)};
    e.dispatchEvent(new Event("input",{bubbles:true}));
    var p=document.querySelector('[data-tool="preview"]');
    if(p) p.click();
  },250);<\/script>`;
}

server.listen(PORT, "127.0.0.1", () => {
  console.log("test harness on http://127.0.0.1:" + PORT);
  console.log("pages: " + Object.keys(PAGES).join(", "));
});
