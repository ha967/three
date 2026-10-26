# glTF 模型加载 glTF Model

> 分组：Three.js ｜ 难度：★★☆ ｜ 前置：光照与阴影

## 练习目标

- 用 `GLTFLoader` 加载 `.gltf` 及其引用的 `.bin`、贴图
- 用 `Box3` 测量模型包围盒，统一缩放到目标尺寸
- 把模型底部对齐到地面，并据此摆好相机与 `OrbitControls` 目标点
- 遍历模型统计网格、材质、三角形数量
- 处理「加载回调晚于组件卸载」的竞态

## 实现要点

1. **加载**：`loader.load(url, onLoad, onProgress, onError)`，进度回调里用 `loaded / total` 计算百分比。
2. **整体包装**：把 `gltf.scene` 放进一个 `Group`，缩放和位移只作用于 Group，不破坏模型内部节点。
3. **包围盒**：`new Box3().setFromObject(group)` 得到 `size` 与 `center`。
4. **归一化**：`scale = TARGET_SIZE / max(size.x, size.y, size.z)`；`position = (-center.x * s, -box.min.y * s, -center.z * s)`。
5. **相机**：根据归一化后的尺寸计算观察距离，设置 `camera.position`、`controls.target` 和缩放范围。
6. **统计**：`traverse` 统计 `isMesh` 数量；索引几何体用 `index.count / 3` 计算三角形。
7. **竞态**：用 `disposed` 标记拦截卸载后的 `setState` 和场景操作；晚到的模型直接销毁。

## 验收清单

- [x] 加载期间显示进度条与已加载 MB 数
- [x] 模型加载完成后完整出现在画面里，底部贴着网格平面
- [x] 拖动旋转、滚轮缩放流畅，相机自动环绕可开关
- [x] 页面显示网格数、材质数、三角形数和加载耗时
- [x] 加载失败时显示错误信息与资源路径提示
- [x] 切换路由后无残留动画与 WebGL 上下文

## 常见坑

- 直接修改 `gltf.scene.scale`，和模型自带的节点变换叠加后尺寸不可控。
- 只缩放不重新计算包围盒，模型悬空或陷进地面。
- 模型很大/很小却沿用固定相机参数，加载后看不到东西。
- 组件卸载后加载才完成，回调里继续操作已销毁的场景。
- 大型模型开启阴影，绘制调用翻倍导致明显掉帧。

## 资源说明

`public/models/city/` 来自 Sketchfab 的 “CCity Building Set 1”，作者 Neberkenezer，许可 CC-BY-4.0。页面底部已保留署名与许可链接。

## 可以继续扩展

- 用 `LoadingManager` 统一管理多个模型的加载进度
- 加载多个模型并排对比，练习 `Box3` 对齐
- 对大型模型做视锥剔除、LOD 或合批优化
- 用 `DRACOLoader` 压缩模型体积
- 让相机沿着预设路径漫游城市
