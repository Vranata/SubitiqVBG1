import React, { useState } from 'react';
import { useUnit } from 'effector-react';
import { Table, Typography, Button, Modal, Input, message, Tag, Space, Card, Alert } from 'antd';
import { UserOutlined, WarningOutlined, ArrowLeftOutlined, CloseCircleOutlined } from '@ant-design/icons';
import { Link } from 'atomic-router-react';
import { $specialUsers, downgradeUserFx, type AppUser } from '../../entities/model';
import { routes } from '../../shared/routing';

const { Title, Text, Paragraph } = Typography;

const AdminUsers: React.FC = () => {
  const [messageApi, contextHolder] = message.useMessage();
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [selectedUser, setSelectedUser] = useState<AppUser | null>(null);
  const [confirmEmail, setConfirmEmail] = useState('');

  const { specialUsers, downgrade, isDowngrading } = useUnit({
    specialUsers: $specialUsers,
    downgrade: downgradeUserFx,
    isDowngrading: downgradeUserFx.pending,
  });

  const showDowngradeModal = (user: AppUser) => {
    setSelectedUser(user);
    setConfirmEmail('');
    setIsModalVisible(true);
  };

  const handleCancel = () => {
    setIsModalVisible(false);
    setSelectedUser(null);
    setConfirmEmail('');
  };

  const handleConfirm = async () => {
    if (!selectedUser) return;
    
    try {
      await downgrade({ userId: selectedUser.id, confirmEmail });
      messageApi.success(`Потребителят ${selectedUser.email} беше успешно понижен.`);
      handleCancel();
    } catch (err: any) {
      messageApi.error(err.message || 'Възникна грешка при понижаването на потребителя.');
    }
  };

  const columns = [
    {
      title: 'Потребител',
      key: 'user',
      render: (_: any, record: AppUser) => (
        <Space size="middle">
          <div style={{ 
            width: 40, 
            height: 40, 
            borderRadius: '50%', 
            background: 'var(--accent)', 
            display: 'flex', 
            alignItems: 'center', 
            justifyContent: 'center',
            color: 'white'
          }}>
            <UserOutlined />
          </div>
          <div>
            <Text strong style={{ display: 'block', color: 'var(--text-primary)' }}>{record.name}</Text>
            <Text type="secondary" style={{ fontSize: '12px' }}>{record.email}</Text>
          </div>
        </Space>
      ),
    },
    {
      title: 'Роля',
      key: 'role',
      render: (_: any, record: AppUser) => (
        <Tag color="orange">{record.roleName}</Tag>
      ),
    },
    {
      title: 'Действия',
      key: 'actions',
      align: 'right' as const,
      render: (_: any, record: AppUser) => (
        <Button 
          danger 
          icon={<CloseCircleOutlined />}
          onClick={() => showDowngradeModal(record)}
        >
          Премахни права
        </Button>
      ),
    },
  ];

  return (
    <div style={{ maxWidth: '1000px', margin: '0 auto', color: 'var(--text-primary)' }}>
      {contextHolder}
      
      <div style={{ marginBottom: '32px', display: 'flex', alignItems: 'center', gap: '16px' }}>
        <Link to={routes.home}>
          <Button icon={<ArrowLeftOutlined />} shape="circle" />
        </Link>
        <Title level={2} style={{ margin: 0, color: 'var(--text-primary)' }}>Управление на потребители</Title>
      </div>

      <Card 
        variant="borderless" 
        style={{ 
          background: 'var(--surface-bg)', 
          border: '1px solid var(--border-color)',
          boxShadow: 'var(--shadow-soft)' 
        }}
      >
        <div style={{ marginBottom: '24px' }}>
          <Text type="secondary">Тук можете да управлявате правата на потребителите с роля "Специален потребител".</Text>
        </div>

        <Table 
          dataSource={specialUsers} 
          columns={columns} 
          rowKey="id"
          pagination={false}
          locale={{ emptyText: 'Няма специални потребители за управление.' }}
        />
      </Card>

      <Modal
        title={
          <Space>
            <WarningOutlined style={{ color: '#ff4d4f' }} />
            <span>Потвърдете понижаването на роля</span>
          </Space>
        }
        open={isModalVisible}
        onOk={handleConfirm}
        onCancel={handleCancel}
        confirmLoading={isDowngrading}
        okText="Потвърди понижаването"
        cancelText="Отказ"
        okButtonProps={{ 
          danger: true, 
          disabled: !selectedUser || confirmEmail.toLowerCase() !== selectedUser.email.toLowerCase() 
        }}
      >
        <div style={{ marginTop: '16px' }}>
          <Alert
            message="Внимание: Тази операция е необратима през този интерфейс."
            description="Потребителят ще загуби правата си да създава и управлява събития веднага."
            type="warning"
            showIcon
            style={{ marginBottom: '20px' }}
          />
          
          <Paragraph>
            За да потвърдите, че искате да понижите <strong>{selectedUser?.name}</strong>, моля напишете неговия имейл (<strong>{selectedUser?.email}</strong>) по-долу:
          </Paragraph>
          
          <Input 
            placeholder="Въведете имейл за потвърждение" 
            value={confirmEmail}
            onChange={(e) => setConfirmEmail(e.target.value)}
            onPressEnter={() => {
              if (confirmEmail.toLowerCase() === selectedUser?.email.toLowerCase()) {
                handleConfirm();
              }
            }}
          />
        </div>
      </Modal>
    </div>
  );
};

export default AdminUsers;
