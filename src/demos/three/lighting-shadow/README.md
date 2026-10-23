# 光照与阴影 Lighting & Shadow

> 分组：Three.js ｜ 难度：★★☆ ｜ 前置：旋转立方体

## 练习目标

- 区分主光（`DirectionalLight`）与补光（`HemisphereLight`）的作用
- 配置 `renderer.shadowMap`、`castShadow`、`receiveShadow`
- 理解平行光阴影相机的范围与阴影贴图分辨率的关系
- 用 `OrbitControls` 实现拖动旋转、滚轮缩放和阻尼惯性
- React 状态与 Three.js 实时对象之间的同步方式

## 实现要点

1. **阴影总开关**：`renderer.shadowMap.enabled = true`，类型选 `PCFSoftShadowMap` 获得柔和边缘。
2. **投射与接收**：物体 `castShadow = true`，地面 `receiveShadow = true`，两者缺一不可。
3. **阴影相机**：平行光的 `shadow.camera` 是正交相机，手动设置 `left/right/top/bottom/near/far` 包住场景。
4. **阴影质量**：`shadow.mapSize` 越大越清晰，但显存和每帧开销同步增加；用 `shadow.bias` 消除自阴影条纹。
5. **轨道控制器**：`OrbitControls` 改变的是相机位置；开启 `enableDamping` 后必须每帧 `controls.update()`。
6. **运行时调参**：场景创建只执行一次，动画循环里读不到最新的 React state（闭包陷阱）；用 `useRef` 持有光源对象，事件处理函数直接修改它。
7. **清理**：`controls.dispose()`、释放场景资源、`renderer.dispose()` + `forceContextLoss()`。

## 验收清单

- [x] 地面能看到立方体、球体、圆环投射的阴影
- [x] 拖动旋转视角流畅，滚轮缩放有上下限，相机不会钻到地面以下
- [x] 关闭「投射阴影」后阴影立即消失，重新打开后恢复
- [x] 拖动光强滑块，画面明暗实时变化
- [x] 关闭「光源旋转」后光源停在当前位置
- [x] 切换路由后无残留动画与 WebGL 上下文

## 常见坑

- 只开 `castShadow` 不设 `receiveShadow`，或者忘了打开 `renderer.shadowMap.enabled`，都会看不到阴影。
- 阴影相机范围太小，阴影在场景边缘被裁掉；范围太大，阴影分辨率被稀释、边缘发糊。
- 物体与地面共面导致 z-fighting，网格线要抬高一点。
- 开启阻尼后忘记每帧 `controls.update()`，松手后惯性不生效。
- 把 React state 直接写进只执行一次的 `useEffect` 循环，拿到的是旧值。

## 可以继续扩展

- 加入 `DirectionalLightHelper` / `CameraHelper` 可视化阴影相机
- 平行光换成聚光灯 `SpotLight`，对比阴影锥与衰减
- 加入可拖拽的 GUI（lil-gui）调整参数
- 加入贴图与法线贴图，观察材质细节对光照的影响
