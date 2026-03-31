import React, { useEffect, useMemo, useState } from 'react';
import { Route, Link } from 'atomic-router-react';
import { Button, ConfigProvider, Layout, Menu, Tooltip, theme as antdTheme } from 'antd';
import { BgColorsOutlined, CalendarOutlined, HomeOutlined, LoginOutlined, MoonOutlined, SunOutlined } from '@ant-design/icons';
import { history, routes } from './shared/routing';
import './theme.css';

import Home from './pages/Home/index';
import Events from './pages/Events/index';
import EventDetails from './pages/EventDetails/index';
import Login from './pages/Login/index';

const { Header, Content, Footer } = Layout;

type ThemeMode = 'light' | 'dark' | 'orange';

const themeOrder: ThemeMode[] = ['light', 'dark', 'orange'];

const getRouteKey = (pathname: string) => {
  if (pathname === '/') return 'home';
  if (pathname.startsWith('/events')) return 'events';
  if (pathname === '/login') return 'login';
  return 'home';
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

const AppMenu: React.FC<{ themeMode: ThemeMode }> = ({ themeMode }) => {
  const [selectedKey, setSelectedKey] = useState(() => getRouteKey(typeof window !== 'undefined' ? window.location.pathname : '/'));

  useEffect(() => {
    const unlisten = history.listen(({ location }) => {
      setSelectedKey(getRouteKey(location.pathname));
    });

    return () => {
      unlisten();
    };
  }, []);

  return (
    <Menu
      theme={themeMode === 'orange' ? 'light' : 'dark'}
      mode="horizontal"
      selectedKeys={[selectedKey]}
      style={{ flex: 1, minWidth: 0, borderBottom: 'none', background: 'transparent' }}
      items={[
        {
          key: 'home',
          icon: <HomeOutlined />,
          label: <Link to={routes.home}>Начало</Link>,
        },
        {
          key: 'events',
          icon: <CalendarOutlined />,
          label: <Link to={routes.events}>Събития</Link>,
        },
        {
          key: 'login',
          icon: <LoginOutlined />,
          label: <Link to={routes.login}>Вход</Link>,
        },
      ]}
    />
  );
};

const App: React.FC = () => {
  const [themeMode, setThemeMode] = useState<ThemeMode>('light');

  const themeConfig = useMemo(() => getThemeConfig(themeMode), [themeMode]);

  const cycleTheme = () => {
    const nextIndex = (themeOrder.indexOf(themeMode) + 1) % themeOrder.length;
    setThemeMode(themeOrder[nextIndex]);
  };

  const themeIcon = themeMode === 'light' ? <MoonOutlined /> : themeMode === 'dark' ? <BgColorsOutlined /> : <SunOutlined />;
  const themeTooltip = themeMode === 'light' ? 'Тъмна тема' : themeMode === 'dark' ? 'Оранжева тема' : 'Светла тема';

  return (
    <ConfigProvider theme={themeConfig}>
      <Layout className="layout" data-theme={themeMode} style={{ minHeight: '100vh', background: 'var(--page-bg)', position: 'relative', overflow: 'hidden' }}>
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
            position: 'sticky',
            top: 0,
            zIndex: 10000,
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

          <AppMenu themeMode={themeMode} />

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
        </Header>

        <Content style={{ padding: '0', position: 'relative', zIndex: 1 }}>
          <div style={{ minHeight: 'calc(100vh - 134px)' }}>
            <Route route={routes.home} view={Home} />
            <Route route={routes.events} view={Events} />
            <Route route={routes.eventDetails} view={EventDetails} />
            <Route route={routes.login} view={Login} />
          </div>
        </Content>

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
      </Layout>
    </ConfigProvider>
  );
};

export default App;
