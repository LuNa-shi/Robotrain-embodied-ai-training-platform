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
  Select,
  Space,
} from 'antd';
import {
  ArrowLeftOutlined,
} from '@ant-design/icons';
import ReactECharts from 'echarts-for-react';
import styles from './DatasetVisualization.module.css';
import exampleVideo from '@/assets/videos/example.mp4';
import RobotSimulation from '@/components/RobotSimulation';
import RobotController from '@/components/RobotController';
import { loadMotionDataFromParquet } from '@/utils/parquetLoader';

const { Title } = Typography;
const { Option } = Select;

// The URDF-related constants remain the same
const chartGroups = [
  {
    title: '左侧机械臂关节数据',
    joints: [
      { key: 'vx300s_left/waist', color: '#ff4d4f', label: 'Waist' },
      { key: 'vx300s_left/shoulder', color: '#ff7a45', label: 'Shoulder' },
      { key: 'vx300s_left/elbow', color: '#ffa940', label: 'Elbow' },
      { key: 'vx300s_left/forearm_roll', color: '#52c41a', label: 'Forearm Roll' },
      { key: 'vx300s_left/wrist_angle', color: '#40a9ff', label: 'Wrist Angle' },
      { key: 'vx300s_left/wrist_rotate', color: '#1890ff', label: 'Wrist Rotate' },
      { key: 'vx300s_left/gripper_joint', color: '#722ed1', label: 'Gripper' },
    ],
  },
  {
    title: '右侧机械臂关节数据',
    joints: [
      { key: 'vx300s_right/waist', color: '#ff4d4f', label: 'Waist' },
      { key: 'vx300s_right/shoulder', color: '#ff7a45', label: 'Shoulder' },
      { key: 'vx300s_right/elbow', color: '#ffa940', label: 'Elbow' },
      { key: 'vx300s_right/forearm_roll', color: '#52c41a', label: 'Forearm Roll' },
      { key: 'vx300s_right/wrist_angle', color: '#40a9ff', label: 'Wrist Angle' },
      { key: 'vx300s_right/wrist_rotate', color: '#1890ff', label: 'Wrist Rotate' },
      { key: 'vx300s_right/gripper_joint', color: '#722ed1', label: 'Gripper' },
    ],
  },
];

const jointFieldMap = {
  'vx300s_left/waist': 'vx300s_left/waist',
  'vx300s_left/shoulder': 'vx300s_left/shoulder',
  'vx300s_left/elbow': 'vx300s_left/elbow',
  'vx300s_left/forearm_roll': 'vx300s_left/forearm_roll',
  'vx300s_left/wrist_angle': 'vx300s_left/wrist_angle',
  'vx300s_left/wrist_rotate': 'vx300s_left/wrist_rotate',
  'vx300s_left/gripper_joint': 'vx300s_left/gripper',
  'vx300s_right/waist': 'vx300s_right/waist',
  'vx300s_right/shoulder': 'vx300s_right/shoulder',
  'vx300s_right/elbow': 'vx300s_right/elbow',
  'vx300s_right/forearm_roll': 'vx300s_right/forearm_roll',
  'vx300s_right/wrist_angle': 'vx300s_right/wrist_angle',
  'vx300s_right/wrist_rotate': 'vx300s_right/wrist_rotate',
  'vx300s_right/gripper_joint': 'vx300s_right/gripper',
};

const VALID_JOINT_NAMES = Object.keys(jointFieldMap);


const DatasetVisualizationPage = () => {
    const navigate = useNavigate();
    const [videoUrl] = useState(exampleVideo);
    const [isMotionDataLoaded, setIsMotionDataLoaded] = useState(false);
    
    const [episodeData, setEpisodeData] = useState({});
    const [episodeKeys, setEpisodeKeys] = useState([]);
    const [currentEpisode, setCurrentEpisode] = useState(null);
    
    const [motionData, setMotionData] = useState([]);
    const [jointData, setJointData] = useState([]);
    
    const [checkedLines, setCheckedLines] = useState({});
    const [showMarkLine, setShowMarkLine] = useState(true);
    
    const robotRef = useRef(null);
    const videoRef = useRef(null);
    const chartRefs = useRef([]);
    
    const [isAnimating, setIsAnimating] = useState(false);
    const [currentFrame, setCurrentFrame] = useState(0);
    const animationFrameId = useRef(null);
    const animationState = useRef({ startTime: 0, elapsedTimeAtPause: 0 });
    const motionDataRef = useRef(motionData);
    const urdfUrl = '/bimanual_robot.urdf';

    useEffect(() => {
        motionDataRef.current = motionData;
    }, [motionData]);
    
    // Effect 1: Load all episode data on initial mount
    useEffect(() => {
        const loadData = async () => {
            try {
                const groupedData = await loadMotionDataFromParquet('/data/file-003.parquet');
                if (Object.keys(groupedData).length === 0) {
                    throw new Error("未能从 Parquet 文件中加载或分组数据。");
                }
                const keys = Object.keys(groupedData).map(Number).sort((a, b) => a - b);
                setEpisodeData(groupedData);
                setEpisodeKeys(keys);
                setCurrentEpisode(keys[0]);
                setIsMotionDataLoaded(true);
            } catch (error) {
                console.error("加载运动数据失败:", error);
            }
        };
        loadData();
    }, []);

    // Effect 2: Prepare data when a new episode is selected
    useEffect(() => {
        if (currentEpisode !== null && episodeData[currentEpisode]) {
            const newEpisodeMotionData = episodeData[currentEpisode];
            const remappedData = newEpisodeMotionData.map(row => {
                const newRow = { time: row.time };
                for (const urdfJointName in jointFieldMap) {
                    const dataKey = jointFieldMap[urdfJointName];
                    newRow[urdfJointName] = row[dataKey];
                }
                return newRow;
            });
            const startTime = remappedData[0]?.time || 0;
            const timeNormalizedGroup = remappedData.map(d => ({ ...d, time: d.time - startTime }));
            
            setMotionData(timeNormalizedGroup);
            setJointData(timeNormalizedGroup);
        }
    }, [currentEpisode, episodeData]);

    // Effect 3: Reset state and autoplay when new motionData is set
    useEffect(() => {
        if (motionData.length === 0) return;

        // Reset state for the new episode
        setCurrentFrame(0);
        animationState.current = { startTime: 0, elapsedTimeAtPause: 0 };
        if (robotRef.current) {
            const initialDataPoint = motionData[0];
            VALID_JOINT_NAMES.forEach(jointName => {
                if (initialDataPoint[jointName] !== undefined && robotRef.current.setJointAngle) {
                    robotRef.current.setJointAngle(jointName, initialDataPoint[jointName]);
                }
            });
        }

        // Autoplay the new episode
        setIsAnimating(true);

    }, [motionData]);

    // Effect 4: The Animation Engine.
    useEffect(() => {
        if (isAnimating) {
            animationState.current.startTime = performance.now() - animationState.current.elapsedTimeAtPause;
            
            const animate = () => {
                const data = motionDataRef.current;
                if (data.length === 0) { 
                    setIsAnimating(false); 
                    return; 
                }

                const totalDuration = (data[data.length - 1]?.time || 0) * 1000;
                const elapsedTime = performance.now() - animationState.current.startTime;

                if (elapsedTime >= totalDuration) {
                    setIsAnimating(false);
                    setCurrentFrame(data.length - 1);
                    return;
                }
                
                const progress = elapsedTime / totalDuration;
                const targetIndex = Math.floor(progress * data.length);
                const clampedIndex = Math.min(targetIndex, data.length - 1);
                setCurrentFrame(clampedIndex);
                
                const currentDataPoint = data[clampedIndex];
                if (currentDataPoint) {
                    VALID_JOINT_NAMES.forEach(jointName => {
                        if (currentDataPoint[jointName] !== undefined && robotRef.current.setJointAngle) {
                            robotRef.current.setJointAngle(jointName, currentDataPoint[jointName]);
                        }
                    });
                }

                animationFrameId.current = requestAnimationFrame(animate);
            };

            animationFrameId.current = requestAnimationFrame(animate);
        } else {
            if (animationFrameId.current) {
                cancelAnimationFrame(animationFrameId.current);
                animationState.current.elapsedTimeAtPause = performance.now() - animationState.current.startTime;
            }
        }

        return () => {
            if (animationFrameId.current) {
                cancelAnimationFrame(animationFrameId.current);
            }
        };
    }, [isAnimating]);

    const handleToggleAnimation = () => {
        if (!isAnimating && currentFrame === motionData.length - 1) {
            handleResetAnimation();
        } else {
            setIsAnimating(prev => !prev);
        }
    };
    
    const handleResetAnimation = () => {
        if (currentEpisode !== null && episodeData[currentEpisode]) {
            setMotionData([...episodeData[currentEpisode]]);
        }
    };

    const handleNextEpisode = () => {
        const currentIndex = episodeKeys.indexOf(currentEpisode);
        if (currentIndex < episodeKeys.length - 1) {
            setCurrentEpisode(episodeKeys[currentIndex + 1]);
        } else {
            setCurrentEpisode(episodeKeys[0]);
        }
    };
    
    const handleLineCheck = (groupIdx, lineKey, checked) => {
        setCheckedLines(prev => ({ ...prev, [groupIdx]: { ...prev[groupIdx], [lineKey]: checked } }));
    };

    const getChartOption = (group, groupIdx) => {
        const series = [];
        const legendData = [];
        const currentGroupChecks = checkedLines[groupIdx] || {};
        let markLineAdded = false;
        const maxTime = jointData.length > 0 ? jointData[jointData.length - 1]?.time : 10;
    
        group.joints.forEach(joint => {
            const dataKey = joint.key;
            if (!dataKey || !currentGroupChecks[joint.key]) return;
            
            series.push({
                name: joint.label,
                type: 'line',
                data: jointData.map(item => [item.time, item[dataKey]]),
                lineStyle: { color: joint.color, width: 2 },
                color: joint.color,
                symbol: 'none',
                markLine: showMarkLine && !markLineAdded && jointData[currentFrame] ? {
                    symbol: 'none',
                    data: [{ xAxis: jointData[currentFrame].time, lineStyle: { color: '#bfbfbf', width: 1, type: 'dashed' }, label: { show: false } }],
                    animation: false,
                } : undefined,
            });
            if (!markLineAdded) markLineAdded = true;
            legendData.push(joint.label);
        });
    
        return {
            grid: { left: 60, right: 30, top: 50, bottom: 50 },
            tooltip: { trigger: 'axis' },
            legend: { data: legendData, type: 'scroll', top: 5 },
            xAxis: { type: 'value', name: 'Time (s)', min: 0, max: Math.ceil(maxTime) },
            yAxis: { type: 'value', name: 'Angle (rad)' },
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

    if (!isMotionDataLoaded) {
        return (
            <div className={styles.visualizationPage}>
                <div className={styles.contentWrapper} style={{ textAlign: 'center', paddingTop: '100px' }}>
                    <Spin size="large" />
                    <div style={{ marginTop: '20px', fontSize: '16px' }}>正在加载和解析 Parquet 数据...</div>
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
                        <video ref={videoRef} src={videoUrl} controls className={styles.videoPlayer}>
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
                                        style={{ width: '100%', padding: '16px 24px', border: 'none', borderRadius: '12px', background: 'rgba(255, 255, 255, 0.8)', boxShadow: 'none' }}
                                        styles={{ body: { padding: 0, background: 'transparent' } }} // [FIXED] Used `styles.body` instead of `bodyStyle`
                                    >
                                        <div style={{ textAlign: 'center', marginBottom: 12, fontWeight: 600, fontSize: 18 }}>{group.title}</div>
                                        <div style={{ marginBottom: 8 }}>
                                            <Button
                                                type="link"
                                                style={{ padding: 0, marginBottom: 8 }}
                                                onClick={() => {
                                                    const newGroupChecks = { ...currentGroupChecks };
                                                    group.joints.forEach(joint => { newGroupChecks[joint.key] = !isAllChecked; });
                                                    setCheckedLines(prev => ({ ...prev, [idx]: newGroupChecks }));
                                                }}
                                            >
                                                {isAllChecked ? '全部取消' : '全部选择'}
                                            </Button>
                                            <Row gutter={[16, 8]}>
                                                {group.joints.map(joint => (
                                                    <Col xs={12} sm={8} key={joint.key}>
                                                        <Checkbox checked={!!currentGroupChecks[joint.key]} onChange={e => handleLineCheck(idx, joint.key, e.target.checked)} style={{ color: joint.color }}>
                                                            {joint.label}
                                                        </Checkbox>
                                                    </Col>
                                                ))}
                                            </Row>
                                        </div>
                                        <div style={{ background: '#fff', borderRadius: 8, padding: '8px 0' }}>
                                            <ReactECharts ref={el => (chartRefs.current[idx] = el)} option={getChartOption(group, idx)} style={{ height: 340 }} notMerge={true} lazyUpdate={true} />
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
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid #e6e6e6', padding: '12px 24px', background: '#f7faff' }}>
                            <RobotController
                                renderTextOnly
                                isAnimating={isAnimating}
                                currentFrame={currentFrame}
                                motionDataLength={motionData.length}
                                currentEpisode={currentEpisode}
                            />
                            <Space align="center" size="large">
                                <Space>
                                    <label style={{fontWeight: 500}}>选择 Episode:</label>
                                    <Select
                                        value={currentEpisode}
                                        onChange={(value) => setCurrentEpisode(value)}
                                        style={{ width: 120 }}
                                        loading={!isMotionDataLoaded}
                                    >
                                        {episodeKeys.map(key => (
                                            <Option key={key} value={key}>{key}</Option>
                                        ))}
                                    </Select>
                                </Space>
                                <RobotController
                                    renderButtonsOnly
                                    isAnimating={isAnimating}
                                    onToggleAnimation={handleToggleAnimation}
                                    onReset={handleResetAnimation}
                                    onNextEpisode={handleNextEpisode}
                                    motionDataLength={motionData.length}
                                />
                            </Space>
                        </div>
                        <div style={{ background: '#eaf2fb', minHeight: 500, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <div style={{ width: '100%', height: 600 }}>
                                <RobotSimulation ref={robotRef} urdfUrl={urdfUrl} />
                            </div>
                        </div>
                    </Card>
                </div>
            </div>
        </div>
    );
};

export default DatasetVisualizationPage;
