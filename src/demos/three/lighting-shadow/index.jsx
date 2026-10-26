import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { disposeObject3D, disposeRenderer } from '@/three/dispose';
import './index.css';

/**
 * 光照与阴影 —— 让场景「立起来」的关键一步
 *
 * 这个 demo 在旋转立方体的基础上增加了：
 * 1. 平行光（DirectionalLight）作为主光，半球光（HemisphereLight）补环境光；
 * 2. 地面接收阴影，物体投射阴影（castShadow / receiveShadow）；
 * 3. OrbitControls：鼠标拖动旋转视角、滚轮缩放；
 * 4. 几个可调参数，用来观察光强和阴影对画面的影响。
 *
 * 关于阴影，先记住三件事：
 * - renderer.shadowMap.enabled 必须打开，这是总开关；
 * - 物体设置 castShadow，地面设置 receiveShadow，缺一不可；
 * - 平行光的阴影使用正交相机「拍」场景，范围要手动包住所有物体，
 *   否则阴影会在边缘被裁掉。
 */

// 默认参数集中放在这里：
// React 的初始 state 和 Three.js 场景初始化都读取同一份数值，避免两边不一致。
const DEFAULT_SETTINGS = {
  keyIntensity: 3.2, // 平行光强度
  ambientIntensity: 1.0, // 半球光（环境补光）强度
  shadows: true, // 是否投射阴影
  lightOrbit: true, // 光源是否绕场景自动旋转
};

/** 地面与网格的边长，光源旋转半径也参考它 */
const GROUND_SIZE = 16;

export default function LightingShadowDemo() {
  // 挂载 WebGL canvas 的容器
  const hostRef = useRef(null);
  // 保存场景里的关键对象，供 UI 控件在运行时直接修改。
  // 这些对象不参与 React 渲染，所以用 ref 而不是 state。
  const liveRef = useRef(null);

  // UI 状态：控件显示什么，就存在这里
  const [keyIntensity, setKeyIntensity] = useState(DEFAULT_SETTINGS.keyIntensity);
  const [ambientIntensity, setAmbientIntensity] = useState(DEFAULT_SETTINGS.ambientIntensity);
  const [shadows, setShadows] = useState(DEFAULT_SETTINGS.shadows);
  const [lightOrbit, setLightOrbit] = useState(DEFAULT_SETTINGS.lightOrbit);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return undefined;

    // ── 1. 场景与相机 ─────────────────────────────────────────
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0b1220);

    const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
    camera.position.set(6.2, 4.6, 8);
    camera.lookAt(0, 1, 0);

    // ── 2. 渲染器与阴影总开关 ─────────────────────────────────
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    // 打开阴影渲染。不开这个开关，下面所有 castShadow / receiveShadow 都不会生效。
    renderer.shadowMap.enabled = true;
    // PCFSoftShadowMap 会对阴影边缘做多次采样，看起来更柔和，开销略高。
    // 其他选项：BasicShadowMap（硬边、最快）、PCFShadowMap（默认）。
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    host.appendChild(renderer.domElement);

    // ── 3. 轨道控制器 ─────────────────────────────────────────
    // OrbitControls 监听鼠标 / 触摸事件，围绕目标点旋转相机。
    // 它改变的是相机位置，所以必须在 resize 时保持同一台相机。
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(0, 1, 0); // 围绕场景中心偏上的位置旋转
    controls.enableDamping = true; // 松开鼠标后有一点惯性，手感更顺滑
    controls.dampingFactor = 0.08;
    controls.minDistance = 4;
    controls.maxDistance = 18;
    // 限制俯仰角，避免相机钻到地面以下看到背面
    controls.maxPolarAngle = Math.PI / 2 - 0.04;
    controls.update();

    // ── 4. 光照 ───────────────────────────────────────────────
    // 半球光：天空色照向物体上方，地面色照向下方，模拟环境反射。
    // 比 AmbientLight 更有方向感，暗部不会完全一样亮。
    const hemisphereLight = new THREE.HemisphereLight(
      0x9ec5ff, // 天空颜色
      0x1a2436, // 地面颜色
      DEFAULT_SETTINGS.ambientIntensity,
    );
    scene.add(hemisphereLight);

    // 平行光：主光源，负责制造明暗对比和阴影
    const keyLight = new THREE.DirectionalLight(0xffffff, DEFAULT_SETTINGS.keyIntensity);
    keyLight.position.set(6, 8, 6);
    keyLight.castShadow = DEFAULT_SETTINGS.shadows;

    // 阴影贴图分辨率：越高越清晰，但显存和绘制开销也更大。
    // 1024 × 1024 对这类小场景已经足够。
    keyLight.shadow.mapSize.set(1024, 1024);

    // 平行光的阴影相机是正交相机，必须手动指定它覆盖的范围。
    // 范围越大，同样分辨率下每个物体分到的阴影像素越少，阴影越糊。
    const shadowCamera = keyLight.shadow.camera;
    shadowCamera.left = -9;
    shadowCamera.right = 9;
    shadowCamera.top = 9;
    shadowCamera.bottom = -9;
    shadowCamera.near = 0.5;
    shadowCamera.far = 30;
    shadowCamera.updateProjectionMatrix();

    // 消除「阴影痤疮」：物体表面自己投到自己身上形成的条纹。
    // bias 是深度偏移，数值需要根据场景尺度微调。
    keyLight.shadow.bias = -0.0005;

    scene.add(keyLight);

    // 用一个发光小球标出平行光的位置，方便观察光源旋转时阴影怎么变化。
    // 它只是视觉提示，不参与光照计算，也不投射阴影。
    const lightMarker = new THREE.Mesh(
      new THREE.SphereGeometry(0.1, 16, 8),
      new THREE.MeshBasicMaterial({ color: 0xfff1b8 }),
    );
    lightMarker.position.copy(keyLight.position);
    scene.add(lightMarker);

    // ── 5. 地面与网格 ─────────────────────────────────────────
    // PlaneGeometry 默认立在 XY 平面，绕 X 轴转 -90° 后变成水平地面。
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(GROUND_SIZE, GROUND_SIZE),
      new THREE.MeshStandardMaterial({
        color: 0x223047,
        roughness: 0.95,
        metalness: 0,
      }),
    );
    ground.rotation.x = -Math.PI / 2;
    // 地面只接收阴影，不投射阴影
    ground.receiveShadow = true;
    scene.add(ground);

    // 网格辅助线帮助判断空间位置和光源移动。稍微抬高一点，避免和地面 z-fighting。
    const grid = new THREE.GridHelper(GROUND_SIZE, GROUND_SIZE, 0x3d4d66, 0x2a3547);
    grid.position.y = 0.005;
    scene.add(grid);

    // ── 6. 物体 ───────────────────────────────────────────────
    // 三个物体使用不同的粗糙度和金属度，方便观察材质对光照的响应。
    const cube = new THREE.Mesh(
      new THREE.BoxGeometry(1.4, 1.4, 1.4),
      new THREE.MeshStandardMaterial({ color: 0x4f8cff, roughness: 0.3, metalness: 0.25 }),
    );
    cube.position.set(-2.4, 0.7, 0.4);
    cube.rotation.y = 0.5;
    cube.castShadow = true;
    // 物体之间也能互相接收阴影，例如立方体挡住光线时会在球体上留下影子
    cube.receiveShadow = true;
    scene.add(cube);

    const sphere = new THREE.Mesh(
      new THREE.SphereGeometry(0.85, 32, 16),
      new THREE.MeshStandardMaterial({ color: 0x8b5cf6, roughness: 0.15, metalness: 0.6 }),
    );
    sphere.position.set(0, 0.85, 1.1);
    sphere.castShadow = true;
    sphere.receiveShadow = true;
    scene.add(sphere);

    // 圆环默认立在 XY 平面，底部到圆心距离 = 主半径 + 管半径 = 0.75 + 0.26
    const torus = new THREE.Mesh(
      new THREE.TorusGeometry(0.75, 0.26, 16, 48),
      new THREE.MeshStandardMaterial({ color: 0x14b8a6, roughness: 0.45, metalness: 0.1 }),
    );
    torus.position.set(2.3, 1.05, -0.4);
    torus.rotation.y = -0.5;
    torus.castShadow = true;
    torus.receiveShadow = true;
    scene.add(torus);

    // 把需要在动画循环 / UI 事件里访问的对象集中起来。
    // lightOrbit 是普通布尔值，不是 React state 的镜像：
    // 动画循环直接读它，UI 切换时由事件处理函数修改。
    liveRef.current = {
      keyLight,
      hemisphereLight,
      lightOrbit: DEFAULT_SETTINGS.lightOrbit,
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
    // Timer 的 delta 以秒为单位，保证动画速度与刷新率无关
    const timer = new THREE.Timer();
    timer.connect(document);
    let orbitAngle = 0;
    let frameId = 0;

    const animate = (timestamp) => {
      timer.update(timestamp);
      const delta = timer.getDelta();

      // 光源绕场景中心旋转：用 cos / sin 算出圆周上的位置。
      // 平行光只看方向，所以移动它的位置就能改变光照方向，阴影也会跟着转。
      // 角度只在开启时累加，关闭再打开时光源会从当前位置继续转，而不是跳变。
      if (liveRef.current.lightOrbit) {
        orbitAngle += delta * 0.35;
        keyLight.position.set(Math.cos(orbitAngle) * 7, 8, Math.sin(orbitAngle) * 7);
        lightMarker.position.copy(keyLight.position);
      }

      // 让立方体和圆环缓慢自转，观察动态阴影的变化
      cube.rotation.y += delta * 0.5;
      torus.rotation.z += delta * 0.4;

      // 开启 damping 后，必须在每帧调用 update()，惯性才会持续生效
      controls.update();
      renderer.render(scene, camera);

      frameId = requestAnimationFrame(animate);
    };

    frameId = requestAnimationFrame(animate);

    // ── 9. 清理 ───────────────────────────────────────────────
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

  // ── UI 事件：同时更新 React state 和 Three.js 里的实时对象 ──
  // 为什么不把 state 直接写进动画循环？
  // 因为创建场景的 useEffect 只执行一次，循环里读到的是创建时的旧 state（闭包陷阱）。
  // 用 ref 持有实时对象、由事件直接修改，是最直观的做法。

  const handleKeyIntensityChange = (event) => {
    const value = Number(event.target.value);
    setKeyIntensity(value);
    if (liveRef.current) {
      liveRef.current.keyLight.intensity = value;
    }
  };

  const handleAmbientIntensityChange = (event) => {
    const value = Number(event.target.value);
    setAmbientIntensity(value);
    if (liveRef.current) {
      liveRef.current.hemisphereLight.intensity = value;
    }
  };

  const handleShadowsChange = (event) => {
    const checked = event.target.checked;
    setShadows(checked);
    if (liveRef.current) {
      // castShadow 控制主光源是否生成阴影贴图；地面和物体的标志位保持不变，
      // 所以重新打开时阴影会立刻恢复。
      liveRef.current.keyLight.castShadow = checked;
    }
  };

  const handleLightOrbitChange = (event) => {
    const checked = event.target.checked;
    setLightOrbit(checked);
    if (liveRef.current) {
      liveRef.current.lightOrbit = checked;
    }
  };

  return (
    <div className="three-demo">
      <header className="three-header">
        <p className="three-eyebrow">THREE.JS · 02 光照与阴影</p>
        <h1>光照与阴影</h1>
        <p className="three-intro">
          平行光提供主光和阴影，半球光补亮暗部，地面接收阴影。拖动旋转视角、滚轮缩放，
          也可以调整光强或关闭阴影，观察画面如何变化。
        </p>
      </header>

      <div className="three-stage" role="img" aria-label="一个由平行光照亮并投射阴影的 3D 场景">
        <div className="three-canvas-host" ref={hostRef} />
        <p className="three-stage-hint">拖动旋转视角 · 滚轮缩放</p>
      </div>

      <div className="three-controls">
        <label className="three-control">
          <span>平行光强度</span>
          <input
            type="range"
            min="0"
            max="6"
            step="0.1"
            value={keyIntensity}
            onChange={handleKeyIntensityChange}
          />
          <output>{keyIntensity.toFixed(1)}</output>
        </label>

        <label className="three-control">
          <span>环境光强度</span>
          <input
            type="range"
            min="0"
            max="2"
            step="0.05"
            value={ambientIntensity}
            onChange={handleAmbientIntensityChange}
          />
          <output>{ambientIntensity.toFixed(2)}</output>
        </label>

        <label className="three-control three-control--check">
          <input type="checkbox" checked={shadows} onChange={handleShadowsChange} />
          <span>投射阴影</span>
        </label>

        <label className="three-control three-control--check">
          <input type="checkbox" checked={lightOrbit} onChange={handleLightOrbitChange} />
          <span>光源旋转</span>
        </label>
      </div>

      <ul className="three-notes">
        <li>renderer.shadowMap.enabled 是阴影总开关；物体设 castShadow，地面设 receiveShadow。</li>
        <li>平行光的阴影相机是正交相机，left / right / top / bottom 必须包住整个场景。</li>
        <li>阴影贴图分辨率越高越清晰，但显存和每帧开销也会同步增加。</li>
        <li>OrbitControls 开启阻尼后，需要每帧调用 controls.update() 惯性才会持续。</li>
      </ul>
    </div>
  );
}
