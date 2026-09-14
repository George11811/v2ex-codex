#!/usr/bin/env node
/**
 * 从渲染出来的截图里测「有效对比度」。
 *
 * 为什么不能只算名义对比度：
 *   WCAG 的对比度公式吃的是两个色值，但屏幕上的文字是抗锯齿的结果 ——
 *   细笔画的中文经过抗锯齿后，大量文字像素是「底色和文字色的混合」，
 *   肉眼积分到的是这个平均值，而不是名义色值。
 *   实测 14px 中文：名义 7.76:1 的文字，有效值只有 3.38:1，看着就是看不清。
 *
 * 所以这里直接在 PNG 上算：
 *   1. 区域内的最常见色 = 底色
 *   2. 与底色亮度差 > 8 的像素 = 文字像素
 *   3. 按亮度差加权求平均文字色（笔画边缘权重自然低）
 *   4. 用平均文字色算对比度 = 有效对比度
 *
 * 用法:
 *   node tools/measure-contrast.js [截图路径...] [--min 4.5]
 *   默认量 ref/shots/dark-home.png 和 ref/shots/light-home.png（npm run shots 会产出）
 */

const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

/* ---------- 极简 PNG 解码（8bit、非隔行、RGB/RGBA）---------- */
function decodePng(file) {
  const buf = fs.readFileSync(file);
  let off = 8, w = 0, h = 0, ct = 0;
  const idat = [];
  while (off < buf.length) {
    const len = buf.readUInt32BE(off);
    const type = buf.toString("ascii", off + 4, off + 8);
    const data = buf.slice(off + 8, off + 8 + len);
    if (type === "IHDR") { w = data.readUInt32BE(0); h = data.readUInt32BE(4); ct = data[9]; }
    else if (type === "IDAT") idat.push(data);
    else if (type === "IEND") break;
    off += 12 + len;
  }
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const ch = ct === 6 ? 4 : ct === 2 ? 3 : 1;
  const stride = w * ch;
  const out = Buffer.alloc(h * stride);
  let prev = Buffer.alloc(stride);
  for (let y = 0; y < h; y++) {
    const ft = raw[y * (stride + 1)];
    const line = raw.slice(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    const cur = Buffer.alloc(stride);
    for (let x = 0; x < stride; x++) {
      const a = x >= ch ? cur[x - ch] : 0;
      const b = prev[x];
      const c = x >= ch ? prev[x - ch] : 0;
      const v = line[x];
      let r;
      if (ft === 0) r = v;
      else if (ft === 1) r = v + a;
      else if (ft === 2) r = v + b;
      else if (ft === 3) r = v + ((a + b) >> 1);
      else {
        const pa = Math.abs(b - c), pb = Math.abs(a - c), pc = Math.abs(a + b - 2 * c);
        r = v + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c);
      }
      cur[x] = r & 255;
    }
    cur.copy(out, y * stride);
    prev = cur;
  }
  return { w, h, ch, px: out };
}

/* ---------- 颜色工具 ---------- */
const hex = (c) => "#" + c.map((v) => v.toString(16).padStart(2, "0")).join("");
const lum255 = (c) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
function relLum(c) {
  const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
  return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]);
}
function contrast(a, b) {
  const la = relLum(a), lb = relLum(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/* ---------- 区域测量 ---------- */
function measure(im, x0, y0, x1, y1) {
  const X0 = Math.max(0, Math.round(x0)), X1 = Math.min(im.w, Math.round(x1));
  const Y0 = Math.max(0, Math.round(y0)), Y1 = Math.min(im.h, Math.round(y1));
  const hist = new Map();
  for (let y = Y0; y < Y1; y++) {
    for (let x = X0; x < X1; x++) {
      const i = (y * im.w + x) * im.ch;
      const k = (im.px[i] << 16) | (im.px[i + 1] << 8) | im.px[i + 2];
      hist.set(k, (hist.get(k) || 0) + 1);
    }
  }
  if (!hist.size) return null;
  const total = (X1 - X0) * (Y1 - Y0);
  const bgKey = [...hist.entries()].sort((a, b) => b[1] - a[1])[0][0];
  const bg = [(bgKey >> 16) & 255, (bgKey >> 8) & 255, bgKey & 255];

  /*
   * 背景候选 = 占区域 2% 以上的颜色。
   * 这一步很关键：rail 里「选中项」的高亮底色（#ced8da）只比 rail 底色暗 19，
   * 但它有 5000+ 个像素 —— 不过滤就会当成文字像素，把平均文字色拉成中间灰，
   * 测出来的对比度完全失真（浅色主题曾经因此误判为 2.85:1）。
   */
  const BG_MIN_COUNT = Math.max(50, total * 0.02);
  const bgSet = new Set();
  for (const [k, n] of hist) if (n >= BG_MIN_COUNT) bgSet.add(k);

  let wsum = 0, acc = [0, 0, 0], n = 0;
  let peak = null, peakD = -1;
  const bgL = lum255(bg);
  /*
   * 只统计「近中性色」像素。
   * 理由：正文/导航文字基本上是无彩色阶，而截图里往往混了饱和色 ——
   * 比如用户标注用的红框、链接的蓝色、状态圆点。这些像素亮度差很大，
   * 不滤掉的话会把平均值拉偏（实测把红框算进去，rail 的平均文字色会变成 #cd6362）。
   */
  const NEUTRAL_SPAN = 40;
  for (let y = Y0; y < Y1; y++) {
    for (let x = X0; x < X1; x++) {
      const i = (y * im.w + x) * im.ch;
      const c = [im.px[i], im.px[i + 1], im.px[i + 2]];
      if (Math.max(c[0], c[1], c[2]) - Math.min(c[0], c[1], c[2]) > NEUTRAL_SPAN) continue;
      const key = (c[0] << 16) | (c[1] << 8) | c[2];
      if (bgSet.has(key)) continue;
      const d = Math.abs(lum255(c) - bgL);
      if (d <= 8) continue;
      n++;
      wsum += d;
      acc[0] += c[0] * d; acc[1] += c[1] * d; acc[2] += c[2] * d;
      if (d > peakD) { peakD = d; peak = c; }
    }
  }
  const mean = wsum ? [acc[0] / wsum, acc[1] / wsum, acc[2] / wsum].map(Math.round) : bg;
  return {
    bg,
    textPixels: n,
    peak: peak || bg,
    peakRatio: contrast(peak || bg, bg),
    effective: mean,
    effectiveRatio: contrast(mean, bg)
  };
}

/* ---------- 主流程 ---------- */
const args = process.argv.slice(2);
let MIN = 4.5;
const minIdx = args.indexOf("--min");
if (minIdx >= 0) { MIN = Number(args[minIdx + 1]); args.splice(minIdx, 2); }

const files = args.length
  ? args
  : ["ref/shots/dark-home.png", "ref/shots/light-home.png"].filter((f) => fs.existsSync(f));

if (!files.length) {
  console.error("没有可测的截图。先跑 npm run shots，或直接传路径。");
  process.exit(2);
}

let worst = Infinity;
for (const file of files) {
  if (!fs.existsSync(file)) { console.error("跳过（不存在）:", file); continue; }
  const im = decodePng(file);
  console.log(`\n=== ${file}  (${im.w}x${im.h}) ===`);
  // 区域按比例切：rail / 主区 / 代码面板
  const regions = [
    // 从 0.09 开始：上面是窗口控件 + 品牌行，图标是 1.8px 细线，
    // 会把「文字像素」的平均亮度拉低，测出来的不是文字可读性
    ["rail 导航区", 0, 0.09 * im.h, 0.15 * im.w, 0.24 * im.h],
    ["rail 版块列表", 0, 0.26 * im.h, 0.15 * im.w, 0.62 * im.h],
    ["rail 常用节点", 0, 0.64 * im.h, 0.15 * im.w, 0.88 * im.h],
    ["主区正文", 0.25 * im.w, 0.10 * im.h, 0.55 * im.w, 0.90 * im.h],
    ["代码面板", 0.72 * im.w, 0.10 * im.h, 0.98 * im.w, 0.90 * im.h]
  ];
  for (const [label, x0, y0, x1, y1] of regions) {
    const m = measure(im, x0, y0, x1, y1);
    if (!m) { console.log(`  ${label.padEnd(14)} 区域无效`); continue; }
    const ok = m.effectiveRatio >= MIN;
    worst = Math.min(worst, m.effectiveRatio);
    console.log(
      `  ${label.padEnd(14)} 底=${hex(m.bg)} 文字=${hex(m.effective)}  ` +
      `峰值=${m.peakRatio.toFixed(2)}  有效=${m.effectiveRatio.toFixed(2)}:1  ` +
      `${ok ? "OK" : "低于 " + MIN}  (文字像素 ${m.textPixels})`
    );
    if (m.textPixels < 50) {
      console.log(`  ${"".padEnd(14)} \u26a0 文字像素太少，区域可能没切对`);
    }
  }
}

console.log(`\n最低有效对比度 = ${worst.toFixed(2)}:1（阈值 ${MIN}）`);
process.exit(worst >= MIN ? 0 : 1);
