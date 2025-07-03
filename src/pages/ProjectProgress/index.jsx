import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Button,
  Tag,
  Typography,
  Row,
  Col,
  Card,
  Descriptions,
  Divider,
  Space,
  message,
  Progress,
  Timeline,
  Alert,
  Spin
} from 'antd';
import {
  ArrowLeftOutlined,
  DownloadOutlined,
  DeleteOutlined,
  CheckCircleOutlined,
  SyncOutlined,
  CloseCircleOutlined,
  ClockCircleOutlined,
  PlayCircleOutlined,
  PauseCircleOutlined,
  StopOutlined
} from '@ant-design/icons';
import ReactECharts from 'echarts-for-react';
import styles from './ProjectProgress.module.css';

const { Title, Paragraph, Text } = Typography;

// 模拟项目进度数据
const getProjectProgress = (trainingId) => {
  const progressData = {
    'train-20250625-001': {
      id: 'train-20250625-001',
      name: '机器人视觉识别模型',
      status: 'completed',
      startTime: '2025-06-25 10:30:15',
      endTime: '2025-06-25 12:45:15',
      duration: '2h 15m',
      dataset: '工业机器人视觉数据集',
      baseModel: 'ResNet-50',
      accuracy: '98.5%',
      loss: '0.012',
      learningRate: 0.001,
      epochs: 200,
      currentEpoch: 200,
      batchSize: 32,
      progress: 100,
      logs: [
        { time: '10:30:15', level: 'info', message: '开始训练机器人视觉识别模型' },
        { time: '10:30:20', level: 'info', message: '加载数据集: 工业机器人视觉数据集' },
        { time: '10:30:25', level: 'info', message: '初始化模型: ResNet-50' },
        { time: '10:30:30', level: 'info', message: '开始第1轮训练' },
        { time: '10:35:00', level: 'info', message: '第1轮完成，准确率: 85.2%, loss: 0.45' },
        { time: '10:40:00', level: 'info', message: '第2轮完成，准确率: 88.7%, loss: 0.32' },
        { time: '11:00:00', level: 'info', message: '第10轮完成，准确率: 92.1%, loss: 0.18' },
        { time: '11:30:00', level: 'info', message: '第50轮完成，准确率: 95.3%, loss: 0.08' },
        { time: '12:00:00', level: 'info', message: '第100轮完成，准确率: 97.1%, loss: 0.04' },
        { time: '12:30:00', level: 'info', message: '第150轮完成，准确率: 98.0%, loss: 0.02' },
        { time: '12:45:15', level: 'success', message: '训练完成！最终准确率: 98.5%, loss: 0.012' },
      ]
    },
    'train-20250625-002': {
      id: 'train-20250625-002',
      name: '机械臂动作控制模型',
      status: 'running',
      startTime: '2025-06-25 14:00:00',
      endTime: null,
      duration: '进行中...',
      dataset: '机械臂动作控制数据',
      baseModel: 'AlphaGo-Zero',
      accuracy: 'N/A',
      loss: 'N/A',
      learningRate: 0.0001,
      epochs: 1000,
      currentEpoch: 156,
      batchSize: 64,
      progress: 15.6,
      logs: [
        { time: '14:00:00', level: 'info', message: '开始训练机械臂动作控制模型' },
        { time: '14:00:05', level: 'info', message: '加载数据集: 机械臂动作控制数据' },
        { time: '14:00:10', level: 'info', message: '初始化模型: AlphaGo-Zero' },
        { time: '14:00:15', level: 'info', message: '开始第1轮训练' },
        { time: '14:05:00', level: 'info', message: '第1轮完成，准确率: 45.2%, loss: 1.85' },
        { time: '14:10:00', level: 'info', message: '第2轮完成，准确率: 52.7%, loss: 1.62' },
        { time: '14:30:00', level: 'info', message: '第10轮完成，准确率: 68.1%, loss: 1.15' },
        { time: '15:00:00', level: 'info', message: '第50轮完成，准确率: 78.3%, loss: 0.78' },
        { time: '15:30:00', level: 'info', message: '第100轮完成，准确率: 82.1%, loss: 0.52' },
        { time: '16:00:00', level: 'info', message: '第150轮完成，准确率: 85.7%, loss: 0.35' },
        { time: '16:30:00', level: 'info', message: '正在训练第156轮...' },
      ]
    },
    'train-20250624-005': {
      id: 'train-20250624-005',
      name: '机器人语音交互模型',
      status: 'failed',
      startTime: '2025-06-24 09:00:00',
      endTime: '2025-06-24 09:45:00',
      duration: '45m',
      dataset: '机器人语音指令数据集',
      baseModel: 'GPT-2',
      accuracy: '20.1%',
      loss: '2.5',
      learningRate: 0.01,
      epochs: 50,
      currentEpoch: 15,
      batchSize: 16,
      progress: 30,
      logs: [
        { time: '09:00:00', level: 'info', message: '开始训练机器人语音交互模型' },
        { time: '09:00:05', level: 'info', message: '加载数据集: 机器人语音指令数据集' },
        { time: '09:00:10', level: 'info', message: '初始化模型: GPT-2' },
        { time: '09:00:15', level: 'info', message: '开始第1轮训练' },
        { time: '09:05:00', level: 'info', message: '第1轮完成，准确率: 15.2%, loss: 2.85' },
        { time: '09:10:00', level: 'info', message: '第2轮完成，准确率: 18.7%, loss: 2.62' },
        { time: '09:15:00', level: 'info', message: '第5轮完成，准确率: 19.1%, loss: 2.45' },
        { time: '09:20:00', level: 'info', message: '第10轮完成，准确率: 20.1%, loss: 2.35' },
        { time: '09:25:00', level: 'warning', message: '检测到过拟合现象，loss上升至2.5' },
        { time: '09:30:00', level: 'error', message: '训练过程中出现内存不足错误' },
        { time: '09:35:00', level: 'error', message: '尝试恢复训练失败' },
        { time: '09:45:00', level: 'error', message: '训练失败，最终准确率: 20.1%, loss: 2.5' },
      ]
    },
  };
  
  return progressData[trainingId] || null;
};

// 根据状态返回不同的Tag和Icon
const StatusDisplay = ({ status }) => {
  const statusMap = {
    completed: { color: 'success', text: '已完成', icon: <CheckCircleOutlined /> },
    running: { color: 'processing', text: '进行中', icon: <SyncOutlined spin /> },
    failed: { color: 'error', text: '失败', icon: <CloseCircleOutlined /> },
  };
  const { color, text, icon } = statusMap[status] || { color: 'default', text: '未知' };
  return <Tag icon={icon} color={color}>{text}</Tag>;
};

// 获取日志颜色
const getLogColor = (level) => {
  const colorMap = {
    info: '#1890ff',
    success: '#52c41a',
    warning: '#faad14',
    error: '#ff4d4f'
  };
  return colorMap[level] || '#1890ff';
};

// ECharts 图表配置 - Loss趋势
const getLossChartOption = (logs) => {
  const lossData = logs
    .filter(log => log.message.includes('loss') || log.message.includes('损失'))
    .map(log => {
      // 匹配不同格式的loss数据
      const lossMatch = log.message.match(/loss[:\s]*([\d.]+)/i) || 
                       log.message.match(/损失[:\s]*([\d.]+)/i) ||
                       log.message.match(/Loss[:\s]*([\d.]+)/i);
      return lossMatch ? parseFloat(lossMatch[1]) : null;
    })
    .filter(val => val !== null);

  // 如果没有找到loss数据，生成模拟数据
  if (lossData.length === 0) {
    // 根据项目状态生成不同的模拟loss数据
    const projectStatus = logs.find(log => log.message.includes('开始训练')) ? 'running' : 'completed';
    if (projectStatus === 'running') {
      // 运行中的项目：loss逐渐下降
      lossData.push(2.5, 2.1, 1.8, 1.5, 1.2, 0.9, 0.7, 0.5, 0.3, 0.2);
    } else {
      // 已完成的项目：loss最终收敛
      lossData.push(2.0, 1.6, 1.3, 1.0, 0.8, 0.6, 0.4, 0.3, 0.2, 0.1);
    }
  }

  return {
    title: { text: 'Loss趋势', left: 'center', textStyle: { fontSize: 14, fontWeight: 'normal' } },
    tooltip: { 
      trigger: 'axis',
      formatter: function(params) {
        return `轮次 ${params[0].axisValue}<br/>Loss: ${params[0].value}`;
      }
    },
    xAxis: { 
      type: 'category', 
      data: Array.from({length: lossData.length}, (_, i) => i + 1),
      name: '训练轮次'
    },
    yAxis: { 
      type: 'value', 
      name: 'Loss值',
      min: 0,
      max: Math.max(...lossData) * 1.1
    },
    series: [{
      data: lossData,
      type: 'line',
      smooth: true,
      color: '#ff7875',
      lineStyle: {
        width: 2
      },
      areaStyle: {
        color: {
          type: 'linear',
          x: 0,
          y: 0,
          x2: 0,
          y2: 1,
          colorStops: [{
            offset: 0, color: 'rgba(255, 120, 117, 0.3)'
          }, {
            offset: 1, color: 'rgba(255, 120, 117, 0.1)'
          }]
        }
      }
    }],
    grid: { top: 40, right: 20, bottom: 40, left: 50 },
  };
};

const ProjectProgressPage = () => {
  const { trainingId } = useParams();
  const navigate = useNavigate();
  const [projectData, setProjectData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // 模拟加载数据
    setTimeout(() => {
      const data = getProjectProgress(trainingId);
      if (!data) {
        message.error('未找到对应的项目记录');
        navigate('/project-center');
        return;
      }
      setProjectData(data);
      setLoading(false);
    }, 1000);
  }, [trainingId, navigate]);

  const handleBack = () => {
    navigate('/project-center');
  };

  const handleDownload = () => {
    message.success(`开始下载模型: ${projectData?.name}`);
  };

  const handleDelete = () => {
    message.success(`删除项目: ${projectData?.name}`);
    navigate('/project-center');
  };

  const handlePause = () => {
    message.info('暂停训练');
  };

  const handleStop = () => {
    message.warning('停止训练');
  };

  if (loading) {
    return (
      <div className={styles.loadingContainer}>
        <Spin size="large" />
        <Text>加载项目进度中...</Text>
      </div>
    );
  }

  return (
    <div className={styles.progressPage}>
      {/* 页面头部 */}
      <div className={styles.pageHeader}>
        <div className={styles.headerLeft}>
          <Button 
            type="text" 
            shape="circle"
            icon={<ArrowLeftOutlined />} 
            onClick={handleBack}
          />
          <div className={styles.headerInfo}>
            <Space align="center">
              <Title level={4} className={styles.headerTitle}>
                {projectData.name}
              </Title>
              <StatusDisplay status={projectData.status} />
            </Space>
            <Paragraph className={styles.headerSubtitle}>
              ID: {projectData.id}
            </Paragraph>
          </div>
        </div>
        <div className={styles.headerActions}>
          <Button icon={<DownloadOutlined />} onClick={handleDownload}>
            下载模型
          </Button>
          {projectData.status === 'running' && (
            <>
              <Button icon={<PauseCircleOutlined />} onClick={handlePause}>
                暂停
              </Button>
              <Button icon={<StopOutlined />} danger onClick={handleStop}>
                停止
              </Button>
            </>
          )}
          <Button icon={<DeleteOutlined />} danger onClick={handleDelete}>
            删除
          </Button>
        </div>
      </div>

      <Row gutter={[24, 24]} className={styles.content}>
        {/* 左侧：项目信息和进度 */}
        <Col span={12}>
          <Card title="项目信息" className={styles.infoCard}>
            <Descriptions column={1} size="small">
              <Descriptions.Item label="数据集">{projectData.dataset}</Descriptions.Item>
              <Descriptions.Item label="基础模型">{projectData.baseModel}</Descriptions.Item>
              <Descriptions.Item label="学习率">{projectData.learningRate}</Descriptions.Item>
              <Descriptions.Item label="批次大小">{projectData.batchSize}</Descriptions.Item>
              <Descriptions.Item label="开始时间">{projectData.startTime}</Descriptions.Item>
              <Descriptions.Item label="运行时长">{projectData.duration}</Descriptions.Item>
            </Descriptions>
          </Card>

          <Card title="训练进度" className={styles.progressCard}>
            <div className={styles.progressInfo}>
              <Text>当前轮次: {projectData.currentEpoch} / {projectData.epochs}</Text>
              <Progress 
                percent={projectData.progress} 
                status={projectData.status === 'failed' ? 'exception' : undefined}
              />
            </div>
            {projectData.status === 'completed' && (
              <Alert
                message="训练完成"
                description={`最终准确率: ${projectData.accuracy}, 损失: ${projectData.loss}`}
                type="success"
                showIcon
                className={styles.completionAlert}
              />
            )}
            {projectData.status === 'failed' && (
              <Alert
                message="训练失败"
                description={`最终准确率: ${projectData.accuracy}, 损失: ${projectData.loss}`}
                type="error"
                showIcon
                className={styles.failureAlert}
              />
            )}
          </Card>

          <Card title="Loss趋势" className={styles.chartCard}>
            <ReactECharts 
              option={getLossChartOption(projectData.logs)} 
              style={{ height: '200px' }}
            />
          </Card>
        </Col>

        {/* 右侧：实时日志 */}
        <Col span={12}>
          <Card title="训练日志" className={styles.logCard}>
            <div className={styles.logContainer}>
              <Timeline>
                {projectData.logs.map((log, index) => (
                  <Timeline.Item 
                    key={index}
                    color={getLogColor(log.level)}
                  >
                    <div className={styles.logItem}>
                      <Text type="secondary" className={styles.logTime}>
                        {log.time}
                      </Text>
                      <Text className={styles.logMessage}>
                        {log.message}
                      </Text>
                    </div>
                  </Timeline.Item>
                ))}
              </Timeline>
            </div>
          </Card>
        </Col>
      </Row>
    </div>
  );
};

export default ProjectProgressPage; 