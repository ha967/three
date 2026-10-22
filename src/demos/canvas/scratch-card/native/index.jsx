import { useCallback, useEffect, useRef, useState } from 'react';
import './index.css';

/**
 * 刮刮乐（原生 Canvas 实现）
 *
 * 整体思路：
 * 1. 用普通 DOM 显示奖品文字，它在最底层；
 * 2. 上面盖一张 canvas，画满灰色涂层，把奖品挡住；
 * 3. 鼠标 / 手指划过时，用 destination-out 合成模式把涂层「擦掉」；
 * 4. 定期统计涂层中透明像素的比例，刮开超过阈值就自动揭晓。
 *
 * 阅读顺序建议：
 * 常量 → 奖品数据 → measureClearedRatio → 组件状态 → paintCover
 * → 尺寸适配 → scratchTo → checkProgress → 指针事件 → JSX 结构。
 */

// ── 可调参数 ────────────────────────────────────────────────

// 刮开面积达到 55% 时自动揭晓（0~1 之间的小数）
const REVEAL_THRESHOLD = 0.55;
// 统计刮开比例时，先把画布缩小到 100 × 100 再采样，减少读取开销
const SAMPLE_SIZE = 100;
// 笔刷宽度 = 卡片宽度的 7%，这样不同屏幕尺寸下笔刷比例保持一致
const BRUSH_RATIO = 0.07;
// 两次比例检测之间至少间隔 120ms，避免 pointermove 触发过于频繁
const CHECK_INTERVAL = 120;

// 奖品池。tone 用来给底层奖品卡片加不同的样式（中奖 / 未中奖）
const PRIZES = [
  { label: '¥5 无门槛券', note: '已存入你的账户', icon: '🎟️', tone: 'coupon' },
  { label: '免运费券', note: '本单可直接使用', icon: '📦', tone: 'coupon' },
  { label: '9 折优惠券', note: '有效期 7 天', icon: '💸', tone: 'coupon' },
  { label: '谢谢参与', note: '再试一次吧', icon: '🍀', tone: 'empty' },
];

/**
 * 随机抽一个奖品。
 * 传入 excludeLabel 时，会尽量避开当前正在显示的奖品，
 * 这样点「换一张」时不会出现「奖品看起来没变」的情况。
 */
function pickPrize(excludeLabel) {
  const pool = PRIZES.filter((prize) => prize.label !== excludeLabel);
  const candidates = pool.length > 0 ? pool : PRIZES;
  return candidates[Math.floor(Math.random() * candidates.length)];
}

/**
 * 统计画布上「已被刮掉」的面积占比。
 *
 * Canvas 中每个像素由 RGBA 四个通道组成，getImageData 返回的数组形如：
 *   [R, G, B, A, R, G, B, A, ...]
 * 所以从下标 3 开始、每次 +4，就只遍历每个像素的 A（透明度）通道。
 * 涂层被 destination-out 擦掉后 A 会变成 0，因此 A 很小就说明该像素被刮开了。
 *
 * 为什么要先缩小再读取？
 * getImageData 需要把整张位图从 GPU 读回内存，画布越大越慢。
 * 先把画布 drawImage 到 100 × 100 的小画布上，再读取小图，
 * 开销可以忽略，而「透明面积占比」基本不受缩放影响。
 */
function measureClearedRatio(source, sampler) {
  // 采样画布需要频繁被读取，willReadFrequently 会让浏览器选择更合适的存储方式
  const context = sampler.getContext('2d', { willReadFrequently: true });

  // 每次统计前先清空采样画布，避免上一次的内容残留
  context.clearRect(0, 0, sampler.width, sampler.height);
  // 把当前涂层画布整体缩放到采样画布上
  context.drawImage(source, 0, 0, sampler.width, sampler.height);

  const { data } = context.getImageData(0, 0, sampler.width, sampler.height);
  let cleared = 0;

  // index += 4：跳过 R、G、B，直接看 A 通道
  for (let index = 3; index < data.length; index += 4) {
    // 小于 80 认为是「已擦除」；用阈值而不是严格等于 0，是为了容忍边缘的抗锯齿像素
    if (data[index] < 80) {
      cleared += 1;
    }
  }

  // 已擦除像素数 / 总像素数，得到 0 ~ 1 的比例
  return cleared / (data.length / 4);
}

export default function ScratchCardDemo() {
  // ── ref：存放「不需要触发重新渲染」的可变值 ──────────────────
  // 这些值在交互过程中高频变化（每一帧都可能变），
  // 如果放进 useState，会引发大量不必要的重新渲染，所以用 useRef。
  //
  // cardRef / canvasRef：拿到真实的 DOM 节点
  // samplerRef：用于统计比例的小画布，第一次需要时再创建
  // drawingRef：当前是否处于「按下并拖动」状态
  // revealedRef：是否已揭晓。它和 state 的 revealed 同步，
  //   但事件回调里读取 ref 永远是最新值，不会遇到闭包里的旧状态
  // lastPointRef：上一个指针坐标，用来把两次移动连成线段
  // lastCheckRef：上一次检测比例的时间戳，用来做节流
  // sizeRef：画布的 CSS 尺寸和设备像素比
  const cardRef = useRef(null);
  const canvasRef = useRef(null);
  const samplerRef = useRef(null);
  const drawingRef = useRef(false);
  const revealedRef = useRef(false);
  const lastPointRef = useRef(null);
  const lastCheckRef = useRef(0);
  const sizeRef = useRef({ width: 0, height: 0, dpr: 1 });

  // ── state：存放「需要显示在页面上」的数据 ────────────────────
  // prize 变化 → 奖品文字重新渲染
  // progress 变化 → 进度条和百分比文字更新
  // revealed 变化 → canvas 淡出、按钮显示隐藏
  const [prize, setPrize] = useState(() => pickPrize());
  const [progress, setProgress] = useState(0);
  const [revealed, setRevealed] = useState(false);

  /**
   * 重新绘制整张涂层。
   *
   * 注意：canvas 是「命令式」的，React 只负责放置 <canvas> 元素，
   * 里面的像素必须由我们自己用 Canvas API 画上去。
   * 所以每次尺寸变化、重置时，都要主动调用这个函数。
   */
  const paintCover = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // 使用 CSS 像素尺寸。真实位图尺寸会在下面的尺寸适配里乘上 DPR。
    const { width, height, dpr } = sizeRef.current;
    if (width < 1 || height < 1) return;

    const context = canvas.getContext('2d');

    // setTransform(a, b, c, d, e, f) 设置变换矩阵：
    // 把绘制内容在 x / y 方向各放大 dpr 倍。
    // 这样我们后面仍然用 CSS 像素坐标画图，浏览器自动映射到高分屏的真实像素。
    context.setTransform(dpr, 0, 0, dpr, 0, 0);

    // source-over 是最普通的「新内容盖在旧内容上」，先恢复成默认模式，
    // 防止上次刮除留下的 destination-out 影响这一次绘制。
    context.globalCompositeOperation = 'source-over';

    // 清空整块画布（参数是 CSS 像素，经过上面的 transform 后正好覆盖全图）
    context.clearRect(0, 0, width, height);

    // createLinearGradient(x0, y0, x1, y1)：从左上角到右下角的线性渐变
    const gradient = context.createLinearGradient(0, 0, width, height);
    gradient.addColorStop(0, '#dbe4ef');
    gradient.addColorStop(0.5, '#b7c4d6');
    gradient.addColorStop(1, '#cfdae8');
    context.fillStyle = gradient;
    context.fillRect(0, 0, width, height);

    // 画斜纹，让涂层看起来像可刮的金属质感。
    // save() / restore() 用来临时修改描边样式，画完斜纹后恢复原样。
    context.save();
    context.strokeStyle = 'rgba(255, 255, 255, 0.22)';
    context.lineWidth = Math.max(4, width * 0.012);
    // offset 从 -height 开始，保证最左边也有斜线；
    // 每条线从左下 (offset, height) 连到右上 (offset + height, 0)，形成 45° 斜纹
    for (let offset = -height; offset < width; offset += 26) {
      context.beginPath();
      context.moveTo(offset, height);
      context.lineTo(offset + height, 0);
      context.stroke();
    }
    context.restore();

    // 在涂层中央写字。
    // textAlign = 'center'：x 坐标表示文字中心，而不是文字左边缘。
    // textBaseline = 'middle'：y 坐标表示文字垂直中心。
    context.fillStyle = 'rgba(255, 255, 255, 0.92)';
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    // 字号跟着卡片宽度变化，卡片越大字越大
    context.font = `600 ${Math.round(width * 0.075)}px "PingFang SC", "Microsoft YaHei", sans-serif`;
    context.fillText('刮开涂层', width / 2, height / 2 - width * 0.035);

    context.fillStyle = 'rgba(255, 255, 255, 0.68)';
    context.font = `${Math.round(width * 0.032)}px "PingFang SC", "Microsoft YaHei", sans-serif`;
    context.fillText('按住鼠标或手指涂抹', width / 2, height / 2 + width * 0.05);
  }, []);

  /**
   * 尺寸适配：让 canvas 的位图尺寸与卡片在页面上的显示尺寸一致。
   *
   * 关键概念：DPR（devicePixelRatio，设备像素比）。
   * 在 2 倍屏上，1 个 CSS 像素对应 2 × 2 个物理像素。
   * 如果 canvas.width 直接等于 CSS 宽度，浏览器就会把一张小图拉伸到 2 倍，
   * 线条和文字会发虚。正确做法是：
   *   canvas.width  = CSS 宽度 × dpr
   *   canvas.height = CSS 高度 × dpr
   *   再用 CSS 把它显示成原尺寸
   * 然后通过 transform 把绘制坐标放大 dpr 倍。
   */
  useEffect(() => {
    const card = cardRef.current;
    const canvas = canvasRef.current;
    if (!card || !canvas) return undefined;

    const applySize = () => {
      // getBoundingClientRect 返回的是元素在页面上的 CSS 像素尺寸
      const rect = card.getBoundingClientRect();
      if (rect.width < 1 || rect.height < 1) return;

      // dpr 上限取 2：3 倍屏再乘上去像素太多，收益却很小
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const width = Math.round(rect.width);
      const height = Math.round(rect.height);

      // ResizeObserver 可能连续触发多次，尺寸没变就不用重复重绘
      if (
        sizeRef.current.width === width &&
        sizeRef.current.height === height &&
        sizeRef.current.dpr === dpr
      ) {
        return;
      }

      sizeRef.current = { width, height, dpr };

      // 注意：给 canvas.width / height 赋值会清空整块画布，
      // 并且重置所有绘图状态（transform、fillStyle 等），所以必须重新绘制涂层
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      paintCover();
    };

    applySize();

    // ResizeObserver 监听元素尺寸变化，比 window.resize 更准确（侧边栏折叠也能感知）
    const observer = new ResizeObserver(applySize);
    observer.observe(card);

    // 组件卸载时断开监听，避免内存泄漏
    return () => observer.disconnect();
  }, [paintCover]);

  /**
   * 从一个点刮到另一个点。
   *
   * destination-out 是 Canvas 的合成模式之一：
   * 新画的图形会把「已有像素」中重叠的部分擦除，其余部分保持不变。
   * 效果就像用橡皮擦掉涂层，露出下面的奖品 DOM。
   */
  const scratchTo = useCallback((point, previous) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const { width, dpr } = sizeRef.current;
    const context = canvas.getContext('2d');
    const brushSize = Math.max(20, width * BRUSH_RATIO);

    // save/restore 成对使用：保存当前的合成模式、线宽等状态，画完恢复，
    // 不把 destination-out 之类的设置泄漏给后续绘制
    context.save();
    context.setTransform(dpr, 0, 0, dpr, 0, 0);

    // 关键：把合成模式切换为「擦除」
    context.globalCompositeOperation = 'destination-out';

    // 圆头线帽 + 圆角连接，让笔迹看起来平滑自然
    context.lineWidth = brushSize;
    context.lineCap = 'round';
    context.lineJoin = 'round';

    if (previous) {
      // 把「上一个点 → 当前点」连成一条线段。
      // 如果只画点，快速移动时笔迹会断成一串圆点。
      context.beginPath();
      context.moveTo(previous.x, previous.y);
      context.lineTo(point.x, point.y);
      context.stroke();
    }

    // 单独补一个圆点：单击（没有移动）时也能刮出痕迹，同时填补线段端点的空隙
    // arc 的角度单位是弧度，0 到 Math.PI * 2 正好是一整圈
    context.beginPath();
    context.arc(point.x, point.y, brushSize / 2, 0, Math.PI * 2);
    context.fill();

    context.restore();
  }, []);

  /**
   * 检测并更新刮开进度。
   *
   * force = true 表示忽略节流，立即检测（例如松开指针时）。
   * 为什么要节流？pointermove 每秒可能触发上百次，
   * 每次都调用 getImageData 会明显拖慢绘制，所以最多每 120ms 统计一次。
   */
  const checkProgress = useCallback((force = false) => {
    // 已揭晓后不再重复检测
    if (revealedRef.current) return;

    // performance.now() 是高精度时间戳，单位毫秒
    const now = performance.now();
    if (!force && now - lastCheckRef.current < CHECK_INTERVAL) return;
    lastCheckRef.current = now;

    const canvas = canvasRef.current;
    if (!canvas) return;

    // 小画布只在第一次使用时创建，之后重复使用
    if (!samplerRef.current) {
      samplerRef.current = document.createElement('canvas');
      samplerRef.current.width = SAMPLE_SIZE;
      samplerRef.current.height = SAMPLE_SIZE;
    }

    const ratio = measureClearedRatio(canvas, samplerRef.current);
    setProgress(ratio);

    if (ratio >= REVEAL_THRESHOLD) {
      revealedRef.current = true;
      drawingRef.current = false;
      lastPointRef.current = null;
      setProgress(1);
      setRevealed(true);
    }
  }, []);

  /**
   * 把指针事件坐标换算成 canvas 内部坐标。
   *
   * event.clientX / clientY 是相对于浏览器视口的坐标，
   * 减去 canvas 左上角在视口中的位置，才能得到画布内的坐标。
   * 直接使用 offsetX / offsetY 在缩放、嵌套布局下容易出错。
   */
  const getPoint = (event) => {
    const rect = event.currentTarget.getBoundingClientRect();
    return {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
    };
  };

  // ── 指针事件：mouse、touch、pen 统一用 Pointer Events 处理 ──────

  const handlePointerDown = (event) => {
    // event.button === 0 表示鼠标左键；触摸和手写笔的 button 也是 0
    if (revealedRef.current || event.button !== 0) return;

    // 指针捕获：即使手指/鼠标移出 canvas 范围，move 和 up 事件仍会发送给 canvas，
    // 这样拖到卡片外面再松手也不会丢状态
    event.currentTarget.setPointerCapture(event.pointerId);

    const point = getPoint(event);
    drawingRef.current = true;
    lastPointRef.current = point;
    scratchTo(point, null); // 没有上一个点，只画一个圆点
    checkProgress(true);
  };

  const handlePointerMove = (event) => {
    // 没有按下时不响应，只是单纯移动鼠标不算刮
    if (!drawingRef.current) return;

    const point = getPoint(event);
    // 用「上一个点 → 当前点」画线段；第一次移动时 previous 就是按下时的点
    scratchTo(point, lastPointRef.current);
    lastPointRef.current = point;
    checkProgress();
  };

  /**
   * 结束一次刮擦。
   * pointerup（抬起）和 pointercancel（被系统打断，如来电、手势切换）都要处理。
   */
  const handlePointerEnd = (event) => {
    if (!drawingRef.current) return;

    drawingRef.current = false;
    lastPointRef.current = null;

    // 指针捕获用完要释放，否则后续事件会一直被这个元素拦截
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }

    // 松手时强制结算一次，保证最终比例准确
    checkProgress(true);
  };

  /**
   * 直接揭晓：给不使用指针的用户（键盘、辅助技术）提供一个替代入口。
   * 不需要真的擦除像素，CSS 会让 canvas 淡出。
   */
  const revealAll = () => {
    if (revealedRef.current) return;

    revealedRef.current = true;
    drawingRef.current = false;
    lastPointRef.current = null;
    setProgress(1);
    setRevealed(true);
  };

  /**
   * 换一张：重置所有状态并重新喷涂涂层。
   */
  const reset = () => {
    revealedRef.current = false;
    drawingRef.current = false;
    lastPointRef.current = null;
    lastCheckRef.current = 0;
    // 用函数式更新读取当前奖品，随机换一个不同的
    setPrize((current) => pickPrize(current.label));
    setProgress(0);
    setRevealed(false);
    // canvas 不归 React 管理，必须手动重绘
    paintCover();
  };

  const progressPercent = Math.round(progress * 100);

  return (
    <div className="scratch-demo">
      <header className="scratch-header">
        <p className="scratch-eyebrow">CANVAS 2D · 原生实现</p>
        <h1>刮刮乐</h1>
        <p className="scratch-intro">
          按住鼠标或手指在涂层上涂抹，刮开 55% 后自动揭晓。松开指针时会结算一次刮开比例。
        </p>
      </header>

      <div className="scratch-stage">
        {/*
          卡片容器：
          - position: relative，让内部的奖品层和 canvas 层都用 absolute 叠在一起
          - ref 用于读取它的实际尺寸，决定 canvas 位图大小
        */}
        <div className={`scratch-card${revealed ? ' is-revealed' : ''}`} ref={cardRef}>
          {/* 底层：奖品信息。它是真正的 DOM 文本，屏幕阅读器也能读出来 */}
          <div className={`scratch-prize scratch-prize--${prize.tone}`}>
            <span className="scratch-prize-icon" aria-hidden="true">
              {prize.icon}
            </span>
            <p className="scratch-prize-label">{prize.label}</p>
            <span className="scratch-prize-note">{prize.note}</span>
          </div>

          {/*
            顶层：canvas 涂层。
            - 四个指针事件分别处理按下、移动、抬起和取消
            - aria-hidden：它只是视觉效果，真正的奖品文字在上面的 DOM 里
            - 揭晓后加上 is-hidden，通过 CSS 淡出并禁用指针事件
          */}
          <canvas
            ref={canvasRef}
            className={`scratch-canvas${revealed ? ' is-hidden' : ''}`}
            aria-hidden="true"
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerEnd}
            onPointerCancel={handlePointerEnd}
          />
        </div>

        <div className="scratch-meta">
          <div className="scratch-progress">
            {/*
              role="progressbar" 是 ARIA 无障碍语义，
              让辅助技术知道这是一个进度条，并能读出当前值
            */}
            <div
              className="scratch-progress-track"
              role="progressbar"
              aria-label="刮开进度"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={progressPercent}
            >
              <div className="scratch-progress-bar" style={{ width: `${progressPercent}%` }} />
            </div>
            <span className="scratch-progress-text">
              {revealed ? '已揭晓' : `已刮开 ${progressPercent}%`}
            </span>
          </div>

          <div className="scratch-actions">
            {!revealed && (
              <button type="button" className="scratch-button" onClick={revealAll}>
                直接揭晓
              </button>
            )}
            <button
              type="button"
              className="scratch-button scratch-button--primary"
              onClick={reset}
            >
              换一张
            </button>
          </div>
        </div>
      </div>

      {/* 页面底部的实现要点，方便对照代码阅读 */}
      <ul className="scratch-notes">
        <li>涂层是覆盖在奖品上方的 canvas，擦除使用 destination-out 合成模式。</li>
        <li>刮开比例通过缩小采样读取 alpha 通道统计，达到阈值后自动揭晓。</li>
        <li>坐标用 getBoundingClientRect 换算，同时兼容鼠标、触屏和手写笔。</li>
      </ul>
    </div>
  );
}
