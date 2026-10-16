# V2EX · Codex 外观 —— 设置与隐蔽性扩展指南

> 回到 [README](../README.md) —— 安装、效果图、功能总览和「已验证的行为」都在那里。

这份文档补的是 README 没讲清的两块细节：**分层不透明度**（`pageOpacity`：哪些东西会被调暗、
哪些永远不调）和**侧边栏模式**（`sidebarMode` / `sidebarHideOnBlur`：鼠标离开页面自动伪装）。
最后两节是给想自己动手的人看的：怎么往设置面板里再加一条设置、怎么用同一套「鼠标离开页面」的
检测机制再挂一个别的自动反应。所有内容都对应 `v2ex-codex.user.js` 里的真实定义，
键名 / 默认值 / class 名 / 函数名可以直接搜。

---

## 页面不透明度

### 用户视角

设置面板 → **外观** → **页面不透明度**，一个 40–100 的滑杆，步长 `5`，单位 `%`，
默认 `100`（= 完全不透明，和没有这个功能时一模一样）。

- 拖动时页面**立刻**变淡，但**不写 localStorage、不整页重渲染**（`previewSetting()` 只改
  CSS 变量和 class）；松手才落盘。
- **只调脚本自绘的界面**：左栏 + 主区（列表 / 主题页 / 代码面板 / 底部输入框都长在
  `.v2cx-main` 里）。V2EX 自己的页面（未接管路由下的 `#Top` / `#Wrapper` / `#Bottom`）
  和伪装视图、设置面板、灯箱这类浮层**始终 100%**。
- 面板里的读数跟着走（`70%`）。设置面板是**居中遮罩**（`.v2cx-modal`，`inset: 0` +
  `display: flex` 居中），它自己永远 100%，不会被调暗。
- 调到 100 时会把 `v2cx-page-dim` class 摘掉，CSS 规则整个不生效，页面上不留任何
  `opacity` 声明。

### 生效范围

**页面层**（会跟着滑杆变淡）——只有脚本自绘的这两块：

| 选择器 | 是什么 |
|---|---|
| `.v2cx-rail` | 脚本自绘的左 rail |
| `.v2cx-main` | 脚本自绘的主区（含代码面板、底部输入框） |

**不动**（永远 100%）：

| 选择器 | 是什么 |
|---|---|
| `#Top` / `#Wrapper` / `#Bottom` | V2EX 自己的页面（未接管路由下可见）—— 滑杆不该顺手把站点的页面也调淡 |
| `.v2cx-boss` | 应急伪装视图 —— 它自己半透明会让底下的论坛内容透上来，伪装就白做了 |
| `.v2cx-modal` | 设置面板（居中遮罩式） |
| `.v2cx-lightbox` | 图片灯箱 |
| `.v2cx-toast` | 提示条（**底部居中**） |
| `.v2cx-imgpreview` | 正文图片的悬浮大图预览（页面调暗时它仍全亮，属取舍） |

### 为什么不动原生页面和浮层

三个理由，后两个是硬性的：

1. **归口**：这是本脚本的「界面不透明度」，只该作用于脚本画出来的那套 UI；V2EX 自己的
   页面是站点的东西，调淡它属于越界（而且未接管路由下面板里也没有滑杆可调）。
2. **伪装效果**：`.v2cx-boss` 的职责就是「一眼扫过去不像论坛」。它半透明时底线会透出来，
   而未接管路由底下还压着可见的原生页面。
3. **实现 / 可用性**：设置面板调暗了就找不着滑杆拖回来；`.v2cx-toast` 的显示隐藏本身就是用
   `opacity` 做的（`0` → `.on` → `1`），塞进不透明度名单里两个 `opacity` 会打架。
   所以 CSS 里那句注释特意写了 **别给浮层补 `opacity: 1`**。

### 实现要点

作用链路只有一条，预览和落盘共用同一个入口，避免两边逻辑漂移：

```js
// DEFAULTS 里的一行（默认值也是 clampPercent 的兜底值）
pageOpacity: 100,

// <html> 上的两个标记
const DIMMED_CLASS = "v2cx-page-dim"; // 只在 < 100% 时加

// 「哪些算页面层」的唯一定义 —— 只有脚本自绘的两块。
// CSS 不手抄：注入样式表时由 buildCss() 把它展开成
// `html.v2cx.v2cx-page-dim <选择器>` 列表，塞进规则里的占位符位置。
const PAGE_LAYER_SELECTOR = [
  ".v2cx-rail",   // 脚本自绘：左 rail
  ".v2cx-main"    // 脚本自绘：主区（含代码面板、底部输入框）
].join(", ");

// 通用件：任何「一层不透明度」都走它；页面层只是其中一次调用
function applyLayerOpacity(percent, opt) {
  const root = document.documentElement;
  const pct = clampPercent(percent, opt.fallback, opt.min); // 坏数据兜底
  const dim = pct < 100;
  root.style.setProperty(opt.varName, String(pct / 100)); // 70 → "0.7"
  root.classList.toggle(opt.dimClass, dim);
  return pct;
}

// 「页面层」那一层的薄封装（变量名 / class 名 / 兜底值各自写死在这一处）
function applyPageOpacity(percent) {
  const it = specItem("pageOpacity");
  return applyLayerOpacity(percent, {
    varName: "--v2cx-page-opacity",
    dimClass: DIMMED_CLASS,
    fallback: DEFAULTS.pageOpacity,
    min: (it && it.min) || 0 // 下界直接读滑杆的 min，不另抄一份
  });
}
```

CSS 侧是一组规则覆盖 `PAGE_LAYER_SELECTOR` 里那两个选择器，挂在 `.v2cx-page-dim` 上 ——
**100% 时连规则都不生效**，不会白白多出一堆 stacking context：

```css
html.v2cx.v2cx-page-dim .v2cx-rail,
html.v2cx.v2cx-page-dim .v2cx-main {
  opacity: var(--v2cx-page-opacity, 1);
}
```

> 这段选择器列表**不是手写在 CSS 里的**：RAW_CSS 里写的是占位符
> `PAGE_LAYER_LIST { ... }`，`buildCss()` 注入样式表时用 `PAGE_LAYER_SELECTOR`
> 展开替换（`replace(/PAGE_LAYER_LIST\s*\{/, ...)`）。踩过的坑：占位符名字如果也出现在
> 注释里，而替换用的是字符串形式的 `String.replace`（只替换第一处），就会替换到注释、
> 真正的规则反而留下非法选择器 —— 现象是「变量和 class 都对，页面却纹丝不动」。
> 所以注释里不再写占位符字面量，正则也带上 `{` 兜底。

注意上面写的是 `pct < 100` 才加 class，但变量**每次都写**：100% 时它是 `1`，
只是没有 `dim` 类、规则不生效而已（测试也断言了「默认变量 = 1 且没有 dim 类」这两件事）。

`clampPercent(value, fallback, min)` 的语义（坏 localStorage 的兜底）：
`null` / `undefined` / `""` / 非数字（`"abc"` → `NaN`）回落到 `fallback`；
数值则收进 `[min, 100]`。**不能**直接 `Number(value)` 了事 —— `Number(null)` 和
`Number("")` 都是 `0`，会被当成「0%」这种合法值，页面层直接看不见；手工写成
`{"pageOpacity":0}` 也会被收到滑杆下界 `40`（测试断言了这两条）。

预览路径：滑杆的 `input` 事件 → `previewSetting("pageOpacity", v)` → spec item 上的
`preview: (v) => applyPageOpacity(v)`；`change` 事件才 `setCfg()` 落盘，
再走 `applySettings()` → `applyVisualSettings()` → `applyPageOpacity(cfg("pageOpacity"))`。

---

## 侧边栏模式

### 三个开关

设置分组 **侧边栏模式**（`SETTING_SPEC` 里的第 3 组，共 6 组）：

| key | label | 默认 | 作用 |
|---|---|---|---|
| `sidebarMode` | 侧边栏模式 | `false` | 鼠标一离开页面区域就自动切进「和连按两下 `Esc` 一样」的伪装视图 |
| `sidebarAutoRestore` | 鼠标回来自动恢复 | `true` | 鼠标回到页面（或标签页重新可见）时，要不要自动撤销那次自动伪装 |
| `sidebarHideOnBlur` | 切换标签页 / 窗口时也伪装 | `false` | 再加一个触发源：窗口失焦 / 标签页被切走时也伪装 |

三个开关独立：

- 只想在「鼠标移出去」时藏、不想切个标签页就被切走 → 关 `sidebarHideOnBlur`；
- 想「走开就藏、回来也得自己按 `Esc`² 才退出」（比如人离开工位后不想页面自动亮回来）
  → 关 `sidebarAutoRestore`。它只影响**自动触发的那次**，手动进的伪装本来就不归它管。

### 行为时序

```
鼠标离开页面区域 (mouseleave, relatedTarget == null)
        │  bossAutoHideAllowed() 通过？
        │  还要等 SIDEBAR_LEAVE_DELAY = 160ms（滤掉划过跨源 iframe 的假离开）
        ▼
   setBoss(true)  →  记下 bossAuto = true
        │
        ├── 鼠标回到页面 (mouseenter)  ─┐
        │   标签页重新可见 (visibilitychange) ─┤  sidebarAutoRestore？
        │                                    ├─ true  → 只撤「自己触发的那次」→ setBoss(false)
        │                                    └─ false → 什么都不做，等你按 Esc² / Ctrl+Shift+H
        │
        └── 窗口失焦 (blur，仅当 sidebarHideOnBlur 打开)
                                        →  立刻 hide()（不迟滞）／回来时走同一条恢复路径
```

关键语义：

- 进 / 出伪装**全部经过 `setBoss()`**，不要在调用点自己加 class。`setBoss()` 里统一维护
  模块级标记 `bossAuto`（进 / 出都先置 `false`），`createSidebarAutoHide()` 在校验通过后
  才补一句 `bossAuto = true` —— **必须在 `setBoss()` 之后**，因为 `stealth` 关掉时
  `setBoss()` 会直接 `return`，提前打标记会让状态和视图不一致。
- 设置面板里一改这两个开关，**下一次鼠标移动就生效**：配置是在事件触发时用 `cfg()` 现读的
  （`getHideOnBlur: () => cfg("sidebarHideOnBlur")`），不需要重建控制器。
  `sidebarHideOnBlur` 改的是「监听器集合」，所以 `applyVisualSettings()` 末尾会调
  `sidebarAutoHide.refresh()` 重新登记 —— 注意**不能只挂在 `change` 事件上**：开关是
  `<button>`，点它只产生 `click` 不产生 `change`，那样「运行中打开这个开关」会一直不生效。
- 控制器在 `bootstrap()` 里建一次、`start()` 一次，之后一直挂着；是否动手由
  `bossAutoHideAllowed()` 在事件的瞬间决定。

### 三条设计取舍

1. **只撤自己触发的那次伪装。** 手动按 `Esc` `Esc` / `Ctrl+Shift+H` 进的伪装，
   鼠标碰一下页面**不会被弹出来**（否则太吓人）。靠 `bossAuto` 标记 + `restore()` 里的
   `if (bossOn() && bossAuto)` 判断。`hide()` 里那句 `if (bossOn()) bossAuto = true`
   也是为它服务的：关了「回来自动恢复」后用户可能在伪装里继续动鼠标，这时再次离开不该
   把**手动**那次伪装认领成自动触发的。
2. **设置面板开着时不动手。** 见 `bossAutoHideAllowed()`：需要 `sidebarMode` 与 `stealth`
   都为真、当前不在伪装中、`settingsOpen()` 为假，且 `otherThemeActive()` 为假
   （别的 Codex 主题在跑时本脚本本来就在避让，不该再弹自己的伪装视图）。不然鼠标一移出
   页面，页面被藏起来，人就被锁在门外了。
3. **恢复是可选行为。** `sidebarAutoRestore=false` 时 `restore()` 会把内部状态清掉
   （表示「这轮不用再等了」）但**不动视图** —— 走开照样自动藏，退出交给用户自己按 `Esc`²。
   这样「自动藏」和「自动亮回来」可以分开取舍。
3. **`stealth` 关掉时整个伪装视图都被禁用**，侧边栏模式自然也跟着失效
   （`bossAutoHideAllowed()` 里那条 `cfg("stealth")` 检查，以及 `setBoss()` 开头的早退）。
   注意这里说的是「进不去 / 也不自动切」，**不是**「会自动退出已有的伪装」——
   如果你在伪装中把 `stealth` 关掉，视图会停在原地，按 `Esc`² 也退不出来（`setBoss` 早退），
   刷新页面即可。

### 检测细节与已知边界

检测被抽成通用的 `createPageLeaveWatcher(opts)`，它**只知道「鼠标还在不在页面里」**，
返回 `{ destroy(), refresh() }`，完全不知道「伪装」这回事；业务语义在
`createSidebarAutoHide(env)`（返回 `start() / refresh() / stop()`）里。`opts` 有
`host` / `document` / `getHideOnBlur`（现读的布尔回调，优先）/ `hideOnBlur`（静态兜底）/
`onLeave(reason)` / `onReturn(reason)`。触发源：

- `mouseleave` 挂在 `documentElement` 的**捕获阶段**（`onLeave("mouseleave")`）。
  必须捕获：`<html>` 自己收不到冒泡的 `mouseout`（它是冒泡链的终点）。
  而且**只认 `relatedTarget` 为空**的事件 —— 页面内部元素之间来回移动不算离开。
- `mouseenter` 触发恢复（`onReturn("mouseenter")`）。
- `blur` 只在 `getHideOnBlur()` 为真时才算（`onLeave("blur")`，**不走迟滞**）。
  页面内的 DOM 焦点变化走的是 `focusout`，不会冒泡到 `window`，所以不需要额外判
  `document.hasFocus()` —— 那个判断在部分环境里恒为真，会把「切标签页」整个吃掉。
- `visibilitychange`（重新可见）触发恢复（`onReturn("visible")`）：Alt+Tab 回来时鼠标
  往往一直停在页面内、没有跨过边界，不会补发 `mouseenter`。

已知边界（都是刻意的取舍，不是 bug）：

- **把鼠标移到浏览器地址栏 / 书签栏也算离开页面** —— 这正是「鼠标一走开就伪装」想覆盖的场景，
  但也意味着只是想复制个 URL 就会看到页面变成 IDE。
- **跨源 iframe 造成的假离开**：鼠标从 `<html>` 移到页面里嵌入的跨源 iframe（reCAPTCHA、
  嵌入视频）上时，浏览器拿不到 `relatedTarget`，于是给出跟「真的移出页面」一模一样的
  `mouseleave`。这就是 `SIDEBAR_LEAVE_DELAY`（160ms）迟滞存在的原因：窗口内鼠标回到页面
  就取消这次触发。副作用是「真的走开」也会晚 160ms 才伪装。
- **dock 到侧边的 DevTools**：焦点切到 DevTools 会让 `blur` 触发（若打开了
  `sidebarHideOnBlur`），页面在你调试时就伪装了。把 DevTools 设成独立窗口可避开。
- **只做了 `mouseleave` / `mouseenter` / `blur` / `visibilitychange`**，没有触摸 / pointer
  事件：触屏设备上没有「鼠标离开」这回事，`sidebarMode` 在那类设备上基本不会触发。
- 从地址栏点回页面（窗口一直可见、不走 `visibilitychange`）时，恢复依赖浏览器补发的
  `mouseenter`；个别浏览器若不补发，鼠标在页面内动一下即可恢复。

---

## 怎么再加一个设置

控件由 `SETTING_SPEC` 这张声明式表描述，**加一条设置不用改 HTML、不用改事件绑定**。
按「这条设置怎么生效」分三种情况。

### (a) 纯 CSS 变量类：往 `DEFAULTS` + `SETTING_CSS_VAR` + `SETTING_SPEC` 各加一行

适合「把值写进某个 CSS 变量就完事」的设置。真实例子（缩略图宽度上限，`railWidth` /
`panelWidth` / `threadMaxWidth` / `thumbHeight` 都是同一个形状）：

```js
// 1) DEFAULTS：加默认值。range 的百分比 clamp 兜底也读这里，必须是数字
const DEFAULTS = {
  // ...
  thumbWidth: 260
};

// 2) SETTING_CSS_VAR：登记变量名 + 单位（拖滑杆时的即时预览靠它）
const SETTING_CSS_VAR = {
  // ...
  thumbWidth: { name: "--v2cx-thumb-w", unit: "px" }
};

// 3) SETTING_SPEC：加一行控件（放到你想让它出现的分组里）
{ section: "正文图片", items: [
  // ...
  { key: "thumbWidth", type: "range", label: "缩略图宽度上限",
    min: 120, max: 600, step: 10, unit: "px" }
] }
```

照这个模板换成自己的键名 / 变量名即可（下面是**假想**的 `panelOpacity`，只是演示位置）：

```js
panelOpacity: 100,                                         // → DEFAULTS
panelOpacity: { name: "--v2cx-panel-opacity", unit: "%" },  // → SETTING_CSS_VAR
{ key: "panelOpacity", type: "range", label: "面板不透明度",
  min: 40, max: 100, step: 5, unit: "%" }                   // → SETTING_SPEC 的 items
```

只要在 `SETTING_CSS_VAR` 里登记过，`range` 就自动获得拖拽预览，`previewSetting()` 不用动。
**两种单位语义**（见 `previewSetting()` 里那一行）：

| `unit` | 写进变量的值 | 适用 |
|---|---|---|
| `"px"` | `value + "px"`（`420` → `"420px"`） | 宽度 / 高度 / 间距 |
| `"%"` | `clampPercent(value, DEFAULTS[key], item.min) / 100`（`70` → `"0.7"`） | 不透明度这类 0–1 的值 |

> 页面不透明度那条**没有**走这条路：它要连 `v2cx-page-dim` class 一起切，所以 spec item 上
> 直接写了 `preview: (v) => applyPageOpacity(v)`。而「一层不透明度」的通用件是
> `applyLayerOpacity(percent, { varName, dimClass, fallback, min })` —— 再挂一层（比如只调代码
> 面板）时复用它，然后：
> ① 加一条 `DEFAULTS` + `SETTING_SPEC`（`type: "range"`，带上 `min`）；
> ② 在 `applyVisualSettings()` 里加一行调用（负责启动 / 落盘 / 恢复默认三条路径）；
> ③ 在 `preview` 里也调它（拖拽即时预览）；
> ④ 在 CSS 里加一段消费变量的规则（选择器同样可以在 `buildCss()` 里用占位符生成）。

还剩两处要自己补：

- CSS 里真的去 `var(--v2cx-panel-opacity)` 消费这个变量（拖拽预览只改变量，没有任何
  CSS 规则会替你读它）；
- 在 `applyVisualSettings()` 里补一行
  `root.style.setProperty("--v2cx-panel-opacity", ...)` —— 它负责「落盘 / 恢复默认 / 启动」
  这三条路径上的变量值，`SETTING_CSS_VAR` 只保证拖滑杆那一瞬间是对的。

### (b) 行为 / 开关类：加一行 `toggle`，读的地方用 `cfg()`

```js
// 1) DEFAULTS
const DEFAULTS = {
  // ...
  mySwitch: false
};

// 2) SETTING_SPEC
{ section: "侧边栏模式", items: [
  // ...
  { key: "mySwitch", type: "toggle", label: "我的开关", hint: "一句话说清它改了什么" }
] }

// 3) 用的时候现读，别缓存 —— 面板里一改，下一次事件就是新值
function doSomething() {
  if (!cfg("mySwitch")) return;
  // ...
}
```

`cfg()` 读的是内存里的 `SETTINGS`（没有才去 localStorage 载入，再退回 `DEFAULTS`），
所以**在事件处理里读永远是最新的**，不需要监听设置变更。

落盘与生效：

- 点开关默认走 `setCfg(key, next)` → 完整 `applySettings()`（重新渲染 rail / 列表 / 详情 /
  代码面板）。`stealth`、`sidebarMode` 这类会改变行为的开关就该走完整路径。
- 只是「改个颜色 / 宽度」的轻量场景，用 `setCfg(key, value, { visualOnly: true })`，
  它只跑 `applyVisualSettings()`，不重渲染整页。
- 如果这条设置改的是**监听器集合**（像 `sidebarHideOnBlur` 那样决定要不要监听 `blur`），
  在 `applyVisualSettings()` 里调一句 `sidebarAutoHide.refresh()` 之类的重登记。
  **别只挂在 `change` 事件上**：开关是 `<button>`，点它只产生 `click`，
  `change` 分支里那句 `if (!r.dataset) return;` 还会把 button 直接挡掉 ——
  踩过的坑就是「运行中打开这个开关一直不生效，随手拖个别的滑块反而修好了」。

### (c) 需要自定义预览 / 在别处生效

在 spec item 上直接写 `preview(value)`。真实例子（不透明度要连 `dim` class 一起切，
光写 CSS 变量是不生效的）：

```js
{ key: "pageOpacity", type: "range", label: "页面不透明度", min: 40, max: 100, step: 5, unit: "%",
  hint: "只调脚本自绘的界面（左栏 + 主区）；V2EX 自己的页面和伪装视图、设置面板、灯箱这类浮层始终 100%",
  // 单独写 preview：这条要连 dim 类一起切（规则挂在 .v2cx-page-dim 上，光改变量不生效）
  preview: (v) => applyPageOpacity(v) }
```

`previewSetting(key, value)` 的**优先顺序**：

1. `specItem(key).preview` 是函数 → 调它，然后 `return`（**不再**碰 `SETTING_CSS_VAR`）；
2. 否则查 `SETTING_CSS_VAR[key]`，按上面的 `px` / `%` 语义写变量；
3. 都没有 → 什么也不做。

所以两条路是互斥的，别在同一个 key 上既写 `preview` 又盼着 `SETTING_CSS_VAR` 生效。

### 加完记得同步这几处

- **`tools/test-jsdom.js` 里那几条写死的数量断言**：开关 / 滑块 / 下拉 / 文本框 / 分组
  （当前是 10 / 7 / 5 / 2 / 6）。它们就是用来暴露「往 `SETTING_SPEC` 加了东西但忘了渲染」
  的，加一条设置就要把对应数字 +1，否则 `npm test` 立刻红。
- **README 的「设置面板」表**：补上 key、默认值和一句说明，保持三类读者（用户 / 维护者 /
  未来的你）看到的是同一份事实。
- 如果新设置涉及新的 CSS 类名或不变量，顺手看看文档里「文件索引」那节要不要加一条。

---

## 底部输入框：自适应与收起

这一块不是「设置面板里的设置」，但同样是**加东西时容易踩的坑**，所以单独记一笔。

### 自适应：工具条为什么必须 `flex-wrap: wrap`

底部输入框是个浮层卡片，宽度被 `max-width` 锁着：

| 场景 | 卡片最大宽 |
|---|---|
| 代码面板展开（`.v2cx-main:not(.panel-hidden)`） | 500px |
| 代码面板收起 | 600px |
| 视口 ≤ 1160px | 600px（面板被媒体查询藏了） |

工具条里是 13 个 28px 的按钮 + 状态位 + 30px 发送键。卡片再窄一点（窄窗口、
或者用户把 rail / 代码面板拖得更宽挤掉主区），如果工具条是默认的 `nowrap`，
超出的按钮会被直接裁掉 —— 表现就是「侧边栏下图标显示不全」。修法是两条：

```css
.v2cx-composer-toolbar {
  display: flex;
  flex-wrap: wrap;     /* 装不下就换行，绝不裁掉按钮 */
  min-width: 0;
}
.v2cx-composer-status {
  flex: 0 1 auto;      /* 状态位是唯一的可压缩项 */
  order: 1;            /* 换行后排在按钮后面，不会插到按钮中间 */
  min-width: 0;        /* 允许被压到 0，不然它会撑破卡片 */
}
.v2cx-tool-btn { flex: none; }   /* 按钮永远 28px 正方 */
.v2cx-send { order: 2; }         /* 发送键永远在最后 */
```

`order` 那两条容易被忽略：DOM 顺序是「13 个按钮 → 状态位 → 发送键」，
一旦工具条换行，不写 `order` 的话状态位会掉到第二行开头、把按钮挤成一列。
**加新按钮时不用改任何布局代码**，wrap 会自己处理。

### 收起：状态存哪、谁不能被藏

- 状态键是 `DEFAULTS.composerCollapsed`（`false` = 展开）。它**不是设置面板里的控件**，
  但仍然放进 `v2cx:settings`：这样它只有一个存储出口，也能被设置面板的「恢复默认」一起复位。
  如果另开一个独立的 localStorage 键，就会出现「恢复默认了但输入框还是收起的」。
- 收起靠卡片自己的 `.collapsed` + `<html>.v2cx-composer-collapsed`，
  CSS 里把输入区 / 预览 / 回复目标条 / 工具条 / 弹层全部 `display: none !important`。
- **收起态「看不见」是色彩问题，不是高度问题。** 第一版把成因猜成「子元素没撑起高度、
  卡片塌掉了」，实际不是：卡片一直渲染着（约 36px），用户看到的是**一条没有轮廓、
  也没有可读文字的东西**。三条实算（WCAG，暗色）：
  | 元素 | 对比 | 问题 |
  |---|---|---|
  | 卡片填充 `--cx-composer-bg` `#2a2a2a` vs 页面底 `--cx-bg` `#181818` | 1.24:1 | 非文本图形要 3:1，卡片没有剪影 |
  | 卡片边框 `--cx-border`（`rgba(255,255,255,.08)`）叠在 `#181818` 上 = `#2a2a2a` | **1.000:1** | 和卡片填充完全同色 —— 这个边框等于没画，是「完全看不见」最硬的一击 |
  | 细条文字 `--cx-text-faint` `#646464` vs `#2a2a2a` | 2.43:1 | AA 正文要 4.5:1，读不出来 |
  展开态之所以看得见，只是因为里面有 14px 的 `--cx-text` 白字和工具条图标。
  （那三个对比度是按 token 手算的、可直接复核；**36px 是由 CSS 推出来的
  （`padding 4+4` + `min-height 26` + `border 1+1`），不是浏览器实测值** ——
  想实测就在本机 F12 对 `.v2cx-composer` 取 `getBoundingClientRect()`。）
- 所以修法是**给它能算出对比的轮廓 + 能读出来的文字**，光改高度/文案都不够
  （`--cx-border-strong` 的 0.14 白对 `#181818` 也只有 ~1.5:1，仍然不够）：

  ```css
  .v2cx-composer.collapsed {
    box-sizing: border-box;   /* height 含边框，不会被 padding 顶出去 */
    height: 32px;
    min-height: 32px;         /* 顺手写死：折叠态只剩一个子元素，让它撑高度是没必要的契约 */
    padding: 0 8px 0 12px;
    display: flex;
    align-items: center;
    cursor: pointer;          /* 整条都是「展开」的点击区 */
    background: var(--cx-bg-raised);        /* #242424：和页面底拉开一档 */
    border-color: var(--cx-border-strong);  /* 不再是「和填充同色」的假边框 */
  }
  /* 左缘强调条：整个收起态里唯一对页面底真正过 3:1 的元素 */
  .v2cx-composer.collapsed::before {
    content: ""; position: absolute; left: 5px; top: 50%;
    transform: translateY(-50%); width: 3px; height: 16px;
    border-radius: 2px; background: var(--cx-blue);   /* #83c3fe on #181818 = 9.47:1 */
  }
  .v2cx-composer.collapsed .v2cx-composer-stub { display: block; height: 16px; line-height: 16px; }
  ```

  **一般规律**：任何「收起/折叠」态，不能只靠填充色差让人看见 —— 同色系里拉开 1.2~1.4:1
  在视觉上等于没有。至少要有一个对底色过 3:1 的实体（描边/强调条/图标），
  文字保持在 `--cx-text-dim` 以上（`#909090` on `#242424` = 4.86:1，过 AA）。
  测试里这两条是**按 token 实算对比度**断言的，不是看着规则存在就算过。
- **收起按钮自身绝不能被藏**（`position: absolute` 挂在卡片右上角，不在工具条里）——
  它是收起态唯一的出口；细条只有 32px 高，所以它在收起态要改成
  `top: 50%; transform: translateY(-50%)` 垂直居中（`top: 6px` 是按展开态算的）。
- 细条上的文字：有草稿显示摘要；没草稿时显示「输入框已收起 · 点这里展开」，
  **不要**回落到编辑区占位符 —— 占位符是一句像正文的提示，收起后看着像个空壳。
- `setComposerCollapsed()` 刻意**不走 `setCfg()`**：那会触发 `applySettings()` 整页重渲染，
  而收起只是个「隐藏几个节点」的视觉效果。重渲染既浪费，又会把调用方手里的 DOM 引用换掉
  （测试里就表现成「点完之后 query 到的还是旧节点」）。
- 收起态下点楼层的「回复」会先 `expandComposer()` 再写 `@某人`，
  否则内容写进去了、用户却看不见输入框。

---

## Cloudflare 验证页避让

### 为什么必须要做

V2EX 现在会在前面挂 Cloudflare 的「正在验证…」插页（Turnstile 复选框）。
那个复选框**必须让用户亲手点一下**，而本脚本接管时会把原生页面整体藏起来：

```css
html.v2cx.v2cx-locked #Top,
html.v2cx.v2cx-locked #Wrapper,
html.v2cx.v2cx-locked #Bottom { display: none !important; }
```

于是一旦接管，复选框就被藏进 `display:none` 里 —— 用户永远点不到，**站点直接进不去**。
这不是「好不好看」的问题，是功能被破坏，所以优先级排在所有外观逻辑之前。

> 顺带修掉一条错误注释：README 里原先写着「V2EX 不套 Cloudflare challenge」，
> 那是早期观察，现在不成立了。检测已补回。

### 判据：怎么认出插页

`challengeActive()`，任一命中即算（宁可漏判也有 observer 兜底，但不能误判把正常页挡掉）：

| 类别 | 判据 | 说明 |
|---|---|---|
| 结构 | `#challenge-form`、`#challenge-running`、`#challenge-stage`、`#cf-wrapper`、`#cf-content`、`#turnstile-wrapper`、`.cf-turnstile`、`.cf-browser-verification` | 这些 id/class 只属于 CF 插页，站内不会撞 |
| 脚本 | `<script src*="/cdn-cgi/challenge-platform">`、`src*="challenges.cloudflare.com"` | 只在插页里出现 |
| 标题 | `Just a moment…` / `Attention Required!` / `正在验证` **且**同时存在 CF 脚本 | 单独看标题会误判，必须配脚本信号 |
| meta | `meta[http-equiv=refresh]` **且**有 `/cdn-cgi/` 脚本 | 兼容老式跳转页 |

**`static.cloudflareinsights.com` 单独不算** —— 那是 CF 给正常站点也加的统计 beacon，
拿它当判据会把整个 V2EX 都判成插页。测试里专门有一条「只有 CF 统计脚本时照常接管」。

### 两条路都要走

```js
// bootstrap() 里，必须排在 injectStyle() 之前
startCloudflareWatch();                     // 挂 observer + 立刻查一次
if (challengeBailed || challengeActive()) {
  bailToNative();
  return;                                   // 后面什么都不做
}
injectStyle();
```

1. **启动时就命中**：脚本 `@run-at document-start`，通常早于插页解析完，所以要能看
   `<head>` 里的静态标记；命中就直接 `return`，**连样式表都不注入** —— 没注入就没什么要撤的。
2. **插页稍后才出现**：Cloudflare 的动态页会在脚本跑完之后才注入 `#challenge-form`，
   所以用 `MutationObserver` 盯 `childList + attributes`，一出现就调 `bailToNative()`。

`bailToNative()` 是幂等的总撤场：摘掉 `v2cx` / `v2cx-locked` / 浅色 / dim / boss-on /
rail-open 等所有状态类、移除 `.v2cx-main` `.v2cx-rail` `.v2cx-boss` `.v2cx-modal`、
清掉 `--v2cx-page-opacity`、`stop()` 掉侧边栏模式、移除注入的样式表。
**故意不动 favicon**：标签图标是 Codex 图标不影响点验证，目标是「绝不挡住校验」，
能少动一样就少动一样。

### 键盘也不能抢

```js
// bindStealthKeys / bindSettingsKeys 的开头
if (shouldAvoidTakeover()) return;
```

否则 Esc 会被脚本吃掉变成「切伪装视图」，Tab / Enter 也可能被 `preventDefault` 干扰，
用户在插页上按什么都不对。`shouldAvoidTakeover()` = `challengeBailed || challengeActive() || otherThemeActive()`，
`scheduleApply()` 也用它做闸门 —— 让位之后不会再重新接管。

### 扩展提醒

以后再加「会碰原生页面显示」的功能（新的全屏浮层、隐藏某块原生 DOM 的规则……），
都要先问一句：**这个页面有没有可能是别人（Cloudflare / 站点自己）要求用户交互的？**
如果会，把它挂进 `shouldAvoidTakeover()` 的判断里，而不是在功能内部各自打补丁。

---

## 怎么再加一个自动反应

`createPageLeaveWatcher()` 只负责回答「鼠标还在不在页面里」，复用它可以低成本地挂别的行为。
例：鼠标离开页面时暂停右侧代码面板的滚动动画，回来后继续。

```js
/* 新的控制器：和侧边栏模式用的是同一个检测器，互不知道对方存在 */
function createPanelScrollPause(env) {
  let watcher = null;
  let paused = false;

  const pause = () => {
    if (paused) return;
    paused = true;
    document.documentElement.classList.add("v2cx-scroll-paused"); // 或直接调你的业务函数
  };
  const resume = () => {
    if (!paused) return;
    paused = false;
    document.documentElement.classList.remove("v2cx-scroll-paused");
  };

  return {
    start() {
      if (watcher) return; // 幂等：重复 start 不会重复登记
      watcher = createPageLeaveWatcher({
        host: env.host,
        document: env.document,
        getHideOnBlur: () => true, // 失焦也算离开（想只看鼠标就改成 () => false）
        onLeave: () => pause(),
        onReturn: () => resume()
      });
      watcher.refresh();           // 按 getHideOnBlur() 决定要不要真的监听 blur
    },
    stop() {
      watcher?.destroy();          // 拆掉 mouseleave / mouseenter / blur 三个监听器
      watcher = null;
      paused = false;
    }
  };
}

// bootstrap 里：和 sidebarAutoHide 一样，建一次、start 一次
let panelScrollPause = null;
// ...
panelScrollPause = createPanelScrollPause({ host: window, document: document });
panelScrollPause.start();
```

`destroy()` 的用途：`createPageLeaveWatcher()` 会在 `documentElement`（捕获阶段）和
`host` 上各挂监听器；`destroy()` 把它们全部摘掉，且**幂等**。需要它的场景有两类：

- 功能在运行中被关掉 / 页面被卸载 —— 「关了设置就别留监听器」，也让自动化测试能干净收尾；
- 宿主环境变化（换 `document`、换 window）时，先 `destroy()` 再重建。

`refresh()` 只处理「`hideOnBlur` 变了」这一种情况：先摘掉 `blur`，再按新值决定要不要挂回去
（`mouseleave` / `mouseenter` 是常驻的，不受影响）。

---

## 验证

### 离线断言（不需要浏览器、不需要联网）

```bash
npm install   # 只装 jsdom
npm test      # = node tools/test-jsdom.js
```

当前结果是 **981 passed, 0 failed**（加这两个功能之前是 852）。
其中这次新增的：

- 设置面板用例里多了一组**不透明度断言**：默认变量 = `1` 且不加 `v2cx-page-dim`、
  滑杆区间 `40~100` / 步长 `5`、拖动时 `--v2cx-page-opacity` 变成 `0.7` 且**不写存储**、
  读数显示 `70%`、松手才落盘、`dim` 规则**只覆盖脚本自绘的 rail / main**（断言里明确
  检查不含 `#Top/#Wrapper/#Bottom`）、**伪装视图与浮层都不在名单里**、调回 100% 后
  class 与变量都复位，外加 5 条**计算值**断言（rail / 主区算出来的 `opacity` = `0.7`、
  设置面板仍是 `1`、`#Wrapper` 仍是 `1`、页面层子元素不会被重复相乘）。
  计算值断言靠测试文件里的 `resolveComputed(win, node)`：**jsdom 的 `getComputedStyle()`
  不会把 `var()` 解析成最终值**（真浏览器会），只把它原样返回，所以那里手动解析了一层 ——
  这一条在实战中抓到过「CSS 规则压根没生效」的真 bug（占位符替换错位置），
  纯文本断言被注释里的选择器骗过去了。
- 独立用例 **「侧边栏模式」**（`runSidebarModeCase()`，43 条断言）：页面内部移动不触发、
  **离开后立刻回来不触发（迟滞）**、真正离开页面才伪装、伪装时 rail 的 `visibility` 为
  `hidden` 且建出 `.v2cx-boss`、重复离开不出错、回到页面自动恢复、
  **手动 `Esc`² 打开的伪装不会被鼠标撤掉**、设置面板开着时不伪装、关掉开关后不再伪装、
  默认不监听 `blur`、打开 `sidebarHideOnBlur` 后失焦即伪装且能用 `mouseenter` /
  `visibilitychange` 恢复、**运行中打开/关闭 blur 触发源立即生效**、
  `pageOpacity=0` 这类坏数据被收到滑杆下界，
  以及 **`sidebarAutoRestore=false`** 的一整组：离开照样伪装、鼠标回来 / 标签页重新可见
  都不自动退、手动 `Esc`² 仍能退出、后续 blur 不会把手动那次伪装认领成自动触发。
- **底部输入框**那组（在「底部输入框」用例里）：工具条 `flex-wrap: wrap`、按钮 `flex: none`、
  状态位可压缩且 `order` 排在按钮之后、收起 / 展开（`aria-expanded` 与 title 同步、
  - 收起 / 展开（`aria-expanded` 与 title 同步、收起后输入区与工具条 `display: none`、
  **收起按钮自己仍可见**、细条可见且带草稿摘要、**卡片高度写死 32px**、细条自己有 16px 高度、
  收起按钮垂直居中、整卡 `cursor: pointer`、无草稿时细条写「已收起」、
  草稿内容不被改动、收起态落盘 / 跨刷新保持、点细条展开、收起态点「回复」自动展开）；
  另外两条**按 token 实算对比度**的断言：强调条对页面底 > 3:1（实测 9.47:1）、
  细条文字对卡片底 >= 4.5:1（实测 4.86:1）—— 这一对才是「看不看得见」的真正判据，
  只断言「规则存在」会漏掉第一版那种「规则都在、就是没有对比」的情况。

### 浏览器手测清单

1. **滑杆**：打开设置面板（`Ctrl/⌘ + ,`），把「页面不透明度」拖到 70 ——
   **只有左栏和主区**变淡（代码面板、底部输入框一起变淡，它们长在主区里）；
   **设置面板本身不变淡**。松手后刷新页面，值还在；拖回 100，界面恢复完全不透明。
   顺手按 `Esc` `Esc` 进伪装视图：它也应该**不受滑杆影响**（不透明）。
   再去一个未接管路由（如 `/settings`）：V2EX 自己的页面**不应该**变淡。
2. **侧边栏模式**：打开「侧边栏模式」，**关掉设置面板**，把鼠标移到浏览器地址栏 ——
   约 0.2 秒后页面变成 IDE（代码编辑器 + 终端）；鼠标移回页面任意位置即恢复。
3. **只撤自己触发的那次**：先手动按 `Esc` `Esc` 进伪装，再把鼠标移出页面、移回页面 ——
   伪装**应该还在**；再按 `Esc` `Esc` 才退出。
4. **面板开着不锁人**：打开设置面板后把鼠标移出页面 —— 页面**不应**伪装。
5. **失焦触发源**：打开「切换标签页 / 窗口时也伪装」后切到别的标签页，回来时应看到伪装视图，
   鼠标一动即恢复；关掉这个开关，切标签页就不再伪装。
6. **运行中改开关**：默认设置下先只打开「侧边栏模式」（不动另一个），再去打开
   「切换标签页 / 窗口时也伪装」，然后**不刷新页面**直接 alt-tab —— 应当立刻伪装。
   （这条专门覆盖「button 不产生 change、监听器没重登记」那个坑。）
7. **关掉自动恢复**：把「鼠标回来自动恢复」关掉，鼠标移出页面 → 变成 IDE；
   鼠标移回页面 → **仍然是 IDE**（不自动退出），按 `Esc` `Esc` 才回到正常视图。
8. **输入框收起**：点输入框右上角的 `⌄` —— 卡片缩成一条 **32px 高**的细条
   （上面显示草稿摘要，没草稿时写「输入框已收起 · 点这里展开」）；
   再点 `⌃`、或直接点细条任意位置，都能展开，内容还在。刷新页面确认状态保持；
   然后把窗口拖窄到 1000px 左右：13 个工具图标应当**换行显示**，一个都不缺。
   收起状态下点任意楼层的「回复」，输入框应当自动展开并写好 `@某人`。
7. **和 `stealth` 的关系**：把「伪装模式」关掉，侧边栏模式应当整体失效（页面不再自动伪装）。

9. **Cloudflare 插页**：如果在 V2EX 前面遇到「正在验证…」插页，页面上应当**只有**
   Cloudflare 自己的东西 —— 没有左栏、没有 Codex 顶栏，复选框能正常点；
   验证通过后回到正常页面，脚本才接管。按 Esc / Ctrl+, 在插页上都不该有反应。

---

## 文件索引

都在 `v2ex-codex.user.js` 里（**按名字搜，行号会变**）：

| 名称 | 位置 / 作用 |
|---|---|
| `DEFAULTS` | 全部设置的默认值与注释块（设置项的第一处定义） |
| `pageOpacity` / `sidebarMode` / `sidebarAutoRestore` / `sidebarHideOnBlur` | `DEFAULTS` 里这四条设置项 |
| `clampPercent(value, fallback, min)` | 收成 `[min, 100]` 的整数百分比；`null`/`""`/非数字回落到 fallback |
| `PAGE_LAYER_SELECTOR` 常量 | 「哪些算页面层」的名单 —— 只有脚本自绘的 `.v2cx-rail` / `.v2cx-main` |
| `applyLayerOpacity(percent, opt)` | 通用件：写任意 `--var` + 切任意 dim class，`{ varName, dimClass, fallback, min }` |
| `applyPageOpacity()` | 页面层的薄封装（`--v2cx-page-opacity` + `DIMMED_CLASS`） |
| `DIMMED_CLASS` 常量 | `"v2cx-page-dim"` |
| `buildCss()` / `injectStyle()` | 把 RAW_CSS 里的占位符展开成页面层选择器后注入样式表 |
| `applyVisualSettings()` | 只改 CSS 变量 / class、不重渲染（调 `applyPageOpacity()` + `sidebarAutoHide.refresh()`） |
| 注入样式里的「页面层不透明度」注释块 | 由 `PAGE_LAYER_SELECTOR` 生成的规则 + 「别给浮层加 opacity」的注释 |
| `createPageLeaveWatcher(opts)` | 通用检测器：`mouseleave`（捕获）/ `mouseenter` / `blur` / `visibilitychange`，返回 `{ destroy(), refresh() }` |
| `SIDEBAR_LEAVE_DELAY` 常量 | 鼠标离开后的迟滞毫秒数（滤掉跨源 iframe 的假离开） |
| `bossAuto` | 模块级标记：本次伪装是不是侧边栏模式自动触发的 |
| `bossAutoHideAllowed()` | 现在适不适合自动伪装（`sidebarMode` + `stealth` + 不在伪装 + 面板未开 + 没有别的主题在跑） |
| `createSidebarAutoHide()` | 业务控制器：`hide()` / `hideSoon()` / `restore()`，返回 `{ start(), refresh(), stop() }`；`restore()` 看 `cfg("sidebarAutoRestore")` |
| `sidebarAutoHide` | 上面那个控制器的单例（`bootstrap()` 里创建并 `start()`） |
| `setBoss()` | 进 / 出伪装视图的唯一入口，统一维护 `bossAuto` |
| `bossOn()` | 当前是否在伪装视图里（看 `<html>` 上的 `v2cx-boss-on`） |
| `settingsOpen()` | 设置面板是否开着（`bossAutoHideAllowed()` 用它挡掉自动伪装） |
| `otherThemeActive()` | 是否别的 Codex 主题在跑（同一个守卫用） |
| `challengeActive()` | 眼前这页是不是 Cloudflare 验证插页（结构 / 脚本 / 标题+脚本 / meta 四类判据） |
| `bailToNative()` | 幂等总撤场：摘掉所有状态类、移除自绘 DOM、停侧边栏模式、移除样式表 |
| `startCloudflareWatch()` | MutationObserver 盯插页动态出现，一出现就 `bailToNative()` |
| `shouldAvoidTakeover()` | 统一闸门 = CF 插页 / 已让位 / 别的主题在跑；键盘绑定与 `scheduleApply()` 都用它 |
| `SETTING_SPEC` | 面板控件的声明式表（6 个分组；`pageOpacity` 在「外观」，三个开关在「侧边栏模式」） |
| `SETTING_CSS_VAR` | `{ name, unit }` 形式的 CSS 变量登记表（拖拽预览用） |
| `previewSetting()` | 拖控件时的即时预览：先看 `item.preview`，再看 `SETTING_CSS_VAR` |
| `bindSettingsPanel()` | 面板事件绑定：开关点击、`input` 预览、`change` 落盘 |
| `bootstrap()` | 启动编排：注入样式、`applyVisualSettings()`、建并启动 `sidebarAutoHide` |
| `composerCollapsed` | `DEFAULTS` 里的底部输入框收起状态（不是面板控件，但存在 `v2cx:settings` 里） |
| `applyComposerCollapsed()` / `setComposerCollapsed()` / `toggleComposerCollapsed()` / `expandComposer()` | 收起态的 DOM 应用 / 落盘 / 切换 / 需要时叫出来 |
| `mdSyncStub()` | 收起态细条上的内容：有草稿显示摘要，没草稿显示「输入框已收起 · 点这里展开」 |
| `anchorPopup(pop, btn)` | 「更多」/ 表情弹层按按钮实位置锚定 —— 工具条换行后位置会变，不能只靠 CSS 写死 |
