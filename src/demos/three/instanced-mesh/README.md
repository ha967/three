# 实例化渲染 Instanced Mesh

> 分组：Three.js ｜ 难度：★★★ ｜ 前置：粒子星空、射线拾取

## 练习目标

- 理解绘制调用（draw call）为什么是性能瓶颈
- 用 `InstancedMesh` 一次绘制上万个相同几何体
- 用 `setMatrixAt` / `setColorAt` 为每个实例单独设置变换和颜色
- 理解实例缓冲区在创建时固定，数量变化必须重建对象
- 对比 CPU 逐实例动画与 GPU 着色器位移两种方案

## 实现要点

1. **共享资源**：所有实例共用同一份 `BoxGeometry` 和 `MeshStandardMaterial`。
2. **创建**：`new THREE.InstancedMesh(geometry, material, count)`，count 在构造时确定。
3. **矩阵**：用临时 `Object3D` 拼出 position / rotation / scale，`updateMatrix()` 后写入 `setMatrixAt(i, matrix)`。
4. **颜色**：`setColorAt(i, color)`，材质颜色保持白色，实例颜色才能原样显示。
5. **上传**：修改完统一设置 `instanceMatrix.needsUpdate = true`、`instanceColor.needsUpdate = true`。
6. **动态缓冲**：`instanceMatrix.setUsage(THREE.DynamicDrawUsage)`，适合每帧改写的场景。
7. **数量变化**：旧的 `dispose()` 释放实例缓冲区，新建 `InstancedMesh`，共享的 geometry / material 继续复用。
8. **动画**：CPU 侧逐实例写矩阵；实例数很大时，应改在顶点着色器里计算位移。

## 验收清单

- [x] 默认 2500 个立方体排列成一片起伏的彩色阵列
- [x] 数量从 200 调到 10000，绘制调用始终只有 1 次
- [x] 波浪动画开关实时生效
- [x] 相机环绕开关实时生效
- [x] 数量变化时已有实例的位置保持稳定，不会整体乱跳
- [x] 切换路由后无残留动画与 WebGL 上下文

## 常见坑

- 每个物体一个 Mesh，几千个就开始掉帧，却以为是 GPU 不行。
- 修改矩阵后忘记 `needsUpdate = true`，画面完全不动。
- 数量变化时只改 count 变量，实例缓冲区其实没有变化。
- 在重建时把共享的 geometry / material 也 dispose 了，导致其他实例一起消失。
- 实例颜色不显示：材质颜色不是白色，或忘记 `setColorAt`。
- 阴影 pass 会让绘制调用翻倍，统计时要注明是否包含阴影。

## 可以继续扩展

- 把波浪位移写进 `onBeforeCompile` 或自定义 `ShaderMaterial`，交给 GPU 计算
- 用 `InstancedMesh` 渲染草、树、雨滴、人群等重复场景
- 加入鼠标拾取（`raycaster.intersectObject(instancedMesh)` 可拿到 `instanceId`）
- 对比 `BatchedMesh`（不同几何体合批）与 `InstancedMesh` 的适用场景
- 用 `renderer.info.render.calls` 实时显示绘制调用数
