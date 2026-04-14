import React, { useEffect } from 'react';
import { Button, Result, Typography } from 'antd';
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
  const text = searchParams.get('text') || 'Жалбата е обработена успешно.';

  useEffect(() => {
    // Force a fresh profile load when landing on this landing page
    if (type === 'success') {
      refresh();
    }
  }, [refresh, type]);

  const handleBack = () => {
    history.push('/');
  };

  return (
    <div style={{ padding: '50px 0', minHeight: '60vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <Result
        status={type}
        title={type === 'success' ? 'Успешна операция' : 'Възникна проблем'}
        subTitle={
          <div>
            <Typography.Paragraph>{text}</Typography.Paragraph>
            {user && (
              <Typography.Text type="secondary">
                Текуща роля: <strong>{user.roleName}</strong>
              </Typography.Text>
            )}
          </div>
        }
        extra={[
          <Button type="primary" key="home" onClick={handleBack}>
            Към началната страница
          </Button>,
        ]}
      />
    </div>
  );
};

export default AdminMessage;
