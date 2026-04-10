import React from 'react';
import { ArrowRightOutlined, CalendarOutlined, EnvironmentOutlined } from '@ant-design/icons';
import { Button, Card, Space, Tag, Typography } from 'antd';
import { Link } from 'atomic-router-react';
import { routes } from '../shared/routing';
import type { EventItem } from '../entities/events/model';
import EventLikeButton from './EventLikeButton';

const { Title, Paragraph } = Typography;

type EventSpotlightCardProps = {
  event: EventItem;
  reasonTags?: string[];
};

const EventSpotlightCard: React.FC<EventSpotlightCardProps> = ({ event, reasonTags = [] }) => {
  return (
    <Card
      className="event-spotlight-card"
      hoverable
      cover={
        <img
          alt={event.title}
          src={event.image}
          style={{ height: '200px', objectFit: 'cover' }}
        />
      }
      style={{ height: '100%', display: 'flex', flexDirection: 'column', background: 'var(--surface-bg)', border: '1px solid var(--border-color)', boxShadow: 'var(--shadow-soft)', overflow: 'hidden' }}
      styles={{ body: { flex: 1, display: 'flex', flexDirection: 'column', background: 'var(--surface-bg)' } }}
    >
      <div style={{ marginBottom: '12px', display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        <Tag color="blue">{event.category}</Tag>
        {reasonTags.map((reasonTag) => (
          <Tag key={reasonTag} color="gold">
            {reasonTag}
          </Tag>
        ))}
      </div>

      <Title level={4} style={{ marginBottom: '8px', color: 'var(--text-primary)' }}>
        {event.title}
      </Title>

      <Paragraph ellipsis={{ rows: 2 }} style={{ flex: 1, color: 'var(--text-secondary)' }}>
        {event.description}
      </Paragraph>

      <Space direction="vertical" size={4} style={{ color: 'var(--text-secondary)', marginTop: 'auto' }}>
        <Space size="small" style={{ color: 'var(--text-secondary)' }}>
          <EnvironmentOutlined /> {event.region}
        </Space>
        <Space size="small" style={{ color: 'var(--text-secondary)' }}>
          <CalendarOutlined /> {event.date}
        </Space>
        <span style={{ color: 'var(--text-secondary)' }}>Място: {event.place}</span>
      </Space>

      <Space wrap size={8} style={{ marginTop: '16px' }}>
        <Link to={routes.eventDetails} params={{ id: event.id }}>
          <Button type="default" icon={<ArrowRightOutlined />}>Виж повече</Button>
        </Link>

        <EventLikeButton eventId={event.id} compact />
      </Space>
    </Card>
  );
};

export default EventSpotlightCard;