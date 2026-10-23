import { useCallback, useEffect, useRef, useState } from 'react';
import './index.css';

/**
 * 涂鸦画板（原生 Canvas 实现）
 *
 * 和刮刮乐不同，这个 demo 的重点是「把笔画存成数据」：
 * 每次不是把线永远留在画布上，而是记录一条条 stroke，
 * 然后根据 strokes 重绘整张画布。这样做的好处：
 * - 撤销 / 重做只需要增删 strokes；
 * - 窗口尺寸变化后可以按新尺寸重绘，不会失真；
 * - 导出、回放、协作等扩展都有数据基础。
 *
 * 数据结构：
 *   stroke = {
 *     tool: 'pen' | 'eraser',
 *     color: '#1f2937',
 *     size: 0.016,              // 笔刷宽度，按画布宽度归一化
 *     points: [{ x, y }, ...],  // 坐标归一化到 0~1
 *   }
 *
 * 为什么用归一化坐标（0~1）？
 * 如果存的是像素坐标，容器一变大，之前画的线就会挤在左上角。
 * 存成 0~1 的比例后，任何时候乘以当前宽高就能还原到正确位置，
 * 窗口缩放、侧边栏折叠都不需要修改笔画数据。
 */

// 可选颜色。value 是实际的 CSS 颜色，name 用于无障碍标签
const COLORS = [
  { value: '#1f2937', name: '墨黑' },
  { value: '#4f8cff', name: '蓝色' },
  { value: '#ef4444', name: '红色' },
  { value: '#22c55e', name: '绿色' },
  { value: '#f59e0b', name: '橙色' },
];

const MIN_BRUSH = 2;
const MAX_BRUSH = 30;
const DEFAULT_BRUSH = 8;
// 最多保留多少步历史，避免无限占用内存
const MAX_HISTORY = 50;

// 历史记录统一用一个对象表示：
// past：过去的状态，present：当前状态，future：被撤销掉、可以重做的状态
const EMPTY_HISTORY = { past: [], present: [], future: [] };

// 把数值限制在 0 ~ 1 之间，防止指针移出画布后坐标越界
function clamp01(value) {
  return Math.min(1, Math.max(0, value));
}

/**
 * 在 2D 上下文里绘制一条笔画。
 *
 * 坐标是归一化的，所以这里需要乘上当前画布的 CSS 宽高。
 * （画布位图可能被 DPR 放大过，但 context 已经通过 transform 处理了，
 *   所以这里始终使用 CSS 像素坐标。）
 */
function drawStroke(context, stroke, width, height) {
  const points = stroke.points;
  if (points.length === 0) return;

  // 笔刷宽度同样按宽度归一化，保证不同尺寸下视觉比例一致
  const lineWidth = Math.max(1, stroke.size * width);
  const toX = (point) => point.x * width;
  const toY = (point) => point.y * height;

  // save/restore 保证合成模式、颜色、线宽等设置不会影响其他笔画
  context.save();
  context.globalCompositeOperation =
    stroke.tool === 'eraser' ? 'destination-out' : 'source-over';
  context.strokeStyle = stroke.color;
  context.fillStyle = stroke.color;
  context.lineWidth = lineWidth;
  context.lineCap = 'round';
  context.lineJoin = 'round';

  // 只有一个点：画一个圆点，表示单击
  if (points.length === 1) {
    context.beginPath();
    context.arc(toX(points[0]), toY(points[0]), lineWidth / 2, 0, Math.PI * 2);
    context.fill();
    context.restore();
    return;
  }

  context.beginPath();
  context.moveTo(toX(points[0]), toY(points[0]));

  /*
   * 用二次贝塞尔曲线平滑笔画：
   * 以当前点作为控制点，以「当前点和下一个点的中点」作为终点。
   * 直接 lineTo 会在转折处出现明显的折角，这样处理后会圆润很多。
   */
  for (let index = 1; index < points.length - 1; index += 1) {
    const current = points[index];
    const next = points[index + 1];
    const midX = ((current.x + next.x) / 2) * width;
    const midY = ((current.y + next.y) / 2) * height;
    context.quadraticCurveTo(toX(current), toY(current), midX, midY);
  }

  // 最后一段没有「下一个点」，直接连到最后一个点
  const last = points[points.length - 1];
  context.lineTo(toX(last), toY(last));
  context.stroke();
  context.restore();
}

export default function DoodleBoardNativeDemo() {
  const wrapRef = useRef(null);
  const canvasRef = useRef(null);

  // sizeRef：画布的 CSS 尺寸与设备像素比。高频读写，不需要触发渲染，所以用 ref
  const sizeRef = useRef({ width: 0, height: 0, dpr: 1 });
  // currentRef：正在画、还没结束的笔画
  const currentRef = useRef(null);
  // drawingRef：当前是否处于「按下并拖动」状态
  const drawingRef = useRef(false);
  // frameRef：requestAnimationFrame 的 id，用来合并多次重绘请求
  const frameRef = useRef(0);
  // strokesRef：strokes 的镜像，供命令式的 redraw() 读取最新数据
  const strokesRef = useRef([]);

  // 历史记录。present 就是当前所有已完成的笔画
  const [history, setHistory] = useState(EMPTY_HISTORY);
  const [tool, setTool] = useState('pen'); // 'pen' | 'eraser'
  const [color, setColor] = useState(COLORS[0].value);
  const [brushSize, setBrushSize] = useState(DEFAULT_BRUSH);

  const strokes = history.present;
  const canUndo = history.past.length > 0;
  const canRedo = history.future.length > 0;

  /**
   * 重绘整张画布。
   *
   * Canvas 是「命令式」的：React 不会帮我们更新画布内容。
   * 任何数据或尺寸变化后，都要主动清空画布并重新画所有笔画。
   */
  const redraw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const { width, height, dpr } = sizeRef.current;
    if (width < 1 || height < 1) return;

    const context = canvas.getContext('2d');

    // 用 DPR 缩放，让后续继续用 CSS 像素坐标绘制
    context.setTransform(dpr, 0, 0, dpr, 0, 0);
    // 清成透明。画布的白色背景由 CSS 提供，这样橡皮擦才能「擦出白色」
    context.clearRect(0, 0, width, height);

    // 先画所有已完成的笔画，再画正在拖动的那一条
    for (const stroke of strokesRef.current) {
      drawStroke(context, stroke, width, height);
    }
    if (currentRef.current) {
      drawStroke(context, currentRef.current, width, height);
    }
  }, []);

  /**
   * 把多次重绘请求合并到下一帧。
   *
   * pointermove 每秒可能触发上百次，如果每次都同步重绘，
   * 主线程会被占满，笔迹反而不跟手。
   * requestAnimationFrame 会让所有更新在浏览器下一次绘制前只执行一次。
   */
  const scheduleRedraw = useCallback(() => {
    if (frameRef.current) return;
    frameRef.current = requestAnimationFrame(() => {
      frameRef.current = 0;
      redraw();
    });
  }, [redraw]);

  // strokes 变化（新增笔画、撤销、重做、清空）时，同步 ref 并重绘
  useEffect(() => {
    strokesRef.current = strokes;
    redraw();
  }, [strokes, redraw]);

  // 组件卸载时取消还没执行的动画帧
  useEffect(
    () => () => {
      if (frameRef.current) {
        cancelAnimationFrame(frameRef.current);
      }
    },
    [],
  );

  /**
   * 让 canvas 的位图尺寸跟随容器，并处理 DPR。
   *
   * 归一化坐标让笔画数据不依赖尺寸，所以这里不需要修改 strokes，
   * 只要重新设置位图大小再重绘即可。
   */
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

      // 尺寸没变化就不重复设置，否则会无谓地清空画布
      if (
        sizeRef.current.width === width &&
        sizeRef.current.height === height &&
        sizeRef.current.dpr === dpr
      ) {
        return;
      }

      sizeRef.current = { width, height, dpr };
      // 给 canvas.width/height 赋值会重置整个绘图上下文，所以紧接着必须重绘
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      redraw();
    };

    applySize();
    const observer = new ResizeObserver(applySize);
    observer.observe(wrap);

    return () => observer.disconnect();
  }, [redraw]);

  /**
   * 把指针的页面坐标换算成画布内的归一化坐标。
   * event.currentTarget 就是绑定了事件的 canvas 元素。
   */
  const getNormalizedPoint = (event) => {
    const rect = event.currentTarget.getBoundingClientRect();
    return {
      x: clamp01((event.clientX - rect.left) / rect.width),
      y: clamp01((event.clientY - rect.top) / rect.height),
    };
  };

  const handlePointerDown = (event) => {
    // 只响应鼠标左键；触摸和手写笔的 button 也是 0
    if (event.button !== 0) return;

    const width = sizeRef.current.width;
    if (width < 1) return;

    // 指针捕获：拖到画布外面也能继续收到 move / up 事件
    event.currentTarget.setPointerCapture(event.pointerId);
    drawingRef.current = true;

    currentRef.current = {
      tool,
      color,
      // 把用户选择的像素粗细换算成相对于画布宽度的比例
      size: brushSize / width,
      points: [getNormalizedPoint(event)],
    };

    // 先画一个圆点，单击也能留下痕迹
    scheduleRedraw();
  };

  const handlePointerMove = (event) => {
    if (!drawingRef.current || !currentRef.current) return;

    // 只记录坐标，不直接画；真正绘制交给下一帧的 redraw
    currentRef.current.points.push(getNormalizedPoint(event));
    scheduleRedraw();
  };

  const handlePointerUp = (event) => {
    if (!drawingRef.current) return;

    drawingRef.current = false;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }

    const finishedStroke = currentRef.current;
    currentRef.current = null;
    if (!finishedStroke) {
      scheduleRedraw();
      return;
    }

    // 把完成的笔画加入当前状态，同时把旧状态压入 past 供撤销
    setHistory((previous) => ({
      past: [...previous.past, previous.present].slice(-MAX_HISTORY),
      present: [...previous.present, finishedStroke],
      future: [],
    }));
  };

  // pointercancel：浏览器或系统打断了这次操作（如来电、手势切换）
  // 这种情况下丢弃未完成的笔画，不写入历史
  const handlePointerCancel = (event) => {
    if (!drawingRef.current) return;

    drawingRef.current = false;
    currentRef.current = null;

    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    scheduleRedraw();
  };

  // ── 历史操作：撤销 / 重做 / 清空 ────────────────────────────

  const handleUndo = () => {
    setHistory((previous) => {
      if (previous.past.length === 0) return previous;
      const previousPresent = previous.past[previous.past.length - 1];
      return {
        past: previous.past.slice(0, -1),
        present: previousPresent,
        // 把当前状态放进 future，之后可以重做
        future: [previous.present, ...previous.future],
      };
    });
  };

  const handleRedo = () => {
    setHistory((previous) => {
      if (previous.future.length === 0) return previous;
      const [nextPresent, ...restFuture] = previous.future;
      return {
        past: [...previous.past, previous.present],
        present: nextPresent,
        future: restFuture,
      };
    });
  };

  const handleClear = () => {
    setHistory((previous) => {
      if (previous.present.length === 0) return previous;
      return {
        past: [...previous.past, previous.present].slice(-MAX_HISTORY),
        present: [],
        future: [],
      };
    });
  };

  /**
   * 导出 PNG。
   *
   * 画布本身是透明的，白色背景来自 CSS，所以直接 toDataURL 会得到透明图。
   * 这里先建一张离屏 canvas 铺白底，再把当前画布叠上去。
   */
  const handleExport = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const exported = document.createElement('canvas');
    exported.width = canvas.width;
    exported.height = canvas.height;

    const context = exported.getContext('2d');
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, exported.width, exported.height);
    context.drawImage(canvas, 0, 0);

    exported.toBlob((blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `doodle-${Date.now()}.png`;
      link.click();
      // 下载触发后再释放 URL
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }, 'image/png');
  };

  const handlePickColor = (value) => {
    setColor(value);
    // 选颜色时自动切回画笔，符合直觉
    setTool('pen');
  };

  const toggleEraser = () => {
    setTool((current) => (current === 'eraser' ? 'pen' : 'eraser'));
  };

  return (
    <div className="doodle-board">
      <header className="doodle-header">
        <p className="doodle-eyebrow">CANVAS 2D · 原生实现</p>
        <h1>涂鸦画板</h1>
        <p className="doodle-intro">
          按住鼠标或手指绘制，支持颜色、粗细、橡皮擦、撤销重做和导出 PNG。笔画以归一化坐标保存，
          改变窗口大小后画面依然对齐。
        </p>
      </header>

      {/* 工具栏本身只是普通 React UI，与 Canvas 绘制逻辑相互独立 */}
      <div className="doodle-toolbar">
        <div className="doodle-group" role="group" aria-label="画笔颜色">
          {COLORS.map((item) => (
            <button
              key={item.value}
              type="button"
              className={`doodle-swatch${tool === 'pen' && color === item.value ? ' is-active' : ''}`}
              style={{ backgroundColor: item.value }}
              aria-label={item.name}
              aria-pressed={tool === 'pen' && color === item.value}
              onClick={() => handlePickColor(item.value)}
            />
          ))}
        </div>

        <label className="doodle-slider">
          <span>笔刷</span>
          <input
            type="range"
            min={MIN_BRUSH}
            max={MAX_BRUSH}
            value={brushSize}
            onChange={(event) => setBrushSize(Number(event.target.value))}
          />
          <span className="doodle-slider-value">{brushSize}px</span>
        </label>

        <div className="doodle-group">
          <button
            type="button"
            className={`doodle-button${tool === 'eraser' ? ' is-active' : ''}`}
            aria-pressed={tool === 'eraser'}
            onClick={toggleEraser}
          >
            橡皮擦
          </button>
        </div>

        <div className="doodle-group doodle-group--end">
          <button type="button" className="doodle-button" onClick={handleUndo} disabled={!canUndo}>
            撤销
          </button>
          <button type="button" className="doodle-button" onClick={handleRedo} disabled={!canRedo}>
            重做
          </button>
          <button
            type="button"
            className="doodle-button"
            onClick={handleClear}
            disabled={strokes.length === 0}
          >
            清空
          </button>
          <button type="button" className="doodle-button" onClick={handleExport}>
            导出 PNG
          </button>
        </div>
      </div>

      {/*
        画布容器负责尺寸与视觉边框。
        canvas 本身用 CSS 撑满容器，真实位图分辨率在 JS 里按 DPR 设置。
      */}
      <div className="doodle-canvas-wrap" ref={wrapRef}>
        <canvas
          ref={canvasRef}
          className={`doodle-canvas${tool === 'eraser' ? ' is-eraser' : ''}`}
          aria-label="涂鸦画板"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerCancel}
        />
      </div>

      <ul className="doodle-notes">
        <li>笔画保存为归一化坐标（0~1），容器尺寸变化后按新尺寸重绘，图形不会错位。</li>
        <li>橡皮擦使用 destination-out 合成模式，白色背景由 CSS 提供，导出时再合成白底。</li>
        <li>pointermove 高频触发，重绘请求通过 requestAnimationFrame 合并到下一帧。</li>
        <li>撤销 / 重做保存的是笔画数组快照，因此清空、连续绘制都能正确回退。</li>
      </ul>
    </div>
  );
}
