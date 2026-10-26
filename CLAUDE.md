# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 项目定位

Canvas 2D 与 Three.js 的学习仓库。每个知识点是一个独立 demo，按「先原生实现、再用库做一份对照」的方式组织（如 `doodle-board` 下的 `native/` 与 `konva/`）。代码注释与文档使用中文，注释密度高、面向新手，解释「为什么这样做」而不只是「做了什么」——新增代码应延续这一风格。

## 常用命令

```bash
npm install
npm run dev        # Vite 开发服务器，http://localhost:5173
npm run build      # 构建到 dist/
npm run preview    # 预览构建结果
npm run lint       # ESLint
npm run lint:fix   # ESLint 自动修复
npm run format     # Prettier 格式化全部文件
```

没有测试框架，也没有单测/单测运行命令。验证方式是 `npm run lint` + 在浏览器里实际操作 demo。

要求 Node.js >= 20.19。

## 核心架构：注册表驱动

`src/demos/registry.js` 是路由与侧边栏的唯一数据源：

- `demoGroups` 数组按分组（`canvas`、`three`）列出 demo，每条记录含 `slug / title / description / load`。
- `src/router/index.jsx` 用 `React.lazy` + `flatMap` 把每条记录转成 `/demos/<group.key>/<slug>` 路由，首次访问才动态加载。
- `src/layouts/MainLayout/index.jsx` 直接遍历同一份数据渲染侧边栏。

因此新增 demo 只需：建目录、写组件 → 在 `registry.js` 对应分组追加一条 → 路由和侧边栏自动出现。不需要改路由或布局文件。

## demo 组织约定

```
src/demos/<group>/<module>/
├── README.md          # 练习目标、实现要点、验收清单
├── shared.css         # 该模块各变体共用的界面样式
├── native/index.jsx   # 原生实现
├── native/index.css   # 首行 @import '../shared.css'
└── <library>/index.jsx # 库实现（konva / cropperjs / pixijs / echarts / fabric）
```

- 组件以 `index.jsx` 默认导出，样式写在同目录 `index.css`；各变体 CSS 用 `@import '../shared.css'` 复用公共布局，保证两个版本可对照。
- 目录与 slug 使用 kebab-case；slug 在 registry 中全局唯一，通常带变体后缀（如 `line-chart-native`、`line-chart-echarts`）。
- 每个模块目录的 `README.md` 记录学习目标与验收清单；`src/demos/README.md` 维护整体模块表和 Three.js 学习顺序（新增 Three.js demo 时同步更新勾选状态）。

## Canvas demo 的共同模式

- 用 `Pointer Events` + `setPointerCapture` 处理鼠标/触屏，坐标通过 `getBoundingClientRect()` 换算，不依赖 `offsetX`。
- 尺寸处理：CSS 尺寸与位图尺寸分离，`canvas.width = clientWidth * dpr`，再 `ctx.scale(dpr, dpr)`；用 `ResizeObserver` 跟随容器而非 `window.resize`。
- 业务数据优先于像素：笔画/标注等存为归一化坐标（0~1）的数据结构，再据此重绘，从而支持缩放、撤销重做、导出。
- 动画统一用 `requestAnimationFrame`，卸载时 `cancelAnimationFrame`、移除监听、断开 observer。

## Three.js demo 的共同模式

- 场景完全命令式，React 只提供一个挂载容器（`useRef` 的 div），canvas 由 `WebGLRenderer` 创建后 `appendChild`。
- 初始化与清理都写在同一个 `useEffect` 里，按「场景 → 相机 → 渲染器 → 物体 → 光照 → 尺寸 → 循环 → 清理」排列。
- 尺寸适配用 `ResizeObserver`：更新 `camera.aspect` + `updateProjectionMatrix()` + `renderer.setSize()`。
- 动画用 `THREE.Timer` 的 `delta` 驱动（每帧先 `timer.update(timestamp)` 再 `getDelta()`），保证速度不受刷新率影响；`timer.connect(document)` 让后台标签页恢复时不会产生超大 delta。`THREE.Clock` 在 r186 已废弃。
- 卸载时必须清理：`cancelAnimationFrame`、`controls.dispose()`、`disposeObject3D(scene)`、`disposeRenderer(renderer)`、移除 `renderer.domElement`。释放工具在 `src/three/dispose.js`——Three.js 的几何体/材质/贴图/WebGL 上下文不受 GC 管理，StrictMode 的双次挂载会暴露遗漏。
- 需要在运行时调参时，用 `useRef` 持有 Three.js 对象，事件处理里直接修改；不要在动画闭包里读 React state。
- `OrbitControls` 从 `three/addons/controls/OrbitControls.js` 导入；开启 `enableDamping` 后每帧必须调用 `controls.update()`。

## 路径与资源

- `@/` 指向 `src/`，在 `vite.config.js`（构建）和 `jsconfig.json`（编辑器）两处都配置过。新增别名需同时改这两个文件。
- `public/` 下资源用绝对路径引用，如 `/models/city/scene.gltf`、`/samples/annotation-scene.svg`。
- 全局 CSS 变量（颜色、圆角、阴影）定义在 `src/styles/global.css`，demo 内引用变量而非写死色值，避免污染全局样式。

## 代码风格

- Prettier：单引号、分号、宽度 100、尾逗号 `all`、箭头函数参数始终带括号。
- ESLint 使用 flat config；`no-unused-vars` 忽略大写开头标识符（组件/构造器）。
- ESM（`"type": "module"`），JSX 而非 TypeScript。
