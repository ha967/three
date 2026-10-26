import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { disposeObject3D, disposeRenderer } from '@/three/dispose';
import './index.css';

/**
 * glTF 模型加载 —— 把美术做好的 3D 资源放进场景
 *
 * 核心流程：
 * 1. GLTFLoader.load 异步加载 .gltf（以及它的 .bin 和贴图）；
 * 2. 用 Box3 测量模型尺寸，缩放到统一大小，并让底部落在地面上；
 * 3. 根据尺寸调整相机和 OrbitControls 的目标点；
 * 4. 遍历模型统计网格、材质、三角形数量。
 *
 * 本例使用的是 public/models/city 下的城市模型（CC-BY-4.0），
 * 底部标注了作者与许可，使用时请保留。
 *
 * 注意事项：
 * - glTF 里的贴图由 GLTFLoader 自动设置色彩空间，不需要手动改；
 * - 模型可能由成百上千个 Mesh 组成，加载后不要逐个设置 transform，
 *   而是整体放进一个 Group 统一缩放和定位；
 * - 组件卸载时不仅要释放场景，还要考虑「加载回调晚于卸载」的情况。
 */

const MODEL_URL = '/models/city/scene.gltf';

/** 模型缩放后最长边的目标尺寸（世界单位） */
const TARGET_SIZE = 12;

export default function GltfModelDemo() {
  const hostRef = useRef(null);
  // 保存控制器，供「自动旋转」开关修改
  const liveRef = useRef(null);

  const [status, setStatus] = useState('loading'); // loading | ready | error
  const [progress, setProgress] = useState(0);
  const [loadedBytes, setLoadedBytes] = useState(0);
  const [totalBytes, setTotalBytes] = useState(0);
  const [stats, setStats] = useState(null);
  const [errorMessage, setErrorMessage] = useState('');
  const [autoRotate, setAutoRotate] = useState(true);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return undefined;

    // 异步加载可能在组件卸载后才完成，用这个标记拦截后续操作
    let disposed = false;

    // ── 1. 场景与相机 ─────────────────────────────────────────
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x070c16);

    const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 500);
    // 模型加载完成前先给一个临时机位，加载后会根据模型尺寸重新计算
    camera.position.set(14, 10, 18);

    // ── 2. 渲染器 ─────────────────────────────────────────────
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    host.appendChild(renderer.domElement);

    // ── 3. 轨道控制器 ─────────────────────────────────────────
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(0, 2, 0);
    controls.enableDamping = true;
    controls.dampingFactor = 0.06;
    // OrbitControls 自己就能让相机绕目标点缓慢旋转，不用手动改相机位置
    controls.autoRotate = true;
    controls.autoRotateSpeed = 0.6;
    controls.update();

    // ── 4. 光照 ───────────────────────────────────────────────
    // 城市模型面数多，这里不开启阴影，避免每帧多出一倍的绘制调用。
    const hemisphereLight = new THREE.HemisphereLight(0xcfe3ff, 0x0b1220, 1.2);
    scene.add(hemisphereLight);

    const sun = new THREE.DirectionalLight(0xffffff, 2.8);
    sun.position.set(12, 18, 10);
    scene.add(sun);

    // ── 5. 地面参考网格 ───────────────────────────────────────
    const grid = new THREE.GridHelper(30, 30, 0x33507a, 0x1e2f4a);
    grid.position.y = 0.01;
    scene.add(grid);

    // ── 6. 加载模型 ───────────────────────────────────────────
    const loader = new GLTFLoader();
    const loadStart = performance.now();

    loader.load(
      MODEL_URL,
      (gltf) => {
        // 组件已经卸载：把刚加载进来的模型直接释放，不要碰场景
        if (disposed) {
          disposeObject3D(gltf.scene);
          return;
        }

        // 先整体放进一个 Group，后续所有缩放、位移都作用在 Group 上，
        // 不会破坏模型内部自带的节点变换。
        const city = new THREE.Group();
        city.add(gltf.scene);

        // Box3 能算出模型在世界坐标中的包围盒
        const box = new THREE.Box3().setFromObject(city);
        const size = box.getSize(new THREE.Vector3());
        const center = box.getCenter(new THREE.Vector3());

        // 用最长边计算缩放比例，让不同来源的模型都能适配同一个场景
        const scale = TARGET_SIZE / Math.max(size.x, size.y, size.z);
        city.scale.setScalar(scale);

        // 缩放后包围盒中心变成 center * scale。
        // 把 x/z 居中到原点，把底部（min.y）抬到 y = 0，模型就站在地面上了。
        city.position.set(-center.x * scale, -box.min.y * scale, -center.z * scale);

        scene.add(city);

        // 统计模型结构：网格数量、材质数量、三角形数量
        let meshCount = 0;
        let triangleCount = 0;
        const materials = new Set();

        gltf.scene.traverse((object) => {
          if (!object.isMesh) return;

          meshCount += 1;

          const geometry = object.geometry;
          if (geometry.index) {
            // 索引几何体：每 3 个索引组成一个三角形
            triangleCount += geometry.index.count / 3;
          } else if (geometry.attributes.position) {
            triangleCount += geometry.attributes.position.count / 3;
          }

          const materialList = Array.isArray(object.material) ? object.material : [object.material];
          materialList.forEach((material) => materials.add(material));
        });

        const normalizedSize = size.clone().multiplyScalar(scale);
        const radius = Math.max(normalizedSize.x, normalizedSize.z) / 2;
        const distance = radius * 2.2;

        // 根据模型尺寸重新摆相机，保证整个城市都在画面里
        camera.position.set(distance * 0.75, distance * 0.55, distance * 1.0);
        controls.target.set(0, normalizedSize.y * 0.35, 0);
        controls.minDistance = distance * 0.25;
        controls.maxDistance = distance * 3;
        controls.update();

        setStats({
          meshCount,
          materialCount: materials.size,
          triangleCount: Math.round(triangleCount),
          loadMs: Math.round(performance.now() - loadStart),
        });
        setStatus('ready');
      },
      (event) => {
        if (disposed) return;

        // event.total 在服务器返回 Content-Length 时才有值
        if (event.total > 0) {
          setTotalBytes(event.total);
          setLoadedBytes(event.loaded);
          setProgress((event.loaded / event.total) * 100);
        }
      },
      (error) => {
        if (disposed) return;
        console.error(error);
        setErrorMessage(error?.message || '未知错误');
        setStatus('error');
      },
    );

    liveRef.current = { controls, autoRotate: true };

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
    let frameId = 0;

    const animate = () => {
      // autoRotate 和 damping 都依赖 update()
      controls.update();
      renderer.render(scene, camera);
      frameId = requestAnimationFrame(animate);
    };

    frameId = requestAnimationFrame(animate);

    // ── 9. 清理 ───────────────────────────────────────────────
    return () => {
      disposed = true;
      cancelAnimationFrame(frameId);
      observer.disconnect();
      controls.dispose();
      liveRef.current = null;
      // 模型已经 add 进 scene，这里会一并释放它的几何体、材质和贴图
      disposeObject3D(scene);
      disposeRenderer(renderer);
      renderer.domElement.remove();
    };
  }, []);

  const handleAutoRotateChange = (event) => {
    const checked = event.target.checked;
    setAutoRotate(checked);
    if (liveRef.current) {
      liveRef.current.controls.autoRotate = checked;
    }
  };

  const loadedMB = (loadedBytes / 1024 / 1024).toFixed(1);
  const totalMB = (totalBytes / 1024 / 1024).toFixed(1);

  return (
    <div className="three-demo">
      <header className="three-header">
        <p className="three-eyebrow">THREE.JS · 04 模型</p>
        <h1>glTF 模型加载</h1>
        <p className="three-intro">
          用 GLTFLoader 加载一个包含 1300 多个网格的城市模型，测量包围盒后统一缩放、落位，
          再根据尺寸自动摆放相机。右下角可以看到加载耗时和模型规模。
        </p>
      </header>

      <div className="three-stage" role="img" aria-label="一座自动旋转展示的 3D 城市模型">
        <div className="three-canvas-host" ref={hostRef} />

        {status === 'loading' && (
          <div className="three-overlay">
            <p>{totalBytes > 0 ? `正在加载模型 ${loadedMB} / ${totalMB} MB` : '正在加载模型…'}</p>
            <div
              className="three-progress"
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(progress)}
            >
              <div className="three-progress-bar" style={{ width: `${progress}%` }} />
            </div>
          </div>
        )}

        {status === 'error' && (
          <div className="three-overlay three-overlay--error">
            <p>模型加载失败：{errorMessage}</p>
            <p>请确认 public/models/city/scene.gltf 及贴图目录完整。</p>
          </div>
        )}

        <p className="three-stage-hint">拖动旋转视角 · 滚轮缩放</p>
      </div>

      <div className="three-controls">
        <label className="three-control three-control--check">
          <input type="checkbox" checked={autoRotate} onChange={handleAutoRotateChange} />
          <span>相机自动环绕</span>
        </label>
      </div>

      {stats && (
        <div className="three-stats">
          <span>
            网格 <strong>{stats.meshCount.toLocaleString()}</strong>
          </span>
          <span>
            材质 <strong>{stats.materialCount}</strong>
          </span>
          <span>
            三角形 <strong>{stats.triangleCount.toLocaleString()}</strong>
          </span>
          <span>
            加载耗时 <strong>{stats.loadMs}</strong> ms
          </span>
        </div>
      )}

      <p className="three-credit">
        This work is based on{' '}
        <a
          href="https://sketchfab.com/3d-models/ccity-building-set-1-a2d5c7bfcc2148fb8994864c43dfcc97"
          target="_blank"
          rel="noreferrer"
        >
          “CCity Building Set 1”
        </a>{' '}
        by Neberkenezer, licensed under{' '}
        <a href="http://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noreferrer">
          CC-BY-4.0
        </a>
        .
      </p>

      <ul className="three-notes">
        <li>GLTFLoader 会自动加载 .gltf 引用的 .bin 和贴图，并设置好色彩空间。</li>
        <li>Box3 测量包围盒后统一缩放到目标尺寸，再让底部落到 y = 0。</li>
        <li>整体缩放通过外层 Group 完成，不破坏模型内部节点的变换。</li>
        <li>大量网格的场景默认不开阴影，避免阴影 pass 让绘制调用翻倍。</li>
      </ul>
    </div>
  );
}
