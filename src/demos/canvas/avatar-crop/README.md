# 头像裁剪 Avatar Crop

> 分组：Canvas 2D ｜ 难度：★★☆ ｜ 建议先做原生版

## 练习目标

- `drawImage` 九参数裁切与缩放
- 图片在视口中的拖拽、缩放与边界约束
- 圆形遮罩、预览区与结果区的坐标对应
- `toBlob` 输出固定尺寸图片与质量控制
- 大图处理、EXIF 方向、内存释放

## 业务对应

用户头像、证件照、商品主图、上传前压缩。几乎所有带用户系统的产品都会用到。

## 目录规划

```text
avatar-crop/
├── native/        # 原生 Canvas 实现
├── cropperjs/     # cropperjs 实现
└── README.md
```

注册建议：

- `avatar-crop-native` → `@/demos/canvas/avatar-crop/native`
- `avatar-crop-cropperjs` → `@/demos/canvas/avatar-crop/cropperjs`

## 原生版实现要点

1. **加载图片**：`new Image()` + `URL.createObjectURL(file)`，记得 `URL.revokeObjectURL`。
2. **适配视口**：按 `cover` 规则计算初始缩放，使图片铺满裁剪框。
3. **交互状态**：维护 `translateX/translateY/scale`，Pointer 拖拽更新位移，滚轮缩放以指针为中心。
4. **边界约束**：缩放和拖拽后保证图片始终覆盖裁剪框，不能露出空白。
5. **绘制**：`ctx.save()` → 应用变换 → `drawImage` → 圆形 `clip` → `restore()`。
6. **输出**：按输出尺寸（如 512×512）在离屏 canvas 上重新绘制，`toBlob('image/jpeg', 0.9)`。
7. **图片方向**：优先用 `createImageBitmap(file, { imageOrientation: 'from-image' })` 处理手机照片 EXIF。

## 库版对照（cropperjs）

- 初始化时配置 `aspectRatio`、`viewMode`、`dragMode`；
- 直接调用 `getCroppedCanvas()` 获取结果；
- 对比点：拖拽/缩放/边界这些「数学 + 事件」逻辑，库替你封装了多少？失败的边界情况（超小图、超大图、旋转）库是否都处理了？

## 验收清单

- [ ] 选择本地图片后能正确显示，超大图不卡死页面
- [ ] 拖拽 / 缩放时图片始终覆盖裁剪区域
- [ ] 圆形预览与实际输出一致
- [ ] 输出固定尺寸、清晰、方向正确
- [ ] 更换图片或卸载组件后无内存泄漏

## 可以继续扩展

- 旋转 / 翻转
- 多种比例（1:1、4:3、16:9）
- 上传前压缩并显示体积对比
- 拖拽上传、粘贴图片
- 服务端裁剪兜底方案

## 常见坑

- 把图片直接塞进固定尺寸 canvas，比例失真。
- 只裁不缩放，输出图分辨率不足。
- 忽略 EXIF，手机竖拍照片显示成横的。
- 忘记回收 object URL 和 ImageBitmap。
