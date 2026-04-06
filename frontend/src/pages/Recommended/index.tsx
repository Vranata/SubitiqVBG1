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

const daysUntil = (event: EventItem) => {
  const parsedDate = new Date(event.startDate);

  if (Number.isNaN(parsedDate.getTime())) {
    return null;
  }

  return Math.ceil((parsedDate.getTime() - Date.now()) / 86_400_000);
};

const Recommended: React.FC = () => {
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
          messageApi.error(error instanceof Error ? error.message : 'Неуспешно зареждане на препоръките.');
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

  const recommendedEvents = useMemo(() => {
    const likedEventIdSet = new Set(likedEventIds);
    const likedCategories = new Set(
      allEvents
        .filter((event) => likedEventIdSet.has(event.id))
        .map((event) => event.categoryId)
    );

    return allEvents
      .filter((event) => !likedEventIdSet.has(event.id))
      .map((event) => {
        const reasonTags: string[] = [];
        let score = 1;

        if (user?.regionId !== null && user?.regionId !== undefined && event.regionId === user.regionId) {
          score += 4;
          reasonTags.push('В твоя регион');
        }

        if (likedCategories.has(event.categoryId)) {
          score += 3;
          reasonTags.push('Сходна категория');
        }

        const remainingDays = daysUntil(event);

        if (remainingDays !== null && remainingDays >= 0 && remainingDays <= 14) {
          score += 2;
          reasonTags.push('Скоро предстои');
        }

        if (reasonTags.length === 0) {
          reasonTags.push('Предстоящо');
        }

        return {
          event,
          score,
          reasonTags,
        };
      })
      .sort((left, right) => {
        if (right.score !== left.score) {
          return right.score - left.score;
        }

        const dateCompare = left.event.startDate.localeCompare(right.event.startDate);

        if (dateCompare !== 0) {
          return dateCompare;
        }

        return left.event.startHour.localeCompare(right.event.startHour);
      });
  }, [allEvents, likedEventIds, user?.regionId]);

  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '40px 24px', color: 'var(--text-primary)' }}>
      {contextHolder}

      <Space direction="vertical" size="large" style={{ width: '100%', marginBottom: '32px' }}>
        <div>
          <Title level={2} style={{ color: 'var(--text-primary)', marginBottom: 8 }}>Препоръчано за теб</Title>
          <Paragraph style={{ color: 'var(--text-secondary)', marginBottom: 0 }}>
            Подреждаме събитията според твоя регион, харесвания и това, което предстои скоро.
          </Paragraph>
        </div>

        {!user ? (
          <Card bordered={false} style={{ background: 'var(--surface-bg)', border: '1px solid var(--border-color)', boxShadow: 'var(--shadow-soft)' }}>
            <Space direction="vertical" size="small" style={{ width: '100%' }}>
              <Text strong style={{ color: 'var(--text-primary)' }}>Персоналните препоръки работят най-добре с акаунт.</Text>
              <Text style={{ color: 'var(--text-secondary)' }}>Влез или си направи акаунт, за да подреждаме събитията според твоя вкус.</Text>
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
          <Spin size="large" tip="Зареждане на препоръки..." />
        </div>
      ) : recommendedEvents.length > 0 ? (
        <Row gutter={[24, 24]}>
          {recommendedEvents.slice(0, 12).map(({ event, reasonTags }) => (
            <Col xs={24} sm={12} lg={8} key={event.id}>
              <EventSpotlightCard event={event} reasonTags={reasonTags} />
            </Col>
          ))}
        </Row>
      ) : (
        <Empty
          description="Няма достатъчно данни за персонализирани препоръки в момента."
          style={{ padding: '96px 0' }}
        >
          <Link to={routes.events}>
            <Button type="primary">Разгледай всички събития</Button>
          </Link>
        </Empty>
      )}
    </div>
  );
};

export default Recommended;