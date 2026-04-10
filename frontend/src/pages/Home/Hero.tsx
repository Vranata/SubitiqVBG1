import React from 'react';
import { Typography, Button } from 'antd';
import { Link } from 'atomic-router-react';
import { CalendarOutlined, ClockCircleOutlined, CompassOutlined, FireOutlined } from '@ant-design/icons';
import { routes } from '../../shared/routing';

const { Title, Paragraph } = Typography;

const cities = ['София', 'Пловдив', 'Варна', 'Бургас', 'Русе', 'Габрово'];
const themes = ['Концерти', 'Театър', 'Кино', 'Фестивали'];
const featuredRows = [
  { time: '18:30', label: 'Концерт', title: 'Една вечер с жива музика', city: 'София' },
  { time: '20:00', label: 'Театър', title: 'Сцена с характер', city: 'Пловдив' },
  { time: '21:15', label: 'Фестивал', title: 'Градски ритъм и прожекции', city: 'Габрово' },
];

const Hero: React.FC = () => {
  return (
    <div className="home-hero">
      <div className="home-hero-copy">
        <div className="home-hero-kicker">CULTURO BG · ИЗБРАНО ДНЕС</div>
        <Title level={1} className="home-hero-title">
          Събития за твоя град, подредени като афиш.
        </Title>
        <Paragraph className="home-hero-text">
          Кратък, редакторски първи екран с city-first фокус, категории и подбрани предложения. Без цена, без излишен шум, без да губиш вниманието си.
        </Paragraph>

        <div className="home-hero-actions">
          <Link to={routes.events}>
            <Button
              type="primary"
              size="large"
              icon={<CalendarOutlined />}
              className="home-hero-primary"
            >
              Виж събитията
            </Button>
          </Link>
        </div>

        <div className="home-hero-rail" aria-label="Категории">
          {themes.map((theme) => (
            <span key={theme} className="home-hero-rail-pill">
              {theme}
            </span>
          ))}
        </div>

        <div className="home-hero-cities" aria-label="Градове">
          {cities.map((city) => (
            <span key={city} className="home-city-pill">
              {city}
            </span>
          ))}
        </div>
      </div>

      <div className="home-hero-spotlight" aria-hidden="true">
        <div className="home-hero-spotlight-orb" />
        <div className="home-hero-spotlight-card">
          <div className="home-hero-spotlight-pill">
            <FireOutlined /> На фокус днес
          </div>
          <div className="home-hero-spotlight-title">Афишен панел за следващото излизане.</div>
          <div className="home-hero-spotlight-text">
            Стилизирано резюме на програмата за вечерта, с град, час и категория. Изглежда като билетен панел, но не натрапва цена.
          </div>

          <div className="home-hero-spotlight-schedule">
            {featuredRows.map((row) => (
              <div key={row.title} className="home-hero-spotlight-row">
                <div className="home-hero-row-time">
                  <ClockCircleOutlined /> {row.time}
                </div>
                <div className="home-hero-row-copy">
                  <strong>{row.title}</strong>
                  <span>{row.label} · {row.city}</span>
                </div>
              </div>
            ))}
          </div>

          <div className="home-hero-spotlight-footer">
            <span><CompassOutlined /> Град + категория</span>
            <span><CalendarOutlined /> Подбрано за днес</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Hero;
