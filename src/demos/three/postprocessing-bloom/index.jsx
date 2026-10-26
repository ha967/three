import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { disposeObject3D, disposeRenderer } from '@/three/dispose';
import './index.css';

/**
 * 后处理与辉光 —— 渲染完画面之后，再对整张图做一次加工
 *
 * 普通渲染流程是：
 *   场景 → 渲染器 → canvas
 *
 * 后处理流程是：
 *   场景 → RenderPass → 一张离屏纹理
 *        → UnrealBloomPass（提取高亮区域并模糊）
 *        → OutputPass（色调映射 + 转回 sRGB）
 *        → canvas
 *
 * 关键点：
 * 1. EffectComposer 负责串联多个 Pass，并管理离屏渲染目标；
 * 2. RenderPass 把场景画进纹理，后面的 Pass 处理的是整张图，而不是 3D 物体；
 * 3. UnrealBloomPass 只让亮度超过 threshold 的像素发光；
 * 4. 使用后处理时，色彩空间和色调映射交给 OutputPass 处理。
 *
 * 调整阈值可以观察哪些物体「够亮到发光」，这是理解 bloom 最直观的方式。
 */

const DEFAULT_SETTINGS = {
  enabled: true,
  strength: 0.8,
  radius: 0.35,
  threshold: 1.0,
};

export default function BloomPostprocessingDemo() {
  const hostRef = useRef(null);
  // 保存 composer / bloomPass，供 UI 实时调参
  const liveRef = useRef(null);

  const [enabled, setEnabled] = useState(DEFAULT_SETTINGS.enabled);
  const [strength, setStrength] = useState(DEFAULT_SETTINGS.strength);
  const [radius, setRadius] = useState(DEFAULT_SETTINGS.radius);
  const [threshold, setThreshold] = useState(DEFAULT_SETTINGS.threshold);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return undefined;

    // ── 1. 场景与相机 ─────────────────────────────────────────
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x05060f);

    const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
    camera.position.set(0, 0.6, 8.5);
    camera.lookAt(0, 0, 0);

    // ── 2. 渲染器 ─────────────────────────────────────────────
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    // ACES 色调映射能把高亮部分压回可见范围，辉光看起来更自然。
    // 使用 composer 时，这一步实际由 OutputPass 应用。
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1;
    host.appendChild(renderer.domElement);

    // ── 3. 光照 ───────────────────────────────────────────────
    // 非自发光部分需要一点基础照明；发光效果主要来自材质的 emissive。
    const hemisphereLight = new THREE.HemisphereLight(0x8fb6ff, 0x0a1424, 0.5);
    scene.add(hemisphereLight);

    const keyLight = new THREE.DirectionalLight(0xffffff, 2);
    keyLight.position.set(5, 6, 6);
    scene.add(keyLight);

    // ── 4. 物体 ───────────────────────────────────────────────
    const group = new THREE.Group();
    scene.add(group);

    // 中心的环面结：使用较强的自发光作为主要辉光源
    const knot = new THREE.Mesh(
      new THREE.TorusKnotGeometry(1.35, 0.4, 180, 32),
      new THREE.MeshStandardMaterial({
        color: 0x0b1a33,
        emissive: 0x4f8cff,
        emissiveIntensity: 2.2,
        roughness: 0.25,
        metalness: 0.7,
      }),
    );
    group.add(knot);

    // 三颗小球的发光颜色不同，用于观察 bloom 对高亮像素的提取
    const sphereSpecs = [
      { position: [-2.6, 1.3, 0.4], color: 0x8b5cf6, emissiveIntensity: 1.8 },
      { position: [2.6, -1.1, 0.2], color: 0x14b8a6, emissiveIntensity: 2.0 },
      { position: [1.8, 1.9, -1.2], color: 0xf59e0b, emissiveIntensity: 2.2 },
    ];

    sphereSpecs.forEach((spec) => {
      const sphere = new THREE.Mesh(
        new THREE.SphereGeometry(0.42, 32, 16),
        new THREE.MeshStandardMaterial({
          color: 0x0a1424,
          emissive: spec.color,
          emissiveIntensity: spec.emissiveIntensity,
          roughness: 0.2,
          metalness: 0.5,
        }),
      );
      sphere.position.set(...spec.position);
      group.add(sphere);
    });

    // ── 5. 后处理管线 ─────────────────────────────────────────
    // composer 内部有两个渲染目标（ping-pong），每个 Pass 的输出写到其中一个，
    // 下一个 Pass 再把它当作输入。resize 时必须同步 composer 的尺寸。
    const composer = new EffectComposer(renderer);

    // RenderPass：正常渲染场景，结果写进离屏纹理
    const renderPass = new RenderPass(scene, camera);
    composer.addPass(renderPass);

    // UnrealBloomPass：参数依次是分辨率、强度、半径、阈值
    const bloomPass = new UnrealBloomPass(
      new THREE.Vector2(1, 1), // 真实分辨率在 resize 里由 composer.setSize 设置
      DEFAULT_SETTINGS.strength,
      DEFAULT_SETTINGS.radius,
      DEFAULT_SETTINGS.threshold,
    );
    composer.addPass(bloomPass);

    // OutputPass：把线性空间的结果做色调映射并转换到 sRGB 输出
    composer.addPass(new OutputPass());

    liveRef.current = {
      composer,
      bloomPass,
      enabled: DEFAULT_SETTINGS.enabled,
    };

    // ── 6. 尺寸适配 ───────────────────────────────────────────
    const resize = () => {
      const width = host.clientWidth;
      const height = host.clientHeight;
      if (width < 1 || height < 1) return;

      camera.aspect = width / height;
      camera.updateProjectionMatrix();

      // renderer 和 composer 都要跟着改，否则画面会被拉伸或裁切
      renderer.setSize(width, height);
      composer.setSize(width, height);
    };

    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(host);

    // ── 7. 渲染循环 ───────────────────────────────────────────
    const timer = new THREE.Timer();
    timer.connect(document);
    let frameId = 0;

    const animate = (timestamp) => {
      timer.update(timestamp);
      const delta = timer.getDelta();

      knot.rotation.x += delta * 0.25;
      knot.rotation.y += delta * 0.35;
      group.rotation.y += delta * 0.08;

      // 开关辉光时切换整条管线：
      // 开启 → composer（RenderPass + Bloom + OutputPass）
      // 关闭 → 直接渲染，方便对比后处理带来的差异
      if (liveRef.current.enabled) {
        composer.render();
      } else {
        renderer.render(scene, camera);
      }

      frameId = requestAnimationFrame(animate);
    };

    frameId = requestAnimationFrame(animate);

    // ── 8. 清理 ───────────────────────────────────────────────
    return () => {
      cancelAnimationFrame(frameId);
      timer.dispose();
      observer.disconnect();
      liveRef.current = null;
      // bloomPass 自己持有额外的渲染目标，需要单独释放
      bloomPass.dispose();
      composer.dispose();
      disposeObject3D(scene);
      disposeRenderer(renderer);
      renderer.domElement.remove();
    };
  }, []);

  const handleEnabledChange = (event) => {
    const checked = event.target.checked;
    setEnabled(checked);
    if (liveRef.current) {
      liveRef.current.enabled = checked;
    }
  };

  const handleStrengthChange = (event) => {
    const value = Number(event.target.value);
    setStrength(value);
    if (liveRef.current) {
      liveRef.current.bloomPass.strength = value;
    }
  };

  const handleRadiusChange = (event) => {
    const value = Number(event.target.value);
    setRadius(value);
    if (liveRef.current) {
      liveRef.current.bloomPass.radius = value;
    }
  };

  const handleThresholdChange = (event) => {
    const value = Number(event.target.value);
    setThreshold(value);
    if (liveRef.current) {
      liveRef.current.bloomPass.threshold = value;
    }
  };

  return (
    <div className="three-demo">
      <header className="three-header">
        <p className="three-eyebrow">THREE.JS · 07 后处理</p>
        <h1>后处理与辉光</h1>
        <p className="three-intro">
          EffectComposer 把场景先渲染到离屏纹理，再依次经过辉光和输出处理。
          拖动阈值可以看到「多亮的像素才会发光」，关闭辉光则回到普通渲染。
        </p>
      </header>

      <div className="three-stage" role="img" aria-label="带有蓝色辉光的环面结和彩色发光小球">
        <div className="three-canvas-host" ref={hostRef} />
      </div>

      <div className="three-controls">
        <label className="three-control three-control--check">
          <input type="checkbox" checked={enabled} onChange={handleEnabledChange} />
          <span>启用辉光</span>
        </label>

        <label className="three-control">
          <span>强度</span>
          <input
            type="range"
            min="0"
            max="3"
            step="0.05"
            value={strength}
            onChange={handleStrengthChange}
          />
          <output>{strength.toFixed(2)}</output>
        </label>

        <label className="three-control">
          <span>半径</span>
          <input
            type="range"
            min="0"
            max="1"
            step="0.05"
            value={radius}
            onChange={handleRadiusChange}
          />
          <output>{radius.toFixed(2)}</output>
        </label>

        <label className="three-control">
          <span>阈值</span>
          <input
            type="range"
            min="0"
            max="2"
            step="0.05"
            value={threshold}
            onChange={handleThresholdChange}
          />
          <output>{threshold.toFixed(2)}</output>
        </label>
      </div>

      <ul className="three-notes">
        <li>后处理处理的是整张画面，不是单个物体，所以无法只让某个物体发光。</li>
        <li>UnrealBloomPass 先提取亮度超过 threshold 的像素，再做多级模糊叠加。</li>
        <li>使用 composer 时，渲染器的色调映射由 OutputPass 负责，顺序不能颠倒。</li>
        <li>resize 时 renderer.setSize 和 composer.setSize 必须同时调用。</li>
        <li>composer 和 bloomPass 都持有渲染目标，卸载时要分别 dispose。</li>
      </ul>
    </div>
  );
}
