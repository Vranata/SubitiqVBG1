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
import { $effectiveRegionId } from '../../entities/location/model';

const { Title, Paragraph, Text } = Typography;

type UserRow = {
  id_user: number;
};

type PreferenceRow = {
  id_event_category: number;
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
  const [preferredCategoryIds, setPreferredCategoryIds] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [refreshToken, setRefreshToken] = useState(0);

  const { user, effectiveRegionId, likedEventIds, loadAllEvents, loadLikedEventIds, resetLikedEvents } = useUnit({
    user: $user,
    effectiveRegionId: $effectiveRegionId,
    likedEventIds: $likedEventIds,
    loadAllEvents: fetchAllEventsFx,
    loadLikedEventIds: fetchLikedEventIdsFx,
    resetLikedEvents: clearLikedEventIds,
  });

  useEffect(() => {
    const handlePreferenceUpdate = () => {
      setRefreshToken((value) => value + 1);
    };

    window.addEventListener('culturo-preferences-updated', handlePreferenceUpdate);

    return () => {
      window.removeEventListener('culturo-preferences-updated', handlePreferenceUpdate);
    };
  }, []);

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
          setPreferredCategoryIds([]);
          return;
        }

        const currentUserDbId = await resolveCurrentUserDbId(user.authUserId);

        if (!cancelled) {
          await loadLikedEventIds(String(currentUserDbId));

          const { data: preferenceRows, error: preferenceError } = await supabase
            .from('user_likings')
            .select('id_event_category')
            .eq('id_user', currentUserDbId);

          if (preferenceError) {
            throw preferenceError;
          }

          setPreferredCategoryIds(((preferenceRows ?? []) as PreferenceRow[]).map((row) => String(row.id_event_category)));
        }
      } catch (error) {
        if (!cancelled) {
          messageApi.error(error instanceof Error ? error.message : 'Неуспешно зареждане на препоръките.');
          setAllEvents([]);
          resetLikedEvents();
          setPreferredCategoryIds([]);
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
  }, [loadAllEvents, loadLikedEventIds, messageApi, refreshToken, resetLikedEvents, user?.authUserId]);

  const recommendedEvents = useMemo(() => {
    const likedEventIdSet = new Set(likedEventIds);
    const likedCategories = new Set(
      allEvents
        .filter((event) => likedEventIdSet.has(event.id))
        .map((event) => event.categoryId)
    );
    const preferredCategories = new Set(preferredCategoryIds);

    return allEvents
      .filter((event) => !likedEventIdSet.has(event.id))
      .map((event) => {
        const reasonTags: string[] = [];
        let score = 1;

        if (effectiveRegionId !== null && event.regionId === effectiveRegionId) {
          score += 4;
          reasonTags.push('В твоя регион');
        }

        if (likedCategories.has(event.categoryId) || preferredCategories.has(String(event.categoryId))) {
          score += 3;
          reasonTags.push('Твоя категория');
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
  }, [allEvents, effectiveRegionId, likedEventIds, preferredCategoryIds]);

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