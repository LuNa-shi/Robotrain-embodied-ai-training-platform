import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { 
  Typography, 
  Card, 
  Button, 
  Space, 
  message, 
  Spin,
  Row,
  Col,
  Tabs,
  Divider,
  Statistic,
  Alert,
  Checkbox
} from 'antd';
import {
  ArrowLeftOutlined,
  PlayCircleOutlined,
  PauseCircleOutlined,
  ReloadOutlined,
  InfoCircleOutlined,
  BarChartOutlined,
  VideoCameraOutlined
} from '@ant-design/icons';
import ReactECharts from 'echarts-for-react';
import { datasetsAPI } from '@/utils/api';
import styles from './DatasetVisualization.module.css';

const { Title, Text, Paragraph } = Typography;

// 图表分组配置，严格按示意图
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
  // 可继续补充下方分组
];

// 生成 mock 数据，字段名与示意图一致
const generateMockJointDataV2 = () => {
  const data = [];
  const timePoints = 100;
  for (let i = 0; i < timePoints; i++) {
    const time = (i / (timePoints - 1)) * 8; // 0~8秒
    data.push({
      time,
      left_waist_observation: -0.01 + Math.sin(time) * 0.01,
      left_waist_action: 0 + Math.cos(time) * 0.01,
      left_forearm_roll_observation: -0.12 + Math.sin(time * 0.8) * 0.03,
      left_forearm_roll_action: -0.12 + Math.cos(time * 0.8) * 0.03,
      left_wrist_rotate_observation: 0.02 + Math.sin(time * 1.2) * 0.02,
      left_wrist_rotate_action: 0.02 + Math.cos(time * 1.2) * 0.02,
      right_waist_observation: -0.06 + Math.sin(time * 0.9) * 0.02,
      right_waist_action: -0.07 + Math.cos(time * 0.9) * 0.02,
      right_forearm_roll_observation: -0.01 + Math.sin(time * 0.7) * 0.01,
      right_forearm_roll_action: -0.01 + Math.cos(time * 0.7) * 0.01,
      right_wrist_angle_observation: -0.05 + Math.sin(time * 1.1) * 0.02,
      right_wrist_angle_action: -0.04 + Math.cos(time * 1.1) * 0.02,
    });
  }
  return data;
};

const DatasetVisualizationPage = () => {
  const navigate = useNavigate();
  const [videoUrl, setVideoUrl] = useState('https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4');
  const [jointData, setJointData] = useState(generateMockJointDataV2());
  const [currentTime, setCurrentTime] = useState(0);
  const [videoDuration, setVideoDuration] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  // 勾选状态：{ groupIndex: { jointKey_observation: true, jointKey_action: true, ... } }
  const [checkedLines, setCheckedLines] = useState({});

  // 勾选项变更
  const handleLineCheck = (groupIdx, lineKey, checked) => {
    setCheckedLines(prev => ({
      ...prev,
      [groupIdx]: {
        ...prev[groupIdx],
        [lineKey]: checked,
      },
    }));
  };

  // 生成 ECharts option
  const getChartOption = (group, groupIdx) => {
    const timeData = jointData.map(item => item.time);
    const series = [];
    group.joints.forEach(joint => {
      // observation.state
      if (checkedLines[groupIdx]?.[`${joint.key}_observation`]) {
        series.push({
          name: `${joint.label} observation.state`,
          type: 'line',
          data: jointData.map(item => item[`${joint.key}_observation`]),
          lineStyle: { color: joint.color, width: 2, type: 'solid' },
          symbol: 'none',
        });
      }
      // action
      if (checkedLines[groupIdx]?.[`${joint.key}_action`]) {
        series.push({
          name: `${joint.label} action`,
          type: 'line',
          data: jointData.map(item => item[`${joint.key}_action`]),
          lineStyle: { color: joint.color, width: 2, type: 'dashed' },
          symbol: 'none',
        });
      }
    });
    // 时间指示线
    return {
      grid: { left: 40, right: 20, top: 30, bottom: 40 },
      tooltip: { trigger: 'axis' },
      legend: { top: 0, left: 0 },
      xAxis: {
        type: 'category',
        data: timeData,
        name: 'time',
        nameLocation: 'start',
      },
      yAxis: { type: 'value' },
      series,
      markLine: {
        symbol: 'none',
        data: [
          {
            xAxis: currentTime,
            lineStyle: { color: '#fff', width: 2, type: 'solid' },
            label: { show: false },
          },
        ],
        animation: false,
      },
    };
  };

  // 初始化勾选项
  useEffect(() => {
    const defaultChecked = {};
    chartGroups.forEach((group, idx) => {
      defaultChecked[idx] = {};
      group.joints.forEach(joint => {
        defaultChecked[idx][`${joint.key}_observation`] = true;
        defaultChecked[idx][`${joint.key}_action`] = true;
      });
    });
    setCheckedLines(defaultChecked);
  }, []);

  // 处理返回
  const handleBack = () => {
    navigate('/data-center');
  };

  // 处理视频时间更新
  const handleTimeUpdate = (e) => {
    const video = e.target;
    setCurrentTime(video.currentTime);
    setVideoDuration(video.duration);
  };

  // 处理视频播放状态变化
  const handlePlayPause = () => {
    const video = document.getElementById('dataset-video');
    if (video) {
      if (isPlaying) {
        video.pause();
      } else {
        video.play();
      }
      setIsPlaying(!isPlaying);
    }
  };

  // 处理视频加载完成
  const handleLoadedMetadata = (e) => {
    const video = e.target;
    setVideoDuration(video.duration);
  };

  // 判空保护，防止jointData为undefined或空时报错
  if (!jointData || jointData.length === 0) {
    return (
      <div className={styles.loadingContainer}>
        <Spin size="large" />
        <div style={{ marginTop: '16px' }}>加载中...</div>
      </div>
    );
  }

  return (
    <div className={styles.visualizationPage}>
      <div className={styles.contentWrapper}>
        {/* 页面头部 */}
        <div className={styles.pageHeader}>
          <Button 
            icon={<ArrowLeftOutlined />} 
            onClick={handleBack}
            className={styles.backButton}
          >
            返回数据中心
          </Button>
          <Title level={2} className={styles.pageTitle}>
            数据可视化
          </Title>
        </div>

        {/* 数据集基本信息 */}
        <Card className={styles.infoCard}>
          <Row gutter={16}>
            <Col span={8}>
              <Statistic 
                title="数据点数量" 
                value={jointData.length} 
                suffix="个"
              />
            </Col>
            <Col span={8}>
              <Statistic 
                title="视频时长" 
                value={videoDuration.toFixed(1)} 
                suffix="秒"
              />
            </Col>
          </Row>
        </Card>

        {/* 视频播放器 */}
        <Card 
          title={
            <Space>
              <VideoCameraOutlined />
              <span>机器人动作视频</span>
            </Space>
          }
          className={styles.videoCard}
        >
          <div className={styles.videoContainer}>
            <video
              id="dataset-video"
              src={videoUrl}
              controls
              className={styles.videoPlayer}
              onTimeUpdate={handleTimeUpdate}
              onLoadedMetadata={handleLoadedMetadata}
              onPlay={() => setIsPlaying(true)}
              onPause={() => setIsPlaying(false)}
            >
              您的浏览器不支持视频播放。
            </video>
            <div className={styles.videoControls}>
              <Space>
                <Button 
                  icon={isPlaying ? <PauseCircleOutlined /> : <PlayCircleOutlined />}
                  onClick={handlePlayPause}
                >
                  {isPlaying ? '暂停' : '播放'}
                </Button>
                <Text type="secondary">
                  当前时间: {currentTime.toFixed(1)}s / {videoDuration.toFixed(1)}s
                </Text>
              </Space>
            </div>
          </div>
        </Card>

        {/* 图表分组展示 */}
        <div style={{ marginTop: 32 }}>
          <Row gutter={[24, 24]}>
            {chartGroups.map((group, idx) => (
              <Col span={12} key={group.title}>
                <Card className={styles.chartCard}>
                  <div style={{ marginBottom: 8, fontWeight: 600 }}>{group.title}</div>
                  {/* 勾选项 */}
                  <Checkbox.Group style={{ marginBottom: 8, width: '100%' }}>
                    <Row gutter={[8, 8]}>
                      {group.joints.map(joint => [
                        <Col key={`${joint.key}_observation`}>
                          <Checkbox
                            checked={checkedLines[idx]?.[`${joint.key}_observation`]}
                            onChange={e => handleLineCheck(idx, `${joint.key}_observation`, e.target.checked)}
                            style={{ color: joint.color }}
                          >
                            {joint.label} observation.state
                          </Checkbox>
                        </Col>,
                        <Col key={`${joint.key}_action`}>
                          <Checkbox
                            checked={checkedLines[idx]?.[`${joint.key}_action`]}
                            onChange={e => handleLineCheck(idx, `${joint.key}_action`, e.target.checked)}
                            style={{ color: joint.color, fontStyle: 'italic' }}
                          >
                            {joint.label} action
                          </Checkbox>
                        </Col>,
                      ])}
                    </Row>
                  </Checkbox.Group>
                  {/* 图表 */}
                  <ReactECharts
                    option={getChartOption(group, idx)}
                    style={{ height: 300 }}
                    className={styles.chart}
                  />
                </Card>
              </Col>
            ))}
          </Row>
        </div>
      </div>
    </div>
  );
};

export default DatasetVisualizationPage; 