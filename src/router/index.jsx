import { Suspense, lazy } from 'react';
import { createBrowserRouter } from 'react-router-dom';
import MainLayout from '@/layouts/MainLayout';
import Home from '@/pages/Home';
import NotFound from '@/pages/NotFound';
import { demoGroups } from '@/demos/registry';

/**
 * 把注册表中的 load 函数转成路由元素。
 * demo 使用动态 import，首次访问时才加载，后续 demo 变多也不会拖慢首页。
 */
function renderLazyDemo(load) {
  const Demo = lazy(load);

  return (
    <Suspense fallback={<p className="page-loading">正在加载 demo…</p>}>
      <Demo />
    </Suspense>
  );
}

const demoRoutes = demoGroups.flatMap((group) =>
  group.demos.map((demo) => ({
    path: `demos/${group.key}/${demo.slug}`,
    element: renderLazyDemo(demo.load),
  })),
);

export const router = createBrowserRouter([
  {
    path: '/',
    element: <MainLayout />,
    children: [
      { index: true, element: <Home /> },
      ...demoRoutes,
      { path: '*', element: <NotFound /> },
    ],
  },
]);
