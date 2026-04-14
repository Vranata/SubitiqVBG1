import React, { useEffect, useMemo, useState } from 'react';
import dayjs from 'dayjs';
import { Button, Card, Col, DatePicker, FloatButton, Input, message, Popconfirm, Row, Select, Space, Spin, Tag, Typography } from 'antd';
import { ArrowRightOutlined, CalendarOutlined, ClockCircleOutlined, CloseCircleOutlined, DeleteOutlined, DownCircleOutlined, EditOutlined, EnvironmentOutlined, FireOutlined, PlusOutlined, SearchOutlined } from '@ant-design/icons';
import { useUnit } from 'effector-react';
import { Link } from 'atomic-router-react';
import EventLikeButton from '../../components/EventLikeButton';
import GoogleCalendarButton from '../../components/GoogleCalendarButton';
import ShareEventButton from '../../components/ShareEventButton';
import EventEditorModal from '../../components/EventEditorModal';
import {
  $categoryOptions,
  $events,
  $isLoading,
  clearLikedEventIds,
  fetchLikedEventIdsFx,
  $regionOptions,
  $searchText,
  $selectedCategoryId,
  $selectedDate,
  $selectedRegionId,
  addEventFx,
  categoryChanged,
  dateChanged,
  deleteEventFx,
  eventsPageOpened,
  type EventEditorValues,
  type EventItem,
  regionChanged,
  searchChanged,
  updateEventFx,
} from '../../entities/events/model';
import {
  $isAdmin,
  $isSpecialUser,
  $user,
} from '../../entities/model';
import { $effectiveRegionId } from '../../entities/location/model';
import { supabase } from '../../services/supabaseClient';
import { routes } from '../../shared/routing';

const { Title, Paragraph } = Typography;

type EventSortMode = 'newest' | 'nearest' | 'liked' | 'latest';

const sortModeLabels: Record<EventSortMode, string> = {
  newest: 'Най-скорошни',
  nearest: 'Най-близки до теб',
  liked: 'Най-харесвани',
  latest: 'Най-скоро добавени',
};

const sortModeIcons: Record<EventSortMode, React.ReactNode> = {
  newest: <ClockCircleOutlined />,
  nearest: <EnvironmentOutlined />,
  liked: <FireOutlined />,
  latest: <PlusOutlined />,
};

const compareUpcomingEvents = (leftEvent: EventItem, rightEvent: EventItem) => {
  const dateCompare = leftEvent.startDate.localeCompare(rightEvent.startDate);

  if (dateCompare !== 0) {
    return dateCompare;
  }

  const hourCompare = leftEvent.startHour.localeCompare(rightEvent.startHour);

  if (hourCompare !== 0) {
    return hourCompare;
  }

  return Number(leftEvent.id) - Number(rightEvent.id);
};

const compareLatestAddedEvents = (leftEvent: EventItem, rightEvent: EventItem) => Number(rightEvent.id) - Number(leftEvent.id);

const isPastEvent = (event: EventItem, today: dayjs.Dayjs) => dayjs(event.endDate).isBefore(today, 'day');

const getNewestSortDate = (event: EventItem, today: dayjs.Dayjs) => {
  const startDate = dayjs(event.startDate);

  if (startDate.isBefore(today, 'day')) {
    return today;
  }

  return startDate.startOf('day');
};

type FilterSelectProps = {
  placeholder: string;
  value: string | null;
  options: Array<{ label: string; value: string }>;
  onChange: (value: string | null) => void;
  onClear: () => void;
};

const FilterSelect: React.FC<FilterSelectProps> = ({ placeholder, value, options, onChange, onClear }) => {
  const [hovered, setHovered] = useState(false);
  const hasValue = value !== null && value !== undefined && value !== '';
  const showClear = hasValue && hovered;

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{ width: '100%' }}
    >
      <Select
        placeholder={placeholder}
        style={{ width: '100%' }}
        size="large"
        allowClear={false}
        value={value}
        onChange={onChange}
        suffixIcon={
          <span
            onMouseDown={(event) => {
              if (showClear) {
                event.preventDefault();
              }
            }}
            onClick={(event) => {
              if (showClear) {
                event.preventDefault();
                event.stopPropagation();
                onClear();
              }
            }}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 22,
              height: 22,
              borderRadius: '50%',
              color: 'var(--accent)',
              cursor: showClear ? 'pointer' : 'default',
              pointerEvents: showClear ? 'auto' : 'none',
              transition: 'transform 0.2s ease, color 0.2s ease, background 0.2s ease',
              background: showClear ? 'rgba(198, 90, 0, 0.12)' : 'transparent',
            }}
          >
            {showClear ? <CloseCircleOutlined /> : <DownCircleOutlined />}
          </span>
        }
        options={options}
      />
    </div>
  );
};

type EventLikeCountRow = {
  id_event: number;
};

const Events: React.FC = () => {
  const [messageApi, contextHolder] = message.useMessage();
  const [hasRequested, setHasRequested] = useState(false);
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [editingEvent, setEditingEvent] = useState<EventItem | null>(null);
  const [editorError, setEditorError] = useState<string | null>(null);
  const [sortMode, setSortMode] = useState<EventSortMode>('newest');
  const [eventLikeCounts, setEventLikeCounts] = useState<Record<string, number>>({});
  const {
    events,
    isLoading,
    isAdmin,
    isSpecialUser,
    user,
    effectiveRegionId,
    searchText,
    selectedRegionId,
    selectedCategoryId,
    selectedDate,
    regions,
    categories,
    openPage,
    onSearch,
    onRegionChange,
    onCategoryChange,
    onDateChange,
    createEvent,
    changeEvent,
    removeEvent,
    isCreating,
    isUpdating,
  } = useUnit({
    events: $events,
    isLoading: $isLoading,
    isAdmin: $isAdmin,
    isSpecialUser: $isSpecialUser,
    user: $user,
    effectiveRegionId: $effectiveRegionId,
    searchText: $searchText,
    selectedRegionId: $selectedRegionId,
    selectedCategoryId: $selectedCategoryId,
    selectedDate: $selectedDate,
    regions: $regionOptions,
    categories: $categoryOptions,
    openPage: eventsPageOpened,
    onSearch: searchChanged,
    onRegionChange: regionChanged,
    onCategoryChange: categoryChanged,
    onDateChange: dateChanged,
    createEvent: addEventFx,
    changeEvent: updateEventFx,
    removeEvent: deleteEventFx,
    isCreating: addEventFx.pending,
    isUpdating: updateEventFx.pending,
  });

  const currentUserId = user?.id ?? null;
  const canCreateEvent = isAdmin || isSpecialUser;

  const resolveCurrentUserDbId = async (): Promise<number> => {
    const authUserId = user?.authUserId;

    if (!authUserId) {
      throw new Error('Профилът на потребителя не е зареден. Презареди страницата.');
    }

    const { data, error } = await supabase
      .from('users')
      .select('id_user')
      .eq('auth_user_id', authUserId)
      .maybeSingle();

    if (error) {
      throw error;
    }

    if (!data) {
      throw new Error('Потребителският профил не е синхронизиран. Презареди страницата.');
    }

    return data.id_user;
  };

  useEffect(() => {
    let cancelled = false;

    const syncLikedEvents = async () => {
      if (!user) {
        clearLikedEventIds();
        return;
      }

      try {
        const currentUserDbId = await resolveCurrentUserDbId();

        if (!cancelled) {
          await fetchLikedEventIdsFx(String(currentUserDbId));
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
  }, [user?.authUserId]);

  useEffect(() => {
    setHasRequested(true);
    openPage();
  }, [openPage]);

  useEffect(() => {
    let cancelled = false;

    const syncLikeCounts = async () => {
      if (events.length === 0) {
        setEventLikeCounts({});
        return;
      }

      const eventIds = events
        .map((event) => Number(event.id))
        .filter((eventId) => !Number.isNaN(eventId));

      if (eventIds.length === 0) {
        setEventLikeCounts({});
        return;
      }

      const { data, error } = await supabase
        .from('event_likes')
        .select('id_event')
        .in('id_event', eventIds);

      if (cancelled) {
        return;
      }

      if (error) {
        setEventLikeCounts({});
        return;
      }

      const nextCounts = ((data ?? []) as EventLikeCountRow[]).reduce<Record<string, number>>((counts, row) => {
        const eventId = String(row.id_event);
        counts[eventId] = (counts[eventId] ?? 0) + 1;
        return counts;
      }, {});

      setEventLikeCounts(nextCounts);
    };

    void syncLikeCounts();

    return () => {
      cancelled = true;
    };
  }, [events]);

  const clearFilters = () => {
    onSearch('');
    onRegionChange(null);
    onCategoryChange(null);
    onDateChange(null);
    setSortMode('newest');
  };

  const sortedEvents = useMemo(() => {
    const nextEvents = [...events];
    const today = dayjs().startOf('day');

    if (sortMode === 'nearest') {
      return nextEvents.sort((leftEvent, rightEvent) => {
        const leftDistance = effectiveRegionId !== null && leftEvent.regionId === effectiveRegionId ? 0 : 1;
        const rightDistance = effectiveRegionId !== null && rightEvent.regionId === effectiveRegionId ? 0 : 1;

        if (leftDistance !== rightDistance) {
          return leftDistance - rightDistance;
        }

        return compareUpcomingEvents(leftEvent, rightEvent);
      });
    }

    if (sortMode === 'liked') {
      return nextEvents.sort((leftEvent, rightEvent) => {
        const leftLikes = eventLikeCounts[leftEvent.id] ?? 0;
        const rightLikes = eventLikeCounts[rightEvent.id] ?? 0;

        if (leftLikes !== rightLikes) {
          return rightLikes - leftLikes;
        }

        return compareUpcomingEvents(leftEvent, rightEvent);
      });
    }

    if (sortMode === 'latest') {
      return nextEvents.sort((leftEvent, rightEvent) => {
        const idCompare = compareLatestAddedEvents(leftEvent, rightEvent);

        if (idCompare !== 0) {
          return idCompare;
        }

        return compareUpcomingEvents(leftEvent, rightEvent);
      });
    }

    return nextEvents
      .filter((event) => !isPastEvent(event, today))
      .sort((leftEvent, rightEvent) => {
        const leftDate = getNewestSortDate(leftEvent, today);
        const rightDate = getNewestSortDate(rightEvent, today);

        const dateCompare = leftDate.valueOf() - rightDate.valueOf();

        if (dateCompare !== 0) {
          return dateCompare;
        }

        const leftEndDate = dayjs(leftEvent.endDate).valueOf();
        const rightEndDate = dayjs(rightEvent.endDate).valueOf();

        if (leftEndDate !== rightEndDate) {
          return leftEndDate - rightEndDate;
        }

        const hourCompare = leftEvent.startHour.localeCompare(rightEvent.startHour);

        if (hourCompare !== 0) {
          return hourCompare;
        }

        return Number(leftEvent.id) - Number(rightEvent.id);
      });
  }, [effectiveRegionId, eventLikeCounts, events, sortMode]);

  const closeEditor = () => {
    setIsEditorOpen(false);
    setEditingEvent(null);
    setEditorError(null);
  };

  const openCreateEditor = () => {
    setEditingEvent(null);
    setEditorError(null);
    setIsEditorOpen(true);
  };

  const openEditEditor = (event: EventItem) => {
    setEditingEvent(event);
    setEditorError(null);
    setIsEditorOpen(true);
  };

  const submitEvent = async (values: EventEditorValues) => {
    if (!user) {
      const errorText = 'Трябва да си вписан, за да управляваш събития.';
      setEditorError(errorText);
      messageApi.error(errorText);
      return;
    }

    try {
      const currentUserDbId = await resolveCurrentUserDbId();

      const payload = {
        ...values,
        userId: String(currentUserDbId),
        ...(editingEvent ? { id: editingEvent.id } : {}),
      };

      if (editingEvent) {
        await changeEvent(payload);
        messageApi.success('Събитието беше обновено.');
      } else {
        await createEvent(payload);
        messageApi.success('Събитието беше добавено.');
      }

      setEditorError(null);
      closeEditor();
    } catch (error) {
      const errorText = error instanceof Error ? error.message : 'Възникна грешка при записването на събитието.';
      setEditorError(errorText);
      messageApi.error(errorText);
    }
  };

  const deleteEvent = async (event: EventItem) => {
    if (!user) {
      const errorText = 'Трябва да си вписан, за да управляваш събития.';
      setEditorError(errorText);
      messageApi.error(errorText);
      return;
    }

    try {
      await resolveCurrentUserDbId();
      await removeEvent(event.id);

      if (editingEvent?.id === event.id) {
        closeEditor();
      }

      messageApi.success('Събитието беше изтрито.');
    } catch (error) {
      const errorText = error instanceof Error ? error.message : 'Възникна грешка при изтриването.';
      setEditorError(errorText);
      messageApi.error(errorText);
    }
  };

  return (
    <div className="events-page" style={{ width: '100%', padding: '40px 0', color: 'var(--text-primary)' }}>
      {contextHolder}

      <div className="events-page-layout">
        <aside className="events-filters-panel">
          <div className="events-filters-panel-inner">
            <div>
              <div className="events-filters-title">Филтри</div>
              <Paragraph style={{ color: 'var(--text-secondary)', marginBottom: 0 }}>
                Подреди списъка по град, категория и дата.
              </Paragraph>
            </div>

            <div className="events-filter-group">
              <div className="events-search-row">
                <Input
                  placeholder="Търси по име, изпълнител или описание..."
                  allowClear
                  size="large"
                  value={searchText}
                  onChange={(event) => onSearch(event.target.value)}
                  onPressEnter={() => onSearch(searchText)}
                />
                <Button
                  className="events-search-button"
                  type="primary"
                  size="small"
                  shape="circle"
                  icon={<SearchOutlined />}
                  aria-label="Търси"
                  onClick={() => onSearch(searchText)}
                />
              </div>
            </div>

            <div className="events-filter-group">
              <FilterSelect
                placeholder="Регион"
                value={selectedRegionId}
                onChange={onRegionChange}
                onClear={() => onRegionChange(null)}
                options={regions}
              />
            </div>

            <div className="events-filter-group">
              <FilterSelect
                placeholder="Категория"
                value={selectedCategoryId}
                onChange={onCategoryChange}
                onClear={() => onCategoryChange(null)}
                options={categories}
              />
            </div>

            <div className="events-filter-group">
              <DatePicker
                placeholder="Дата"
                size="large"
                style={{ width: '100%' }}
                value={selectedDate ? dayjs(selectedDate) : null}
                onChange={(date) => onDateChange(date ? date.format('YYYY-MM-DD') : null)}
              />
            </div>

            <div className="events-filter-group events-sort-group">
              <div className="events-sort-title">Сортиране</div>
              <div className="events-sort-list">
                {(Object.keys(sortModeLabels) as EventSortMode[]).map((mode) => (
                  <Button
                    key={mode}
                    className="events-sort-button"
                    type={sortMode === mode ? 'primary' : 'default'}
                    size="large"
                    icon={sortModeIcons[mode]}
                    block
                    onClick={() => setSortMode(mode)}
                  >
                    {sortModeLabels[mode]}
                  </Button>
                ))}
              </div>
            </div>

            <div className="events-filter-group">
              <Button onClick={clearFilters}>Изчисти филтрите</Button>
            </div>
          </div>
        </aside>

        <div className="events-events-shell">
          <div className="events-page-head">
            <div>
              <Title level={2} style={{ color: 'var(--text-primary)', marginBottom: 0 }}>Всички събития</Title>
              <Paragraph style={{ color: 'var(--text-secondary)', marginBottom: 0 }}>Открий най-интересното, което предстои във вашия град.</Paragraph>
            </div>

            {canCreateEvent ? (
              <Button type="primary" icon={<PlusOutlined />} onClick={openCreateEditor} style={{ alignSelf: 'center' }}>
                Добави събитие
              </Button>
            ) : null}
          </div>

          <div>
            {((isLoading || !hasRequested) && events.length === 0) ? (
              <div style={{ display: 'flex', justifyContent: 'center', padding: '96px 0' }}>
                <Spin size="large" description="Зареждане на събития..." />
              </div>
            ) : sortedEvents.length > 0 ? (
              <Row gutter={[24, 24]}>
                {sortedEvents.map((event) => {
                  const canManageEvent = isAdmin || (isSpecialUser && currentUserId === event.ownerId);

                  return (
                    <Col xs={24} sm={12} lg={8} xl={8} xxl={8} key={event.id}>
                      <Card
                        className="events-event-card"
                        hoverable
                        cover={
                          <img
                            alt={event.title}
                            src={event.image}
                            style={{ height: '240px', objectFit: 'cover' }}
                          />
                        }
                        style={{ height: '100%', display: 'flex', flexDirection: 'column', background: 'var(--surface-bg)', border: '1px solid var(--border-color)', boxShadow: 'var(--shadow-soft)', overflow: 'hidden' }}
                        styles={{ body: { flex: 1, display: 'flex', flexDirection: 'column', gap: 8, background: 'var(--surface-bg)', padding: '16px 18px 18px' } }}
                      >
                        <div style={{ marginBottom: '8px' }}>
                          <Tag color="blue">{event.category}</Tag>
                        </div>
                        <Title level={5} style={{ marginBottom: '6px', color: 'var(--text-primary)' }}>{event.title}</Title>
                        <div className="events-event-meta">
                          <Space size="small" style={{ color: 'var(--text-secondary)' }}>
                            <EnvironmentOutlined /> {event.region}
                          </Space>
                          <Space size="small" style={{ color: 'var(--text-secondary)' }}>
                            <CalendarOutlined /> {event.date}
                          </Space>
                        </div>

                        <div className="events-event-actions">
                          <Link to={routes.eventDetails} params={{ id: event.id }}>
                            <Button type="default" icon={<ArrowRightOutlined />}>
                              Виж повече
                            </Button>
                          </Link>

                          <GoogleCalendarButton event={event} compact iconOnly />

                          <ShareEventButton event={event} compact iconOnly />

                          <EventLikeButton eventId={event.id} compact iconOnly />
                        </div>

                        {canManageEvent ? (
                          <div className="events-event-admin-actions">
                            <Button type="default" icon={<EditOutlined />} onClick={() => openEditEditor(event)}>
                              Редактирай
                            </Button>

                            <Popconfirm
                              title="Сигурен ли си, че искаш да изтриеш това събитие?"
                              okText="Изтрий"
                              cancelText="Отказ"
                              onConfirm={() => void deleteEvent(event)}
                            >
                              <Button danger icon={<DeleteOutlined />}>
                                Изтрий
                              </Button>
                            </Popconfirm>
                          </div>
                        ) : null}
                      </Card>
                    </Col>
                  );
                })}
              </Row>
            ) : (
              <div style={{ textAlign: 'center', padding: '100px 0' }}>
                <Title level={4} style={{ color: 'var(--text-secondary)' }}>Няма намерени събития по тези критерии.</Title>
                <Button
                  type="primary"
                  onClick={clearFilters}
                >
                  Изчисти филтрите
                </Button>
              </div>
            )}
          </div>
        </div>
      </div>

      <FloatButton.BackTop visibilityHeight={300} className="events-back-to-top" />

      <EventEditorModal
        open={isEditorOpen}
        title={editingEvent ? 'Редактиране на събитие' : 'Добавяне на събитие'}
        confirmText={editingEvent ? 'Запази промените' : 'Добави събитие'}
        loading={isCreating || isUpdating}
        event={editingEvent}
        regions={regions}
        categories={categories}
        errorMessage={editorError}
        onCancel={closeEditor}
        onSubmit={submitEvent}
      />

    </div>
  );
};

export default Events;
