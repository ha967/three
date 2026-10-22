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
