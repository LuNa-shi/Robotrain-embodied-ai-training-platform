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
  Spin
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
import { trainTasksAPI } from '@/utils/api';

const { Title, Text, Paragraph } = Typography;

// 模拟测试记录数据
const mockEvaluationRecords = [
  {
    id: 'eval-20250625-001',
    name: '机器人视觉识别测试',
    model: 'GPT-4 Vision',
    dataset: '工业机器人视觉数据集',
    startTime: '2025-06-25 10:30',
    duration: '45m',
    status: 'completed',
    accuracy: '96.8%',
    precision: '94.2%',
    recall: '97.1%',
    f1Score: '95.6%',
    testCases: 1500,
    passedCases: 1452,
    failedCases: 48,
    videoUrl: 'https://example.com/video1.mp4',
    thumbnail: 'https://via.placeholder.com/300x200/1890ff/ffffff?text=视觉识别测试'
  },
  {
    id: 'eval-20250625-002',
    name: '机器人语音交互测试',
    model: 'Claude 3 Sonnet',
    dataset: '机器人语音指令数据集',
    startTime: '2025-06-25 14:00',
    duration: '进行中...',
    status: 'running',
    accuracy: 'N/A',
    precision: 'N/A',
    recall: 'N/A',
    f1Score: 'N/A',
    testCases: 2000,
    passedCases: 1250,
    failedCases: 0,
    videoUrl: 'https://example.com/video2.mp4',
    thumbnail: 'https://via.placeholder.com/300x200/52c41a/ffffff?text=语音交互测试'
  },
  {
    id: 'eval-20250624-005',
    name: '机器人动作控制测试',
    model: 'Whisper Large',
    dataset: '机器人动作指令数据集',
    startTime: '2025-06-24 09:00',
    duration: '1h 20m',
    status: 'failed',
    accuracy: '78.5%',
    precision: '75.2%',
    recall: '81.3%',
    f1Score: '78.1%',
    testCases: 800,
    passedCases: 628,
    failedCases: 172,
    videoUrl: 'https://example.com/video3.mp4',
    thumbnail: 'https://via.placeholder.com/300x200/ff4d4f/ffffff?text=动作控制测试'
  },
  {
    id: 'eval-20250623-003',
    name: '机器人路径规划测试',
    model: 'PathFinder Pro',
    dataset: '室内导航数据集',
    startTime: '2025-06-23 16:30',
    duration: '2h 15m',
    status: 'completed',
    accuracy: '92.3%',
    precision: '91.8%',
    recall: '92.7%',
    f1Score: '92.2%',
    testCases: 1200,
    passedCases: 1108,
    failedCases: 92,
    videoUrl: 'https://example.com/video4.mp4',
    thumbnail: 'https://via.placeholder.com/300x200/722ed1/ffffff?text=路径规划测试'
  },
  {
    id: 'eval-20250622-004',
    name: '机器人抓取测试',
    model: 'GraspNet',
    dataset: '物体抓取数据集',
    startTime: '2025-06-22 11:00',
    duration: '1h 45m',
    status: 'completed',
    accuracy: '88.7%',
    precision: '87.2%',
    recall: '89.1%',
    f1Score: '88.1%',
    testCases: 900,
    passedCases: 798,
    failedCases: 102,
    videoUrl: 'https://example.com/video5.mp4',
    thumbnail: 'https://via.placeholder.com/300x200/fa8c16/ffffff?text=抓取测试'
  }
];

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
  const [records, setRecords] = useState(mockEvaluationRecords);
  const [selectedRecord, setSelectedRecord] = useState(null);
  const [selectedRecordDetails, setSelectedRecordDetails] = useState(null);
  const [isMobile, setIsMobile] = useState(false);
  const mainLayoutRef = useRef(null);
  
  // 新增状态：评估模式相关
  const [isEvaluationMode, setIsEvaluationMode] = useState(false);
  const [trainingProjects, setTrainingProjects] = useState([]);
  const [selectedTrainingProject, setSelectedTrainingProject] = useState(null);
  const [loadingTrainingProjects, setLoadingTrainingProjects] = useState(false);

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
    // 默认选择"进行中"的测试项目
    const runningRecord = records.find(r => r.status === 'running');
    setSelectedRecord(runningRecord || records[0]);
    window.addEventListener('resize', checkLayout);
    setTimeout(checkLayout, 0); // 首次渲染后测量一次
    return () => window.removeEventListener('resize', checkLayout);
  }, [records]);

  // 获取已完成的训练项目
  const fetchCompletedTrainingProjects = async () => {
    try {
      setLoadingTrainingProjects(true);
      const data = await trainTasksAPI.getMyTasks();
      
      // 过滤出已完成的训练项目
      const completedProjects = data
        .filter(task => task.status === 'completed')
        .map(task => ({
          id: task.id.toString(),
          name: `训练项目 ${task.id}`,
          modelType: task.model_type,
          dataset: task.dataset_id ? `数据集 ${task.dataset_id}` : '未指定数据集',
          startTime: new Date(task.create_time).toLocaleString('zh-CN'),
          status: task.status,
          originalData: task
        }));
      
      setTrainingProjects(completedProjects);
      console.log('获取已完成训练项目成功:', completedProjects);
    } catch (err) {
      console.error('获取训练项目失败:', err);
      message.error('获取训练项目失败: ' + err.message);
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

    try {
      // 构建评估配置
      const evaluationConfig = {
        trained_project_id: selectedTrainingProject.id,
        trained_project_name: selectedTrainingProject.name,
        dataset: selectedTrainingProject.dataset,
        parameters: {
          testCases: 1000,
          timeout: 300,
          batchSize: 32,
          threshold: 0.8,
        },
        description: `机器人模型评估 - ${selectedTrainingProject.name}`,
      };
      
      console.log('评估配置:', evaluationConfig);
      
      // 模拟API调用
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // 生成评估ID（模拟后端返回）
      const evaluationId = `eval-${Date.now()}-${Math.floor(Math.random() * 1000).toString().padStart(3, '0')}`;
      
      message.success(`评估任务 ${evaluationId} 创建成功！`);
      
      // 退出评估模式，回到正常模式
      setIsEvaluationMode(false);
      setSelectedTrainingProject(null);
      
    } catch (error) {
      console.error('创建评估任务失败:', error);
      message.error('创建评估任务失败: ' + error.message);
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
      onClick={() => setSelectedTrainingProject(project)}
    >
      <div className={styles.projectItemContent}>
        <div className={styles.projectInfo}>
          <div className={styles.projectName}>{project.name}</div>
          <div className={styles.projectMeta}>
            <Text type="secondary">{project.dataset}</Text>
            <StatusDisplay status={project.status} />
          </div>
          <div className={styles.projectStats}>
            <Text type="secondary">开始时间: {project.startTime}</Text>
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
                  <span>选择训练项目进行评估</span>
                </div>
              }
              className={styles.videoCard}
              extra={
                <Button 
                  type="primary" 
                  icon={<ExperimentOutlined />}
                  disabled={!selectedTrainingProject}
                  onClick={handleStartEvaluation}
                >
                  发起评估
                </Button>
              }
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
              <div className={styles.projectListHorizontal}>
                {renderAddProjectItem()}
                {records.map(renderProjectItemHorizontal)}
              </div>
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
              <List
                dataSource={[{ id: 'add-evaluation' }, ...records]}
                renderItem={(item) => 
                  item.id === 'add-evaluation' 
                    ? renderAddProjectItem() 
                    : renderProjectItem(item)
                }
                className={styles.projectList}
              />
            </Card>
          </div>
          <RightPanelContent />
        </div>
      )}

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