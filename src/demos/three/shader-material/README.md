# ShaderMaterial 入门 Custom Shaders

> 分组：Three.js ｜ 难度：★★★ ｜ 前置：旋转立方体、光照与阴影

## 练习目标

- 理解顶点着色器与片段着色器的分工
- 用 `uniform` 从 JS 向 GPU 传时间、振幅、频率、颜色
- 用 `varying` 把顶点高度传给片段着色器并做插值
- 在顶点着色器里修改 `position`，做出波浪起伏
- 在片段着色器里按高度混合颜色
- 手动处理输出色彩空间

## 实现要点

1. **几何体**：`PlaneGeometry(7, 4.5, 160, 100)`，约 1.6 万顶点，密度决定波浪平滑度。
2. **顶点着色器**：复制 `position`，叠加两组正弦/余弦波改变 `z`，写入 `vElevation`。
3. **片段着色器**：`(vElevation + 1) / 2` 映射到 0~1，用 `mix(uColorA, uColorB, t)` 取色。
4. **uniform**：`uTime` 每帧更新；`uAmplitude`、`uFrequency` 由滑块实时修改。
5. **内置变量**：`projectionMatrix * modelViewMatrix * vec4(position, 1.0)` 完成 MVP 变换。
6. **色彩空间**：自定义片段着色器末尾加 `#include <colorspace_fragment>`。
7. **线框**：`material.wireframe = true`，用来观察顶点密度与三角形划分。

## 验收清单

- [x] 平面持续起伏，波浪平滑无明显折线感
- [x] 振幅、频率滑块实时改变形变
- [x] 线框模式可以看清三角形网格
- [x] 拖动视角能看到起伏的深度，而不是一张平面贴图
- [x] 颜色明亮自然，没有发灰或过暗
- [x] 切换路由后无残留动画与 WebGL 上下文

## 常见坑

- 在顶点着色器里直接修改 `position`，污染内置属性，后续计算全部出错。
- 忘记用 `modelViewMatrix` / `projectionMatrix` 做变换，画面一片空白。
- 把每个顶点各不相同的值用 `uniform` 传递，结果所有顶点拿到同一个值。
- 自定义片段着色器漏掉 `colorspace_fragment`，颜色明显偏暗。
- 分段数太低（例如 10 × 10），波浪看起来像折纸。
- GLSL 语法错误不会在构建时暴露，只会在浏览器控制台报编译失败，需要打开 devtools 查看。

## 可以继续扩展

- 给顶点加法线扰动，配合光照做真实明暗
- 用 `uMouse` 让鼠标位置影响波浪
- 把两组 uniform 颜色换成渐变纹理（`texture2D` 采样）
- 用 `RawShaderMaterial` 对比自动注入与完全手写的区别
- 做顶点位移 + 边缘辉光的水面 / 地形效果
- 把算法移植到 `onBeforeCompile`，在标准材质上做局部修改
