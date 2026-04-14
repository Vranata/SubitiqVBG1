import React from 'react';
import { Typography, Button, Space } from 'antd';
import { useUnit } from 'effector-react';
import { CalendarOutlined, ClockCircleOutlined, CompassOutlined, FireOutlined } from '@ant-design/icons';
import { routes } from '../../shared/routing';
import { 
  $featuredEvents, 
  $regionOptions, 
  $categoryOptions,
  regionChanged,
  categoryChanged
} from '../../entities/events/model';

const { Title, Paragraph } = Typography;

const Hero: React.FC = () => {
  const { 
    featuredEvents, 
    regions, 
    categories,
    setRegion,
    setCategory
  } = useUnit({
    featuredEvents: $featuredEvents,
    regions: $regionOptions,
    categories: $categoryOptions,
    setRegion: regionChanged,
    setCategory: categoryChanged,
  });

  const handleRegionClick = (regionId: string) => {
    setRegion(regionId);
    routes.events.open();
  };

  const handleCategoryClick = (categoryId: string) => {
    setCategory(categoryId);
    routes.events.open();
  };

  return (
    <div className="home-hero">
      <div className="home-hero-copy">
        <div className="home-hero-kicker">CULTURO BG · ИЗБРАНО ДНЕС</div>
        <Title level={1} className="home-hero-title">
          Културният пулс на твоя град в един афиш.
        </Title>
        <Paragraph className="home-hero-text">
          Откривай, планирай и преживявай най-интересните събития – от камерни концерти до мащабни фестивали. Твоят персонализиран пътеводител в света на културата.
        </Paragraph>

        <div className="home-hero-actions">
          <Button
            type="primary"
            size="large"
            icon={<CalendarOutlined />}
            className="home-hero-primary"
            onClick={() => routes.events.open()}
          >
            Виж събитията
          </Button>
        </div>

        <div className="home-hero-rail" aria-label="Категории">
          {categories.slice(0, 5).map((cat) => (
            <span 
              key={cat.value} 
              className="home-hero-rail-pill"
              onClick={() => handleCategoryClick(cat.value)}
              style={{ cursor: 'pointer' }}
            >
              {cat.label}
            </span>
          ))}
        </div>

        <div className="home-hero-cities" aria-label="Градове">
          {regions.slice(0, 6).map((reg) => (
            <span 
              key={reg.value} 
              className="home-city-pill"
              onClick={() => handleRegionClick(reg.value)}
              style={{ cursor: 'pointer' }}
            >
              {reg.label}
            </span>
          ))}
        </div>
      </div>

      <div className="home-hero-spotlight" aria-hidden="true">
        <div className="home-hero-spotlight-orb" />
        <div className="home-hero-spotlight-card">
          <div className="home-hero-spotlight-pill">
            <FireOutlined /> Актуално сега
          </div>
          <Title level={4} style={{ color: 'var(--text-primary)', marginBottom: '8px' }}>
            {featuredEvents.length > 0 ? 'Твоят афиш за днес' : 'Предстоящи събития'}
          </Title>
          <Paragraph style={{ color: 'var(--text-secondary)', fontSize: '13px' }}>
            Подбрани предложения от програмата, които не искаш да изпуснеш.
          </Paragraph>

          <div className="home-hero-spotlight-schedule">
            {featuredEvents.length > 0 ? (
              featuredEvents.map((event) => (
                <div 
                  key={event.id} 
                  className="home-hero-spotlight-row"
                  onClick={() => routes.eventDetails.open({ id: event.id })}
                  style={{ cursor: 'pointer' }}
                >
                  <div className="home-hero-row-time">
                    <ClockCircleOutlined /> {event.startHour.substring(0, 5)}
                  </div>
                  <div className="home-hero-row-copy">
                    <strong>{event.title}</strong>
                    <span>{event.category} · {event.region}</span>
                  </div>
                </div>
              ))
            ) : (
              <div style={{ padding: '20px 0', textAlign: 'center', opacity: 0.5 }}>
                Няма активни събития в момента.
              </div>
            )}
          </div>

          <div className="home-hero-spotlight-footer">
            <span><CompassOutlined /> Всички региони</span>
            <span><CalendarOutlined /> Обновено днес</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Hero;
