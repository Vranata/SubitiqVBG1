import React, { useEffect, useState } from 'react';
import { Modal, message } from 'antd';
import { detectBulgarianRegionFromBrowserLocation, isLocationPermissionDeniedError } from '../shared/browserLocation';
import {
  $detectedLocationRegion,
  $isLocationPromptOpen,
  $locationPermissionState,
  locationPermissionChanged,
  locationPromptClosed,
  locationRegionDetected,
} from '../entities/location/model';
import { useUnit } from 'effector-react';

const LocationInitializer: React.FC = () => {
  const [isResolving, setIsResolving] = useState(false);
  const { permissionState, detectedRegion, isPromptOpen, setPermissionState, setDetectedRegion, closePrompt } = useUnit({
    permissionState: $locationPermissionState,
    detectedRegion: $detectedLocationRegion,
    isPromptOpen: $isLocationPromptOpen,
    setPermissionState: locationPermissionChanged,
    closePrompt: locationPromptClosed,
    setDetectedRegion: locationRegionDetected,
  });

  const resolveLocation = async () => {
    setIsResolving(true);

    try {
      const nextRegion = await detectBulgarianRegionFromBrowserLocation();
      setPermissionState('accepted');
      setDetectedRegion(nextRegion);
      closePrompt();

      if (nextRegion) {
        message.success(`Открихме локацията ти: ${nextRegion.regionName}.`);
      } else {
        message.info('Локацията е разрешена, но не успяхме да определим областта.');
      }
    } catch (error) {
      if (isLocationPermissionDeniedError(error)) {
        setPermissionState('declined');
        closePrompt();
        message.warning('Без достъп до локация ще показваме препоръки по профила ти или общо.');
        return;
      }

      closePrompt();
      message.error(error instanceof Error ? error.message : 'Не успяхме да определим локацията ти.');
    } finally {
      setIsResolving(false);
    }
  };

  useEffect(() => {
    if (!isPromptOpen) {
      return;
    }

    if (permissionState === 'accepted') {
      if (!detectedRegion) {
        void resolveLocation();
      } else {
        closePrompt();
      }
      return;
    }

    if (permissionState === 'declined') {
      closePrompt();
    }
  }, [closePrompt, detectedRegion, isPromptOpen, permissionState]);

  return (
    <Modal
      open={isPromptOpen && permissionState === 'unknown'}
      title="Използване на местоположение"
      okText="Разреши"
      cancelText="Не сега"
      confirmLoading={isResolving}
      onOk={() => void resolveLocation()}
      onCancel={() => {
        setPermissionState('declined');
        closePrompt();
      }}
      centered
      maskClosable={false}
      closable={false}
    >
      <div style={{ color: 'var(--text-secondary)', lineHeight: 1.6 }}>
        Ако разрешиш локация, ще показваме по-близките и препоръчаните събития според областта ти в България.
      </div>
    </Modal>
  );
};

export default LocationInitializer;