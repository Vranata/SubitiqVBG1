import React from 'react';
import { Card, Col, Row, Button, Tag, Typography, Space, Input, Select } from 'antd';
import { CalendarOutlined, EnvironmentOutlined, ArrowRightOutlined, SearchOutlined } from '@ant-design/icons';
import { useUnit } from 'effector-react';
import { Link } from 'atomic-router-react';
import { 
  $filteredEvents, 
  $searchText, 
  $selectedCity, 
  $selectedCategory,
  $uniqueCities,
  $uniqueCategories,
  searchChanged,
  cityChanged,
  categoryChanged
} from '../../entities/events/model';
import { routes } from '../../shared/routing';

const { Title, Paragraph } = Typography;
const { Search } = Input;

const Events: React.FC = () => {
  const {
    filteredEvents,
    searchText,
    selectedCity,
    selectedCategory,
    cities,
    categories,
    onSearch,
    onCityChange,
    onCategoryChange
  } = useUnit({
    filteredEvents: $filteredEvents,
    searchText: $searchText,
    selectedCity: $selectedCity,
    selectedCategory: $selectedCategory,
    cities: $uniqueCities,
    categories: $uniqueCategories,
    onSearch: searchChanged,
    onCityChange: cityChanged,
    onCategoryChange: categoryChanged
  });

  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '40px 24px' }}>
      <Space direction="vertical" size="large" style={{ width: '100%', marginBottom: '40px' }}>
        <Title level={2}>Всички събития</Title>
        <Paragraph>Открий най-интересното, което предстои във вашия град.</Paragraph>
        
        {/* Филтри и Търсене */}
        <Row gutter={[16, 16]} align="middle">
          <Col xs={24} md={10}>
            <Search 
              placeholder="Търси по име или описание..." 
              allowClear 
              enterButton={<SearchOutlined />} 
              size="large"
              value={searchText}
              onSearch={onSearch}
              onChange={e => onSearch(e.target.value)}
            />
          </Col>
          <Col xs={12} md={7}>
            <Select
              placeholder="Избери град"
              style={{ width: '100%' }}
              size="large"
              allowClear
              value={selectedCity}
              onChange={onCityChange}
              options={cities.map(city => ({ label: city, value: city }))}
            />
          </Col>
          <Col xs={12} md={7}>
            <Select
              placeholder="Категория"
              style={{ width: '100%' }}
              size="large"
              allowClear
              value={selectedCategory}
              onChange={onCategoryChange}
              options={categories.map(cat => ({ label: cat, value: cat }))}
            />
          </Col>
        </Row>
      </Space>

      {filteredEvents.length > 0 ? (
        <Row gutter={[24, 24]}>
          {filteredEvents.map((event) => (
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
                actions={[
                  <Link to={routes.eventDetails} params={{ id: event.id }} key="view-link">
                    <Button 
                      type="link" 
                      icon={<ArrowRightOutlined />} 
                    >
                      Виж повече
                    </Button>
                  </Link>,
                ]}
                style={{ height: '100%', display: 'flex', flexDirection: 'column' }}
                styles={{ body: { flex: 1, display: 'flex', flexDirection: 'column' }}}
              >
                <div style={{ marginBottom: '12px' }}>
                  <Tag color="blue">{event.category}</Tag>
                </div>
                <Title level={4} style={{ marginBottom: '8px' }}>{event.title}</Title>
                <Paragraph 
                  ellipsis={{ rows: 2 }} 
                  type="secondary" 
                  style={{ flex: 1 }}
                >
                  {event.description}
                </Paragraph>
                <Space size="small">
                  <EnvironmentOutlined /> {event.city}
                  <CalendarOutlined style={{ marginLeft: '8px' }} /> {event.date}
                </Space>
              </Card>
            </Col>
          ))}
        </Row>
      ) : (
        <div style={{ textAlign: 'center', padding: '100px 0' }}>
            <Title level={4} type="secondary">Няма намерени събития по тези критерии.</Title>
            <Button type="primary" onClick={() => {
                onSearch('');
                onCityChange(null);
                onCategoryChange(null);
            }}>
                Изчисти филтрите
            </Button>
        </div>
      )}
    </div>
  );
};

export default Events;
