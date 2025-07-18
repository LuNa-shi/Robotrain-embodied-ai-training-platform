import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Typography,
  Card,
  Button,
  Spin,
  Row,
  Col,
  Checkbox,
  Select,
} from 'antd';
import {
  ArrowLeftOutlined,
} from '@ant-design/icons';
import ReactECharts from 'echarts-for-react';
import styles from './DatasetVisualization.module.css';
import exampleVideo from '@/assets/videos/example.mp4';
import RobotSimulation from '@/components/RobotSimulation';
import { loadMotionDataFromParquet, loadMotionDataFromApiParquet } from '@/utils/parquetLoader';
import { datasetsAPI } from '@/utils/api';

const { Title } = Typography;

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
    const { datasetId } = useParams();
    const [videoUrl, setVideoUrl] = useState(exampleVideo);
    const [isMotionDataLoaded, setIsMotionDataLoaded] = useState(false);
    
    const [episodeData, setEpisodeData] = useState({});
    const [episodeKeys, setEpisodeKeys] = useState([]);
    const [currentEpisode, setCurrentEpisode] = useState(null);
    
    const [motionData, setMotionData] = useState([]);
    const [jointData, setJointData] = useState([]);
    
    const [checkedLines, setCheckedLines] = useState({});
    const [showMarkLine, setShowMarkLine] = useState(true);
    
    const robotRef = useRef(null);
    const chartRefs = useRef([]);
    
    const [currentFrame, setCurrentFrame] = useState(0);
    const animationFrameId = useRef(null);
    const motionDataRef = useRef(motionData);
    const urdfUrl = '/bimanual_robot.urdf';
    
    // 统一播放控制状态
    const [isGlobalPlaying, setIsGlobalPlaying] = useState(false);
    const videoRef = useRef(null);

    // 新增参数选择相关状态
    const [datasetDetail, setDatasetDetail] = useState(null);
    const [chunkId, setChunkId] = useState(0);
    const [episodeId, setEpisodeId] = useState(0);
    const [viewPoint, setViewPoint] = useState('');
    const [loading, setLoading] = useState(false);
    const [loadError, setLoadError] = useState('');
    const [isAlohaDataset, setIsAlohaDataset] = useState(false);

    useEffect(() => {
        motionDataRef.current = motionData;
    }, [motionData]);
    
    // 获取数据集详情并请求默认参数数据
    useEffect(() => {
        const fetchDefault = async () => {
            setLoading(true);
            setLoadError('');
            try {
                const detail = await datasetsAPI.getById(datasetId);
                setDatasetDetail(detail);
                setIsAlohaDataset(detail.is_aloha || false);
                
                if (!detail || !detail.video_keys || detail.video_keys.length === 0) {
                    setLoadError('该数据集无可用视角点');
                    setLoading(false);
                    return;
                }
                
                const defaultChunk = 0;
                const defaultEpisode = 0;
                const defaultView = detail.video_keys[0];
                setChunkId(defaultChunk);
                setEpisodeId(defaultEpisode);
                setViewPoint(defaultView);
                
                // 请求视频
                const videoBlob = await datasetsAPI.getVideo(datasetId, defaultChunk, defaultEpisode, defaultView);
                setVideoUrl(URL.createObjectURL(videoBlob));
                
                // 只有Aloha数据集才请求parquet数据和显示图表仿真
                if (detail.is_aloha) {
                    const parquetData = await datasetsAPI.getParquet(datasetId, defaultChunk, defaultEpisode);
                    const groupedData = await loadMotionDataFromApiParquet(parquetData);
                    if (Object.keys(groupedData).length > 0) {
                        const keys = Object.keys(groupedData).map(Number).sort((a, b) => a - b);
                        setEpisodeData(groupedData);
                        setEpisodeKeys(keys);
                        setCurrentEpisode(keys[0]);
                        setIsMotionDataLoaded(true);
                    } else {
                        setLoadError('未能获取到可用的数据');
                    }
                } else {
                    // 非Aloha数据集只显示视频，不需要加载motion data
                    setIsMotionDataLoaded(true);
                }
            } catch (err) {
                console.error('获取默认数据失败:', err);
                if (err.message && err.message.includes('CORS')) {
                    setLoadError('跨域请求失败，请检查后端CORS配置');
                } else if (err.response && err.response.status === 500) {
                    setLoadError('后端服务器错误，请检查后端日志');
                } else {
                    setLoadError('获取默认数据失败: ' + (err.message || '未知错误'));
                }
            } finally {
                setLoading(false);
            }
        };
        if (datasetId) fetchDefault();
    }, [datasetId]);

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

    // Effect 3: Reset state when new motionData is set
    useEffect(() => {
        if (motionData.length === 0) return;

        // Reset state for the new episode
        setCurrentFrame(0);
        if (robotRef.current) {
            const initialDataPoint = motionData[0];
            VALID_JOINT_NAMES.forEach(jointName => {
                if (initialDataPoint[jointName] !== undefined && robotRef.current.setJointAngle) {
                    robotRef.current.setJointAngle(jointName, initialDataPoint[jointName]);
                }
            });
        }

    }, [motionData]);

    // Effect 4: 基于视频播放时间的动画引擎
    useEffect(() => {
        if (videoRef.current && isGlobalPlaying) {
            const video = videoRef.current;
            
            const updateAnimationFromVideo = () => {
                if (!video.paused && motionData.length > 0) {
                    const videoTime = video.currentTime;
                    const totalDuration = motionData[motionData.length - 1]?.time || 0;
                    
                    if (videoTime >= totalDuration) {
                        // 视频播放完毕
                        setCurrentFrame(motionData.length - 1);
                        return;
                    }
                    
                    // 根据视频时间计算对应的数据帧
                    const progress = videoTime / totalDuration;
                    const targetIndex = Math.floor(progress * motionData.length);
                    const clampedIndex = Math.min(targetIndex, motionData.length - 1);
                    setCurrentFrame(clampedIndex);
                    
                    // 更新机器人关节角度
                    const currentDataPoint = motionData[clampedIndex];
                    if (currentDataPoint) {
                        VALID_JOINT_NAMES.forEach(jointName => {
                            if (currentDataPoint[jointName] !== undefined && robotRef.current.setJointAngle) {
                                robotRef.current.setJointAngle(jointName, currentDataPoint[jointName]);
                            }
                        });
                    }
                }
                
                // 继续监听视频时间更新
                if (!video.paused) {
                    animationFrameId.current = requestAnimationFrame(updateAnimationFromVideo);
                }
            };
            
            // 开始动画循环
            animationFrameId.current = requestAnimationFrame(updateAnimationFromVideo);
        } else {
            // 停止动画
            if (animationFrameId.current) {
                cancelAnimationFrame(animationFrameId.current);
            }
        }

        return () => {
            if (animationFrameId.current) {
                cancelAnimationFrame(animationFrameId.current);
            }
        };
    }, [isGlobalPlaying, motionData]);
    
    // 强制图表重新渲染以更新标记线
    useEffect(() => {
        if (chartRefs.current.length > 0) {
            chartRefs.current.forEach(chartRef => {
                if (chartRef && chartRef.getEchartsInstance) {
                    chartRef.getEchartsInstance().resize();
                }
            });
        }
    }, [currentFrame, isGlobalPlaying]);
    
    // 视频控制整个页面的播放状态
    useEffect(() => {
        if (videoRef.current) {
            const video = videoRef.current;
            
            const handleVideoPlay = () => {
                handleVideoControl(true);
            };
            
            const handleVideoPause = () => {
                handleVideoControl(false);
            };
            
            const handleVideoEnded = () => {
                handleVideoControl(false);
            };
            
            video.addEventListener('play', handleVideoPlay);
            video.addEventListener('pause', handleVideoPause);
            video.addEventListener('ended', handleVideoEnded);
            
            return () => {
                video.removeEventListener('play', handleVideoPlay);
                video.removeEventListener('pause', handleVideoPause);
                video.removeEventListener('ended', handleVideoEnded);
            };
        }
    }, [videoRef.current]);

    // 视频控制整个页面的播放状态
    const handleVideoControl = (isPlaying) => {
        setIsGlobalPlaying(isPlaying);
        
        // 动画现在完全基于视频时间，不需要单独控制
        // 如果视频重新开始播放，重置到开始位置
        if (isPlaying && videoRef.current) {
            const video = videoRef.current;
            if (video.currentTime >= video.duration - 0.1) {
                // 如果视频已经播放完毕，重新开始
                video.currentTime = 0;
                setCurrentFrame(0);
            }
        }
    };
    

    
    const handleResetAnimation = () => {
        if (videoRef.current) {
            videoRef.current.currentTime = 0;
            setCurrentFrame(0);
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
                markLine: showMarkLine && !markLineAdded && jointData[currentFrame] && isGlobalPlaying ? {
                    symbol: 'none',
                    data: [{ xAxis: jointData[currentFrame].time, lineStyle: { color: '#bfbfbf', width: 1, type: 'dashed' }, label: { show: false } }],
                    animation: false,
                } : undefined,
            });
            if (!markLineAdded) markLineAdded = true;
            legendData.push(joint.label);
        });
    
        return {
            grid: { left: 60, right: 30, top: 50, bottom: 60 },
            tooltip: { trigger: 'axis' },
            legend: { data: legendData, type: 'scroll', top: 5 },
            xAxis: { 
                type: 'value', 
                name: 'Time (s)', 
                nameLocation: 'center',
                nameGap: 35,
                min: 0, 
                max: Math.ceil(maxTime) 
            },
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

    // 组件卸载时清理资源
    useEffect(() => {
        return () => {
            // 停止视频播放
            if (videoRef.current) {
                videoRef.current.pause();
            }
            // 停止动画循环
            if (animationFrameId.current) {
                cancelAnimationFrame(animationFrameId.current);
            }
        };
    }, []);

    const handleBack = () => {
        // 停止视频播放和动画
        if (videoRef.current) {
            videoRef.current.pause();
        }
        if (animationFrameId.current) {
            cancelAnimationFrame(animationFrameId.current);
        }
        setIsGlobalPlaying(false);
        
        // 导航到数据中心
        navigate('/data-center');
    };

    // 用户切换参数时重新获取
    const handleParamChange = async (newChunk, newEpisode, newView) => {
      setLoading(true);
      setLoadError('');
      try {
        setChunkId(newChunk);
        setEpisodeId(newEpisode);
        setViewPoint(newView);
        const videoBlob = await datasetsAPI.getVideo(datasetId, newChunk, newEpisode, newView);
        setVideoUrl(URL.createObjectURL(videoBlob));
        
        // 只有Aloha数据集才请求parquet数据
        if (isAlohaDataset) {
          const parquetData = await datasetsAPI.getParquet(datasetId, newChunk, newEpisode);
          const groupedData = await loadMotionDataFromApiParquet(parquetData);
          if (Object.keys(groupedData).length > 0) {
            const keys = Object.keys(groupedData).map(Number).sort((a, b) => a - b);
            setEpisodeData(groupedData);
            setEpisodeKeys(keys);
            setCurrentEpisode(keys[0]);
            setIsMotionDataLoaded(true);
          } else {
            setLoadError('未能获取到可用的数据');
          }
        } else {
          // 非Aloha数据集不需要加载motion data
          setIsMotionDataLoaded(true);
        }
      } catch (err) {
        console.error('获取数据失败:', err);
        if (err.message && err.message.includes('CORS')) {
          setLoadError('跨域请求失败，请检查后端CORS配置');
        } else if (err.response && err.response.status === 500) {
          setLoadError('后端服务器错误，请检查后端日志');
        } else {
          setLoadError('获取数据失败: ' + (err.message || '未知错误'));
        }
      } finally {
        setLoading(false);
      }
    };

    // 如果有错误，优先显示错误信息
    if (loadError) {
        return (
            <div className={styles.visualizationPage}>
                <div className={styles.contentWrapper} style={{ textAlign: 'center', paddingTop: '100px' }}>
                    <div className={styles.errorContainer}>
                        <span className={styles.errorIcon}>⚠️</span>
                        <div className={styles.errorText}>{loadError}</div>
                    </div>
                </div>
            </div>
        );
    }

    // 如果数据未加载完成，显示加载状态
    if (!isMotionDataLoaded) {
        return (
            <div className={styles.visualizationPage}>
                <div className={styles.contentWrapper} style={{ textAlign: 'center', paddingTop: '100px' }}>
                    <Spin size="large" />
                    <div style={{ marginTop: '20px', fontSize: '16px' }}>
                        {isAlohaDataset ? '正在加载和解析 Parquet 数据...' : '正在加载视频数据...'}
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
                    <div className={styles.parameterSelector}>
                        <div className={styles.parameterCard}>
                            <div className={styles.parameterLabel}>
                                <span className={styles.parameterIcon}>📦</span>
                                <span className={styles.parameterText}>数据块</span>
                                {loading && <span className={styles.loadingIndicator}>⏳</span>}
                            </div>
                            <Select 
                                className={styles.parameterSelect}
                                value={chunkId} 
                                onChange={v => handleParamChange(v, episodeId, viewPoint)} 
                                disabled={!datasetDetail || loading}
                                placeholder="选择数据块"
                                loading={loading}
                            >
                                {datasetDetail && Array.from({ length: datasetDetail.total_chunks }, (_, i) => (
                                    <Select.Option key={i} value={i}>
                                        <span className={styles.optionText}>Chunk {i}</span>
                                    </Select.Option>
                                ))}
                            </Select>
                            {datasetDetail && (
                                <div className={styles.parameterInfo}>
                                    <span className={styles.currentSelection}>当前: Chunk {chunkId}</span>
                                    <span className={styles.totalInfo}>共 {datasetDetail.total_chunks} 个数据块</span>
                                </div>
                            )}
                        </div>

                        <div className={styles.parameterCard}>
                            <div className={styles.parameterLabel}>
                                <span className={styles.parameterIcon}>🎬</span>
                                <span className={styles.parameterText}>片段</span>
                                {loading && <span className={styles.loadingIndicator}>⏳</span>}
                            </div>
                            <Select 
                                className={styles.parameterSelect}
                                value={episodeId} 
                                onChange={v => handleParamChange(chunkId, v, viewPoint)} 
                                disabled={!datasetDetail || loading}
                                placeholder="选择片段"
                                loading={loading}
                            >
                                {datasetDetail && Array.from({ length: datasetDetail.total_episodes }, (_, i) => (
                                    <Select.Option key={i} value={i}>
                                        <span className={styles.optionText}>Episode {i}</span>
                                    </Select.Option>
                                ))}
                            </Select>
                            {datasetDetail && (
                                <div className={styles.parameterInfo}>
                                    <span className={styles.currentSelection}>当前: Episode {episodeId}</span>
                                    <span className={styles.totalInfo}>共 {datasetDetail.total_episodes} 个片段</span>
                                </div>
                            )}
                        </div>

                        <div className={styles.parameterCard}>
                            <div className={styles.parameterLabel}>
                                <span className={styles.parameterIcon}>📹</span>
                                <span className={styles.parameterText}>视角</span>
                                {loading && <span className={styles.loadingIndicator}>⏳</span>}
                            </div>
                            <Select 
                                className={styles.parameterSelect}
                                value={viewPoint} 
                                onChange={v => handleParamChange(chunkId, episodeId, v)} 
                                disabled={!datasetDetail || loading}
                                placeholder="选择视角"
                                loading={loading}
                            >
                                {datasetDetail && datasetDetail.video_keys.map(vp => (
                                    <Select.Option key={vp} value={vp}>
                                        <span className={styles.optionText}>{vp}</span>
                                    </Select.Option>
                                ))}
                            </Select>
                            {datasetDetail && (
                                <div className={styles.parameterInfo}>
                                    <span className={styles.currentSelection}>当前: {viewPoint}</span>
                                    <span className={styles.totalInfo}>共 {datasetDetail.video_keys.length} 个视角</span>
                                </div>
                            )}
                        </div>
                    </div>
                    <div className={styles.videoTitle}>
                        <Title level={3}>机器人动作视频</Title>
                        <div className={styles.videoHint}>
                            💡 使用视频播放器控制整个页面的播放状态
                        </div>
                    </div>
                    <div className={styles.videoContainer}>
                        <video ref={videoRef} src={videoUrl} controls className={styles.videoPlayer} data-testid="video-player">
                            您的浏览器不支持视频播放。
                        </video>
                    </div>
                    {loading && (
                        <div className={styles.loadingContainer}>
                            <Spin size="large" />
                            <div className={styles.loadingText}>正在加载数据...</div>
                        </div>
                    )}
                    {loadError && (
                        <div className={styles.errorContainer}>
                            <span className={styles.errorIcon}>⚠️</span>
                            <div className={styles.errorText}>{loadError}</div>
                        </div>
                    )}
                </div>

                {/* 只有Aloha数据集才显示图表和仿真 */}
                {isAlohaDataset && (
                    <>
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
                                <div style={{ background: '#eaf2fb', minHeight: 500, display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
                                    {/* 帧数显示 - 左上角 */}
                                    <div className={styles.frameCounter}>
                                        <span className={styles.frameText}>
                                            帧数: {motionData.length > 0 ? `${currentFrame + 1} / ${motionData.length}` : 'N/A'}
                                        </span>
                                    </div>
                                    <div style={{ width: '100%', height: 600 }}>
                                        <RobotSimulation ref={robotRef} urdfUrl={urdfUrl} />
                                    </div>
                                </div>
                            </Card>
                        </div>
                    </>
                )}


            </div>
        </div>
    );
};

export default DatasetVisualizationPage;
