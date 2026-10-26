# 粒子星空 Particle Stars

> 分组：Three.js ｜ 难度：★★☆ ｜ 前置：旋转立方体

## 练习目标

- 直接操作 `BufferGeometry` 的顶点属性数组
- 用 `Points` + `PointsMaterial` 一次绘制数万个点
- 用顶点颜色让每个粒子拥有独立颜色
- 在球壳内做均匀采样，避免极点聚集
- 运行时替换 geometry 而不重建整个场景

## 实现要点

1. **数据结构**：`Float32Array(count * 3)` 存放 position 与 color，再包装成 `BufferAttribute`。
2. **球面采样**：`theta = random * 2π`，`phi = acos(2 * random - 1)`；对 `cos(phi)` 均匀取值才能保证面积均匀。
3. **材质**：`PointsMaterial({ sizeAttenuation, vertexColors, transparent, depthWrite: false, blending: AdditiveBlending })`；用 `CanvasTexture` 生成径向渐变贴图作为 `map`，把方形点变成圆形柔边。
4. **包围球**：`geometry.computeBoundingSphere()`，渲染器做视锥剔除时直接复用。
5. **动态数量**：保留同一个 `Points` 和材质，只 `dispose()` 旧 geometry 再赋新 geometry。
6. **动画**：整体缓慢旋转 + 材质透明度轻微呼吸，速度都由 delta 驱动。
7. **清理**：场景遍历释放 geometry / material，再释放渲染器与上下文。

## 验收清单

- [x] 星空铺满视野，拖动环顾时没有明显断层或极点堆积
- [x] 调整粒子数量后立即生效，旧 geometry 被释放
- [x] 粒子大小、自动旋转可以实时开关
- [x] 页面显示顶点数与绘制调用次数（始终为 1）
- [x] 切换路由后无残留动画与 WebGL 上下文

## 常见坑

- 直接对极角 `phi` 取随机数，星星会明显集中在两极。
- 每个星点建一个 Mesh，几万个对象会把 CPU 和绘制调用拖垮。
- `depthWrite: false` 配 `AdditiveBlending` 时仍开启透明排序，容易出现亮度闪烁。
- 替换 geometry 时不 dispose 旧数据，显存持续增长。
- `PointsMaterial` 被当成受光材质，加了灯却看不到任何变化。

## 可以继续扩展

- 用 `ShaderMaterial` 给每个点加闪烁相位与圆形柔边
- 加一层少量的大号亮星，制造景深层次
- 用 `BufferAttribute.needsUpdate` 做粒子流动动画
- 结合 `Raycaster` 点击某个星点
- 用 `InstancedMesh` 对比点渲染与实例化渲染的差异
