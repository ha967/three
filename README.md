# three

本仓库为学习 Canvas、Three.js 图形绘制与 3D 处理的仓库。

工程使用 **Vite + React**，所有学习内容以「独立 demo」的形式组织：每个知识点一个目录，在注册表中登记后自动出现在侧边栏和路由里。

## 技术栈

| 类别 | 选型 |
| --- | --- |
| 构建工具 | [Vite](https://vite.dev/) |
| 框架 | [React 19](https://react.dev/) + JSX |
| 路由 | [React Router](https://reactrouter.com/) |
| 3D / 绘图 | [Three.js](https://threejs.org/)、Canvas 2D API |
| 代码规范 | ESLint + Prettier |

> 语言选择 JavaScript 而不是 TypeScript，是为了在学习阶段减少类型噪音；后续需要时可以平滑迁移。

## 快速开始

要求 Node.js >= 20.19（Vite 7 的最低版本）。

```bash
npm install
npm run dev      # 启动开发服务器，默认 http://localhost:5173
```

常用命令：

| 命令 | 说明 |
| --- | --- |
| `npm run dev` | 启动开发服务器（热更新） |
| `npm run build` | 构建生产版本到 `dist/` |
| `npm run preview` | 本地预览构建结果 |
| `npm run lint` | 检查代码规范 |
| `npm run lint:fix` | 自动修复可修复的规范问题 |
| `npm run format` | 使用 Prettier 格式化 |

## 目录结构

```text
three/
├── public/
│   ├── favicon.svg
│   └── models/                 # 3D 模型与贴图（构建时原样复制）
│       └── city/               # glTF 城市模型
├── src/
│   ├── assets/                 # 参与构建的图片、字体等静态资源
│   ├── components/             # 通用展示组件（与具体 demo 无关）
│   ├── config/                 # 站点级配置常量
│   ├── demos/                  # demo
│   │   ├── canvas/             #   Canvas 2D 分组
│   │   ├── three/              #   Three.js 分组
│   │   └── registry.js         #   demo 注册表（路由 / 侧边栏的唯一数据源）
│   ├── hooks/                  # 可复用 React Hook
│   ├── layouts/                # 页面骨架（导航 + 侧边栏）
│   ├── pages/                  # 路由页面
│   ├── router/                 # 路由配置
│   ├── styles/                 # 全局样式与 reset
│   ├── three/                  # Three.js 封装：场景、相机、渲染器、加载器
│   ├── utils/                  # 与框架无关的工具函数
│   ├── App.jsx
│   └── main.jsx
├── index.html
├── vite.config.js              # Vite 配置（含 @ -> src 别名）
├── jsconfig.json               # 编辑器路径别名提示
└── eslint.config.js
```

## 新增一个 demo

1. 在对应分组下创建目录，例如 `src/demos/three/basic-cube/index.jsx`：

   ```jsx
   export default function BasicCube() {
     return <div>旋转立方体</div>;
   }
   ```

2. 在 `src/demos/registry.js` 的 `three` 分组里登记：

   ```js
   {
     slug: 'basic-cube',
     title: '旋转立方体',
     description: 'Three.js 的第一个场景',
     load: () => import('@/demos/three/basic-cube'),
   }
   ```

3. 保存后，侧边栏链接与 `/demos/three/basic-cube` 路由会自动生成。

更多约定见 [src/demos/README.md](src/demos/README.md)。

## 约定

- 使用 `@/` 指向 `src/`，例如 `import { site } from '@/config/site'`，避免 `../../../`。
- 每个 demo 自带 `index.css`，不要污染全局样式；全局变量定义在 `src/styles/global.css`。
- 可复用的 Three.js 场景、相机、渲染器代码放到 `src/three/`，demo 只负责组装和演示。
- `public/` 下的资源通过绝对路径引用，例如城市模型：`/models/city/scene.gltf`。

## 学习路线

1. **Canvas 2D**：`getContext`、路径与填充、颜色与渐变、坐标系变换、动画与交互。
2. **Three.js 基础**：Scene / Camera / Renderer、几何体与材质、光照与阴影、OrbitControls。
3. **进阶**：模型加载（glTF）、纹理、动画循环、性能与后处理。
