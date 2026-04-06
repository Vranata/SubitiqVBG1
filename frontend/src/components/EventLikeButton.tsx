import React from 'react';
import { Button, Modal, message } from 'antd';
import { HeartFilled, HeartOutlined } from '@ant-design/icons';
import { useUnit } from 'effector-react';
import { $likedEventIds, toggleEventLikeFx } from '../entities/events/model';
import { $user } from '../entities/model';
import { history } from '../shared/routing';

type EventLikeButtonProps = {
  eventId: string;
  compact?: boolean;
  block?: boolean;
};

const EventLikeButton: React.FC<EventLikeButtonProps> = ({ eventId, compact = false, block = false }) => {
  const { user, likedEventIds, toggleLike, isToggling } = useUnit({
    user: $user,
    likedEventIds: $likedEventIds,
    toggleLike: toggleEventLikeFx,
    isToggling: toggleEventLikeFx.pending,
  });

  const isLiked = likedEventIds.includes(eventId);

  const handleClick = async () => {
    if (!user) {
      Modal.confirm({
        title: 'Вход или регистрация',
        centered: true,
        okText: 'Вход / регистрация',
        cancelText: 'Отказ',
        content: (
          <div style={{ color: 'var(--text-secondary)', lineHeight: 1.6 }}>
            За да харесваш събития, трябва да влезеш в профила си или да си направиш акаунт в CULTURO BG.
          </div>
        ),
        onOk: () => {
          history.push('/login');
        },
      });
      return;
    }

    const userId = Number(user.id);

    if (Number.isNaN(userId)) {
      message.error('Профилът не е синхронизиран. Презареди страницата.');
      return;
    }

    try {
      await toggleLike({
        userId: String(userId),
        eventId,
      });
    } catch (error) {
      message.error(error instanceof Error ? error.message : 'Неуспешно харесване на събитието.');
    }
  };

  return (
    <Button
      className="event-like-button"
      data-liked={isLiked ? 'true' : 'false'}
      type="default"
      icon={isLiked ? <HeartFilled /> : <HeartOutlined />}
      onClick={handleClick}
      loading={isToggling}
      block={block}
      size={compact ? 'small' : 'middle'}
      style={{
        minWidth: compact ? 118 : 138,
        fontWeight: 700,
        borderRadius: 12,
        background: isLiked ? 'var(--accent)' : 'var(--surface-elevated)',
        borderColor: 'var(--accent)',
        color: isLiked ? '#ffffff' : 'var(--accent)',
        boxShadow: isLiked ? '0 10px 24px rgba(24, 144, 255, 0.18)' : '0 8px 18px rgba(15, 23, 42, 0.06)',
      }}
    >
      {isLiked ? 'Харесано' : 'Харесай'}
    </Button>
  );
};

export default EventLikeButton;
