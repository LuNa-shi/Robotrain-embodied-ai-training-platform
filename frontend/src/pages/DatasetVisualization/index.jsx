import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Typography,
  Card,
  Button,
  Spin,
  Row,
  Col,
  Checkbox
} from 'antd';
import {
  ArrowLeftOutlined,
} from '@ant-design/icons';
import ReactECharts from 'echarts-for-react';
import styles from './DatasetVisualization.module.css';
// 导入您的本地视频文件
// 请确保路径 '@/' 指向您的 'src' 目录，或者使用相对路径
import exampleVideo from '@/assets/videos/example.mp4';

const { Title } = Typography;

// 图表分组配置
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

/**
 * 根据视频时长动态生成模拟数据
 * @param {number} duration - 视频的总时长（秒）
 * @returns {Array} 生成的图表数据
 */
const generateMockJointDataV2 = (duration) => {
  if (!duration) return [];
  const data = [];
  const timePoints = Math.floor(duration * 10); // 每秒采样10个数据点
  for (let i = 0; i < timePoints; i++) {
    const time = (i / (timePoints - 1)) * duration;
    data.push({
      time,
      left_waist_observation: -0.01 + Math.sin(time / 2) * 0.01,
      left_waist_action: 0 + Math.cos(time / 2) * 0.01,
      left_forearm_roll_observation: -0.12 + Math.sin(time * 0.8 / 2) * 0.03,
      left_forearm_roll_action: -0.12 + Math.cos(time * 0.8 / 2) * 0.03,
      left_wrist_rotate_observation: 0.02 + Math.sin(time * 1.2 / 2) * 0.02,
      left_wrist_rotate_action: 0.02 + Math.cos(time * 1.2 / 2) * 0.02,
      right_waist_observation: -0.06 + Math.sin(time * 0.9 / 2) * 0.02,
      right_waist_action: -0.07 + Math.cos(time * 0.9 / 2) * 0.02,
      right_forearm_roll_observation: -0.01 + Math.sin(time * 0.7 / 2) * 0.01,
      right_forearm_roll_action: -0.01 + Math.cos(time * 0.7 / 2) * 0.01,
      right_wrist_angle_observation: -0.05 + Math.sin(time * 1.1 / 2) * 0.02,
      right_wrist_angle_action: -0.04 + Math.cos(time * 1.1 / 2) * 0.02,
    });
  }
  return data;
};

const DatasetVisualizationPage = () => {
  const navigate = useNavigate();
  const [videoUrl] = useState(exampleVideo);
  const [jointData, setJointData] = useState([]);
  const [currentTime, setCurrentTime] = useState(0);
  const [videoDuration, setVideoDuration] = useState(0);
  const [checkedLines, setCheckedLines] = useState({});
  const videoRef = useRef(null);
  const chartRefs = useRef([]);
  const [showMarkLine, setShowMarkLine] = useState(true);

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
      if (currentGroupChecks[`${joint.key}_observation`]) {
        series.push({
          name: `${joint.label} observation.state`,
          type: 'line',
          data: jointData.map(item => [item.time, item[`${joint.key}_observation`]]),
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
        legendData.push(`${joint.label} observation.state`);
      }
      if (currentGroupChecks[`${joint.key}_action`]) {
        series.push({
          name: `${joint.label} action`,
          type: 'line',
          data: jointData.map(item => [item.time, item[`${joint.key}_action`]]),
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
        max: videoDuration,
        splitLine: { show: true, lineStyle: { color: '#f0f0f0' } }
      },
      yAxis: { type: 'value', splitLine: { show: true, lineStyle: { color: '#f0f0f0' } } },
      series,
    };
  };

  // 初始化勾选状态为空
  useEffect(() => {
    const defaultChecked = {};
    chartGroups.forEach((_, idx) => {
      defaultChecked[idx] = {};
    });
    setCheckedLines(defaultChecked);
  }, []);

  const handleBack = () => navigate('/data-center');
  const handleTimeUpdate = (e) => setCurrentTime(e.target.currentTime);

  // 当视频元数据加载完成时，获取时长并生成图表数据
  const handleLoadedMetadata = (e) => {
    const duration = e.target.duration;
    if (duration) {
        setVideoDuration(duration);
        setJointData(generateMockJointDataV2(duration));
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

  // 初始加载界面，直到图表数据生成完毕
  if (jointData.length === 0) {
    return (
        <div className={styles.visualizationPage}>
             <div className={styles.contentWrapper}>
                <div className={styles.pageHeader}>
                    <Button icon={<ArrowLeftOutlined />} onClick={handleBack} className={styles.backButton}>返回</Button>
                </div>
                <div className={styles.videoSection}>
                    <div className={styles.videoTitle}><Title level={3}>机器人动作视频</Title></div>
                    {/* 视频容器，在加载时也显示 */}
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
      </div>
    </div>
  );
};

export default DatasetVisualizationPage;
