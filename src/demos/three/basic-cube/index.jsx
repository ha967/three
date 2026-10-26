import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { disposeObject3D, disposeRenderer } from '@/three/dispose';
import './index.css';

/**
 * 旋转立方体 —— Three.js 的第一个场景
 *
 * 这个 demo 只做四件事：
 * 1. 创建一个场景（Scene），放一个立方体进去；
 * 2. 创建一台相机（Camera），决定从哪个角度看；
 * 3. 创建一个渲染器（WebGLRenderer），把场景画到页面上的 canvas；
 * 4. 在每一帧里转动立方体并重新渲染。
 *
 * 新手最容易忽略、但真实项目里必须处理的两件事也放在这里：
 * - 容器尺寸变化时同步相机宽高比与画布分辨率（ResizeObserver）；
 * - 组件卸载时释放几何体、材质和 WebGL 上下文（React StrictMode 会挂载两次）。
 *
 * 代码按「场景 → 相机 → 渲染器 → 物体 → 光照 → 尺寸 → 循环 → 清理」排列，
 * 建议从上往下读。
 */

export default function BasicCubeDemo() {
  // 用来挂载 WebGL canvas 的 DOM 容器。
  // Three.js 不负责创建 DOM 节点，只负责往容器里塞一个 <canvas>。
  const hostRef = useRef(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return undefined;

    // ── 1. 场景 ───────────────────────────────────────────────
    // Scene 是一个容器：物体、灯光、相机都要 add 进去，渲染器才知道要画什么。
    const scene = new THREE.Scene();
    // 背景色由 Three.js 在清屏时填充，不需要另外写 CSS 背景。
    // 颜色用 0x 开头的十六进制数，和 CSS 的 # 写法对应的值相同。
    scene.background = new THREE.Color(0x0b1220);

    // ── 2. 相机 ───────────────────────────────────────────────
    // PerspectiveCamera 模拟人眼：近大远小。
    // 参数依次是：视野角度 fov（度）、宽高比 aspect、近裁剪面 near、远裁剪面 far。
    // 超出 near ~ far 的物体不会被渲染，所以 near 不要设成 0。
    // aspect 先写 1，真正的值在下面的「尺寸适配」里根据容器计算。
    const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
    camera.position.set(3.2, 2.6, 4.4);
    // 让相机朝向原点，否则它默认看向 -Z 方向，立方体可能不在画面里
    camera.lookAt(0, 0, 0);

    // ── 3. 渲染器 ─────────────────────────────────────────────
    // antialias: true 开启抗锯齿，立方体的斜边不会有明显锯齿
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    // 高分屏上 1 个 CSS 像素对应多个物理像素。
    // 按 devicePixelRatio 提高分辨率画面更清晰，但像素总量是平方增长，
    // 因此把上限压到 2，兼顾清晰度和性能。
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    // Three.js r152 起默认按 SRGB 输出；这里显式写出来，
    // 是为了提醒你：颜色空间不一致会导致画面发灰或过亮。
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    // renderer.domElement 就是它内部创建的 <canvas>，把它放进 React 提供的容器
    host.appendChild(renderer.domElement);

    // ── 4. 几何体 + 材质 + 网格 ───────────────────────────────
    // 几何体（Geometry）只描述形状：一个边长 1.6 的立方体有哪些顶点。
    const geometry = new THREE.BoxGeometry(1.6, 1.6, 1.6);
    // 材质（Material）描述表面如何响应光照：颜色、粗糙度、金属度。
    const material = new THREE.MeshStandardMaterial({
      color: 0x4f8cff,
      roughness: 0.35, // 0 = 镜面，1 = 完全粗糙
      metalness: 0.2, // 0 = 非金属，1 = 金属
    });
    // 网格（Mesh）= 几何体 + 材质，是真正能被渲染的对象
    const cube = new THREE.Mesh(geometry, material);
    scene.add(cube);

    // ── 5. 光照 ───────────────────────────────────────────────
    // MeshStandardMaterial 是物理材质，没有光照就是全黑的。
    // 环境光从各个方向均匀照亮物体，用来补暗部，不产生阴影。
    const ambientLight = new THREE.AmbientLight(0xffffff, 1.1);
    // 平行光模拟太阳：光线方向一致，只和位置与目标点的方向有关。
    // r155 之后光照使用物理单位，强度数值比旧教程里的 0~1 更大。
    const keyLight = new THREE.DirectionalLight(0xffffff, 3);
    keyLight.position.set(5, 7, 6);
    // 平行光默认照向原点 (0, 0, 0)
    scene.add(ambientLight, keyLight);

    // ── 6. 尺寸适配 ───────────────────────────────────────────
    // 容器尺寸 = CSS 尺寸；canvas 位图尺寸由 renderer.setSize 计算。
    // 每次容器变化都要同步三件事：相机宽高比、投影矩阵、画布尺寸。
    const resize = () => {
      const width = host.clientWidth;
      const height = host.clientHeight;

      // 布局尚未完成时尺寸可能是 0，此时跳过，避免除零和无效的绘图缓冲
      if (width < 1 || height < 1) return;

      camera.aspect = width / height;
      // 修改相机参数后必须手动更新投影矩阵，否则变化不会生效
      camera.updateProjectionMatrix();

      // 第三个参数省略时，Three.js 会同时设置 canvas 的 CSS 尺寸
      renderer.setSize(width, height);
    };

    resize();

    // ResizeObserver 监听元素尺寸，比 window.resize 更准确：
    // 侧边栏折叠、布局变化、只改变容器宽高时都能触发。
    const observer = new ResizeObserver(resize);
    observer.observe(host);

    // ── 7. 渲染循环 ───────────────────────────────────────────
    // Timer 记录两次 update 之间的时间差，让动画速度不受显示器刷新率影响。
    // 如果每帧固定加 0.01，144Hz 屏幕上立方体会比 60Hz 快 2.4 倍。
    // 每帧先 update() 再 getDelta()：同一帧里多次读取会得到相同的值。
    const timer = new THREE.Timer();
    // connect(document) 启用 Page Visibility API：
    // 切换到后台标签页时不再累计时间，回来后动画不会突然跳一大步。
    timer.connect(document);
    let frameId = 0;

    const animate = (timestamp) => {
      // requestAnimationFrame 会把当前时间戳传给回调，直接交给 update 使用
      timer.update(timestamp);
      // delta 是距离上一帧经过的秒数
      const delta = timer.getDelta();

      // 角速度（弧度/秒）× 时间（秒）= 本帧转过的弧度
      cube.rotation.x += delta * 0.55;
      cube.rotation.y += delta * 0.85;

      // 渲染器把场景和相机「拍」成一张图，画到 canvas 上
      renderer.render(scene, camera);

      // 请求下一帧继续执行，浏览器通常每秒调用 60 次（跟随刷新率）
      frameId = requestAnimationFrame(animate);
    };

    // 启动循环。注意是用 requestAnimationFrame 包一层，
    // 而不是直接调用 animate()，这样第一帧也会等到浏览器合适的时机。
    frameId = requestAnimationFrame(animate);

    // ── 8. 清理 ───────────────────────────────────────────────
    // useEffect 返回的函数会在组件卸载时执行。
    // React StrictMode 在开发环境会执行「挂载 → 清理 → 再挂载」，
    // 所以这里必须把所有东西还原干净，否则会出现两个 canvas 或内存泄漏。
    return () => {
      cancelAnimationFrame(frameId);
      // 断开 Page Visibility 监听
      timer.dispose();
      observer.disconnect();
      // 先释放场景里的几何体 / 材质 / 贴图，再释放渲染器
      disposeObject3D(scene);
      disposeRenderer(renderer);
      // 把 canvas 从页面上移除
      renderer.domElement.remove();
    };
  }, []);

  return (
    <div className="three-demo">
      <header className="three-header">
        <p className="three-eyebrow">THREE.JS · 01 基础</p>
        <h1>旋转立方体</h1>
        <p className="three-intro">
          最小的 Three.js 场景：场景、透视相机、WebGL 渲染器，加上一个受光照影响的立方体。 动画使用
          Timer 的 delta 驱动，窗口缩放时自动适配尺寸。
        </p>
      </header>

      <div className="three-stage" role="img" aria-label="一个持续旋转的蓝色立方体">
        {/* 这个 div 只负责提供尺寸，canvas 由 WebGLRenderer 创建并插入 */}
        <div className="three-canvas-host" ref={hostRef} />
      </div>

      <ul className="three-notes">
        <li>Scene 是容器，Camera 决定看哪里，Renderer 负责把画面画到 canvas 上。</li>
        <li>Mesh = Geometry（形状）+ Material（表面），MeshStandardMaterial 必须有光照才可见。</li>
        <li>用 Timer 的 delta 做动画，旋转速度才不会随显示器刷新率变化。</li>
        <li>组件卸载时释放几何体、材质和 WebGL 上下文，避免重复挂载后出现多个画布。</li>
      </ul>
    </div>
  );
}
