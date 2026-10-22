import { demoGroups } from '@/demos/registry';
import './index.css';

const structure = [
  ['src/demos/', '教学 demo，按 canvas / three 分组，后续内容主要放这里'],
  ['src/layouts/', '页面骨架：顶部导航 + 侧边栏'],
  ['src/pages/', '路由页面（首页、404 等）'],
  ['src/router/', '路由配置，demo 路由由注册表自动生成'],
  ['src/components/', '通用展示组件'],
  ['src/three/', 'Three.js 封装：场景、相机、渲染器、加载器'],
  ['src/hooks/', '可复用 React Hook'],
  ['src/utils/', '与框架无关的工具函数'],
  ['public/models/', '3D 模型与贴图资源，通过 /models/... 访问'],
];

export default function Home() {
  return (
    <div className="home">
      <section className="home-hero">
        <p className="home-eyebrow">LEARNING NOTES</p>
        <h1>Canvas &amp; Three.js 学习手册</h1>
        <p className="home-intro">
          这个仓库用来记录从 Canvas 2D 绘图到 Three.js 3D 场景的学习过程。 每个知识点都会以独立的
          demo 形式放进 <code>src/demos</code>，并在侧边栏中按分类展示。
        </p>
      </section>

      <section className="home-section">
        <h2 className="home-section-title">学习方向</h2>
        <div className="home-cards">
          {demoGroups.map((group) => (
            <article className="home-card" key={group.key}>
              <div className="home-card-head">
                <h3>{group.title}</h3>
                <span className="home-badge">{group.demos.length} 个 demo</span>
              </div>
              <p>{group.description}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="home-section">
        <h2 className="home-section-title">目录结构</h2>
        <dl className="home-structure">
          {structure.map(([path, description]) => (
            <div className="home-structure-row" key={path}>
              <dt>
                <code>{path}</code>
              </dt>
              <dd>{description}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="home-section">
        <h2 className="home-section-title">如何新增一个 demo</h2>
        <ol className="home-steps">
          <li>
            在 <code>src/demos/&lt;分组&gt;/&lt;demo 目录&gt;/index.jsx</code> 中编写组件。
          </li>
          <li>
            在 <code>src/demos/registry.js</code> 对应分组的 <code>demos</code> 数组中追加一条记录。
          </li>
          <li>侧边栏链接和路由会自动生成，无需再改其他地方。</li>
        </ol>
      </section>
    </div>
  );
}
