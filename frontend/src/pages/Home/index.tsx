import React, { useEffect } from 'react';
import { useUnit } from 'effector-react';
import { Typography, Row, Col, Card, Tag, Button } from 'antd';
import { EnvironmentOutlined, CalendarOutlined, ArrowRightOutlined } from '@ant-design/icons';
import { Link } from 'atomic-router-react';
import Hero from './Hero';
import { $featuredEvents, homePageOpened } from '../../entities/events/model';
import { routes } from '../../shared/routing';

const { Title, Text } = Typography;

const Home: React.FC = () => {
  const { featuredEvents, enterPage } = useUnit({
    featuredEvents: $featuredEvents,
    enterPage: homePageOpened,
  });

  useEffect(() => {
    enterPage();
  }, [enterPage]);

  return (
    <div className="home-page" style={{ maxWidth: '1200px', margin: '0 auto', padding: '0 24px 80px' }}>
      <Hero />

      {featuredEvents.length > 0 && (
        <div style={{ marginTop: '64px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '32px' }}>
            <div>
              <Title level={2} style={{ marginBottom: '8px', color: 'var(--text-primary)' }}>Избрано за вас</Title>
              <Text type="secondary">Най-интересните предстоящи събития, подбрани специално за теб.</Text>
            </div>
            <Link to={routes.events}>
              <Button type="link" size="large">Виж всички събития <ArrowRightOutlined /></Button>
            </Link>
          </div>

          <Row gutter={[24, 24]}>
            {featuredEvents.map((event) => (
              <Col xs={24} sm={12} lg={8} key={event.id}>
                <Link to={routes.eventDetails} params={{ id: event.id }}>
                  <Card
                    hoverable
                    cover={
                      <img
                        alt={event.title}
                        src={event.image}
                        style={{ height: '200px', objectFit: 'cover' }}
                      />
                    }
                    style={{ background: 'var(--surface-bg)', border: '1px solid var(--border-color)', boxShadow: 'var(--shadow-soft)' }}
                    styles={{ body: { padding: '16px' } }}
                  >
                    <Tag color="blue" style={{ marginBottom: '8px' }}>{event.category}</Tag>
                    <Title level={5} style={{ marginBottom: '12px', minHeight: '48px', color: 'var(--text-primary)' }}>{event.title}</Title>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', color: 'var(--text-secondary)' }}>
                      <Text type="secondary"><EnvironmentOutlined /> {event.region}</Text>
                      <Text type="secondary"><CalendarOutlined /> {event.date}</Text>
                    </div>
                  </Card>
                </Link>
              </Col>
            ))}
          </Row>
        </div>
      )}
    </div>
  );
};

export default Home;
