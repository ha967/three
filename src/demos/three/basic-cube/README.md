# 旋转立方体 Basic Cube

> 分组：Three.js ｜ 难度：★☆☆ ｜ 建议作为 3D 入门的第一个 demo

## 练习目标

- 理解 `Scene → Camera → Renderer` 三件套的分工
- 用 `BoxGeometry` + `MeshStandardMaterial` + `Mesh` 组装第一个物体
- 用 `DirectionalLight` / `AmbientLight` 照亮物理材质
- 用 `Timer` 的 delta 实现与刷新率无关的动画
- 容器尺寸适配、DPR 上限、组件卸载时释放 GPU 资源

## 实现要点

1. **场景**：`new THREE.Scene()` 是所有物体的容器，`scene.background` 决定清屏颜色。
2. **相机**：`PerspectiveCamera(fov, aspect, near, far)`，修改 `aspect` 后必须调用 `updateProjectionMatrix()`。
3. **渲染器**：`WebGLRenderer({ antialias: true })`，`setPixelRatio` 上限取 2，显式设置 `outputColorSpace`。
4. **物体**：`Mesh = Geometry + Material`，几何体只管形状，材质决定表面如何响应光照。
5. **动画**：每帧 `timer.update(timestamp)` 后，`timer.getDelta()` 返回上一帧到这一帧的秒数，用「角速度 × delta」更新旋转。
6. **尺寸**：`ResizeObserver` 监听容器，同步相机宽高比和 `renderer.setSize`。
7. **清理**：取消 `requestAnimationFrame`、断开 observer、释放 geometry / material / renderer。

## 验收清单

- [x] 立方体持续旋转，速度不随显示器刷新率变化
- [x] 改变浏览器窗口大小后，画面不变形、不模糊
- [x] 打开 React StrictMode 后只出现一个 canvas，切换路由不泄漏 WebGL 上下文
- [x] 代码按场景、相机、渲染器、物体、光照、尺寸、循环、清理分段注释

## 常见坑

- 忘了 `camera.lookAt(...)`，相机默认看向 -Z，物体可能不在视野内。
- 用 `MeshStandardMaterial` 却忘记加灯，画面全黑。
- 直接按 `0.01`/帧 更新旋转，144Hz 屏幕上动画会明显更快。
- 只移除 canvas 不调用 `renderer.dispose()`，反复切换 demo 后可能出现 WebGL 上下文超限。
- 照抄 r155 之前教程的光强数值，画面会过曝或过暗。

## 可以继续扩展

- 切换几何体：球体、圆环、圆环结
- 用 `EdgesGeometry` 给立方体加描边
- 加入暂停 / 继续按钮，练习控制渲染循环
- 加入 `OrbitControls`，进入下一个 demo
