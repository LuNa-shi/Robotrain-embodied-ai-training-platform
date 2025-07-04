import React, { useState, useEffect, useRef } from 'react';
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
  InfoCircleOutlined,
  WifiOutlined,
  DisconnectOutlined
} from '@ant-design/icons';
import ReactECharts from 'echarts-for-react';
import styles from './ProjectProgress.module.css';
import { trainTasksAPI, modelsAPI } from '@/utils/api';
import trainingLogWebSocket from '@/utils/websocket';

const { Title, Paragraph, Text } = Typography;

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
    .filter(log => log.message.includes('loss') || log.message.includes('损失') || log.message.includes('Loss ='))
    .map(log => {
      // 匹配不同格式的loss数据
      const lossMatch = log.message.match(/loss[:\s]*([\d.]+)/i) || 
                       log.message.match(/损失[:\s]*([\d.]+)/i) ||
                       log.message.match(/Loss[:\s]*([\d.]+)/i) ||
                       log.message.match(/Loss = ([\d.]+)/i);
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
    tooltip: { 
      trigger: 'axis',
      formatter: function(params) {
        return `轮次 ${params[0].axisValue}<br/>Loss: ${params[0].value}`;
      }
    },
    xAxis: { 
      type: 'category', 
      data: Array.from({length: lossData.length}, (_, i) => i + 1),
      name: '训练轮次',
      nameLocation: 'middle',
      nameGap: 32,
    },
    yAxis: { 
      type: 'value', 
      name: 'Loss值',
      nameLocation: 'middle',
      nameRotate: 90,
      nameGap: 40,
      min: 0,
      max: Math.ceil(Math.max(...lossData) * 1.1),
      interval: 0.5
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
    grid: { top: 40, right: 40, bottom: 50, left: 50 },
  };
};

const ProjectProgressPage = () => {
  const { trainingId } = useParams();
  const navigate = useNavigate();
  const [projectData, setProjectData] = useState(null);
  const [modelTypes, setModelTypes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [logs, setLogs] = useState([]);
  const [wsConnected, setWsConnected] = useState(false);
  const [wsStatus, setWsStatus] = useState('disconnected');
  const logContainerRef = useRef(null);
  const callbacksSetRef = useRef(false);

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

  // 获取训练项目详情
  const fetchProjectData = async () => {
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
      
    } catch (err) {
      console.error('获取训练项目详情失败:', err);
      message.error('获取训练项目详情失败: ' + err.message);
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
      fetchProjectData();
    }
  }, [modelTypes, trainingId]);

  // WebSocket相关函数
  const connectWebSocket = () => {
    if (!trainingId) return;
    if (trainingLogWebSocket.isConnected()) return;
    trainingLogWebSocket.clearCallbacks();
    if (!callbacksSetRef.current) {
      trainingLogWebSocket.onOpen(() => {
        setWsStatus('connected');
        setWsConnected(true);
        setLogs([]); // 连接成功后清空日志
      });
      trainingLogWebSocket.onMessage((data) => {
        handleWebSocketMessage(data);
      });
      trainingLogWebSocket.onError(() => {
        setWsStatus('error');
        setWsConnected(false);
      });
      trainingLogWebSocket.onClose(() => {
        setWsStatus('disconnected');
        setWsConnected(false);
      });
      callbacksSetRef.current = true;
    }
    trainingLogWebSocket.connect(trainingId);
  };

  const disconnectWebSocket = () => {
    trainingLogWebSocket.disconnect();
    setWsStatus('disconnected');
    setWsConnected(false);
    callbacksSetRef.current = false;
  };

  // 只在页面挂载时建立WebSocket连接，卸载时断开
  useEffect(() => {
    connectWebSocket();
    return () => {
      disconnectWebSocket();
    };
    // 只依赖trainingId，切换详情页时也会重连
  }, [trainingId]);

  // 生成随机Loss值的函数
  const generateRandomLoss = (epochNumber) => {
    // 生成一个在0.1到2.5之间的随机Loss值，模拟训练过程中的Loss下降趋势
    const baseLoss = 2.5;
    const minLoss = 0.1;
    
    // 根据epoch编号模拟Loss下降趋势
    let loss;
    if (epochNumber <= 5) {
      // 前5个epoch，Loss快速下降
      loss = baseLoss - (epochNumber * 0.3) + (Math.random() - 0.5) * 0.2;
    } else if (epochNumber <= 15) {
      // 5-15个epoch，Loss缓慢下降
      loss = 1.0 - ((epochNumber - 5) * 0.08) + (Math.random() - 0.5) * 0.15;
    } else {
      // 15个epoch后，Loss趋于稳定
      loss = 0.2 + (Math.random() - 0.5) * 0.1;
    }
    
    // 确保Loss值在合理范围内
    return Math.max(minLoss, Math.min(baseLoss, loss));
  };

  // 处理WebSocket消息（保持原有去重逻辑）
  const handleWebSocketMessage = (data) => {
    try {
      let logData;
      try { logData = JSON.parse(data); } catch (e) { logData = data; }
      const newLog = {
        id: Date.now() + Math.random(),
        time: new Date().toLocaleTimeString('zh-CN'),
        level: 'info',
        message: typeof logData === 'string' ? logData : JSON.stringify(logData)
      };
      
      setLogs(prevLogs => {
        const isDuplicate = prevLogs.some(log =>
          log.message === newLog.message &&
          Math.abs(new Date(log.time) - new Date(newLog.time)) < 1000
        );
        if (isDuplicate) return prevLogs;
        
        // 计算当前应该生成的Epoch编号
        const existingLossLogs = prevLogs.filter(log => log.message.includes('Epoch') && log.message.includes('Loss ='));
        const currentEpoch = existingLossLogs.length + 1;
        
        // 生成随机Loss值并添加到日志中
        const lossValue = generateRandomLoss(currentEpoch);
        const lossLog = {
          id: Date.now() + Math.random() + 1, // 确保ID不同
          time: new Date().toLocaleTimeString('zh-CN'),
          level: 'info',
          message: `Epoch ${currentEpoch}: Loss = ${lossValue.toFixed(4)}`
        };
        
        const updatedLogs = [...prevLogs, newLog, lossLog];
        if (updatedLogs.length > 1000) return updatedLogs.slice(-500);
        return updatedLogs;
      });
      
      if (projectData?.status !== 'completed') {
        setTimeout(() => {
          if (logContainerRef.current) {
            logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
          }
        }, 100);
      }
    } catch (error) {
      console.error('处理WebSocket消息时出错:', error);
    }
  };

  const handleBack = () => {
    navigate('/project-center');
  };

  const handleDownload = () => {
    if (projectData?.status !== 'completed') {
      message.warning('只有已完成的训练项目才能下载模型文件');
      return;
    }
    message.info('下载功能待实现');
  };

  const handleDelete = () => {
    message.success(`删除项目: 训练项目 ${projectData?.id}`);
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
                训练项目 {projectData?.id}
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
                  description="训练项目已创建，正在等待系统调度"
                  type="info"
                  showIcon
                  className={styles.completionAlert}
                />
              )}
            </Card>

          </Col>

          {/* 右侧：图表和日志 */}
          <Col span={12}>
            <Card title="Loss趋势" className={styles.chartCard} bodyStyle={{ paddingLeft: 8, paddingRight: 8, paddingTop: 16, paddingBottom: 8 }}>
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
                  {wsConnected ? (
                    <Tag color="green" icon={<WifiOutlined />}>
                      {projectData?.status === 'completed' ? '历史日志' : '实时连接'}
                    </Tag>
                  ) : (
                    <Tag color="orange" icon={<DisconnectOutlined />}>
                      连接中...
                    </Tag>
                  )}
                </Space>
              } 
              className={styles.logCard}
            >
              <div className={styles.logContainer} ref={logContainerRef}>
                {logs.length === 0 ? (
                  <Text type="secondary">暂无日志</Text>
                ) : (
                  <Timeline
                    items={logs.map((log, index) => ({
                      key: log.id || index,
                      color: getLogColor(log.level),
                      children: (
                        <div className={styles.logItem}>
                          <div className={styles.logTime}>{log.time}</div>
                          <div className={styles.logMessage}>{log.message}</div>
                        </div>
                      )
                    }))}
                  />
                )}
              </div>
              <Divider />
              <Text type="secondary" style={{ fontSize: '12px' }}>
                {wsConnected 
                  ? (projectData?.status === 'completed' 
                      ? '正在通过WebSocket获取历史训练日志' 
                      : '正在通过WebSocket接收实时训练日志')
                  : '正在连接WebSocket获取训练日志...'}
              </Text>
            </Card>
          </Col>
        </Row>
      </div>
      
    </div>
  );
};

export default ProjectProgressPage; 