import React, { useEffect } from 'react';
import { Button, Result, Typography, Card, Descriptions, Divider, Space, Alert } from 'antd';
import { useUnit } from 'effector-react';
import { history } from '../../shared/routing';
import { $user, $isAdmin, refreshUserProfile } from '../../entities/model';
import { ReloadOutlined } from '@ant-design/icons';

const AdminMessage: React.FC = () => {
  const { user, isAdmin, refresh } = useUnit({
    user: $user,
    isAdmin: $isAdmin,
    refresh: refreshUserProfile,
  });

  const searchParams = new URLSearchParams(window.location.search);
  const type = (searchParams.get('type') as 'success' | 'error' | 'info' | 'warning') || 'info';
  const text = searchParams.get('text') || 'Операцията приключи.';
  const serverDebug = searchParams.get('debug') || 'Няма данни';
  const targetId = searchParams.get('target_id') || 'Неизвестно';

  useEffect(() => {
    if (type === 'success') {
      refresh();
    }
  }, [refresh, type]);

  const handleBack = () => {
    history.push('/');
  };

  const handleManualRefresh = () => {
    refresh();
  };

  const idsMatch = user?.authUserId === targetId;

  return (
    <div style={{ padding: '40px 20px', maxWidth: '900px', margin: '0 auto' }}>
      <Card bordered={false} style={{ borderRadius: '16px', boxShadow: '0 8px 30px rgba(0,0,0,0.08)' }}>
        <Result
          status={type}
          title={type === 'success' ? 'Резултат: Успех' : 'Инфо'}
          subTitle={text}
          extra={[
            <Space key="actions">
              <Button type="primary" onClick={handleBack} size="large" style={{ borderRadius: '8px' }}>
                Към началната страница
              </Button>
              <Button icon={<ReloadOutlined />} onClick={handleManualRefresh} size="large" style={{ borderRadius: '8px' }}>
                Опресни профила
              </Button>
            </Space>,
          ]}
        />


        <Divider>Сравнителна Диагностика</Divider>
        <Descriptions bordered column={1} size="small">
          <Descriptions.Item label="Целево ID (Одобрено от сървъра)">
            <Typography.Text code>{targetId}</Typography.Text>
          </Descriptions.Item>
          
          <Descriptions.Item label="Твоето ID (Сесия в браузъра)">
            {user ? (
              <Typography.Text code copyable>{user.authUserId}</Typography.Text>
            ) : (
              <Space>
                <Typography.Text type="danger">Не сте логнати!</Typography.Text>
                <Button type="link" size="small" onClick={() => history.push('/login')}>Влезте тук</Button>
              </Space>
            )}
          </Descriptions.Item>
          
          <Descriptions.Item label="Статус на съвпадение">
            {!user ? (
              <Typography.Text type="secondary">Изчакване на логин...</Typography.Text>
            ) : idsMatch ? (
              <Typography.Text style={{ color: '#faad14' }} strong>Обновяване на личен профил (Самодиагностика) ⚠️</Typography.Text>
            ) : isAdmin ? (
              <Typography.Text type="success" strong>Одобрение на друг потребител (Стандартен административен поток) ✅</Typography.Text>
            ) : (
              <Typography.Text type="danger" strong>Разминаване: Вие не сте администратор на този акаунт ❌</Typography.Text>
            )}
          </Descriptions.Item>

          <Descriptions.Item label="Текуща роля (в браузъра)">
            <Typography.Text strong>{user?.roleName || 'N/A'}</Typography.Text>
          </Descriptions.Item>
        </Descriptions>

        <Divider>Сървърен лог</Divider>
        <div style={{ background: '#f5f5f5', padding: '12px', borderRadius: '8px' }}>
          <Typography.Text code>{serverDebug}</Typography.Text>
        </div>

        <Divider>Raw JSON</Divider>
        <pre style={{ background: '#1e1e1e', color: '#d4d4d4', padding: '15px', borderRadius: '8px', overflow: 'auto', fontSize: '11px', maxHeight: '200px' }}>
          {JSON.stringify(user, null, 2)}
        </pre>
      </Card>
    </div>
  );
};

export default AdminMessage;
