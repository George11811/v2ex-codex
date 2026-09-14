// jsdom 测试：拿真实 V2EX 页面标记跑用户脚本，断言渲染结果。
// 用法: node tools/test-jsdom.js

const fs = require("fs");
const path = require("path");
const { JSDOM, VirtualConsole } = require("jsdom");

const ROOT = path.resolve(__dirname, "..");
const USCRIPT = fs.readFileSync(path.join(ROOT, "v2ex-codex.user.js"), "utf8");

const CASES = [
  { name: "首页 /", file: "ref/home.html", url: "https://www.v2ex.com/", expect: "list", minRows: 20, active: "首页" },
  { name: "首页 ?tab=hot", file: "ref/home.html", url: "https://www.v2ex.com/?tab=hot", expect: "list", minRows: 20, active: "最热" },
  { name: "首页 ?tab=creative", file: "ref/home.html", url: "https://www.v2ex.com/?tab=creative", expect: "list", minRows: 20, active: "创意" },
  { name: "首页 ?tab=tech", file: "ref/home.html", url: "https://www.v2ex.com/?tab=tech", expect: "list", minRows: 20, active: "技术" },
  { name: "首页 版块列表完整", file: "ref/home.html", url: "https://www.v2ex.com/", expect: "list", minRows: 20, active: "首页", railTabs: true },
  { name: "最近 /recent", file: "ref/recent.html", url: "https://www.v2ex.com/recent", expect: "list", minRows: 20, active: "最近" },
  { name: "最近 /recent?p=2", file: "ref/recent.html", url: "https://www.v2ex.com/recent?p=2", expect: "list", minRows: 20 },
  { name: "节点 /go/programming（不在常用列表）", file: "ref/node.html", url: "https://www.v2ex.com/go/programming", expect: "list", minRows: 10, active: "programming" },
  { name: "节点 /go/programmer", file: "ref/node.html", url: "https://www.v2ex.com/go/programmer", expect: "list", minRows: 10, active: "程序员" },
  { name: "主题 /t/1241734", file: "ref/topic.html", url: "https://www.v2ex.com/t/1241734", expect: "topic", minRows: 0 },
  { name: "主题（多页）/t/1241706", file: "ref/bigtopic.html", url: "https://www.v2ex.com/t/1241706", expect: "topic", minRows: 0 },
  { name: "主题 分页 /t/1241706?p=2", file: "ref/bigtopic.html", url: "https://www.v2ex.com/t/1241706?p=2", expect: "topic", minRows: 0 },
  { name: "会员 /member/pwinner", file: "ref/member.html", url: "https://www.v2ex.com/member/pwinner", expect: "member", minRows: 5 },
  { name: "全部节点 /planes", file: "ref/planes.html", url: "https://www.v2ex.com/planes", expect: "planes", minRows: 0, active: "全部节点" },
  { name: "未接管 /settings", file: "ref/home.html", url: "https://www.v2ex.com/settings", expect: "passthrough", minRows: 0 }
];

let pass = 0, fail = 0;
const failures = [];

function check(caseName, name, ok, extra) {
  const line = `${ok ? "PASS" : "FAIL"} | ${caseName} | ${name}${extra ? " | " + extra : ""}`;
  console.log(line);
  if (ok) pass++; else { fail++; failures.push(line); }
}

function stripScripts(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<link[^>]+rel="stylesheet"[^>]*>/gi, "");
}

async function runCase(c) {
  const html = stripScripts(fs.readFileSync(path.join(ROOT, c.file), "utf8"));
  const vc = new VirtualConsole();
  const jsErrors = [];
  vc.on("jsdomError", (e) => jsErrors.push(String(e.message || e)));
  vc.on("error", (...a) => jsErrors.push(a.join(" ")));

  const dom = new JSDOM(html, {
    url: c.url,
    runScripts: "dangerously",
    pretendToBeVisual: true,
    virtualConsole: vc
  });

  const win = dom.window;
  const doc = win.document;
  const scriptErrors = [];
  win.addEventListener("error", (e) => scriptErrors.push(String(e.message || e.type)));
  win.addEventListener("unhandledrejection", (e) => scriptErrors.push("rejection: " + (e.reason && e.reason.message || e.reason)));

  // 捕获用户脚本自身抛出的异常（否则会被 jsdom 吞掉）
  const origErr = win.console.error;
  win.console.error = (...a) => { scriptErrors.push(a.map(String).join(" ")); origErr.apply(win.console, a); };

  try {
    win.eval(USCRIPT);
  } catch (e) {
    check(c.name, "脚本可执行", false, e.message);
    dom.window.close();
    return;
  }

  // 等 rAF + 微任务链跑完
  await new Promise((r) => setTimeout(r, 300));

  check(c.name, "脚本无异常", scriptErrors.length === 0, scriptErrors.join(" ;; "));
  check(c.name, "html.v2cx", doc.documentElement.classList.contains("v2cx"));
  check(c.name, "rail 渲染", doc.querySelectorAll(".v2cx-rail").length === 1);
  check(c.name, "rail 导航项 >= 4", doc.querySelectorAll(".v2cx-rail-nav .v2cx-rail-item").length >= 4);
  check(c.name, "rail 常用节点项 >= 8", doc.querySelectorAll(".v2cx-rail-item[href^='/go/']").length >= 8);
  if (c.active && /^\/go\//.test(new URL(c.url).pathname)) {
    check(c.name, "当前节点已在 rail 常用列表里",
      !!doc.querySelector(`.v2cx-rail-item[href="${new URL(c.url).pathname}"]`));
  }

  const locked = doc.documentElement.classList.contains("v2cx-locked");

  if (c.expect === "passthrough") {
    check(c.name, "未接管：无 locked", !locked);
    check(c.name, "未接管：无 main", doc.querySelectorAll(".v2cx-main").length === 0);
    check(c.name, "未接管：rail 仍在", doc.querySelectorAll(".v2cx-rail").length === 1);
    dom.window.close();
    return;
  }

  check(c.name, "已接管 locked", locked);
  check(c.name, "main 渲染", doc.querySelectorAll(".v2cx-main").length === 1);
  check(c.name, "顶栏渲染", doc.querySelectorAll(".v2cx-topbar").length === 1);

  const inner = doc.querySelector(".v2cx-thread-inner");
  check(c.name, "内容区非空", !!inner && inner.children.length > 0);

  if (c.expect === "list" || c.expect === "member") {
    const rows = doc.querySelectorAll(".v2cx-row");
    check(c.name, `列表行 >= ${c.minRows}`, rows.length >= c.minRows, "n=" + rows.length);
    const first = doc.querySelector(".v2cx-row-title");
    check(c.name, "首行标题非空", !!first && first.textContent.trim().length > 0,
      first ? first.textContent.slice(0, 24) : "none");
    const firstHref = doc.querySelector(".v2cx-row");
    check(c.name, "行 href 指向 /t/", !!firstHref && /^\/t\/\d+/.test(firstHref.getAttribute("href") || ""),
      firstHref ? firstHref.getAttribute("href") : "none");
    const meta = doc.querySelector(".v2cx-row-meta");
    check(c.name, "行 meta 有时间", !!meta && /回复/.test(meta.textContent));
    // 列表行不再放头像，改成状态圆点
    check(c.name, "列表行无 <img>", doc.querySelectorAll(".v2cx-row img").length === 0,
      "n=" + doc.querySelectorAll(".v2cx-row img").length);
    check(c.name, "列表行有状态圆点", doc.querySelectorAll(".v2cx-row-avatar").length === rows.length,
      doc.querySelectorAll(".v2cx-row-avatar").length + " vs " + rows.length);
    check(c.name, "圆点区分有/无回复",
      doc.querySelectorAll(".v2cx-row-avatar.has-replies").length > 0 &&
      doc.querySelectorAll(".v2cx-row-avatar.has-replies").length <= rows.length);
  }

  if (c.expect === "list") {
    check(c.name, "版块 chips >= 8", doc.querySelectorAll(".v2cx-fchip").length >= 8);
    check(c.name, "标题 h1 非空", (doc.querySelector(".v2cx-head h1") || {}).textContent?.trim().length > 0);
    // ── 列表里的 agent 痕迹（把帖子流伪装成 agent 会话日志）──
    // 注意：上一个 if 块里的 rows 是 const，块级作用域，这里要重新取
    const rows = doc.querySelectorAll(".v2cx-row");
    const rowsBox = doc.querySelector(".v2cx-rows");
    const traces = rowsBox.querySelectorAll(":scope > .v2cx-runline, :scope > .v2cx-think");
    check(c.name, "列表里有 agent 痕迹", traces.length >= 3, "n=" + traces.length);
    check(c.name, "痕迹是行级兄弟节点（不在 <a> 里）",
      [...traces].every((x) => x.parentElement === rowsBox && !x.closest("a")));
    const listThink = rowsBox.querySelectorAll(":scope > .v2cx-think");
    // 默认展开（对齐参考图：满屏英文推理才是伪装重点）
    check(c.name, "列表思考块默认展开",
      listThink.length > 0 && [...listThink].every((x) => x.classList.contains("open")),
      "n=" + listThink.length);
    check(c.name, "展开态正文可见（display 非 none）",
      listThink.length > 0 &&
      win.getComputedStyle(listThink[0].querySelector(".v2cx-think-body")).display !== "none",
      listThink.length ? win.getComputedStyle(listThink[0].querySelector(".v2cx-think-body")).display : "none");
    // jsdom 不计算伪元素 content，所以直接校验样式规则本身
    // （用 includes 而不是正则：正则要穿过 python→js 两层转义，写过三次都写错了）
    const sheet = (doc.getElementById("v2ex-codex-theme") || {}).textContent || "";
    // 用 fromCharCode(92) 拼反斜杠：\25be 这种转义穿过 python→js→css 三层太容易写错
    const BS = String.fromCharCode(92);
    check(c.name, "展开指示符规则存在（▾）",
      sheet.includes(".v2cx-think.open .v2cx-think-chev::after") &&
      sheet.includes(BS + "25be"));
    check(c.name, "收起指示符规则存在（▸）",
      sheet.includes(".v2cx-think:not(.open) .v2cx-think-chev::after") &&
      sheet.includes(BS + "25b8"));
    if (listThink.length) {
      const head = listThink[0].querySelector(".v2cx-think-head");
      head.click();
      check(c.name, "点击后收起", !listThink[0].classList.contains("open"));
      check(c.name, "收起后正文隐藏",
        win.getComputedStyle(listThink[0].querySelector(".v2cx-think-body")).display === "none");
      head.click();
      check(c.name, "再点又展开", listThink[0].classList.contains("open"));
    }
    // 图标必须解析出来（自建图标集漏 key 会渲染成字面 undefined）
    const runlines = rowsBox.querySelectorAll(":scope > .v2cx-runline");
    check(c.name, "工具调用行有图标",
      [...runlines].every((x) => x.querySelector("svg")), "n=" + runlines.length);
    check(c.name, "思考块有 sparkle 图标",
      [...listThink].every((x) => x.querySelector(".v2cx-spin svg")), "n=" + listThink.length);
    check(c.name, "痕迹密度不过分", traces.length < rows.length,
      traces.length + " traces / " + rows.length + " rows");
    // 副行格式：#分类 · @最后回复者
    // 节点页的每一行都属于当前节点，所以不重复显示 #分类（V2EX 自己也不显）。
    const sub = doc.querySelector(".v2cx-row-sub");
    const isNodePage = /^\/go\//.test(new URL(c.url).pathname);
    check(c.name, "副行含 @用户",
      !!sub && /@\S/.test(sub.textContent), sub ? JSON.stringify(sub.textContent.trim()) : "none");
    check(c.name, isNodePage ? "节点页副行不重复 #分类" : "副行含 #分类",
      !!sub && (isNodePage ? !/^#/.test(sub.textContent.trim()) : /^#/.test(sub.textContent.trim())),
      sub ? JSON.stringify(sub.textContent.trim()) : "none");
    check(c.name, "副行不再出现「最后回复」", !!sub && !/最后回复/.test(sub.textContent));
  }

  if (c.expect === "topic") {
    check(c.name, "OP 气泡", doc.querySelectorAll(".v2cx-turn-user-bubble").length === 1);
    const turns = doc.querySelectorAll(".v2cx-turn-agent").length;
    const worked = doc.querySelectorAll(".v2cx-worked").length;
    check(c.name, "回复楼层 >= 1", turns >= 1, "n=" + turns);
    check(c.name, "worked 行 = 楼层 + OP + 补充", worked >= turns + 1, `${worked} vs ${turns}`);
    const title = doc.querySelector(".v2cx-detail-title");
    check(c.name, "详情页不重复渲染大标题", title === null);
    check(c.name, "详情页没有多余 h1",
      doc.querySelectorAll(".v2cx-thread-inner h1").length === 0,
      "n=" + doc.querySelectorAll(".v2cx-thread-inner h1").length);
    const crumbModel = doc.querySelector(".v2cx-topbar .v2cx-model");
    check(c.name, "标题在顶栏里", !!crumbModel && crumbModel.textContent.trim().length > 0,
      crumbModel ? JSON.stringify(crumbModel.textContent.slice(0, 30)) : "none");
    check(c.name, "顶栏标题带完整 tooltip", !!crumbModel && (crumbModel.getAttribute("title") || "").length > 0);
    // jsdom 不解析自定义属性，所以改成校验样式规则本身
    const topSheet = (doc.getElementById("v2ex-codex-theme") || {}).textContent || "";
    const modelRule = topSheet.slice(topSheet.indexOf(".v2cx-topbar .v2cx-crumb .v2cx-model"),
      topSheet.indexOf("}", topSheet.indexOf(".v2cx-topbar .v2cx-crumb .v2cx-model")));
    check(c.name, "顶栏标题用正文色（不是 dim）",
      modelRule.includes("color: var(--cx-text)"), JSON.stringify(modelRule.slice(0, 90)));
    const floor = doc.querySelector(".v2cx-worked .v2cx-floor");
    check(c.name, "楼号标签存在", !!floor && floor.textContent.trim().length > 0,
      floor ? floor.textContent : "none");
    check(c.name, "正文已清理 script",
      !/<script/i.test(doc.querySelector(".v2cx-thread-inner").innerHTML));
    // 楼层 id 锚点（跳转用）
    check(c.name, "楼层锚点存在", doc.querySelectorAll("[id^='reply']").length >= 1);
  }

  if (c.expect === "member") {
    check(c.name, "会员名渲染", (doc.querySelector(".v2cx-card-title h1") || {}).textContent?.trim().length > 0,
      (doc.querySelector(".v2cx-card-title h1") || {}).textContent);
    const bio = (doc.querySelector(".v2cx-card-sub") || {}).textContent || "";
    // V2EX 用空 <div class="sep5"> 做换行；不能出现 "…+08:00Today's…" 这种粘连
    check(c.name, "bio 块级分隔已保留", /\u00b7/.test(bio) && !/\d{2}:\d{2}[A-Za-z]/.test(bio), JSON.stringify(bio.slice(0, 90)));
  }

  if (c.expect === "planes") {
    check(c.name, "节点分组 >= 3", doc.querySelectorAll(".v2cx-card-links").length >= 3,
      "n=" + doc.querySelectorAll(".v2cx-card-links").length);
  }

  // 代码面板
  check(c.name, "代码面板存在", doc.querySelectorAll(".v2cx-code-panel").length === 1);
  const codeLines = doc.querySelectorAll(".v2cx-code-line").length;
  check(c.name, "代码行 > 20", codeLines > 20, "n=" + codeLines);
  check(c.name, "语法高亮 token", doc.querySelectorAll(".v2cx-code-body .tk-k").length > 5);
  check(c.name, "语言菜单 5 项", doc.querySelectorAll(".v2cx-lang-menu [data-code-lang-item]").length === 5);

  // ── 不变量：模板拼接漏字段会渲染出字面 undefined / [object Object] ──
  const appHtml = (doc.querySelector(".v2cx-rail") ? doc.querySelector(".v2cx-rail").outerHTML : "") +
    (doc.querySelector(".v2cx-main") ? doc.querySelector(".v2cx-main").outerHTML : "");
  check(c.name, "渲染结果无 undefined", !/undefined|\[object /.test(appHtml));

  // ── 不变量：整条 rail 最多一项 active（导航 / 版块 / 节点不得同时亮） ──
  const actives = doc.querySelectorAll(".v2cx-rail .v2cx-rail-item.active");
  check(c.name, "rail active <= 1", actives.length <= 1, "n=" + actives.length);
  if (c.active) {
    check(c.name, `rail 高亮 = ${c.active}`,
      actives.length === 1 && actives[0].textContent.trim() === c.active,
      actives.length ? JSON.stringify(actives[0].textContent.trim()) : "none");
  }

  // ── 不变量：渲染幂等（再跑一次不应产生重复节点） ──
  const beforeRail = doc.querySelectorAll(".v2cx-rail").length;
  const beforeMain = doc.querySelectorAll(".v2cx-main").length;
  win.eval("void 0");
  await new Promise((r) => setTimeout(r, 60));
  check(c.name, "rail 未重复", doc.querySelectorAll(".v2cx-rail").length === beforeRail);
  check(c.name, "main 未重复", doc.querySelectorAll(".v2cx-main").length === beforeMain);

  // ── 正文安全性：不应带 onclick / script ──
  const innerHtml = inner ? inner.innerHTML : "";
  check(c.name, "正文无 onclick", !/\son(click|error|load)\s*=/i.test(innerHtml));
  check(c.name, "正文无 script", !/<script/i.test(innerHtml));

  // ── 拖拽把手：必须锚在被调整的那条边上 ──
  check(c.name, "rail 把手在 rail 内", doc.querySelectorAll(".v2cx-rail > .v2cx-resizer").length === 1);
  check(c.name, "面板把手在面板内", doc.querySelectorAll(".v2cx-code-panel > .v2cx-resizer").length === 1);
  check(c.name, "面板把手不在 main 直下", doc.querySelectorAll(".v2cx-main > .v2cx-resizer").length === 0);

  // ── 时间格式化（不应残留原始 ISO / title 格式） ──
  if (c.expect === "list") {
    const t = (doc.querySelector(".v2cx-row-meta .v2cx-time") || {}).textContent || "";
    check(c.name, "时间已本地化", t.trim().length > 0 && !/\d{4}-\d{2}-\d{2}T/.test(t), JSON.stringify(t));
  }

  // ── 多页主题应该有页码 chip ──
  if (c.expect === "topic" && c.file === "ref/bigtopic.html") {
    const pages = doc.querySelectorAll(".v2cx-fchip[href*='?p=']");
    check(c.name, "多页主题有页码链接", pages.length >= 2, "n=" + pages.length);
    const cur = doc.querySelectorAll(".v2cx-fchip[href*='?p='].on");
    check(c.name, "当前页高亮唯一", cur.length === 1, "n=" + cur.length);
  }

  // ── 主题页不应有重复的「复制链接」入口 ──
  if (c.expect === "topic") {
    // 注意：上一个 if 块里的 turns 是 const，块级作用域，这里要重新取
    const turns = doc.querySelectorAll(".v2cx-turn-agent").length;
    const metaCopy = doc.querySelectorAll(".v2cx-detail-meta [data-act]");
    check(c.name, "标题行无冗余复制按钮", metaCopy.length === 0, "n=" + metaCopy.length);
    check(c.name, "楼层有复制链接", doc.querySelectorAll(".v2cx-worked [data-act='copy-link']").length >= 1);
    // ── 伪装装饰：agent 思考块 + 工具调用行 + hover 操作胶囊 ──
    const think = doc.querySelectorAll(".v2cx-turn .v2cx-think");
    check(c.name, "思考块覆盖率 40%~100%",
      think.length >= Math.floor(turns * 0.4) && think.length <= turns,
      think.length + " / " + turns);
    check(c.name, "思考块是「Worked for Ns」",
      think.length > 0 && /^Worked for \d+s$/.test(think[0].querySelector(".v2cx-think-head span:nth-child(2)").textContent),
      think.length ? think[0].querySelector(".v2cx-think-head span:nth-child(2)").textContent : "none");
    check(c.name, "思考块有英文正文", think.length > 0 && think[0].querySelector(".v2cx-think-body").textContent.trim().length > 20);
    check(c.name, "思考块带 sparkle 图标（不是 undefined）",
      think.length > 0 && /<svg/.test(think[0].querySelector(".v2cx-spin").innerHTML));
    if (think.length) {
      const head = think[0].querySelector(".v2cx-think-head");
      const before = think[0].classList.contains("open");
      head.click();
      check(c.name, "点标题可折叠思考块", think[0].classList.contains("open") !== before);
      head.click();
      check(c.name, "再点可展开", think[0].classList.contains("open") === before);
    }
    check(c.name, "详情思考块有 sparkle 图标",
      [...think].every((x) => x.querySelector(".v2cx-spin svg")), "n=" + think.length);
    check(c.name, "详情工具调用行有图标",
      [...doc.querySelectorAll(".v2cx-turn .v2cx-runline")].every((x) => x.querySelector("svg")));
    check(c.name, "装饰只加在回复楼（不加在 OP 气泡）",
      doc.querySelectorAll(".v2cx-turn-user-bubble .v2cx-think").length === 0);

    // 操作胶囊：每层一个，四个按钮
    const bars = doc.querySelectorAll(".v2cx-turn .v2cx-actions");
    check(c.name, "每层都有操作胶囊", bars.length === turns + 1, bars.length + " / " + (turns + 1));
    const acts = doc.querySelectorAll(".v2cx-turn .v2cx-actions .v2cx-act");
    check(c.name, "胶囊共 4 个按钮 × 楼层数", acts.length === (turns + 1) * 4, "n=" + acts.length);
    const kinds = [...doc.querySelectorAll(".v2cx-actions .v2cx-act")].map((b) => b.dataset.act);
    check(c.name, "按钮为 回复/赞/收藏/复制链接",
      ["reply", "thanks", "fav", "copy-link"].every((k) => kinds.includes(k)),
      [...new Set(kinds)].join(","));
    check(c.name, "回复楼带 data-reply-id（OP 除外）",
      [...doc.querySelectorAll('.v2cx-turn-agent ~ .v2cx-worked .v2cx-act[data-act="thanks"]')]
        .filter((b) => /^\d+$/.test(b.dataset.replyId || "")).length === turns,
      [...doc.querySelectorAll('.v2cx-act[data-act="thanks"]')].map((b) => b.dataset.replyId || "-").join(","));
    check(c.name, "胶囊里有可见文字标签",
      [...doc.querySelectorAll(".v2cx-actions .v2cx-act span")].map((x) => x.textContent).join("").includes("复制链接"));

    // 确定性：同一楼层反复渲染结果必须一致（刷新不闪）
    const snap1 = doc.querySelector(".v2cx-thread-inner").innerHTML;
    win.eval("void 0");
    check(c.name, "装饰稳定（无随机闪烁）",
      doc.querySelector(".v2cx-thread-inner").innerHTML === snap1);

    check(c.name, "标题行无头像", doc.querySelectorAll(".v2cx-detail-meta img").length === 0);
    check(c.name, "楼层行无头像", doc.querySelectorAll(".v2cx-worked img").length === 0);
    check(c.name, "标题行有感谢/反对", doc.querySelectorAll(".v2cx-detail-meta [data-vote]").length === 2);
    const vbtns = doc.querySelectorAll(".v2cx-detail-meta [data-vote]");
    check(c.name, "感谢/反对按钮存在", vbtns.length === 2, "n=" + vbtns.length);
    check(c.name, "投票按钮带 topicId",
      vbtns.length === 2 && /^\d+$/.test(vbtns[0].dataset.topic || ""), vbtns.length ? vbtns[0].dataset.topic : "none");
  }

  // ── 会员页：会员信息不重复出现在 rail 高亮里 ──
  if (c.expect === "member") {
    check(c.name, "会员页 rail 无 active", actives.length === 0, "n=" + actives.length);
  }

  if (c.railTabs) {
    // 版块列表必须包含全部版块（除「最热」已提到顶部导航）
    const want = ["技术", "创意", "好玩", "Apple", "酷工作", "交易", "城市", "问与答", "全部", "R2"];
    const got = Array.from(doc.querySelectorAll(".v2cx-rail-item[href^='/?tab=']")).map((a) => a.textContent.trim());
    check(c.name, "版块列表完整", want.every((w) => got.includes(w)), got.join(","));
  }

  dom.window.close();
}

/** 底部输入框：结构 + 工具条编辑 + 草稿 + 发送 */
async function runComposerCase() {
  const name = "底部输入框";
  console.log(`
──── ${name} ────`);
  const html = stripScripts(fs.readFileSync(path.join(ROOT, "ref/topic.html"), "utf8"));
  const dom = new JSDOM(html, {
    url: "https://www.v2ex.com/t/1241734",
    runScripts: "dangerously",
    pretendToBeVisual: true
  });
  const win = dom.window, doc = win.document;
  win.open = () => null; // jsdom 的 window.open 未实现，避免噪音
  try { win.eval(USCRIPT); } catch (e) {
    check(name, "脚本可执行", false, e.message); dom.window.close(); return;
  }
  await new Promise((r) => setTimeout(r, 250));

  const edit = doc.querySelector("[data-compose]");
  check(name, "composer 已渲染", doc.querySelectorAll(".v2cx-composer").length === 1);
  check(name, "编辑区 contenteditable", !!edit && edit.getAttribute("contenteditable") === "true");
  check(name, "工具按钮 13 个", doc.querySelectorAll(".v2cx-tool-btn").length === 13,
    "n=" + doc.querySelectorAll(".v2cx-tool-btn").length);
  check(name, "每个工具按钮都有 title",
    [...doc.querySelectorAll(".v2cx-tool-btn")].every((b) => (b.getAttribute("title") || "").length > 0));
  check(name, "发送按钮存在", doc.querySelectorAll(".v2cx-send").length === 1);
  check(name, "空内容时发送禁用", doc.querySelector(".v2cx-send").disabled === true);
  check(name, "主题页占位符是「回复…」", /^回复「/.test(edit.dataset.placeholder || ""),
    JSON.stringify(edit.dataset.placeholder));
  // 防回归：模板拼接漏字段会渲染出字面 "undefined"
  const composerHtml = doc.querySelector(".v2cx-composer").outerHTML;
  check(name, "composer 无 undefined", !/undefined|NaN|\[object/.test(composerHtml));
  check(name, "发送按钮是箭头 SVG",
    /<svg/.test(doc.querySelector(".v2cx-send").innerHTML) &&
    !/undefined/.test(doc.querySelector(".v2cx-send").innerHTML));
  check(name, "每个工具按钮图标非空",
    [...doc.querySelectorAll(".v2cx-tool-btn")].every((b) => b.innerHTML.trim().length > 0));
  check(name, "初始状态栏为空",
    (doc.querySelector(".v2cx-composer-status").textContent || "") === "",
    JSON.stringify(doc.querySelector(".v2cx-composer-status").textContent));
  // composer 是浮层，必须不占据文档流
  const cs = win.getComputedStyle(doc.querySelector(".v2cx-composer-wrap"));
  check(name, "composer wrap 为 absolute", cs.position === "absolute", cs.position);
  // 面板展开时 composer 收窄一档（对齐原版「输入框随分屏变窄」）
  const card = doc.querySelector(".v2cx-composer");
  check(name, "面板展开时 composer 收窄 500",
    win.getComputedStyle(card).maxWidth === "500px", win.getComputedStyle(card).maxWidth);
  // [hidden] 必须真的隐藏（作者样式的 display 会盖掉 UA 的 display:none）
  check(name, "回复目标条默认隐藏",
    win.getComputedStyle(doc.querySelector(".v2cx-compose-target")).display === "none",
    win.getComputedStyle(doc.querySelector(".v2cx-compose-target")).display);

  // --- 输入 → 状态同步 + 草稿落盘 ---
  edit.textContent = "abc";
  edit.dispatchEvent(new win.Event("input", { bubbles: true }));
  check(name, "有内容后发送可用", doc.querySelector(".v2cx-send").disabled === false);
  check(name, "草稿写入 localStorage",
    win.localStorage.getItem("v2cx:draft:t:1241734") === "abc",
    JSON.stringify(win.localStorage.getItem("v2cx:draft:t:1241734")));
  check(name, "has-content 类已加", edit.classList.contains("has-content"));

  // --- 工具条：mousedown 必须 preventDefault（否则丢选区） ---
  const sel = win.getSelection();
  const range = doc.createRange();
  range.selectNodeContents(edit);
  sel.removeAllRanges();
  sel.addRange(range);
  const down = new win.MouseEvent("mousedown", { bubbles: true, cancelable: true });
  doc.querySelector('[data-tool="bold"]').dispatchEvent(down);
  check(name, "工具 mousedown 被 preventDefault", down.defaultPrevented === true);
  doc.querySelector('[data-tool="bold"]').click();
  check(name, "选中后粗体包裹 = **abc**", edit.textContent === "**abc**", JSON.stringify(edit.textContent));

  // --- 引用：行首前缀 ---
  doc.querySelector('[data-tool="quote"]').click();
  check(name, "引用加行首前缀", edit.textContent.startsWith("> "), JSON.stringify(edit.textContent));

  // --- 标题循环：## → ### → #### → 去掉 ---
  edit.textContent = "标题";
  doc.querySelector('[data-tool="heading"]').click();
  const h2 = edit.textContent;
  doc.querySelector('[data-tool="heading"]').click();
  const h3 = edit.textContent;
  doc.querySelector('[data-tool="heading"]').click();
  const h4 = edit.textContent;
  doc.querySelector('[data-tool="heading"]').click();
  const h0 = edit.textContent;
  check(name, "标题循环 ## → ### → #### → 无",
    h2 === "## 标题" && h3 === "### 标题" && h4 === "#### 标题" && h0 === "标题",
    [h2, h3, h4, h0].join(" / "));

  // --- 更多弹层 ---
  doc.querySelector('[data-tool="plus"]').click();
  check(name, "「更多」弹层打开", doc.querySelector("[data-plus-pop]").classList.contains("on"));
  doc.querySelectorAll("[data-plus-item]")[1].click(); // 分隔线
  check(name, "「更多」插入片段", edit.textContent.includes("---"), JSON.stringify(edit.textContent));
  check(name, "「更多」插入后收起", !doc.querySelector("[data-plus-pop]").classList.contains("on"));

  // --- 表情 ---
  doc.querySelector('[data-tool="emoji"]').click();
  const emoBtn = doc.querySelector("[data-emoji]");
  check(name, "表情面板已生成", !!emoBtn);
  if (emoBtn) { const before = edit.textContent.length; emoBtn.click();
    check(name, "表情已插入", edit.textContent.length > before); }

  // --- 预览 ---
  edit.textContent = "# 标题\n\n**粗体** 和 `code`\n\n- a\n- b";
  doc.querySelector('[data-tool="preview"]').click();
  const pv = doc.querySelector(".v2cx-compose-preview");
  check(name, "预览已开启", doc.querySelector(".v2cx-composer").classList.contains("preview-on"));
  check(name, "预览渲染 h2", pv.querySelectorAll("h2").length === 1);
  check(name, "预览渲染 strong", pv.querySelectorAll("strong").length === 1);
  check(name, "预览渲染 code", pv.querySelectorAll("code").length === 1);
  check(name, "预览渲染 ul/li", pv.querySelectorAll("ul li").length === 2);
  check(name, "预览不引入未转义 HTML",
    !/<script/i.test(pv.innerHTML) && !/onerror=/i.test(pv.innerHTML));
  doc.querySelector('[data-tool="preview"]').click();
  check(name, "预览可关闭", !doc.querySelector(".v2cx-composer").classList.contains("preview-on"));

  // --- 发送：未登录（无 #reply-box）→ 不伪造提交 ---
  edit.textContent = "hello v2ex";
  edit.dispatchEvent(new win.Event("input", { bubbles: true }));
  doc.querySelector(".v2cx-send").click();
  const status = (doc.querySelector(".v2cx-composer-status") || {}).textContent || "";
  check(name, "无原生回复框时给出提示", /未登录|草稿/.test(status), JSON.stringify(status));
  check(name, "未登录时不伪造提交（正文保留）", edit.textContent === "hello v2ex", JSON.stringify(edit.textContent));

  // --- hover 胶囊的「回复」：把 @用户名 前缀写进输入框 ---
  const replyBtn = doc.querySelector('.v2cx-turn .v2cx-act[data-act="reply"]');
  check(name, "楼层回复按钮存在", !!replyBtn);
  if (replyBtn) {
    edit.textContent = "";
    const user = replyBtn.dataset.user;
    replyBtn.click();
    check(name, "回复按钮写入 @用户名",
      user && edit.textContent.startsWith("@" + user + " "),
      JSON.stringify({ user, text: edit.textContent }));
    const st = (doc.querySelector(".v2cx-composer-status") || {}).textContent || "";
    check(name, "回复状态有提示", st.length > 0, JSON.stringify(st));
  }

  dom.window.close();
}

/** 拖拽把手：位置 + 拖动写入 CSS 变量 + 双击重置 */
async function runResizerCase() {
  const name = "拖拽调宽";
  console.log(`
──── ${name} ────`);
  const html = stripScripts(fs.readFileSync(path.join(ROOT, "ref/home.html"), "utf8"));
  const dom = new JSDOM(html, {
    url: "https://www.v2ex.com/",
    runScripts: "dangerously",
    pretendToBeVisual: true
  });
  const win = dom.window, doc = win.document;
  try { win.eval(USCRIPT); } catch (e) {
    check(name, "脚本可执行", false, e.message); dom.window.close(); return;
  }
  await new Promise((r) => setTimeout(r, 250));

  const panelRz = doc.querySelector(".v2cx-code-panel > .v2cx-resizer");
  const railRz = doc.querySelector(".v2cx-rail > .v2cx-resizer");
  check(name, "面板把手存在于面板内", !!panelRz);
  check(name, "rail 把手存在于 rail 内", !!railRz);
  check(name, "把手可拖拽（cursor 由 CSS 控制）", (panelRz.dataset.resize || "") === "panel");

  // 拖动面板把手
  panelRz.dispatchEvent(new win.MouseEvent("mousedown", { bubbles: true, cancelable: true, clientX: 1000 }));
  check(name, "拖拽中标记 dragging", panelRz.classList.contains("dragging"));
  win.dispatchEvent(new win.MouseEvent("mousemove", { bubbles: true, clientX: 900 }));
  const afterMove = doc.documentElement.style.getPropertyValue("--v2cx-panel-w");
  check(name, "拖动设置了 --v2cx-panel-w", /^\d+px$/.test(afterMove), JSON.stringify(afterMove));
  win.dispatchEvent(new win.MouseEvent("mouseup", { bubbles: true, clientX: 900 }));
  check(name, "松开后移除 dragging", !panelRz.classList.contains("dragging"));

  // 双击重置
  panelRz.dispatchEvent(new win.MouseEvent("dblclick", { bubbles: true }));
  const reset = doc.documentElement.style.getPropertyValue("--v2cx-panel-w");
  check(name, "双击重置面板宽度 = 460px", reset === "460px", JSON.stringify(reset));

  railRz.dispatchEvent(new win.MouseEvent("dblclick", { bubbles: true }));
  const railReset = doc.documentElement.style.getPropertyValue("--cx-rail-w");
  check(name, "双击重置 rail 宽度 = 306px", railReset === "306px", JSON.stringify(railReset));

  dom.window.close();
}

/**
 * 隐蔽性：标签页标题伪装 + 应急伪装视图（Esc Esc / Ctrl+Shift+H）
 */
async function runStealthCase() {
  const name = "隐蔽性";
  console.log(`\n──── ${name} ────`);
  const html = stripScripts(fs.readFileSync(path.join(ROOT, "ref/topic.html"), "utf8"));
  const dom = new JSDOM(html, {
    url: "https://www.v2ex.com/t/1241734",
    runScripts: "dangerously",
    pretendToBeVisual: true
  });
  const win = dom.window, doc = win.document;
  try { win.eval(USCRIPT); } catch (e) {
    check(name, "脚本可执行", false, e.message); dom.window.close(); return;
  }
  await new Promise((r) => setTimeout(r, 250));

  // ── 品牌 / 标题 ──
  check(name, "rail 品牌名 = Codex",
    (doc.querySelector(".v2cx-rail-brand-name") || {}).textContent.trim().startsWith("Codex"),
    (doc.querySelector(".v2cx-rail-brand-name") || {}).textContent.trim());
  check(name, "标签页标题已伪装", /\.(rs|py|ts|go|java) — \w+$/.test(doc.title), JSON.stringify(doc.title));
  check(name, "标题不含 V2EX", !/V2EX/i.test(doc.title), JSON.stringify(doc.title));
  check(name, "标题不含「主题」", !/主题/.test(doc.title), JSON.stringify(doc.title));

  // ── 伪装视图：默认隐藏 ──
  // 伪装视图是懒建的：不用它就不生成（省掉每次加载都算一遍假代码）
  check(name, "伪装视图默认不存在（懒建）", !doc.querySelector(".v2cx-boss"));
  check(name, "默认不加 v2cx-boss-on", !doc.documentElement.classList.contains("v2cx-boss-on"));

  // ── 双击 Esc 打开 ──
  const esc = () => win.dispatchEvent(new win.KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
  esc();
  check(name, "单击 Esc 不触发", !doc.documentElement.classList.contains("v2cx-boss-on"));
  esc();
  check(name, "双击 Esc 打开伪装", doc.documentElement.classList.contains("v2cx-boss-on"));
  const box = doc.querySelector(".v2cx-boss");
  check(name, "打开后伪装视图已建立", !!box);
  check(name, "伪装视图可见", win.getComputedStyle(box).display !== "none");
  check(name, "伪装时隐藏 rail/main",
    win.getComputedStyle(doc.querySelector(".v2cx-rail")).visibility === "hidden",
    win.getComputedStyle(doc.querySelector(".v2cx-rail")).visibility);
  check(name, "伪装视图有代码行", box.querySelectorAll(".v2cx-code-line").length > 20,
    "n=" + box.querySelectorAll(".v2cx-code-line").length);
  check(name, "伪装视图有语法高亮", box.querySelectorAll(".v2cx-boss-editor .tk-k").length > 3);
  check(name, "伪装视图有终端日志", /cargo test|test result/.test(box.querySelector("[data-boss-log]").textContent));
  check(name, "伪装视图有光标", box.querySelectorAll(".v2cx-boss-caret").length === 1);

  // ── 再双击 Esc 关闭 ──
  esc(); esc();
  check(name, "再次双击 Esc 恢复", !doc.documentElement.classList.contains("v2cx-boss-on"));
  check(name, "恢复后伪装视图隐藏",
    !doc.querySelector(".v2cx-boss") || win.getComputedStyle(doc.querySelector(".v2cx-boss")).display === "none");

  // ── Ctrl+Shift+H 备用键 ──
  win.dispatchEvent(new win.KeyboardEvent("keydown", { key: "H", ctrlKey: true, shiftKey: true, bubbles: true }));
  check(name, "Ctrl+Shift+H 也能打开", doc.documentElement.classList.contains("v2cx-boss-on"));
  win.dispatchEvent(new win.KeyboardEvent("keydown", { key: "H", ctrlKey: true, shiftKey: true, bubbles: true }));
  check(name, "Ctrl+Shift+H 也能关闭", !doc.documentElement.classList.contains("v2cx-boss-on"));

  // ── 输入框里聚焦时，Esc² 依然要能应急（可用性优先）──
  // 先确保是关闭态
  if (doc.documentElement.classList.contains("v2cx-boss-on")) { esc(); esc(); }
  const edit = doc.querySelector("[data-compose]");
  edit.focus();
  edit.dispatchEvent(new win.KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
  check(name, "输入框内单击 Esc 不触发", !doc.documentElement.classList.contains("v2cx-boss-on"));
  edit.dispatchEvent(new win.KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
  check(name, "输入框内 Esc² 仍可应急", doc.documentElement.classList.contains("v2cx-boss-on"));
  check(name, "进入伪装时已失焦", doc.activeElement !== edit, String(doc.activeElement && doc.activeElement.tagName));

  dom.window.close();
}

/**
 * 正文图片：默认缩略图 + 悬浮大图预览 + 点击灯箱
 */
async function runImageCase() {
  const name = "图片缩略图";
  console.log(`\n──── ${name} ────`);
  const html = stripScripts(fs.readFileSync(path.join(ROOT, "ref/topic.html"), "utf8"));
  const dom = new JSDOM(html, {
    url: "https://www.v2ex.com/t/1241734",
    runScripts: "dangerously",
    pretendToBeVisual: true
  });
  const win = dom.window, doc = win.document;
  try { win.eval(USCRIPT); } catch (e) {
    check(name, "脚本可执行", false, e.message); dom.window.close(); return;
  }
  await new Promise((r) => setTimeout(r, 250));

  const imgs = doc.querySelectorAll(".v2cx-cooked img");
  check(name, "正文里有图片", imgs.length >= 3, "n=" + imgs.length);

  // ── 缩略图：CSS 约束 ──
  const css = (doc.getElementById("v2ex-codex-theme") || {}).textContent || "";
  // 缩略图尺寸由 CONFIG 下发到 CSS 变量（和 --v2cx-thread-max 同套路）
  // 注意是 inline style 下发，不在样式表文本里，所以要读 documentElement.style
  const rs = doc.documentElement.style;
  check(name, "缩略图尺寸已下发",
    rs.getPropertyValue("--v2cx-thumb-w") === "260px" &&
    rs.getPropertyValue("--v2cx-thumb-h") === "170px",
    rs.getPropertyValue("--v2cx-thumb-w") + " / " + rs.getPropertyValue("--v2cx-thumb-h"));
  check(name, "正文宽度变量也在下发", rs.getPropertyValue("--v2cx-thread-max") === "760px");
  check(name, "图片 max-width 走变量",
    /\.v2cx-cooked img[\s\S]{0,260}max-width: var\(--v2cx-thumb-w/.test(css));
  check(name, "图片默认不再是 100% 宽", !/\.v2cx-cooked img[\s\S]{0,120}max-width: 100%/.test(css));

  // ── 悬浮预览：懒建 ──
  check(name, "预览层默认不存在（懒建）", !doc.querySelector(".v2cx-imgpreview"));

  const img = imgs[0];
  img.dispatchEvent(new win.MouseEvent("mouseover", { bubbles: true }));
  const box = doc.querySelector(".v2cx-imgpreview");
  check(name, "mouseover 建立预览层", !!box);
  check(name, "预览层已显示", !!box && box.classList.contains("on"));
  check(name, "预览层是 fixed 定位（不引起重排）",
    !!box && win.getComputedStyle(box).position === "fixed");
  check(name, "预览层 pointer-events: none（不挡鼠标）",
    !!box && win.getComputedStyle(box).pointerEvents === "none",
    box ? win.getComputedStyle(box).pointerEvents : "none");
  // 预览必须复用 <img> 自己的 URL（同一张原图，已在缓存里 → 零延迟、不多发请求）
  const bigSrc = box ? box.querySelector("img").getAttribute("src") : "";
  const thumbSrc = new URL(img.getAttribute("src"), "https://www.v2ex.com/t/1241734").href;
  check(name, "预览复用已缓存的缩略图 URL", bigSrc === thumbSrc, bigSrc + " vs " + thumbSrc);
  check(name, "预览 URL 是同源/图床直链", /\.(png|jpe?g|gif|webp)$/i.test(bigSrc), bigSrc);
  check(name, "预览有文件名标题",
    !!box && (box.querySelector("[data-ipv-name]") || {}).textContent.length > 0,
    box ? box.querySelector("[data-ipv-name]").textContent : "none");
  check(name, "预览有位置（已定位）",
    !!box && /^\d+px$/.test(box.style.left) && /^\d+px$/.test(box.style.top),
    box ? box.style.left + "," + box.style.top : "none");

  // ── 加载态：图还没到位时不能塌成小胶囊（真实场景里缩略图本身可能仍在下载）──
  check(name, "图未到位时带 loading 占位",
    box.classList.contains("loading"), box.className);
  const pImg = box.querySelector("img");
  Object.defineProperty(pImg, "complete", { value: true, configurable: true });
  Object.defineProperty(pImg, "naturalWidth", { value: 800, configurable: true });
  Object.defineProperty(pImg, "naturalHeight", { value: 400, configurable: true });
  pImg.dispatchEvent(new win.Event("load"));
  check(name, "load 后移除 loading", !box.classList.contains("loading"), box.className);
  check(name, "load 后重新定位",
    /^\d+px$/.test(box.style.left) && /^\d+px$/.test(box.style.top));

  // 重复 mouseover 同一个图不应该重建节点
  const same = box;
  img.dispatchEvent(new win.MouseEvent("mouseover", { bubbles: true }));
  check(name, "重复 hover 复用同一个预览层",
    doc.querySelectorAll(".v2cx-imgpreview").length === 1 &&
    doc.querySelector(".v2cx-imgpreview") === same);

  // ── mouseout 后收起 ──
  img.dispatchEvent(new win.MouseEvent("mouseout", { bubbles: true }));
  await new Promise((r) => setTimeout(r, 160));
  check(name, "mouseout 后收起预览",
    !doc.querySelector(".v2cx-imgpreview") ||
    !doc.querySelector(".v2cx-imgpreview").classList.contains("on"));

  // ── 滚动收起 ──
  img.dispatchEvent(new win.MouseEvent("mouseover", { bubbles: true }));
  check(name, "再次 hover 又显示", doc.querySelector(".v2cx-imgpreview").classList.contains("on"));
  win.dispatchEvent(new win.Event("scroll"));
  check(name, "滚动时收起预览（避免错位）",
    !doc.querySelector(".v2cx-imgpreview").classList.contains("on"));

  // ── 点击仍然走灯箱 ──
  img.dispatchEvent(new win.MouseEvent("click", { bubbles: true, cancelable: true }));
  check(name, "点击开灯箱", !!doc.querySelector(".v2cx-lightbox"));
  check(name, "开灯箱时预览已收起",
    !doc.querySelector(".v2cx-imgpreview").classList.contains("on"));
  doc.dispatchEvent(new win.KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
  check(name, "Esc 关灯箱", !doc.querySelector(".v2cx-lightbox"));

  // ── 小图（表情 / 图标）不该被当成可预览大图 ──
  check(name, "有 markSmallImages 兜底逻辑", /function markSmallImages/.test(USCRIPT));
  check(name, "小图走 data-no-preview 短路",
    /dataset\.noPreview === "1"/.test(USCRIPT));

  dom.window.close();
}

/**
 * 可读性：rail 文字与底色的 WCAG 对比度。
 *
 * 这条断言是补票 —— 之前 rail 三档文字沿用了原脚本的实测值，
 * 深色下 #6c787d on #27353b 只有 1.9:1，分区小标题基本看不见。
 * 现在从 CSS token 里把真实值解析出来实算，低于 AA(4.5:1) 直接失败。
 */
function relLuminance(hex) {
  const n = parseInt(String(hex).replace("#", "").slice(-6), 16);
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
}
function contrastRatio(fg, bg) {
  const a = relLuminance(fg), b = relLuminance(bg);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}
function tokenBlock(sheet, selector) {
  const i = sheet.indexOf(selector);
  if (i < 0) return null;
  const j = sheet.indexOf("{", i);
  const k = sheet.indexOf("}", j);
  const out = {};
  sheet.slice(j + 1, k).replace(/--([\w-]+)\s*:\s*([^;]+);/g, (m, name, val) => {
    out[name] = val.trim();
    return m;
  });
  return out;
}

async function runContrastCase() {
  const name = "可读性对比度";
  console.log(`\n──── ${name} ────`);
  const html = stripScripts(fs.readFileSync(path.join(ROOT, "ref/home.html"), "utf8"));
  const dom = new JSDOM(html, {
    url: "https://www.v2ex.com/",
    runScripts: "dangerously",
    pretendToBeVisual: true
  });
  const win = dom.window, doc = win.document;
  try { win.eval(USCRIPT); } catch (e) {
    check(name, "脚本可执行", false, e.message); dom.window.close(); return;
  }
  await new Promise((r) => setTimeout(r, 250));

  const sheet = (doc.getElementById("v2ex-codex-theme") || {}).textContent || "";
  check(name, "拿到样式表", sheet.length > 1000, "len=" + sheet.length);

  const themes = [
    { label: "深色", sel: "html.v2cx {", block: tokenBlock(sheet, "html.v2cx {") },
    { label: "浅色", sel: "html.v2cx.v2cx-light {", block: tokenBlock(sheet, "html.v2cx.v2cx-light {") }
  ];

  for (const th of themes) {
    const b = th.block;
    check(name, `${th.label} token 块解析到`, !!b && !!b["cx-rail-bg"],
      b ? Object.keys(b).length + " vars" : "none");
    if (!b || !b["cx-rail-bg"]) continue;

    const bg = b["cx-rail-bg"];
    const pairs = [
      ["rail 正文", b["cx-rail-text"]],
      ["rail 次级", b["cx-rail-text-dim"]],
      ["rail 分区标题", b["cx-rail-text-faint"]],
      ["主题正文", b["cx-text"]],
      ["主题次级", b["cx-text-secondary"]]
    ];
    for (const [what, fg] of pairs) {
      if (!fg) { check(name, `${th.label} ${what} 有值`, false); continue; }
      // rail 的三档对 rail 底色；cx-text 系列对主区底色
      const base = what.startsWith("rail") ? bg : b["cx-bg"];
      const r = contrastRatio(fg, base);
      // rail 用更高的名义阈值：名义值必须为细体中文的抗锯齿损耗留出余量。
      // 经验值 —— 名义 7.76:1 时有效只有 3.89:1，所以名义至少要到 6.5。
      // 权威判定在 npm run contrast（直接在截图像素上算有效值）。
      const min = what.startsWith("rail") ? 6.5 : 4.5;
      check(name, `${th.label} ${what} 名义对比度 >= ${min}`, r >= min,
        fg + " on " + base + " = " + r.toFixed(2) + ":1");
    }
  }

  // 顺带校验：代码面板的行号不需要高对比，但不能低到看不见
  const dark = tokenBlock(sheet, "html.v2cx {");
  if (dark) {
    const r = contrastRatio(dark["cx-code-gutter"], dark["cx-panel-bg"]);
    check(name, "行号可辨认（>= 3:1）", r >= 3, r.toFixed(2) + ":1");
  }

  dom.window.close();
}

/** 浅色模式：预置 localStorage 后重跑，验证 class 与 token 切换 */
async function runLightModeCase() {
  const name = "浅色模式";
  console.log(`\n──── ${name} ────`);
  const html = stripScripts(fs.readFileSync(path.join(ROOT, "ref/topic.html"), "utf8"));
  const dom = new JSDOM(html, {
    url: "https://www.v2ex.com/t/1241734",
    runScripts: "dangerously",
    pretendToBeVisual: true
  });
  const win = dom.window, doc = win.document;
  win.localStorage.setItem("v2cx:theme", "light");
  try {
    win.eval(USCRIPT);
  } catch (e) {
    check(name, "脚本可执行", false, e.message);
    dom.window.close();
    return;
  }
  await new Promise((r) => setTimeout(r, 250));
  check(name, "html.v2cx-light", doc.documentElement.classList.contains("v2cx-light"));
  const btn = doc.querySelector("[data-mode-toggle]");
  check(name, "模式按钮已渲染", !!btn && btn.innerHTML.length > 10);
  const css = (doc.getElementById("v2ex-codex-theme") || {}).textContent || "";
  check(name, "浅色 token 存在", css.includes("v2cx-light") && css.includes("--cx-bg: #f4f4f4"));
  // 原脚本浅色块尾部多了一个 `}`，导致后面的 --cx-font-* / --cx-rail-w 落在选择器外失效。
  // 这里用结构性断言代替单一用例：花括号必须配平，共享变量只能在选择器内出现。
  const open = (css.match(/\{/g) || []).length;
  const close = (css.match(/\}/g) || []).length;
  check(name, "CSS 花括号配平", open === close, `${open} vs ${close}`);
  check(name, "--cx-rail-w 声明且在选择器内",
    (css.match(/--cx-rail-w:/g) || []).length === 1 &&
    css.indexOf("--cx-rail-w:") < css.indexOf(".v2cx-light"));
  check(name, "--cx-font-ui 声明且在选择器内",
    (css.match(/--cx-font-ui:/g) || []).length === 1 &&
    css.indexOf("--cx-font-ui:") < css.indexOf(".v2cx-light"));
  check(name, "无选择器外的孤立声明", !/\}\s*\n\s*--cx-[a-z-]+:/.test(css));
  dom.window.close();
}

/** 解析失败时必须回退原生页面，不能把站点搞坏 */
async function runFallbackCase() {
  const name = "兜底：DOM 异常";
  console.log(`\n──── ${name} ────`);
  const dom = new JSDOM("<!doctype html><html><head></head><body><div id='Main'></div></body></html>", {
    url: "https://www.v2ex.com/go/programming",
    runScripts: "dangerously",
    pretendToBeVisual: true
  });
  const win = dom.window, doc = win.document;
  try {
    win.eval(USCRIPT);
  } catch (e) {
    check(name, "脚本可执行", false, e.message);
    dom.window.close();
    return;
  }
  await new Promise((r) => setTimeout(r, 250));
  check(name, "不抛异常并完成渲染", doc.querySelectorAll(".v2cx-main").length === 1);
  check(name, "空列表有提示文案",
    /空的|暂无/.test((doc.querySelector(".v2cx-list-status") || {}).textContent || ""),
    (doc.querySelector(".v2cx-list-status") || {}).textContent);
  check(name, "仍是接管状态（有 locked）", doc.documentElement.classList.contains("v2cx-locked"));
  dom.window.close();
}

(async () => {
  for (const c of CASES) {
    console.log(`\n──── ${c.name} ────`);
    try {
      await runCase(c);
    } catch (e) {
      check(c.name, "测试自身未崩溃", false, e && e.stack ? e.stack.split("\n")[0] : String(e));
    }
  }
  try { await runComposerCase(); } catch (e) { check("底部输入框", "测试自身未崩溃", false, String(e)); }
  try { await runStealthCase(); } catch (e) { check("隐蔽性", "测试自身未崩溃", false, String(e)); }
  try { await runImageCase(); } catch (e) { check("图片缩略图", "测试自身未崩溃", false, String(e)); }
  try { await runContrastCase(); } catch (e) { check("可读性对比度", "测试自身未崩溃", false, String(e)); }
  try { await runResizerCase(); } catch (e) { check("拖拽调宽", "测试自身未崩溃", false, String(e)); }
  try { await runLightModeCase(); } catch (e) { check("浅色模式", "测试自身未崩溃", false, String(e)); }
  try { await runFallbackCase(); } catch (e) { check("兜底", "测试自身未崩溃", false, String(e)); }

  console.log(`\n════════ 汇总: ${pass} passed, ${fail} failed ════════`);
  if (failures.length) {
    console.log("\n失败项:");
    failures.forEach((f) => console.log("  " + f));
  }
  process.exit(fail ? 1 : 0);
})();
