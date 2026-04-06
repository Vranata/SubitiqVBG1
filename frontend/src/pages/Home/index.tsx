import React from 'react';
import Hero from './Hero';
import { Typography } from 'antd';

const { Text } = Typography;

const Home: React.FC = () => {
  return (
    <div className="home-page" style={{ maxWidth: '1200px', margin: '0 auto', padding: '40px 24px' }}>
      <Hero />
      <div style={{ textAlign: 'center', marginTop: '40px' }}>
        <h2>Нашите функции</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '24px', marginTop: '32px' }}>
          <div style={{ padding: '24px', background: '#f5f5f5', borderRadius: '8px' }}>
            <h3>Персонализация</h3>
            <p>Откриване на събития според твоите интереси.</p>
            <Text style={{ display: 'block', marginTop: '12px', color: 'var(--accent)', fontWeight: 600 }}>
              Направи си акаунт в CULTURO BG, за тази функция.
            </Text>
          </div>
          <div style={{ padding: '24px', background: '#f5f5f5', borderRadius: '8px' }}>
            <h3>Бърз достъп</h3>
            <p>Всички важни детайли на едно място.</p>
          </div>
          <div style={{ padding: '24px', background: '#f5f5f5', borderRadius: '8px' }}>
            <h3>Уведомления</h3>
            <p>Никога не изпускай интересно събитие.</p>
            <Text style={{ display: 'block', marginTop: '12px', color: 'var(--accent)', fontWeight: 600 }}>
              Направи си акаунт в CULTURO BG, за тази функция.
            </Text>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Home;
