import { useCallback, useEffect, useRef, useState } from 'react';
import './index.css';

/**
 * 头像裁剪（原生 Canvas 实现）
 *
 * 核心思路：
 * 1. 把图片画在 canvas 上，用「缩放 + 偏移」控制图片在裁剪框中的位置；
 * 2. 圆形遮罩用「矩形 + 反向圆」组成一条路径来挖孔，不影响下面的图片；
 * 3. 交互：拖拽平移、滚轮 / 滑块缩放，缩放始终以指针（或中心）为锚点；
 * 4. 导出时把圆形区域对应的原图区域重新绘制到 512×512 的离屏 canvas 上。
 *
 * 坐标关系：
 *   canvas 坐标 = 图片坐标 × scale + offset
 *   图片坐标   = (canvas 坐标 - offset) / scale
 * 拖拽、缩放、裁剪导出都依赖这个换算。
 */

const OUTPUT_SIZE = 512;
const MIN_ZOOM = 1;
const MAX_ZOOM = 3;
// 圆形遮罩与画布边缘的间距（CSS 像素）
const MASK_PADDING = 20;

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export default function AvatarCropNativeDemo() {
  const wrapRef = useRef(null);
  const canvasRef = useRef(null);
  const fileRef = useRef(null);
  // 真实图片对象。它不参与渲染，所以放 ref，避免无意义的重新渲染
  const imageRef = useRef(null);
  // 画布的 CSS 尺寸与 DPR
  const sizeRef = useRef({ width: 0, height: 0, dpr: 1 });
  // 缩放倍数（相对于「铺满裁剪框」的基准比例）
  const zoomRef = useRef(1);
  // 图片左上角在 canvas 中的位置
  const offsetRef = useRef({ x: 0, y: 0 });
  // 拖拽过程中的起始状态
  const dragRef = useRef(null);
  // rAF 句柄
  const frameRef = useRef(0);
  // 上传文件的 object URL，卸载时需要释放
  const sourceUrlRef = useRef(null);
  // 预览图的 object URL
  const previewUrlRef = useRef(null);

  // 下面几个 state 只用于驱动界面显示
  const [zoom, setZoom] = useState(1);
  const [hasImage, setHasImage] = useState(false);
  const [fileName, setFileName] = useState('');
  const [previewUrl, setPreviewUrl] = useState('');
  const [error, setError] = useState('');

  /**
   * 计算「铺满裁剪框」所需的缩放比例，再乘上用户选择的倍数。
   * 用 max 而不是 min，保证图片始终覆盖整个方形裁剪区域，不会露出空白。
   */
  const getFitScale = useCallback((image, width, height, zoomValue) => {
    const coverScale = Math.max(width / image.naturalWidth, height / image.naturalHeight);
    return coverScale * zoomValue;
  }, []);

  /**
   * 限制图片偏移，保证图片始终覆盖整个裁剪框。
   * 图片比画布大时，offset 的取值范围是 [画布尺寸 - 图片尺寸, 0]。
   */
  const clampOffsets = useCallback(() => {
    const image = imageRef.current;
    const { width, height } = sizeRef.current;
    if (!image || width < 1) return;

    const scale = getFitScale(image, width, height, zoomRef.current);
    const drawWidth = image.naturalWidth * scale;
    const drawHeight = image.naturalHeight * scale;

    offsetRef.current = {
      x: clamp(offsetRef.current.x, width - drawWidth, 0),
      y: clamp(offsetRef.current.y, height - drawHeight, 0),
    };
  }, [getFitScale]);

  /**
   * 绘制画面：
   * 图片 → 半透明遮罩（中间挖圆孔）→ 圆形描边。
   */
  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const { width, height, dpr } = sizeRef.current;
    if (width < 1 || height < 1) return;

    const context = canvas.getContext('2d');
    context.setTransform(dpr, 0, 0, dpr, 0, 0);
    context.clearRect(0, 0, width, height);

    const image = imageRef.current;
    if (!image) return;

    const scale = getFitScale(image, width, height, zoomRef.current);
    const { x, y } = offsetRef.current;
    context.drawImage(
      image,
      x,
      y,
      image.naturalWidth * scale,
      image.naturalHeight * scale,
    );

    const radius = Math.min(width, height) / 2 - MASK_PADDING;

    /*
     * 遮罩的挖孔技巧：
     * 一条路径里先画外层矩形，再画一个「逆时针」的圆。
     * 填充时按非零环绕规则，圆的区域会被挖空，只留下圆外的半透明遮罩。
     * 如果改用 destination-out 擦除，会把下面的图片一起擦掉。
     */
    context.beginPath();
    context.rect(0, 0, width, height);
    context.arc(width / 2, height / 2, radius, 0, Math.PI * 2, true);
    context.fillStyle = 'rgba(15, 23, 42, 0.55)';
    context.fill();

    // 圆形边框，提示最终裁剪范围
    context.beginPath();
    context.arc(width / 2, height / 2, radius, 0, Math.PI * 2);
    context.strokeStyle = 'rgba(255, 255, 255, 0.9)';
    context.lineWidth = 2;
    context.stroke();
  }, [getFitScale]);

  /** 用 requestAnimationFrame 合并高频重绘（拖拽时每帧可能触发多次） */
  const scheduleDraw = useCallback(() => {
    if (frameRef.current) return;
    frameRef.current = requestAnimationFrame(() => {
      frameRef.current = 0;
      draw();
    });
  }, [draw]);

  /** 让图片居中铺满裁剪框（保持当前缩放倍数） */
  const fitImage = useCallback(
    (image, zoomValue = zoomRef.current) => {
      const { width, height } = sizeRef.current;
      if (!image || width < 1 || height < 1) return;

      const scale = getFitScale(image, width, height, zoomValue);
      offsetRef.current = {
        x: (width - image.naturalWidth * scale) / 2,
        y: (height - image.naturalHeight * scale) / 2,
      };
      clampOffsets();
      scheduleDraw();
    },
    [clampOffsets, getFitScale, scheduleDraw],
  );

  /**
   * 应用缩放。
   * anchor 是缩放中心（canvas 坐标）：滚轮缩放时是鼠标位置，滑块缩放时是画布中心。
   * 做法是：先算出锚点对应的图片坐标，缩放后再反推新的 offset，
   * 这样锚点下的图片内容会保持在原地。
   */
  const applyZoom = useCallback(
    (nextZoom, anchor) => {
      const image = imageRef.current;
      const { width, height } = sizeRef.current;
      if (!image || width < 1) return;

      const clampedZoom = clamp(nextZoom, MIN_ZOOM, MAX_ZOOM);
      const oldScale = getFitScale(image, width, height, zoomRef.current);
      const newScale = getFitScale(image, width, height, clampedZoom);

      const anchorX = anchor?.x ?? width / 2;
      const anchorY = anchor?.y ?? height / 2;
      const imageX = (anchorX - offsetRef.current.x) / oldScale;
      const imageY = (anchorY - offsetRef.current.y) / oldScale;

      zoomRef.current = clampedZoom;
      setZoom(clampedZoom);
      offsetRef.current = {
        x: anchorX - imageX * newScale,
        y: anchorY - imageY * newScale,
      };

      clampOffsets();
      scheduleDraw();
    },
    [clampOffsets, getFitScale, scheduleDraw],
  );

  /**
   * 尺寸适配：canvas 位图按 DPR 放大，CSS 尺寸跟随容器。
   * 尺寸变化后重新居中图片。
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

      if (imageRef.current) {
        fitImage(imageRef.current);
      } else {
        draw();
      }
    };

    applySize();
    const observer = new ResizeObserver(applySize);
    observer.observe(wrap);

    return () => observer.disconnect();
  }, [draw, fitImage]);

  /**
   * 滚轮缩放。
   * React 的 onWheel 通常是被动监听，无法 preventDefault；
   * 这里手动绑定非被动监听，避免缩放时页面跟着滚动。
   */
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;

    const handleWheel = (event) => {
      if (!imageRef.current) return;
      event.preventDefault();

      const rect = canvas.getBoundingClientRect();
      const factor = Math.exp(-event.deltaY * 0.0015);
      applyZoom(zoomRef.current * factor, {
        x: event.clientX - rect.left,
        y: event.clientY - rect.top,
      });
    };

    canvas.addEventListener('wheel', handleWheel, { passive: false });
    return () => canvas.removeEventListener('wheel', handleWheel);
  }, [applyZoom]);

  // 组件卸载时释放 object URL 和未执行的动画帧
  useEffect(
    () => () => {
      if (sourceUrlRef.current) URL.revokeObjectURL(sourceUrlRef.current);
      if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
      if (frameRef.current) cancelAnimationFrame(frameRef.current);
    },
    [],
  );

  const handleFile = (event) => {
    const file = event.target.files?.[0];
    // 清空 input，保证连续选择同一张图也能触发 change
    event.target.value = '';
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setError('请选择图片文件');
      return;
    }

    setError('');
    if (sourceUrlRef.current) URL.revokeObjectURL(sourceUrlRef.current);
    if (previewUrlRef.current) {
      URL.revokeObjectURL(previewUrlRef.current);
      previewUrlRef.current = null;
    }

    const url = URL.createObjectURL(file);
    sourceUrlRef.current = url;

    const image = new Image();
    image.onload = () => {
      imageRef.current = image;
      zoomRef.current = 1;
      setZoom(1);
      setHasImage(true);
      setFileName(file.name);
      setPreviewUrl('');
      fitImage(image, 1);
    };
    image.onerror = () => {
      setError('图片加载失败，请换一张试试');
    };
    image.src = url;
  };

  // ── 拖拽平移 ────────────────────────────────────────────

  const handlePointerDown = (event) => {
    if (!imageRef.current || event.button !== 0) return;

    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = {
      startX: event.clientX,
      startY: event.clientY,
      offsetX: offsetRef.current.x,
      offsetY: offsetRef.current.y,
    };
  };

  const handlePointerMove = (event) => {
    const drag = dragRef.current;
    if (!drag) return;

    offsetRef.current = {
      x: drag.offsetX + (event.clientX - drag.startX),
      y: drag.offsetY + (event.clientY - drag.startY),
    };
    clampOffsets();
    scheduleDraw();
  };

  const handlePointerEnd = (event) => {
    if (!dragRef.current) return;

    dragRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  const handleReset = () => {
    if (!imageRef.current) return;
    zoomRef.current = 1;
    setZoom(1);
    fitImage(imageRef.current, 1);
  };

  /**
   * 生成裁剪结果。
   *
   * 圆形遮罩对应原图上的一个方形区域：
   * - 圆心在画布中心，半径为 radius；
   * - 用「canvas → 图片」的换算得到这张方形区域的原始坐标；
   * - 在 512×512 离屏画布上裁剪成圆，导出透明背景 PNG。
   */
  const handleCrop = () => {
    const image = imageRef.current;
    if (!image) return;

    const { width, height } = sizeRef.current;
    const radius = Math.min(width, height) / 2 - MASK_PADDING;
    const diameter = radius * 2;
    const scale = getFitScale(image, width, height, zoomRef.current);

    const sourceX = (width / 2 - radius - offsetRef.current.x) / scale;
    const sourceY = (height / 2 - radius - offsetRef.current.y) / scale;
    const sourceSize = diameter / scale;

    const exported = document.createElement('canvas');
    exported.width = OUTPUT_SIZE;
    exported.height = OUTPUT_SIZE;
    const context = exported.getContext('2d');

    context.save();
    context.beginPath();
    context.arc(OUTPUT_SIZE / 2, OUTPUT_SIZE / 2, OUTPUT_SIZE / 2, 0, Math.PI * 2);
    context.clip();
    context.drawImage(
      image,
      sourceX,
      sourceY,
      sourceSize,
      sourceSize,
      0,
      0,
      OUTPUT_SIZE,
      OUTPUT_SIZE,
    );
    context.restore();

    exported.toBlob((blob) => {
      if (!blob) return;
      if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);

      const url = URL.createObjectURL(blob);
      previewUrlRef.current = url;
      setPreviewUrl(url);
    }, 'image/png');
  };

  return (
    <div className="avatar-demo">
      <header className="avatar-header">
        <p className="avatar-eyebrow">CANVAS 2D · 原生实现</p>
        <h1>头像裁剪</h1>
        <p className="avatar-intro">
          上传一张图片，拖动调整位置、滚轮或滑块缩放，然后裁成 512×512 的圆形头像。
          圆形遮罩用一条带反向圆的路径实现，不会破坏底下的图片。
        </p>
      </header>

      <div className="avatar-toolbar">
        <label className="avatar-file-button">
          选择图片
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            hidden
            onChange={handleFile}
          />
        </label>
        {fileName && <span className="avatar-file-name">{fileName}</span>}

        <label className="avatar-slider">
          <span>缩放</span>
          <input
            type="range"
            min={MIN_ZOOM}
            max={MAX_ZOOM}
            step={0.01}
            value={zoom}
            disabled={!hasImage}
            onChange={(event) => applyZoom(Number(event.target.value))}
          />
          <span className="avatar-slider-value">{Math.round(zoom * 100)}%</span>
        </label>

        <div className="avatar-toolbar__end">
          <button
            type="button"
            className="avatar-button"
            onClick={handleReset}
            disabled={!hasImage}
          >
            重置
          </button>
          <button
            type="button"
            className="avatar-button avatar-button--primary"
            onClick={handleCrop}
            disabled={!hasImage}
          >
            生成预览
          </button>
        </div>
      </div>

      {error && <p className="avatar-error">{error}</p>}

      <div className="avatar-layout">
        <div className="avatar-stage avatar-native-stage" ref={wrapRef}>
          <canvas
            ref={canvasRef}
            className="avatar-canvas"
            aria-label="头像裁剪画布"
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerEnd}
            onPointerCancel={handlePointerEnd}
          />
          {!hasImage && (
            <div className="avatar-placeholder">
              <strong>还没有图片</strong>
              <span>点击上方「选择图片」开始</span>
            </div>
          )}
        </div>

        <aside className="avatar-preview">
          <h2>头像预览</h2>
          {previewUrl ? (
            <>
              <img src={previewUrl} alt="裁剪后的圆形头像预览" />
              <a className="avatar-download" href={previewUrl} download="avatar.png">
                下载 PNG
              </a>
            </>
          ) : (
            <div className="avatar-preview-empty">裁剪结果会显示在这里</div>
          )}
          <p className="avatar-hint">输出 512 × 512，透明背景</p>
        </aside>
      </div>

      <ul className="avatar-notes">
        <li>图片的缩放与偏移都以 canvas 坐标系记录，拖拽和裁剪共用同一套换算。</li>
        <li>圆形遮罩用「矩形 + 逆时针圆」组成路径，靠非零环绕规则挖孔。</li>
        <li>滚轮缩放以指针为锚点，滑块缩放以画布中心为锚点。</li>
        <li>导出时按当前视口反算原图区域，再画到 512×512 的离屏 canvas。</li>
      </ul>
    </div>
  );
}
