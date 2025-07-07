import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Button, Card, Row, Col, Typography, Space } from 'antd';
import { PlayCircleOutlined, PauseCircleOutlined, ReloadOutlined } from '@ant-design/icons';

const { Text } = Typography;

const RobotController = ({ robotRef, motionData = [], currentGroupIndex = 0, totalGroups = 1, onGroupEnd, autoPlay = false, setAutoPlay, renderButtonsOnly, renderTextOnly }) => {
  const [isAnimating, setIsAnimating] = useState(false);
  const [currentFrame, setCurrentFrame] = useState(0);

  const animationFrameId = useRef(null);
  const animationState = useRef({
    startTime: 0,
    elapsedTimeAtPause: 0,
  });
  const motionDataRef = useRef(motionData);

  useEffect(() => {
    motionDataRef.current = motionData;
  }, [motionData]);

  // 自动播放仿真
  useEffect(() => {
    if (autoPlay && !isAnimating) {
      setIsAnimating(true);
      if (typeof setAutoPlay === 'function') setAutoPlay(false);
    }
  }, [autoPlay, isAnimating, setAutoPlay]);

  const isMotionDataAvailable = motionDataRef.current.length > 0;

  useEffect(() => {
    let lastUpdateTime = 0;
    const updateInterval = 100; // Update UI every 100ms

    const totalPoints = motionData.length;
    const cycleDuration = 10;
    const pointsPerCycle = 500;
    const totalDuration = (totalPoints / pointsPerCycle) * cycleDuration;

    const animate = () => {
      const now = performance.now();
      const data = motionDataRef.current;
      if (!data || data.length === 0) return;

      const totalElapsedTime = (animationState.current.elapsedTimeAtPause + (now - animationState.current.startTime)) / 1000;
      const progress = (totalElapsedTime % totalDuration) / totalDuration;
      const targetIndex = Math.floor(progress * totalPoints);
      const clampedIndex = Math.min(targetIndex, totalPoints - 1);

      const currentDataPoint = data[clampedIndex];
      if (currentDataPoint && robotRef.current) {
        for (const jointName in currentDataPoint) {
          if (jointName !== 'time') {
            try {
              robotRef.current.setJointAngle(jointName, currentDataPoint[jointName]);
            } catch (error) {
              console.warn(`关节 ${jointName} 不存在或无法设置角度:`, error);
            }
          }
        }
      }

      // Throttle UI updates
      if (now - lastUpdateTime > updateInterval) {
        setCurrentFrame(clampedIndex);
        lastUpdateTime = now;
      }

      // 检查是否到达最后一帧
      if (clampedIndex === totalPoints - 1 && typeof onGroupEnd === 'function') {
        setTimeout(() => {
          setIsAnimating(false); // 停止当前动画
          onGroupEnd(); // 通知父组件切换到下一组
        }, 300); // 稍作延迟，避免UI闪烁
        return; // 不再请求下一帧
      }

      animationFrameId.current = requestAnimationFrame(animate);
    };

    if (isAnimating) {
      animationState.current.startTime = performance.now();
      animationFrameId.current = requestAnimationFrame(animate);
    } else {
      if (animationFrameId.current) {
        cancelAnimationFrame(animationFrameId.current);
      }
    }

    return () => {
      if (animationFrameId.current) {
        cancelAnimationFrame(animationFrameId.current);
      }
    };
  }, [isAnimating, motionData, onGroupEnd]);

  const toggleAnimation = () => {
    if (!isAnimating) {
      setIsAnimating(true);
    } else {
      animationState.current.elapsedTimeAtPause += performance.now() - animationState.current.startTime;
      setIsAnimating(false);
    }
  };

  const resetAllJoints = useCallback(() => {
    setIsAnimating(false);
    animationState.current.elapsedTimeAtPause = 0;
    setCurrentFrame(0);
    
    // 重置所有关节到初始位置
    if (robotRef.current) {
      const data = motionDataRef.current;
      if (data && data.length > 0) {
        const initialDataPoint = data[0];
        for (const jointName in initialDataPoint) {
          if (jointName !== 'time') {
            try {
              robotRef.current.setJointAngle(jointName, initialDataPoint[jointName]);
            } catch (error) {
              console.warn(`重置关节 ${jointName} 失败:`, error);
            }
          }
        }
      }
    }
  }, [robotRef]);

  // 只渲染文本（表格控制栏左侧用）
  if (renderTextOnly) {
    return (
      <span style={{ color: '#888', fontSize: 14 }}>
        帧数: {currentFrame + 1} / {motionData.length} &nbsp;|&nbsp; 组数: {currentGroupIndex + 1} / {totalGroups}
      </span>
    );
  }

  // 只渲染按钮和文本（表格控制栏右侧用）
  if (renderButtonsOnly) {
    return (
      <Space align="center" size={16}>
        <Button
          type="primary"
          icon={isAnimating ? <PauseCircleOutlined /> : <PlayCircleOutlined />}
          onClick={toggleAnimation}
          disabled={!isMotionDataAvailable}
        >
          {isAnimating ? '暂停动画' : '开始动画'}
        </Button>
        <Button icon={<ReloadOutlined />} onClick={resetAllJoints}>
          重置关节
        </Button>
      </Space>
    );
  }

  // 默认完整卡片模式
  return (
    <Card title="机器人控制面板">
      <Space direction="vertical" style={{ width: '100%' }}>
        <Row gutter={16}>
          <Col span={12}>
            <Button
              type="primary"
              icon={isAnimating ? <PauseCircleOutlined /> : <PlayCircleOutlined />}
              onClick={toggleAnimation}
              style={{ width: '100%' }}
              disabled={!isMotionDataAvailable}
            >
              {isAnimating ? '暂停动画' : '开始动画'}
            </Button>
          </Col>
          <Col span={12}>
            <Button icon={<ReloadOutlined />} onClick={resetAllJoints} style={{ width: '100%' }}>
              重置关节
            </Button>
          </Col>
        </Row>
        <div style={{ marginBottom: 16 }}>
          <Text type="secondary">
            运动数据: {isMotionDataAvailable ? `${motionData.length}个数据点` : '未加载'}
          </Text>
          {isMotionDataAvailable && (
            <div style={{ marginTop: 8 }}>
              <Text type="secondary">
                当前帧: {currentFrame + 1} / {motionData.length}
              </Text>
              <br />
              <Text type="secondary">
                当前组: {currentGroupIndex + 1} / {totalGroups}
              </Text>
            </div>
          )}
        </div>
        <div style={{ textAlign: 'center', padding: '20px 0' }}>
          <Text type="secondary">
            关节角度数据已移至上方图表显示
          </Text>
        </div>
      </Space>
    </Card>
  );
};

export default RobotController;