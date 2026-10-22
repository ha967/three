import { NavLink, Outlet } from 'react-router-dom';
import { site } from '@/config/site';
import { demoGroups } from '@/demos/registry';
import './index.css';

export default function MainLayout() {
  return (
    <div className="app">
      <header className="app-header">
        <NavLink to="/" className="app-brand">
          <span className="app-brand-mark" aria-hidden="true" />
          {site.name}
        </NavLink>
        <span className="app-tagline">{site.tagline}</span>
      </header>

      <div className="app-body">
        <aside className="app-sidebar" aria-label="demo 目录">
          {demoGroups.map((group) => (
            <section className="app-group" key={group.key}>
              <h2 className="app-group-title">{group.title}</h2>
              {group.demos.length > 0 ? (
                <ul className="app-group-list">
                  {group.demos.map((demo) => (
                    <li key={demo.slug}>
                      <NavLink
                        to={`/demos/${group.key}/${demo.slug}`}
                        className={({ isActive }) =>
                          isActive ? 'app-link app-link-active' : 'app-link'
                        }
                      >
                        {demo.title}
                      </NavLink>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="app-group-empty">暂无 demo</p>
              )}
            </section>
          ))}
        </aside>

        <main className="app-main">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
