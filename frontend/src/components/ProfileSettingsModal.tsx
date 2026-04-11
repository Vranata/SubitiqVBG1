import React, { useEffect, useMemo, useState } from 'react';
import { Button, Form, Input, Modal, Select, Space, Typography, message } from 'antd';
import type { AppUser } from '../entities/model';
import { refreshUserProfile } from '../entities/model';
import { supabase } from '../services/supabaseClient';
import { resetPassword, updateAccount } from '../shared/api/auth';
import { fallbackCategoryOptions } from '../shared/profileCategoryOptions';
import { setLocalOnboardingCompletion } from '../shared/profileOnboarding';

const isMissingOnboardingColumnError = (error: { code?: string | null; message?: string | null }) =>
  error.code === '42703' || error.code === 'PGRST204' || Boolean(error.message?.includes('profile_onboarding_completed'));

const isValidationError = (error: unknown) => Boolean(error && typeof error === 'object' && 'errorFields' in error);

type CategoryOption = {
  label: string;
  value: string;
};

type ProfileSettingsValues = {
  name: string;
  email: string;
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
  const [isSendingEmailChange, setIsSendingEmailChange] = useState(false);
  const [isSendingPasswordReset, setIsSendingPasswordReset] = useState(false);
  const [isEmailChangeVisible, setIsEmailChangeVisible] = useState(false);
  const [isPasswordChangeVisible, setIsPasswordChangeVisible] = useState(false);
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
        categoryIds: selectedCategoryIds,
      });
    };

    void loadProfilePreferences().catch((error) => {
      message.error(error instanceof Error ? error.message : 'Неуспешно зареждане на профила.');
    });

    setIsEmailChangeVisible(false);
    setIsPasswordChangeVisible(false);
    setIsSendingEmailChange(false);
    setIsSendingPasswordReset(false);
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

  const persistProfileBasics = async (nextName: string) => {
    const profileUpdate = await supabase
      .from('users')
      .update({
        name_user: nextName,
      })
      .eq('auth_user_id', user.authUserId);

    if (profileUpdate.error) {
      throw profileUpdate.error;
    }
  };

  const handleSubmit = async (values: ProfileSettingsValues) => {
    setIsSaving(true);

    try {
      const categoryIds = Array.from(new Set(values.categoryIds));
      const nextName = mode === 'profile' ? (values.name ?? user.name).trim() : user.name;

      if (mode === 'profile') {
        if (nextName !== user.name) {
          await updateAccount({
            data: {
              full_name: nextName,
              name: nextName,
            },
          });
        }

        const profileUpdate = await supabase
          .from('users')
          .update({
            name_user: nextName,
            profile_onboarding_completed: true,
          })
          .eq('auth_user_id', user.authUserId);

        if (profileUpdate.error && isMissingOnboardingColumnError(profileUpdate.error)) {
          await persistProfileBasics(nextName);
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
          ? 'Профилът и предпочитанията са обновени.'
          : 'Предпочитанията са запазени.',
        true
      );
    } catch (error) {
      message.error(error instanceof Error ? error.message : 'Неуспешно запазване на профила.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleEmailChangeConfirm = async () => {
    try {
      const values = await form.validateFields(['email']);
      const nextEmail = String(values.email ?? '').trim();

      if (nextEmail === user.email) {
        message.info('Имейлът вече е този, който използваш.');
        return;
      }

      setIsSendingEmailChange(true);

      await updateAccount({
        email: nextEmail,
        data: {
          full_name: user.name,
          name: user.name,
        },
      });

      message.success('Изпратихме потвърждение за смяната на имейла. Провери текущата си поща за следващата стъпка.');
      setIsEmailChangeVisible(false);
  form.setFieldsValue({ email: user.email });
      refreshUserProfile();
      onCompleted();
      onClose();
    } catch (error) {
      if (isValidationError(error)) {
        return;
      }

      message.error(error instanceof Error ? error.message : 'Неуспешно изпращане на потвърждение за смяна на имейл.');
    } finally {
      setIsSendingEmailChange(false);
    }
  };

  const handlePasswordResetRequest = async () => {
    try {
      if (typeof window === 'undefined') {
        throw new Error('Неуспешно изпращане на линк за смяна на паролата.');
      }

      setIsSendingPasswordReset(true);

      await resetPassword({
        email: user.email,
        redirectTo: `${window.location.origin}/login?mode=recovery`,
      });

      message.success('Изпратихме линк за смяна на паролата на текущия имейл.');
      setIsPasswordChangeVisible(false);
      onClose();
    } catch (error) {
      message.error(error instanceof Error ? error.message : 'Неуспешно изпращане на линк за смяна на паролата.');
    } finally {
      setIsSendingPasswordReset(false);
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

  const toggleEmailChange = () => {
    setIsEmailChangeVisible((current) => {
      const nextVisible = !current;

      if (!nextVisible) {
        form.setFieldsValue({ email: user.email });
      }

      return nextVisible;
    });
  };

  const togglePasswordChange = () => {
    setIsPasswordChangeVisible((current) => !current);
  };

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
            ? 'Избери категории, ако искаш, за да направим първите препоръки по-точни. Можеш да пропуснеш тази стъпка.'
            : 'Имейлът и паролата се отварят само при изрично желание. Всяка промяна има свой отделен бутон за потвърждение.'}
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

              <Button type="dashed" block onClick={toggleEmailChange}>
                {isEmailChangeVisible ? 'Скрий смяната на имейла' : 'Смени имейла'}
              </Button>

              {isEmailChangeVisible ? (
                <Space direction="vertical" size="small" style={{ width: '100%' }}>
                  <Typography.Paragraph style={{ marginBottom: 0, color: 'var(--text-secondary)' }}>
                    Желаете да смените имейла си? Ако не сте били вие, е добре да промените и данните си за вход.
                  </Typography.Paragraph>

                  <Form.Item
                    label="Нов имейл"
                    name="email"
                    rules={[
                      { required: true, message: 'Въведи имейл.' },
                      { type: 'email', message: 'Въведи валиден имейл адрес.' },
                    ]}
                  >
                    <Input placeholder="name@example.com" size="large" />
                  </Form.Item>

                  <Button type="primary" block onClick={handleEmailChangeConfirm} loading={isSendingEmailChange}>
                    Изпрати потвърждение към текущия имейл
                  </Button>
                </Space>
              ) : (
                <div style={{ color: 'var(--text-secondary)' }}>Имейл: {user.email}</div>
              )}

              <Button type="dashed" block onClick={togglePasswordChange}>
                {isPasswordChangeVisible ? 'Скрий смяната на паролата' : 'Смени паролата'}
              </Button>

              {isPasswordChangeVisible && (
                <Space direction="vertical" size="small" style={{ width: '100%' }}>
                  <Typography.Paragraph style={{ marginBottom: 0, color: 'var(--text-secondary)' }}>
                    Желаете да смените паролата си? Ако не сте били вие, е добре да промените и данните си за вход.
                  </Typography.Paragraph>

                  <Button type="primary" block onClick={handlePasswordResetRequest} loading={isSendingPasswordReset}>
                    Изпрати линк за смяна на паролата
                  </Button>
                </Space>
              )}
            </>
          )}

          <Form.Item
            label="Предпочитани категории"
            name="categoryIds"
          >
            <Select
              mode="multiple"
              size="large"
              placeholder="Избери категории, ако искаш"
              options={availableCategories}
              maxTagCount="responsive"
            />
          </Form.Item>

          <Typography.Text type="secondary" style={{ display: 'block', marginTop: -8 }}>
            Категориите не са задължителни. Можеш да оставиш полето празно.
          </Typography.Text>
        </Form>
      </Space>
    </Modal>
  );
};

export default ProfileSettingsModal;