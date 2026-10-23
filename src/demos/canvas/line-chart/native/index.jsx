import { useCallback, useEffect, useRef, useState } from 'react';
import './index.css';

/**
 * 手写折线图（原生 Canvas 实现）
 *
 * 这个 demo 覆盖了图表库内部最核心的几件事：
 * 1. 布局：先算出绘图区（去掉坐标轴、图例、留白后的矩形）；
 * 2. 比例尺：把数据值映射到画布像素；
 * 3. 刻度：用 nice number 算法生成好看的整数刻度；
 * 4. 绘制：网格 → 坐标轴 → 面积 → 折线 → tooltip；
 * 5. 交互：指针 x 坐标反算到最近的数据下标；
 * 6. 自适应：ResizeObserver + DPR + 动画进度裁剪。
 */

const MONTHS = [
  '1月',
  '2月',
  '3月',
  '4月',
  '5月',
  '6月',
  '7月',
  '8月',
  '9月',
  '10月',
  '11月',
  '12月',
];

const SERIES = [
  {
    key: 'visits',
    name: '访问量',
    color: '#4f8cff',
    fillTop: 'rgba(79, 140, 255, 0.26)',
    fillBottom: 'rgba(79, 140, 255, 0)',
  },
  {
    key: 'orders',
    name: '订单数',
    color: '#8b5cf6',
    fillTop: 'rgba(139, 92, 246, 0.2)',
    fillBottom: 'rgba(139, 92, 246, 0)',
  },
];

const FONT_FAMILY =
  '"Inter", "PingFang SC", "Microsoft YaHei", system-ui, -apple-system, sans-serif';

function makeSeries(base, spread) {
  return Array.from({ length: MONTHS.length }, (_, index) => {
    const wave = Math.sin(index * 0.7) * spread * 0.35;
    return Math.max(20, Math.round(base + wave + Math.random() * spread));
  });
}

function makeData() {
  return {
    visits: makeSeries(1800, 900),
    orders: makeSeries(520, 260),
  };
}

/** 计算绘图区：上方留给图例，左侧留给 y 轴标签，下方留给 x 轴标签 */
function getLayout(width, height) {
  const left = 54;
  const right = 22;
  const top = 62;
  const bottom = 34;

  return {
    left,
    right,
    top,
    bottom,
    plotWidth: Math.max(1, width - left - right),
    plotHeight: Math.max(1, height - top - bottom),
  };
}

/** 把一个「任意数字」向上取整成 1 / 2 / 5 × 10^n 这样的好读刻度 */
function niceStep(value) {
  const exponent = Math.floor(Math.log10(value));
  const fraction = value / 10 ** exponent;

  let niceFraction;
  if (fraction <= 1) niceFraction = 1;
  else if (fraction <= 2) niceFraction = 2;
  else if (fraction <= 5) niceFraction = 5;
  else niceFraction = 10;

  return niceFraction * 10 ** exponent;
}

/** 生成从 0 开始、覆盖 maxValue 的刻度数组 */
function buildTicks(maxValue, count = 5) {
  if (maxValue <= 0) return { max: 1, ticks: [0, 1] };

  const step = niceStep(maxValue / count);
  const niceMax = Math.ceil(maxValue / step) * step;
  const ticks = [];

  for (let value = 0; value <= niceMax + step / 2; value += step) {
    ticks.push(value);
  }

  return { max: niceMax, ticks };
}

function formatAxisValue(value) {
  if (value >= 1000) {
    const scaled = value / 1000;
    return `${Number(scaled.toFixed(1))}k`;
  }
  return String(Math.round(value));
}

/** 手动画圆角矩形，tooltip 用 */
function roundedRect(context, x, y, width, height, radius) {
  const r = Math.min(radius, width / 2, height / 2);
  context.beginPath();
  context.moveTo(x + r, y);
  context.arcTo(x + width, y, x + width, y + height, r);
  context.arcTo(x + width, y + height, x, y + height, r);
  context.arcTo(x, y + height, x, y, r);
  context.arcTo(x, y, x + width, y, r);
  context.closePath();
}

export default function LineChartNativeDemo() {
  const wrapRef = useRef(null);
  const canvasRef = useRef(null);

  const sizeRef = useRef({ width: 0, height: 0, dpr: 1 });
  // 当前悬停的数据下标，null 表示没有悬停
  const hoverRef = useRef(null);
  // 入场动画进度 0~1
  const progressRef = useRef(0);

  const [data, setData] = useState(() => makeData());

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const { width, height, dpr } = sizeRef.current;
    if (width < 1 || height < 1) return;

    const context = canvas.getContext('2d');
    context.setTransform(dpr, 0, 0, dpr, 0, 0);
    context.clearRect(0, 0, width, height);

    const layout = getLayout(width, height);
    const { left, top, plotWidth, plotHeight } = layout;

    const allValues = [...data.visits, ...data.orders];
    const { max: niceMax, ticks } = buildTicks(Math.max(...allValues), 5);

    const xAt = (index) => left + (index / (MONTHS.length - 1)) * plotWidth;
    const yAt = (value) => top + plotHeight - (value / niceMax) * plotHeight;

    // ── 图例 ─────────────────────────────────────────────
    context.font = `13px ${FONT_FAMILY}`;
    context.textAlign = 'left';
    context.textBaseline = 'middle';

    let legendX = left;
    const legendY = 26;

    for (const series of SERIES) {
      context.beginPath();
      context.arc(legendX + 4, legendY, 4, 0, Math.PI * 2);
      context.fillStyle = series.color;
      context.fill();

      context.fillStyle = '#667085';
      context.fillText(series.name, legendX + 14, legendY);
      legendX += 14 + context.measureText(series.name).width + 22;
    }

    // ── 网格与 y 轴刻度 ───────────────────────────────────
    context.font = `12px ${FONT_FAMILY}`;
    context.textAlign = 'right';
    context.textBaseline = 'middle';

    for (const tick of ticks) {
      const y = yAt(tick);
      context.beginPath();
      context.moveTo(left, y);
      context.lineTo(left + plotWidth, y);
      context.strokeStyle = tick === 0 ? '#d9dee7' : '#eef1f5';
      context.lineWidth = 1;
      context.stroke();

      context.fillStyle = '#98a2b3';
      context.fillText(formatAxisValue(tick), left - 10, y);
    }

    // ── x 轴标签 ─────────────────────────────────────────
    context.textAlign = 'center';
    context.textBaseline = 'top';
    // 太窄时隔一个显示，避免文字挤在一起
    const labelStep = plotWidth < 480 ? 2 : 1;

    MONTHS.forEach((month, index) => {
      if (index % labelStep !== 0) return;
      context.fillStyle = '#98a2b3';
      context.fillText(month, xAt(index), top + plotHeight + 10);
    });

    /*
     * 入场动画通过裁剪实现：
     * 只显示绘图区左侧 progress × 宽度的部分，看起来像从左向右展开。
     */
    const progress = progressRef.current;
    context.save();
    context.beginPath();
    context.rect(left, top - 6, plotWidth * progress, plotHeight + 12);
    context.clip();

    for (const series of SERIES) {
      const values = data[series.key];

      // 面积：折线下方到 x 轴的闭合区域，用垂直渐变填充
      context.beginPath();
      values.forEach((value, index) => {
        const x = xAt(index);
        const y = yAt(value);
        if (index === 0) context.moveTo(x, y);
        else context.lineTo(x, y);
      });
      context.lineTo(xAt(values.length - 1), top + plotHeight);
      context.lineTo(xAt(0), top + plotHeight);
      context.closePath();

      const gradient = context.createLinearGradient(0, top, 0, top + plotHeight);
      gradient.addColorStop(0, series.fillTop);
      gradient.addColorStop(1, series.fillBottom);
      context.fillStyle = gradient;
      context.fill();

      // 折线
      context.beginPath();
      values.forEach((value, index) => {
        const x = xAt(index);
        const y = yAt(value);
        if (index === 0) context.moveTo(x, y);
        else context.lineTo(x, y);
      });
      context.strokeStyle = series.color;
      context.lineWidth = 2.5;
      context.lineJoin = 'round';
      context.lineCap = 'round';
      context.stroke();
    }

    context.restore();

    // ── 悬停提示 ─────────────────────────────────────────
    const hoverIndex = hoverRef.current;
    if (progress < 0.999 || hoverIndex === null) return;

    const anchorX = xAt(hoverIndex);

    // 垂直参考线
    context.save();
    context.setLineDash([4, 4]);
    context.beginPath();
    context.moveTo(anchorX, top);
    context.lineTo(anchorX, top + plotHeight);
    context.strokeStyle = 'rgba(148, 163, 184, 0.65)';
    context.lineWidth = 1;
    context.stroke();
    context.restore();

    // 各系列的数据点
    for (const series of SERIES) {
      const value = data[series.key][hoverIndex];
      context.beginPath();
      context.arc(anchorX, yAt(value), 5, 0, Math.PI * 2);
      context.fillStyle = '#ffffff';
      context.fill();
      context.lineWidth = 2.5;
      context.strokeStyle = series.color;
      context.stroke();
    }

    // tooltip 卡片
    const tooltipWidth = 152;
    const tooltipHeight = 34 + SERIES.length * 22;
    let boxX = anchorX + 14;
    if (boxX + tooltipWidth > width - 10) {
      boxX = anchorX - 14 - tooltipWidth;
    }
    const boxY = top + 8;

    roundedRect(context, boxX, boxY, tooltipWidth, tooltipHeight, 10);
    context.fillStyle = 'rgba(255, 255, 255, 0.98)';
    context.fill();
    context.strokeStyle = '#e4e7ec';
    context.lineWidth = 1;
    context.stroke();

    context.textAlign = 'left';
    context.textBaseline = 'middle';
    context.font = `600 13px ${FONT_FAMILY}`;
    context.fillStyle = '#1f2937';
    context.fillText(MONTHS[hoverIndex], boxX + 14, boxY + 19);

    context.font = `12px ${FONT_FAMILY}`;
    SERIES.forEach((series, index) => {
      const rowY = boxY + 40 + index * 22;
      const value = data[series.key][hoverIndex];

      context.beginPath();
      context.arc(boxX + 18, rowY, 4, 0, Math.PI * 2);
      context.fillStyle = series.color;
      context.fill();

      context.fillStyle = '#667085';
      context.fillText(series.name, boxX + 28, rowY);

      context.textAlign = 'right';
      context.fillStyle = '#1f2937';
      context.fillText(value.toLocaleString('zh-CN'), boxX + tooltipWidth - 14, rowY);
      context.textAlign = 'left';
    });
  }, [data]);

  /** 尺寸适配：位图按 DPR 放大，绘制仍使用 CSS 像素 */
  useEffect(() => {
    const wrap = wrapRef.current;
    const canvas = canvasRef.current;
    if (!wrap || !canvas) return undefined;

    const applySize = () => {
      const rect = wrap.getBoundingClientRect();
      if (rect.width < 1 || rect.height < 1) return;

      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const width = Math.round(rect.width);
      const height = Math.round(rect.height);

      if (
        sizeRef.current.width === width &&
        sizeRef.current.height === height &&
        sizeRef.current.dpr === dpr
      ) {
        return;
      }

      sizeRef.current = { width, height, dpr };
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      draw();
    };

    applySize();
    const observer = new ResizeObserver(applySize);
    observer.observe(wrap);

    return () => observer.disconnect();
  }, [draw]);

  /** 数据变化时重新播放入场动画 */
  useEffect(() => {
    hoverRef.current = null;

    const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (reduceMotion) {
      progressRef.current = 1;
      draw();
      return undefined;
    }

    progressRef.current = 0;
    const startedAt = performance.now();
    let frame = 0;

    const step = (now) => {
      const t = Math.min(1, (now - startedAt) / 500);
      // easeOutCubic：开始快、结束慢
      progressRef.current = 1 - (1 - t) ** 3;
      draw();

      if (t < 1) {
        frame = requestAnimationFrame(step);
      }
    };

    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [data, draw]);

  const handlePointerMove = (event) => {
    const canvas = canvasRef.current;
    const { width, height } = sizeRef.current;
    if (!canvas || width < 1 || progressRef.current < 0.999) return;

    const layout = getLayout(width, height);
    const rect = canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;

    const insidePlot =
      x >= layout.left &&
      x <= layout.left + layout.plotWidth &&
      y >= layout.top &&
      y <= layout.top + layout.plotHeight;

    if (!insidePlot) {
      if (hoverRef.current !== null) {
        hoverRef.current = null;
        draw();
      }
      return;
    }

    const rawIndex = ((x - layout.left) / layout.plotWidth) * (MONTHS.length - 1);
    const index = Math.max(0, Math.min(MONTHS.length - 1, Math.round(rawIndex)));

    if (hoverRef.current !== index) {
      hoverRef.current = index;
      draw();
    }
  };

  const handlePointerLeave = () => {
    if (hoverRef.current === null) return;
    hoverRef.current = null;
    draw();
  };

  return (
    <div className="chart-demo">
      <header className="chart-header">
        <p className="chart-eyebrow">CANVAS 2D · 原生实现</p>
        <h1>手写折线图</h1>
        <p className="chart-intro">
          从零实现一个双系列折线图：布局、比例尺、nice 刻度、渐变面积、入场动画和悬停
          tooltip。悬停图表可以看到每个月的具体数据。
        </p>
      </header>

      <div className="chart-toolbar">
        <span className="chart-toolbar__hint">悬停查看某个月的数据</span>
        <div className="chart-toolbar__end">
          <button
            type="button"
            className="chart-button"
            onClick={() => setData(makeData())}
          >
            刷新数据
          </button>
        </div>
      </div>

      <div className="chart-stage" ref={wrapRef}>
        <canvas
          ref={canvasRef}
          className="chart-native-canvas"
          aria-label="访问量与订单数折线图"
          onPointerMove={handlePointerMove}
          onPointerLeave={handlePointerLeave}
        />
      </div>

      <ul className="chart-notes">
        <li>数据域 → 画布坐标用线性映射；y 轴需要翻转，因为画布 y 向下增长。</li>
        <li>niceStep 把任意步长取整为 1 / 2 / 5 × 10ⁿ，避免刻度出现小数。</li>
        <li>入场动画用裁剪矩形从左到右展开，不需要逐点插值。</li>
        <li>悬停时把指针 x 反算成最近的数据下标，再绘制参考线和 tooltip。</li>
      </ul>
    </div>
  );
}
