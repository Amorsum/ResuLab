import { NavLink } from 'react-router-dom';
import StudioBrand from './StudioBrand';
import UserMenu from './UserMenu';

const destinations = [
  ['/', '首页 · 全部功能'], ['/builder', '简历编辑'], ['/library', '经历库'],
  ['/jobs', '求职工作台'], ['/my-resumes', '云端简历'], ['/account', '账号设置'],
];

export default function AppHeader() {
  return <header className="app-header">
    <div className="app-header-inner">
      <StudioBrand />
      <nav className="app-navigation" aria-label="主导航">
        {destinations.map(([to, label]) => <NavLink key={to} to={to} end={to === '/'}>{label}</NavLink>)}
      </nav>
      <div className="app-user"><UserMenu /></div>
    </div>
  </header>;
}
