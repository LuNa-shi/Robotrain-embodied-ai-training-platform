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
      const lossMatch = log.message.match(/loss[:\s]*([\d.]+)/i) || 
                       log.message.match(/损失[:\s]*([\d.]+)/i) ||
                       log.message.match(/Loss[:\s]*([\d.]+)/i) ||
                       log.message.match(/Loss = ([\d.]+)/i);
      return lossMatch ? parseFloat(lossMatch[1]) : null;
    })
    .filter(val => val !== null);
  if (lossData.length === 0) {
    return {
      xAxis: { type: 'category', data: [] },
      yAxis: { type: 'value' },
      series: [{ data: [], type: 'line' }],
    };
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

// 新增：生成随机accuracy值的函数
const generateRandomAccuracy = (epochNumber) => {
  // accuracy随epoch递增，趋近于1
  const baseAcc = 0.6 + 0.4 * (epochNumber / 20); // 20轮后趋近于1
  const noise = (Math.random() - 0.5) * 0.04; // 小幅波动
  let acc = baseAcc + noise;
  if (acc > 0.995) acc = 0.995;
  if (acc < 0.6) acc = 0.6;
  return parseFloat(acc.toFixed(4));
};

// 新增：accuracy图表option生成函数
const getAccuracyChartOption = (logs) => {
  let accuracyData = logs
    .filter(log => log.message.includes('Accuracy ='))
    .map(log => {
      const accMatch = log.message.match(/Accuracy = ([\d.]+)/i);
      return accMatch ? parseFloat(accMatch[1]) : null;
    })
    .filter(val => val !== null);
  if (accuracyData.length === 0) {
    return {
      xAxis: { type: 'category', data: [] },
      yAxis: { type: 'value' },
      series: [{ data: [], type: 'line' }],
    };
  }
  return {
    tooltip: {
      trigger: 'axis',
      formatter: function(params) {
        return `轮次 ${params[0].axisValue}<br/>Accuracy: ${params[0].value}`;
      }
    },
    xAxis: {
      type: 'category',
      data: Array.from({length: accuracyData.length}, (_, i) => i + 1),
      name: '训练轮次',
      nameLocation: 'middle',
      nameGap: 32,
    },
    yAxis: {
      type: 'value',
      name: 'Accuracy',
      nameLocation: 'middle',
      nameRotate: 90,
      nameGap: 40,
      min: 0,
      max: 1,
      interval: 0.1
    },
    series: [{
      data: accuracyData,
      type: 'line',
      smooth: true,
      color: '#40a9ff',
      lineStyle: { width: 2 },
      areaStyle: {
        color: {
          type: 'linear', x: 0, y: 0, x2: 0, y2: 1,
          colorStops: [
            { offset: 0, color: 'rgba(64, 169, 255, 0.3)' },
            { offset: 1, color: 'rgba(64, 169, 255, 0.1)' }
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
const StepProgressBar = ({ total, current, status }) => {
  const finishedColor = status === 'completed' ? '#52c41a' : '#1890ff';
  const unfinishedColor = '#e0e0e0';
  const nodeRadius = 6;
  const barHeight = 4;
  const width = 1500;
  const barEdge = barHeight / 2;
  const barLength = width - 2 * barEdge;
  const step = total > 1 ? barLength / (total - 1) : 0;

  // 动画：线条x2
  const [animatedX2, setAnimatedX2] = React.useState(barEdge);
  const targetX2 = barEdge + step * Math.max(0, current - 1);
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

  // 只渲染中间节点（去掉两端）
  const nodeCount = total;
  const nodes = Array.from({ length: nodeCount - 2 }, (_, i) => {
    const idx = i + 1;
    if (status === 'completed') return { state: 'done', idx };
    if (idx < current) return { state: 'done', idx };
    return { state: 'todo', idx };
  });

  return (
    <svg width="100%" height={nodeRadius * 2 + 16} viewBox={`0 0 ${width} ${nodeRadius * 2 + 16}`} style={{ minWidth: 240, maxWidth: 1500, width: '100%' }}>
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
        stroke={status === 'completed' ? finishedColor : finishedColor}
        strokeWidth={barHeight}
        strokeLinecap="butt"
      />
      {/* 中间节点（不含两端） */}
      {nodes.map(({ state, idx }, i) => {
        const cx = barEdge + idx * step;
        const cy = nodeRadius + 8;
        // 只有当线条动画推进到该节点位置后，节点才变色
        const reached = animatedX2 >= cx - 0.1; // 容差防止浮点误差
        const fill = reached ? finishedColor : '#fff';
        const stroke = reached ? finishedColor : unfinishedColor;
        return (
          <circle
            key={i}
            cx={cx}
            cy={cy}
            r={nodeRadius}
            fill={fill}
            stroke={stroke}
            strokeWidth={3}
            style={{ transition: 'fill 0.2s, stroke 0.2s' }}
          />
        );
      })}
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
  const [wsConnected, setWsConnected] = useState(false);
  const [wsStatus, setWsStatus] = useState('disconnected');
  const [downloading, setDownloading] = useState(false);
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

  // 在 handleWebSocketMessage 及日志处理相关处，添加如下解析函数：
  function parseLogMessage(raw) {
    // 匹配前缀的 ISO 时间戳
    const match = raw.match(/^([0-9T:\-\.\+:]+) - (.+)$/);
    if (match) {
      return {
        time: match[1],
        message: match[2]
      };
    }
    // fallback
    return {
      time: new Date().toISOString(),
      message: raw
    };
  }

  // 修改 handleWebSocketMessage，使用 parseLogMessage 解析日志
  const handleWebSocketMessage = (data) => {
    const parsed = parseLogMessage(data);
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
      const blob = await trainTasksAPI.downloadModel(projectData.id);
      if (!(blob instanceof Blob)) {
        throw new Error('下载接口未返回文件流');
      }
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `model_task_${projectData.id}.zip`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
      message.success('模型文件下载成功');
    } catch (err) {
      message.error('下载失败: ' + (err.message || '未知错误'));
    } finally {
      setDownloading(false);
    }
  }, [downloading, projectData?.id]);

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

  // 新增：监听logs变化，动态更新进度
  useEffect(() => {
    if (!projectData || !projectData.totalEpochs) return;
    // 统计Loss日志数量作为当前epoch
    const currentEpoch = logs.filter(log => log.message.includes('Epoch') && log.message.includes('Loss =')).length;
    // 计算进度百分比
    const progress = Math.min(100, (currentEpoch / projectData.totalEpochs) * 100);
    // 只在进度有变化时更新
    if (projectData.currentEpoch !== currentEpoch || projectData.progress !== progress) {
      setProjectData(prev => prev ? { ...prev, currentEpoch, progress } : prev);
    }
  }, [logs, projectData?.totalEpochs]);

  // 在ProjectProgressPage组件内部，进度条和轮次显示强制逻辑
  const isCompleted = projectData?.status === 'completed';
  const displayEpoch = isCompleted ? projectData?.totalEpochs : (projectData?.currentEpoch || 0);
  const stepBarCurrent = isCompleted ? projectData?.totalEpochs : displayEpoch;
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
            <Paragraph className={styles.headerSubtitle}>
              模型类型: {projectData?.modelTypeName} | 创建时间: {projectData?.create_time ? new Date(projectData.create_time).toLocaleString('zh-CN') : 'N/A'}
            </Paragraph>
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
                  projectData?.status === 'running' ? '训练进行中' :
                  '等待训练'}
              </Title>
              <Text type="secondary">
                当前轮次: {displayEpoch} / {projectData?.totalEpochs || 0}
              </Text>
            </div>
            <div className={styles.progressBarWrapper} style={{ flexGrow: 1, minWidth: 240 }}>
              <StepProgressBar
                total={projectData?.totalEpochs || 1}
                current={stepBarCurrent}
                status={stepBarStatus}
              />
            </div>
          </div>
        </Card>
      </div>
      
      {/* 中部图表区 */}
      <div className={styles.chartsRow}>
        <Card title="accuracy图表" className={styles.chartCard} styles={{ body: { paddingLeft: 8, paddingRight: 8, paddingTop: 16, paddingBottom: 8 } }}>
          <ReactECharts 
            option={getAccuracyChartOption(logs)} 
            style={{ height: '300px' }}
          />
        </Card>
        <Card title="Loss图表" className={styles.chartCard} styles={{ body: { paddingLeft: 8, paddingRight: 8, paddingTop: 16, paddingBottom: 8 } }}>
          <ReactECharts 
            option={getLossChartOption(logs)} 
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