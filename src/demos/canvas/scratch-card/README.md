# 刮刮乐 Scratch Card

> 分组：Canvas 2D

## 练习目标

- 图层叠加：底层奖品信息 + 顶层可擦除遮罩
- `globalCompositeOperation = 'destination-out'` 的像素擦除
- 画笔轨迹与触摸 / 鼠标兼容
- 用 `getImageData` 统计刮开比例并触发阈值
- 抽奖概率、重置与结果动画

## 业务对应

活动抽奖、优惠券领取、互动营销页。

## 目录规划

```text
scratch-card/
├── native/        # 原生 Canvas 实现
└── README.md
```

注册建议：`scratch-card-native` → `@/demos/canvas/scratch-card/native`。

## 原生版实现要点

1. **结构**：DOM 底层展示奖品文案，canvas 覆盖在上方并填充灰色涂层。
2. **擦除**：`pointermove` 时设置 `globalCompositeOperation = 'destination-out'`，沿轨迹画圆或粗线。
3. **比例统计**：每隔一定时间（不是每次移动）用 `getImageData` 采样透明像素占比；采样步长可取 4 或 8 以降低开销。
4. **阈值**：刮开超过 50%～60% 时自动揭开全部，并做淡出动画。
5. **重置**：重新填充涂层、清空状态，用于「再抽一次」。
6. **体验**：`touch-action: none`、`pointercancel` 处理、离开画布时结束当前笔画。

## 验收清单

- [ ] 鼠标与触屏都能刮开，轨迹连续
- [ ] 刮开达到阈值自动揭开，且只触发一次
- [ ] 「再来一次」能完整重置
- [ ] 刮开比例统计不卡顿
- [ ] 中奖 / 未中奖状态展示正确

## 可以继续扩展

- 刮开音效与粒子效果
- 奖品概率配置与保底逻辑
- 服务端发券结果联动
- 刮刮卡背景图、Logo、规则弹窗
- 统计埋点（开始、刮开、完成）

## 常见坑

- 每帧全量 `getImageData` 导致掉帧；应降低频率或采样。
- 合成模式忘记重置，后续绘制被影响。
- 移动端没有 `touch-action: none`，刮的时候页面滚动。
- 阈值判断放在高频事件里，导致重复触发。
