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
      onClick={() => {
        setSelectedRecord(record);
        // 当选择其他项目时，退出评估模式
        if (isEvaluationMode) {
          setIsEvaluationMode(false);
          setSelectedTrainingProject(null);
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
      onClick={() => {
        setSelectedRecord(record);
        // 当选择其他项目时，退出评估模式
        if (isEvaluationMode) {
          setIsEvaluationMode(false);
          setSelectedTrainingProject(null);
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
        {selectedRecord ? (
          <div className={styles.videoContent}>
            <Card 
              title={
                <div className={styles.videoTitle}>
                  <VideoCameraOutlined />
                  <span>{selectedRecord.name}</span>
                  <StatusDisplay status={selectedRecord.status} />
                </div>
              }
              className={styles.videoCard}
              extra={
                <Button 
                  type="primary" 
                  icon={<DownloadOutlined />}
                  onClick={() => message.info('下载视频功能待实现')}
                >
                  下载视频
                </Button>
              }
            >
              <div className={styles.videoContainer}>
                <video 
                  key={selectedRecord.videoUrl} // Use key to force re-render on source change
                  controls 
                  autoPlay
                  muted
                  className={styles.videoPlayer}
                  poster={selectedRecord.thumbnail}
                >
                  <source src={selectedRecord.videoUrl} type="video/mp4" />
                  您的浏览器不支持视频播放。
                </video>
              </div>
            </Card>
          </div>
        ) : (
          <div className={styles.noSelection}>
            <Card className={styles.emptyCard}>
              <div className={styles.emptyContent}>
                <VideoCameraOutlined className={styles.emptyIcon} />
                <Title level={3}>请选择测试项目</Title>
                <Text type="secondary">从列表中选择一个测试项目来查看评估视频</Text>
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

      {/* 测试详情弹窗 */}
      <Modal
        title={
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <BarChartOutlined style={{ color: '#1677ff' }} />
            <span>测试详情</span>
          </div>
        }
        open={!!selectedRecordDetails}
        onCancel={() => setSelectedRecordDetails(null)}
        footer={[
          <Button key="close" onClick={() => setSelectedRecordDetails(null)}>
            关闭
          </Button>,
          <Button key="download" type="primary" icon={<DownloadOutlined />}>
            下载报告
          </Button>
        ]}
        width={800}
        className="evaluation-modal"
      >
        {selectedRecordDetails && (
          <div>
            <Descriptions title="基本信息" bordered column={2}>
              <Descriptions.Item label="测试ID">{selectedRecordDetails.id}</Descriptions.Item>
              <Descriptions.Item label="测试名称">{selectedRecordDetails.name}</Descriptions.Item>
              <Descriptions.Item label="模型">{selectedRecordDetails.modelType}</Descriptions.Item>
              <Descriptions.Item label="数据集">{selectedRecordDetails.dataset}</Descriptions.Item>
              <Descriptions.Item label="开始时间">{selectedRecordDetails.startTime}</Descriptions.Item>
              <Descriptions.Item label="持续时间">{selectedRecordDetails.duration}</Descriptions.Item>
              <Descriptions.Item label="状态">
                <StatusDisplay status={selectedRecordDetails.status} />
              </Descriptions.Item>
              <Descriptions.Item label="测试用例数">{selectedRecordDetails.testCases}</Descriptions.Item>
            </Descriptions>

            <Divider />

            <Descriptions title="性能指标" bordered column={2}>
              <Descriptions.Item label="准确率">{selectedRecordDetails.accuracy}</Descriptions.Item>
              <Descriptions.Item label="精确率">{selectedRecordDetails.precision}</Descriptions.Item>
              <Descriptions.Item label="召回率">{selectedRecordDetails.recall}</Descriptions.Item>
              <Descriptions.Item label="F1分数">{selectedRecordDetails.f1Score}</Descriptions.Item>
            </Descriptions>

            <Divider />

            <div>
              <Text strong>测试用例统计</Text>
              <Row gutter={16} style={{ marginTop: 16 }}>
                <Col span={8}>
                  <Card size="small">
                    <Statistic
                      title="总用例"
                      value={selectedRecordDetails.testCases}
                      valueStyle={{ color: '#1890ff' }}
                    />
                  </Card>
                </Col>
                <Col span={8}>
                  <Card size="small">
                    <Statistic
                      title="通过"
                      value={selectedRecordDetails.passedCases}
                      valueStyle={{ color: '#3f8600' }}
                    />
                  </Card>
                </Col>
                <Col span={8}>
                  <Card size="small">
                    <Statistic
                      title="失败"
                      value={selectedRecordDetails.failedCases}
                      valueStyle={{ color: '#cf1322' }}
                    />
                  </Card>
                </Col>
              </Row>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};

export default EvaluationPage; 