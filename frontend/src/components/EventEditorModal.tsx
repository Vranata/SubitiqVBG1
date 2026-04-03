import React, { useEffect } from 'react';
import dayjs, { type Dayjs } from 'dayjs';
import customParseFormat from 'dayjs/plugin/customParseFormat';
import { Alert, Button, Col, DatePicker, Form, Input, Modal, Row, Select, TimePicker } from 'antd';
import type { FilterOption, EventEditorValues, EventItem } from '../entities/events/model';

dayjs.extend(customParseFormat);

type EventEditorFormValues = {
  name: string;
  artist: string;
  place: string;
  description: string;
  regionId: string;
  categoryId: string;
  startDate: Dayjs | null;
  endDate: Dayjs | null;
  startHour: Dayjs | null;
  endHour: Dayjs | null;
};

type EventEditorModalProps = {
  open: boolean;
  title: string;
  confirmText: string;
  loading?: boolean;
  event: EventItem | null;
  regions: FilterOption[];
  categories: FilterOption[];
  errorMessage?: string | null;
  onCancel: () => void;
  onSubmit: (values: EventEditorValues) => Promise<void> | void;
};

const buildInitialValues = (event: EventItem | null): Partial<EventEditorFormValues> => ({
  name: event?.title ?? '',
  artist: event?.artist ?? '',
  place: event?.place ?? '',
  description: event?.description ?? '',
  regionId: event ? String(event.regionId) : undefined,
  categoryId: event ? String(event.categoryId) : undefined,
  startDate: event ? dayjs(event.startDate, 'YYYY-MM-DD') : null,
  endDate: event ? dayjs(event.endDate, 'YYYY-MM-DD') : null,
  startHour: event ? dayjs(event.startHour, ['HH:mm:ss', 'HH:mm']) : null,
  endHour: event ? dayjs(event.endHour, ['HH:mm:ss', 'HH:mm']) : null,
});

const EventEditorModal: React.FC<EventEditorModalProps> = ({
  open,
  title,
  confirmText,
  loading = false,
  event,
  regions,
  categories,
  errorMessage,
  onCancel,
  onSubmit,
}) => {
  const [form] = Form.useForm<EventEditorFormValues>();
  const startDate = Form.useWatch('startDate', form);
  const endDate = Form.useWatch('endDate', form);
  const startHour = Form.useWatch('startHour', form);

  useEffect(() => {
    if (open) {
      form.setFieldsValue(buildInitialValues(event));
      return;
    }

    form.resetFields();
  }, [event, form, open]);

  const handleFinish = async (values: EventEditorFormValues) => {
    if (!values.startDate || !values.endDate || !values.startHour || !values.endHour) {
      return;
    }

    await onSubmit({
      name: values.name.trim(),
      artist: values.artist.trim(),
      place: values.place.trim(),
      description: values.description.trim(),
      regionId: values.regionId,
      categoryId: values.categoryId,
      startDate: values.startDate.format('YYYY-MM-DD'),
      endDate: values.endDate.format('YYYY-MM-DD'),
      startHour: values.startHour.format('HH:mm:ss'),
      endHour: values.endHour.format('HH:mm:ss'),
    });
  };

  return (
    <Modal
      open={open}
      title={title}
      okText={confirmText}
      cancelText="Отказ"
      confirmLoading={loading}
      onOk={() => form.submit()}
      onCancel={onCancel}
      destroyOnClose
      width={760}
    >
      {errorMessage ? (
        <Alert
          type="error"
          showIcon
          message={errorMessage}
          style={{ marginBottom: '16px' }}
        />
      ) : null}

      <Form<EventEditorFormValues>
        form={form}
        layout="vertical"
        onFinish={handleFinish}
        initialValues={buildInitialValues(event)}
      >
        <Form.Item
          label="Име"
          name="name"
          rules={[
            { required: true, message: 'Въведи име на събитието.' },
            { max: 120, message: 'Името трябва да е до 120 символа.' },
          ]}
        >
          <Input placeholder="Например: Лятна рок вечер" />
        </Form.Item>

        <Form.Item
          label="Място"
          name="place"
          rules={[
            { required: true, message: 'Въведи място на събитието.' },
            { max: 120, message: 'Мястото трябва да е до 120 символа.' },
          ]}
        >
          <Input placeholder="Например: Летен театър" />
        </Form.Item>

        <Form.Item
          label="Изпълнител / организатор"
          name="artist"
          rules={[
            { required: true, message: 'Въведи изпълнител или организатор.' },
            { max: 120, message: 'Полето трябва да е до 120 символа.' },
          ]}
        >
          <Input placeholder="Например: The Horizon Band" />
        </Form.Item>

        <Row gutter={16}>
          <Col xs={24} md={12}>
            <Form.Item
              label="Град"
              name="regionId"
              rules={[{ required: true, message: 'Избери град.' }]}
            >
              <Select placeholder="Избери град" options={regions} />
            </Form.Item>
          </Col>
          <Col xs={24} md={12}>
            <Form.Item
              label="Категория"
              name="categoryId"
              rules={[{ required: true, message: 'Избери категория.' }]}
            >
              <Select placeholder="Избери категория" options={categories} />
            </Form.Item>
          </Col>
        </Row>

        <Row gutter={16}>
          <Col xs={24} md={12}>
            <Form.Item
              label="Начална дата"
              name="startDate"
              rules={[{ required: true, message: 'Избери начална дата.' }]}
            >
              <DatePicker
                style={{ width: '100%' }}
                disabledDate={(currentDate) => currentDate ? currentDate.isBefore(dayjs().startOf('day'), 'day') : false}
              />
            </Form.Item>
          </Col>
          <Col xs={24} md={12}>
            <Form.Item
              label="Крайна дата"
              name="endDate"
              dependencies={['startDate']}
              rules={[
                { required: true, message: 'Избери крайна дата.' },
                ({ getFieldValue }) => ({
                  validator(_, value) {
                    const selectedStartDate = getFieldValue('startDate') as Dayjs | null;

                    if (!selectedStartDate || !value) {
                      return Promise.resolve();
                    }

                    if (value.isBefore(selectedStartDate, 'day')) {
                      return Promise.reject(new Error('Крайната дата трябва да е след началната.'));
                    }

                    return Promise.resolve();
                  },
                }),
              ]}
            >
              <DatePicker
                style={{ width: '100%' }}
                disabledDate={(currentDate) => {
                  if (!startDate || !currentDate) {
                    return false;
                  }

                  return currentDate.isBefore(startDate, 'day');
                }}
              />
            </Form.Item>
          </Col>
        </Row>

        <Row gutter={16}>
          <Col xs={24} md={12}>
            <Form.Item
              label="Начален час"
              name="startHour"
              rules={[{ required: true, message: 'Избери начален час.' }]}
            >
              <TimePicker style={{ width: '100%' }} format="HH:mm" minuteStep={5} />
            </Form.Item>
          </Col>
          <Col xs={24} md={12}>
            <Form.Item
              label="Краен час"
              name="endHour"
              dependencies={['startDate', 'endDate', 'startHour']}
              rules={[
                { required: true, message: 'Избери краен час.' },
                ({ getFieldValue }) => ({
                  validator(_, value) {
                    const selectedStartDate = getFieldValue('startDate') as Dayjs | null;
                    const selectedEndDate = getFieldValue('endDate') as Dayjs | null;
                    const selectedStartHour = getFieldValue('startHour') as Dayjs | null;

                    if (!selectedStartDate || !selectedEndDate || !selectedStartHour || !value) {
                      return Promise.resolve();
                    }

                    if (selectedStartDate.isSame(selectedEndDate, 'day') && !value.isAfter(selectedStartHour)) {
                      return Promise.reject(new Error('Крайният час трябва да е след началния.'));
                    }

                    return Promise.resolve();
                  },
                }),
              ]}
            >
              <TimePicker style={{ width: '100%' }} format="HH:mm" minuteStep={5} />
            </Form.Item>
          </Col>
        </Row>

        <Form.Item
          label="Описание"
          name="description"
          rules={[
            { required: true, message: 'Въведи описание.' },
            { max: 500, message: 'Описанието трябва да е до 500 символа.' },
          ]}
        >
          <Input.TextArea rows={4} placeholder="Кратко описание на събитието" />
        </Form.Item>

        <Button type="primary" htmlType="submit" style={{ display: 'none' }} />
      </Form>
    </Modal>
  );
};

export default EventEditorModal;
