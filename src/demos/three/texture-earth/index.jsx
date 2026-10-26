import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { disposeObject3D, disposeRenderer } from '@/three/dispose';
import './index.css';

/**
 * 纹理与地球 —— 把一张平面图片裹到球面上
 *
 * 核心知识点：
 * 1. TextureLoader：从 URL 加载图片，得到 Texture 对象；
 * 2. 色彩空间：贴图是 sRGB 图片，必须设置 texture.colorSpace = SRGBColorSpace，
 *    否则颜色会被当成线性数据，画面明显偏灰/偏亮；
 * 3. UV 映射：SphereGeometry 自带 uv 属性，u 绕赤道一圈 0→1，v 从南极到北极 0→1；
 * 4. 等距圆柱投影：世界地图的 x 对应经度、y 对应纬度，正好适合包成球；
 * 5. 各向异性过滤（anisotropy）：斜着看球面时，让纹理更清晰。
 *
 * 贴图是 public/textures/earth-map.svg，由仓库自己维护，不依赖外部网络。
 * 球体外的线框球用于观察经纬网的分布，可以在控制条里打开。
 */

const EARTH_TEXTURE_URL = '/textures/earth-map.svg';

/** 地球半径，相机距离、线框球半径都以它为基准 */
const EARTH_RADIUS = 2;

const DEFAULT_SETTINGS = {
  autoRotate: true,
  showGrid: false,
  sunIntensity: 3,
};

export default function TextureEarthDemo() {
  const hostRef = useRef(null);
  // 保存运行时可调的对象（太阳光、自转组、线框球）
  const liveRef = useRef(null);

  const [status, setStatus] = useState('loading'); // loading | ready | error
  const [textureSize, setTextureSize] = useState(null);
  const [autoRotate, setAutoRotate] = useState(DEFAULT_SETTINGS.autoRotate);
  const [showGrid, setShowGrid] = useState(DEFAULT_SETTINGS.showGrid);
  const [sunIntensity, setSunIntensity] = useState(DEFAULT_SETTINGS.sunIntensity);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return undefined;

    // 标记组件是否已经卸载 / 重新挂载。
    // 图片是异步加载的，回来时组件可能已经不在了，回调里要先检查这个标记。
    let disposed = false;

    // ── 1. 场景与相机 ─────────────────────────────────────────
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x050b18);

    const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
    camera.position.set(0, 0.8, 6.5);

    // ── 2. 渲染器 ─────────────────────────────────────────────
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    host.appendChild(renderer.domElement);

    // ── 3. 轨道控制器 ─────────────────────────────────────────
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(0, 0, 0);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.enablePan = false; // 地球始终在画面中心，禁用平移避免误操作
    controls.minDistance = 3.2;
    controls.maxDistance = 12;
    controls.update();

    // ── 4. 加载纹理 ───────────────────────────────────────────
    // TextureLoader.load 会立刻返回一个空的 Texture 对象，
    // 图片加载完成后自动填充 image，并触发 onLoad 回调。
    const textureLoader = new THREE.TextureLoader();
    const earthTexture = textureLoader.load(
      EARTH_TEXTURE_URL,
      (loadedTexture) => {
        if (disposed) return;
        // SVG 被浏览器栅格化后的实际像素尺寸，用来在页面上展示
        const image = loadedTexture.image;
        setTextureSize({
          width: image?.naturalWidth || image?.width || 0,
          height: image?.naturalHeight || image?.height || 0,
        });
        setStatus('ready');
      },
      undefined, // 加载进度回调：本地 SVG 很快，这里不需要
      () => {
        if (!disposed) setStatus('error');
      },
    );

    // 关键：告诉 Three.js 这张图是 sRGB 编码的。
    // 渲染器内部使用线性空间计算光照，读取贴图时要先转成线性；
    // 输出到屏幕时再转回 sRGB。少了这一步，地球会看起来发灰。
    earthTexture.colorSpace = THREE.SRGBColorSpace;

    // 各向异性过滤：相机斜看球面时，纹理采样会更清晰。
    // 上限由显卡决定，这里直接取最大值。
    earthTexture.anisotropy = renderer.capabilities.getMaxAnisotropy();

    // 经度方向首尾相接，重复寻址可以避免 UV 恰好等于 1 时的采样问题
    earthTexture.wrapS = THREE.RepeatWrapping;
    earthTexture.wrapT = THREE.ClampToEdgeWrapping;

    // ── 5. 地球 ───────────────────────────────────────────────
    // 分段数越高球面越圆，但顶点和纹理采样也越多。
    // 经度方向给足分段（96），纬度方向 48 已经足够平滑。
    const earthGeometry = new THREE.SphereGeometry(EARTH_RADIUS, 96, 48);
    const earthMaterial = new THREE.MeshStandardMaterial({
      map: earthTexture,
      roughness: 0.85, // 表面偏粗糙，避免整颗球像塑料
      metalness: 0,
    });
    const earth = new THREE.Mesh(earthGeometry, earthMaterial);

    // 线框球：半径略大一点，叠在地球外面，用来观察 SphereGeometry 的经纬网。
    // 默认隐藏，由控制条切换。
    const gridGeometry = new THREE.SphereGeometry(EARTH_RADIUS * 1.002, 48, 24);
    const gridMaterial = new THREE.MeshBasicMaterial({
      wireframe: true,
      color: 0x7dd3fc,
      transparent: true,
      opacity: 0.16,
      depthWrite: false, // 线框不写深度，避免和球面互相遮挡产生闪烁
    });
    const gridSphere = new THREE.Mesh(gridGeometry, gridMaterial);
    gridSphere.visible = DEFAULT_SETTINGS.showGrid;

    // 自转组：只绕自身 y 轴旋转；
    // 外层 tilt 组负责地轴倾角，两层分开才能做出「倾斜着自转」的效果。
    const spin = new THREE.Group();
    spin.add(earth, gridSphere);

    const tilt = new THREE.Group();
    tilt.rotation.z = THREE.MathUtils.degToRad(23.5); // 地轴倾角约 23.5°
    tilt.add(spin);
    scene.add(tilt);

    // 大气辉光：用一个略大的球 + 背面渲染 + 加法混合，
    // 只在地球边缘露出淡淡的一圈蓝色。
    const atmosphere = new THREE.Mesh(
      new THREE.SphereGeometry(EARTH_RADIUS * 1.08, 64, 32),
      new THREE.MeshBasicMaterial({
        color: 0x3b82f6,
        transparent: true,
        opacity: 0.1,
        side: THREE.BackSide,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    );
    scene.add(atmosphere);

    // ── 6. 光照 ───────────────────────────────────────────────
    // 半球光模拟地球周围的环境反射，让背光面不至于全黑
    const hemisphereLight = new THREE.HemisphereLight(0xbcd7ff, 0x0a1424, 0.7);
    scene.add(hemisphereLight);

    // 平行光模拟太阳
    const sun = new THREE.DirectionalLight(0xfff4e0, DEFAULT_SETTINGS.sunIntensity);
    sun.position.set(5, 3, 5);
    scene.add(sun);

    liveRef.current = {
      sun,
      spin,
      gridSphere,
      autoRotate: DEFAULT_SETTINGS.autoRotate,
    };

    // ── 7. 尺寸适配 ───────────────────────────────────────────
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

    // ── 8. 渲染循环 ───────────────────────────────────────────
    const timer = new THREE.Timer();
    timer.connect(document);
    let frameId = 0;

    const animate = (timestamp) => {
      timer.update(timestamp);
      const delta = timer.getDelta();

      // 自转速度用秒计算，和刷新率无关
      if (liveRef.current.autoRotate) {
        spin.rotation.y += delta * 0.15;
      }

      controls.update();
      renderer.render(scene, camera);

      frameId = requestAnimationFrame(animate);
    };

    frameId = requestAnimationFrame(animate);

    // ── 9. 清理 ───────────────────────────────────────────────
    return () => {
      disposed = true;
      cancelAnimationFrame(frameId);
      timer.dispose();
      observer.disconnect();
      controls.dispose();
      liveRef.current = null;
      // 贴图挂在材质上，disposeObject3D 会一并释放
      disposeObject3D(scene);
      disposeRenderer(renderer);
      renderer.domElement.remove();
    };
  }, []);

  // ── UI 事件 ───────────────────────────────────────────────

  const handleAutoRotateChange = (event) => {
    const checked = event.target.checked;
    setAutoRotate(checked);
    if (liveRef.current) {
      liveRef.current.autoRotate = checked;
    }
  };

  const handleShowGridChange = (event) => {
    const checked = event.target.checked;
    setShowGrid(checked);
    if (liveRef.current) {
      liveRef.current.gridSphere.visible = checked;
    }
  };

  const handleSunIntensityChange = (event) => {
    const value = Number(event.target.value);
    setSunIntensity(value);
    if (liveRef.current) {
      liveRef.current.sun.intensity = value;
    }
  };

  return (
    <div className="three-demo">
      <header className="three-header">
        <p className="three-eyebrow">THREE.JS · 03 纹理</p>
        <h1>纹理与地球</h1>
        <p className="three-intro">
          用 TextureLoader 加载一张等距圆柱投影的世界地图，贴到球体上。旋转视角可以看到 UV
          如何把平面图片裹成球面；打开线框可以对照经纬网。
        </p>
      </header>

      <div className="three-stage" role="img" aria-label="一颗缓慢自转、带大气辉光的地球">
        <div className="three-canvas-host" ref={hostRef} />

        {status === 'loading' && (
          <div className="three-overlay">
            <p>正在加载地球纹理…</p>
          </div>
        )}

        {status === 'error' && (
          <div className="three-overlay three-overlay--error">
            <p>纹理加载失败。</p>
            <p>请检查 public/textures/earth-map.svg 是否存在。</p>
          </div>
        )}

        <p className="three-stage-hint">拖动旋转视角 · 滚轮缩放</p>
      </div>

      <div className="three-controls">
        <label className="three-control three-control--check">
          <input type="checkbox" checked={autoRotate} onChange={handleAutoRotateChange} />
          <span>自动自转</span>
        </label>

        <label className="three-control three-control--check">
          <input type="checkbox" checked={showGrid} onChange={handleShowGridChange} />
          <span>显示经纬网</span>
        </label>

        <label className="three-control">
          <span>太阳强度</span>
          <input
            type="range"
            min="0"
            max="6"
            step="0.1"
            value={sunIntensity}
            onChange={handleSunIntensityChange}
          />
          <output>{sunIntensity.toFixed(1)}</output>
        </label>
      </div>

      {textureSize && (
        <div className="three-stats">
          <span>
            纹理尺寸 <strong>{textureSize.width}</strong> × <strong>{textureSize.height}</strong>
          </span>
          <span>色彩空间 sRGB</span>
          <span>投影方式 等距圆柱</span>
        </div>
      )}

      <ul className="three-notes">
        <li>TextureLoader.load 立即返回 Texture，图片加载完成后才真正可用。</li>
        <li>颜色贴图必须设置 colorSpace = SRGBColorSpace，否则整体会偏灰。</li>
        <li>SphereGeometry 的 u 绕赤道一圈，v 从南极到北极，和地图的经纬度一一对应。</li>
        <li>线框球比地球略大，depthWrite 关闭以避免和球面闪烁。</li>
      </ul>
    </div>
  );
}
