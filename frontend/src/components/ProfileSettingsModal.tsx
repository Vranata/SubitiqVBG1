import React, { useEffect, useMemo, useState } from 'react';
import { Button, Form, Input, Modal, Select, Space, Typography, message } from 'antd';
import type { AppUser } from '../entities/model';
import { refreshUserProfile } from '../entities/model';
import { supabase } from '../services/supabaseClient';
import { updateAccount, verifyPassword } from '../shared/api/auth';
import { fallbackCategoryOptions } from '../shared/profileCategoryOptions';
import { setLocalOnboardingCompletion } from '../shared/profileOnboarding';

const isMissingOnboardingColumnError = (error: { code?: string | null; message?: string | null }) =>
  error.code === '42703' || error.code === 'PGRST204' || Boolean(error.message?.includes('profile_onboarding_completed'));

type CategoryOption = {
  label: string;
  value: string;
};

type ProfileSettingsValues = {
  name: string;
  email: string;
  currentPassword?: string;
  nextPassword?: string;
  confirmPassword?: string;
  categoryIds: string[];
};

type ProfileSettingsModalProps = {
  open: boolean;
  mode: 'profile' | 'survey';
  user: AppUser;
  categoryOptions: CategoryOption[];
  onClose: () => void;
  onCompleted: () => void;
};

const ProfileSettingsModal: React.FC<ProfileSettingsModalProps> = ({
  open,
  mode,
  user,
  categoryOptions,
  onClose,
  onCompleted,
}) => {
  const [form] = Form.useForm<ProfileSettingsValues>();
  const [isSaving, setIsSaving] = useState(false);
  const availableCategories = useMemo(() => (categoryOptions.length > 0 ? categoryOptions : fallbackCategoryOptions), [categoryOptions]);

  useEffect(() => {
    if (!open) {
      return;
    }

    const loadProfilePreferences = async () => {
      const { data, error } = await supabase
        .from('user_likings')
        .select('id_event_category')
        .eq('id_user', Number(user.id));

      if (error) {
        throw error;
      }

      const selectedCategoryIds = (data ?? []).map((row) => String(row.id_event_category));

      form.setFieldsValue({
        name: user.name,
        email: user.email,
        currentPassword: undefined,
        nextPassword: undefined,
        confirmPassword: undefined,
        categoryIds: selectedCategoryIds,
      });
    };

    void loadProfilePreferences().catch((error) => {
      message.error(error instanceof Error ? error.message : 'Неуспешно зареждане на профила.');
    });
  }, [form, open, user.email, user.id, user.name]);

  const persistCategoryPreferences = async (categoryIds: string[]) => {
    const currentUserDbId = Number(user.id);

    const deleteResult = await supabase.from('user_likings').delete().eq('id_user', currentUserDbId);

    if (deleteResult.error) {
      throw deleteResult.error;
    }

    if (categoryIds.length === 0) {
      return;
    }

    const insertResult = await supabase.from('user_likings').insert(
      categoryIds.map((categoryId) => ({
        id_user: currentUserDbId,
        id_event_category: Number(categoryId),
      }))
    );

    if (insertResult.error) {
      throw insertResult.error;
    }
  };

  const markOnboardingCompleted = async () => {
    const updateWithFlag = await supabase
      .from('users')
      .update({ profile_onboarding_completed: true })
      .eq('auth_user_id', user.authUserId);

    if (updateWithFlag.error && !isMissingOnboardingColumnError(updateWithFlag.error)) {
      throw updateWithFlag.error;
    }

    setLocalOnboardingCompletion(user.authUserId);
  };

  const finishAndRefresh = async (successMessage: string, preferenceChanged: boolean) => {
    message.success(successMessage);

    if (preferenceChanged) {
      window.dispatchEvent(new Event('culturo-preferences-updated'));
    }

    refreshUserProfile();
    onCompleted();
    onClose();
  };

  const handleSkip = async () => {
    setIsSaving(true);

    try {
      await markOnboardingCompleted();
      await finishAndRefresh('Анкетата е пропусната.', false);
    } catch (error) {
      message.error(error instanceof Error ? error.message : 'Неуспешно пропускане на анкетата.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleSubmit = async (values: ProfileSettingsValues) => {
    if (values.categoryIds.length < 3) {
      message.error('Избери поне 3 категории.');
      return;
    }

    setIsSaving(true);

    try {
      const categoryIds = Array.from(new Set(values.categoryIds));
      const nextName = mode === 'profile' ? (values.name ?? user.name).trim() : user.name;
      const nextEmail = mode === 'profile' ? (values.email ?? user.email).trim() : user.email;
      const nextPassword = mode === 'profile' ? values.nextPassword?.trim() ?? '' : '';
      const confirmPassword = mode === 'profile' ? values.confirmPassword?.trim() ?? '' : '';

      if (mode === 'profile') {
        const currentPassword = values.currentPassword?.trim() ?? '';

        if (!currentPassword) {
          message.error('Въведи старата си парола за потвърждение.');
          return;
        }

        await verifyPassword({
          email: user.email,
          password: currentPassword,
        });

        if (nextPassword || nextEmail !== user.email || nextName !== user.name) {
          if (nextPassword && nextPassword !== confirmPassword) {
            message.error('Новите пароли не съвпадат.');
            return;
          }

          await updateAccount({
            ...(nextEmail !== user.email ? { email: nextEmail } : {}),
            ...(nextPassword ? { password: nextPassword } : {}),
            data: {
              full_name: nextName,
              name: nextName,
            },
          });
        }

        const profileUpdate = await supabase
          .from('users')
          .update({
            email: nextEmail,
            name_user: nextName,
            profile_onboarding_completed: true,
          })
          .eq('auth_user_id', user.authUserId);

        if (profileUpdate.error && isMissingOnboardingColumnError(profileUpdate.error)) {
          const retryUpdate = await supabase
            .from('users')
            .update({
              email: nextEmail,
              name_user: nextName,
            })
            .eq('auth_user_id', user.authUserId);

          if (retryUpdate.error) {
            throw retryUpdate.error;
          }
        } else if (profileUpdate.error) {
          throw profileUpdate.error;
        }

        setLocalOnboardingCompletion(user.authUserId);

      }

      await persistCategoryPreferences(categoryIds);

      if (mode === 'survey') {
        await markOnboardingCompleted();
      }

      await finishAndRefresh(
        mode === 'profile'
          ? 'Профилът и предпочитанията са обновени. Ако имейлът е сменен, провери пощата си за потвърждение.'
          : 'Предпочитанията са запазени.',
        true
      );
    } catch (error) {
      message.error(error instanceof Error ? error.message : 'Неуспешно запазване на профила.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancel = () => {
    if (mode === 'survey') {
      void handleSkip();
      return;
    }

    onClose();
  };

  const footer =
    mode === 'survey' ? (
      <Space style={{ width: '100%', justifyContent: 'space-between' }}>
        <Button onClick={handleSkip} disabled={isSaving}>
          Откажи
        </Button>
        <Button type="primary" onClick={() => form.submit()} loading={isSaving}>
          Запази предпочитанията
        </Button>
      </Space>
    ) : undefined;

  return (
    <Modal
      open={open}
      title={mode === 'survey' ? 'Кратка анкета за интереси' : 'Профил и настройки'}
      okText={mode === 'survey' ? 'Запази' : 'Запази промените'}
      cancelText={mode === 'survey' ? 'Откажи' : 'Отказ'}
      confirmLoading={isSaving}
      destroyOnClose
      width={720}
      onCancel={handleCancel}
      onOk={() => form.submit()}
      footer={footer}
    >
      <Space direction="vertical" size="middle" style={{ width: '100%' }}>
        <Typography.Paragraph style={{ marginBottom: 0, color: 'var(--text-secondary)' }}>
          {mode === 'survey'
            ? 'Избери поне 3 категории, за да направим първите препоръки по-точни. Можеш да пропуснеш тази стъпка.'
            : 'Потвърждаваме промените със старата ти парола. Имейлът ще изисква допълнително потвърждение.'}
        </Typography.Paragraph>

        <Form<ProfileSettingsValues>
          form={form}
          layout="vertical"
          requiredMark={false}
          onFinish={handleSubmit}
          initialValues={{
            name: user.name,
            email: user.email,
            categoryIds: [],
          }}
        >
          {mode === 'profile' && (
            <>
              <Form.Item label="Име" name="name" rules={[{ required: true, message: 'Въведи име.' }]}>
                <Input placeholder="Име и фамилия" size="large" />
              </Form.Item>

              <Form.Item
                label="Имейл"
                name="email"
                rules={[
                  { required: true, message: 'Въведи имейл.' },
                  { type: 'email', message: 'Въведи валиден имейл адрес.' },
                ]}
              >
                <Input placeholder="name@example.com" size="large" />
              </Form.Item>

              <Form.Item
                label="Текуща парола"
                name="currentPassword"
                rules={[{ required: true, message: 'Въведи старата си парола.' }]}
              >
                <Input.Password placeholder="Стара парола" size="large" />
              </Form.Item>

              <Form.Item label="Нова парола" name="nextPassword">
                <Input.Password placeholder="Остави празно, ако не сменяш паролата" size="large" />
              </Form.Item>

              <Form.Item
                label="Потвърди новата парола"
                name="confirmPassword"
                dependencies={['nextPassword']}
                rules={[
                  ({ getFieldValue }) => ({
                    validator: async (_, value) => {
                      const nextPassword = getFieldValue('nextPassword') as string | undefined;

                      if (!nextPassword) {
                        return Promise.resolve();
                      }

                      if (!value || value === nextPassword) {
                        return Promise.resolve();
                      }

                      return Promise.reject(new Error('Новите пароли не съвпадат.'));
                    },
                  }),
                ]}
              >
                <Input.Password placeholder="Повтори новата парола" size="large" />
              </Form.Item>
            </>
          )}

          <Form.Item
            label="Предпочитани категории"
            name="categoryIds"
            rules={[
              {
                validator: async (_, value: string[] | undefined) => {
                  if (Array.isArray(value) && value.length >= 3) {
                    return Promise.resolve();
                  }

                  return Promise.reject(new Error('Избери поне 3 категории.'));
                },
              },
            ]}
          >
            <Select
              mode="multiple"
              size="large"
              placeholder="Избери поне 3 категории"
              options={availableCategories}
              maxTagCount="responsive"
            />
          </Form.Item>
        </Form>
      </Space>
    </Modal>
  );
};

export default ProfileSettingsModal;