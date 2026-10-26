import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { disposeObject3D, disposeRenderer } from '@/three/dispose';
import './index.css';

/**
 * 射线拾取 —— 让鼠标「点到」3D 物体
 *
 * 核心知识点：
 * 1. 鼠标坐标是相对视口的像素，Raycaster 需要的是 NDC（-1 ~ 1）：
 *      x = (clientX - rect.left) / rect.width * 2 - 1
 *      y = -((clientY - rect.top) / rect.height * 2 - 1)
 * 2. raycaster.setFromCamera(pointer, camera) 从相机发出射线；
 * 3. intersectObjects 返回按距离排序的交点数组，取第一个就是最近的物体；
 * 4. 悬停与选中只是改材质 emissive 和 React 状态，不改变场景结构。
 *
 * 这个 demo 没有使用 OrbitControls：固定相机能让「点击」和「拖动视角」
 * 互不干扰，便于把注意力放在拾取本身。需要轨道控制时可以叠加，
 * 但要额外区分拖动与点击（比较 pointerdown 与 pointerup 的位移）。
 */

const HOVER_EMISSIVE = 0x1d4ed8;
const SELECTED_EMISSIVE = 0x7c3aed;
const NO_EMISSIVE = 0x000000;

/** 可拾取的物体配置：几何体在下面根据描述创建 */
const OBJECT_SPECS = [
  {
    name: '立方体',
    geometry: () => new THREE.BoxGeometry(1.4, 1.4, 1.4),
    color: 0x4f8cff,
    position: [-2.8, 0.7, 0.2],
    info: 'BoxGeometry · 边长 1.4 · roughness 0.3',
  },
  {
    name: '球体',
    geometry: () => new THREE.SphereGeometry(0.85, 32, 16),
    color: 0x8b5cf6,
    position: [-0.9, 0.85, 0.9],
    info: 'SphereGeometry · 32 × 16 分段 · metalness 0.6',
  },
  {
    name: '圆环',
    geometry: () => new THREE.TorusGeometry(0.6, 0.22, 16, 48),
    color: 0x14b8a6,
    position: [1.0, 1.0, 0.1],
    rotationY: -0.4,
    info: 'TorusGeometry · 主半径 0.6 · 管半径 0.22',
  },
  {
    name: '圆锥',
    geometry: () => new THREE.ConeGeometry(0.7, 1.9, 32),
    color: 0xf59e0b,
    position: [2.8, 0.95, -0.3],
    info: 'ConeGeometry · 32 边 · 高 1.9',
  },
];

export default function RaycasterPickDemo() {
  const hostRef = useRef(null);

  const [hoveredName, setHoveredName] = useState(null);
  const [selectedInfo, setSelectedInfo] = useState(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return undefined;

    // ── 1. 场景与相机 ─────────────────────────────────────────
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0a1120);

    const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
    camera.position.set(0, 4.6, 9);
    camera.lookAt(0, 1, 0);

    // ── 2. 渲染器与阴影 ───────────────────────────────────────
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    host.appendChild(renderer.domElement);

    // ── 3. 光照 ───────────────────────────────────────────────
    const hemisphereLight = new THREE.HemisphereLight(0xbcd7ff, 0x0a1424, 0.9);
    scene.add(hemisphereLight);

    const sun = new THREE.DirectionalLight(0xffffff, 3);
    sun.position.set(5, 8, 6);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    const shadowCamera = sun.shadow.camera;
    shadowCamera.left = -7;
    shadowCamera.right = 7;
    shadowCamera.top = 7;
    shadowCamera.bottom = -7;
    shadowCamera.near = 0.5;
    shadowCamera.far = 30;
    shadowCamera.updateProjectionMatrix();
    sun.shadow.bias = -0.0005;
    scene.add(sun);

    // ── 4. 地面与网格 ─────────────────────────────────────────
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(20, 20),
      new THREE.MeshStandardMaterial({ color: 0x1a2436, roughness: 0.95 }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    scene.add(ground);

    const grid = new THREE.GridHelper(20, 20, 0x3d4d66, 0x24314a);
    grid.position.y = 0.005;
    scene.add(grid);

    // ── 5. 可拾取物体 ─────────────────────────────────────────
    // pickables 只包含这些物体，地面和网格不参与拾取，
    // 这样点击空白处就能可靠地清空选中状态。
    const pickables = [];

    OBJECT_SPECS.forEach((spec) => {
      const material = new THREE.MeshStandardMaterial({
        color: spec.color,
        roughness: 0.35,
        metalness: 0.25,
        // emissive 初始为黑色，悬停 / 选中时再点亮
        emissive: NO_EMISSIVE,
        emissiveIntensity: 0.9,
      });

      const mesh = new THREE.Mesh(spec.geometry(), material);
      mesh.position.set(...spec.position);
      if (spec.rotationY) {
        mesh.rotation.y = spec.rotationY;
      }
      mesh.castShadow = true;
      mesh.receiveShadow = true;

      // 把业务数据挂在 mesh.userData 上，拾取结果可以直接读出来
      mesh.userData.name = spec.name;
      mesh.userData.info = spec.info;

      pickables.push(mesh);
      scene.add(mesh);
    });

    // ── 6. 射线拾取相关状态 ───────────────────────────────────
    const raycaster = new THREE.Raycaster();
    // pointer 是 NDC 坐标：x/y 都在 -1 ~ 1 之间
    const pointer = new THREE.Vector2(0, 0);
    let pointerInside = false;
    let hovered = null;
    // selected 只在 Three.js 侧使用；面板内容另存在 React state 里
    let selected = null;

    /**
     * 根据悬停 / 选中状态刷新一个物体的自发光颜色。
     * 选中优先级高于悬停。
     */
    const refreshEmissive = (mesh) => {
      let color = NO_EMISSIVE;
      if (mesh === selected) {
        color = SELECTED_EMISSIVE;
      } else if (mesh === hovered) {
        color = HOVER_EMISSIVE;
      }
      mesh.material.emissive.setHex(color);
    };

    /**
     * 把鼠标像素坐标换算成 NDC。
     * 注意 y 轴要取反：浏览器向下为正，NDC 向上为正。
     */
    const updatePointer = (event) => {
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
      pointerInside = true;
    };

    /**
     * 从当前 pointer 发出射线，返回最近的物体（没有则 null）。
     */
    const pick = () => {
      raycaster.setFromCamera(pointer, camera);
      const intersections = raycaster.intersectObjects(pickables, false);
      return intersections.length > 0 ? intersections[0].object : null;
    };

    const handlePointerMove = (event) => {
      updatePointer(event);
    };

    const handlePointerLeave = () => {
      pointerInside = false;

      // 鼠标离开画布时清掉悬停高亮，但保留选中状态
      if (hovered) {
        const previous = hovered;
        hovered = null;
        refreshEmissive(previous);
        setHoveredName(null);
        renderer.domElement.style.cursor = '';
      }
    };

    const handleClick = (event) => {
      updatePointer(event);
      const hit = pick();

      if (hit === selected) return;

      selected = hit;
      // 旧的选中物体和全部物体都刷一遍，保证颜色状态正确
      pickables.forEach(refreshEmissive);

      setSelectedInfo(hit ? { name: hit.userData.name, info: hit.userData.info } : null);
    };

    const canvas = renderer.domElement;
    canvas.addEventListener('pointermove', handlePointerMove);
    canvas.addEventListener('pointerleave', handlePointerLeave);
    canvas.addEventListener('click', handleClick);

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
    // 悬停检测放在每帧里做：相机不动时结果稳定，而且不需要在
    // pointermove 里高频触发 React 更新。只有命中的物体变化时才 setState。
    let frameId = 0;

    const animate = () => {
      if (pointerInside) {
        const hit = pick();

        if (hit !== hovered) {
          const previous = hovered;
          hovered = hit;

          if (previous) refreshEmissive(previous);
          if (hovered) refreshEmissive(hovered);

          setHoveredName(hovered ? hovered.userData.name : null);
          canvas.style.cursor = hovered ? 'pointer' : '';
        }
      }

      renderer.render(scene, camera);
      frameId = requestAnimationFrame(animate);
    };

    frameId = requestAnimationFrame(animate);

    // ── 9. 清理 ───────────────────────────────────────────────
    return () => {
      cancelAnimationFrame(frameId);
      observer.disconnect();
      canvas.removeEventListener('pointermove', handlePointerMove);
      canvas.removeEventListener('pointerleave', handlePointerLeave);
      canvas.removeEventListener('click', handleClick);
      canvas.style.cursor = '';
      disposeObject3D(scene);
      disposeRenderer(renderer);
      canvas.remove();
    };
  }, []);

  return (
    <div className="three-demo">
      <header className="three-header">
        <p className="three-eyebrow">THREE.JS · 06 拾取</p>
        <h1>射线拾取</h1>
        <p className="three-intro">
          把鼠标位置换算成 NDC 坐标，从相机发出一条射线，找到最近的物体。
          悬停时物体发光，点击后右下角显示几何信息，点击空白处取消。
        </p>
      </header>

      <div className="three-stage" role="img" aria-label="四个可点击的 3D 几何体">
        <div className="three-canvas-host" ref={hostRef} />

        {hoveredName && (
          <p className="raycast-hover" aria-hidden="true">
            {hoveredName}
          </p>
        )}

        {selectedInfo && (
          <aside className="raycast-info" aria-live="polite">
            <p className="raycast-info-name">{selectedInfo.name}</p>
            <p className="raycast-info-detail">{selectedInfo.info}</p>
          </aside>
        )}

        <p className="three-stage-hint">点击物体查看信息 · 点击空白处取消</p>
      </div>

      <ul className="three-notes">
        <li>NDC 坐标：x、y 都在 -1 ~ 1，y 轴方向与浏览器屏幕坐标相反。</li>
        <li>intersectObjects 返回按距离升序排列的数组，第 0 个就是最近的交点。</li>
        <li>只把需要交互的物体放进数组，地面和网格不参与拾取。</li>
        <li>悬停状态在渲染循环里检测，只在命中物体变化时才触发 React 更新。</li>
      </ul>
    </div>
  );
}
