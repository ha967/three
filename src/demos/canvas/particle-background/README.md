# 粒子背景 Particle Background

> 分组：Canvas 2D ｜ 难度：★★☆ ｜ 建议先做原生版

## 练习目标

- `requestAnimationFrame` 渲染循环与时间步长
- 粒子状态：位置、速度、加速度、生命周期
- 边界处理、对象池、数量与性能的关系
- 粒子连线与距离计算
- 页面可见性、`prefers-reduced-motion`、DPR 适配

## 业务对应

登录页 / 营销页背景、数据大屏装饰、节日活动、加载动画。

## 目录规划

```text
particle-background/
├── native/        # 原生 Canvas 2D 实现
├── pixijs/        # PixiJS（WebGL）实现
└── README.md
```

注册建议：

- `particle-background-native` → `@/demos/canvas/particle-background/native`
- `particle-background-pixijs` → `@/demos/canvas/particle-background/pixijs`

## 原生版实现要点

1. **粒子模型**：每个粒子至少有 `x/y/vx/vy/radius/alpha`，进阶再加生命值与颜色。
2. **循环**：用 `performance.now()` 计算 `deltaTime`，避免不同刷新率下速度不一致。
3. **绘制**：`clearRect` 或半透明矩形实现拖尾；连线用双重循环计算距离，粒子多时需空间分区或限制数量。
4. **交互**：鼠标位置产生排斥或吸引，演示「事件状态影响渲染」。
5. **性能**：
   - 粒子数控制在几百到一两千；
   - 连线数量为 O(n²)，是主要瓶颈；
   - 页面隐藏时暂停 rAF，`visibilitychange` 恢复；
   - `ResizeObserver` 处理容器尺寸变化。
6. **无障碍**：检测 `prefers-reduced-motion`，提供静态版本。

## 库版对照（PixiJS）

- 使用 `Application`、`Sprite` / `Graphics`、`Ticker`；
- 渲染走 WebGL/WebGPU，粒子数量可以更大，还能加 filter、blend mode；
- 对比点：同样的效果，代码组织、坐标系统、性能上限有什么差别？何时值得引入一个渲染引擎？

也可以了解 tsParticles：开箱即用的粒子背景库，适合快速交付，但可控性弱于自己实现。

## 验收清单

- [ ] 1000 个粒子下保持流畅（约 60fps）
- [ ] 切换标签页时暂停，回来继续
- [ ] 容器尺寸变化后画布与粒子位置正确
- [ ] 高分屏不模糊
- [ ] 开启「减少动态效果」时提供静态替代

## 可以继续扩展

- 星空、烟花、雪花等主题
- 鼠标吸附 / 斥力 / 点击爆炸
- 粒子拖尾与颜色渐变
- OffscreenCanvas + Worker 计算
- WebGL 着色器实现

## 常见坑

- 用固定数值更新位置，导致高刷屏速度变快。
- 每帧创建对象，GC 抖动；用对象池复用。
- 粒子数上去了才发现连线是瓶颈。
- 容器变尺寸后忘记重新设置 canvas 尺寸。
