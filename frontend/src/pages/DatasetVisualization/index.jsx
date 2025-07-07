import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Typography,
  Card,
  Button,
  Spin,
  Row,
  Col,
  Checkbox,
  Divider,
  Alert
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

const chartGroups = [
  {
    title: '左侧关节',
    joints: [
      { key: 'left_waist', color: '#ff4d4f', label: 'left_waist' },
      { key: 'left_forearm_roll', color: '#52c41a', label: 'left_forearm_roll' },
      { key: 'left_wrist_rotate', color: '#1890ff', label: 'left_wrist_rotate' },
    ],
  },
  {
    title: '右侧关节',
    joints: [
      { key: 'right_waist', color: '#ff4d4f', label: 'right_waist' },
      { key: 'right_forearm_roll', color: '#52c41a', label: 'right_forearm_roll' },
      { key: 'right_wrist_angle', color: '#1890ff', label: 'right_wrist_angle' },
    ],
  },
];

// 字段映射表
const jointFieldMap = {
  // 左侧
  left_waist: 'vx300s_left/waist',
  left_forearm_roll: 'vx300s_left/forearm_roll',
  left_wrist_rotate: 'vx300s_left/wrist_rotate',
  // 右侧
  right_waist: 'vx300s_right/waist',
  right_forearm_roll: 'vx300s_right/forearm_roll',
  right_wrist_angle: 'vx300s_right/wrist_angle',
};

const DatasetVisualizationPage = () => {
  const navigate = useNavigate();
  const [videoUrl] = useState(exampleVideo);
  const [jointData, setJointData] = useState([]); // 当前分组用于图表
  const [motionData, setMotionData] = useState([]); // 当前分组用于仿真
  const [allGroups, setAllGroups] = useState([]); // 所有分组
  const [currentGroupIndex, setCurrentGroupIndex] = useState(0); // 当前分组索引
  const [currentTime, setCurrentTime] = useState(0);
  const [videoDuration, setVideoDuration] = useState(0);
  const [checkedLines, setCheckedLines] = useState({});
  const videoRef = useRef(null);
  const chartRefs = useRef([]);
  const [showMarkLine, setShowMarkLine] = useState(true);
  
  // 机器人仿真相关状态
  const robotRef = useRef(null);
  const [isRobotLoaded, setIsRobotLoaded] = useState(false);
  const [isMotionDataLoaded, setIsMotionDataLoaded] = useState(false);
  const [autoPlaySimulation, setAutoPlaySimulation] = useState(false); // 控制仿真自动播放

  const urdfUrl = '/bimanual_robot.urdf';

  // 分组函数：遇到time为0.0时分组
  function splitDataByTimeZero(data) {
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
  }

  // 加载并分组数据
  useEffect(() => {
    const loadMotionData = async () => {
      try {
        const data = await loadMotionDataFromJson('/data/motion_data.json');
        const groups = splitDataByTimeZero(data);
        setAllGroups(groups);
        setCurrentGroupIndex(0);
        setMotionData(groups[0] || []);
        // 图表数据
        const chartData = (groups[0] || []).map((item, index) => ({
          time: item.time,
          ...item
        }));
        setJointData(chartData);
        setIsMotionDataLoaded(true);
      } catch (error) {
        setAllGroups([]);
        setMotionData([]);
        setJointData([]);
        setIsMotionDataLoaded(false);
      }
    };
    loadMotionData();
  }, []);

  // 切换分组时，仿真和图表数据同步切换，并自动播放仿真
  useEffect(() => {
    if (allGroups.length > 0) {
      setMotionData(allGroups[currentGroupIndex] || []);
      const chartData = (allGroups[currentGroupIndex] || []).map((item, index) => ({
        time: item.time,
        ...item
      }));
      setJointData(chartData);
      setAutoPlaySimulation(true); // 切换分组时自动播放仿真
    }
  }, [currentGroupIndex, allGroups]);

  // 修改gotoNextGroup，切换分组时自动播放
  const gotoNextGroup = () => {
    if (allGroups.length > 0) {
      setCurrentGroupIndex((prev) => (prev + 1) % allGroups.length);
      setAutoPlaySimulation(true);
    }
  };
  const gotoPrevGroup = () => {
    if (allGroups.length > 0) {
      setCurrentGroupIndex((prev) => (prev - 1 + allGroups.length) % allGroups.length);
      setAutoPlaySimulation(true);
    }
  };

  // 处理勾选框状态变更
  const handleLineCheck = (groupIdx, lineKey, checked) => {
    setCheckedLines(prev => ({
      ...prev,
      [groupIdx]: {
        ...prev[groupIdx],
        [lineKey]: checked,
      },
    }));
  };

  // 生成 ECharts 配置
  const getChartOption = (group, groupIdx) => {
    const series = [];
    const legendData = [];
    const currentGroupChecks = checkedLines[groupIdx] || {};
    let markLineAdded = false; // 只添加一次markLine
    
    group.joints.forEach(joint => {
      // observation
      if (currentGroupChecks[`${joint.key}_observation`]) {
        series.push({
          name: `${joint.label} observation`,
          type: 'line',
          data: jointData.map(item => [item.time, item[jointFieldMap[joint.key]]]),
          lineStyle: { color: joint.color, width: 2, type: 'solid' },
          color: joint.color,
          symbol: 'none',
          icon: 'path://M2,8 L22,8',
          markLine: showMarkLine && !markLineAdded ? {
            symbol: 'none',
            data: [
              {
                xAxis: typeof currentTime === 'number' ? currentTime : 0,
                lineStyle: {
                  color: '#bfbfbf',
                  width: 1,
                  type: 'dashed',
                },
                label: { show: false },
              },
            ],
            animation: false,
          } : undefined,
        });
        if (!markLineAdded) markLineAdded = true;
        legendData.push(`${joint.label} observation`);
      }
      // action（同样映射到同一个字段）
      if (currentGroupChecks[`${joint.key}_action`]) {
        series.push({
          name: `${joint.label} action`,
          type: 'line',
          data: jointData.map(item => [item.time, item[jointFieldMap[joint.key]]]),
          lineStyle: { color: joint.color, width: 2, type: 'dashed' },
          color: joint.color,
          symbol: 'none',
          icon: 'path://M2,8 L7,8 M10,8 L15,8 M18,8 L22,8',
          markLine: showMarkLine && !markLineAdded ? {
            symbol: 'none',
            data: [
              {
                xAxis: typeof currentTime === 'number' ? currentTime : 0,
                lineStyle: {
                  color: '#bfbfbf',
                  width: 1,
                  type: 'dashed',
                },
                label: { show: false },
              },
            ],
            animation: false,
          } : undefined,
        });
        if (!markLineAdded) markLineAdded = true;
        legendData.push(`${joint.label} action`);
      }
    });

    return {
      grid: { left: 50, right: 20, top: 40, bottom: 40 },
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'line' },
        formatter: params => {
          if (!params || !params.length) return '';
          let html = `<div style='font-weight:600;margin-bottom:4px;'>Time: ${params[0].value[0].toFixed(2)}s</div>`;
          params.forEach(param => {
            html += `<div><span style='display:inline-block;margin-right:6px;border-radius:50%;width:10px;height:10px;background:${param.color}'></span>${param.seriesName}: <b>${param.value[1].toFixed(6)}</b></div>`;
          });
          return html;
        }
      },
      legend: {
        data: legendData,
        type: 'scroll',
        top: 0,
        selectedMode: false,
      },
      xAxis: {
        type: 'value',
        name: 'Time (s)',
        min: 0,
        max: jointData.length > 0 ? jointData[jointData.length - 1].time : 10,
        splitLine: { show: true, lineStyle: { color: '#f0f0f0' } }
      },
      yAxis: { type: 'value', splitLine: { show: true, lineStyle: { color: '#f0f0f0' } } },
      series,
    };
  };

  // 初始化勾选状态
  useEffect(() => {
    const defaultChecked = {};
    chartGroups.forEach((group, idx) => {
      defaultChecked[idx] = {};
      group.joints.forEach(joint => {
        defaultChecked[idx][`${joint.key}_observation`] = true;
        defaultChecked[idx][`${joint.key}_action`] = false; // 默认不显示action
      });
    });
    setCheckedLines(defaultChecked);
  }, []);

  const handleBack = () => navigate('/data-center');
  const handleTimeUpdate = (e) => setCurrentTime(e.target.currentTime);

  // 当视频元数据加载完成时，获取时长并设置图表数据
  const handleLoadedMetadata = (e) => {
    const duration = e.target.duration;
    if (duration) {
        setVideoDuration(duration);
        // 不再生成模拟数据，等待真实数据加载
    }
  };

  // 视频暂停/播放时自动显示/隐藏tooltip
  const handlePause = () => {
    setShowMarkLine(false);
    chartRefs.current.forEach((chartRef, idx) => {
      if (chartRef && chartRef.getEchartsInstance) {
        const instance = chartRef.getEchartsInstance();
        const dataIndex = jointData.findIndex(item => item.time >= currentTime);
        instance.dispatchAction({
          type: 'showTip',
          seriesIndex: 0,
          dataIndex: dataIndex === -1 ? jointData.length - 1 : dataIndex,
        });
      }
    });
  };
  const handlePlay = () => {
    setShowMarkLine(true);
    chartRefs.current.forEach((chartRef) => {
      if (chartRef && chartRef.getEchartsInstance) {
        const instance = chartRef.getEchartsInstance();
        instance.dispatchAction({ type: 'hideTip' });
        instance.dispatchAction({
          type: 'updateAxisPointer',
          xAxisIndex: 0,
          value: null
        });
      }
    });
  };

  if (jointData.length === 0) {
    return (
        <div className={styles.visualizationPage}>
             <div className={styles.contentWrapper}>
                <div className={styles.pageHeader}>
                    <Button icon={<ArrowLeftOutlined />} onClick={handleBack} className={styles.backButton}>返回</Button>
                </div>
                <div className={styles.videoSection}>
                    <div className={styles.videoTitle}><Title level={3}>机器人动作视频</Title></div>
                    <div className={styles.videoContainer}>
                        <video
                            ref={videoRef}
                            src={videoUrl}
                            controls
                            className={styles.videoPlayer}
                            onLoadedMetadata={handleLoadedMetadata}
                            onPause={handlePause}
                            onPlay={handlePlay}
                        >
                            您的浏览器不支持视频播放。
                        </video>
                    </div>
                </div>
                <div className={styles.loadingContainer}>
                    <Spin size="large" />
                    <div style={{ marginTop: '16px' }}>等待视频加载中...</div>
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
          <div className={styles.videoTitle}>
            <Title level={3}>机器人动作视频</Title>
          </div>
          <div className={styles.videoContainer}>
            <video
              ref={videoRef}
              src={videoUrl}
              controls
              className={styles.videoPlayer}
              onTimeUpdate={handleTimeUpdate}
              onLoadedMetadata={handleLoadedMetadata}
              onPause={handlePause}
              onPlay={handlePlay}
            >
              您的浏览器不支持视频播放。
            </video>
          </div>
        </div>

        <div style={{ marginTop: 32 }}>
          <Row gutter={[32, 32]} justify="center">
            {chartGroups.map((group, idx) => (
              <Col xs={24} lg={12} key={group.title} style={{ display: 'flex' }}>
                <Card className={styles.chartCard} style={{ width: '100%', padding: '16px 24px' }}>
                  <div style={{ marginBottom: 12, fontWeight: 600, fontSize: 18 }}>{group.title}</div>
                  <div style={{ marginBottom: 8 }}>
                    <div style={{ marginBottom: 8 }}>
                      <Button
                        size="small"
                        type="link"
                        style={{ paddingLeft: 0 }}
                        onClick={() => {
                          const currentGroupChecks = checkedLines[idx] || {};
                          const allChecked = group.joints.every(joint =>
                            currentGroupChecks[`${joint.key}_observation`] && currentGroupChecks[`${joint.key}_action`]
                          );
                          const newState = { ...currentGroupChecks };
                          group.joints.forEach(joint => {
                            newState[`${joint.key}_observation`] = !allChecked;
                            newState[`${joint.key}_action`] = !allChecked;
                          });
                          setCheckedLines(prev => ({ ...prev, [idx]: newState }));
                        }}
                      >
                        全选/取消全选
                      </Button>
                    </div>
                    <Row gutter={[16, 8]}>
                      {group.joints.map(joint => (
                        <React.Fragment key={joint.key}>
                          <Col span={12}>
                            <Checkbox
                              checked={!!(checkedLines[idx] && checkedLines[idx][`${joint.key}_observation`])}
                              onChange={e => handleLineCheck(idx, `${joint.key}_observation`, e.target.checked)}
                              style={{ color: joint.color }}
                            >
                              {joint.label} obs.
                            </Checkbox>
                          </Col>
                          <Col span={12}>
                            <Checkbox
                              checked={!!(checkedLines[idx] && checkedLines[idx][`${joint.key}_action`])}
                              onChange={e => handleLineCheck(idx, `${joint.key}_action`, e.target.checked)}
                              style={{ color: joint.color, fontStyle: 'italic' }}
                            >
                              {joint.label} act.
                            </Checkbox>
                          </Col>
                        </React.Fragment>
                      ))}
                    </Row>
                  </div>
                  <div style={{ background: '#fff', borderRadius: 8, padding: '8px 0' }}>
                    <ReactECharts
                      ref={el => (chartRefs.current[idx] = el)}
                      option={getChartOption(group, idx)}
                      style={{ height: 340 }}
                      className={styles.chart}
                    />
                  </div>
                </Card>
              </Col>
            ))}
          </Row>
        </div>

        {/* 仿真演示区域整体卡片化，顶部为表格式控制栏，下方为3D仿真 */}
        <div style={{ marginTop: 32 }}>
          <Card style={{ padding: 0 }} bodyStyle={{ padding: 0 }}>
            {/* 控制栏 */}
            <div style={{ display: 'flex', alignItems: 'center', borderBottom: '1px solid #e6e6e6', padding: '16px 24px', background: '#f7faff' }}>
              {/* 左侧文本 */}
              <div style={{ flex: 1, textAlign: 'left', color: '#888', fontSize: 14 }}>
                <RobotController 
                  robotRef={robotRef}
                  motionData={motionData}
                  currentGroupIndex={currentGroupIndex}
                  totalGroups={allGroups.length}
                  onGroupEnd={gotoNextGroup}
                  autoPlay={autoPlaySimulation}
                  setAutoPlay={setAutoPlaySimulation}
                  renderTextOnly
                />
              </div>
              {/* 右侧按钮 */}
              <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
                <RobotController 
                  robotRef={robotRef}
                  motionData={motionData}
                  currentGroupIndex={currentGroupIndex}
                  totalGroups={allGroups.length}
                  onGroupEnd={gotoNextGroup}
                  autoPlay={autoPlaySimulation}
                  setAutoPlay={setAutoPlaySimulation}
                  renderButtonsOnly
                />
              </div>
            </div>
            {/* 3D仿真部分 */}
            <div style={{ background: '#eaf2fb', minHeight: 500, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <div style={{ width: '100%', height: 600 }}>
                <Card 
                  title={null}
                  style={{ height: '100%', margin: 0, boxShadow: 'none', background: 'transparent' }}
                  bodyStyle={{ padding: 0, height: '100%', background: 'transparent' }}
                >
                  <RobotSimulation 
                    ref={robotRef}
                    urdfUrl={urdfUrl}
                    onLoad={() => setIsRobotLoaded(true)}
                  />
                </Card>
              </div>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default DatasetVisualizationPage;