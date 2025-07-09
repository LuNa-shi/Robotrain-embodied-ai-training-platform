import React, { useState, useEffect, useRef, useCallback } from 'react';
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
import { trainTasksAPI, modelsAPI, deleteTrainTask } from '@/utils/api';
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
const getLossChartOption = (trainingData) => {
  if (trainingData.length === 0) {
    return {
      xAxis: { type: 'category', data: [] },
      yAxis: { type: 'value' },
      series: [{ data: [], type: 'line' }],
    };
  }
  
  // 从训练数据中提取epoch和loss值
  const epochs = trainingData.map(item => item.epoch);
  const lossData = trainingData.map(item => item.loss);
  
  return {
    tooltip: { 
      trigger: 'axis',
      formatter: function(params) {
        return `轮次 ${params[0].axisValue}<br/>Loss: ${params[0].value.toFixed(4)}`;
      }
    },
    xAxis: { 
      type: 'category', 
      data: epochs,
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
      interval: Math.ceil(Math.max(...lossData) * 1.1) / 10
    },
    series: [{
      data: lossData,
      type: 'line',
      smooth: true,
      color: '#ff7875',
      lineStyle: { width: 2 },
      areaStyle: {
        color: {
          type: 'linear', x: 0, y: 0, x2: 0, y2: 1,
          colorStops: [
            { offset: 0, color: 'rgba(255, 120, 117, 0.3)' },
            { offset: 1, color: 'rgba(255, 120, 117, 0.1)' }
          ]
        }
      }
    }],
    grid: { top: 40, right: 40, bottom: 50, left: 50 },
  };
};



// --- 修改点：为完成状态的进度条增加渐变色 ---
const getProgressBarColor = (status) => {
  if (status === 'completed') return { '0%': '#87d068', '100%': '#52c41a' };
  if (status === 'failed') return '#ff4d4f';
  return '#1890ff';
};

// 新增：自定义进度条组件
const StepProgressBar = ({ steps, logFreq, currentStep, status }) => {
  const finishedColor = status === 'completed' ? '#52c41a' : '#1890ff';
  const unfinishedColor = '#e0e0e0';
  const nodeRadius = 6;
  const barHeight = 4;
  const sidePadding = 32;
  const width = 1500 + sidePadding * 2;
  const barEdge = sidePadding;
  const barLength = width - 2 * barEdge;
  
  // 计算进度百分比
  let progressPercent;
  if (status === 'completed') {
    // 如果项目已完成，使用原有的处理方式：epoch/steps × 100%
    progressPercent = steps > 0 ? Math.min(100, (currentStep / steps) * 100) : 0;
  } else {
    progressPercent = steps > 0 ? Math.min(95, (currentStep / steps) * 95) : 0;
  }
  
  // 计算每次WebSocket消息的进度增量
  const progressIncrement = steps > 0 && logFreq > 0 ? (logFreq / steps) * 95 : 0;
  
  // 动画：线条x2
  const [animatedX2, setAnimatedX2] = React.useState(barEdge);
  const targetX2 = barEdge + (barLength * progressPercent) / 100;
  
  React.useEffect(() => {
    let raf;
    const duration = 500; // ms
    const start = performance.now();
    const from = animatedX2;
    const to = targetX2;
    if (from === to) return;
    function animate(now) {
      const elapsed = now - start;
      const t = Math.min(1, elapsed / duration);
      const value = from + (to - from) * t;
      setAnimatedX2(value);
      if (t < 1) raf = requestAnimationFrame(animate);
      else setAnimatedX2(to);
    }
    raf = requestAnimationFrame(animate);
    return () => raf && cancelAnimationFrame(raf);
    // eslint-disable-next-line
  }, [targetX2]);

  // 生成10%间隔的节点
  const nodeCount = 11; // 0%, 10%, 20%, ..., 100%
  const nodes = Array.from({ length: nodeCount }, (_, i) => {
    const percent = i * 10;
    const cx = barEdge + (barLength * percent) / 100;
    const cy = nodeRadius + 8;
    const reached = progressPercent >= percent;
    const fill = reached ? finishedColor : '#fff';
    const stroke = reached ? finishedColor : unfinishedColor;
    
    return {
      cx,
      cy,
      fill,
      stroke,
      percent,
      reached
    };
  });

  return (
    <svg width="100%" height={nodeRadius * 2 + 40} viewBox={`0 0 ${width} ${nodeRadius * 2 + 40}`} style={{ minWidth: 240, maxWidth: 1500 + sidePadding * 2, width: '100%' }}>
      {/* 线条底色 */}
      <line
        x1={barEdge}
        y1={nodeRadius + 8}
        x2={width - barEdge}
        y2={nodeRadius + 8}
        stroke={unfinishedColor}
        strokeWidth={barHeight}
        strokeLinecap="butt"
      />
      {/* 已完成部分线条，动画x2 */}
      <line
        x1={barEdge}
        y1={nodeRadius + 8}
        x2={animatedX2}
        y2={nodeRadius + 8}
        stroke={finishedColor}
        strokeWidth={barHeight}
        strokeLinecap="butt"
      />
      {/* 节点 */}
      {nodes.map(({ cx, cy, fill, stroke, percent, reached }, i) => (
        <g key={i}>
          <circle
            cx={cx}
            cy={cy}
            r={nodeRadius}
            fill={fill}
            stroke={stroke}
            strokeWidth={3}
            style={{ transition: 'fill 0.2s, stroke 0.2s' }}
          />
          {/* 百分比标签 */}
          <text
            x={cx}
            y={cy + nodeRadius + 12}
            textAnchor="middle"
            fontSize="12"
            fill={reached ? finishedColor : '#8c8c8c'}
            style={{ transition: 'fill 0.2s' }}
          >
            {percent}%
          </text>
        </g>
      ))}
    </svg>
  );
};

const ProjectProgressPage = () => {
  const { trainingId } = useParams();
  const navigate = useNavigate();
  const [projectData, setProjectData] = useState(null);
  const [modelTypes, setModelTypes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [logs, setLogs] = useState([]);
  const [trainingData, setTrainingData] = useState([]); // 新增：存储训练数据（epoch, loss等）
  const [currentStep, setCurrentStep] = useState(0); // 新增：当前训练步数
  const [wsConnected, setWsConnected] = useState(false);
  const [wsStatus, setWsStatus] = useState('disconnected');
  const [downloading, setDownloading] = useState(false);
  const logContainerRef = useRef(null);
  const callbacksSetRef = useRef(false);
  const [latestEpoch, setLatestEpoch] = useState(0);

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
      
      // 如果modelTypes为空，先获取模型类型列表
      let currentModelTypes = modelTypes;
      if (modelTypes.length === 0) {
        try {
          currentModelTypes = await modelsAPI.getAllModelTypes();
          setModelTypes(currentModelTypes);
        } catch (err) {
          console.error('获取模型类型列表失败:', err);
          currentModelTypes = [];
        }
      }
      
      // 获取模型类型名称
      const modelType = currentModelTypes.find(mt => mt.id === data.model_type_id);
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
      
      // 只设置totalEpochs
      const formattedData = {
        ...data,
        modelTypeName,
        duration,
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
    // 无论项目状态如何都建立WebSocket连接
    connectWebSocket();
    return () => {
      disconnectWebSocket();
    };
    // 依赖trainingId，切换详情页时也会重连
  }, [trainingId]);

  // 生成随机Loss值的函数


  // 解析WebSocket消息的函数
  function parseLogMessage(raw) {
    // 首先尝试匹配时间戳 - JSON格式
    const match = raw.match(/^([0-9T:\-\.\+:]+) - (.+)$/);
    if (match) {
      const timestamp = match[1];
      const jsonPart = match[2];
      
      try {
        // 尝试解析JSON部分
        const data = JSON.parse(jsonPart);
        
        // 检查是否是状态完成消息（只包含status字段）
        if (data.status && data.status !== null && !data.epoch && !data.loss) {
          return {
            type: 'status_completed',
            data: {
              status: data.status
            },
            time: timestamp,
            message: `训练状态更新: ${data.status}`
          };
        }
        
        // 检查是否是训练数据格式
        if (data.task_id && data.epoch && data.loss !== undefined) {
          return {
            type: 'training_data',
            data: {
              task_id: data.task_id,
              epoch: data.epoch,
              loss: data.loss,
              accuracy: data.accuracy,
              log_message: data.log_message,
              status: data.status
            },
            time: timestamp,
            message: data.log_message || `Epoch ${data.epoch}: loss=${data.loss.toFixed(4)}`
          };
        } else {
          return {
            type: 'log',
            time: timestamp,
            message: jsonPart
          };
        }
      } catch (error) {
        return {
          type: 'log',
          time: timestamp,
          message: jsonPart
        };
      }
    }
    
    // 如果不是时间戳 - JSON格式，尝试直接解析JSON
    try {
      const data = JSON.parse(raw);
      
      // 检查是否是状态完成消息（只包含status字段）
      if (data.status && data.status !== null && !data.epoch && !data.loss) {
        return {
          type: 'status_completed',
          data: {
            status: data.status
          },
          time: new Date().toISOString(),
          message: `训练状态更新: ${data.status}`
        };
      }
      
      // 检查是否是训练数据格式
      if (data.task_id && data.epoch && data.loss !== undefined) {
        return {
          type: 'training_data',
          data: {
            task_id: data.task_id,
            epoch: data.epoch,
            loss: data.loss,
            accuracy: data.accuracy,
            log_message: data.log_message,
            status: data.status
          },
          time: new Date().toISOString(),
          message: data.log_message || `Epoch ${data.epoch}: loss=${data.loss.toFixed(4)}`
        };
      }
    } catch (error) {
      // 忽略错误，继续处理
    }
    
    // fallback - 按普通日志处理
    return {
      type: 'log',
      time: new Date().toISOString(),
      message: raw
    };
  }

  // 处理WebSocket消息
  const handleWebSocketMessage = (data) => {
    const parsed = parseLogMessage(data);
    
    // 处理状态完成消息
    if (parsed.type === 'status_completed') {
      // 当接收到status消息时，向后端发送获取项目详情的请求
      fetchProjectData();
      return;
    }
    
    // 处理训练数据
    if (parsed.type === 'training_data') {
      setLatestEpoch(parsed.data.epoch);
      // 更新训练数据
      setTrainingData(prevData => {
        const existingIndex = prevData.findIndex(item => item.epoch === parsed.data.epoch);
        if (existingIndex >= 0) {
          // 如果已存在该epoch的数据，更新它
          const updatedData = [...prevData];
          updatedData[existingIndex] = parsed.data;
          return updatedData;
        } else {
          // 添加新的训练数据
          return [...prevData, parsed.data].sort((a, b) => a.epoch - b.epoch);
        }
      });
      
      // 更新当前步数（从epoch推断）
      // 假设每个epoch包含steps/epochs数量的步数
      const totalSteps = projectData?.hyperparameter?.steps || 0;
      const totalEpochs = projectData?.hyperparameter?.epochs || 1;
      const stepsPerEpoch = totalSteps / totalEpochs;
      const newStep = Math.floor(parsed.data.epoch * stepsPerEpoch);
      setCurrentStep(newStep);
      
      // 更新项目数据的当前epoch
      if (projectData && parsed.data.epoch > (projectData.currentEpoch || 0)) {
        setProjectData(prev => prev ? { ...prev, currentEpoch: parsed.data.epoch } : prev);
      }
    }
    
    // 处理日志消息
    const newLog = {
      id: Date.now() + Math.random(),
      time: parsed.time,
      level: 'info',
      message: parsed.message
    };
    
    setLogs(prevLogs => {
      const isDuplicate = prevLogs.some(log =>
        log.message === newLog.message &&
        log.time === newLog.time
      );
      if (isDuplicate) return prevLogs;
      const updatedLogs = [...prevLogs, newLog];
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
  };

  const handleBack = () => {
    navigate('/project-center');
  };

  const handleDownload = useCallback(async (e) => {
    if (e && e.stopPropagation) e.stopPropagation();
    if (downloading) return;
    setDownloading(true);
    try {
        // 【核心修改】
        // 调用API，现在它会返回一个包含 blob 和 filename 的对象
        const { blob, filename } = await trainTasksAPI.downloadModel(projectData.id);

        // 判断返回的是否是文件blob（如果API内部出错，这里会直接进catch块）
        if (blob && blob.size > 0) {
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = filename; // 使用从API获取的文件名
            document.body.appendChild(a);
            a.click();
            a.remove();
            window.URL.revokeObjectURL(url);
            message.success('模型文件下载成功');
        } else {
            // 虽然axios拦截器会处理大部分错误，但这里可以作为一个额外的保障
            throw new Error('下载失败：未收到有效的文件数据');
        }
    } catch (err) {
        // 现在这里的错误都是由axios拦截器或API函数本身抛出的真实错误
        message.error('下载失败: ' + (err.message || '未知错误'));
    } finally {
        setDownloading(false);
    }
}, [downloading, projectData?.id]);

  const handleDelete = async () => {
    if (!projectData?.id) return;
    try {
      await deleteTrainTask(projectData.id);
      message.success('删除成功');
      navigate('/project-center');
    } catch (err) {
      message.error(err.message || '删除失败');
    }
  };

  const handlePause = () => {
    message.info('暂停训练功能暂未实现');
  };

  const handleStop = () => {
    message.warning('停止训练功能暂未实现');
  };

  // 监听训练数据变化，动态更新进度
  useEffect(() => {
    if (!projectData || !projectData.hyperparameter?.steps) return;
    
    // 计算进度百分比
    let progress;
    if (projectData.status === 'completed') {
      // 如果项目已完成，使用原有的处理方式：epoch/steps × 100%
      progress = Math.min(100, (latestEpoch / projectData.hyperparameter.steps) * 100);
    } else {
      // 否则显示 epoch/steps × 95%
      progress = Math.min(95, (latestEpoch / projectData.hyperparameter.steps) * 95);
    }
    
    // 只在进度有变化时更新
    if (projectData.progress !== progress) {
      setProjectData(prev => prev ? { ...prev, progress } : prev);
    }
  }, [latestEpoch, projectData?.hyperparameter?.steps, projectData?.status]);

  // 在ProjectProgressPage组件内部，进度条状态逻辑
  const isCompleted = projectData?.status === 'completed';
  const stepBarStatus = isCompleted ? 'completed' : projectData?.status;

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
      {/* 页面标题部分 */}
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
          </div>
        </div>
        <div className={styles.headerActions}>
          <Button 
            icon={downloading ? <SyncOutlined spin /> : <DownloadOutlined />} 
            onClick={handleDownload}
            disabled={projectData?.status !== 'completed' || downloading}
            loading={downloading}
          >
            {downloading ? '下载中...' : '下载模型'}
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
      
      {/* --- 修改点：重构进度条部分的 JSX 结构 --- */}
      <div className={styles.progressBarSection}>
        <Card className={styles.progressCard} styles={{ body: { padding: '24px 32px' } }}>
          <div className={styles.progressContent}>
            <div className={styles.progressText}>
              <Title level={5} style={{ margin: 0, color: '#262626' }}>
                {isCompleted ? '训练已完成' :
                  projectData?.status === 'running' ? 
                    (latestEpoch < (projectData?.hyperparameter?.steps || 0) ? '训练进行中' :
                     latestEpoch === (projectData?.hyperparameter?.steps || 0) ? '模型上传中' :
                     '训练进行中') :
                  '等待训练'}
              </Title>
              <Text type="secondary">
                当前进度: {
                  projectData?.status === 'completed' 
                    ? (projectData?.hyperparameter?.steps
                        ? Math.round((latestEpoch / projectData.hyperparameter.steps) * 100)
                        : 0)
                    : projectData?.hyperparameter?.steps
                      ? Math.round((latestEpoch / projectData.hyperparameter.steps) * 95)
                      : 0
                }%
              </Text>
            </div>
            <div className={styles.progressBarWrapper} style={{ flexGrow: 1, minWidth: 240 }}>
              <StepProgressBar
                steps={projectData?.hyperparameter?.steps || 0}
                logFreq={projectData?.hyperparameter?.log_freq || 1}
                currentStep={latestEpoch}
                status={stepBarStatus}
              />
            </div>
          </div>
        </Card>
      </div>
      
      {/* 中部图表区 */}
      <div className={styles.chartsRow}>
        <Card title="Loss图表" className={styles.chartCard} styles={{ body: { paddingLeft: 8, paddingRight: 8, paddingTop: 16, paddingBottom: 8 } }}>
          <ReactECharts 
            option={getLossChartOption(trainingData)} 
            style={{ height: '300px' }}
          />
        </Card>
      </div>
      
      {/* 底部信息区 */}
      <div className={styles.bottomRow}>
        <Card 
          title={<Space><InfoCircleOutlined />训练日志<Badge count={logs.length} style={{ backgroundColor: '#52c41a' }} />{wsConnected ? (<Tag color="green" icon={<WifiOutlined />}>{projectData?.status === 'completed' ? '历史日志' : '实时连接'}</Tag>) : (<Tag color="orange" icon={<DisconnectOutlined />}>连接中...</Tag>)}</Space>} 
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
                      <div className={styles.logTime}>{formatLogTime(log.time)}</div>
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
        <div className={styles.rightInfoColumn}>
          <Card title="基本信息" className={styles.infoCard}>
            <Descriptions column={2} size="small">
              <Descriptions.Item label="任务ID">{projectData?.id}</Descriptions.Item>
              <Descriptions.Item label="模型类型">{projectData?.modelTypeName}</Descriptions.Item>
              <Descriptions.Item label="数据集">{projectData?.dataset_id ? `数据集 ${projectData.dataset_id}` : '未指定数据集'}</Descriptions.Item>
              <Descriptions.Item label="创建时间">{projectData?.create_time ? new Date(projectData.create_time).toLocaleString('zh-CN') : 'N/A'}</Descriptions.Item>
              <Descriptions.Item label="开始时间">{projectData?.start_time ? new Date(projectData.start_time).toLocaleString('zh-CN') : 'N/A'}</Descriptions.Item>
              <Descriptions.Item label="结束时间">{projectData?.end_time ? new Date(projectData.end_time).toLocaleString('zh-CN') : 'N/A'}</Descriptions.Item>
              <Descriptions.Item label="训练时长">{projectData?.duration}</Descriptions.Item>
            </Descriptions>
          </Card>
          <Card 
            title={<Space><SettingOutlined />超参数配置</Space>} 
            className={styles.hyperCard}
          >
            {projectData?.hyperparameter ? (
              <Descriptions column={2} size="small">
                {Object.entries(projectData.hyperparameter).map(([key, value]) => {
                  // 跳过policy参数，因为它与模型类型一致
                  if (key === 'policy') {
                    return null;
                  }
                  
                  let displayValue;
                  let displayLabel = key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
                  
                  // 特殊处理env参数
                  if (key === 'env') {
                    displayLabel = 'Environment';
                    if (typeof value === 'object' && value !== null && value.type) {
                      displayValue = value.type;
                    } else {
                      displayValue = String(value);
                    }
                  } else if (typeof value === 'number') {
                    displayValue = value.toLocaleString();
                  } else if (typeof value === 'object' && value !== null) {
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
                    <Descriptions.Item key={key} label={displayLabel}>
                      {displayValue}
                    </Descriptions.Item>
                  );
                }).filter(item => item !== null)}
              </Descriptions>
            ) : (
              <Text type="secondary">暂无超参数配置</Text>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
};

function formatLogTime(isoString) {
  const date = new Date(isoString);
  if (isNaN(date.getTime())) return isoString;
  return date.getFullYear() + '-' +
    String(date.getMonth() + 1).padStart(2, '0') + '-' +
    String(date.getDate()).padStart(2, '0') + ' ' +
    String(date.getHours()).padStart(2, '0') + ':' +
    String(date.getMinutes()).padStart(2, '0') + ':' +
    String(date.getSeconds()).padStart(2, '0');
}

export default ProjectProgressPage;