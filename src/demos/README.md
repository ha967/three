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

目前只创建了目录与说明文档，实现代码待补充。每个模块先做原生版，再用库做一份对照。

| 模块 | 目录 | 变体 | 难度 |
| --- | --- | --- | --- |
| 涂鸦画板 | `canvas/doodle-board/` | 原生、Konva | ★★☆ |
| 头像裁剪 | `canvas/avatar-crop/` | 原生、cropperjs | ★★☆ |
| 刮刮乐 | `canvas/scratch-card/` | 原生 | ★☆☆ |
| 粒子背景 | `canvas/particle-background/` | 原生、PixiJS | ★★☆ |
| 手写折线图 | `canvas/line-chart/` | 原生、ECharts | ★★★ |
| 图片标注 | `canvas/image-annotation/` | 原生、Fabric.js | ★★★ |

各模块的目标、实现要点、验收清单见对应目录下的 `README.md`。

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
