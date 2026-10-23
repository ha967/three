import { useCallback, useEffect, useRef, useState } from 'react';
import { Canvas, FabricImage, Rect } from 'fabric';
import './index.css';

/**
 * 图片标注（Fabric.js 实现）
 *
 * 和原生版的区别：
 * - 原生版自己维护标注数组、命中检测、拖动和四角缩放；
 * - Fabric 版把每个标注做成 Canvas 对象（Rect），
 *   选中、移动、缩放控制点、层级和渲染都由 Fabric 管理。
 *
 * 这个 demo 重点观察：
 * 1. Fabric Canvas 也要跟随 React 生命周期 init / dispose；
 * 2. 对象是命令式创建的，但画布状态由 Fabric 维护；
 * 3. “撤销 / 重做”仍然是业务层的问题：这里保存自己的归一化标注快照，
 *    回退时重建 Fabric 对象。
 */

const IMAGE_SRC = '/samples/annotation-scene.svg';

// 固定的逻辑画布尺寸。CSS 负责把它缩放到容器宽度，
// Fabric 会根据 getBoundingClientRect 自动换算指针坐标。
const CANVAS_WIDTH = 1000;
const CANVAS_HEIGHT = 625;
const HISTORY_LIMIT = 50;

const LABELS = [
  { key: 'car', name: '车辆', color: '#4f8cff' },
  { key: 'building', name: '建筑', color: '#f59e0b' },
  { key: 'tree', name: '树木', color: '#22c55e' },
];

function withAlpha(hex, alpha) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function getLabel(key) {
  return LABELS.find((label) => label.key === key) ?? LABELS[0];
}

/** 把一个归一化标注转换成 Fabric Rect */
function createRect(annotation, selectable) {
  const meta = getLabel(annotation.label);

  return new Rect({
    // Fabric 默认以中心点作为 left/top，这里改成左上角，
    // 便于和业务里的归一化矩形坐标直接对应
    originX: 'left',
    originY: 'top',
    left: annotation.x * CANVAS_WIDTH,
    top: annotation.y * CANVAS_HEIGHT,
    width: annotation.w * CANVAS_WIDTH,
    height: annotation.h * CANVAS_HEIGHT,
    fill: withAlpha(meta.color, 0.14),
    stroke: meta.color,
    strokeWidth: 2,
    strokeUniform: true,
    selectable,
    evented: selectable,
    hasControls: selectable,
    lockRotation: true,
    cornerStyle: 'circle',
    cornerColor: '#ffffff',
    cornerStrokeColor: meta.color,
    cornerSize: 10,
    transparentCorners: false,
    borderColor: meta.color,
    borderScaleFactor: 2,
    objectCaching: false,
    // 自定义字段，导出时用来还原业务数据
    label: annotation.label,
    annotationId: annotation.id,
  });
}

/** 从 Fabric 画布上读取当前所有标注，转换成归一化坐标 */
function readAnnotations(canvas) {
  return canvas.getObjects().map((object) => ({
    id: object.annotationId,
    label: object.label,
    x: object.left / CANVAS_WIDTH,
    y: object.top / CANVAS_HEIGHT,
    w: (object.width * object.scaleX) / CANVAS_WIDTH,
    h: (object.height * object.scaleY) / CANVAS_HEIGHT,
  }));
}

export default function ImageAnnotationFabricDemo() {
  const canvasElRef = useRef(null);
  const canvasRef = useRef(null);
  // 供撤销 / 重做调用的“重建画布”函数，由初始化 effect 赋值
  const applySnapshotRef = useRef(() => {});
  // 事件回调里读取当前工具和类别，避免闭包拿到旧值
  const toolRef = useRef('draw');
  const labelRef = useRef(LABELS[0].key);
  const idRef = useRef(1);

  const [history, setHistory] = useState({ past: [], present: [], future: [] });
  const [tool, setTool] = useState('draw');
  const [labelKey, setLabelKey] = useState(LABELS[0].key);
  const [hasSelection, setHasSelection] = useState(false);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');

  const annotations = history.present;

  /** 把一次新的标注快照写入历史。setHistory 的函数式更新不会产生闭包问题 */
  const commitSnapshot = useCallback((next) => {
    setHistory((previous) => ({
      past: [...previous.past, previous.present].slice(-HISTORY_LIMIT),
      present: next,
      future: [],
    }));
  }, []);

  /**
   * 初始化 Fabric 画布、加载背景图、绑定事件。
   * 这个 effect 只执行一次；工具、类别等通过 ref 读取最新值。
   */
  useEffect(() => {
    const element = canvasElRef.current;
    if (!element) return undefined;

    let disposed = false;
    let drawing = false;
    let draftRect = null;
    let drawStart = null;

    const canvas = new Canvas(element, {
      width: CANVAS_WIDTH,
      height: CANVAS_HEIGHT,
      selection: false,
      preserveObjectStacking: true,
      backgroundColor: '#ffffff',
    });
    canvasRef.current = canvas;
    canvas.skipTargetFind = true;

    /** 重建画布对象：撤销、重做时使用 */
    const applySnapshot = (snapshot) => {
      canvas.getObjects().slice().forEach((object) => canvas.remove(object));
      canvas.discardActiveObject();

      const selectable = toolRef.current === 'select';
      for (const annotation of snapshot) {
        const rect = createRect(annotation, selectable);
        canvas.add(rect);
        rect.setCoords();
      }

      canvas.requestRenderAll();
      setHasSelection(false);
    };
    applySnapshotRef.current = applySnapshot;

    // 异步加载示例图片作为背景
    FabricImage.fromURL(IMAGE_SRC)
      .then((image) => {
        if (disposed) return;

        image.set({
          originX: 'left',
          originY: 'top',
          left: 0,
          top: 0,
          scaleX: CANVAS_WIDTH / image.width,
          scaleY: CANVAS_HEIGHT / image.height,
          selectable: false,
          evented: false,
        });
        canvas.backgroundImage = image;
        canvas.requestRenderAll();
        setReady(true);
      })
      .catch(() => {
        if (!disposed) setError('示例图片加载失败');
      });

    // ── 绘制模式：鼠标按下、拖拽、松开 ──────────────────
    const handleMouseDown = (event) => {
      if (toolRef.current !== 'draw') return;
      // Fabric 7 的事件对象里，原始 PointerEvent 在 event.e 上
      if (event.e.button !== 0) return;

      const point = canvas.getScenePoint(event.e);
      const meta = getLabel(labelRef.current);

      drawing = true;
      drawStart = point;

      draftRect = new Rect({
        originX: 'left',
        originY: 'top',
        left: point.x,
        top: point.y,
        width: 1,
        height: 1,
        fill: withAlpha(meta.color, 0.14),
        stroke: meta.color,
        strokeWidth: 2,
        strokeUniform: true,
        selectable: false,
        evented: false,
        objectCaching: false,
        label: meta.key,
        annotationId: idRef.current,
      });

      canvas.add(draftRect);
      canvas.requestRenderAll();
    };

    const handleMouseMove = (event) => {
      if (!drawing || !draftRect || !drawStart) return;

      const point = canvas.getScenePoint(event.e);
      draftRect.set({
        left: Math.min(drawStart.x, point.x),
        top: Math.min(drawStart.y, point.y),
        width: Math.abs(point.x - drawStart.x),
        height: Math.abs(point.y - drawStart.y),
      });
      // Fabric 会缓存对象坐标（aCoords），改完尺寸必须刷新，否则命中检测会失效
      draftRect.setCoords();
      canvas.requestRenderAll();
    };

    const handleMouseUp = () => {
      if (!drawing || !draftRect) return;

      drawing = false;
      drawStart = null;
      const rect = draftRect;
      draftRect = null;

      // 太小的框视为误触，直接删掉
      if (rect.width < 8 || rect.height < 8) {
        canvas.remove(rect);
        canvas.requestRenderAll();
        return;
      }

      idRef.current += 1;
      rect.set({ selectable: false, evented: false });
      rect.setCoords();
      canvas.requestRenderAll();

      // 一次画框提交一次历史
      commitSnapshot(readAnnotations(canvas));
    };

    // 选择模式下移动 / 缩放结束，Fabric 会触发 object:modified
    const handleModified = () => {
      commitSnapshot(readAnnotations(canvas));
    };

    const syncSelection = () => {
      setHasSelection(canvas.getActiveObjects().length > 0);
    };

    canvas.on('mouse:down', handleMouseDown);
    canvas.on('mouse:move', handleMouseMove);
    canvas.on('mouse:up', handleMouseUp);
    canvas.on('object:modified', handleModified);
    canvas.on('selection:created', syncSelection);
    canvas.on('selection:updated', syncSelection);
    canvas.on('selection:cleared', syncSelection);

    return () => {
      disposed = true;
      canvas.off('mouse:down', handleMouseDown);
      canvas.off('mouse:move', handleMouseMove);
      canvas.off('mouse:up', handleMouseUp);
      canvas.off('object:modified', handleModified);
      canvas.off('selection:created', syncSelection);
      canvas.off('selection:updated', syncSelection);
      canvas.off('selection:cleared', syncSelection);
      canvas.dispose();
      canvasRef.current = null;
    };
  }, [commitSnapshot]);

  // 工具切换：draw 模式下禁止对象命中，select 模式启用 Fabric 自带的选择 / 控制点
  useEffect(() => {
    toolRef.current = tool;

    const canvas = canvasRef.current;
    if (!canvas) return;

    const selectable = tool === 'select';
    canvas.selection = selectable;
    canvas.skipTargetFind = !selectable;
    canvas.getObjects().forEach((object) => {
      object.set({ selectable, evented: selectable, hasControls: selectable });
    });

    if (!selectable) {
      canvas.discardActiveObject();
    }
    canvas.requestRenderAll();
  }, [tool]);

  useEffect(() => {
    labelRef.current = labelKey;
  }, [labelKey]);

  // ── 历史操作 ────────────────────────────────────────────

  const handleUndo = () => {
    if (history.past.length === 0) return;

    const previous = history.past[history.past.length - 1];
    applySnapshotRef.current(previous);
    setHistory({
      past: history.past.slice(0, -1),
      present: previous,
      future: [history.present, ...history.future],
    });
  };

  const handleRedo = () => {
    if (history.future.length === 0) return;

    const [nextPresent, ...rest] = history.future;
    applySnapshotRef.current(nextPresent);
    setHistory({
      past: [...history.past, history.present],
      present: nextPresent,
      future: rest,
    });
  };

  const handleDelete = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const activeObjects = canvas.getActiveObjects();
    if (activeObjects.length === 0) return;

    activeObjects.forEach((object) => canvas.remove(object));
    canvas.discardActiveObject();
    canvas.requestRenderAll();
    setHasSelection(false);
    commitSnapshot(readAnnotations(canvas));
  };

  const handleClear = () => {
    const canvas = canvasRef.current;
    if (!canvas || canvas.getObjects().length === 0) return;

    canvas.getObjects().slice().forEach((object) => canvas.remove(object));
    canvas.discardActiveObject();
    canvas.requestRenderAll();
    setHasSelection(false);
    commitSnapshot([]);
  };

  /** 导出与原生版一致的 JSON 结构 */
  const handleExport = () => {
    const payload = {
      image: {
        src: IMAGE_SRC,
        width: 1600,
        height: 1000,
      },
      annotations: annotations.map((annotation) => ({
        id: annotation.id,
        label: annotation.label,
        x: Number(annotation.x.toFixed(4)),
        y: Number(annotation.y.toFixed(4)),
        w: Number(annotation.w.toFixed(4)),
        h: Number(annotation.h.toFixed(4)),
      })),
    };

    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'annotations-fabric.json';
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const switchTool = (nextTool) => {
    setTool(nextTool);
    // 切到画框模式时主动收起选中状态（Fabric 的选择事件也会同步一次）
    if (nextTool === 'draw') setHasSelection(false);
  };

  return (
    <div className="annotation-demo">
      <header className="annotation-header">
        <p className="annotation-eyebrow">CANVAS 2D · FABRIC.JS 实现</p>
        <h1>图片标注（Fabric.js）</h1>
        <p className="annotation-intro">
          同样的标注功能改用 Fabric.js：每个矩形是一个对象，选中、移动、缩放控制点和层级
          都由库管理。业务层只负责工具切换、历史快照和导出。
        </p>
      </header>

      <div className="annotation-toolbar">
        <div className="annotation-group" role="group" aria-label="工具">
          <button
            type="button"
            className={`annotation-button${tool === 'draw' ? ' is-active' : ''}`}
            aria-pressed={tool === 'draw'}
            onClick={() => switchTool('draw')}
          >
            画框
          </button>
          <button
            type="button"
            className={`annotation-button${tool === 'select' ? ' is-active' : ''}`}
            aria-pressed={tool === 'select'}
            onClick={() => switchTool('select')}
          >
            选择
          </button>
        </div>

        <div className="annotation-group" role="group" aria-label="标注类别">
          <span className="annotation-group__label">类别</span>
          {LABELS.map((label) => (
            <button
              key={label.key}
              type="button"
              className={`annotation-button annotation-label${labelKey === label.key ? ' is-active' : ''}`}
              style={{ '--label-color': label.color }}
              aria-pressed={labelKey === label.key}
              onClick={() => setLabelKey(label.key)}
            >
              {label.name}
            </button>
          ))}
        </div>

        <div className="annotation-toolbar__end">
          <button
            type="button"
            className="annotation-button"
            onClick={handleUndo}
            disabled={history.past.length === 0}
          >
            撤销
          </button>
          <button
            type="button"
            className="annotation-button"
            onClick={handleRedo}
            disabled={history.future.length === 0}
          >
            重做
          </button>
          <button
            type="button"
            className="annotation-button"
            onClick={handleDelete}
            disabled={!hasSelection}
          >
            删除
          </button>
          <button
            type="button"
            className="annotation-button"
            onClick={handleClear}
            disabled={annotations.length === 0}
          >
            清空
          </button>
          <button
            type="button"
            className="annotation-button annotation-button--primary"
            onClick={handleExport}
            disabled={annotations.length === 0}
          >
            导出 JSON
          </button>
        </div>
      </div>

      {error && <p className="annotation-error">{error}</p>}

      <div className={`annotation-stage annotation-fabric-stage${tool === 'draw' ? ' is-draw' : ''}`}>
        <canvas ref={canvasElRef} />
        <span className="annotation-stage-hint">
          {ready
            ? `${annotations.length} 个标注 · ${tool === 'draw' ? '拖拽画框' : '点选 / 拖动 / 缩放'}`
            : '加载示例图片…'}
        </span>
      </div>

      <ul className="annotation-notes">
        <li>Fabric 负责对象模型、选中状态和四角控制点，代码量明显少于原生版。</li>
        <li>draw 模式下设置 skipTargetFind，让按下事件不被已有对象拦截。</li>
        <li>object:modified 表示一次移动 / 缩放结束，在这里提交历史快照。</li>
        <li>撤销 / 重做通过重建 Fabric 对象实现，原始数据仍保存在业务层的归一化快照里。</li>
      </ul>
    </div>
  );
}
