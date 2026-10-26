# 射线拾取 Raycaster Picking

> 分组：Three.js ｜ 难度：★★☆ ｜ 前置：光照与阴影

## 练习目标

- 把鼠标像素坐标换算成 NDC 坐标
- 用 `Raycaster.setFromCamera` 从相机发出射线
- 用 `intersectObjects` 获取有序交点，判断悬停与点击
- 通过 `userData` 把业务数据绑到物体上
- 区分悬停态、选中态，并用材质 `emissive` 做视觉反馈

## 实现要点

1. **坐标换算**：`x = ((clientX - rect.left) / rect.width) * 2 - 1`，`y` 取反。
2. **射线**：`raycaster.setFromCamera(pointer, camera)`，相机移动后无需额外更新。
3. **求交**：`raycaster.intersectObjects(pickables, false)`，数组按距离升序，取第 0 个。
4. **只拾取需要的物体**：地面、网格不放进数组，点击空白才能可靠取消选中。
5. **数据绑定**：`mesh.userData.name / info`，拾取后直接读取，不用额外维护映射表。
6. **状态更新**：悬停检测放在渲染循环里，只有命中物体变化时才 `setState`，避免高频渲染。
7. **选中反馈**：`material.emissive` 变色，优先级为「选中 > 悬停 > 无」。
8. **清理**：移除 pointer 事件监听、恢复 cursor、释放场景与渲染器。

## 验收清单

- [x] 鼠标悬停物体时发光并显示名称，移开后恢复
- [x] 点击物体后显示几何信息面板，点击空白处取消
- [x] 选中物体后再悬停其他物体，颜色状态正确
- [x] 鼠标移出画布时悬停高亮清除，选中状态保留
- [x] 切换路由后无残留事件监听与 WebGL 上下文

## 常见坑

- 忘记对 y 取反，射线上下颠倒，点击位置完全不对。
- 使用 `event.offsetX` 而不是 `getBoundingClientRect()`，页面缩放或嵌套布局时坐标偏移。
- 每次 `pointermove` 都 `setState`，指针移动时 React 频繁重渲染。
- 把地面也放进拾取数组，点击空白永远命中地面，无法取消选中。
- 同时开启 OrbitControls 却不区分拖动与点击，松开鼠标就误选中物体。

## 可以继续扩展

- 与 OrbitControls 共存：记录 pointerdown / pointerup 位移，小于阈值才算点击
- 用 `OutlinePass` 或描边着色器做选中轮廓
- 点击物体后让相机飞过去（配合 GSAP 或手写缓动）
- 鼠标位置显示跟随标签（把 NDC 反投影回屏幕坐标）
- 拾取 glTF 模型中的子网格，显示部件信息
