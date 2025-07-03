import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Typography, 
  Card, 
  Button, 
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
  ReloadOutlined,
  InfoCircleOutlined,
  BarChartOutlined
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
  const getChartOption = (group, groupIdx, checkedLines) => {
    const timeData = jointData.map(item => item.time);
    const series = [];
    const legendData = [];
    group.joints.forEach(joint => {
      // observation.state
      if (checkedLines[groupIdx]?.[`${joint.key}_observation`]) {
        legendData.push(`${joint.label} observation.state`);
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
        legendData.push(`${joint.label} action`);
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
      grid: { left: 40, right: 20, top: 40, bottom: 40 },
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'line' },
        confine: true,
        showContent: true,
        // 只显示当前点数据
        formatter: params => {
          if (!params || !params.length) return '';
          let html = `<div style='font-weight:600;margin-bottom:4px;'>time: ${params[0].axisValue}</div>`;
          params.forEach(param => {
            html += `<div><span style='display:inline-block;margin-right:6px;border-radius:50%;width:10px;height:10px;background:${param.color}'></span>${param.seriesName} <b>${param.value.toFixed(6)}</b></div>`;
          });
          return html;
        }
      },
      legend: {
        data: legendData,
        type: 'scroll',
        orient: 'horizontal',
        top: 0,
        icon: 'circle',
        itemWidth: 16,
        itemHeight: 8,
        textStyle: { fontSize: 14 },
        padding: [0, 0, 8, 0],
      },
      xAxis: {
        type: 'category',
        data: timeData,
        name: 'time',
        nameLocation: 'start',
        axisLabel: { fontSize: 13 },
        show: true,
        axisLine: { show: true, lineStyle: { color: '#ccc' } },
        axisTick: { show: true },
        splitLine: { show: true, lineStyle: { color: '#f0f0f0' } }
      },
      yAxis: {
        type: 'value',
        axisLabel: { fontSize: 13 },
        show: true,
        axisLine: { show: true, lineStyle: { color: '#ccc' } },
        axisTick: { show: true },
        splitLine: { show: true, lineStyle: { color: '#f0f0f0' } }
      },
      series,
      markLine: {
        symbol: 'none',
        data: [
          {
            xAxis: currentTime,
            lineStyle: { color: '#aaa', width: 2, type: 'solid' },
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
            返回
          </Button>
          
        </div>

        {/* 视频播放器 */}
        <div className={styles.videoSection}>
          <div className={styles.videoTitle}>
            <Title level={3}>机器人动作视频</Title>
          </div>
          <div className={styles.videoContainer}>
            <video
              id="dataset-video"
              src={videoUrl}
              controls
              className={styles.videoPlayer}
              onTimeUpdate={handleTimeUpdate}
              onLoadedMetadata={handleLoadedMetadata}
            >
              您的浏览器不支持视频播放。
            </video>
          </div>
        </div>

        {/* 图表分组展示 */}
        <div style={{ marginTop: 32 }}>
          <Row gutter={[32, 0]} justify="center">
            {chartGroups.map((group, idx) => (
              <Col xs={24} sm={24} md={12} lg={12} xl={12} key={group.title} style={{ display: 'flex' }}>
                <Card className={styles.chartCard} style={{ width: '100%', padding: 28 }}>
                  <div style={{ marginBottom: 12, fontWeight: 600, fontSize: 18 }}>{group.title}</div>
                  {/* 勾选项 */}
                  <div style={{ marginBottom: 8 }}>
                    <Checkbox.Group>
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
                  </div>
                  {/* 图表 */}
                  <div style={{ background: '#fff', borderRadius: 8, padding: 8 }}>
                    <ReactECharts
                      option={getChartOption(group, idx, checkedLines)}
                      style={{ height: 340 }}
                      className={styles.chart}
                    />
                  </div>
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