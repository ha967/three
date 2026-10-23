import { useEffect, useRef, useState } from 'react';
import { Circle, Layer, Line, Rect, Stage } from 'react-konva';
import './index.css';

/**
 * 涂鸦画板（Konva / react-konva 实现）
 *
 * 和原生版的区别：
 * - 原生版：自己调用 Canvas API，手动 clearRect + 重绘所有笔画；
 * - Konva 版：把每条笔画写成 <Line />，React 状态一变，Konva 负责更新节点和画布。
 *
 * 两版使用完全相同的数据结构：
 *   stroke = {
 *     tool: 'pen' | 'eraser',
 *     color: '#1f2937',
 *     size: 0.016,              // 归一化笔刷宽度
 *     points: [{ x, y }, ...],  // 归一化坐标（0~1）
 *   }
 * 因此可以直接比较「命令式」和「声明式」两种写法的差异。
 *
 * 指针移出画布时会结束当前子笔画，移回后再新建一条；
 * 同一次拖动产生的多条子笔画在结束时作为一步历史一起提交。
 */

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
const MAX_HISTORY = 50;

const EMPTY_HISTORY = { past: [], present: [], future: [] };

/**
 * 把一条归一化笔画转换成 Konva 图形。
 *
 * - 多个点：<Line />，用 tension 让折线变成平滑曲线；
 * - 单个点：<Circle />，因为只有一个点的线在 Konva 里不会显示。
 * - globalCompositeOperation 为 destination-out 时，这条线会擦除同层内容，
 *   这就是橡皮擦的实现方式。
 */
function StrokeShape({ stroke, width, height }) {
  const strokeWidth = Math.max(1, stroke.size * width);
  const composite = stroke.tool === 'eraser' ? 'destination-out' : 'source-over';
  // Konva 的 points 是扁平数组：[x1, y1, x2, y2, ...]
  const points = stroke.points.flatMap((point) => [point.x * width, point.y * height]);

  if (stroke.points.length === 1) {
    return (
      <Circle
        x={points[0]}
        y={points[1]}
        radius={strokeWidth / 2}
        fill={stroke.color}
        globalCompositeOperation={composite}
        listening={false}
      />
    );
  }

  return (
    <Line
      points={points}
      stroke={stroke.color}
      strokeWidth={strokeWidth}
      lineCap="round"
      lineJoin="round"
      // tension 让 Konva 自动生成平滑曲线，作用类似原生版里的二次贝塞尔
      tension={0.35}
      globalCompositeOperation={composite}
      listening={false}
    />
  );
}

export default function DoodleBoardKonvaDemo() {
  const wrapRef = useRef(null);
  const stageRef = useRef(null);

  // 当前指针是否处于按下状态
  const drawingRef = useRef(false);
  // 本次拖动中尚未提交的子笔画。移出画布会分段，因此可能有多条
  const activeStrokesRef = useRef([]);
  // 当前正在追加坐标的那一段；指针在画布外时为 null
  const activeRef = useRef(null);

  // 舞台尺寸。它依赖容器的实际像素尺寸，所以用 state，尺寸变化会触发重新渲染
  const [stageSize, setStageSize] = useState({ width: 0, height: 0 });
  // 正在绘制中的子笔画需要渲染到页面上，因此也放在 state 里
  const [currentStrokes, setCurrentStrokes] = useState([]);

  // 已完成笔画的历史记录，结构与原生版一致
  const [history, setHistory] = useState(EMPTY_HISTORY);
  const [tool, setTool] = useState('pen');
  const [color, setColor] = useState(COLORS[0].value);
  const [brushSize, setBrushSize] = useState(DEFAULT_BRUSH);

  const strokes = history.present;
  const canUndo = history.past.length > 0;
  const canRedo = history.future.length > 0;

  /**
   * 监听容器尺寸。
   * Konva 的 Stage 需要明确的像素宽高，而 CSS 的百分比 / aspect-ratio
   * 不会自动传给它，所以要测量后通过 state 传给 <Stage />。
   */
  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return undefined;

    const applySize = () => {
      const rect = wrap.getBoundingClientRect();
      if (rect.width < 1 || rect.height < 1) return;

      const width = Math.round(rect.width);
      const height = Math.round(rect.height);

      // 尺寸没变时返回原对象，避免多余的重新渲染
      setStageSize((previous) =>
        previous.width === width && previous.height === height
          ? previous
          : { width, height },
      );
    };

    applySize();
    const observer = new ResizeObserver(applySize);
    observer.observe(wrap);

    return () => observer.disconnect();
  }, []);

  /**
   * 用 ref 同步保存当前子笔画数组，并交给 state 触发渲染。
   * 事件回调读取 ref 比读取 state 更可靠，不会拿到上一帧的旧值。
   */
  const updateCurrentStrokes = (nextStrokes) => {
    activeStrokesRef.current = nextStrokes;
    setCurrentStrokes(nextStrokes);
  };

  /**
   * 从 Konva 的事件对象里取归一化坐标，并判断是否在舞台内。
   *
   * 和原生版一样，不能把坐标 clamp 到 0~1：
   * 否则指针拖出画布后，笔迹会一直贴着边缘延伸。
   */
  const getNormalizedPoint = (event) => {
    const stage = event.target.getStage();
    const pointer = stage?.getPointerPosition();
    if (!pointer || stageSize.width < 1 || stageSize.height < 1) return null;

    const x = pointer.x / stageSize.width;
    const y = pointer.y / stageSize.height;
    return {
      inside: x >= 0 && x <= 1 && y >= 0 && y <= 1,
      x,
      y,
    };
  };

  /** 新建一段子笔画 */
  const createStroke = (point) => ({
    tool,
    color,
    size: brushSize / stageSize.width,
    points: [point],
  });

  const handlePointerDown = (event) => {
    // event.evt 是原始的 PointerEvent；button === 0 表示左键 / 触摸
    if (event.evt.button !== 0) return;
    if (stageSize.width < 1) return;

    const point = getNormalizedPoint(event);
    if (!point || !point.inside) return;

    // 和原生版一样做指针捕获。Konva 的监听器挂在画布容器上，
    // 捕获到 canvas 后事件仍会冒泡，所以拖出画布也能继续收到事件。
    event.evt.target.setPointerCapture?.(event.evt.pointerId);

    drawingRef.current = true;
    const stroke = createStroke({ x: point.x, y: point.y });
    activeRef.current = stroke;
    updateCurrentStrokes([stroke]);
  };

  const handlePointerMove = (event) => {
    if (!drawingRef.current) return;

    const point = getNormalizedPoint(event);
    if (!point) return;

    if (!point.inside) {
      // 指针移出画布：结束当前子笔画，但保持拖动状态，
      // 这样移回来时还能继续画；不记录外部坐标，避免边缘拖线。
      activeRef.current = null;
      return;
    }

    if (!activeRef.current) {
      // 从画布外重新进入：另起一段，避免和离开前的点连成一条线
      const stroke = createStroke({ x: point.x, y: point.y });
      activeRef.current = stroke;
      updateCurrentStrokes([...activeStrokesRef.current, stroke]);
      return;
    }

    /*
     * 正常绘制：每次移动都创建新的数组和子笔画对象，再 setState。
     * 声明式写法靠 React 重新渲染来更新 Konva 节点；
     * 原生版则是手动重绘，并可用 requestAnimationFrame 合并高频更新。
     */
    const nextStroke = {
      ...activeRef.current,
      points: [...activeRef.current.points, { x: point.x, y: point.y }],
    };
    activeRef.current = nextStroke;
    // 当前子笔画始终是数组的最后一项，替换它即可
    updateCurrentStrokes([...activeStrokesRef.current.slice(0, -1), nextStroke]);
  };

  /**
   * 结束并提交本次拖动的所有子笔画。
   * 一次拖动即使被画布边界分成多段，也只算一步历史。
   */
  const finishStroke = () => {
    if (!drawingRef.current) return;

    drawingRef.current = false;
    const finishedStrokes = activeStrokesRef.current;
    activeRef.current = null;
    updateCurrentStrokes([]);

    if (finishedStrokes.length === 0) return;

    // 与原生版相同：旧状态进 past，新笔画进入 present，清空 redo
    setHistory((previous) => ({
      past: [...previous.past, previous.present].slice(-MAX_HISTORY),
      present: [...previous.present, ...finishedStrokes],
      future: [],
    }));
  };

  /** 取消本次拖动的所有子笔画（pointercancel 时调用） */
  const cancelStroke = () => {
    if (!drawingRef.current) return;

    drawingRef.current = false;
    activeRef.current = null;
    updateCurrentStrokes([]);
  };

  // ── 历史操作 ────────────────────────────────────────────

  const handleUndo = () => {
    setHistory((previous) => {
      if (previous.past.length === 0) return previous;
      return {
        past: previous.past.slice(0, -1),
        present: previous.past[previous.past.length - 1],
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
   * 舞台包含两个 Layer：白色背景层 + 绘画层，所以导出的图自带白底。
   * pixelRatio: 2 表示按 2 倍分辨率导出，避免图片模糊。
   */
  const handleExport = () => {
    const stage = stageRef.current;
    if (!stage) return;

    const url = stage.toDataURL({ pixelRatio: 2 });
    const link = document.createElement('a');
    link.href = url;
    link.download = `doodle-konva-${Date.now()}.png`;
    link.click();
  };

  const handlePickColor = (value) => {
    setColor(value);
    setTool('pen');
  };

  const toggleEraser = () => {
    setTool((current) => (current === 'eraser' ? 'pen' : 'eraser'));
  };

  return (
    <div className="doodle-board">
      <header className="doodle-header">
        <p className="doodle-eyebrow">CANVAS 2D · KONVA 实现</p>
        <h1>涂鸦画板（Konva）</h1>
        <p className="doodle-intro">
          同样的功能改用 Konva 实现：每个笔画是一个声明式图形节点，由 React 状态驱动更新。
          可以和原生版对照阅读，观察「手动重绘」与「声明式渲染」的差异。
        </p>
      </header>

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
        外层容器负责尺寸、边框和圆角。
        Stage 的宽高来自 ResizeObserver 测量出的真实像素值。

        onPointerUp / onPointerCancel 同时挂在容器上，作为 Stage 事件之外的兜底：
        即使指针在 Konva 节点之外抬起，也能正确结束笔画。
        注意不要监听 pointerleave：指针只是暂时移出画布时，
        应当保持拖动状态，等它移回来继续画。
      */}
      <div
        className={`doodle-canvas-wrap${tool === 'eraser' ? ' is-eraser' : ''}`}
        ref={wrapRef}
        onPointerUp={finishStroke}
        onPointerCancel={cancelStroke}
      >
        <Stage
          ref={stageRef}
          width={stageSize.width}
          height={stageSize.height}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={finishStroke}
          onPointerCancel={cancelStroke}
        >
          {/*
            背景单独放一层：橡皮擦的 destination-out 只会擦除「绘画层」，
            不会把白色背景一起擦掉。
          */}
          <Layer listening={false}>
            <Rect width={stageSize.width} height={stageSize.height} fill="#ffffff" />
          </Layer>

          {/* 绘画层：已完成笔画 + 本次拖动中尚未提交的子笔画 */}
          <Layer listening={false}>
            {strokes.map((stroke, index) => (
              <StrokeShape
                key={index}
                stroke={stroke}
                width={stageSize.width}
                height={stageSize.height}
              />
            ))}
            {currentStrokes.map((stroke, index) => (
              <StrokeShape
                key={`current-${index}`}
                stroke={stroke}
                width={stageSize.width}
                height={stageSize.height}
              />
            ))}
          </Layer>
        </Stage>
      </div>

      <ul className="doodle-notes">
        <li>Stage / Layer / Line 是声明式节点，React 状态变化后 Konva 自动更新画布。</li>
        <li>指针拖出画布时暂停记录，移回后另起一段继续画，不会沿着边缘拖线。</li>
        <li>白色背景单独一层，橡皮擦的 destination-out 只作用于绘画层。</li>
        <li>Line 的 tension 自动生成平滑曲线，省去了手写贝塞尔的代码。</li>
        <li>坐标和笔刷宽度同样归一化，容器缩放后图形保持比例。</li>
        <li>Stage.toDataURL 导出图片；两层的合成结果自带白色背景。</li>
      </ul>
    </div>
  );
}
