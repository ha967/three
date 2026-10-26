import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { disposeObject3D, disposeRenderer } from '@/three/dispose';
import './index.css';

/**
 * 粒子星空 —— 用一份 BufferGeometry 画出成千上万个点
 *
 * 核心知识点：
 * 1. BufferGeometry：直接管理顶点属性数组（position / color），
 *    比一个个 Mesh 高效得多——几万个点只需要 1 次绘制调用；
 * 2. Points + PointsMaterial：点没有面，只按屏幕像素大小渲染；
 * 3. 顶点颜色：把 color 写进顶点属性并开启 vertexColors，每个点颜色不同；
 * 4. 增量更新：改变粒子数量时换掉 geometry，而不是重建整个场景。
 *
 * 星点分布在一个球壳里，相机位于球壳内部，
 * 所以无论往哪个方向看都能看到星星。
 */

const DEFAULT_COUNT = 6000;
const MIN_COUNT = 1000;
const MAX_COUNT = 20000;

/** 球壳内半径与外半径 */
const INNER_RADIUS = 9;
const OUTER_RADIUS = 34;

const DEFAULT_SETTINGS = {
  count: DEFAULT_COUNT,
  size: 0.12,
  autoRotate: true,
};

/**
 * 生成一颗星空几何体。
 *
 * 每个点需要两组数据：
 * - position：xyz 三个浮点数
 * - color：rgb 三个浮点数（0~1）
 * 两组数据都放进 Float32Array，再交给 BufferAttribute。
 */
function createStarGeometry(count) {
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const color = new THREE.Color();

  for (let i = 0; i < count; i += 1) {
    // 球面均匀采样：对 cos(phi) 均匀取值，避免两极过密
    const radius = INNER_RADIUS + Math.random() * (OUTER_RADIUS - INNER_RADIUS);
    const theta = Math.random() * Math.PI * 2; // 经度
    const phi = Math.acos(2 * Math.random() - 1); // 极角

    const sinPhi = Math.sin(phi);

    positions[i * 3] = radius * sinPhi * Math.cos(theta);
    positions[i * 3 + 1] = radius * Math.cos(phi);
    positions[i * 3 + 2] = radius * sinPhi * Math.sin(theta);

    // 色相集中在蓝白区间，少量偏暖色的星星让画面不单调。
    // HSL 的取值：h 0~1、s 0~1、l 0~1。
    const hue = Math.random() < 0.85 ? 0.55 + Math.random() * 0.08 : 0.1;
    color.setHSL(hue, 0.35 + Math.random() * 0.4, 0.65 + Math.random() * 0.3);

    colors[i * 3] = color.r;
    colors[i * 3 + 1] = color.g;
    colors[i * 3 + 2] = color.b;
  }

  // 几何体只描述数据，不涉及材质；同一个 geometry 可以给多个 Points 使用
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  // 预先计算包围球，渲染器做视锥剔除时就不用每帧重算
  geometry.computeBoundingSphere();

  return geometry;
}

/**
 * 生成一张 64 × 64 的径向渐变贴图。
 *
 * PointsMaterial 默认把每个点画成正方形，近处会看到明显的方块。
 * 用一张「中心不透明、边缘透明」的贴图作为 map，
 * 方形点就会变成圆形柔边光点。
 * CanvasTexture 和普通图片贴图一样，颜色贴图要标记为 sRGB。
 */
function createStarTexture() {
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;

  const context = canvas.getContext('2d');
  const gradient = context.createRadialGradient(
    size / 2,
    size / 2,
    0,
    size / 2,
    size / 2,
    size / 2,
  );
  gradient.addColorStop(0, 'rgba(255, 255, 255, 1)');
  gradient.addColorStop(0.35, 'rgba(255, 255, 255, 0.85)');
  gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');

  context.fillStyle = gradient;
  context.fillRect(0, 0, size, size);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

export default function ParticleStarsDemo() {
  const hostRef = useRef(null);
  const liveRef = useRef(null);

  const [count, setCount] = useState(DEFAULT_SETTINGS.count);
  const [size, setSize] = useState(DEFAULT_SETTINGS.size);
  const [autoRotate, setAutoRotate] = useState(DEFAULT_SETTINGS.autoRotate);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return undefined;

    // ── 1. 场景与相机 ─────────────────────────────────────────
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x02040a);

    const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 200);
    camera.position.set(0, 0, 16);

    // ── 2. 渲染器 ─────────────────────────────────────────────
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    host.appendChild(renderer.domElement);

    // ── 3. 轨道控制器 ─────────────────────────────────────────
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(0, 0, 0);
    controls.enableDamping = true;
    controls.dampingFactor = 0.06;
    controls.enablePan = false;
    controls.minDistance = 3;
    controls.maxDistance = 32;
    controls.update();

    // ── 4. 材质与粒子 ─────────────────────────────────────────
    // PointsMaterial 是不受光照影响的点材质：
    // - sizeAttenuation：远处的点更小，产生透视感；
    // - vertexColors：从 geometry 的 color 属性读取每个点的颜色；
    // - AdditiveBlending：颜色叠加，重叠的星点会更亮，像发光；
    // - depthWrite: false：点之间不互相遮挡，避免透明排序问题。
    const material = new THREE.PointsMaterial({
      size: DEFAULT_SETTINGS.size,
      sizeAttenuation: true,
      vertexColors: true,
      map: createStarTexture(),
      transparent: true,
      opacity: 0.95,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });

    const points = new THREE.Points(createStarGeometry(DEFAULT_SETTINGS.count), material);
    scene.add(points);

    // 换数量时只替换 geometry：旧的立即释放，新的挂到同一个 Points 上。
    // 这样材质、场景层级、动画状态都不用重建。
    liveRef.current = {
      material,
      autoRotate: DEFAULT_SETTINGS.autoRotate,
      setCount: (nextCount) => {
        points.geometry.dispose();
        points.geometry = createStarGeometry(nextCount);
      },
    };

    // ── 5. 尺寸适配 ───────────────────────────────────────────
    const resize = () => {
      const width = host.clientWidth;
      const height = host.clientHeight;
      if (width < 1 || height < 1) return;

      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height);
    };

    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(host);

    // ── 6. 渲染循环 ───────────────────────────────────────────
    const timer = new THREE.Timer();
    timer.connect(document);
    let frameId = 0;

    const animate = (timestamp) => {
      timer.update(timestamp);
      const delta = timer.getDelta();
      // getElapsed 返回从创建 Timer 开始累计的秒数
      const elapsed = timer.getElapsed();

      // 整个星空缓慢旋转，模拟地球自转带来的视差
      if (liveRef.current.autoRotate) {
        points.rotation.y += delta * 0.012;
      }

      // 轻微的整体明暗呼吸，让画面不至于完全静止
      material.opacity = 0.85 + Math.sin(elapsed * 1.2) * 0.1;

      controls.update();
      renderer.render(scene, camera);

      frameId = requestAnimationFrame(animate);
    };

    frameId = requestAnimationFrame(animate);

    // ── 7. 清理 ───────────────────────────────────────────────
    return () => {
      cancelAnimationFrame(frameId);
      timer.dispose();
      observer.disconnect();
      controls.dispose();
      liveRef.current = null;
      disposeObject3D(scene);
      disposeRenderer(renderer);
      renderer.domElement.remove();
    };
  }, []);

  const handleCountChange = (event) => {
    const nextCount = Number(event.target.value);
    setCount(nextCount);
    // 新几何体的生成可能有一点耗时，但只在拖动结束时才需要频繁重建。
    // 这里按 input 事件实时重建，数量上限 20000，仍在可接受范围内。
    if (liveRef.current) {
      liveRef.current.setCount(nextCount);
    }
  };

  const handleSizeChange = (event) => {
    const value = Number(event.target.value);
    setSize(value);
    if (liveRef.current) {
      liveRef.current.material.size = value;
    }
  };

  const handleAutoRotateChange = (event) => {
    const checked = event.target.checked;
    setAutoRotate(checked);
    if (liveRef.current) {
      liveRef.current.autoRotate = checked;
    }
  };

  return (
    <div className="three-demo">
      <header className="three-header">
        <p className="three-eyebrow">THREE.JS · 05 粒子</p>
        <h1>粒子星空</h1>
        <p className="three-intro">
          用 BufferGeometry 存放数千个点的位置和颜色，交给一个 Points 对象渲染。
          无论粒子数量多少，都只产生一次绘制调用。拖动可以环顾星空。
        </p>
      </header>

      <div className="three-stage" role="img" aria-label="由数千个彩色光点组成的旋转星空">
        <div className="three-canvas-host" ref={hostRef} />
        <p className="three-stage-hint">拖动环顾 · 滚轮缩放</p>
      </div>

      <div className="three-controls">
        <label className="three-control">
          <span>粒子数量</span>
          <input
            type="range"
            min={MIN_COUNT}
            max={MAX_COUNT}
            step="500"
            value={count}
            onChange={handleCountChange}
          />
          <output>{count.toLocaleString()}</output>
        </label>

        <label className="three-control">
          <span>粒子大小</span>
          <input
            type="range"
            min="0.03"
            max="0.4"
            step="0.01"
            value={size}
            onChange={handleSizeChange}
          />
          <output>{size.toFixed(2)}</output>
        </label>

        <label className="three-control three-control--check">
          <input type="checkbox" checked={autoRotate} onChange={handleAutoRotateChange} />
          <span>自动旋转</span>
        </label>
      </div>

      <div className="three-stats">
        <span>
          顶点数 <strong>{count.toLocaleString()}</strong>
        </span>
        <span>
          绘制调用 <strong>1</strong>
        </span>
        <span>材质 PointsMaterial</span>
      </div>

      <ul className="three-notes">
        <li>PointsMaterial 默认把点画成方块，用径向渐变的 CanvasTexture 可以做出圆形柔边。</li>
        <li>position 与 color 都是 Float32Array，按 xyz 三元组连续存放。</li>
        <li>球面均匀采样要对 cos(phi) 取随机数，直接对极角取随机数会让两极过密。</li>
        <li>PointsMaterial 不受光照影响；AdditiveBlending 让重叠的星点叠加变亮。</li>
        <li>调整数量时只替换 geometry 并 dispose 旧数据，场景和材质保持不变。</li>
      </ul>
    </div>
  );
}
