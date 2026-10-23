# demos 目录约定

所有教学 demo 都放在这里，按学习方向分组：

```
src/demos/
├── canvas/           Canvas 2D
│   └── <demo-name>/
│       ├── index.jsx
│       └── index.css
├── three/            Three.js
│   └── <demo-name>/
│       ├── index.jsx
│       └── index.css
└── registry.js       demo 注册表
```

## 已规划的学习模块

Three.js 分组的前两个 demo 以及全部 Canvas 模块均已实现。每个 Canvas 模块先做原生版，再用库做一份对照。

| 模块 | 目录 | 变体 |
| --- | --- | --- | --- |
| 涂鸦画板 | `canvas/doodle-board/` | 原生、Konva |
| 头像裁剪 | `canvas/avatar-crop/` | 原生、cropperjs |
| 刮刮乐 | `canvas/scratch-card/` | 原生 |
| 粒子背景 | `canvas/particle-background/` | 原生、PixiJS |
| 手写折线图 | `canvas/line-chart/` | 原生、ECharts |
| 图片标注 | `canvas/image-annotation/` | 原生、Fabric.js |
| 旋转立方体 | `three/basic-cube/` | 原生 |
| 光照与阴影 | `three/lighting-shadow/` | 原生 |

各模块的目标、实现要点、验收清单见对应目录下的 `README.md`。

## Three.js 学习顺序

按这个顺序新增 demo，每一步只引入一个新概念：

1. [x] 旋转立方体 —— Scene / Camera / Renderer、渲染循环、尺寸适配
2. [x] 光照与阴影 —— 平行光、半球光、阴影贴图、OrbitControls
3. [ ] 纹理与地球 —— TextureLoader、色彩空间、球体 UV
4. [ ] glTF 模型加载 —— 异步加载、模型居中、资源释放
5. [ ] 粒子星空 —— BufferGeometry、Points、顶点属性
6. [ ] 射线拾取 —— Raycaster、NDC 坐标、悬停高亮
7. [ ] 后处理 —— EffectComposer、Bloom
8. [ ] 实例化渲染 —— InstancedMesh、draw call 与性能观测
9. [ ] ShaderMaterial 入门 —— 顶点着色器与片段着色器

## 命名

- 目录名使用 kebab-case，例如 `basic-cube`、`render-loop`。
- 每个 demo 以 `index.jsx` 作为默认导出组件，样式写在同目录的 `index.css`。
- 需要复用的 Three.js 封装放到 `src/three/`，不要写进 demo 目录。

## 注册

在 `registry.js` 对应分组的 `demos` 数组里追加一条记录：

```js
{
  slug: 'basic-cube',
  title: '旋转立方体',
  description: 'Three.js 的第一个场景',
  load: () => import('@/demos/three/basic-cube'),
}
```

侧边栏链接和路由会自动生成。
