import React, { useEffect, useState } from 'react';
import dayjs from 'dayjs';
import { Button, Card, Col, DatePicker, Input, message, Popconfirm, Row, Select, Space, Spin, Tag, Typography } from 'antd';
import { ArrowRightOutlined, CalendarOutlined, CloseCircleOutlined, DeleteOutlined, DownCircleOutlined, EditOutlined, EnvironmentOutlined, PlusOutlined, SearchOutlined } from '@ant-design/icons';
import { useUnit } from 'effector-react';
import { Link } from 'atomic-router-react';
import EventEditorModal from '../../components/EventEditorModal';
import {
  $categoryOptions,
  $events,
  $isLoading,
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
import { routes } from '../../shared/routing';

const { Title, Paragraph } = Typography;
const { Search } = Input;

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

const Events: React.FC = () => {
  const [messageApi, contextHolder] = message.useMessage();
  const [hasRequested, setHasRequested] = useState(false);
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [editingEvent, setEditingEvent] = useState<EventItem | null>(null);

  const {
    events,
    isLoading,
    isAdmin,
    isSpecialUser,
    user,
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

  useEffect(() => {
    setHasRequested(true);
    openPage();
  }, [openPage]);

  const closeEditor = () => {
    setIsEditorOpen(false);
    setEditingEvent(null);
  };

  const openCreateEditor = () => {
    setEditingEvent(null);
    setIsEditorOpen(true);
  };

  const openEditEditor = (event: EventItem) => {
    setEditingEvent(event);
    setIsEditorOpen(true);
  };

  const submitEvent = async (values: EventEditorValues) => {
    if (!currentUserId) {
      messageApi.error('Трябва да си вписан, за да управляваш събития.');
      return;
    }

    try {
      const payload = {
        ...values,
        userId: currentUserId,
        ...(editingEvent ? { id: editingEvent.id } : {}),
      };

      if (editingEvent) {
        await changeEvent(payload);
        messageApi.success('Събитието беше обновено.');
      } else {
        await createEvent(payload);
        messageApi.success('Събитието беше добавено.');
      }

      closeEditor();
    } catch (error) {
      messageApi.error(error instanceof Error ? error.message : 'Възникна грешка при записването на събитието.');
    }
  };

  const deleteEvent = async (event: EventItem) => {
    if (!currentUserId) {
      messageApi.error('Трябва да си вписан, за да управляваш събития.');
      return;
    }

    try {
      await removeEvent(event.id);

      if (editingEvent?.id === event.id) {
        closeEditor();
      }

      messageApi.success('Събитието беше изтрито.');
    } catch (error) {
      messageApi.error(error instanceof Error ? error.message : 'Възникна грешка при изтриването.');
    }
  };

  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '40px 24px', color: 'var(--text-primary)' }}>
      {contextHolder}

      <Space direction="vertical" size="large" style={{ width: '100%', marginBottom: '40px' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '16px', flexWrap: 'wrap' }}>
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

        <Row gutter={[16, 16]} align="middle">
          <Col xs={24} md={6}>
            <Search
              placeholder="Търси по име, място или описание..."
              allowClear
              enterButton={<SearchOutlined />}
              size="large"
              value={searchText}
              onSearch={onSearch}
              onChange={(event) => onSearch(event.target.value)}
            />
          </Col>
          <Col xs={24} md={6}>
            <FilterSelect
              placeholder="Регион"
              value={selectedRegionId}
              onChange={onRegionChange}
              onClear={() => onRegionChange(null)}
              options={regions}
            />
          </Col>
          <Col xs={24} md={6}>
            <FilterSelect
              placeholder="Категория"
              value={selectedCategoryId}
              onChange={onCategoryChange}
              onClear={() => onCategoryChange(null)}
              options={categories}
            />
          </Col>
          <Col xs={24} md={6}>
            <DatePicker
              placeholder="Дата"
              size="large"
              style={{ width: '100%' }}
              allowClear
              value={selectedDate ? dayjs(selectedDate, 'YYYY-MM-DD') : null}
              onChange={(value) => onDateChange(value ? value.format('YYYY-MM-DD') : null)}
            />
          </Col>
        </Row>
      </Space>

      {((isLoading || !hasRequested) && events.length === 0) ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '96px 0' }}>
          <Spin size="large" tip="Зареждане на събития..." />
        </div>
      ) : events.length > 0 ? (
        <Row gutter={[24, 24]}>
          {events.map((event) => {
            const canManageEvent = isAdmin || (isSpecialUser && currentUserId === event.ownerId);

            return (
              <Col xs={24} sm={12} lg={8} key={event.id}>
                <Card
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
                  <div style={{ marginBottom: '12px' }}>
                    <Tag color="blue">{event.category}</Tag>
                  </div>
                  <Title level={4} style={{ marginBottom: '8px', color: 'var(--text-primary)' }}>{event.title}</Title>
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

                    {canManageEvent ? (
                      <>
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
                      </>
                    ) : null}
                  </Space>
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
            onClick={() => {
              onSearch('');
              onRegionChange(null);
              onCategoryChange(null);
              onDateChange(null);
            }}
          >
            Изчисти филтрите
          </Button>
        </div>
      )}

      <EventEditorModal
        open={isEditorOpen}
        title={editingEvent ? 'Редактиране на събитие' : 'Добавяне на събитие'}
        confirmText={editingEvent ? 'Запази промените' : 'Добави събитие'}
        loading={isCreating || isUpdating}
        event={editingEvent}
        regions={regions}
        categories={categories}
        onCancel={closeEditor}
        onSubmit={submitEvent}
      />
    </div>
  );
};

export default Events;
