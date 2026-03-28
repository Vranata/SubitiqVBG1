import React from 'react';
import { useUnit } from 'effector-react';
import { Link } from 'atomic-router-react';
import { Button, Typography, Space, Tag, Divider, Row, Col, Card } from 'antd';
import { CalendarOutlined, EnvironmentOutlined, ArrowLeftOutlined, TagOutlined } from '@ant-design/icons';
import { DUMMY_EVENTS } from '../../services/constants';
import { routes } from '../../shared/routing';

const { Title, Paragraph, Text } = Typography;

const EventDetails: React.FC = () => {
  // Get the ID from the atomic-router route params
  const params = useUnit(routes.eventDetails.$params);
  const id = params?.id;

  // Намиране на съответното събитие от масива с dummy данни
  const event = DUMMY_EVENTS.find((e) => e.id === id);

  if (!event) {
    return (
      <div style={{ maxWidth: '1200px', margin: '40px auto', padding: '0 24px', textAlign: 'center' }}>
        <Title level={2}>Събитието не е намерено</Title>
        <Link to={routes.events}>
          <Button type="primary">Назад към списъка</Button>
        </Link>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '40px 24px' }}>
      <Link to={routes.events}>
        <Button 
          icon={<ArrowLeftOutlined />} 
          style={{ marginBottom: '24px' }}
        >
          Назад към списъка
        </Button>
      </Link>

      <Row gutter={[40, 40]}>
        {/* Лява колона: Селекция с голямо изображение */}
        <Col xs={24} lg={16}>
          <img 
            src={event.image} 
            alt={event.title} 
            style={{ 
              width: '100%', 
              borderRadius: '12px', 
              boxShadow: '0 4px 20px rgba(0,0,0,0.1)',
              maxHeight: '500px',
              objectFit: 'cover'
            }} 
          />
          
          <div style={{ marginTop: '32px' }}>
            <Title level={1}>{event.title}</Title>
            <Space size={[0, 8]} wrap style={{ marginBottom: '24px' }}>
              <Tag color="blue" icon={<TagOutlined />}>{event.category}</Tag>
              <Tag color="orange" icon={<EnvironmentOutlined />}>{event.city}</Tag>
              <Tag color="green" icon={<CalendarOutlined />}>{event.date}</Tag>
            </Space>
            
            <Divider />
            
            <Title level={3}>Относно събитието</Title>
            <Paragraph style={{ fontSize: '1.1rem', lineHeight: '1.8' }}>
              {event.longDescription || event.description}
            </Paragraph>
          </div>
        </Col>

        {/* Дясна колона: Детайли и CTA */}
        <Col xs={24} lg={8}>
          <Card bordered={false} style={{ background: '#f9f9f9', position: 'sticky', top: '100px' }}>
            <Title level={4}>Информация за локация</Title>
            <Space direction="vertical" size="middle" style={{ width: '100%' }}>
              <div>
                <Text type="secondary" style={{ display: 'block' }}>Дата и час:</Text>
                <Text strong style={{ fontSize: '1.1rem' }}>{event.date}</Text>
              </div>
              <div>
                <Text type="secondary" style={{ display: 'block' }}>Град:</Text>
                <Text strong style={{ fontSize: '1.1rem' }}>{event.city}</Text>
              </div>
              <Divider />
              <Button type="primary" block size="large">
                Запиши се / Билети
              </Button>
            </Space>
          </Card>
        </Col>
      </Row>
    </div>
  );
};

export default EventDetails;
