// App.tsx
import React from 'react';
import { Route, Link } from 'atomic-router-react';
import logo from './assets/logo.svg';
import { ConfigProvider, Layout, Menu } from 'antd';
import { HomeOutlined, CalendarOutlined, LoginOutlined } from '@ant-design/icons';
import { routes } from './shared/routing';

// Страници
import Home from './pages/Home';
import Events from './pages/Events';
import EventDetails from './pages/EventDetails';
import Login from './pages/Login';

const { Header, Content, Footer } = Layout;

// Menu configuration using Atomic Router routes
const AppMenu: React.FC = () => {
  return (
    <Menu
      theme="dark"
      mode="horizontal"
      style={{ flex: 1, minWidth: 0, borderBottom: 'none' }}
      items={[
        { 
          key: 'home', 
          icon: <HomeOutlined />, 
          label: <Link to={routes.home}>Начало</Link> 
        },
        { 
          key: 'events', 
          icon: <CalendarOutlined />, 
          label: <Link to={routes.events}>Събития</Link> 
        },
        { 
          key: 'login', 
          icon: <LoginOutlined />, 
          label: <Link to={routes.login}>Вход</Link> 
        },
      ]}
    />
  );
};

const App: React.FC = () => {
  return (
    <ConfigProvider
      theme={{
        token: {
          colorPrimary: '#1890ff',
          borderRadius: 6,
        },
      }}
    >
      <Layout className="layout" style={{ minHeight: '100vh', background: '#f0f2f5' }}>
        <Header style={{ 
          display: 'flex', 
          alignItems: 'center', 
          position: 'sticky', 
          top: 0, 
          zIndex: 1, 
          width: '100%',
          padding: '0 24px'
        }}>
          <div className="demo-logo" style={{ display: 'flex', alignItems: 'center', marginRight: '24px' }}>
            <img src={logo} alt="CULTURO BG" style={{ height: 36, marginRight: 12 }} />
            <span style={{ color: 'white', fontWeight: 700, fontSize: '1rem', letterSpacing: '0.5px' }}>CULTURO BG</span>
          </div>
          <AppMenu />
        </Header>
        <Content style={{ padding: '0' }}>
          <div style={{ minHeight: 'calc(100vh - 134px)' }}>
            <Route route={routes.home} view={Home} />
            <Route route={routes.events} view={Events} />
            <Route route={routes.eventDetails} view={EventDetails} />
            <Route route={routes.login} view={Login} />
          </div>
        </Content>
        <Footer style={{ textAlign: 'center', background: '#001529', color: 'rgba(255,255,255,0.65)', padding: '24px 50px' }}>
          <div style={{ marginBottom: '12px', color: '#fff' }}>CULTURO BG</div>
          ©{new Date().getFullYear()} Created for Diploma Project • Итеративен модел на разработка
        </Footer>
      </Layout>
    </ConfigProvider>
  );
};

export default App;
