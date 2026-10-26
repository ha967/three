# 后处理与辉光 Post-processing & Bloom

> 分组：Three.js ｜ 难度：★★★ ｜ 前置：光照与阴影

## 练习目标

- 理解 `EffectComposer` 的离屏渲染与多 Pass 管线
- 用 `RenderPass` + `UnrealBloomPass` + `OutputPass` 组合出辉光效果
- 理解 bloom 的 `strength / radius / threshold` 三个参数
- 用 `emissive` 材质制造高亮区域
- 正确处理 resize 与渲染目标的释放

## 实现要点

1. **管线**：`new EffectComposer(renderer)` → `RenderPass` → `UnrealBloomPass` → `OutputPass`。
2. **RenderPass**：把场景渲染进 composer 的离屏纹理，后续 Pass 处理的是二维图像。
3. **Bloom 参数**：`strength` 控制辉光强度，`radius` 控制扩散范围，`threshold` 决定多亮的像素参与发光。
4. **色调映射**：`renderer.toneMapping = ACESFilmicToneMapping`，使用 composer 时由 `OutputPass` 应用。
5. **resize**：`renderer.setSize()` 与 `composer.setSize()` 必须同时调用。
6. **对比开关**：关闭辉光时直接 `renderer.render(scene, camera)`，可以直观看到后处理前后的差别。
7. **释放**：`bloomPass.dispose()`（持有额外渲染目标）、`composer.dispose()`，再释放场景与渲染器。

## 验收清单

- [x] 环面结和小球有明显辉光，暗部保持干净
- [x] 调整强度、半径、阈值时画面实时变化
- [x] 关闭辉光后回到普通渲染，对比明显
- [x] 改变窗口大小后画面不变形、辉光不糊
- [x] 切换路由后无残留动画与 WebGL 上下文

## 常见坑

- 使用 composer 后仍然调用 `renderer.render`，导致后处理完全没有生效。
- 忘记 `composer.setSize`，resize 后画面被拉伸或只占左下角。
- 阈值设为 0，整个画面都参与模糊，看起来像蒙了一层雾。
- 场景里没有足够亮的物体，bloom 几乎看不出来。
- 使用 `OutputPass` 时又手动做了一次 sRGB 转换，画面过亮。
- 只 dispose composer 而漏掉 bloomPass 的渲染目标。

## 可以继续扩展

- 加入 `OutlinePass` 做选中描边
- 叠加 `FilmPass` / `GlitchPass` 做风格化效果
- 用 `ShaderPass` 自己写一个后处理着色器
- 对比 MSAA 与后处理抗锯齿（`SMAAPass`、`FXAAPass`）
- 加入景深（`BokehPass`）或屏幕空间环境光遮蔽（`SAOPass`）
