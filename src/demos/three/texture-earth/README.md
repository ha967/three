# 纹理与地球 Texture & Earth

> 分组：Three.js ｜ 难度：★★☆ ｜ 前置：光照与阴影

## 练习目标

- 用 `TextureLoader` 从 URL 加载图片纹理
- 理解色彩空间：颜色贴图必须标记为 sRGB
- 理解球体 UV 与等距圆柱投影地图的对应关系
- 使用各向异性过滤改善斜视角下的纹理清晰度
- 用两层 Group 实现「地轴倾斜 + 自转」

## 实现要点

1. **加载**：`new THREE.TextureLoader().load(url, onLoad, onProgress, onError)` 立即返回 Texture，图片异步填充。
2. **色彩空间**：`texture.colorSpace = THREE.SRGBColorSpace`，渲染器内部在线性空间计算，输出时再转回 sRGB。
3. **UV**：`SphereGeometry` 的 `u` 沿赤道 0→1，`v` 从南极到北极 0→1；等距圆柱投影正好与之匹配。
4. **采样质量**：`texture.anisotropy = renderer.capabilities.getMaxAnisotropy()`，斜看球面时更清晰。
5. **层级**：`tilt` 组负责 23.5° 地轴倾角，内部的 `spin` 组只绕自身 y 轴旋转。
6. **大气辉光**：略大的球体 + `BackSide` + 加法混合 + 关闭深度写入。
7. **异步清理**：图片回调触发时组件可能已卸载，用 `disposed` 标记拦截 `setState`。

## 验收清单

- [x] 地球纹理正常显示，颜色不发灰
- [x] 拖动旋转、滚轮缩放流畅，地球始终在画面中心
- [x] 开关自动自转和经纬网立即生效
- [x] 拖动太阳强度滑块，昼夜明暗实时变化
- [x] 贴图加载期间显示遮罩，失败时显示错误提示
- [x] 切换路由后无残留动画与 WebGL 上下文

## 常见坑

- 忘记设置 `colorSpace`，地球整体发灰、颜色变淡。
- 纹理宽高比不是 2:1，贴到球上会被横向或纵向拉伸。
- 用 `PlaneGeometry` 的 UV 习惯去理解球体，导致经线接缝位置判断错误。
- 图片加载回调里直接 `setState`，组件已卸载时会产生警告。
- 大气球和地球半径完全相同，出现严重的 z-fighting。

## 可以继续扩展

- 换成真实卫星影像（注意版权），对比程序化地图
- 加一张法线贴图或凹凸贴图，做出山脉起伏
- 加云层（第二张透明贴图，独立自转）
- 用 `CanvasTexture` 动态绘制天气、昼夜分界线
- 用 `EquirectangularReflectionMapping` 把同一张图作为环境贴图
