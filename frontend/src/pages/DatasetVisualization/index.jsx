import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Typography,
  Card,
  Button,
  Spin,
  Row,
  Col,
  Checkbox,
} from 'antd';
import {
  ArrowLeftOutlined,
} from '@ant-design/icons';
import ReactECharts from 'echarts-for-react';
import styles from './DatasetVisualization.module.css';
import exampleVideo from '@/assets/videos/example.mp4';
import RobotSimulation from '@/components/RobotSimulation';
import RobotController from '@/components/RobotController';
import { loadMotionDataFromJson } from '@/utils/motionDataLoader';

const { Title } = Typography;

// --- Chart and Data Mapping Configuration ---
const chartGroups = [
  {
    title: '左侧关节数据',
    joints: [
      { key: 'left_waist', color: '#ff4d4f', label: 'Waist' },
      { key: 'left_shoulder', color: '#ff7a45', label: 'Shoulder' },
      { key: 'left_elbow', color: '#ffa940', label: 'Elbow' },
      { key: 'left_forearm_roll', color: '#52c41a', label: 'Forearm Roll' },
      { key: 'left_wrist_angle', color: '#40a9ff', label: 'Wrist Angle' },
      { key: 'left_wrist_rotate', color: '#1890ff', label: 'Wrist Rotate' },
    ],
  },
  {
    title: '右侧关节数据',
    joints: [
      { key: 'right_waist', color: '#ff4d4f', label: 'Waist' },
      { key: 'right_shoulder', color: '#ff7a45', label: 'Shoulder' },
      { key: 'right_elbow', color: '#ffa940', label: 'Elbow' },
      { key: 'right_forearm_roll', color: '#52c41a', label: 'Forearm Roll' },
      { key: 'right_wrist_angle', color: '#40a9ff', label: 'Wrist Angle' },
      { key: 'right_wrist_rotate', color: '#1890ff', label: 'Wrist Rotate' },
    ],
  },
];

const jointFieldMap = {
  // Left Arm
  left_waist: 'vx300s_left/waist',
  left_shoulder: 'vx300s_left/shoulder',
  left_elbow: 'vx300s_left/elbow',
  left_forearm_roll: 'vx300s_left/forearm_roll',
  left_wrist_angle: 'vx300s_left/wrist_angle',
  left_wrist_rotate: 'vx300s_left/wrist_rotate',
  // Right Arm
  right_waist: 'vx300s_right/waist',
  right_shoulder: 'vx300s_right/shoulder',
  right_elbow: 'vx300s_right/elbow',
  right_forearm_roll: 'vx300s_right/forearm_roll',
  right_wrist_angle: 'vx300s_right/wrist_angle',
  right_wrist_rotate: 'vx300s_right/wrist_rotate',
};


const DatasetVisualizationPage = () => {
  const navigate = useNavigate();
  // Page state
  const [videoUrl] = useState(exampleVideo);
  const [jointData, setJointData] = useState([]);
  const [motionData, setMotionData] = useState([]);
  const [allGroups, setAllGroups] = useState([]);
  const [currentGroupIndex, setCurrentGroupIndex] = useState(0);
  const [isMotionDataLoaded, setIsMotionDataLoaded] = useState(false);
  const [autoPlaySimulation, setAutoPlaySimulation] = useState(false);

  // Chart-related state
  const [currentTime, setCurrentTime] = useState(0);
  const [checkedLines, setCheckedLines] = useState({});
  const [showMarkLine, setShowMarkLine] = useState(true);
  
  // Refs
  const robotRef = useRef(null);
  const videoRef = useRef(null);
  const chartRefs = useRef([]);
  
  // Animation Logic Centralization
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
  
  const urdfUrl = '/bimanual_robot.urdf';

  const splitDataByTimeZero = (data) => {
    const groups = [];
    let current = [];
    for (let i = 0; i < data.length; i++) {
      if (data[i].time === 0.0 && current.length > 0) {
        groups.push(current);
        current = [];
      }
      current.push(data[i]);
    }
    if (current.length > 0) groups.push(current);
    return groups;
  };

  useEffect(() => {
    const loadData = async () => {
      try {
        const data = await loadMotionDataFromJson('/data/motion_data3.json');
        const groups = splitDataByTimeZero(data);
        setAllGroups(groups);
        const firstGroup = groups[0] || [];
        setMotionData(firstGroup);
        setJointData(firstGroup);
        setIsMotionDataLoaded(true);
        setAutoPlaySimulation(true);
      } catch (error) {
        console.error("Failed to load motion data:", error);
      }
    };
    loadData();
  }, []);

  const handleGroupEnd = useCallback(() => {
    if (allGroups.length > 0) {
      const nextIndex = (currentGroupIndex + 1) % allGroups.length;
      setCurrentGroupIndex(nextIndex);
    }
  }, [currentGroupIndex, allGroups.length]);

  useEffect(() => {
    if (allGroups.length > 0 && currentGroupIndex < allGroups.length) {
      const newGroup = allGroups[currentGroupIndex];
      setMotionData(newGroup);
      setJointData(newGroup);
      setIsAnimating(false);
      setCurrentFrame(0);
      animationState.current = { startTime: 0, elapsedTimeAtPause: 0 };
      setAutoPlaySimulation(true);
    }
  }, [currentGroupIndex, allGroups]);

  useEffect(() => {
    if (autoPlaySimulation && !isAnimating) {
      setIsAnimating(true);
      setAutoPlaySimulation(false);
    }
  }, [autoPlaySimulation, isAnimating]);

  useEffect(() => {
    const animate = () => {
      const data = motionDataRef.current;
      if (!data || data.length === 0 || !robotRef.current) {
        setIsAnimating(false);
        return;
      }
      const totalPoints = data.length;
      const totalDuration = (data[totalPoints - 1]?.time || 10) * 1000;
      const now = performance.now();
      let totalElapsedTime = animationState.current.elapsedTimeAtPause + (now - animationState.current.startTime);
      if (totalElapsedTime >= totalDuration) {
        handleGroupEnd();
        return;
      }
      const progress = totalElapsedTime / totalDuration;
      const targetIndex = Math.floor(progress * totalPoints);
      const clampedIndex = Math.min(targetIndex, totalPoints - 1);
      setCurrentFrame(clampedIndex);
      const currentDataPoint = data[clampedIndex];
      if (currentDataPoint) {
        for (const jointName in currentDataPoint) {
          if (jointName !== 'time' && robotRef.current.setJointAngle) {
            robotRef.current.setJointAngle(jointName, currentDataPoint[jointName]);
          }
        }
      }
      animationFrameId.current = requestAnimationFrame(animate);
    };
    if (isAnimating) {
      animationState.current.startTime = performance.now();
      animationFrameId.current = requestAnimationFrame(animate);
    } else {
      if (animationFrameId.current) {
        cancelAnimationFrame(animationFrameId.current);
        animationState.current.elapsedTimeAtPause += performance.now() - animationState.current.startTime;
      }
    }
    return () => {
      if (animationFrameId.current) {
        cancelAnimationFrame(animationFrameId.current);
      }
    };
  }, [isAnimating, handleGroupEnd]);

  const handleToggleAnimation = () => {
    setIsAnimating(prev => !prev);
  };

  const handleResetAnimation = () => {
    setIsAnimating(false);
    setCurrentFrame(0);
    animationState.current = { startTime: 0, elapsedTimeAtPause: 0 };
    if (robotRef.current && motionData.length > 0) {
      const initialDataPoint = motionData[0];
      for (const jointName in initialDataPoint) {
        if (jointName !== 'time' && robotRef.current.setJointAngle) {
          robotRef.current.setJointAngle(jointName, initialDataPoint[jointName]);
        }
      }
    }
  };

  const handleLineCheck = (groupIdx, lineKey, checked) => {
    setCheckedLines(prev => ({
      ...prev,
      [groupIdx]: { ...prev[groupIdx], [lineKey]: checked },
    }));
  };

  const getChartOption = (group, groupIdx) => {
    const series = [];
    const legendData = [];
    const currentGroupChecks = checkedLines[groupIdx] || {};
    let markLineAdded = false;
    
    group.joints.forEach(joint => {
      const dataKey = jointFieldMap[joint.key];
      if (!dataKey) return;

      if (currentGroupChecks[joint.key]) {
        series.push({
          name: joint.label,
          type: 'line',
          data: jointData.map(item => [item.time, item[dataKey]]),
          lineStyle: { color: joint.color, width: 2 },
          color: joint.color,
          symbol: 'none',
          markLine: showMarkLine && !markLineAdded ? {
            symbol: 'none',
            data: [{ xAxis: jointData[currentFrame]?.time || 0, lineStyle: { color: '#bfbfbf', width: 1, type: 'dashed' }, label: { show: false } }],
            animation: false,
          } : undefined,
        });
        if (!markLineAdded) markLineAdded = true;
        legendData.push(joint.label);
      }
    });

    return {
      grid: { left: 60, right: 30, top: 50, bottom: 50 },
      tooltip: { trigger: 'axis', axisPointer: { type: 'line' }, formatter: params => {
        if (!params || !params.length) return '';
        let html = `<div style='font-weight:600;margin-bottom:4px;'>Time: ${params[0].value[0].toFixed(3)}s</div>`;
        params.forEach(param => {
          html += `<div><span style='display:inline-block;margin-right:6px;border-radius:50%;width:10px;height:10px;background:${param.color}'></span>${param.seriesName}: <b>${param.value[1].toFixed(4)}</b></div>`;
        });
        return html;
      }},
      legend: { data: legendData, type: 'scroll', top: 5, textStyle: { color: '#333' } },
      xAxis: { 
        type: 'value', 
        name: 'Time (s)', 
        min: 0, 
        max: 10, 
        splitLine: { show: true, lineStyle: { color: '#f0f0f0' } },
        nameLocation: 'center',
        nameGap: 30,
      },
      yAxis: { type: 'value', name: 'Angle (rad)', splitLine: { show: true, lineStyle: { color: '#f0f0f0' } } },
      series,
    };
  };

  useEffect(() => {
    const defaultChecked = {};
    chartGroups.forEach((group, idx) => {
      defaultChecked[idx] = {};
      group.joints.forEach(joint => {
        defaultChecked[idx][joint.key] = true;
      });
    });
    setCheckedLines(defaultChecked);
  }, []);

  const handleBack = () => navigate('/data-center');
  const handleTimeUpdate = (e) => setCurrentTime(e.target.currentTime);
  const handlePause = () => setShowMarkLine(false);
  const handlePlay = () => setShowMarkLine(true);

  if (!isMotionDataLoaded) {
    return (
      <div className={styles.visualizationPage}>
        <div className={styles.contentWrapper}>
          <div className={styles.pageHeader}>
            <Button icon={<ArrowLeftOutlined />} onClick={handleBack} className={styles.backButton}>返回</Button>
          </div>
          <div className={styles.loadingContainer} style={{ textAlign: 'center', padding: '50px 0' }}>
            <Spin size="large" />
            <div style={{ marginTop: '16px' }}>正在加载运动数据...</div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.visualizationPage}>
      <div className={styles.contentWrapper}>
        <div className={styles.pageHeader}>
          <Button icon={<ArrowLeftOutlined />} onClick={handleBack} className={styles.backButton}>返回</Button>
        </div>

        <div className={styles.videoSection}>
          <div className={styles.videoTitle}><Title level={3}>机器人动作视频</Title></div>
          <div className={styles.videoContainer}>
            <video ref={videoRef} src={videoUrl} controls className={styles.videoPlayer} onTimeUpdate={handleTimeUpdate} onPause={handlePause} onPlay={handlePlay}>
              您的浏览器不支持视频播放。
            </video>
          </div>
        </div>

        <div style={{ marginTop: 32 }}>
          <Row gutter={[32, 32]} justify="center">
            {chartGroups.map((group, idx) => {
              const currentGroupChecks = checkedLines[idx] || {};
              const isAllChecked = group.joints.every(joint => currentGroupChecks[joint.key]);

              return (
                <Col xs={24} lg={12} key={group.title} style={{ display: 'flex' }}>
                  <Card
                    style={{
                      width: '100%',
                      padding: '16px 24px',
                      border: 'none',
                      borderRadius: '12px',
                      background: 'transparent',
                      boxShadow: 'none',
                    }}
                  >
                    <div style={{ textAlign: 'center', marginBottom: 12, fontWeight: 600, fontSize: 18 }}>{group.title}</div>
                    <div style={{ marginBottom: 8 }}>
                      <Button
                        type="link"
                        style={{ padding: 0, marginBottom: 8 }}
                        onClick={() => {
                          const newGroupChecks = { ...currentGroupChecks };
                          group.joints.forEach(joint => {
                            newGroupChecks[joint.key] = !isAllChecked;
                          });
                          setCheckedLines(prev => ({ ...prev, [idx]: newGroupChecks }));
                        }}
                      >
                        {isAllChecked ? '全部取消' : '全部选择'}
                      </Button>
                      <Row gutter={[16, 8]}>
                        {group.joints.map(joint => (
                          <Col xs={12} sm={8} key={joint.key}>
                            <Checkbox
                              checked={!!currentGroupChecks[joint.key]}
                              onChange={e => handleLineCheck(idx, joint.key, e.target.checked)}
                              style={{ color: joint.color }}
                            >
                              {joint.label}
                            </Checkbox>
                          </Col>
                        ))}
                      </Row>
                    </div>
                    <div style={{ background: '#fff', borderRadius: 8, padding: '8px 0' }}>
                      <ReactECharts
                        ref={el => (chartRefs.current[idx] = el)}
                        option={getChartOption(group, idx)}
                        style={{ height: 340 }}
                        notMerge={true}
                        lazyUpdate={true}
                      />
                    </div>
                  </Card>
                </Col>
              );
            })}
          </Row>
        </div>

        <div style={{ marginTop: 32 }}>
          <div style={{ textAlign: 'center', marginBottom: '16px' }}>
            <Title level={3} style={{ color: '#333', fontWeight: 600 }}>仿真动画演示</Title>
          </div>
          <Card style={{ padding: 0 }} styles={{ body: { padding: 0 } }}>
            <div style={{ display: 'flex', alignItems: 'center', borderBottom: '1px solid #e6e6e6', padding: '16px 24px', background: '#f7faff' }}>
              <div style={{ flex: 1 }}>
                <RobotController
                  renderTextOnly
                  isAnimating={isAnimating}
                  currentFrame={currentFrame}
                  motionDataLength={motionData.length}
                  currentGroupIndex={currentGroupIndex}
                  totalGroups={allGroups.length}
                />
              </div>
              <div>
                <RobotController
                  renderButtonsOnly
                  isAnimating={isAnimating}
                  onToggleAnimation={handleToggleAnimation}
                  onReset={handleResetAnimation}
                  motionDataLength={motionData.length}
                />
              </div>
            </div>
            <div style={{ background: '#eaf2fb', minHeight: 500, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <div style={{ width: '100%', height: 600 }}>
                <RobotSimulation
                  ref={robotRef}
                  urdfUrl={urdfUrl}
                />
              </div>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default DatasetVisualizationPage;
