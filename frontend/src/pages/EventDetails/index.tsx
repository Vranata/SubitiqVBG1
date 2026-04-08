import React, { useEffect, useState } from 'react';
import { useUnit } from 'effector-react';
import { Link } from 'atomic-router-react';
import { Button, Typography, Space, Tag, Divider, Row, Col, Card, Spin } from 'antd';
import { CalendarOutlined, EnvironmentOutlined, ArrowLeftOutlined, TagOutlined } from '@ant-design/icons';
import EventLikeButton from '../../components/EventLikeButton';
import { routes } from '../../shared/routing';
import { $currentEvent, $isDetailLoading, clearLikedEventIds, eventDetailsOpened, fetchLikedEventIdsFx } from '../../entities/events/model';
import { $user } from '../../entities/model';

const { Title, Paragraph, Text } = Typography;

const EventDetails: React.FC = () => {
  const params = useUnit(routes.eventDetails.$params);
  const eventId = params?.id;

  const { currentEvent, openEvent, isLoading } = useUnit({
    currentEvent: $currentEvent,
    openEvent: eventDetailsOpened,
    isLoading: $isDetailLoading,
  });
  const user = useUnit($user);

  const [hasRequested, setHasRequested] = useState(() => currentEvent !== null);

  useEffect(() => {
    if (!eventId) {
      return;
    }

    setHasRequested(true);
    openEvent(eventId);
  }, [eventId, openEvent]);

  useEffect(() => {
    let cancelled = false;

    const syncLikedEvents = async () => {
      if (!user) {
        clearLikedEventIds();
        return;
      }

      const numericUserId = Number(user.id);

      if (Number.isNaN(numericUserId)) {
        clearLikedEventIds();
        return;
      }

      try {
        if (!cancelled) {
          await fetchLikedEventIdsFx(String(numericUserId));
        }
      } catch {
        if (!cancelled) {
          clearLikedEventIds();
        }
      }
    };

    void syncLikedEvents();

    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  if (((isLoading || !hasRequested) && !currentEvent)) {
    return (
      <div style={{ maxWidth: '1200px', margin: '40px auto', padding: '0 24px', display: 'flex', justifyContent: 'center' }}>
        <Spin size="large" tip="Зареждане на събитието..." />
      </div>
    );
  }

  if (!currentEvent) {
    return (
      <div style={{ maxWidth: '1200px', margin: '40px auto', padding: '0 24px', textAlign: 'center', color: 'var(--text-primary)' }}>
        <Title level={2} style={{ color: 'var(--text-primary)' }}>Събитието не е намерено</Title>
        <Link to={routes.events}>
          <Button type="primary">Назад към списъка</Button>
        </Link>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '40px 24px', color: 'var(--text-primary)' }}>
      <Link to={routes.events}>
        <Button
          icon={<ArrowLeftOutlined />}
          style={{ marginBottom: '24px' }}
        >
          Назад към списъка
        </Button>
      </Link>

      <Row gutter={[40, 40]}>
        <Col xs={24} lg={16}>
          <img
            src={currentEvent.image}
            alt={currentEvent.title}
            style={{
              width: '100%',
              borderRadius: '12px',
              boxShadow: 'var(--shadow-soft)',
              maxHeight: '500px',
              objectFit: 'cover',
            }}
          />

          <div style={{ marginTop: '32px' }}>
            <Title level={1} style={{ color: 'var(--text-primary)' }}>{currentEvent.title}</Title>
            <Space size={[0, 8]} wrap style={{ marginBottom: '24px' }}>
              <Tag color="blue" icon={<TagOutlined />}>{currentEvent.category}</Tag>
              <Tag color="orange" icon={<EnvironmentOutlined />}>{currentEvent.region}</Tag>
              <Tag color="green" icon={<CalendarOutlined />}>{currentEvent.date}</Tag>
            </Space>

            <Divider />

            <Title level={3} style={{ color: 'var(--text-primary)' }}>Относно събитието</Title>
            <Paragraph style={{ fontSize: '1.1rem', lineHeight: '1.8', color: 'var(--text-secondary)' }}>
              {currentEvent.description}
            </Paragraph>
          </div>
        </Col>

        <Col xs={24} lg={8}>
          <Card bordered={false} style={{ background: 'var(--surface-bg)', border: '1px solid var(--border-color)', boxShadow: 'var(--shadow-soft)', position: 'sticky', top: '100px' }}>
            <Title level={4} style={{ color: 'var(--text-primary)' }}>Детайли от базата</Title>
            <Space direction="vertical" size="middle" style={{ width: '100%' }}>
              <div>
                <Text style={{ display: 'block', color: 'var(--text-secondary)' }}>ID:</Text>
                <Text strong style={{ fontSize: '1.1rem', color: 'var(--text-primary)' }}>{currentEvent.id}</Text>
              </div>
              <div>
                <Text style={{ display: 'block', color: 'var(--text-secondary)' }}>Изпълнител / организатор:</Text>
                <Text strong style={{ fontSize: '1.1rem', color: 'var(--text-primary)' }}>{currentEvent.artist}</Text>
              </div>
              <div>
                <Text style={{ display: 'block', color: 'var(--text-secondary)' }}>Място:</Text>
                <Text strong style={{ fontSize: '1.1rem', color: 'var(--text-primary)' }}>{currentEvent.place}</Text>
              </div>
              <div>
                <Text style={{ display: 'block', color: 'var(--text-secondary)' }}>Дата:</Text>
                <Text strong style={{ fontSize: '1.1rem', color: 'var(--text-primary)' }}>{currentEvent.date}</Text>
              </div>
              <div>
                <Text style={{ display: 'block', color: 'var(--text-secondary)' }}>Регион:</Text>
                <Text strong style={{ fontSize: '1.1rem', color: 'var(--text-primary)' }}>{currentEvent.region}</Text>
              </div>
              <div>
                <Text style={{ display: 'block', color: 'var(--text-secondary)' }}>Категория:</Text>
                <Text strong style={{ fontSize: '1.1rem', color: 'var(--text-primary)' }}>{currentEvent.category}</Text>
              </div>
              <div>
                <Text style={{ display: 'block', color: 'var(--text-secondary)' }}>Начало:</Text>
                <Text strong style={{ fontSize: '1.1rem', color: 'var(--text-primary)' }}>{currentEvent.startDate} {currentEvent.startHour}</Text>
              </div>
              <div>
                <Text style={{ display: 'block', color: 'var(--text-secondary)' }}>Край:</Text>
                <Text strong style={{ fontSize: '1.1rem', color: 'var(--text-primary)' }}>{currentEvent.endDate} {currentEvent.endHour}</Text>
              </div>

              <EventLikeButton eventId={currentEvent.id} block />
              <Divider />
              <Button type="primary" block size="large">
                Запази събитието
              </Button>
            </Space>
          </Card>
        </Col>
      </Row>
    </div>
  );
};

export default EventDetails;
