import React from 'react';
import { Button, Space } from 'antd';
import { PlayCircleOutlined, PauseCircleOutlined, ReloadOutlined } from '@ant-design/icons';

/**
 * RobotController (Presentational Component)
 *
 * This component is now a "dumb" or "presentational" component.
 * It does not contain any internal logic or state management (useEffect, useState).
 * It receives all data and functions as props from its parent component.
 * Its only responsibility is to render the UI based on the props it receives.
 */
const RobotController = ({
  isAnimating,
  currentFrame,
  motionDataLength,
  currentGroupIndex,
  totalGroups,
  onToggleAnimation,
  onReset,
  renderButtonsOnly,
  renderTextOnly,
}) => {
  const isMotionDataAvailable = motionDataLength > 0;

  // Renders only the status text, used in the top left of the control bar.
  if (renderTextOnly) {
    return (
      <span style={{ color: '#888', fontSize: 14 }}>
        帧数: {isMotionDataAvailable ? `${currentFrame + 1} / ${motionDataLength}` : 'N/A'} &nbsp;|&nbsp; 组数: {currentGroupIndex + 1} / {totalGroups}
      </span>
    );
  }

  // Renders only the control buttons, used in the top right of the control bar.
  if (renderButtonsOnly) {
    return (
      <Space align="center" size={16}>
        <Button
          type="primary"
          icon={isAnimating ? <PauseCircleOutlined /> : <PlayCircleOutlined />}
          onClick={onToggleAnimation}
          disabled={!isMotionDataAvailable}
        >
          {isAnimating ? '暂停动画' : '开始动画'}
        </Button>
        <Button icon={<ReloadOutlined />} onClick={onReset} disabled={!isMotionDataAvailable}>
          重置关节
        </Button>
      </Space>
    );
  }

  // Fallback for a full component view, currently not used in your layout.
  return null;
};

export default RobotController;
