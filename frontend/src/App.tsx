import React, { useEffect, useMemo, useState } from 'react';
import { Route, Link } from 'atomic-router-react';
import { useUnit } from 'effector-react';
import { Button, ConfigProvider, Drawer, FloatButton, Layout, Tooltip, theme as antdTheme } from 'antd';
import {
  BgColorsOutlined,
  CalendarOutlined,
  HeartOutlined,
  HomeOutlined,
  LoginOutlined,
  LogoutOutlined,
  MenuOutlined,
  MoonOutlined,
  StarOutlined,
  SunOutlined,
  UserOutlined
} from '@ant-design/icons';
import { history, routes } from './shared/routing';
import { $isAuthenticated, $user, $isAdmin, signOutFx } from './entities/model';
import UserUpgradePopover from './components/UserUpgradePopover';
import './theme.css';

import Home from './pages/Home/index';
import Events from './pages/Events/index';
import EventDetails from './pages/EventDetails/index';
import Favorites from './pages/Favorites/index';
import Login from './pages/Login/index';
import Recommended from './pages/Recommended/index';
import AdminMessage from './pages/AdminMessage/index';
import AdminUsers from './pages/AdminUsers/index';
import LocationInitializer from './components/LocationInitializer';

const { Header, Content, Footer } = Layout;

type ThemeMode = 'light' | 'dark' | 'orange';

const themeOrder: ThemeMode[] = ['light', 'dark', 'orange'];

const getRouteKey = (pathname: string) => {
  if (pathname === '/') return 'home';
  if (pathname.startsWith('/events')) return 'events';
  if (pathname === '/recommended') return 'recommended';
  if (pathname === '/favorites') return 'favorites';
  if (pathname === '/login') return 'login';
  if (pathname === '/admin-result') return 'admin-result';
  if (pathname === '/admin/users') return 'admin-users';
  return 'home';
};

interface NavigationItem {
  key: string;
  icon: React.ReactNode;
  to: any;
  label: string;
}

const SidebarNavigation: React.FC<{ themeMode: ThemeMode; selectedKey: string; items: NavigationItem[]; compact?: boolean }> = ({ themeMode, selectedKey, items, compact = false }) => {
  const isDark = themeMode === 'dark';

  return (
    <nav className={compact ? 'app-navigation app-navigation-compact' : 'app-navigation'} data-theme={isDark ? 'dark' : 'light'} aria-label="Основна навигация">
      {items.map((item) => (
        <Link
          key={item.key}
          to={item.to}
          className={`app-navigation-link${selectedKey === item.key ? ' app-navigation-link-active' : ''}`}
        >
          <span className="app-navigation-link-icon">{item.icon}</span>
          <span className="app-navigation-link-label">{item.label}</span>
        </Link>
      ))}
    </nav>
  );
};

const getThemeConfig = (mode: ThemeMode) => {
  if (mode === 'dark') {
    return {
      algorithm: antdTheme.darkAlgorithm,
      token: {
        colorPrimary: '#177ddc',
        borderRadius: 10,
      },
    };
  }

  if (mode === 'orange') {
    return {
      algorithm: antdTheme.defaultAlgorithm,
      token: {
        colorPrimary: '#c65a00',
        colorInfo: '#c65a00',
        borderRadius: 12,
      },
    };
  }

  return {
    algorithm: antdTheme.defaultAlgorithm,
    token: {
      colorPrimary: '#1890ff',
      borderRadius: 8,
    },
  };
};

const App: React.FC = () => {
  const [themeMode, setThemeMode] = useState<ThemeMode>('light');
  const [selectedKey, setSelectedKey] = useState(() => getRouteKey(typeof window !== 'undefined' ? window.location.pathname : '/'));
  const [isMobileDrawerOpen, setIsMobileDrawerOpen] = useState(false);

  const { isAuthenticated, signOut, user, isAdmin } = useUnit({
    isAuthenticated: $isAuthenticated,
    user: $user,
    signOut: signOutFx,
    isAdmin: $isAdmin,
  });

  const activeNavigationItems = useMemo<NavigationItem[]>(() => {
    const baseItems: NavigationItem[] = [
      {
        key: 'home',
        icon: <HomeOutlined />,
        to: routes.home,
        label: 'Начало',
      },
      {
        key: 'events',
        icon: <CalendarOutlined />,
        to: routes.events,
        label: 'Всички събития',
      },
      {
        key: 'recommended',
        icon: <StarOutlined />,
        to: routes.recommended,
        label: 'Препоръчано за теб',
      },
      {
        key: 'favorites',
        icon: <HeartOutlined />,
        to: routes.favorites,
        label: 'Любими',
      },
    ];

    if (isAdmin) {
      baseItems.push({
        key: 'admin-users',
        icon: <UserOutlined />,
        to: routes.adminUsers,
        label: 'Управление',
      });
    }

    return baseItems;
  }, [isAdmin]);

  const themeConfig = useMemo(() => getThemeConfig(themeMode), [themeMode]);

  const cycleTheme = () => {
    const nextIndex = (themeOrder.indexOf(themeMode) + 1) % themeOrder.length;
    setThemeMode(themeOrder[nextIndex]);
  };

  const themeIcon = themeMode === 'light' ? <MoonOutlined /> : themeMode === 'dark' ? <BgColorsOutlined /> : <SunOutlined />;
  const themeTooltip = themeMode === 'light' ? 'Тъмна тема' : themeMode === 'dark' ? 'Оранжева тема' : 'Светла тема';

  useEffect(() => {
    const unlisten = history.listen(({ location }) => {
      setSelectedKey(getRouteKey(location.pathname));
    });

    return () => {
      unlisten();
    };
  }, []);

  return (
    <ConfigProvider theme={themeConfig}>
      <Layout className="layout" data-theme={themeMode} style={{ minHeight: '100vh', background: 'var(--page-bg)', position: 'relative', overflow: 'hidden' }}>
        <LocationInitializer />

        {themeMode === 'orange' && (
          <>
            <div aria-hidden="true" style={{ position: 'absolute', inset: 0, pointerEvents: 'none', backgroundImage: 'radial-gradient(circle at 15% 20%, rgba(198,90,0,0.18) 0, rgba(198,90,0,0.18) 2px, transparent 2px), radial-gradient(circle at 80% 15%, rgba(198,90,0,0.12) 0, rgba(198,90,0,0.12) 1px, transparent 1px), radial-gradient(circle at 70% 80%, rgba(198,90,0,0.12) 0, rgba(198,90,0,0.12) 1px, transparent 1px)', backgroundSize: '180px 180px', opacity: 0.55 }} />
            <div aria-hidden="true" style={{ position: 'absolute', top: '-80px', right: '-80px', width: '260px', height: '260px', borderRadius: '50%', background: 'radial-gradient(circle, rgba(198,90,0,0.18) 0%, rgba(198,90,0,0.03) 60%, transparent 70%)', filter: 'blur(4px)', pointerEvents: 'none' }} />
            <div aria-hidden="true" style={{ position: 'absolute', bottom: '8%', left: '-120px', width: '280px', height: '280px', borderRadius: '50%', background: 'radial-gradient(circle, rgba(198,90,0,0.12) 0%, rgba(198,90,0,0.02) 60%, transparent 70%)', pointerEvents: 'none' }} />
          </>
        )}

        <Header
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 18,
            position: 'sticky',
            top: 0,
            zIndex: 1001,
            width: '100%',
            padding: '0 24px',
            background: 'var(--header-bg)',
            borderBottom: '1px solid var(--border-color)',
            boxShadow: 'var(--shadow-soft)',
            backdropFilter: 'blur(10px)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', marginRight: '24px', flexShrink: 0 }}>
            <span style={{ color: 'var(--header-text)', fontWeight: 900, fontSize: '1.05rem', letterSpacing: '0.8px' }}>
              CULTURO BG
            </span>
          </div>

          <div className="header-navigation-shell" style={{ flex: 1, display: 'flex', justifyContent: 'center' }}>
            <SidebarNavigation themeMode={themeMode} selectedKey={selectedKey} items={activeNavigationItems} compact />
          </div>


          <div className="header-actions-desktop">
            {isAuthenticated && user && <UserUpgradePopover user={user} />}

            {isAuthenticated ? (
              <Tooltip title="Изход">
                <Button
                  shape="circle"
                  type="text"
                  onClick={() => signOut()}
                  icon={<LogoutOutlined />}
                  style={{
                    width: 34,
                    height: 34,
                    marginLeft: 12,
                    color: 'var(--toggle-fg)',
                    background: 'var(--toggle-bg)',
                    border: '1px solid var(--toggle-border)',
                  }}
                />
              </Tooltip>
            ) : (
              <Tooltip title="Вход">
                <Link to={routes.login} style={{ display: 'inline-flex', marginLeft: 12 }}>
                  <Button
                    shape="circle"
                    type="text"
                    icon={<LoginOutlined />}
                    style={{
                      width: 34,
                      height: 34,
                      color: 'var(--toggle-fg)',
                      background: 'var(--toggle-bg)',
                      border: '1px solid var(--toggle-border)',
                    }}
                  />
                </Link>
              </Tooltip>
            )}
            <Tooltip title={themeTooltip}>
              <Button
                shape="circle"
                type="text"
                onClick={cycleTheme}
                icon={themeIcon}
                style={{
                  width: 34,
                  height: 34,
                  marginLeft: 12,
                  color: 'var(--toggle-fg)',
                  background: 'var(--toggle-bg)',
                  border: '1px solid var(--toggle-border)',
                }}
              />
            </Tooltip>
          </div>

          <Button
            className="mobile-menu-button"
            type="text"
            icon={<MenuOutlined />}
            onClick={() => setIsMobileDrawerOpen(!isMobileDrawerOpen)}
            style={{
              display: 'none',
              color: 'var(--header-text)',
              fontSize: '22px',
              padding: 0,
              width: 32,
              height: 32,
              marginLeft: 'auto'
            }}
          />
        </Header>

        <Layout style={{ minHeight: 'calc(100vh - 134px)', background: 'transparent', position: 'relative', zIndex: 1 }}>
          <Content style={{ padding: '24px', position: 'relative', zIndex: 1 }}>
            <div style={{ minHeight: 'calc(100vh - 198px)' }}>
              <Route route={routes.home} view={Home} />
              <Route route={routes.events} view={Events} />
              <Route route={routes.recommended} view={Recommended} />
              <Route route={routes.favorites} view={Favorites} />
              <Route route={routes.eventDetails} view={EventDetails} />
              <Route route={routes.login} view={Login} />
              <Route route={routes.adminMessage} view={AdminMessage} />
              <Route route={routes.adminUsers} view={AdminUsers} />
            </div>
          </Content>
        </Layout>

        <Footer
          style={{
            textAlign: 'center',
            background: 'var(--footer-bg)',
            color: 'var(--footer-text)',
            padding: '24px 50px',
            position: 'relative',
            zIndex: 1,
            borderTop: '1px solid var(--border-color)',
          }}
        >
          <div style={{ marginBottom: '12px', color: 'var(--header-text)' }}>CULTURO BG</div>
          ©{new Date().getFullYear()} Created for Diploma Project • Итеративен модел на разработка
        </Footer>

        <Drawer
          title="Меню"
          placement="right"
          onClose={() => setIsMobileDrawerOpen(false)}
          open={isMobileDrawerOpen}
          styles={{ 
            body: { padding: 0, background: 'var(--header-bg)' }, 
            header: { background: 'var(--header-bg)', borderBottom: '1px solid var(--border-color)', color: 'var(--header-text)' } 
          }}
          width={280}
        >
          <div style={{ padding: '24px 16px' }}>
            <div onClick={() => setIsMobileDrawerOpen(false)}>
              <SidebarNavigation themeMode={themeMode} selectedKey={selectedKey} items={activeNavigationItems} />
            </div>
            
            <div style={{ borderTop: '1px solid var(--border-color)', marginTop: '24px', paddingTop: '24px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
              {isAuthenticated && user && (
                <div style={{ padding: '0 14px' }}>
                   <UserUpgradePopover user={user} variant="vertical" />
                </div>
              )}
              
              <Button 
                block 
                size="large" 
                icon={themeIcon} 
                onClick={cycleTheme}
                style={{ borderRadius: '12px', background: 'var(--toggle-bg)', color: 'var(--toggle-fg)', border: '1px solid var(--toggle-border)' }}
              >
                {themeTooltip}
              </Button>

              {isAuthenticated ? (
                <Button 
                  block 
                  danger 
                  size="large" 
                  icon={<LogoutOutlined />} 
                  onClick={() => { signOut(); setIsMobileDrawerOpen(false); }}
                  style={{ borderRadius: '12px' }}
                >
                  Изход
                </Button>
              ) : (
                <Link to={routes.login} onClick={() => setIsMobileDrawerOpen(false)}>
                  <Button 
                    block 
                    type="primary" 
                    size="large" 
                    icon={<LoginOutlined />}
                    style={{ borderRadius: '12px' }}
                  >
                    Вход
                  </Button>
                </Link>
              )}
            </div>
          </div>
        </Drawer>

        {selectedKey !== 'home' && (
          <FloatButton.BackTop
            visibilityHeight={400}
            style={{ right: 24, bottom: 24 }}
          />
        )}
      </Layout>
    </ConfigProvider>
  );
};

export default App;
