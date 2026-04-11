import React, { useState } from 'react';
import { LockOutlined, MailOutlined } from '@ant-design/icons';
import { Button, Card, Form, Input, Segmented, Space, Typography, message } from 'antd';
import { useUnit } from 'effector-react';
import { history } from '../../shared/routing';
import { resetPasswordFx, signInFx, signUpFx, updatePasswordFx } from '../../entities/model';
import { locationPromptRequested } from '../../entities/location/model';

type AuthMode = 'login' | 'register';

type AuthFormValues = {
  email: string;
  password: string;
  confirmPassword?: string;
};

type RecoveryFormValues = {
  newPassword: string;
  confirmPassword: string;
};

const isValidationError = (error: unknown) => Boolean(error && typeof error === 'object' && 'errorFields' in error);

const Login: React.FC = () => {
  const [authForm] = Form.useForm<AuthFormValues>();
  const [recoveryForm] = Form.useForm<RecoveryFormValues>();
  const [authMode, setAuthMode] = useState<AuthMode>('login');

  const isRecoveryMode = typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('mode') === 'recovery';

  const {
    signIn,
    signUp,
    resetPassword,
    updatePassword,
    isSigningIn,
    isSigningUp,
    isResettingPassword,
    isUpdatingPassword,
  } = useUnit({
    signIn: signInFx,
    signUp: signUpFx,
    resetPassword: resetPasswordFx,
    updatePassword: updatePasswordFx,
    isSigningIn: signInFx.pending,
    isSigningUp: signUpFx.pending,
    isResettingPassword: resetPasswordFx.pending,
    isUpdatingPassword: updatePasswordFx.pending,
  });

  const handleAuthModeChange = (value: string | number) => {
    if (value === 'login' || value === 'register') {
      setAuthMode(value);
      authForm.resetFields(['confirmPassword']);
    }
  };

  const handleAuthSubmit = async (values: AuthFormValues) => {
    try {
      if (authMode === 'register') {
        const session = await signUp({
          email: values.email,
          password: values.password,
        });

        if (session) {
          message.success('Регистрацията е успешна.');
          locationPromptRequested();
          return;
        }

        message.info('Регистрацията е успешна. Провери имейла си за потвърждение, ако е необходимо.');
        locationPromptRequested();
        return;
      }

      await signIn({
        email: values.email,
        password: values.password,
      });

      locationPromptRequested();
    } catch (error) {
      message.error(error instanceof Error ? error.message : 'Входът не беше успешен.');
    }
  };

  const handleForgotPassword = async () => {
    try {
      const values = await authForm.validateFields(['email']);

      if (typeof window === 'undefined') {
        throw new Error('Неуспешно изпращане на линк за възстановяване.');
      }

      await resetPassword({
        email: values.email,
        redirectTo: `${window.location.origin}/login?mode=recovery`,
      });

      message.success('Изпратихме линк за възстановяване на паролата на този имейл.');
    } catch (error) {
      if (isValidationError(error)) {
        return;
      }

      message.error(error instanceof Error ? error.message : 'Неуспешно изпращане на линк за възстановяване.');
    }
  };

  const handleRecoverySubmit = async (values: RecoveryFormValues) => {
    try {
      await updatePassword({
        password: values.newPassword,
      });

      message.success('Новата парола е записана успешно.');
      history.push('/');
    } catch (error) {
      message.error(error instanceof Error ? error.message : 'Неуспешна смяна на паролата.');
    }
  };

  if (isRecoveryMode) {
    return (
      <div style={{ minHeight: 'calc(100vh - 134px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '48px 24px', background: 'radial-gradient(circle at top, rgba(24, 144, 255, 0.12), transparent 42%), radial-gradient(circle at bottom right, rgba(198, 90, 0, 0.12), transparent 36%)' }}>
        <Card bordered={false} style={{ width: '100%', maxWidth: '460px', background: 'var(--surface-bg)', borderRadius: '24px', border: '1px solid var(--border-color)', boxShadow: 'var(--shadow-soft)' }}>
          <Space direction="vertical" size="large" style={{ width: '100%' }}>
            <div>
              <Typography.Title level={2} style={{ marginBottom: 8, color: 'var(--text-primary)' }}>
                Възстановяване на парола
              </Typography.Title>
              <Typography.Paragraph style={{ marginBottom: 0, color: 'var(--text-secondary)' }}>
                Въведи новата си парола и я потвърди, за да завършиш възстановяването.
              </Typography.Paragraph>
            </div>

            <Form form={recoveryForm} layout="vertical" requiredMark={false} onFinish={handleRecoverySubmit}>
              <Form.Item
                label="Нова парола"
                name="newPassword"
                rules={[
                  { required: true, message: 'Въведи нова парола.' },
                  { min: 6, message: 'Паролата трябва да е поне 6 символа.' },
                ]}
              >
                <Input.Password
                  prefix={<LockOutlined />}
                  placeholder="Минимум 6 символа"
                  autoComplete="new-password"
                  size="large"
                />
              </Form.Item>

              <Form.Item
                label="Потвърди новата парола"
                name="confirmPassword"
                dependencies={['newPassword']}
                rules={[
                  { required: true, message: 'Потвърди новата парола.' },
                  ({ getFieldValue }) => ({
                    validator(_, value) {
                      if (!value || getFieldValue('newPassword') === value) {
                        return Promise.resolve();
                      }

                      return Promise.reject(new Error('Паролите не съвпадат.'));
                    },
                  }),
                ]}
              >
                <Input.Password
                  prefix={<LockOutlined />}
                  placeholder="Още веднъж новата парола"
                  autoComplete="new-password"
                  size="large"
                />
              </Form.Item>

              <Space direction="vertical" size="small" style={{ width: '100%' }}>
                <Button type="primary" htmlType="submit" block size="large" loading={isUpdatingPassword}>
                  Запази новата парола
                </Button>

                <Button type="link" htmlType="button" block onClick={() => history.push('/login')}>
                  Обратно към вход и регистрация
                </Button>
              </Space>
            </Form>
          </Space>
        </Card>
      </div>
    );
  }

  return (
    <div style={{ minHeight: 'calc(100vh - 134px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '48px 24px', background: 'radial-gradient(circle at top, rgba(24, 144, 255, 0.12), transparent 42%), radial-gradient(circle at bottom right, rgba(198, 90, 0, 0.12), transparent 36%)' }}>
      <Card bordered={false} style={{ width: '100%', maxWidth: '460px', background: 'var(--surface-bg)', borderRadius: '24px', border: '1px solid var(--border-color)', boxShadow: 'var(--shadow-soft)' }}>
        <Space direction="vertical" size="large" style={{ width: '100%' }}>
          <div>
            <Typography.Title level={2} style={{ marginBottom: 8, color: 'var(--text-primary)' }}>
              {authMode === 'login' ? 'Вход' : 'Регистрация'}
            </Typography.Title>
            <Typography.Paragraph style={{ marginBottom: 0, color: 'var(--text-secondary)' }}>
              {authMode === 'login'
                ? 'Влез в профила си, за да използваш всички функции.'
                : 'Създай нов акаунт и отключи персонализацията, харесванията и уведомленията.'}
            </Typography.Paragraph>
          </div>

          <Segmented
            block
            size="large"
            value={authMode}
            onChange={handleAuthModeChange}
            options={[
              { label: 'Вход', value: 'login' },
              { label: 'Регистрация', value: 'register' },
            ]}
          />

          <Form form={authForm} layout="vertical" requiredMark={false} onFinish={handleAuthSubmit}>
            <Form.Item
              label="Email"
              name="email"
              rules={[
                { required: true, message: 'Въведи email адрес.' },
                { type: 'email', message: 'Въведи валиден email адрес.' },
              ]}
            >
              <Input
                prefix={<MailOutlined />}
                placeholder="example@culturo.bg"
                autoComplete="email"
                size="large"
              />
            </Form.Item>

            <Form.Item
              label="Парола"
              name="password"
              rules={[
                { required: true, message: 'Въведи парола.' },
                { min: 6, message: 'Паролата трябва да е поне 6 символа.' },
              ]}
            >
              <Input.Password
                prefix={<LockOutlined />}
                placeholder="Минимум 6 символа"
                autoComplete={authMode === 'register' ? 'new-password' : 'current-password'}
                size="large"
              />
            </Form.Item>

            {authMode === 'register' && (
              <Form.Item
                label="Потвърди паролата"
                name="confirmPassword"
                dependencies={['password']}
                rules={[
                  { required: true, message: 'Потвърди паролата.' },
                  ({ getFieldValue }) => ({
                    validator(_, value) {
                      if (!value || getFieldValue('password') === value) {
                        return Promise.resolve();
                      }

                      return Promise.reject(new Error('Паролите не съвпадат.'));
                    },
                  }),
                ]}
              >
                <Input.Password
                  prefix={<LockOutlined />}
                  placeholder="Повтори паролата"
                  autoComplete="new-password"
                  size="large"
                />
              </Form.Item>
            )}

            <Space direction="vertical" size="small" style={{ width: '100%' }}>
              <Button
                type="primary"
                htmlType="submit"
                block
                size="large"
                loading={authMode === 'login' ? isSigningIn : isSigningUp}
              >
                {authMode === 'login' ? 'Вход' : 'Регистрация'}
              </Button>

              {authMode === 'login' && (
                <Button type="link" htmlType="button" block onClick={handleForgotPassword} loading={isResettingPassword}>
                  Забравена парола
                </Button>
              )}
            </Space>
          </Form>
        </Space>
      </Card>
    </div>
  );
};

export default Login;
