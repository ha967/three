# 图片标注 Image Annotation

> 分组：Canvas 2D ｜ 难度：★★★ ｜ 建议先做原生版

## 练习目标

- 图像坐标系与屏幕坐标系的相互转换
- 画布缩放、平移与视口变换
- 矩形标注的创建、选中、拖拽、缩放、删除
- 命中检测与层级管理
- 标注数据序列化 / 反序列化
- 撤销重做与导出

## 业务对应

AI 数据标注、图像审核、遥感 / 医疗影像、设计稿批注、工单截图标注。是 Canvas 从「画图」走向「编辑器」的关键一步。

## 目录规划

```text
image-annotation/
├── native/        # 原生 Canvas 实现
├── fabric/        # Fabric.js 实现
└── README.md
```

注册建议：

- `image-annotation-native` → `@/demos/canvas/image-annotation/native`
- `image-annotation-fabric` → `@/demos/canvas/image-annotation/fabric`

## 原生版实现要点

1. **视口模型**：维护 `scale` 与 `offsetX/offsetY`，绘制时 `ctx.setTransform(scale, 0, 0, scale, offsetX, offsetY)`。
2. **坐标转换**：
   - 屏幕 → 图像：`(screenX - offsetX) / scale`
   - 图像 → 屏幕：`x * scale + offsetX`
   - 所有标注坐标只存图像坐标，显示时再转换。
3. **创建标注**：`pointerdown` 记录起点，`pointermove` 实时预览，`pointerup` 若面积足够则落库。
4. **命中检测**：从后往前遍历标注，判断点是否在矩形内；控制点用更大的命中半径。
5. **编辑**：选中后绘制控制点，拖拽内部移动、拖拽控制点缩放，注意最小尺寸与边界。
6. **数据**：`{ id, x, y, width, height, label }`，支持导出 JSON 和从 JSON 恢复。
7. **视图操作**：滚轮缩放以指针为中心，空格 / 中键拖拽平移。
8. **性能**：标注多时只重绘可视区域；图片与标注分层绘制。

## 库版对照（Fabric.js）

- Fabric 提供对象模型（`Rect`、`Group`）、选中框、控制点、事件、`toJSON/loadFromJSON`；
- 对比点：自定义控制点、坐标约束、业务数据绑定，库的抽象是帮你还是限制你？
- 也可对比 Konva（React 集成更好）与 X6 / LogicFlow（偏流程图、节点连线场景）。

## 验收清单

- [ ] 可拖拽绘制矩形，太小或反向拖拽不会产生无效标注
- [ ] 可选中、移动、缩放、删除标注
- [ ] 缩放 / 平移画布后，标注与图片保持对齐
- [ ] 标注可导出 JSON，并能恢复
- [ ] 撤销 / 重做覆盖新增、移动、删除
- [ ] 图片很大时仍可接受地交互

## 可以继续扩展

- 多边形、点、折线标注
- 标签选择与颜色映射
- 复制粘贴、批量删除、快捷键
- 标注列表与图层面板
- 与服务端标注任务联动
- 移动端手势（双指缩放、拖拽）

## 常见坑

- 混用屏幕坐标和图像坐标，缩放后标注漂移。
- 控制点命中区域太小，触屏不可用。
- 缩放时以画布左上角为中心，体验很差；应以指针为中心。
- 每次交互都重绘或重建 DOM，标注多时卡顿。
