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

当前结果是 **923 passed, 0 failed**（加这两个功能之前是 852）。
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
7. **和 `stealth` 的关系**：把「伪装模式」关掉，侧边栏模式应当整体失效（页面不再自动伪装）。

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
| `SETTING_SPEC` | 面板控件的声明式表（6 个分组；`pageOpacity` 在「外观」，三个开关在「侧边栏模式」） |
| `SETTING_CSS_VAR` | `{ name, unit }` 形式的 CSS 变量登记表（拖拽预览用） |
| `previewSetting()` | 拖控件时的即时预览：先看 `item.preview`，再看 `SETTING_CSS_VAR` |
| `bindSettingsPanel()` | 面板事件绑定：开关点击、`input` 预览、`change` 落盘 |
| `bootstrap()` | 启动编排：注入样式、`applyVisualSettings()`、建并启动 `sidebarAutoHide` |
