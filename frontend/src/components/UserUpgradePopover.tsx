import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Button, Form, Input, Modal, Popover, Radio, Select, Space, Typography, message } from 'antd';
import { useUnit } from 'effector-react';
import type { AppUser } from '../entities/model';
import { $categoryOptions, fetchCategoriesFx } from '../entities/events/model';
import { $isLocationPromptOpen } from '../entities/location/model';
import { supabase } from '../services/supabaseClient';
import ProfileSettingsModal from './ProfileSettingsModal';
import { fallbackCategoryOptions } from '../shared/profileCategoryOptions';
import { hasLocalOnboardingCompletion } from '../shared/profileOnboarding';

const { TextArea } = Input;

type UpgradeRequestValues = {
  applicantName: string;
  applicantEmail: string;
  specialtyCategoryId: string;
  applicantType: 'person' | 'company';
  companyIdentifier?: string;
  reason: string;
};

const UserUpgradePopover: React.FC<{ user: AppUser }> = ({ user }) => {
  const [form] = Form.useForm<UpgradeRequestValues>();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isSurveyOpen, setIsSurveyOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const surveyPromptedUserIdRef = useRef<string | null>(null);

  const { categoryOptions, loadCategories, isLocationPromptOpen } = useUnit({
    categoryOptions: $categoryOptions,
    loadCategories: fetchCategoriesFx,
    isLocationPromptOpen: $isLocationPromptOpen,
  });

  useEffect(() => {
    if (categoryOptions.length === 0) {
      void loadCategories();
    }
  }, [categoryOptions.length, loadCategories]);

  useEffect(() => {
    if (!user) {
      surveyPromptedUserIdRef.current = null;
      setIsSurveyOpen(false);
      setIsSettingsOpen(false);
      return;
    }

    if (user.onboardingCompleted || hasLocalOnboardingCompletion(user.authUserId)) {
      surveyPromptedUserIdRef.current = user.authUserId;
      setIsSurveyOpen(false);
      return;
    }

    if (surveyPromptedUserIdRef.current === user.authUserId) {
      return;
    }

    if (isLocationPromptOpen) {
      return;
    }

    const promptTimer = window.setTimeout(() => {
      if (surveyPromptedUserIdRef.current === user.authUserId) {
        return;
      }

      surveyPromptedUserIdRef.current = user.authUserId;
      setIsSurveyOpen(true);
    }, 600);

    return () => {
      window.clearTimeout(promptTimer);
    };
  }, [isLocationPromptOpen, user?.authUserId, user?.onboardingCompleted]);

  useEffect(() => {
    if (!isModalOpen) {
      return;
    }

    form.setFieldsValue({
      applicantName: user.name,
      applicantEmail: user.email,
      applicantType: 'person',
      specialtyCategoryId: categoryOptions[0]?.value ?? fallbackCategoryOptions[0].value,
    });
  }, [categoryOptions, form, isModalOpen, user.email, user.name]);

  const specialtyOptions = useMemo(
    () => (categoryOptions.length > 0 ? categoryOptions : fallbackCategoryOptions),
    [categoryOptions]
  );

  const handleOpenModal = () => {
    setIsModalOpen(true);
  };

  const handleOpenSettings = () => {
    surveyPromptedUserIdRef.current = user.authUserId;
    setIsSurveyOpen(false);
    setIsSettingsOpen(true);
  };

  const handleSettingsClose = () => {
    setIsSettingsOpen(false);
  };

  const handleSurveyCompleted = () => {
    setIsSurveyOpen(false);
  };

  const handleCloseModal = () => {
    form.resetFields();
    setIsModalOpen(false);
  };

  const handleSubmit = async (values: UpgradeRequestValues) => {
    const specialtyLabel = specialtyOptions.find((option) => option.value === values.specialtyCategoryId)?.label ?? values.specialtyCategoryId;
    const requestPayload = {
      applicantName: values.applicantName,
      applicantEmail: values.applicantEmail,
      specialtyCategory: specialtyLabel,
      specialtyCategoryId: Number(values.specialtyCategoryId),
      applicantType: values.applicantType,
      companyIdentifier: values.applicantType === 'company' ? values.companyIdentifier ?? null : null,
      reason: values.reason,
      submittedByEmail: user.email,
      submittedByRole: user.roleName,
    };

    const extractErrorMessage = (error: unknown, fallback: string) => {
      if (error instanceof Error && error.message) {
        return error.message;
      }

      if (typeof error === 'string' && error.trim()) {
        return error;
      }

      if (error && typeof error === 'object') {
        const maybeMessage = (error as { message?: unknown }).message;
        if (typeof maybeMessage === 'string' && maybeMessage.trim()) {
          return maybeMessage;
        }

        const maybeDetails = (error as { details?: unknown }).details;
        if (typeof maybeDetails === 'string' && maybeDetails.trim()) {
          return maybeDetails;
        }

        const maybeError = (error as { error?: unknown }).error;
        if (typeof maybeError === 'string' && maybeError.trim()) {
          return maybeError;
        }

        try {
          return JSON.stringify(error);
        } catch {
          return fallback;
        }
      }

      return fallback;
    };

    try {
      setIsSubmitting(true);

      const { data: requestRow, error } = await supabase.from('user_upgrade_requests').insert({
        auth_user_id: user.authUserId,
        applicant_name: values.applicantName,
        applicant_email: values.applicantEmail,
        specialty_category_id: Number(values.specialtyCategoryId),
        is_company: values.applicantType === 'company',
        company_identifier: values.applicantType === 'company' ? values.companyIdentifier ?? null : null,
        reason: values.reason,
      }).select('id_request').single();

      if (error || !requestRow) {
        throw new Error(`Грешка при записване на заявката: ${extractErrorMessage(error, 'Неизвестна грешка при записване.')}`);
      }

      const requestPayloadExt = {
        ...requestPayload,
        requestId: requestRow.id_request,
        applicantAuthId: user.authUserId,
      };

      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/send-upgrade-request`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
          Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
        },
        body: JSON.stringify(requestPayloadExt),
      });

      const responseText = await response.text();

      if (!response.ok) {
        try {
          const parsedResponse = JSON.parse(responseText) as { error?: unknown; details?: unknown };
          throw new Error(`Грешка при изпращане на имейла: ${extractErrorMessage(parsedResponse.details ?? parsedResponse.error ?? responseText, 'Неизвестна грешка при изпращане.')}`);
        } catch {
          throw new Error(`Грешка при изпращане на имейла: ${responseText || `HTTP ${response.status}`}`);
        }
      }

      message.success('Заявката е записана и е изпратена за одобрение на администратора.');
      setIsModalOpen(false);
      form.resetFields();
    } catch (error) {
      message.error(extractErrorMessage(error, 'Неуспешно изпращане на заявката.'));
    } finally {
      setIsSubmitting(false);
    }
  };

  const content = (
    <div style={{ maxWidth: 260 }}>
      <Typography.Title level={5} style={{ marginBottom: 8, color: 'var(--text-primary)' }}>
        Стани Special User
      </Typography.Title>
      <Typography.Paragraph style={{ marginBottom: 12, color: 'var(--text-secondary)' }}>
        Изпрати кратка заявка и тя ще бъде прегледана от администратора.
      </Typography.Paragraph>
      <Button type="primary" block onClick={handleOpenModal}>
        Upgrade to Special User
      </Button>
    </div>
  );

  const badge = (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginLeft: 12 }}>
      <Popover
        trigger="hover"
        placement="bottomRight"
        content={
          <div style={{ maxWidth: 260 }}>
            <Typography.Title level={5} style={{ marginBottom: 8, color: 'var(--text-primary)' }}>
              Настройки
            </Typography.Title>
            <Typography.Paragraph style={{ marginBottom: 12, color: 'var(--text-secondary)' }}>
              Прегледай профила си, смени името, имейла, паролата и предпочитанията си.
            </Typography.Paragraph>
            <Button type="primary" block onClick={handleOpenSettings}>
              Отвори профил
            </Button>
          </div>
        }
      >
        <Button
          type="text"
          onClick={handleOpenSettings}
          aria-label="Отвори профилни настройки"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            maxWidth: 200,
            height: 34,
            padding: '0 12px',
            borderRadius: 999,
            border: '1px solid var(--toggle-border)',
            background: 'var(--toggle-bg)',
            color: 'var(--header-text)',
            fontSize: '0.8rem',
            fontWeight: 600,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            cursor: 'pointer',
          }}
        >
          {user.email}
        </Button>
      </Popover>

      {user.roleName === 'User' ? (
        <Popover content={content} trigger="hover" placement="bottomRight">
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              height: 34,
              padding: '0 12px',
              borderRadius: 999,
              border: '1px solid var(--toggle-border)',
              background: 'var(--toggle-bg)',
              color: 'var(--header-text)',
              fontSize: '0.72rem',
              fontWeight: 700,
              whiteSpace: 'nowrap',
              cursor: 'pointer',
            }}
          >
            {user.roleName}
          </span>
        </Popover>
      ) : (
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            height: 34,
            padding: '0 12px',
            borderRadius: 999,
            border: '1px solid var(--toggle-border)',
            background: 'var(--toggle-bg)',
            color: 'var(--header-text)',
            fontSize: '0.72rem',
            fontWeight: 700,
            whiteSpace: 'nowrap',
          }}
        >
          {user.roleName}
        </span>
      )}
    </div>
  );

  return (
    <>
      {badge}

      <Modal
        open={isModalOpen}
        title="Заявка за Upgrade към Special User"
        okText="Изпрати"
        cancelText="Отказ"
        destroyOnClose
        confirmLoading={isSubmitting}
        onCancel={handleCloseModal}
        onOk={() => form.submit()}
      >
        <Form form={form} layout="vertical" requiredMark={false} onFinish={handleSubmit}>
          <Form.Item
            label="Име (на фирма или човек)"
            name="applicantName"
            rules={[{ required: true, message: 'Въведи име на фирма или човек.' }]}
          >
            <Input placeholder="Име на фирма или човек" size="large" />
          </Form.Item>

          <Form.Item
            label="Имейл"
            name="applicantEmail"
            rules={[
              { required: true, message: 'Въведи имейл адрес.' },
              { type: 'email', message: 'Въведи валиден имейл адрес.' },
            ]}
          >
            <Input placeholder="name@example.com" size="large" />
          </Form.Item>

          <Form.Item
            label="Специалност (категория)"
            name="specialtyCategoryId"
            rules={[{ required: true, message: 'Избери категория.' }]}
          >
            <Select
              size="large"
              placeholder="Избери категория"
              options={specialtyOptions}
            />
          </Form.Item>

          <Form.Item
            label="Тип заявител"
            name="applicantType"
            rules={[{ required: true, message: 'Избери тип заявител.' }]}
          >
            <Radio.Group>
              <Space orientation="horizontal" wrap>
                <Radio value="person">Човек</Radio>
                <Radio value="company">Фирма</Radio>
              </Space>
            </Radio.Group>
          </Form.Item>

          <Form.Item noStyle shouldUpdate={(previous, next) => previous.applicantType !== next.applicantType}>
            {({ getFieldValue }) =>
              getFieldValue('applicantType') === 'company' ? (
                <Form.Item
                  label="EIK/INDDS"
                  name="companyIdentifier"
                  rules={[{ required: true, message: 'Въведи EIK/INDDS.' }]}
                >
                  <Input placeholder="EIK/INDDS" size="large" />
                </Form.Item>
              ) : null
            }
          </Form.Item>

          <Form.Item
            label="Защо да получиш тази роля?"
            name="reason"
            rules={[{ required: true, message: 'Опиши накратко мотивацията си.' }]}
          >
            <TextArea rows={5} placeholder="Обясни защо да бъдеш Special User" />
          </Form.Item>
        </Form>
      </Modal>

      <ProfileSettingsModal
        open={isSettingsOpen}
        mode="profile"
        user={user}
        categoryOptions={categoryOptions.length > 0 ? categoryOptions : fallbackCategoryOptions}
        onClose={handleSettingsClose}
        onCompleted={handleSettingsClose}
      />

      <ProfileSettingsModal
        open={isSurveyOpen}
        mode="survey"
        user={user}
        categoryOptions={categoryOptions.length > 0 ? categoryOptions : fallbackCategoryOptions}
        onClose={() => setIsSurveyOpen(false)}
        onCompleted={handleSurveyCompleted}
      />
    </>
  );
};

export default UserUpgradePopover;