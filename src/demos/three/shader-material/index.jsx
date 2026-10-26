import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { disposeObject3D, disposeRenderer } from '@/three/dispose';
import './index.css';

/**
 * ShaderMaterial 入门 —— 自己写顶点着色器和片段着色器
 *
 * 普通材质（MeshStandardMaterial 等）是 Three.js 预先写好的着色器，
 * 我们只能通过参数调整。ShaderMaterial 允许直接提供 GLSL 代码，
 * 从而做出内置材质做不到的效果。
 *
 * 两条着色器的分工：
 * - 顶点着色器（vertexShader）：每个顶点执行一次，
 *   负责把顶点从模型空间变换到裁剪空间，可以在这里修改顶点位置；
 * - 片段着色器（fragmentShader）：每个像素执行一次，
 *   负责决定这个像素最终是什么颜色。
 *
 * 两者之间用 varying 传值：顶点着色器算出的 elevation 会被插值后传进片段着色器，
 * 于是高低起伏自然变成颜色渐变。
 *
 * 内置变量（ShaderMaterial 会自动提供，不用声明）：
 * - position：顶点在模型空间的坐标（attribute）
 * - modelMatrix / viewMatrix / projectionMatrix：各种变换矩阵
 * - modelViewMatrix：viewMatrix * modelMatrix
 *
 * 注意：ShaderMaterial 默认不参与光照计算（lights: false），
 * 所以场景里不需要放灯，颜色完全由我们自己的代码决定。
 */

const PLANE_WIDTH = 7;
const PLANE_HEIGHT = 4.5;
const SEGMENTS_X = 160;
const SEGMENTS_Y = 100;
const VERTEX_COUNT = (SEGMENTS_X + 1) * (SEGMENTS_Y + 1);

// GLSL 里的注释用英文，避免个别驱动对非 ASCII 注释兼容性不佳；
// 中文解释放在 JS 注释里。
const vertexShader = /* glsl */ `
  // 从 JS 传进来的 uniform：每帧更新
  uniform float uTime;
  uniform float uAmplitude;
  uniform float uFrequency;

  // 传给片段着色器：每个顶点的「高度」
  varying float vElevation;

  void main() {
    // position 是顶点在模型空间中的坐标，先复制一份，避免修改内置变量
    vec3 transformed = position;

    // 两组不同方向、不同速度的正弦波叠加，避免形成呆板的正方形网格
    float elevation =
      sin(transformed.x * uFrequency + uTime) * 0.5 +
      cos(transformed.y * uFrequency * 0.8 + uTime * 0.7) * 0.5;

    // 沿 z 轴（朝向相机）起伏
    transformed.z += elevation * uAmplitude * 2.0;

    // elevation 的取值范围是 -1 ~ 1
    vElevation = elevation;

    // 顶点必须经过 MVP 变换才能出现在屏幕上
    gl_Position = projectionMatrix * modelViewMatrix * vec4(transformed, 1.0);
  }
`;

const fragmentShader = /* glsl */ `
  uniform vec3 uColorA;
  uniform vec3 uColorB;

  // 顶点着色器传来的高度，已被 GPU 在三角形内部插值
  varying float vElevation;

  void main() {
    // 把 -1 ~ 1 映射到 0 ~ 1，作为两种颜色之间的混合比例
    float mixStrength = (vElevation + 1.0) * 0.5;
    vec3 color = mix(uColorA, uColorB, mixStrength);

    gl_FragColor = vec4(color, 1.0);

    // 渲染器在内部使用线性空间，输出到屏幕前要转回 sRGB。
    // 内置材质会自动包含这一步，自定义着色器需要手动加上。
    #include <colorspace_fragment>
  }
`;

/** 控制条可调参数的初始值 */
const DEFAULT_SETTINGS = {
  amplitude: 0.45,
  frequency: 2.4,
};

export default function ShaderMaterialDemo() {
  const hostRef = useRef(null);
  // 保存材质与控制器，供 UI 实时改 uniform
  const liveRef = useRef(null);

  const [amplitude, setAmplitude] = useState(DEFAULT_SETTINGS.amplitude);
  const [frequency, setFrequency] = useState(DEFAULT_SETTINGS.frequency);
  const [wireframe, setWireframe] = useState(false);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return undefined;

    // ── 1. 场景与相机 ─────────────────────────────────────────
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x05070f);

    const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
    camera.position.set(0, 0, 7.6);
    camera.lookAt(0, 0, 0);

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
    controls.enablePan = false;
    controls.minDistance = 4.5;
    controls.maxDistance = 12;
    // 限制俯仰角，避免转到平面正侧面或背面
    controls.minPolarAngle = Math.PI / 2 - 0.4;
    controls.maxPolarAngle = Math.PI / 2 + 0.4;
    controls.update();

    // ── 4. 几何体与着色器材质 ─────────────────────────────────
    // 分段数决定顶点密度：顶点越多，波浪越平滑，但顶点着色器的执行次数也越多。
    // 160 × 100 大约是 1.6 万个顶点，对入门 demo 足够平滑。
    const geometry = new THREE.PlaneGeometry(PLANE_WIDTH, PLANE_HEIGHT, SEGMENTS_X, SEGMENTS_Y);

    const material = new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader,
      uniforms: {
        // uTime 每帧更新，驱动波浪运动
        uTime: { value: 0 },
        uAmplitude: { value: DEFAULT_SETTINGS.amplitude },
        uFrequency: { value: DEFAULT_SETTINGS.frequency },
        // 颜色会从 sRGB 自动转换到线性空间（Three.js 颜色管理）
        uColorA: { value: new THREE.Color('#1d4ed8') },
        uColorB: { value: new THREE.Color('#22d3ee') },
      },
      // 平面默认只有正面可见；单面渲染更省一点，也方便观察背面
      side: THREE.FrontSide,
      wireframe: false,
    });

    const plane = new THREE.Mesh(geometry, material);
    scene.add(plane);

    liveRef.current = { material, controls };

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
      // 累计秒数，驱动顶点着色器里的波浪相位
      const elapsed = timer.getElapsed();

      // 把累计时间写进 uniform，顶点着色器里所有顶点都读同一个值
      material.uniforms.uTime.value = elapsed;

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

  const handleAmplitudeChange = (event) => {
    const value = Number(event.target.value);
    setAmplitude(value);
    if (liveRef.current) {
      liveRef.current.material.uniforms.uAmplitude.value = value;
    }
  };

  const handleFrequencyChange = (event) => {
    const value = Number(event.target.value);
    setFrequency(value);
    if (liveRef.current) {
      liveRef.current.material.uniforms.uFrequency.value = value;
    }
  };

  const handleWireframeChange = (event) => {
    const checked = event.target.checked;
    setWireframe(checked);
    if (liveRef.current) {
      liveRef.current.material.wireframe = checked;
    }
  };

  return (
    <div className="three-demo">
      <header className="three-header">
        <p className="three-eyebrow">THREE.JS · 09 着色器</p>
        <h1>ShaderMaterial 入门</h1>
        <p className="three-intro">
          顶点着色器用两组正弦波给平面做出起伏，片段着色器按高度混合两种颜色。 拖动振幅和频率观察
          uniform 如何实时改变 GPU 的计算结果，打开线框可以看到顶点密度。
        </p>
      </header>

      <div className="three-stage" role="img" aria-label="一个由正弦波驱动、蓝青渐变起伏的平面">
        <div className="three-canvas-host" ref={hostRef} />
        <p className="three-stage-hint">拖动旋转视角 · 滚轮缩放</p>
      </div>

      <div className="three-controls">
        <label className="three-control">
          <span>振幅</span>
          <input
            type="range"
            min="0"
            max="1"
            step="0.02"
            value={amplitude}
            onChange={handleAmplitudeChange}
          />
          <output>{amplitude.toFixed(2)}</output>
        </label>

        <label className="three-control">
          <span>频率</span>
          <input
            type="range"
            min="0.5"
            max="6"
            step="0.1"
            value={frequency}
            onChange={handleFrequencyChange}
          />
          <output>{frequency.toFixed(1)}</output>
        </label>

        <label className="three-control three-control--check">
          <input type="checkbox" checked={wireframe} onChange={handleWireframeChange} />
          <span>线框模式</span>
        </label>
      </div>

      <div className="three-stats">
        <span>
          顶点数 <strong>{VERTEX_COUNT.toLocaleString()}</strong>
        </span>
        <span>uniform 3 个</span>
        <span>varying 1 个</span>
      </div>

      <ul className="three-notes">
        <li>顶点着色器每个顶点执行一次，片段着色器每个像素执行一次。</li>
        <li>varying 变量从顶点着色器传到片段着色器，在三角形内部由 GPU 自动插值。</li>
        <li>uniform 是所有顶点/像素共享的只读值，适合传时间、振幅、颜色。</li>
        <li>ShaderMaterial 自动提供 position、projectionMatrix 等内置变量。</li>
        <li>自定义片段着色器要手动 include colorspace_fragment，否则颜色偏暗。</li>
      </ul>
    </div>
  );
}
