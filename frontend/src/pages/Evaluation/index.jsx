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
  RobotOutlined
} from '@ant-design/icons';
import styles from './Evaluation.module.css';
import { trainTasksAPI, evalTasksAPI } from '@/utils/api';

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
    // 添加更多可能的状态值
    'completed': { color: 'success', text: '已完成', icon: <CheckCircleOutlined /> },
    'running': { color: 'processing', text: '进行中', icon: <ClockCircleOutlined /> },
    'failed': { color: 'error', text: '失败', icon: <CloseCircleOutlined /> },
    'pending': { color: 'default', text: '等待中', icon: <ClockCircleOutlined /> },
    // 大写版本
    'COMPLETED': { color: 'success', text: '已完成', icon: <CheckCircleOutlined /> },
    'RUNNING': { color: 'processing', text: '进行中', icon: <ClockCircleOutlined /> },
    'FAILED': { color: 'error', text: '失败', icon: <CloseCircleOutlined /> },
    'PENDING': { color: 'default', text: '等待中', icon: <ClockCircleOutlined /> },
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
    
    // 获取评估任务列表
    fetchEvaluationTasks();
    
    // 默认选择"发起评估"项
    setIsEvaluationMode(true);
    setSelectedRecord(null);
    fetchCompletedTrainingProjects();
    
    // 设置定时器，每30秒刷新一次评估任务列表，确保状态及时更新
    const intervalId = setInterval(() => {
      fetchEvaluationTasks();
    }, 30000);
    
    window.addEventListener('resize', checkLayout);
    setTimeout(checkLayout, 0); // 首次渲染后测量一次
    return () => {
      window.removeEventListener('resize', checkLayout);
      clearInterval(intervalId);
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

  // 获取评估任务列表
  const fetchEvaluationTasks = async () => {
    try {
      setLoadingEvaluationTasks(true);
      const data = await evalTasksAPI.getMyTasks();
      
      // 转换后端数据为前端显示格式
      const evaluationRecords = data.map(task => {
        // 调试：打印每个任务的状态
        console.log(`评估任务 ${task.id} 的状态:`, task.status);
        
        return {
          id: `eval-${task.id}`,
          name: `评估任务 ${task.id}`,
          status: task.status,
          videoNames: task.video_names || [], // 保留视频名称列表用于详情页
          evalStage: task.eval_stage,
          trainTaskId: task.train_task_id,
          originalData: task
        };
      });
      
      setRecords(evaluationRecords);
      console.log('获取评估任务成功:', evaluationRecords);
    } catch (err) {
      console.error('获取评估任务失败:', err);
      message.error('获取评估任务失败: ' + err.message);
      setRecords([]);
    } finally {
      setLoadingEvaluationTasks(false);
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
      onOk: async () => {
        try {
          setDeletingEvaluation(true);
          
          const evalTaskId = selectedRecordDetails.id;
          console.log('正在删除评估任务:', evalTaskId);
          
          await evalTasksAPI.delete(evalTaskId);
          
          message.success('评估任务删除成功！');
          
          // 重新获取评估任务列表
          await fetchEvaluationTasks();
          
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
      
          // 重新获取评估任务列表
    await fetchEvaluationTasks();
    
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
          // 更新左侧列表中对应项目的状态，确保数据一致性
          setRecords(prevRecords =>
            prevRecords.map(item =>
              item.id === record.id
                ? { ...item, status: evalTaskDetail.status }
                : item
            )
          );
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
          // 更新左侧列表中对应项目的状态，确保数据一致性
          setRecords(prevRecords =>
            prevRecords.map(item =>
              item.id === record.id
                ? { ...item, status: evalTaskDetail.status }
                : item
            )
          );
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