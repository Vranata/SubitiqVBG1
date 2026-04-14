import React, { useEffect } from 'react';
import { Button, Result, Typography, Descriptions, Divider, Card } from 'antd';
import { useUnit } from 'effector-react';
import { history } from '../../shared/routing';
import { $user, refreshUserProfile } from '../../entities/model';

const AdminMessage: React.FC = () => {
  const { user, refresh } = useUnit({
    user: $user,
    refresh: refreshUserProfile,
  });

  const searchParams = new URLSearchParams(window.location.search);
  const type = (searchParams.get('type') as 'success' | 'error' | 'info' | 'warning') || 'info';
  const text = searchParams.get('text') || 'Операцията приключи.';
  const debugInfo = searchParams.get('debug') || null;

  useEffect(() => {
    if (type === 'success') {
      refresh();
    }
  }, [refresh, type]);

  const handleBack = () => {
    history.push('/');
  };

  return (
    <div style={{ padding: '40px 20px', maxWidth: '800px', margin: '0 auto' }}>
      <Card style={{ borderRadius: '12px', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}>
        <Result
          status={type}
          title={type === 'success' ? 'Операцията е успешна' : 'Резултат'}
          subTitle={text}
          extra={[
            <Button type="primary" key="home" onClick={handleBack} size="large">
              Към началната страница
            </Button>,
          ]}
        />

        <Divider>Диагностична информация</Divider>
        
        <Descriptions bordered column={1} size="small">
          <Descriptions.Item label="Обработено от сървъра (Debug)">
            <Typography.Text code>{debugInfo || 'Няма данни'}</Typography.Text>
          </Descriptions.Item>
          
          <Descriptions.Item label="Ти си логнат като (Email)">
            {user?.email || 'Не сте логнати'}
          </Descriptions.Item>
          
          <Descriptions.Item label="Твоето Auth ID">
            <Typography.Text copyable>{user?.authUserId || 'N/A'}</Typography.Text>
          </Descriptions.Item>
          
          <Descriptions.Item label="Твоята текуща роля">
            <Typography.Text strong style={{ color: user?.roleName === 'Special_user' ? '#52c41a' : 'inherit' }}>
              {user?.roleName || 'N/A'} (ID: {user?.roleId})
            </Typography.Text>
          </Descriptions.Item>
          
          <Descriptions.Item label="Onboarding статус">
            {user?.onboardingCompleted ? 'Завършен' : 'Незавършен'}
          </Descriptions.Item>
        </Descriptions>

        <div style={{ marginTop: '20px', textAlign: 'center' }}>
          <Typography.Text type="secondary" style={{ fontSize: '12px' }}>
            Ако ролята ти все още е "User" (ID: 1), провери дали Auth ID-то ти горе съвпада с това в "Обработено от сървъра". 
            Ако се разминават, значи одобряваш грешен акаунт или тестваш с друг имейл.
          </Typography.Text>
        </div>
      </Card>
    </div>
  );
};

export default AdminMessage;
