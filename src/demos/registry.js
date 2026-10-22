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
    demos: [],
  },
  {
    key: 'three',
    title: 'Three.js',
    description: '场景、相机、渲染器、几何体、材质与光照。',
    demos: [],
  },
];
