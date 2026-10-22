import { Link } from 'react-router-dom';

export default function NotFound() {
  return (
    <div>
      <h1>404</h1>
      <p>页面不存在，或者对应的 demo 还没有创建。</p>
      <Link to="/">返回首页</Link>
    </div>
  );
}
