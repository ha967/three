import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { disposeObject3D, disposeRenderer } from '@/three/dispose';
import './index.css';

/**
 * 实例化渲染 —— 上万个相同几何体，一次绘制调用画完
 *
 * 普通做法：每个立方体一个 Mesh，10000 个物体就是 10000 次绘制调用，
 * CPU 光是把命令发给 GPU 就忙不过来。
 *
 * 实例化渲染：同一份 geometry + material，配合每个实例自己的变换矩阵和颜色，
 * 显卡一次就能画完。InstancedMesh 就是 Three.js 对这个能力的封装。
 *
 * 核心知识点：
 * 1. new InstancedMesh(geometry, material, count) 预先分配实例数量；
 * 2. setMatrixAt(i, matrix) 写入第 i 个实例的变换；
 * 3. setColorAt(i, color) 写入第 i 个实例的颜色；
 * 4. instanceMatrix / instanceColor 都是 BufferAttribute，改完要设 needsUpdate。
 */

const DEFAULT_COUNT = 2500;
const MIN_COUNT = 200;
const MAX_COUNT = 10000;

/** 散布范围：x/z 都在 -FIELD_SIZE/2 ~ FIELD_SIZE/2 之间 */
const FIELD_SIZE = 18;

/** 确定性伪随机：同一个 index 每次得到相同的值，调数量时已有立方体位置不跳变 */
function random(seed) {
  const value = Math.sin(seed * 12.9898 + 78.233) * 43758.5453;
  return value - Math.floor(value);
}

export default function InstancedMeshDemo() {
  const hostRef = useRef(null);
  // 保存当前 InstancedMesh、实例数据、控制器与开关
  const liveRef = useRef(null);

  const [count, setCount] = useState(DEFAULT_COUNT);
  const [wave, setWave] = useState(true);
  const [autoRotate, setAutoRotate] = useState(false);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return undefined;

    // ── 1. 场景与相机 ─────────────────────────────────────────
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x070d18);

    const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 200);
    camera.position.set(13, 11, 15);

    // ── 2. 渲染器与阴影 ───────────────────────────────────────
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    host.appendChild(renderer.domElement);

    // ── 3. 控制器 ─────────────────────────────────────────────
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(0, 1, 0);
    controls.enableDamping = true;
    controls.dampingFactor = 0.06;
    controls.minDistance = 5;
    controls.maxDistance = 45;
    controls.maxPolarAngle = Math.PI / 2 - 0.05;
    controls.update();

    // ── 4. 光照 ───────────────────────────────────────────────
    const hemisphereLight = new THREE.HemisphereLight(0xbcd7ff, 0x0a1424, 0.85);
    scene.add(hemisphereLight);

    const sun = new THREE.DirectionalLight(0xffffff, 3);
    sun.position.set(10, 16, 8);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    const shadowCamera = sun.shadow.camera;
    // 覆盖整个散布区域；范围越大阴影越糊，需要和 mapSize 一起权衡
    shadowCamera.left = -12;
    shadowCamera.right = 12;
    shadowCamera.top = 12;
    shadowCamera.bottom = -12;
    shadowCamera.near = 0.5;
    shadowCamera.far = 50;
    shadowCamera.updateProjectionMatrix();
    sun.shadow.bias = -0.0008;
    scene.add(sun);

    // ── 5. 地面 ───────────────────────────────────────────────
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(32, 32),
      new THREE.MeshStandardMaterial({ color: 0x1a2434, roughness: 0.95 }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    scene.add(ground);

    // ── 6. 实例化网格 ─────────────────────────────────────────
    // 几何体和材质由所有实例共享：这正是实例化的前提。
    const geometry = new THREE.BoxGeometry(1, 1, 1);
    const material = new THREE.MeshStandardMaterial({
      color: 0xffffff, // 实例颜色会和材质颜色相乘，这里用白色保留原色
      roughness: 0.4,
      metalness: 0.15,
    });

    // dummy 只是用来拼装矩阵的临时 Object3D，不会被渲染
    const dummy = new THREE.Object3D();
    const color = new THREE.Color();

    // 状态对象放在这里，重建实例和动画循环都读取同一份引用
    const state = {
      instanced: null,
      instances: [],
      wave: true,
      controls,
    };
    liveRef.current = state;

    /**
     * 按数量重建 InstancedMesh。
     *
     * 注意：数量变化时必须创建新的 InstancedMesh（实例缓冲区在构造时固定），
     * 但 geometry 和 material 继续复用，不需要重复创建。
     */
    const rebuild = (nextCount) => {
      // 移除并释放旧的实例缓冲区（geometry / material 是共享的，不能在这里 dispose）
      if (state.instanced) {
        scene.remove(state.instanced);
        state.instanced.dispose();
      }

      const instanced = new THREE.InstancedMesh(geometry, material, nextCount);
      instanced.castShadow = true;
      instanced.receiveShadow = true;
      // 每帧都会改写矩阵，提前声明为动态缓冲，驱动可以选更合适的存储方式
      instanced.instanceMatrix.setUsage(THREE.DynamicDrawUsage);

      const instances = [];

      for (let i = 0; i < nextCount; i += 1) {
        const x = (random(i * 3.1) - 0.5) * FIELD_SIZE;
        const z = (random(i * 7.3) - 0.5) * FIELD_SIZE;
        const height = 0.4 + random(i * 11.7) * 2.8;
        const width = 0.28 + random(i * 5.9) * 0.18;
        const rotation = random(i * 13.3) * Math.PI;
        const phase = random(i * 17.1) * Math.PI * 2;

        dummy.position.set(x, height / 2, z);
        dummy.rotation.set(0, rotation, 0);
        dummy.scale.set(width, height, width);
        dummy.updateMatrix();
        instanced.setMatrixAt(i, dummy.matrix);

        // 颜色跟着高度变化：矮的偏蓝，高的偏紫
        color.setHSL(0.56 + height * 0.05, 0.62, 0.5 + random(i * 19.7) * 0.15);
        instanced.setColorAt(i, color);

        instances.push({ x, z, height, width, rotation, phase });
      }

      // 所有 setMatrixAt / setColorAt 写完后再标记上传
      instanced.instanceMatrix.needsUpdate = true;
      if (instanced.instanceColor) {
        instanced.instanceColor.needsUpdate = true;
      }
      // 包围球用于视锥剔除，矩阵变化后需要重算
      instanced.computeBoundingSphere();

      scene.add(instanced);
      state.instanced = instanced;
      state.instances = instances;
    };

    // 把重建函数挂到 state 上，UI 滑块通过 liveRef 调用
    state.rebuild = rebuild;

    rebuild(DEFAULT_COUNT);

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
      const elapsed = timer.getElapsed();

      // 波浪动画：每帧重写每个实例的矩阵。
      // 这是 CPU 侧的逐实例计算，实例很多时开销明显；
      // 生产项目里更常见的做法是把相位传进顶点着色器，让 GPU 做位移。
      if (state.wave && state.instanced) {
        const { instanced, instances } = state;

        for (let i = 0; i < instances.length; i += 1) {
          const item = instances[i];
          const offset = Math.sin(elapsed * 1.6 + item.phase + item.x * 0.35) * 0.22;

          dummy.position.set(item.x, item.height / 2 + 0.3 + offset, item.z);
          dummy.rotation.set(0, item.rotation, 0);
          dummy.scale.set(item.width, item.height, item.width);
          dummy.updateMatrix();
          instanced.setMatrixAt(i, dummy.matrix);
        }

        instanced.instanceMatrix.needsUpdate = true;
      }

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
      state.instanced?.dispose();
      liveRef.current = null;
      // 当前实例的 geometry / material 由场景遍历释放
      disposeObject3D(scene);
      disposeRenderer(renderer);
      renderer.domElement.remove();
    };
  }, []);

  const handleCountChange = (event) => {
    const nextCount = Number(event.target.value);
    setCount(nextCount);
    // rebuild 定义在 effect 内部，通过 liveRef 暴露给 UI
    if (liveRef.current) {
      liveRef.current.rebuild(nextCount);
    }
  };

  const handleWaveChange = (event) => {
    const checked = event.target.checked;
    setWave(checked);
    if (liveRef.current) {
      liveRef.current.wave = checked;
    }
  };

  const handleAutoRotateChange = (event) => {
    const checked = event.target.checked;
    setAutoRotate(checked);
    if (liveRef.current) {
      // OrbitControls 自带 autoRotate，每帧 update 时会自动推进
      liveRef.current.controls.autoRotate = checked;
    }
  };

  return (
    <div className="three-demo">
      <header className="three-header">
        <p className="three-eyebrow">THREE.JS · 08 性能</p>
        <h1>实例化渲染</h1>
        <p className="three-intro">
          同一个立方体几何体重复上万个实例，共享材质和绘制调用。
          拖动数量滑块可以直观看到：实例翻倍，绘制调用仍然只有 1 次。
        </p>
      </header>

      <div className="three-stage" role="img" aria-label="由数千个彩色立方体组成的起伏阵列">
        <div className="three-canvas-host" ref={hostRef} />
        <p className="three-stage-hint">拖动旋转视角 · 滚轮缩放</p>
      </div>

      <div className="three-controls">
        <label className="three-control">
          <span>实例数量</span>
          <input
            type="range"
            min={MIN_COUNT}
            max={MAX_COUNT}
            step="200"
            value={count}
            onChange={handleCountChange}
          />
          <output>{count.toLocaleString()}</output>
        </label>

        <label className="three-control three-control--check">
          <input type="checkbox" checked={wave} onChange={handleWaveChange} />
          <span>波浪动画</span>
        </label>

        <label className="three-control three-control--check">
          <input type="checkbox" checked={autoRotate} onChange={handleAutoRotateChange} />
          <span>相机环绕</span>
        </label>
      </div>

      <div className="three-stats">
        <span>
          实例数 <strong>{count.toLocaleString()}</strong>
        </span>
        <span>
          绘制调用 <strong>1</strong>（阴影另算）
        </span>
        <span>共享 1 份几何体 + 1 份材质</span>
      </div>

      <ul className="three-notes">
        <li>普通 Mesh 每个物体一次绘制调用；InstancedMesh 无论多少实例都只画一次。</li>
        <li>setMatrixAt 写入实例矩阵，instanceMatrix.needsUpdate 标记需要上传 GPU。</li>
        <li>setColorAt 写入实例颜色，材质颜色用白色，避免把实例颜色乘暗。</li>
        <li>数量变化必须新建 InstancedMesh，因为实例缓冲区在创建时固定。</li>
        <li>逐实例动画在 CPU 上计算；更高效的做法是在顶点着色器里位移。</li>
      </ul>
    </div>
  );
}
