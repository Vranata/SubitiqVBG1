// Placeholder for App.tsx
import React from 'react';
import { BrowserRouter as Router, Routes, Route, Link } from 'react-router-dom';
import { ConfigProvider, Layout, Menu, theme } from 'antd';
import { HomeOutlined, CalendarOutlined, LoginOutlined } from '@ant-design/icons';

const { Header, Content, Footer } = Layout;

const App: React.FC = () => {
  const {
    token: { colorBgContainer, borderRadiusLG },
  } = theme.useToken();

  return (
    <ConfigProvider
      theme={{
        token: {
          colorPrimary: '#1890ff',
          borderRadius: 6,
        },
      }}
    >
      <Router>
        <Layout className="layout" style={{ minHeight: '100vh' }}>
          <Header style={{ display: 'flex', alignItems: 'center' }}>
            <div className="demo-logo" style={{ color: 'white', marginRight: '24px', fontWeight: 'bold' }}>
              SUBITIQ VBG
            </div>
            <Menu
              theme="dark"
              mode="horizontal"
              defaultSelectedKeys={['1']}
              items={[
                { key: '1', icon: <HomeOutlined />, label: <Link to="/">Начало</Link> },
                { key: '2', icon: <CalendarOutlined />, label: <Link to="/events">Събития</Link> },
                { key: '3', icon: <LoginOutlined />, label: <Link to="/auth">Вход</Link> },
              ]}
              style={{ flex: 1, minWidth: 0 }}
            />
          </Header>
          <Content style={{ padding: '24px 48px' }}>
            <div
              style={{
                background: colorBgContainer,
                minHeight: 280,
                padding: 24,
                borderRadius: borderRadiusLG,
              }}
            >
              <Routes>
                <Route path="/" element={<h2>Добре дошли в Subitiq VBG</h2>} />
                <Route path="/events" element={<h2>Всички Събития</h2>} />
                <Route path="/events/:id" element={<h2>Детайли за събитието</h2>} />
                <Route path="/auth" element={<h2>Вход в системата</h2>} />
              </Routes>
            </div>
          </Content>
          <Footer style={{ textAlign: 'center' }}>
            Subitiq VBG ©{new Date().getFullYear()} Created for Diploma Project
          </Footer>
        </Layout>
      </Router>
    </ConfigProvider>
  );
};

export default App;
