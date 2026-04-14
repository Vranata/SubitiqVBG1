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

type UserRowId = {
  id_user: number;
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

  const resolveCurrentUserDbId = async (retries = 2): Promise<number | null> => {
    const { data, error } = await supabase
      .from('users')
      .select('id_user')
      .eq('auth_user_id', user.authUserId)
      .maybeSingle<UserRowId>();

    if (error) throw error;
    if (data?.id_user) return data.id_user;

    if (retries > 0) {
      await new Promise((resolve) => setTimeout(resolve, 500));
      return resolveCurrentUserDbId(retries - 1);
    }

    // 1. Check if user already exists to avoid resetting their role
    const { data: existingUser } = await supabase
      .from('users')
      .select('id_user, id_category')
      .eq('auth_user_id', user.authUserId)
      .maybeSingle();

    const payload: any = {
      auth_user_id: user.authUserId,
      email: user.email,
      name_user: user.name,
      password_hash: 'supabase_auth_managed_placeholder',
    };

    // Only set default role and region for BRAND NEW users
    if (!existingUser) {
      payload.id_category = 1;
      payload.id_region = 0;
      payload.profile_onboarding_completed = false;
    }

    const { data: upsertData, error: upsertError } = await supabase
      .from('users')
      .upsert(payload, { onConflict: 'auth_user_id', ignoreDuplicates: false })
      .select('id_user, id_category')
      .single();

    if (upsertError) return null;
    return upsertData?.id_user ?? null;
  };

  useEffect(() => {
    if (!open) return;

    const loadProfilePreferences = async () => {
      // Small delay to ensure the form is fully connected
      await new Promise((resolve) => setTimeout(resolve, 100));
      const currentUserDbId = await resolveCurrentUserDbId();

      if (currentUserDbId === null) {
        form.setFieldsValue({ name: user.name, email: user.email, categoryIds: [] });
        return;
      }

      const { data, error } = await supabase
        .from('user_likings')
        .select('id_event_category')
        .eq('id_user', currentUserDbId);

      if (error) {
        form.setFieldsValue({ name: user.name, email: user.email, categoryIds: [] });
        return;
      }

      const selectedCategoryIds = (data ?? []).map((row) => String(row.id_event_category));
      form.setFieldsValue({
        name: user.name,
        email: user.email,
        categoryIds: selectedCategoryIds,
      });
      console.log('[Preferences] User preferences loaded.');
    };

    void loadProfilePreferences().catch((error) => {
      console.error('[Preferences] Error:', error);
      message.error('Грешка при зареждане на профила.');
    });

    setIsEmailChangeVisible(false);
    setIsPasswordChangeVisible(false);
    setIsSendingEmailChange(false);
    setIsSendingPasswordReset(false);
  }, [form, open, user.email, user.id, user.name, availableCategories]);

  const persistCategoryPreferences = async (categoryIds: string[]) => {
    const currentUserDbId = await resolveCurrentUserDbId();
    if (currentUserDbId === null) return;

    await supabase.from('user_likings').delete().eq('id_user', currentUserDbId);
    if (categoryIds.length === 0) return;

    await supabase.from('user_likings').insert(
      categoryIds.map((categoryId) => ({
        id_user: currentUserDbId,
        id_event_category: Number(categoryId),
      }))
    );
  };

  const handleSave = async (values: ProfileSettingsValues) => {
    setIsSaving(true);
    try {
      // 1. Persist categories
      await persistCategoryPreferences(values.categoryIds);

      // 2. Update basic info (name/email if needed)
      if (values.name !== user.name) {
        // Update Auth Metadata (for fallback)
        await updateAccount({ data: { full_name: values.name } });
        
        // Update Users Table (source of truth for the app)
        const currentUserDbId = await resolveCurrentUserDbId();
        if (currentUserDbId) {
          const { error: dbError } = await supabase
            .from('users')
            .update({ name_user: values.name })
            .eq('id_user', currentUserDbId);
          if (dbError) throw dbError;
        }
      }

      // 3. Mark onboarding as completed if in survey mode
      if (mode === 'survey') {
        const currentUserDbId = await resolveCurrentUserDbId();
        if (currentUserDbId) {
          await supabase.from('users').update({ profile_onboarding_completed: true }).eq('id_user', currentUserDbId);
          setLocalOnboardingCompletion(user.authUserId);
        }
      }

      message.success('Промените са запазени успешно!');
      refreshUserProfile();
      onCompleted();
    } catch (error: any) {
      if (!isValidationError(error)) {
        console.error('Save error:', error);
        message.error(error.message || 'Грешка при записване.');
      }
    } finally {
      setIsSaving(false);
    }
  };

  const handlePasswordReset = async () => {
    setIsSendingPasswordReset(true);
    try {
      await resetPassword({ email: user.email, redirectTo: window.location.origin });
      message.success('Линк за нулиране на паролата е изпратен на вашия имейл.');
      setIsPasswordChangeVisible(false);
    } catch (error: any) {
      console.error('Password reset error:', error);
      message.error(error.message || 'Грешка при изпращане на имейл.');
    } finally {
      setIsSendingPasswordReset(false);
    }
  };

  const handleEmailChangeRequest = async () => {
    const newEmail = form.getFieldValue('email');
    if (!newEmail || newEmail === user.email) {
      message.warning('Моля въведете нов имейл адрес.');
      return;
    }

    setIsSendingEmailChange(true);
    try {
      await updateAccount({ email: newEmail });
      message.success('Заявката е изпратена. Моля проверете новия си имейл за потвърждение.');
      setIsEmailChangeVisible(false);
    } catch (error: any) {
      console.error('Email change error:', error);
      message.error(error.message || 'Грешка при промяна на имейла.');
    } finally {
      setIsSendingEmailChange(false);
    }
  };

  return (
    <Modal
      title={mode === 'survey' ? 'Добре дошли в CULTURO BG' : 'Профил и настройки'}
      open={open}
      onCancel={onClose}
      footer={null}
      width={600}
      destroyOnHidden
    >
      <div style={{ padding: '10px 0' }}>
        <Typography.Paragraph type="secondary">
          Имейлът и паролата се отварят само при изрично желание. Всяка промяна има свой отделен бутон за потвърждение.
        </Typography.Paragraph>

        <Form form={form} layout="vertical" onFinish={handleSave} initialValues={{ name: user.name, email: user.email }}>
          <Form.Item name="name" label="Име" rules={[{ required: true, message: 'Моля въведете име.' }]}>
            <Input placeholder="Вашето име" />
          </Form.Item>

          {isEmailChangeVisible ? (
            <Form.Item label="Нов имейл адрес" style={{ marginBottom: 24 }}>
              <Space.Compact style={{ width: '100%' }}>
                <Form.Item name="email" noStyle rules={[{ required: true, type: 'email', message: 'Моля въведете валиден имейл.' }]}>
                  <Input placeholder="нов.имейл@example.com" />
                </Form.Item>
                <Button type="primary" onClick={handleEmailChangeRequest} loading={isSendingEmailChange}>
                  Потвърди
                </Button>
                <Button onClick={() => setIsEmailChangeVisible(false)}>Отказ</Button>
              </Space.Compact>
            </Form.Item>
          ) : (
            <div style={{ marginBottom: 24 }}>
              <Button type="dashed" block onClick={() => setIsEmailChangeVisible(true)}>
                Смени имейла
              </Button>
              <Typography.Text type="secondary" style={{ fontSize: '12px' }}>
                Имейл: {user.email}
              </Typography.Text>
            </div>
          )}

          {isPasswordChangeVisible ? (
            <div style={{ marginBottom: 24, padding: '12px', border: '1px solid var(--border-color)', borderRadius: '8px' }}>
              <Typography.Paragraph>Ще ви изпратим линк за нулиране на паролата на вашия имейл адрес.</Typography.Paragraph>
              <Space>
                <Button type="primary" onClick={handlePasswordReset} loading={isSendingPasswordReset}>
                  Изпрати линк
                </Button>
                <Button onClick={() => setIsPasswordChangeVisible(false)}>Отказ</Button>
              </Space>
            </div>
          ) : (
            <div style={{ marginBottom: 24 }}>
              <Button type="dashed" block onClick={() => setIsPasswordChangeVisible(true)}>
                Смени паролата
              </Button>
            </div>
          )}

          <Form.Item name="categoryIds" label="Предпочитани категории">
            <Select mode="multiple" placeholder="Изберете категории" style={{ width: '100%' }} options={availableCategories} />
          </Form.Item>
          <Typography.Text type="secondary" style={{ fontSize: '12px', display: 'block', marginBottom: '24px' }}>
            Категориите не са задължителни. Можеш да оставиш полето празно.
          </Typography.Text>

          <Form.Item style={{ marginBottom: 0, textAlign: 'right' }}>
            <Space>
              <Button onClick={onClose}>Отказ</Button>
              <Button type="primary" htmlType="submit" loading={isSaving}>
                {mode === 'survey' ? 'Започни' : 'Запази промените'}
              </Button>
            </Space>
          </Form.Item>
        </Form>
      </div>
    </Modal>
  );
};

export default ProfileSettingsModal;