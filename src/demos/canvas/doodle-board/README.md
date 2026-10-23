# 涂鸦画板 Doodle Board

> 分组：Canvas 2D

## 练习目标

- Canvas 尺寸与设备像素比（DPR）的正确处理
- Pointer Events：按下、移动、抬起、`setPointerCapture`
- 把「笔画」建模成数据（点数组），而不是直接画上去
- 曲线平滑、橡皮擦、撤销 / 重做、导出图片
- 高 DPI、窗口缩放、断点续画等真实问题

## 业务对应

电子签名、图片批注、在线白板、教学批注工具。

## 目录规划

```text
doodle-board/
├── native/        # 原生 Canvas 实现
├── konva/         # Konva / react-konva 实现
└── README.md
```

每个变体是独立 demo，完成后分别注册到 `src/demos/registry.js`：

- `doodle-board-native` → `@/demos/canvas/doodle-board/native`
- `doodle-board-konva` → `@/demos/canvas/doodle-board/konva`

## 原生版实现要点

1. **画布初始化**：CSS 尺寸与位图尺寸分离，`canvas.width = clientWidth * dpr`，再 `ctx.scale(dpr, dpr)`。
2. **数据模型**：`strokes: { color, size, points[] }[]`，每次移动把坐标追加到当前笔画。
3. **渲染**：每帧或每次变更后清空并重绘所有笔画；先用 `moveTo/lineTo` 打通，再尝试二次贝塞尔或中点平滑。
4. **坐标换算**：用 `getBoundingClientRect()` 把 Pointer 事件坐标映射到画布坐标，缩放场景下不要依赖 `offsetX`。
5. **橡皮擦**：用 `globalCompositeOperation = 'destination-out'` 擦除像素，或把橡皮建模成「背景色笔画」。
6. **撤销 / 重做**：维护 `undoStack` / `redoStack`，最简单的做法是保存笔画快照。
7. **导出**：`canvas.toBlob()` 下载 PNG；若需要固定分辨率，按目标尺寸重新绘制。
8. **清理**：组件卸载时移除事件监听、取消 rAF；React StrictMode 下 effect 会执行两次，必须正确 cleanup。

## 库版对照（Konva）

用 Konva 时，每一笔是一条 `Line` 或 `Shape`，由 `Stage → Layer → Shape` 管理：

- 重绘、命中检测、图层缓存由库负责，不再自己维护笔画数组；
- 更关注 API 与对象树，能快速扩展选中、拖拽、变换、序列化；
- 对比点：库替你抽象了哪些东西？哪些性能问题依然需要自己处理（例如笔画过多、图层重绘）。

## 验收清单

- [ ] 鼠标和触屏都能流畅绘制，笔画跟手无明显延迟
- [ ] 高分屏下线条清晰，窗口缩放后画布不模糊、内容不丢失
- [ ] 可切换颜色与粗细，橡皮擦工作正常
- [ ] 撤销 / 重做可用，至少支持 20 步
- [ ] 可导出 PNG，导出图清晰且背景正确
- [ ] 组件切换或卸载后无残留监听和动画

## 可以继续扩展

- 背景图 / 参考底图
- 文本、贴纸、图形工具
- 笔压（PointerEvent.pressure）与笔锋
- 画布缩放 / 平移
- 本地持久化（localStorage / IndexedDB）

## 常见坑

- 只设置 CSS 宽高导致模糊；必须同时设置 `canvas.width/height`。
- 每次 `pointermove` 都 `getImageData`，性能极差。
- 在 React 中把 canvas 引用放进 state 导致重复初始化。
- 忘记 `touch-action: none`，移动端绘制时页面跟着滚动。
