import { useCallback, useEffect, useRef, useState } from 'react';
import './index.css';

/**
 * 图片标注（原生 Canvas 实现）
 *
 * 核心概念是「两套坐标的换算」：
 * - 标注数据用归一化坐标（0~1）保存，窗口缩放后仍然对齐；
 * - 绘制和命中检测时再乘以画布当前宽高。
 *
 * 功能：
 * - 画框：按下拖拽生成矩形；
 * - 选择：点击选中、拖动移动、拖四角缩放；
 * - 删除 / 撤销 / 重做 / 清空；
 * - 导出 JSON（归一化坐标，可直接对接后端标注系统）。
 */

const IMAGE_SRC = '/samples/annotation-scene.svg';
const IMAGE_WIDTH = 1600;
const IMAGE_HEIGHT = 1000;

const LABELS = [
  { key: 'car', name: '车辆', color: '#4f8cff' },
  { key: 'building', name: '建筑', color: '#f59e0b' },
  { key: 'tree', name: '树木', color: '#22c55e' },
];

// 矩形最小尺寸（归一化），避免误点产生几乎不可见的框
const MIN_SIZE = 0.02;
const HISTORY_LIMIT = 50;
const EMPTY_HISTORY = { past: [], present: [], future: [] };
const FONT_FAMILY =
  '"Inter", "PingFang SC", "Microsoft YaHei", system-ui, -apple-system, sans-serif';

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function withAlpha(hex, alpha) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function getLabel(key) {
  return LABELS.find((label) => label.key === key) ?? LABELS[0];
}

/** 圆角矩形，标签文字底衬用 */
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

/** 四角控制点的屏幕坐标 */
function getHandlePositions(annotation, width, height) {
  const x = annotation.x * width;
  const y = annotation.y * height;
  const right = (annotation.x + annotation.w) * width;
  const bottom = (annotation.y + annotation.h) * height;

  return {
    nw: { x, y },
    ne: { x: right, y },
    sw: { x, y: bottom },
    se: { x: right, y: bottom },
  };
}

/**
 * 画一个标注框：
 * 半透明填充 + 描边 + 标签文字；选中时再画四个控制点。
 */
function drawAnnotation(context, annotation, width, height, selected, draft = false) {
  const meta = getLabel(annotation.label);
  const x = annotation.x * width;
  const y = annotation.y * height;
  const w = annotation.w * width;
  const h = annotation.h * height;

  context.save();
  context.fillStyle = withAlpha(meta.color, 0.16);
  context.strokeStyle = meta.color;
  context.lineWidth = selected ? 3 : 2;
  if (draft) context.setLineDash([6, 4]);

  context.beginPath();
  context.rect(x, y, w, h);
  context.fill();
  context.stroke();
  context.restore();

  // 标签文字：默认放在框上方，空间不够时放到框内顶部
  context.save();
  context.font = `600 12px ${FONT_FAMILY}`;
  const text = meta.name;
  const chipWidth = context.measureText(text).width + 16;
  const chipHeight = 20;
  const chipX = clamp(x, 4, width - chipWidth - 4);
  const chipY = y - chipHeight - 4 >= 4 ? y - chipHeight - 4 : y + 4;

  roundedRect(context, chipX, chipY, chipWidth, chipHeight, 5);
  context.fillStyle = meta.color;
  context.fill();

  context.fillStyle = '#ffffff';
  context.textAlign = 'left';
  context.textBaseline = 'middle';
  context.fillText(text, chipX + 8, chipY + chipHeight / 2);
  context.restore();

  // 选中状态：四角绘制白色小方块
  if (selected && !draft) {
    const handles = getHandlePositions(annotation, width, height);
    context.save();
    context.lineWidth = 2;
    for (const position of Object.values(handles)) {
      context.beginPath();
      context.rect(position.x - 4, position.y - 4, 8, 8);
      context.fillStyle = '#ffffff';
      context.fill();
      context.strokeStyle = meta.color;
      context.stroke();
    }
    context.restore();
  }
}

export default function ImageAnnotationNativeDemo() {
  const wrapRef = useRef(null);
  const canvasRef = useRef(null);

  const sizeRef = useRef({ width: 0, height: 0, dpr: 1 });
  const imageRef = useRef(null);
  const frameRef = useRef(0);
  // 标注数据镜像，命令式绘制和命中检测读取它，避免闭包拿到旧数据
  const annotationsRef = useRef([]);
  const selectedIdRef = useRef(null);
  // 正在拖拽生成的矩形
  const draftRef = useRef(null);
  const drawStartRef = useRef(null);
  // 移动 / 缩放时的临时预览
  const previewRef = useRef(null);
  const interactionRef = useRef(null);
  // 自增 id
  const idRef = useRef(1);

  const [history, setHistory] = useState(EMPTY_HISTORY);
  const [selectedId, setSelectedId] = useState(null);
  const [tool, setTool] = useState('draw'); // 'draw' | 'select'
  const [labelKey, setLabelKey] = useState(LABELS[0].key);
  const [imageReady, setImageReady] = useState(false);

  const annotations = history.present;
  const canUndo = history.past.length > 0;
  const canRedo = history.future.length > 0;

  /** 重绘整张画布：底图 → 已提交标注 → 拖拽预览 → 新建草稿 */
  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const { width, height, dpr } = sizeRef.current;
    if (width < 1 || height < 1) return;

    const context = canvas.getContext('2d');
    context.setTransform(dpr, 0, 0, dpr, 0, 0);
    context.clearRect(0, 0, width, height);

    const image = imageRef.current;
    if (image) {
      context.drawImage(image, 0, 0, width, height);
    }

    const preview = previewRef.current;
    const selected = selectedIdRef.current;

    for (const annotation of annotationsRef.current) {
      // 拖动 / 缩放过程中，用 preview 覆盖原始数据
      const display = preview && preview.id === annotation.id ? preview : annotation;
      drawAnnotation(context, display, width, height, display.id === selected);
    }

    if (draftRef.current) {
      drawAnnotation(context, draftRef.current, width, height, false, true);
    }

    if (!image) {
      context.fillStyle = '#98a2b3';
      context.font = `14px ${FONT_FAMILY}`;
      context.textAlign = 'center';
      context.textBaseline = 'middle';
      context.fillText('示例图片加载中…', width / 2, height / 2);
    }
  }, []);

  const scheduleDraw = useCallback(() => {
    if (frameRef.current) return;
    frameRef.current = requestAnimationFrame(() => {
      frameRef.current = 0;
      draw();
    });
  }, [draw]);

  // 标注数组变化后同步 ref 并重绘
  useEffect(() => {
    annotationsRef.current = annotations;
    draw();
  }, [annotations, draw]);

  // 选中项变化后同步 ref 并重绘（控制点需要重新画）
  useEffect(() => {
    selectedIdRef.current = selectedId;
    draw();
  }, [selectedId, draw]);

  // 加载示例图片
  useEffect(() => {
    const image = new Image();
    image.src = IMAGE_SRC;
    image.onload = () => {
      imageRef.current = image;
      setImageReady(true);
      draw();
    };

    return () => {
      image.onload = null;
    };
  }, [draw]);

  // 尺寸适配
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

  // 卸载时取消未执行的动画帧
  useEffect(
    () => () => {
      if (frameRef.current) cancelAnimationFrame(frameRef.current);
    },
    [],
  );

  const commit = useCallback((nextAnnotations) => {
    setHistory((previous) => ({
      past: [...previous.past, previous.present].slice(-HISTORY_LIMIT),
      present: nextAnnotations,
      future: [],
    }));
  }, []);

  const getNormalizedPoint = (event) => {
    const rect = event.currentTarget.getBoundingClientRect();
    return {
      x: clamp((event.clientX - rect.left) / rect.width, 0, 1),
      y: clamp((event.clientY - rect.top) / rect.height, 0, 1),
    };
  };

  const handlePointerDown = (event) => {
    if (event.button !== 0) return;

    const canvas = event.currentTarget;
    canvas.setPointerCapture(event.pointerId);
    const point = getNormalizedPoint(event);

    if (tool === 'draw') {
      draftRef.current = {
        id: idRef.current,
        label: labelKey,
        x: point.x,
        y: point.y,
        w: 0,
        h: 0,
      };
      drawStartRef.current = point;
      setSelectedId(null);
      scheduleDraw();
      return;
    }

    // ── 选择模式：先看是否点中了选中框的控制点 ──
    const rect = canvas.getBoundingClientRect();
    const screenX = event.clientX - rect.left;
    const screenY = event.clientY - rect.top;
    const selectedAnnotation = annotationsRef.current.find(
      (annotation) => annotation.id === selectedIdRef.current,
    );

    if (selectedAnnotation) {
      const handles = getHandlePositions(
        selectedAnnotation,
        rect.width,
        rect.height,
      );

      for (const [handle, position] of Object.entries(handles)) {
        if (Math.abs(screenX - position.x) <= 10 && Math.abs(screenY - position.y) <= 10) {
          interactionRef.current = {
            mode: 'resize',
            handle,
            annotation: { ...selectedAnnotation },
          };
          return;
        }
      }
    }

    // ── 从后往前找命中的标注（后画的在上层）──
    const hit = [...annotationsRef.current]
      .reverse()
      .find(
        (annotation) =>
          point.x >= annotation.x &&
          point.x <= annotation.x + annotation.w &&
          point.y >= annotation.y &&
          point.y <= annotation.y + annotation.h,
      );

    if (hit) {
      setSelectedId(hit.id);
      interactionRef.current = {
        mode: 'move',
        annotation: { ...hit },
        start: point,
      };
    } else {
      setSelectedId(null);
      interactionRef.current = null;
    }
  };

  const handlePointerMove = (event) => {
    if (event.buttons === 0) return;

    const point = getNormalizedPoint(event);

    // 画框
    if (draftRef.current && drawStartRef.current) {
      const start = drawStartRef.current;
      draftRef.current = {
        ...draftRef.current,
        x: Math.min(start.x, point.x),
        y: Math.min(start.y, point.y),
        w: Math.abs(point.x - start.x),
        h: Math.abs(point.y - start.y),
      };
      scheduleDraw();
      return;
    }

    const interaction = interactionRef.current;
    if (!interaction) return;

    const original = interaction.annotation;
    let next;

    if (interaction.mode === 'move') {
      // 移动：保持尺寸不变，限制在画布范围内
      next = {
        ...original,
        x: clamp(original.x + (point.x - interaction.start.x), 0, 1 - original.w),
        y: clamp(original.y + (point.y - interaction.start.y), 0, 1 - original.h),
      };
    } else {
      // 缩放：按住的控制点跟着指针，对面的角固定
      let left = original.x;
      let top = original.y;
      let right = original.x + original.w;
      let bottom = original.y + original.h;
      const handle = interaction.handle;

      if (handle.includes('w')) left = clamp(point.x, 0, right - MIN_SIZE);
      if (handle.includes('e')) right = clamp(point.x, left + MIN_SIZE, 1);
      if (handle.includes('n')) top = clamp(point.y, 0, bottom - MIN_SIZE);
      if (handle.includes('s')) bottom = clamp(point.y, top + MIN_SIZE, 1);

      next = {
        ...original,
        x: left,
        y: top,
        w: right - left,
        h: bottom - top,
      };
    }

    previewRef.current = next;
    scheduleDraw();
  };

  const handlePointerUp = (event) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }

    // 完成画框
    if (draftRef.current) {
      const draft = draftRef.current;
      draftRef.current = null;
      drawStartRef.current = null;

      if (draft.w >= MIN_SIZE && draft.h >= MIN_SIZE) {
        commit([...annotationsRef.current, draft]);
        setSelectedId(draft.id);
        idRef.current += 1;
      } else {
        scheduleDraw();
      }
      return;
    }

    // 完成移动 / 缩放：只提交一次历史记录
    if (previewRef.current) {
      const preview = previewRef.current;
      previewRef.current = null;
      interactionRef.current = null;
      commit(
        annotationsRef.current.map((annotation) =>
          annotation.id === preview.id ? preview : annotation,
        ),
      );
      return;
    }

    interactionRef.current = null;
  };

  const handlePointerCancel = (event) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    draftRef.current = null;
    drawStartRef.current = null;
    previewRef.current = null;
    interactionRef.current = null;
    scheduleDraw();
  };

  // ── 历史操作 ────────────────────────────────────────────

  const handleUndo = () => {
    if (history.past.length === 0) return;
    setHistory({
      past: history.past.slice(0, -1),
      present: history.past[history.past.length - 1],
      future: [history.present, ...history.future],
    });
    setSelectedId(null);
  };

  const handleRedo = () => {
    if (history.future.length === 0) return;
    const [nextPresent, ...rest] = history.future;
    setHistory({
      past: [...history.past, history.present],
      present: nextPresent,
      future: rest,
    });
    setSelectedId(null);
  };

  const handleDelete = () => {
    if (selectedId === null) return;
    commit(annotations.filter((annotation) => annotation.id !== selectedId));
    setSelectedId(null);
  };

  const handleClear = () => {
    if (annotations.length === 0) return;
    commit([]);
    setSelectedId(null);
  };

  /** 导出归一化坐标，方便后端或其他端复用 */
  const handleExport = () => {
    const payload = {
      image: { src: IMAGE_SRC, width: IMAGE_WIDTH, height: IMAGE_HEIGHT },
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
    link.download = 'annotations.json';
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const switchTool = (nextTool) => {
    setTool(nextTool);
    if (nextTool === 'draw') setSelectedId(null);
  };

  // Delete / Backspace 删除选中标注，Esc 取消选中
  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        setSelectedId(null);
        return;
      }

      if (
        selectedId !== null &&
        (event.key === 'Delete' || event.key === 'Backspace')
      ) {
        event.preventDefault();
        setHistory((previous) => ({
          past: [...previous.past, previous.present].slice(-HISTORY_LIMIT),
          present: previous.present.filter(
            (annotation) => annotation.id !== selectedId,
          ),
          future: [],
        }));
        setSelectedId(null);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedId]);

  return (
    <div className="annotation-demo">
      <header className="annotation-header">
        <p className="annotation-eyebrow">CANVAS 2D · 原生实现</p>
        <h1>图片标注</h1>
        <p className="annotation-intro">
          在示例图上拖拽画框，切换选择工具后可以移动、缩放、删除标注。
          标注使用归一化坐标保存，可导出 JSON，窗口缩放后位置依然对齐。
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
            disabled={!canUndo}
          >
            撤销
          </button>
          <button
            type="button"
            className="annotation-button"
            onClick={handleRedo}
            disabled={!canRedo}
          >
            重做
          </button>
          <button
            type="button"
            className="annotation-button"
            onClick={handleDelete}
            disabled={selectedId === null}
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

      <div className="annotation-stage" ref={wrapRef}>
        <canvas
          ref={canvasRef}
          className={`annotation-canvas${tool === 'draw' ? ' is-draw' : ' is-select'}`}
          aria-label="图片标注画布"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerCancel}
        />
        <span className="annotation-stage-hint">
          {imageReady
            ? `${annotations.length} 个标注 · ${tool === 'draw' ? '拖拽画框' : '点选 / 拖动 / 缩放'}`
            : '加载示例图片…'}
        </span>
      </div>

      <ul className="annotation-notes">
        <li>标注坐标归一化到 0~1，容器尺寸变化后不需要修改数据。</li>
        <li>命中检测从后往前遍历，后创建的标注优先被选中。</li>
        <li>移动和缩放只产生一次历史记录：拖动过程用 preview，松手时再提交。</li>
        <li>Delete / Backspace 删除选中框，Esc 取消选中。</li>
      </ul>
    </div>
  );
}
