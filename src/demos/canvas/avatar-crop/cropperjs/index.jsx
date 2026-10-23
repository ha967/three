import { useEffect, useRef, useState } from 'react';
import Cropper from 'cropperjs';
import 'cropperjs/dist/cropper.css';
import './index.css';

/**
 * 头像裁剪（cropperjs 实现）
 *
 * 和原生版的区别：
 * - 原生版：自己处理拖拽、缩放、遮罩和导出；
 * - cropperjs：把图片交给库，库负责裁剪框、拖拽、缩放和控制点。
 *
 * 这里重点观察：
 * 1. Cropper 实例的生命周期要跟图片 src 绑定，切换图片时要先 destroy；
 * 2. 库虽然封装了交互，但上传、object URL 回收、预览下载仍然要自己处理；
 * 3. getCroppedCanvas 的 rounded 选项可以直接输出圆形 PNG。
 */

const OUTPUT_SIZE = 512;

export default function AvatarCropCropperDemo() {
  const imageRef = useRef(null);
  const cropperRef = useRef(null);
  // 上传原图的 object URL
  const sourceUrlRef = useRef(null);
  // 裁剪结果的 object URL
  const previewUrlRef = useRef(null);

  const [imageUrl, setImageUrl] = useState('');
  const [imageReady, setImageReady] = useState(false);
  const [fileName, setFileName] = useState('');
  const [zoomRatio, setZoomRatio] = useState(1);
  const [previewUrl, setPreviewUrl] = useState('');
  const [error, setError] = useState('');

  /**
   * 图片变化时创建 Cropper，卸载或换图时销毁。
   * 每次 new Cropper 都会生成额外的 DOM 和事件监听，
   * 不 destroy 就会泄漏，也会和新的实例打架。
   *
   * 必须等图片 onLoad 之后再初始化，否则 Cropper 读不到 naturalWidth。
   */
  useEffect(() => {
    if (!imageUrl || !imageReady || !imageRef.current) return undefined;

    const cropper = new Cropper(imageRef.current, {
      aspectRatio: 1, // 头像固定 1:1
      viewMode: 1, // 裁剪框不能超出图片
      dragMode: 'move', // 默认拖动图片，而不是重新画裁剪框
      autoCropArea: 0.85,
      background: false,
      responsive: true,
      guides: true,
      center: true,
      cropBoxMovable: true,
      cropBoxResizable: true,
      toggleDragModeOnDblclick: false,
      // 用户滚轮缩放时同步显示比例
      zoom(event) {
        setZoomRatio(event.detail.ratio);
      },
    });

    cropperRef.current = cropper;

    return () => {
      cropper.destroy();
      cropperRef.current = null;
    };
  }, [imageUrl, imageReady]);

  // 卸载时释放所有 object URL
  useEffect(
    () => () => {
      if (sourceUrlRef.current) URL.revokeObjectURL(sourceUrlRef.current);
      if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
    },
    [],
  );

  const handleFile = (event) => {
    const file = event.target.files?.[0];
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
    setImageReady(false);
    setImageUrl(url);
    setFileName(file.name);
    setPreviewUrl('');
    setZoomRatio(1);
  };

  const handleZoom = (ratio) => {
    cropperRef.current?.zoom(ratio);
  };

  const handleRotate = () => {
    cropperRef.current?.rotate(90);
  };

  const handleReset = () => {
    cropperRef.current?.reset();
    setZoomRatio(1);
  };

  /**
   * 生成圆形头像。
   * rounded: true 会让 Cropper 按圆形裁剪，四个角是透明的。
   */
  const handleCrop = () => {
    const cropper = cropperRef.current;
    if (!cropper) return;

    const cropped = cropper.getCroppedCanvas({
      width: OUTPUT_SIZE,
      height: OUTPUT_SIZE,
      rounded: true,
      imageSmoothingQuality: 'high',
    });

    cropped.toBlob((blob) => {
      if (!blob) return;
      if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);

      const url = URL.createObjectURL(blob);
      previewUrlRef.current = url;
      setPreviewUrl(url);
    }, 'image/png');
  };

  const hasImage = Boolean(imageUrl);

  return (
    <div className="avatar-demo">
      <header className="avatar-header">
        <p className="avatar-eyebrow">CANVAS 2D · CROPPERJS 实现</p>
        <h1>头像裁剪（cropperjs）</h1>
        <p className="avatar-intro">
          同样的功能改用 cropperjs：裁剪框、拖拽、滚轮缩放和旋转都由库处理，
          最后通过 getCroppedCanvas 直接得到圆形头像。
        </p>
      </header>

      <div className="avatar-toolbar">
        <label className="avatar-file-button">
          选择图片
          <input type="file" accept="image/*" hidden onChange={handleFile} />
        </label>
        {fileName && <span className="avatar-file-name">{fileName}</span>}

        <span className="avatar-zoom-hint">缩放 {Math.round(zoomRatio * 100)}%</span>

        <div className="avatar-toolbar__end">
          <button
            type="button"
            className="avatar-button"
            onClick={() => handleZoom(0.1)}
            disabled={!hasImage}
          >
            放大
          </button>
          <button
            type="button"
            className="avatar-button"
            onClick={() => handleZoom(-0.1)}
            disabled={!hasImage}
          >
            缩小
          </button>
          <button
            type="button"
            className="avatar-button"
            onClick={handleRotate}
            disabled={!hasImage}
          >
            旋转 90°
          </button>
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
        <div className="avatar-stage avatar-cropper-stage">
          {hasImage ? (
            <img
              ref={imageRef}
              src={imageUrl}
              alt="待裁剪的头像原图"
              onLoad={() => setImageReady(true)}
            />
          ) : (
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
              <a className="avatar-download" href={previewUrl} download="avatar-cropper.png">
                下载 PNG
              </a>
            </>
          ) : (
            <div className="avatar-preview-empty">裁剪结果会显示在这里</div>
          )}
          <p className="avatar-hint">输出 512 × 512，圆形透明背景</p>
        </aside>
      </div>

      <ul className="avatar-notes">
        <li>Cropper 实例与图片 src 绑定：换图或卸载时先 destroy，避免监听和 DOM 泄漏。</li>
        <li>viewMode: 1 限制裁剪框不能超出图片范围；aspectRatio: 1 固定头像比例。</li>
        <li>rounded: true 让 getCroppedCanvas 直接输出圆形裁剪结果。</li>
        <li>库只负责图片编辑，文件选择、URL 回收、预览和下载仍需自己实现。</li>
      </ul>
    </div>
  );
}
