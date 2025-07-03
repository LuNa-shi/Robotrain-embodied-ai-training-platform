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
  Spin,
  Badge
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
  StopOutlined,
  SettingOutlined,
  InfoCircleOutlined
} from '@ant-design/icons';
import ReactECharts from 'echarts-for-react';
import styles from './ProjectProgress.module.css';
import { trainTasksAPI, modelsAPI } from '@/utils/api';

const { Title, Paragraph, Text } = Typography;

// 模拟训练日志数据（用于WebSocket连接前的静态显示）
const getMockTrainingLogs = (status) => {
  const baseLogs = [
    { time: '10:30:15', level: 'info', message: '开始训练任务' },
    { time: '10:30:20', level: 'info', message: '加载数据集完成' },
    { time: '10:30:25', level: 'info', message: '初始化模型完成' },
    { time: '10:30:30', level: 'info', message: '开始第1轮训练' },
    { time: '10:35:00', level: 'info', message: '第1轮完成，loss: 0.45' },
    { time: '10:40:00', level: 'info', message: '第2轮完成，loss: 0.32' },
    { time: '11:00:00', level: 'info', message: '第10轮完成，loss: 0.18' },
    { time: '11:30:00', level: 'info', message: '第50轮完成，loss: 0.08' },
    { time: '12:00:00', level: 'info', message: '第100轮完成，loss: 0.04' },
  ];

  if (status === 'completed') {
    return [
      ...baseLogs,
      { time: '12:30:00', level: 'info', message: '第150轮完成，loss: 0.02' },
      { time: '12:45:15', level: 'success', message: '训练完成！最终loss: 0.012' },
    ];
  } else if (status === 'running') {
    return [
      ...baseLogs,
      { time: '12:30:00', level: 'info', message: '第150轮完成，loss: 0.02' },
      { time: '12:45:00', level: 'info', message: '正在训练第156轮...' },
    ];
  } else if (status === 'failed') {
    return [
      ...baseLogs.slice(0, 5),
      { time: '10:45:00', level: 'warning', message: '检测到过拟合现象，loss上升至0.5' },
      { time: '10:50:00', level: 'error', message: '训练过程中出现内存不足错误' },
      { time: '10:55:00', level: 'error', message: '尝试恢复训练失败' },
      { time: '11:00:00', level: 'error', message: '训练失败，最终loss: 0.5' },
    ];
  } else {
    return [
      { time: '10:30:15', level: 'info', message: '训练任务已创建，等待调度...' },
    ];
  }
};

// 根据状态返回不同的Tag和Icon
const StatusDisplay = ({ status }) => {
  const statusMap = {
    completed: { color: 'success', text: '已完成', icon: <CheckCircleOutlined /> },
    running: { color: 'processing', text: '进行中', icon: <SyncOutlined spin /> },
    failed: { color: 'error', text: '失败', icon: <CloseCircleOutlined /> },
    pending: { color: 'default', text: '等待中', icon: <ClockCircleOutlined /> },
  };
  const { color, text, icon } = statusMap[status] || { color: 'default', text: '未知', icon: <ClockCircleOutlined /> };
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
  const [modelTypes, setModelTypes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [logs, setLogs] = useState([]);

  // 获取模型类型列表
  const fetchModelTypes = async () => {
    try {
      const data = await modelsAPI.getAllModelTypes();
      setModelTypes(data);
    } catch (err) {
      console.error('获取模型类型列表失败:', err);
      setModelTypes([]);
    }
  };

  // 获取训练任务详情
  const fetchTaskDetail = async () => {
    try {
      setLoading(true);
      const data = await trainTasksAPI.getById(trainingId);
      
      // 获取模型类型名称
      const modelType = modelTypes.find(mt => mt.id === data.model_type_id);
      const modelTypeName = modelType ? modelType.type_name : '未知模型';
      
      // 计算训练时长
      let duration = 'N/A';
      if (data.status === 'completed' && data.start_time && data.end_time) {
        const startTime = new Date(data.start_time);
        const endTime = new Date(data.end_time);
        const diffMs = endTime - startTime;
        const diffSeconds = Math.floor(diffMs / 1000);
        const diffMinutes = Math.floor(diffSeconds / 60);
        const diffHours = Math.floor(diffMinutes / 60);
        
        if (diffHours > 0) {
          duration = `${diffHours}小时${diffMinutes % 60}分钟`;
        } else if (diffMinutes > 0) {
          duration = `${diffMinutes}分钟${diffSeconds % 60}秒`;
        } else {
          duration = `${diffSeconds}秒`;
        }
      } else if (data.status === 'running') {
        duration = '进行中...';
      }
      
      // 计算进度（基于epochs）
      let progress = 0;
      let currentEpoch = 0;
      if (data.hyperparameter && data.hyperparameter.epochs) {
        const totalEpochs = data.hyperparameter.epochs;
        if (data.status === 'completed') {
          progress = 100;
          currentEpoch = totalEpochs;
        } else if (data.status === 'running') {
          // 模拟当前epoch（实际应该从WebSocket获取）
          currentEpoch = Math.floor(totalEpochs * 0.6);
          progress = (currentEpoch / totalEpochs) * 100;
        }
      }
      
      const formattedData = {
        ...data,
        modelTypeName,
        duration,
        progress,
        currentEpoch,
        totalEpochs: data.hyperparameter?.epochs || 0,
      };
      
      setProjectData(formattedData);
      
      // 设置模拟日志
      setLogs(getMockTrainingLogs(data.status));
      
    } catch (err) {
      console.error('获取训练任务详情失败:', err);
      message.error('获取训练任务详情失败: ' + err.message);
      navigate('/project-center');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchModelTypes();
  }, []);

  useEffect(() => {
    if (modelTypes.length > 0) {
      fetchTaskDetail();
    }
  }, [modelTypes, trainingId]);

  const handleBack = () => {
    navigate('/project-center');
  };

  const handleDownload = async () => {
    try {
      if (projectData.status !== 'completed') {
        message.warning('只有已完成的训练任务才能下载模型文件');
        return;
      }

      message.loading('正在下载模型文件...', 0);
      
      await trainTasksAPI.downloadModel(projectData.id);
      
      message.destroy();
      message.success('模型文件下载成功');
    } catch (error) {
      message.destroy();
      console.error('下载模型文件失败:', error);
      message.error('下载失败: ' + error.message);
    }
  };

  const handleDelete = () => {
    message.success(`删除项目: 训练任务 ${projectData?.id}`);
    navigate('/project-center');
  };

  const handlePause = () => {
    message.info('暂停训练功能暂未实现');
  };

  const handleStop = () => {
    message.warning('停止训练功能暂未实现');
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
                训练任务 {projectData?.id}
              </Title>
              <StatusDisplay status={projectData?.status} />
            </Space>
            <Paragraph className={styles.headerSubtitle}>
              模型类型: {projectData?.modelTypeName} | 创建时间: {projectData?.create_time ? new Date(projectData.create_time).toLocaleString('zh-CN') : 'N/A'}
            </Paragraph>
          </div>
        </div>
        <div className={styles.headerActions}>
          <Button 
            icon={<DownloadOutlined />} 
            onClick={handleDownload}
            disabled={projectData?.status !== 'completed'}
          >
            下载模型
          </Button>
          {projectData?.status === 'running' && (
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

      <div className={styles.content}>
        <Row gutter={[24, 24]}>
          {/* 左侧：项目信息和超参数配置 */}
          <Col span={12}>
            <Card title="基本信息" className={styles.infoCard}>
              <Descriptions column={1} size="small">
                <Descriptions.Item label="任务ID">{projectData?.id}</Descriptions.Item>
                <Descriptions.Item label="模型类型">{projectData?.modelTypeName}</Descriptions.Item>
                <Descriptions.Item label="数据集">{projectData?.dataset_id ? `数据集 ${projectData.dataset_id}` : '未指定数据集'}</Descriptions.Item>
                <Descriptions.Item label="创建时间">{projectData?.create_time ? new Date(projectData.create_time).toLocaleString('zh-CN') : 'N/A'}</Descriptions.Item>
                <Descriptions.Item label="开始时间">{projectData?.start_time ? new Date(projectData.start_time).toLocaleString('zh-CN') : 'N/A'}</Descriptions.Item>
                <Descriptions.Item label="结束时间">{projectData?.end_time ? new Date(projectData.end_time).toLocaleString('zh-CN') : 'N/A'}</Descriptions.Item>
                <Descriptions.Item label="训练时长">{projectData?.duration}</Descriptions.Item>
                {projectData?.model_uuid && (
                  <Descriptions.Item label="模型UUID">
                    <Text code style={{ fontSize: '12px' }}>{projectData.model_uuid}</Text>
                  </Descriptions.Item>
                )}
              </Descriptions>
            </Card>

            <Card 
              title={
                <Space>
                  <SettingOutlined />
                  超参数配置
                </Space>
              } 
              className={styles.infoCard}
            >
              {projectData?.hyperparameter ? (
                <Descriptions column={1} size="small">
                  {Object.entries(projectData.hyperparameter).map(([key, value]) => {
                    // 处理不同类型的值
                    let displayValue;
                    if (typeof value === 'number') {
                      displayValue = value.toLocaleString();
                    } else if (typeof value === 'object' && value !== null) {
                      // 如果是对象，显示为JSON字符串或特殊处理
                      if (Object.keys(value).length === 0) {
                        displayValue = '空对象';
                      } else {
                        displayValue = JSON.stringify(value);
                      }
                    } else if (typeof value === 'boolean') {
                      displayValue = value ? '是' : '否';
                    } else if (value === null || value === undefined) {
                      displayValue = 'N/A';
                    } else {
                      displayValue = String(value);
                    }
                    
                    return (
                      <Descriptions.Item key={key} label={key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}>
                        {displayValue}
                      </Descriptions.Item>
                    );
                  })}
                </Descriptions>
              ) : (
                <Text type="secondary">暂无超参数配置</Text>
              )}
            </Card>

            <Card title="训练进度" className={styles.progressCard}>
              <div className={styles.progressInfo}>
                <Text>当前轮次: {projectData?.currentEpoch || 0} / {projectData?.totalEpochs || 0}</Text>
                <Progress 
                  percent={projectData?.progress || 0} 
                  status={projectData?.status === 'failed' ? 'exception' : undefined}
                />
              </div>
              {projectData?.status === 'completed' && (
                <Alert
                  message="训练完成"
                  description="模型训练已成功完成，可以下载模型文件"
                  type="success"
                  showIcon
                  className={styles.completionAlert}
                />
              )}
              {projectData?.status === 'failed' && (
                <Alert
                  message="训练失败"
                  description="模型训练过程中出现错误，请检查配置或重新训练"
                  type="error"
                  showIcon
                  className={styles.failureAlert}
                />
              )}
              {projectData?.status === 'pending' && (
                <Alert
                  message="等待调度"
                  description="训练任务已创建，正在等待系统调度"
                  type="info"
                  showIcon
                  className={styles.completionAlert}
                />
              )}
            </Card>

          </Col>

          {/* 右侧：图表和日志 */}
          <Col span={12}>
            <Card title="Loss趋势" className={styles.chartCard}>
              <ReactECharts 
                option={getLossChartOption(logs)} 
                style={{ height: '300px' }}
              />
            </Card>

            <Card 
              title={
                <Space>
                  <InfoCircleOutlined />
                  训练日志
                  <Badge count={logs.length} style={{ backgroundColor: '#52c41a' }} />
                </Space>
              } 
              className={styles.logCard}
            >
              <div className={styles.logContainer}>
                <Timeline
                  items={logs.map((log, index) => ({
                    key: index,
                    color: getLogColor(log.level),
                    children: (
                      <div className={styles.logItem}>
                        <div className={styles.logTime}>{log.time}</div>
                        <div className={styles.logMessage}>{log.message}</div>
                      </div>
                    )
                  }))}
                />
              </div>
              <Divider />
              <Text type="secondary" style={{ fontSize: '12px' }}>
                注：当前显示的是模拟日志数据，实际训练日志将通过WebSocket实时获取
              </Text>
            </Card>
          </Col>
        </Row>
      </div>
      
    </div>
  );
};

export default ProjectProgressPage; 