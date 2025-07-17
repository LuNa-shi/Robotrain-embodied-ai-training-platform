import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  App,
  Typography, 
  Card, 
  Button, 
  Space, 
  Table, 
  Tag, 
  Modal,
  Row, 
  Col, 
  Tooltip,
  Dropdown,
  Divider,
  Statistic,
  Descriptions,
  List,
  Avatar,
  Badge,
  Spin,
  Radio,
  Select
} from 'antd';
import {
  DownloadOutlined,
  DeleteOutlined,
  MoreOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  ClockCircleOutlined,
  BarChartOutlined,
  FileTextOutlined,
  ExperimentOutlined,
  PlayCircleOutlined,
  VideoCameraOutlined,
  EyeOutlined,
  PlusOutlined,
  RobotOutlined,
  WifiOutlined,
  DisconnectOutlined
} from '@ant-design/icons';
import styles from './Evaluation.module.css';
import { trainTasksAPI, evalTasksAPI } from '@/utils/api';
import evaluationStatusWebSocket, { EvaluationStatusWebSocket } from '@/utils/evalWebSocket';

const { Title, Text, Paragraph } = Typography;

// 模型类型ID到名称的映射
const getModelTypeName = (modelTypeId) => {
  const modelTypeMap = {
    1: 'ACT',
    2: 'Diffusion'
  };
  return modelTypeMap[modelTypeId] || '未知模型类型';
};



// 根据状态返回不同的Tag和Icon
const StatusDisplay = ({ status }) => {
  // 调试：打印接收到的状态值
  console.log('StatusDisplay 接收到的状态:', status, '类型:', typeof status);
  
  // 标准化状态值（转换为小写）
  const normalizedStatus = typeof status === 'string' ? status.toLowerCase() : status;
  
  const statusMap = {
    completed: { color: 'success', text: '已完成', icon: <CheckCircleOutlined /> },
    running: { color: 'processing', text: '进行中', icon: <ClockCircleOutlined /> },
    failed: { color: 'error', text: '失败', icon: <CloseCircleOutlined /> },
    pending: { color: 'default', text: '等待中', icon: <ClockCircleOutlined /> },
  };
  
  const { color, text, icon } = statusMap[normalizedStatus] || statusMap[status] || { 
    color: 'default', 
    text: `未知状态(${status})`, 
    icon: <ClockCircleOutlined /> 
  };
  
  return <Tag icon={icon} color={color}>{text}</Tag>;
};

const EvaluationPage = () => {
  const { message, modal } = App.useApp();
  const navigate = useNavigate();
  const [records, setRecords] = useState([]);
  const [selectedRecord, setSelectedRecord] = useState(null);
  const [selectedRecordDetails, setSelectedRecordDetails] = useState(null);
  const [isMobile, setIsMobile] = useState(false);
  const mainLayoutRef = useRef(null);
  
  // 新增状态：评估模式相关
  const [isEvaluationMode, setIsEvaluationMode] = useState(false);
  const [trainingProjects, setTrainingProjects] = useState([]);
  const [selectedTrainingProject, setSelectedTrainingProject] = useState(null);
  const [loadingTrainingProjects, setLoadingTrainingProjects] = useState(false);
  
  // 评估任务相关状态
  const [loadingEvaluationTasks, setLoadingEvaluationTasks] = useState(false);
  const [selectedEvalStage, setSelectedEvalStage] = useState(null);
  const [creatingEvaluation, setCreatingEvaluation] = useState(false);
  const [evaluationModalVisible, setEvaluationModalVisible] = useState(false);
  const [selectedTrainTask, setSelectedTrainTask] = useState(null);
  
  // 视频播放相关状态
  const [currentVideoBlob, setCurrentVideoBlob] = useState(null);
  const [currentVideoName, setCurrentVideoName] = useState(null);
  const [loadingVideo, setLoadingVideo] = useState(false);
  const [loadingVideoName, setLoadingVideoName] = useState(null); // 记录正在加载的视频名称
  const [currentVideoIndex, setCurrentVideoIndex] = useState(0); // 当前选中的视频索引
  const [downloadingVideo, setDownloadingVideo] = useState(false); // 下载状态
  const [currentVideoUrl, setCurrentVideoUrl] = useState(null); // 当前视频的Blob URL
  
  // 删除评估任务相关状态
  const [deletingEvaluation, setDeletingEvaluation] = useState(false); // 删除状态

  // WebSocket状态管理
  const [websocketStatus, setWebsocketStatus] = useState('Disconnected');
  const [websocketMessage, setWebsocketMessage] = useState('');
  const [websocketError, setWebsocketError] = useState(null);

  // 保存上一次的数据快照，用于智能对比
  const previousRecordsRef = useRef([]);
  const selectedRecordIdRef = useRef(null);
  const updateCountRef = useRef(0); // 记录更新次数，用于调试
  
  // 管理多个WebSocket连接
  const activeWebSocketsRef = useRef(new Map()); // 存储活跃的WebSocket连接
  
  // 调试函数：输出当前WebSocket连接状态
  const debugWebSocketConnections = () => {
    const activeWebSockets = activeWebSocketsRef.current;
    console.log('🔌 [DEBUG] === WebSocket连接状态调试报告 ===');
    console.log('🔌 [DEBUG] 当前活跃连接数:', activeWebSockets.size);
    
    if (activeWebSockets.size > 0) {
      console.log('🔌 [DEBUG] 活跃连接详情:');
      activeWebSockets.forEach((ws, taskId) => {
        console.log(`  - 评估任务 ${taskId}:`, {
          连接状态: ws.getStatus(),
          是否连接: ws.isConnected(),
          WebSocket实例: ws
        });
      });
    } else {
      console.log('🔌 [DEBUG] 当前没有活跃的WebSocket连接');
    }
    
    // 输出records中的状态信息
    console.log('🔌 [DEBUG] 当前评估任务状态:');
    records.forEach(record => {
      const evalTaskId = record.id.replace('eval-', '');
      const hasWebSocket = activeWebSockets.has(parseInt(evalTaskId));
      console.log(`  - ${record.name}: ${record.status} ${hasWebSocket ? '(有WebSocket连接)' : '(无WebSocket连接)'}`);
    });
    
    console.log('🔌 [DEBUG] === 调试报告结束 ===');
  };
  
  // 将调试函数暴露到全局，方便在控制台调用
  useEffect(() => {
    window.debugWebSocketConnections = debugWebSocketConnections;
    return () => {
      delete window.debugWebSocketConnections;
    };
  }, [records]);

  useEffect(() => {
    const leftPanelWidth = 260;
    const layoutGap = 24;
    const minWidthForDesktopLayout = leftPanelWidth + (leftPanelWidth * 2.5) + layoutGap;
    const checkLayout = () => {
      if (window.innerWidth < minWidthForDesktopLayout) {
        setIsMobile(true);
      } else {
        setIsMobile(false);
      }
    };
    
    // 获取评估任务列表并建立WebSocket连接
    fetchEvaluationTasksAndSetupWebSockets();
    
    // 默认选择"发起评估"项
    setIsEvaluationMode(true);
    setSelectedRecord(null);
    fetchCompletedTrainingProjects();
    
    window.addEventListener('resize', checkLayout);
    setTimeout(checkLayout, 0); // 首次渲染后测量一次
    return () => {
      window.removeEventListener('resize', checkLayout);
      // 组件卸载时断开所有WebSocket连接
      disconnectAllWebSockets();
    };
  }, []);

  // 清理Blob URL的useEffect
  useEffect(() => {
    return () => {
      // 组件卸载时清理Blob URL
      if (currentVideoUrl) {
        URL.revokeObjectURL(currentVideoUrl);
      }
    };
  }, [currentVideoUrl]);

  // 智能对比两个记录数组，找出变化的部分
  const compareRecords = (oldRecords, newRecords) => {
    const changes = {
      added: [],
      updated: [],
      removed: [],
      unchanged: []
    };

    // 创建ID映射，便于快速查找
    const oldMap = new Map(oldRecords.map(record => [record.id, record]));
    const newMap = new Map(newRecords.map(record => [record.id, record]));

    // 检查新增的记录
    for (const newRecord of newRecords) {
      if (!oldMap.has(newRecord.id)) {
        changes.added.push(newRecord);
      }
    }

    // 检查删除的记录
    for (const oldRecord of oldRecords) {
      if (!newMap.has(oldRecord.id)) {
        changes.removed.push(oldRecord);
      }
    }

    // 检查更新的记录
    for (const newRecord of newRecords) {
      const oldRecord = oldMap.get(newRecord.id);
      if (oldRecord) {
        // 比较关键字段是否发生变化
        const hasChanged = 
          oldRecord.status !== newRecord.status ||
          oldRecord.videoNames.length !== newRecord.videoNames.length ||
          oldRecord.evalStage !== newRecord.evalStage ||
          oldRecord.trainTaskId !== newRecord.trainTaskId;
        
        if (hasChanged) {
          changes.updated.push({ old: oldRecord, new: newRecord });
        } else {
          changes.unchanged.push(newRecord);
        }
      }
    }

    return changes;
  };

  // 断开所有WebSocket连接
  const disconnectAllWebSockets = () => {
    const activeWebSockets = activeWebSocketsRef.current;
    activeWebSockets.forEach((ws, evalTaskId) => {
      console.log(`断开评估任务 ${evalTaskId} 的WebSocket连接`);
      ws.disconnect();
    });
    activeWebSockets.clear();
  };

  // 为单个评估任务建立WebSocket连接
  const setupWebSocketForTask = (evalTaskId) => {
    const activeWebSockets = activeWebSocketsRef.current;
    
    // 如果已经存在连接，先断开
    if (activeWebSockets.has(evalTaskId)) {
      console.log(`评估任务 ${evalTaskId} 的WebSocket连接已存在，先断开`);
      activeWebSockets.get(evalTaskId).disconnect();
      activeWebSockets.delete(evalTaskId);
    }
    
    // 创建新的WebSocket连接
    const ws = new EvaluationStatusWebSocket();
    ws.connect(evalTaskId);
    
    // 设置消息处理
    ws.onMessage(async (wsMessage) => {
      try {
        const data = JSON.parse(wsMessage);
        console.log(`收到评估任务 ${evalTaskId} 的WebSocket消息:`, data);
        
        // 直接获取最新详情，不比较状态
        try {
          const updatedEvalTaskDetail = await evalTasksAPI.getById(evalTaskId);
          console.log(`评估任务 ${evalTaskId} 获取最新详情:`, updatedEvalTaskDetail);
          
          // 更新records中的状态
          setRecords(prevRecords => {
            const updatedRecords = prevRecords.map(item => {
              const itemId = item.id.replace('eval-', '');
              if (itemId === evalTaskId.toString()) {
                return { ...item, status: updatedEvalTaskDetail.status };
              }
              return item;
            });

            const isCurrentSelectedTask = selectedRecordIdRef.current === `eval-${evalTaskId}`;
            
            // 检查当前选中的项目
            console.log(`🔍 [DEBUG] 检查是否需要更新右侧详情:`, {
              selectedRecordId: selectedRecordIdRef.current, // 使用 ref 的当前值
              evalTaskId: evalTaskId,
              selectedRecordIdType: typeof selectedRecord?.id,
              evalTaskIdType: typeof evalTaskId,
              isCurrentSelectedTask: selectedRecord?.id === `eval-${evalTaskId}`
            });
            
            // 检查是否是当前选中的项目（通过selectedRecord判断）
            
            if (isCurrentSelectedTask) {
              console.log(`✅ [DEBUG] 是当前选中的项目，更新右侧详情`);
              // 使用setTimeout确保在下一个事件循环中更新，避免状态更新冲突
              setTimeout(() => {
                setSelectedRecordDetails(updatedEvalTaskDetail);
              }, 0);
            } else {
              console.log(`❌ [DEBUG] 不是当前选中的项目，不更新右侧详情`);
            }
            
            return updatedRecords;
          });
          
          // 如果状态已完成或失败，断开WebSocket连接
          if (updatedEvalTaskDetail.status === 'completed' || updatedEvalTaskDetail.status === 'failed') {
            console.log(`评估任务 ${evalTaskId} 状态为 ${updatedEvalTaskDetail.status}，断开WebSocket连接`);
            ws.disconnect();
            activeWebSockets.delete(evalTaskId);
            
            if (updatedEvalTaskDetail.status === 'completed') {
              message.success(`评估任务 ${evalTaskId} 已完成！`);
            } else {
              message.error(`评估任务 ${evalTaskId} 失败！`);
            }
          } else {
            console.log(`评估任务 ${evalTaskId} 状态为 ${updatedEvalTaskDetail.status}，继续保持WebSocket连接`);
          }
        } catch (error) {
          console.error(`获取评估任务 ${evalTaskId} 详情失败:`, error);
          message.error(`获取评估任务详情失败: ${error.message}`);
        }
      } catch (e) {
        console.error(`解析评估任务 ${evalTaskId} 的WebSocket消息失败:`, e);
        message.error('WebSocket消息解析失败');
      }
    });
    
    ws.onOpen(() => {
      console.log(`评估任务 ${evalTaskId} 的WebSocket连接成功`);
    });
    
    ws.onClose(() => {
      console.log(`🔌 [DEBUG] 评估任务 ${evalTaskId} 的WebSocket连接关闭`);
      activeWebSockets.delete(evalTaskId);
      console.log(`🔌 [DEBUG] 连接关闭后，当前活跃连接数: ${activeWebSockets.size}`);
    });
    
    ws.onError((error) => {
      console.error(`评估任务 ${evalTaskId} 的WebSocket连接错误:`, error);
      activeWebSockets.delete(evalTaskId);
    });
    
    // 保存连接
    activeWebSockets.set(evalTaskId, ws);
    console.log(`🔌 [DEBUG] 为评估任务 ${evalTaskId} 建立WebSocket连接`);
    console.log(`🔌 [DEBUG] 当前活跃连接数: ${activeWebSockets.size}`);
    
    // 输出当前所有活跃连接
    console.log('🔌 [DEBUG] 当前所有活跃WebSocket连接:');
    activeWebSockets.forEach((ws, taskId) => {
      console.log(`  - 评估任务 ${taskId}: ${ws.getStatus()}`);
    });
  };

  // 获取评估任务列表并建立WebSocket连接
  const fetchEvaluationTasksAndSetupWebSockets = async () => {
    try {
      setLoadingEvaluationTasks(true);
      
      const data = await evalTasksAPI.getMyTasks();
      
      // 转换后端数据为前端显示格式
      const evaluationRecords = data.map(task => {
        return {
          id: `eval-${task.id}`,
          name: `评估任务 ${task.id}`,
          status: task.status,
          videoNames: task.video_names || [],
          evalStage: task.eval_stage,
          trainTaskId: task.train_task_id,
          originalData: task
        };
      });

      setRecords(evaluationRecords);
      previousRecordsRef.current = evaluationRecords;
      console.log('首次加载评估任务:', evaluationRecords.length, '个任务');
      
      // 记录需要建立WebSocket连接的任务
      const tasksToConnect = [];
      
      // 为pending和running状态的任务建立WebSocket连接
      evaluationRecords.forEach(record => {
        const evalTaskId = record.id.replace('eval-', '');
        if (record.status === 'pending' || record.status === 'running') {
          tasksToConnect.push({
            id: evalTaskId,
            name: record.name,
            status: record.status
          });
          setupWebSocketForTask(parseInt(evalTaskId));
        }
      });
      
      // 延迟输出WebSocket连接状态，确保连接建立完成
      setTimeout(() => {
        const activeWebSockets = activeWebSocketsRef.current;
        console.log('🔌 [DEBUG] WebSocket连接状态报告:');
        console.log('🔌 [DEBUG] 需要建立连接的任务:', tasksToConnect);
        console.log('🔌 [DEBUG] 当前活跃的WebSocket连接数量:', activeWebSockets.size);
        
        if (activeWebSockets.size > 0) {
          console.log('🔌 [DEBUG] 已建立的WebSocket连接详情:');
          activeWebSockets.forEach((ws, taskId) => {
            console.log(`  - 评估任务 ${taskId}:`, {
              连接状态: ws.getStatus(),
              是否连接: ws.isConnected(),
              WebSocket实例: ws
            });
          });
        } else {
          console.log('🔌 [DEBUG] 当前没有活跃的WebSocket连接');
        }
        
        // 输出所有评估任务的状态分布
        const statusDistribution = {};
        evaluationRecords.forEach(record => {
          const status = record.status;
          statusDistribution[status] = (statusDistribution[status] || 0) + 1;
        });
        console.log('🔌 [DEBUG] 评估任务状态分布:', statusDistribution);
        
      }, 2000); // 延迟2秒，确保WebSocket连接建立完成
      
    } catch (err) {
      console.error('获取评估任务失败:', err);
      message.error('获取评估任务失败: ' + err.message);
      setRecords([]);
    } finally {
      setLoadingEvaluationTasks(false);
    }
  };

  // 获取评估任务列表（智能更新版本）
  const fetchEvaluationTasks = async (showLoading = true) => {
    try {
      // 只有在需要显示加载状态时才设置loading
      if (showLoading) {
        setLoadingEvaluationTasks(true);
      }
      
      const data = await evalTasksAPI.getMyTasks();
      
      // 转换后端数据为前端显示格式
      const evaluationRecords = data.map(task => {
        return {
          id: `eval-${task.id}`,
          name: `评估任务 ${task.id}`,
          status: task.status,
          videoNames: task.video_names || [],
          evalStage: task.eval_stage,
          trainTaskId: task.train_task_id,
          originalData: task
        };
      });

      // 获取上一次的数据快照
      const previousRecords = previousRecordsRef.current;
      
      // 如果是第一次加载或者没有之前的数据，直接设置
      if (previousRecords.length === 0) {
        setRecords(evaluationRecords);
        previousRecordsRef.current = evaluationRecords;
        console.log('首次加载评估任务:', evaluationRecords.length, '个任务');
        return;
      }

      // 智能对比数据变化
      const changes = compareRecords(previousRecords, evaluationRecords);
      
      // 记录更新统计
      updateCountRef.current++;
      console.log(`第${updateCountRef.current}次智能更新:`, {
        新增: changes.added.length,
        更新: changes.updated.length,
        删除: changes.removed.length,
        不变: changes.unchanged.length
      });

      // 只有当有变化时才更新状态
      if (changes.added.length > 0 || changes.updated.length > 0 || changes.removed.length > 0) {
        setRecords(evaluationRecords);
        previousRecordsRef.current = evaluationRecords;
        
        // 如果有状态变化，给出提示
        const statusChanges = changes.updated.filter(change => 
          change.old.status !== change.new.status
        );
        
        if (statusChanges.length > 0) {
          statusChanges.forEach(change => {
            console.log(`评估任务 ${change.new.name} 状态从 ${change.old.status} 变为 ${change.new.status}`);
          });
        }
      } else {
        console.log('数据无变化，跳过更新');
      }
      
    } catch (err) {
      console.error('获取评估任务失败:', err);
      message.error('获取评估任务失败: ' + err.message);
      setRecords([]);
    } finally {
      // 只有在之前设置了loading时才清除loading
      if (showLoading) {
        setLoadingEvaluationTasks(false);
      }
    }
  };

  // 获取训练任务详情
  const fetchTrainTaskDetail = async (trainTaskId) => {
    try {
      const trainTaskDetail = await trainTasksAPI.getById(trainTaskId);
      setSelectedTrainTask(trainTaskDetail);
      return trainTaskDetail;
    } catch (error) {
      console.error('获取训练任务详情失败:', error);
      message.error('获取训练任务详情失败: ' + error.message);
      return null;
    }
  };

  // 获取已完成的训练项目
  const fetchCompletedTrainingProjects = async () => {
    try {
      setLoadingTrainingProjects(true);
      const data = await trainTasksAPI.getCompletedTasks();
      
      // 直接使用后端返回的已完成训练项目数据
      const completedProjects = data.map(task => ({
        id: task.id.toString(),
        name: `训练项目 ${task.id}`,
        modelType: task.model_type_id ? getModelTypeName(task.model_type_id) : '未指定模型类型',
        startTime: new Date(task.create_time).toLocaleString('zh-CN'),
        endTime: task.end_time ? new Date(task.end_time).toLocaleString('zh-CN') : '未完成',
        status: task.status,
        hyperparameter: task.hyperparameter,
        logsUuid: task.logs_uuid,
        originalData: task
      }));
      
      setTrainingProjects(completedProjects);
      console.log('获取已完成训练项目成功:', completedProjects);
    } catch (err) {
      console.error('获取已完成训练项目失败:', err);
      message.error('获取已完成训练项目失败: ' + err.message);
      setTrainingProjects([]);
    } finally {
      setLoadingTrainingProjects(false);
    }
  };

  // 处理视频播放
  const handlePlayVideo = async (videoName) => {
    if (!selectedRecordDetails) {
      message.error('评估任务详情未加载');
      return;
    }

    try {
      setLoadingVideo(true);
      setLoadingVideoName(videoName);
      setCurrentVideoName(videoName);
      
      // 更新当前视频索引
      const videoIndex = selectedRecordDetails.video_names?.findIndex(name => name === videoName);
      if (videoIndex !== -1) {
        setCurrentVideoIndex(videoIndex);
      }
      
      // 获取视频文件
      const evalTaskId = selectedRecordDetails.id;
      console.log('正在获取视频:', { evalTaskId, videoName });
      
      const videoBlob = await evalTasksAPI.getVideo(evalTaskId, videoName);
      console.log('获取到视频文件:', videoBlob);
      
      setCurrentVideoBlob(videoBlob);
      // 创建Blob URL
      const blobUrl = URL.createObjectURL(videoBlob);
      setCurrentVideoUrl(blobUrl);
    } catch (error) {
      console.error('获取视频失败:', error);
      message.error('获取视频失败: ' + error.message);
    } finally {
      setLoadingVideo(false);
      setLoadingVideoName(null);
    }
  };

  // 处理视频下载
  const handleDownloadVideo = async () => {
    if (!currentVideoName || !selectedRecordDetails) {
      message.error('请先选择要下载的视频');
      return;
    }

    try {
      setDownloadingVideo(true);
      
      const evalTaskId = selectedRecordDetails.id;
      console.log('正在下载视频:', { evalTaskId, videoName: currentVideoName });
      
      const { blob, filename } = await evalTasksAPI.downloadVideo(evalTaskId, currentVideoName);
      
      // 创建下载链接
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
      
      message.success(`视频 ${filename} 下载成功！`);
    } catch (error) {
      console.error('下载视频失败:', error);
      message.error('下载视频失败: ' + error.message);
    } finally {
      setDownloadingVideo(false);
    }
  };

  // 处理删除评估任务
  const handleDeleteEvaluation = () => {
    if (!selectedRecordDetails) {
      message.error('评估任务详情未加载');
      return;
    }

    modal.confirm({
      title: '确认删除',
      content: '删除后数据无法恢复，确定要删除该评估任务吗？',
      okText: '删除',
      okType: 'danger',
      cancelText: '取消',
      centered: true,
      onOk: async () => {
        try {
          setDeletingEvaluation(true);
          
          const evalTaskId = selectedRecordDetails.id;
          console.log('正在删除评估任务:', evalTaskId);
          
          await evalTasksAPI.delete(evalTaskId);
          
          message.success('评估任务删除成功！');
          
          // 重新获取评估任务列表并建立WebSocket连接
          await fetchEvaluationTasksAndSetupWebSockets();
          
          // 重置选中状态
          setSelectedRecord(null);
          setSelectedRecordDetails(null);
          setSelectedTrainTask(null);
          setCurrentVideoName(null);
          setCurrentVideoBlob(null);
          setCurrentVideoUrl(null);
          
          // 自动切换到"发起评估"模式
          setIsEvaluationMode(true);
          fetchCompletedTrainingProjects();
          
        } catch (error) {
          console.error('删除评估任务失败:', error);
          message.error('删除评估任务失败: ' + error.message);
        } finally {
          setDeletingEvaluation(false);
        }
      },
    });
  };

  // 处理发起评估
  const handleStartEvaluation = async () => {
    if (!selectedTrainingProject) {
      message.warning('请先选择一个训练项目');
      return;
    }

    if (!selectedEvalStage) {
      message.warning('请选择评估阶段');
      return;
    }

    try {
      setCreatingEvaluation(true);
      
      // 构建评估任务创建请求
      const evalTaskData = {
        train_task_id: parseInt(selectedTrainingProject.id),
        eval_stage: selectedEvalStage
      };
      
      console.log('创建评估任务:', evalTaskData);
      
      // 调用后端API创建评估任务
      const createdTask = await evalTasksAPI.create(evalTaskData);
      
      message.success(`评估任务 ${createdTask.id} 创建成功！`);
      
          // 重新获取评估任务列表并建立WebSocket连接
    await fetchEvaluationTasksAndSetupWebSockets();
    
    // 关闭弹窗并重置状态
    setEvaluationModalVisible(false);
    setSelectedTrainingProject(null);
    setSelectedEvalStage(null);
      
    } catch (error) {
      console.error('创建评估任务失败:', error);
      message.error('创建评估任务失败: ' + error.message);
    } finally {
      setCreatingEvaluation(false);
    }
  };

  // 处理菜单项点击
  const handleMenuClick = ({ key }, record) => {
    switch (key) {
      case 'details':
        setSelectedRecordDetails(record);
        break;
      case 'download':
        message.info('下载测试报告功能待实现');
        break;
      case 'delete':
        message.info('删除测试记录功能待实现');
        break;
      default:
        break;
    }
  };

  const getMenuItems = (record) => [
    { key: 'details', label: '查看详情', icon: <FileTextOutlined /> },
    { key: 'download', label: '下载报告', icon: <DownloadOutlined /> },
    { type: 'divider' },
    { key: 'delete', label: '删除记录', danger: true, icon: <DeleteOutlined /> },
  ];

  // 项目选择列表项渲染 (Vertical for Desktop)
  const renderProjectItem = (record) => (
    <List.Item
      key={record.id}
      className={`${styles.projectItem} ${selectedRecord?.id === record.id ? styles.selectedProject : ''}`}
      onClick={async () => {
        setSelectedRecord(record);
        selectedRecordIdRef.current = record.id;
        // 当选择其他项目时，退出评估模式
        if (isEvaluationMode) {
          setIsEvaluationMode(false);
          setSelectedTrainingProject(null);
        }
        
        // 获取评估任务详情
        try {
          const evalTaskId = record.id.replace('eval-', '');
          const evalTaskDetail = await evalTasksAPI.getById(evalTaskId);
          setSelectedRecordDetails(evalTaskDetail);
          
          // 获取训练任务详情
          if (evalTaskDetail.train_task_id) {
            await fetchTrainTaskDetail(evalTaskDetail.train_task_id);
          }
          
          // 重置视频相关状态，不自动播放任何视频
          setCurrentVideoIndex(0);
          setCurrentVideoName(null);
          setCurrentVideoBlob(null);
          setCurrentVideoUrl(null);
        } catch (error) {
          console.error('获取评估任务详情失败:', error);
          message.error('获取评估任务详情失败: ' + error.message);
        }
      }}
    >
      <div className={styles.projectItemContent}>
        <div className={styles.projectInfo}>
          <div className={styles.projectName}>{record.name}</div>
          <div className={styles.projectMeta}>
            <StatusDisplay status={record.status} />
          </div>
        </div>
      </div>
    </List.Item>
  );

  // 项目选择列表项渲染 (Horizontal for Mobile)
  const renderProjectItemHorizontal = (record) => (
    <div
      key={record.id}
      className={`${styles.projectItemHorizontal} ${selectedRecord?.id === record.id ? styles.selectedProjectHorizontal : ''}`}
      onClick={async () => {
        setSelectedRecord(record);
        selectedRecordIdRef.current = record.id;
        // 当选择其他项目时，退出评估模式
        if (isEvaluationMode) {
          setIsEvaluationMode(false);
          setSelectedTrainingProject(null);
        }
        
        // 获取评估任务详情
        try {
          const evalTaskId = record.id.replace('eval-', '');
          const evalTaskDetail = await evalTasksAPI.getById(evalTaskId);
          setSelectedRecordDetails(evalTaskDetail);
          
          // 获取训练任务详情
          if (evalTaskDetail.train_task_id) {
            await fetchTrainTaskDetail(evalTaskDetail.train_task_id);
          }
          
          // 重置视频相关状态，不自动播放任何视频
          setCurrentVideoIndex(0);
          setCurrentVideoName(null);
          setCurrentVideoBlob(null);
          setCurrentVideoUrl(null);
        } catch (error) {
          console.error('获取评估任务详情失败:', error);
          message.error('获取评估任务详情失败: ' + error.message);
        }
      }}
    >
      <div className={styles.projectName}>{record.name}</div>
      <div className={styles.projectMeta}>
        <StatusDisplay status={record.status} />
      </div>
    </div>
  );

  // 训练项目选择项渲染
  const renderTrainingProjectItem = (project) => (
    <List.Item
      key={project.id}
      className={`${styles.projectItem} ${selectedTrainingProject?.id === project.id ? styles.selectedProject : ''}`}
      onClick={() => {
        setSelectedTrainingProject(project);
        setEvaluationModalVisible(true);
        setSelectedEvalStage(null); // 重置评估阶段选择
      }}
    >
      <div className={styles.projectItemContent}>
        <div className={styles.projectInfo}>
          <div className={styles.projectName}>{project.name}</div>
          <div className={styles.projectMeta}>
            <Text type="secondary">{project.modelType}</Text>
          </div>
          <div className={styles.projectStats}>
            <Text type="secondary">完成时间: {project.endTime}</Text>
          </div>
        </div>
      </div>
    </List.Item>
  );

  // 加号项目项渲染
  const renderAddProjectItem = () => (
    <List.Item
      key="add-evaluation"
      className={`${styles.projectItem} ${isEvaluationMode ? styles.selectedProject : ''}`}
      onClick={() => {
        setIsEvaluationMode(true);
        setSelectedRecord(null);
        selectedRecordIdRef.current = null;
        fetchCompletedTrainingProjects();
      }}
    >
      <div className={styles.projectItemContent}>
        <div className={styles.projectInfo}>
          <div className={styles.projectName}>
            <PlusOutlined style={{ marginRight: 8 }} />
            发起评估
          </div>
          <div className={styles.projectMeta}>
            <Text type="secondary">选择训练项目进行评估</Text>
          </div>
        </div>
      </div>
    </List.Item>
  );
  
  // Reusable component for the right panel content to avoid duplication
  const RightPanelContent = () => {
    if (isEvaluationMode) {
      return (
        <div className={styles.rightPanel}>
          <div className={styles.videoContent}>
            <Card 
              title={
                <div className={styles.videoTitle}>
                  <RobotOutlined />
                  <span>选择已完成的训练项目进行评估</span>
                </div>
              }
              className={styles.videoCard}
            >
              {loadingTrainingProjects ? (
                <div className={styles.loadingContainer}>
                  <Spin size="large" />
                  <Text>加载训练项目中...</Text>
                </div>
              ) : trainingProjects.length === 0 ? (
                <div className={styles.emptyContent}>
                  <RobotOutlined className={styles.emptyIcon} />
                  <Title level={3}>暂无已完成的训练项目</Title>
                  <Text type="secondary">请先完成一个训练项目，然后才能发起评估</Text>
                  <Button 
                    type="primary" 
                    onClick={() => navigate('/training')}
                    style={{ marginTop: 16 }}
                  >
                    开始训练
                  </Button>
                </div>
              ) : (
                <div className={styles.trainingProjectsList}>
                  <List
                    dataSource={trainingProjects}
                    renderItem={renderTrainingProjectItem}
                    className={styles.projectList}
                  />
                </div>
              )}
            </Card>
          </div>
        </div>
      );
    }

    return (
      <div className={styles.rightPanel}>
        {selectedRecord && selectedRecordDetails ? (
          <div className={styles.videoContent}>
            <Card className={styles.videoCard}>
              <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
                {/* 基本信息作为标题部分 */}
                <div style={{ flexShrink: 0, marginBottom: 16, paddingTop: 12, paddingBottom: 12, borderBottom: '1px solid #f0f0f0' }}>
                  <Row gutter={0}>
                    <Col span={4} style={{ display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
                      <div style={{ textAlign: 'center', width: '100%' }}>
                        <Text type="secondary" style={{ fontSize: '12px' }}>训练项目</Text>
                        <div style={{ marginTop: 2 }}>
                          <Text strong style={{ fontSize: '13px' }}>{selectedTrainTask ? `训练项目 ${selectedTrainTask.id}` : '加载中...'}</Text>
                        </div>
                      </div>
                    </Col>
                    <Col span={4} style={{ display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
                      <div style={{ textAlign: 'center', width: '100%' }}>
                        <Text type="secondary" style={{ fontSize: '12px' }}>创建时间</Text>
                        <div style={{ marginTop: 2 }}>
                          <Text style={{ fontSize: '12px' }}>{selectedRecordDetails.create_time ? new Date(selectedRecordDetails.create_time).toLocaleString('zh-CN') : '-'}</Text>
                        </div>
                      </div>
                    </Col>
                    <Col span={4} style={{ display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
                      <div style={{ textAlign: 'center', width: '100%' }}>
                        <Text type="secondary" style={{ fontSize: '12px' }}>开始时间</Text>
                        <div style={{ marginTop: 2 }}>
                          <Text style={{ fontSize: '12px' }}>{selectedRecordDetails.start_time ? new Date(selectedRecordDetails.start_time).toLocaleString('zh-CN') : '-'}</Text>
                        </div>
                      </div>
                    </Col>
                    <Col span={4} style={{ display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
                      <div style={{ textAlign: 'center', width: '100%' }}>
                        <Text type="secondary" style={{ fontSize: '12px' }}>结束时间</Text>
                        <div style={{ marginTop: 2 }}>
                          <Text style={{ fontSize: '12px' }}>{selectedRecordDetails.end_time ? new Date(selectedRecordDetails.end_time).toLocaleString('zh-CN') : '-'}</Text>
                        </div>
                      </div>
                    </Col>
                    <Col span={4} style={{ display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
                      <div style={{ textAlign: 'center', width: '100%' }}>
                        <Text type="secondary" style={{ fontSize: '12px' }}>视频数量</Text>
                        <div style={{ marginTop: 2 }}>
                          <Text strong style={{ fontSize: '13px' }}>{selectedRecordDetails.video_names ? selectedRecordDetails.video_names.length : 0}</Text>
                        </div>
                      </div>
                    </Col>
                    <Col span={4} style={{ display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
                      <div style={{ textAlign: 'center', width: '100%' }}>
                        <Text type="secondary" style={{ fontSize: '12px' }}>评估阶段</Text>
                        <div style={{ marginTop: 2 }}>
                          <Text strong style={{ fontSize: '13px' }}>{selectedRecordDetails.eval_stage || '-'}</Text>
                        </div>
                      </div>
                    </Col>
                  </Row>
                </div>
                
                {/* 仿真和视频展示区域 */}
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: '16px', minHeight: 0, overflow: 'hidden' }}>
                  {selectedRecordDetails.status === 'completed' ? (
                    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
                      {/* 视频播放器和选择器 */}
                      {selectedRecordDetails.video_names && selectedRecordDetails.video_names.length > 0 ? (
                        <div style={{ height: '100%', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
                          {/* 视频选择器 */}
                          <div style={{ flexShrink: 0, marginBottom: 16, paddingBottom: 16, borderBottom: '1px solid #f0f0f0' }}>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                              <Title level={4} style={{ margin: 0 }}>
                                <VideoCameraOutlined style={{ marginRight: 8 }} />
                                评估视频 ({selectedRecordDetails.video_names.length} 个)
                              </Title>
                              <div style={{ display: 'flex', gap: 8 }}>
                                <Dropdown
                                  menu={{
                                    items: selectedRecordDetails.video_names.map((videoName, index) => ({
                                      key: index,
                                      label: videoName,
                                      onClick: () => {
                                        setCurrentVideoIndex(index);
                                        handlePlayVideo(videoName);
                                      }
                                    }))
                                  }}
                                  placement="bottomRight"
                                >
                                  <Button
                                    icon={<VideoCameraOutlined />}
                                    size="middle"
                                    style={{ minWidth: '100px' }}
                                  >
                                    选择视频
                                  </Button>
                                </Dropdown>
                                <Button
                                  type="primary"
                                  icon={<DownloadOutlined />}
                                  onClick={handleDownloadVideo}
                                  loading={downloadingVideo}
                                  disabled={!currentVideoName}
                                  title="下载当前视频"
                                  size="middle"
                                  style={{ minWidth: '100px' }}
                                >
                                  下载视频
                                </Button>
                                <Button
                                  danger
                                  icon={<DeleteOutlined />}
                                  onClick={handleDeleteEvaluation}
                                  loading={deletingEvaluation}
                                  title="删除评估任务"
                                  size="middle"
                                  style={{ minWidth: '100px' }}
                                >
                                  删除
                                </Button>
                              </div>
                            </div>
                          </div>
                          
                          {/* 视频播放器 */}
                          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 0, overflow: 'hidden', marginTop: 8 }}>
                            {loadingVideo ? (
                              <div style={{ textAlign: 'center', padding: '20px' }}>
                                <Spin size="large" />
                                <div style={{ marginTop: '12px' }}>
                                  <Text>正在加载视频...</Text>
                                </div>
                              </div>
                            ) : currentVideoUrl ? (
                              <div style={{ textAlign: 'center', width: '100%', height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                                <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 0, width: '100%' }}>
                                  <video
                                    data-testid="video-player"
                                    controls
                                    style={{ 
                                      maxWidth: '100%', 
                                      maxHeight: '100%',
                                      width: 'auto',
                                      height: 'auto',
                                      borderRadius: '8px',
                                      boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
                                      objectFit: 'contain'
                                    }}
                                    onError={(e) => {
                                      console.error('视频播放错误:', e);
                                      message.error('视频播放失败，请检查视频文件或网络连接');
                                      setCurrentVideoBlob(null);
                                      setCurrentVideoUrl(null);
                                    }}
                                    onLoadStart={() => {
                                      console.log('开始加载视频:', currentVideoName);
                                    }}
                                    onCanPlay={() => {
                                      console.log('视频可以播放:', currentVideoName);
                                    }}
                                  >
                                    <source src={currentVideoUrl} type="video/mp4" />
                                    您的浏览器不支持视频播放。
                                  </video>
                                </div>
                                <div style={{ flexShrink: 0, marginTop: '8px' }}>
                                  <Text type="secondary">当前播放: {currentVideoName}</Text>
                                </div>
                              </div>
                            ) : (
                              <div style={{ textAlign: 'center', color: '#999', width: '100%' }}>
                                <VideoCameraOutlined style={{ fontSize: '48px', marginBottom: '16px' }} />
                                <div>
                                  <Text type="secondary" style={{ fontSize: '18px' }}>请选择一个视频进行查看</Text>
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      ) : (
                        <div style={{ height: '100%', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
                          {/* 删除按钮 */}
                          <div style={{ flexShrink: 0, marginBottom: 16, paddingBottom: 16, borderBottom: '1px solid #f0f0f0' }}>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                              <Title level={4} style={{ margin: 0 }}>
                                <VideoCameraOutlined style={{ marginRight: 8 }} />
                                评估视频 (0 个)
                              </Title>
                              <div style={{ display: 'flex', gap: 8 }}>
                                <Button
                                  danger
                                  icon={<DeleteOutlined />}
                                  onClick={handleDeleteEvaluation}
                                  loading={deletingEvaluation}
                                  title="删除评估任务"
                                  size="middle"
                                  style={{ minWidth: '100px' }}
                                >
                                  删除
                                </Button>
                              </div>
                            </div>
                          </div>
                          
                          {/* 提示信息 */}
                          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 0, overflow: 'hidden', marginTop: 8 }}>
                            <div style={{ textAlign: 'center', color: '#999', width: '100%' }}>
                              <VideoCameraOutlined style={{ fontSize: '48px', marginBottom: '16px' }} />
                              <div>
                                <Text type="secondary">暂无评估视频</Text>
                                <br />
                                <Text type="secondary">该评估任务暂未生成视频文件</Text>
                              </div>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
                      {/* 删除按钮 */}
                      <div style={{ flexShrink: 0, marginBottom: 16, paddingBottom: 16, borderBottom: '1px solid #f0f0f0' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                          <Title level={4} style={{ margin: 0 }}>
                            <ClockCircleOutlined style={{ marginRight: 8 }} />
                            评估状态
                          </Title>
                          <div style={{ display: 'flex', gap: 8 }}>
                            <Button
                              danger
                              icon={<DeleteOutlined />}
                              onClick={handleDeleteEvaluation}
                              loading={deletingEvaluation}
                              title="删除评估任务"
                              size="middle"
                              style={{ minWidth: '100px' }}
                            >
                              删除
                            </Button>
                          </div>
                        </div>
                      </div>
                      
                      {/* 提示信息 */}
                      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 0, overflow: 'hidden', marginTop: 8 }}>
                        <div style={{ textAlign: 'center', color: '#999', width: '100%' }}>
                          <ClockCircleOutlined style={{ fontSize: '48px', marginBottom: '16px' }} />
                          <div>
                            <Text type="secondary">当前状态（{selectedRecordDetails.status}）暂不支持显示仿真和视频。</Text>
                            <br />
                            <Text type="secondary">请等待评估任务完成后查看视频结果</Text>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </Card>
          </div>
        ) : (
          <div className={styles.noSelection}>
            <Card className={styles.emptyCard}>
              <div className={styles.emptyContent}>
                <VideoCameraOutlined className={styles.emptyIcon} />
                <Title level={3}>请选择评估项目</Title>
                <Text type="secondary">从列表中选择一个评估项目来查看详情</Text>
              </div>
            </Card>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className={styles.evaluationPage}>
      <div className={styles.pageHeader}>
        <Title level={1} className={styles.pageTitle}>模型评估</Title>
        <Text type="secondary">查看机器人模型的性能评估和仿真测试结果</Text>
      </div>

      {isMobile ? (
        <>
          <div className={styles.topPanel}>
            <Card
              size="small"
              title={
                <div className={styles.panelTitle}>
                  <ExperimentOutlined />
                  <span>测试项目</span>
                  <Badge count={records.length} style={{ backgroundColor: '#52c41a', borderRadius: '50%' }} />
                </div>
              }
              className={styles.projectPanel}
              bodyStyle={{ padding: '12px' }}
            >
              {loadingEvaluationTasks ? (
                <div className={styles.loadingContainer}>
                  <Spin size="large" />
                  <Text>加载评估任务中...</Text>
                </div>
              ) : (
                <div className={styles.projectListHorizontal}>
                  {renderAddProjectItem()}
                  {records.map(renderProjectItemHorizontal)}
                </div>
              )}
            </Card>
          </div>
          <RightPanelContent />
        </>
      ) : (
        <div className={styles.mainLayout} ref={mainLayoutRef}>
          <div className={styles.leftPanel}>
            <Card
              title={
                <div className={styles.panelTitle}>
                  <ExperimentOutlined />
                  <span>测试项目</span>
                  <Badge count={records.length} style={{ backgroundColor: '#52c41a', borderRadius: '50%' }} />
                </div>
              }
              className={styles.projectPanel}
            >
              {loadingEvaluationTasks ? (
                <div className={styles.loadingContainer}>
                  <Spin size="large" />
                  <Text>加载评估任务中...</Text>
                </div>
              ) : (
                <List
                  dataSource={[{ id: 'add-evaluation' }, ...records]}
                  renderItem={(item) => 
                    item.id === 'add-evaluation' 
                      ? renderAddProjectItem() 
                      : renderProjectItem(item)
                  }
                  className={styles.projectList}
                />
              )}
            </Card>
          </div>
          <RightPanelContent />
        </div>
      )}

      {/* 评估阶段选择弹窗 */}
      <Modal
        title={
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <ExperimentOutlined style={{ color: '#1677ff' }} />
            <span>选择评估阶段</span>
          </div>
        }
        open={evaluationModalVisible}
        onCancel={() => {
          setEvaluationModalVisible(false);
          setSelectedTrainingProject(null);
          setSelectedEvalStage(null);
        }}
        footer={[
          <Button 
            key="cancel" 
            onClick={() => {
              setEvaluationModalVisible(false);
              setSelectedTrainingProject(null);
              setSelectedEvalStage(null);
            }}
          >
            取消
          </Button>,
          <Button 
            key="start" 
            type="primary" 
            loading={creatingEvaluation}
            disabled={!selectedEvalStage || creatingEvaluation}
            onClick={handleStartEvaluation}
            style={{ backgroundColor: '#1677ff', borderColor: '#1677ff' }}
          >
            发起评估
          </Button>
        ]}
        width={500}
        centered
      >
        {selectedTrainingProject && (
          <div>
            <div style={{ marginBottom: 24 }}>
              <Text strong>已选择训练项目：</Text>
              <div style={{ marginTop: 8, padding: 12, backgroundColor: '#f5f5f5', borderRadius: 6 }}>
                <Text>{selectedTrainingProject.name}</Text>
                <br />
                <Text type="secondary">{selectedTrainingProject.modelType}</Text>
              </div>
            </div>
            
            <div>
              <Text strong style={{ display: 'block', marginBottom: 16 }}>
                请选择评估阶段：
              </Text>
              <Radio.Group 
                value={selectedEvalStage} 
                onChange={(e) => setSelectedEvalStage(e.target.value)}
                style={{ width: '100%' }}
              >
                <Row gutter={[16, 16]}>
                  <Col span={12}>
                    <Radio.Button 
                      value={1} 
                      style={{ 
                        width: '100%', 
                        textAlign: 'center',
                        backgroundColor: selectedEvalStage === 1 ? '#e6f7ff' : '#ffffff',
                        borderColor: selectedEvalStage === 1 ? '#1677ff' : '#d9d9d9',
                        color: selectedEvalStage === 1 ? '#1677ff' : '#000000'
                      }}
                    >
                      25% 训练进度
                    </Radio.Button>
                  </Col>
                  <Col span={12}>
                    <Radio.Button 
                      value={2} 
                      style={{ 
                        width: '100%', 
                        textAlign: 'center',
                        backgroundColor: selectedEvalStage === 2 ? '#e6f7ff' : '#ffffff',
                        borderColor: selectedEvalStage === 2 ? '#1677ff' : '#d9d9d9',
                        color: selectedEvalStage === 2 ? '#1677ff' : '#000000'
                      }}
                    >
                      50% 训练进度
                    </Radio.Button>
                  </Col>
                  <Col span={12}>
                    <Radio.Button 
                      value={3} 
                      style={{ 
                        width: '100%', 
                        textAlign: 'center',
                        backgroundColor: selectedEvalStage === 3 ? '#e6f7ff' : '#ffffff',
                        borderColor: selectedEvalStage === 3 ? '#1677ff' : '#d9d9d9',
                        color: selectedEvalStage === 3 ? '#1677ff' : '#000000'
                      }}
                    >
                      75% 训练进度
                    </Radio.Button>
                  </Col>
                  <Col span={12}>
                    <Radio.Button 
                      value={4} 
                      style={{ 
                        width: '100%', 
                        textAlign: 'center',
                        backgroundColor: selectedEvalStage === 4 ? '#e6f7ff' : '#ffffff',
                        borderColor: selectedEvalStage === 4 ? '#1677ff' : '#d9d9d9',
                        color: selectedEvalStage === 4 ? '#1677ff' : '#000000'
                      }}
                    >
                      100% 训练进度
                    </Radio.Button>
                  </Col>
                </Row>
              </Radio.Group>
            </div>
          </div>
        )}
      </Modal>




    </div>
  );
};

export default EvaluationPage; 