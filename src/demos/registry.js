/**
 * demo 注册表。
 *
 * 新增一个 demo 只需要三步：
 * 1. 在 src/demos/<分组>/<demo 目录>/index.jsx 编写组件；
 * 2. 在本文件的对应分组 demos 数组里追加一条记录；
 * 3. 刷新页面，侧边栏链接与路由会自动生成。
 *
 * 示例：
 *   {
 *     slug: 'basic-cube',
 *     title: '旋转立方体',
 *     description: 'Three.js 的第一个场景',
 *     load: () => import('@/demos/three/basic-cube'),
 *   }
 *
 * @typedef {Object} Demo
 * @property {string} slug URL 片段，建议使用 kebab-case，例如 'basic-cube'
 * @property {string} title 侧边栏与页面标题
 * @property {string} description 一句话说明
 * @property {() => Promise<{ default: import('react').ComponentType }>} load 动态导入函数
 */

/**
 * @type {{
 *   key: string,
 *   title: string,
 *   description: string,
 *   demos: Demo[],
 * }[]}
 */
export const demoGroups = [
  {
    key: 'canvas',
    title: 'Canvas 2D',
    description: '从基础绘图 API 到动画、交互与坐标系变换。',
    demos: [
      {
        slug: 'scratch-card-native',
        title: '刮刮乐',
        description: 'destination-out 擦除涂层，按刮开比例自动揭晓',
        load: () => import('@/demos/canvas/scratch-card/native'),
      },
      {
        slug: 'doodle-board-native',
        title: '涂鸦画板（原生）',
        description: '归一化坐标、DPR、rAF 重绘与撤销重做',
        load: () => import('@/demos/canvas/doodle-board/native'),
      },
      {
        slug: 'doodle-board-konva',
        title: '涂鸦画板（Konva）',
        description: '用 react-konva 的声明式节点实现同样的画板',
        load: () => import('@/demos/canvas/doodle-board/konva'),
      },
      {
        slug: 'avatar-crop-native',
        title: '头像裁剪（原生）',
        description: '拖拽、滚轮缩放、圆形遮罩与离屏导出',
        load: () => import('@/demos/canvas/avatar-crop/native'),
      },
      {
        slug: 'avatar-crop-cropperjs',
        title: '头像裁剪（cropperjs）',
        description: '用 cropperjs 管理裁剪框与圆形输出',
        load: () => import('@/demos/canvas/avatar-crop/cropperjs'),
      },
      {
        slug: 'particle-background-native',
        title: '粒子背景（原生）',
        description: 'rAF 渲染循环、鼠标斥力与距离连线',
        load: () => import('@/demos/canvas/particle-background/native'),
      },
      {
        slug: 'particle-background-pixijs',
        title: '粒子背景（PixiJS）',
        description: 'Sprite 批量渲染与 ticker 驱动的粒子系统',
        load: () => import('@/demos/canvas/particle-background/pixijs'),
      },
      {
        slug: 'line-chart-native',
        title: '手写折线图',
        description: '布局、nice 刻度、渐变面积与悬停 tooltip',
        load: () => import('@/demos/canvas/line-chart/native'),
      },
      {
        slug: 'line-chart-echarts',
        title: '折线图（ECharts）',
        description: '用配置描述坐标轴、图例与交互',
        load: () => import('@/demos/canvas/line-chart/echarts'),
      },
      {
        slug: 'image-annotation-native',
        title: '图片标注（原生）',
        description: '归一化坐标、命中检测、移动缩放与历史快照',
        load: () => import('@/demos/canvas/image-annotation/native'),
      },
      {
        slug: 'image-annotation-fabric',
        title: '图片标注（Fabric.js）',
        description: '用对象模型与控制点实现标注编辑',
        load: () => import('@/demos/canvas/image-annotation/fabric'),
      },
    ],
  },
  {
    key: 'three',
    title: 'Three.js',
    description: '场景、相机、渲染器、几何体、材质与光照。',
    demos: [
      {
        slug: 'basic-cube',
        title: '旋转立方体',
        description: '场景、相机、渲染器与渲染循环',
        load: () => import('@/demos/three/basic-cube'),
      },
      {
        slug: 'lighting-shadow',
        title: '光照与阴影',
        description: '平行光、半球光、阴影贴图与 OrbitControls',
        load: () => import('@/demos/three/lighting-shadow'),
      },
    ],
  },
];
