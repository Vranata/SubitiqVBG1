import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'atomic-router-react';
import { Button, Card, Col, Empty, Row, Space, Spin, Typography, message } from 'antd';
import { useUnit } from 'effector-react';
import { supabase } from '../../services/supabaseClient';
import { routes } from '../../shared/routing';
import EventSpotlightCard from '../../components/EventSpotlightCard';
import {
  $likedEventIds,
  clearLikedEventIds,
  fetchAllEventsFx,
  fetchLikedEventIdsFx,
  type EventItem,
} from '../../entities/events/model';
import { $user } from '../../entities/model';

const { Title, Paragraph, Text } = Typography;

type UserRow = {
  id_user: number;
};

const resolveCurrentUserDbId = async (authUserId: string): Promise<number> => {
  const { data, error } = await supabase
    .from('users')
    .select('id_user')
    .eq('auth_user_id', authUserId)
    .maybeSingle<UserRow>();

  if (error) {
    throw error;
  }

  if (!data) {
    throw new Error('Потребителският профил не е синхронизиран. Презареди страницата.');
  }

  return data.id_user;
};

const Favorites: React.FC = () => {
  const [messageApi, contextHolder] = message.useMessage();
  const [allEvents, setAllEvents] = useState<EventItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const { user, likedEventIds, loadAllEvents, loadLikedEventIds, resetLikedEvents } = useUnit({
    user: $user,
    likedEventIds: $likedEventIds,
    loadAllEvents: fetchAllEventsFx,
    loadLikedEventIds: fetchLikedEventIdsFx,
    resetLikedEvents: clearLikedEventIds,
  });

  useEffect(() => {
    let cancelled = false;

    const syncPageData = async () => {
      setIsLoading(true);

      try {
        const loadedEvents = await loadAllEvents();

        if (cancelled) {
          return;
        }

        setAllEvents(loadedEvents);

        if (!user) {
          resetLikedEvents();
          return;
        }

        const currentUserDbId = await resolveCurrentUserDbId(user.authUserId);

        if (!cancelled) {
          await loadLikedEventIds(String(currentUserDbId));
        }
      } catch (error) {
        if (!cancelled) {
          messageApi.error(error instanceof Error ? error.message : 'Неуспешно зареждане на любими събития.');
          setAllEvents([]);
          resetLikedEvents();
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    };

    void syncPageData();

    return () => {
      cancelled = true;
    };
  }, [loadAllEvents, loadLikedEventIds, messageApi, resetLikedEvents, user?.authUserId]);

  const favoriteEvents = useMemo(() => {
    const likedEventIdSet = new Set(likedEventIds);

    return allEvents.filter((event) => likedEventIdSet.has(event.id));
  }, [allEvents, likedEventIds]);

  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '40px 24px', color: 'var(--text-primary)' }}>
      {contextHolder}

      <Space direction="vertical" size="large" style={{ width: '100%', marginBottom: '32px' }}>
        <div>
          <Title level={2} style={{ color: 'var(--text-primary)', marginBottom: 8 }}>Любими</Title>
          <Paragraph style={{ color: 'var(--text-secondary)', marginBottom: 0 }}>
            Всички събития, които си отбелязал с харесване.
          </Paragraph>
        </div>

        {!user ? (
          <Card bordered={false} style={{ background: 'var(--surface-bg)', border: '1px solid var(--border-color)', boxShadow: 'var(--shadow-soft)' }}>
            <Space direction="vertical" size="small" style={{ width: '100%' }}>
              <Text strong style={{ color: 'var(--text-primary)' }}>Влез, за да запазваш и преглеждаш любими събития.</Text>
              <Text style={{ color: 'var(--text-secondary)' }}>Харесванията се показват тук само за вписани потребители.</Text>
              <div>
                <Link to={routes.login}>
                  <Button type="primary">Вход / регистрация</Button>
                </Link>
              </div>
            </Space>
          </Card>
        ) : null}
      </Space>

      {isLoading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '96px 0' }}>
          <Spin size="large" tip="Зареждане на любими събития..." />
        </div>
      ) : user && favoriteEvents.length > 0 ? (
        <Row gutter={[24, 24]}>
          {favoriteEvents.map((event) => (
            <Col xs={24} sm={12} lg={8} key={event.id}>
              <EventSpotlightCard event={event} />
            </Col>
          ))}
        </Row>
      ) : user ? (
        <Empty
          description="Все още нямаш любими събития."
          style={{ padding: '96px 0' }}
        >
          <Space wrap>
            <Link to={routes.events}>
              <Button type="primary">Разгледай всички събития</Button>
            </Link>
            <Link to={routes.recommended}>
              <Button>Препоръчано за теб</Button>
            </Link>
          </Space>
        </Empty>
      ) : null}
    </div>
  );
};

export default Favorites;