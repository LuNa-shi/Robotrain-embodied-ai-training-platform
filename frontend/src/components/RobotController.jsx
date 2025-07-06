import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Slider, Button, Card, Row, Col, Typography, Space } from 'antd';
import { PlayCircleOutlined, PauseCircleOutlined, ReloadOutlined } from '@ant-design/icons';

const { Text } = Typography;

const RobotController = ({ robotRef, motionData = [] }) => {
  const [jointAngles, setJointAngles] = useState({});
  const [jointNames, setJointNames] = useState([]);
  const [isAnimating, setIsAnimating] = useState(false);
  const [currentFrame, setCurrentFrame] = useState(0);

  const animationFrameId = useRef(null);
  const animationState = useRef({
    startTime: 0,
    elapsedTimeAtPause: 0,
  });
  const motionDataRef = useRef(motionData);
  const prevAnglesRef = useRef({});
  const prevFrameRef = useRef(0);

  useEffect(() => {
    motionDataRef.current = motionData;
  }, [motionData]);

  useEffect(() => {
    const initializeJoints = () => {
      if (robotRef.current?.getJoints) {
        const joints = robotRef.current.getJoints();
        if (joints) {
          const names = Object.keys(joints).filter(name => {
            const joint = joints[name];
            return joint && joint.jointType && joint.jointType !== 'fixed';
          });
          const initialAngles = {};
          names.forEach(name => {
            const joint = joints[name];
            initialAngles[name] = joint.angle || 0;
          });
          setJointNames(names);
          setJointAngles(initialAngles);
        }
      }
    };
    const timeoutId = setTimeout(initializeJoints, 0);
    return () => clearTimeout(timeoutId);
  }, []);

  const isMotionDataAvailable = motionDataRef.current.length > 0;

  const handleJointAngleChange = useCallback((jointName, value) => {
    if (isAnimating) return;
    setJointAngles(prev => ({ ...prev, [jointName]: value }));
    try {
      robotRef.current?.setJointAngle(jointName, value);
    } catch (error) {
      console.warn(`设置关节 ${jointName} 角度失败:`, error);
    }
  }, [robotRef, isAnimating]);

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
        if (currentDataPoint) {
          const newAngles = {};
          for (const jointName in currentDataPoint) {
            if (jointName !== 'time') {
              newAngles[jointName] = currentDataPoint[jointName];
            }
          }
          setJointAngles(newAngles);
        }
        setCurrentFrame(clampedIndex);
        lastUpdateTime = now;
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
  }, [isAnimating, motionData]);

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
    const resetAngles = {};
    jointNames.forEach(name => {
      resetAngles[name] = 0;
      try {
        robotRef.current?.setJointAngle(name, 0);
      } catch (error) {
        console.warn(`重置关节 ${name} 失败:`, error);
      }
    });
    setJointAngles(resetAngles);
  }, [jointNames, robotRef]);

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
            </div>
          )}
        </div>
        {jointNames.map((jointName) => (
          <div key={jointName}>
            <Text strong>{jointName}</Text>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Slider
                min={-Math.PI}
                max={Math.PI}
                step={0.01}
                value={jointAngles[jointName] || 0}
                onChange={(value) => handleJointAngleChange(jointName, value)}
                style={{ flex: 1 }}
                disabled={isAnimating}
              />
              <Text style={{ minWidth: 60, textAlign: 'right' }}>
                {((jointAngles[jointName] || 0) * 180 / Math.PI).toFixed(1)}°
              </Text>
            </div>
          </div>
        ))}
      </Space>
    </Card>
  );
};

export default RobotController;