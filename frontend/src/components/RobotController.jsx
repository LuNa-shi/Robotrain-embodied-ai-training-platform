import React from 'react';
import { Button, Space } from 'antd';
import { PlayCircleOutlined, PauseCircleOutlined, ReloadOutlined, StepForwardOutlined } from '@ant-design/icons';

/**
 * [MODIFIED] RobotController (Presentational Component)
 * Now receives episode-related props for a more informative display.
 */
const RobotController = ({
  isAnimating,
  currentFrame,
  motionDataLength,
  currentEpisode, // New prop
  onToggleAnimation,
  onReset,
  onNextEpisode, // New prop
  renderButtonsOnly,
  renderTextOnly,
}) => {
  const isMotionDataAvailable = motionDataLength > 0;

  // Renders only the status text
  if (renderTextOnly) {
    return (
      <span style={{ color: '#555', fontSize: 14, fontWeight: 500 }}>
        {currentEpisode !== null ? `Episode: ${currentEpisode}` : 'No Episode Selected'}
        &nbsp;&nbsp;|&nbsp;&nbsp;
        帧数: {isMotionDataAvailable ? `${currentFrame + 1} / ${motionDataLength}` : 'N/A'}
      </span>
    );
  }

  // Renders only the control buttons
  if (renderButtonsOnly) {
    return (
      <Space align="center" size={12}>
        <Button
          type="primary"
          icon={isAnimating ? <PauseCircleOutlined /> : <PlayCircleOutlined />}
          onClick={onToggleAnimation}
          disabled={!isMotionDataAvailable}
        >
          {isAnimating ? '暂停' : '播放'}
        </Button>
        <Button icon={<ReloadOutlined />} onClick={onReset} disabled={!isMotionDataAvailable}>
          重置
        </Button>
        <Button icon={<StepForwardOutlined />} onClick={onNextEpisode} disabled={!isMotionDataAvailable}>
          下一个
        </Button>
      </Space>
    );
  }

  return null;
};

export default RobotController;
