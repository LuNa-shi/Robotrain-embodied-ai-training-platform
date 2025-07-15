import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  Typography, 
  Card, 
  Button, 
  Space, 
  Table, 
  Tag, 
  Modal, 
  Row, 
  Col, 
  message, 
  Tooltip,
  Dropdown,
  Divider,
  Statistic,
  Descriptions,
  List,
  Avatar,
  Badge,
  Spin,
  Radio
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
  const statusMap = {
    completed: { color: 'success', text: '已完成', icon: <CheckCircleOutlined /> },
    running: { color: 'processing', text: '进行中', icon: <ClockCircleOutlined /> },
    failed: { color: 'error', text: '失败', icon: <CloseCircleOutlined /> },
    pending: { color: 'default', text: '等待中', icon: <ClockCircleOutlined /> },
  };
  const { color, text, icon } = statusMap[status] || { color: 'default', text: '未知', icon: <ClockCircleOutlined /> };
  return <Tag icon={icon} color={color}>{text}</Tag>;
};

const EvaluationPage = () => {
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
    
    window.addEventListener('resize', checkLayout);
    setTimeout(checkLayout, 0); // 首次渲染后测量一次
    return () => window.removeEventListener('resize', checkLayout);
  }, []);

  // 获取评估任务列表
  const fetchEvaluationTasks = async () => {
    try {
      setLoadingEvaluationTasks(true);
      const data = await evalTasksAPI.getMyTasks();
      
      // 转换后端数据为前端显示格式
      const evaluationRecords = data.map(task => ({
        id: `eval-${task.id}`,
        name: `评估任务 ${task.id}`,
        modelType: '待获取', // 这里需要根据train_task_id获取训练任务信息
        dataset: '待获取', // 这里需要根据train_task_id获取数据集信息
        startTime: new Date(task.create_time).toLocaleString('zh-CN'),
        duration: task.end_time ? 
          `${Math.round((new Date(task.end_time) - new Date(task.start_time)) / 60000)}m` : 
          '进行中...',
        status: task.status,
        accuracy: 'N/A', // 评估结果需要从其他地方获取
        precision: 'N/A',
        recall: 'N/A',
        f1Score: 'N/A',
        testCases: 0, // 这些信息需要从评估结果中获取
        passedCases: 0,
        failedCases: 0,
        videoUrl: 'https://example.com/video1.mp4', // 模拟视频URL
        thumbnail: 'https://via.placeholder.com/300x200/1890ff/ffffff?text=评估任务',
        evalStage: task.eval_stage,
        trainTaskId: task.train_task_id,
        originalData: task
      }));
      
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
          // 获取训练任务详情
          if (evalTaskDetail.train_task_id) {
            await fetchTrainTaskDetail(evalTaskDetail.train_task_id);
          }
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
            <Text type="secondary">{record.modelType}</Text>
            <StatusDisplay status={record.status} />
          </div>
          <div className={styles.projectStats}>
            <Text type="secondary">准确率: {record.accuracy}</Text>
            <Text type="secondary">• {record.testCases} 用例</Text>
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
          // 获取训练任务详情
          if (evalTaskDetail.train_task_id) {
            await fetchTrainTaskDetail(evalTaskDetail.train_task_id);
          }
        } catch (error) {
          console.error('获取评估任务详情失败:', error);
          message.error('获取评估任务详情失败: ' + error.message);
        }
      }}
    >
      <div className={styles.projectName}>{record.name}</div>
      <div className={styles.projectMeta}>
        <Text type="secondary">{record.modelType}</Text>
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
                <div style={{ marginBottom: 24, paddingTop: 16, paddingBottom: 16, borderBottom: '1px solid #f0f0f0' }}>
                  <Row gutter={0}>
                    <Col span={6} style={{ display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
                      <div style={{ textAlign: 'center', width: '100%' }}>
                        <Text type="secondary">训练项目</Text>
                        <div style={{ marginTop: 4 }}>
                          <Text strong>{selectedTrainTask ? `训练项目 ${selectedTrainTask.id}` : '加载中...'}</Text>
                        </div>
                      </div>
                    </Col>
                    <Col span={6} style={{ display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
                      <div style={{ textAlign: 'center', width: '100%' }}>
                        <Text type="secondary">创建时间</Text>
                        <div style={{ marginTop: 4 }}>
                          <Text>{selectedRecordDetails.create_time ? new Date(selectedRecordDetails.create_time).toLocaleString('zh-CN') : '-'}</Text>
                        </div>
                      </div>
                    </Col>
                    <Col span={6} style={{ display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
                      <div style={{ textAlign: 'center', width: '100%' }}>
                        <Text type="secondary">开始时间</Text>
                        <div style={{ marginTop: 4 }}>
                          <Text>{selectedRecordDetails.start_time ? new Date(selectedRecordDetails.start_time).toLocaleString('zh-CN') : '-'}</Text>
                        </div>
                      </div>
                    </Col>
                    <Col span={6} style={{ display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
                      <div style={{ textAlign: 'center', width: '100%' }}>
                        <Text type="secondary">结束时间</Text>
                        <div style={{ marginTop: 4 }}>
                          <Text>{selectedRecordDetails.end_time ? new Date(selectedRecordDetails.end_time).toLocaleString('zh-CN') : '-'}</Text>
                        </div>
                      </div>
                    </Col>
                  </Row>
                </div>
                
                {/* 仿真和视频展示区域 */}
                <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {selectedRecordDetails.status === 'completed' ? (
                    <div style={{ textAlign: 'center', color: '#999' }}>
                      {/* 这里将来可以放仿真和视频内容 */}
                      <Text type="secondary">仿真与视频功能开发中，敬请期待！</Text>
                    </div>
                  ) : (
                    <div style={{ textAlign: 'center', color: '#999' }}>
                      <Text type="secondary">当前状态（{selectedRecordDetails.status}）暂不支持显示仿真和视频。</Text>
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
                  <Badge count={records.length} style={{ backgroundColor: '#52c41a' }} />
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
                  <Badge count={records.length} style={{ backgroundColor: '#52c41a' }} />
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