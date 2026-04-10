import React from 'react';
import Hero from './Hero';

const Home: React.FC = () => {
  return (
    <div className="home-page" style={{ maxWidth: '1200px', margin: '0 auto', padding: '40px 24px' }}>
      <Hero />
    </div>
  );
};

export default Home;
