import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  Typography, 
  Card, 
  Button, 
  Space, 
  message, 
  Spin,
  Modal,
  Form,
  Select,
  InputNumber,
  Input,
  Divider,
  Row,
  Col,
  Alert,
  Steps,
  Descriptions,
  Tag
} from 'antd';
import {
  PlayCircleOutlined,
  RobotOutlined,
  DatabaseOutlined,
  SettingOutlined,
  CheckCircleOutlined,
  LoadingOutlined,
  InfoCircleOutlined,
  ExperimentOutlined,
  BarChartOutlined
} from '@ant-design/icons';
import styles from './EvaluationCreate.module.css';
import VerticalTimeline from './VerticalTimeline';

const { Title, Text, Paragraph } = Typography;
const { Option } = Select;
const { TextArea } = Input;
const { Step } = Steps;

// 已训练好的项目（模型）
const availableTrainedProjects = [
  {
    id: 'train-20250625-001',
    value: 'train-20250625-001',
    name: '机器人视觉识别模型',
    description: '基于工业机器人视觉数据集训练的视觉识别模型，用于目标检测和抓取定位',
    dataset: '工业机器人视觉数据集',
    accuracy: '98.5%',
    status: 'completed',
    modelType: 'vision-recognition',
    trainingTime: '2h 15m',
    completedAt: '2025-06-25 12:45'
  },
  {
    id: 'train-20250624-003',
    value: 'train-20250624-003',
    name: '机械臂动作控制模型',
    description: '基于机械臂动作控制数据训练的运动控制模型，用于精确轨迹规划和关节控制',
    dataset: '机械臂动作控制数据',
    accuracy: '96.2%',
    status: 'completed',
    modelType: 'motion-control',
    trainingTime: '1h 45m',
    completedAt: '2025-06-24 16:30'
  },
  {
    id: 'train-20250623-007',
    value: 'train-20250623-007',
    name: '机器人语音交互模型',
    description: '基于机器人语音指令数据集训练的语音交互模型，用于指令识别和语音合成',
    dataset: '机器人语音指令数据集',
    accuracy: '94.8%',
    status: 'completed',
    modelType: 'speech-interaction',
    trainingTime: '3h 20m',
    completedAt: '2025-06-23 18:15'
  },
  {
    id: 'train-20250622-011',
    value: 'train-20250622-011',
    name: '移动机器人导航模型',
    description: '基于移动机器人导航数据训练的导航模型，用于路径规划和避障控制',
    dataset: '移动机器人导航数据',
    accuracy: '97.3%',
    status: 'completed',
    modelType: 'navigation',
    trainingTime: '2h 50m',
    completedAt: '2025-06-22 21:40'
  },
  {
    id: 'train-20250621-005',
    value: 'train-20250621-005',
    name: '机器人安全监控模型',
    description: '基于机器人安全监控数据训练的安全监控模型，用于异常检测和安全预警',
    dataset: '机器人安全监控数据',
    accuracy: '99.1%',
    status: 'completed',
    modelType: 'safety-monitoring',
    trainingTime: '1h 30m',
    completedAt: '2025-06-21 15:20'
  }
];



// 可用的数据集
const mockDatasets = [
  {
    id: 1,
    dataset_name: '工业机器人视觉数据集',
    description: '包含多种工业场景的机器人视觉图像，用于目标检测、抓取定位和路径规划测试',
    owner_id: 1,
    dataset_uuid: 'ds-20250625-001',
    uploaded_at: '2025-06-25T10:30:15.000Z',
    size: '2.5GB',
    samples: 15000
  },
  {
    id: 2,
    dataset_name: '机械臂动作控制数据',
    description: '机械臂运动轨迹和关节角度数据，用于机器人动作控制和轨迹优化测试',
    owner_id: 1,
    dataset_uuid: 'ds-20250624-007',
    uploaded_at: '2025-06-24T18:45:00.000Z',
    size: '1.8GB',
    samples: 12000
  },
  {
    id: 3,
    dataset_name: '机器人语音指令数据集',
    description: '机器人语音交互数据，包含指令识别、语音合成和对话管理测试数据',
    owner_id: 1,
    dataset_uuid: 'ds-20250623-003',
    uploaded_at: '2025-06-23T09:12:55.000Z',
    size: '3.2GB',
    samples: 25000
  },
  {
    id: 4,
    dataset_name: '移动机器人导航数据',
    description: '包含激光雷达、摄像头、IMU等多种传感器的机器人导航和避障测试数据',
    owner_id: 1,
    dataset_uuid: 'ds-20250622-011',
    uploaded_at: '2025-06-22T22:05:10.000Z',
    size: '4.1GB',
    samples: 18000
  },
  {
    id: 5,
    dataset_name: '机器人安全监控数据',
    description: '机器人工作环境安全监控数据，用于异常检测和安全预警模型测试',
    owner_id: 1,
    dataset_uuid: 'ds-20250621-005',
    uploaded_at: '2025-06-21T14:20:30.000Z',
    size: '1.5GB',
    samples: 8000
  }
];

const EvaluationCreatePage = () => {
  const navigate = useNavigate();
  const [currentStep, setCurrentStep] = useState(0);
  const [selectedDataset, setSelectedDataset] = useState(null);
  const [selectedTrainedProject, setSelectedTrainedProject] = useState(null);
  const [evaluationForm] = Form.useForm();
  const [evaluationLoading, setEvaluationLoading] = useState(false);
  const [datasets, setDatasets] = useState(mockDatasets);
  const [loading, setLoading] = useState(false);
  const [createdEvaluationId, setCreatedEvaluationId] = useState(null);

  // 获取数据集列表
  const fetchDatasets = async () => {
    try {
      setLoading(true);
      // 模拟API调用延迟
      await new Promise(resolve => setTimeout(resolve, 500));
      console.log('使用静态数据集列表');
    } catch (err) {
      console.error('获取数据集列表失败:', err);
      message.error('获取数据集列表失败: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDatasets();
  }, []);

  // 处理数据集选择
  const handleDatasetSelect = (dataset) => {
    setSelectedDataset(dataset);
    setCurrentStep(1);
  };

  // 处理已训练项目选择
  const handleTrainedProjectSelect = (projectValue) => {
    const project = availableTrainedProjects.find(p => p.value === projectValue);
    setSelectedTrainedProject(project);
    setCurrentStep(2);
    
    // 设置表单默认值
    evaluationForm.setFieldsValue({
      trainedProject: project.value,
      testCases: 1000,
      timeout: 300,
      description: `机器人模型评估 - ${project.name}`
    });
  };

  // 处理评估提交
  const handleEvaluationSubmit = async (values) => {
    try {
      setEvaluationLoading(true);
      
      // 构建评估配置
      const evaluationConfig = {
        dataset_id: selectedDataset.id,
        dataset_name: selectedDataset.dataset_name,
        trained_project_id: selectedTrainedProject.id,
        trained_project_name: selectedTrainedProject.name,
        parameters: {
          testCases: values.testCases,
          timeout: values.timeout,
          batchSize: values.batchSize,
          threshold: values.threshold,
        },
        description: values.description,
      };
      
      console.log('评估配置:', evaluationConfig);
      
      // 模拟API调用
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // 生成评估ID（模拟后端返回）
      const evaluationId = `eval-${Date.now()}-${Math.floor(Math.random() * 1000).toString().padStart(3, '0')}`;
      setCreatedEvaluationId(evaluationId);
      
      message.success('机器人评估任务已成功创建！');
      setCurrentStep(3);
      
    } catch (error) {
      console.error('创建评估任务失败:', error);
      message.error('创建评估任务失败: ' + error.message);
    } finally {
      setEvaluationLoading(false);
    }
  };

  // 重置评估流程
  const handleReset = () => {
    setCurrentStep(0);
    setSelectedDataset(null);
    setSelectedTrainedProject(null);
    setCreatedEvaluationId(null);
    evaluationForm.resetFields();
  };

  // 步骤配置
  const steps = [
    {
      title: '选择数据集',
      icon: <DatabaseOutlined />,
      content: (
        <div className={styles.stepContent}>
          <Title level={4} style={{ textAlign: 'center' }}>选择机器人测试数据集</Title>
          <Text type="secondary" style={{ display: 'block', textAlign: 'center', marginBottom: 24 }}>请选择要用于评估的数据集</Text>
          
          {loading ? (
            <div style={{ textAlign: 'center', padding: '50px' }}>
              <Spin size="large" />
              <div style={{ marginTop: '16px' }}>加载中...</div>
            </div>
          ) : (
            <div className={styles.cardGrid}>
              {datasets.map(dataset => (
                <Card 
                  key={dataset.id} 
                  className={styles.card}
                  hoverable
                  onClick={() => handleDatasetSelect(dataset)}
                >
                  <div className={styles.cardContent}>
                    <Title level={5} className={styles.cardTitle}>{dataset.dataset_name}</Title>
                    <Text type="secondary" className={styles.cardDescription}>{dataset.description}</Text>
                    <div className={styles.cardMeta}>
                      <Tag color="blue">ID: {dataset.dataset_uuid}</Tag>
                      <Tag color="green">{dataset.size}</Tag>
                      <Tag color="orange">{dataset.samples} 样本</Tag>
                    </div>
                    <Text type="secondary" style={{ fontSize: '12px' }}>
                      上传于: {new Date(dataset.uploaded_at).toLocaleString('zh-CN')}
                    </Text>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </div>
      )
    },
    {
      title: '选择已训练项目',
      icon: <RobotOutlined />,
      content: (
        <div className={styles.stepContent}>
          <Title level={4} style={{ textAlign: 'center' }}>选择已训练好的机器人项目</Title>
          <Text type="secondary" style={{ display: 'block', textAlign: 'center', marginBottom: 24 }}>请选择要评估的已训练完成的机器人项目</Text>
          
          {selectedDataset && (
            <Alert
              message={`已选择数据集: ${selectedDataset.dataset_name}`}
              description={`UUID: ${selectedDataset.dataset_uuid} | 描述: ${selectedDataset.description}`}
              type="info"
              showIcon
              style={{ marginBottom: '16px' }}
            />
          )}
          
          <div className={styles.cardGrid}>
            {availableTrainedProjects.map(project => (
              <Card 
                key={project.value} 
                className={styles.card}
                hoverable
                onClick={() => handleTrainedProjectSelect(project.value)}
              >
                <div className={styles.cardContent}>
                  <Title level={5} className={styles.cardTitle}>{project.name}</Title>
                  <Text type="secondary" className={styles.cardDescription}>{project.description}</Text>
                  <div className={styles.cardMeta}>
                    <Tag color="blue">训练准确率: {project.accuracy}</Tag>
                    <Tag color="green">训练用时: {project.trainingTime}</Tag>
                    <Tag color="orange">完成时间: {project.completedAt}</Tag>
                  </div>
                  <Text type="secondary" style={{ fontSize: '12px', display: 'block', marginTop: '8px' }}>
                    基于数据集: {project.dataset}
                  </Text>
                </div>
              </Card>
            ))}
          </div>
        </div>
      )
    },

    {
      title: '配置参数',
      icon: <SettingOutlined />,
      content: renderConfigStep()
    },
    {
      title: '创建完成',
      icon: <CheckCircleOutlined />,
      content: (
        <div className={`${styles.stepContent} ${styles.completionAnimation}`}>
          <div style={{ textAlign: 'center', padding: '50px' }}>
            <CheckCircleOutlined className={styles.completionIcon} style={{ fontSize: '64px', color: '#52c41a', marginBottom: '24px' }} />
            <Title level={3}>机器人评估任务创建成功！</Title>
            <Text type="secondary">您的评估任务已成功提交，可以在模型评估页面查看进度</Text>
            
            <div className={styles.actionButtons}>
              <Button type="primary" onClick={handleReset}>
                创建新评估任务
              </Button>
              {createdEvaluationId && (
                <Button type="primary" onClick={() => navigate(`/evaluation/${createdEvaluationId}`)}>
                  查看评估详情
                </Button>
              )}
              <Button onClick={() => navigate('/evaluation')}>
                查看模型评估
              </Button>
            </div>
          </div>
        </div>
      )
    }
  ];

  const timelineSteps = [
    {
      title: '选择数据集',
      icon: <DatabaseOutlined />, 
      desc: '选择用于评估的机器人数据集'
    },
    {
      title: '选择已训练项目',
      icon: <RobotOutlined />, 
      desc: '选择要评估的已训练机器人项目'
    },
    {
      title: '配置参数',
      icon: <SettingOutlined />, 
      desc: '设置评估参数和任务描述'
    },
    {
      title: '创建完成',
      icon: <CheckCircleOutlined />, 
      desc: '评估任务创建成功'
    }
  ];

  function renderConfigStep() {
    return (
      <div className={styles.stepContent} style={{ position: 'relative', minHeight: 500 }}>
        <Title level={4} style={{ textAlign: 'center' }}>配置机器人评估参数</Title>
        <Text type="secondary" style={{ display: 'block', textAlign: 'center', marginBottom: 24 }}>设置评估参数和任务描述</Text>
        {selectedDataset && selectedTrainedProject && (
          <Alert
            message={`数据集: ${selectedDataset.dataset_name} | 已训练项目: ${selectedTrainedProject.name}`}
            description={`项目ID: ${selectedTrainedProject.id} | 训练准确率: ${selectedTrainedProject.accuracy}`}
            type="info"
            showIcon
            style={{ marginBottom: '16px' }}
          />
        )}
        <Form
          form={evaluationForm}
          layout="vertical"
          onFinish={handleEvaluationSubmit}
          className={styles.formContainer}
          initialValues={{
            trainedProject: selectedTrainedProject?.value,
            testCases: 1000,
            timeout: 300,
            batchSize: 32,
            threshold: 0.8,
          }}
        >
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                label="测试用例数量"
                name="testCases"
                rules={[{ required: true, message: '请输入测试用例数量' }]}
              >
                <InputNumber
                  min={1}
                  max={10000}
                  style={{ width: '100%' }}
                  placeholder="测试用例数量"
                />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                label="超时时间（秒）"
                name="timeout"
                rules={[{ required: true, message: '请输入超时时间' }]}
              >
                <InputNumber
                  min={60}
                  max={3600}
                  style={{ width: '100%' }}
                  placeholder="超时时间"
                />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                label="批次大小"
                name="batchSize"
                rules={[{ required: true, message: '请输入批次大小' }]}
              >
                <InputNumber
                  min={1}
                  max={512}
                  style={{ width: '100%' }}
                  placeholder="批次大小"
                />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                label="评估阈值"
                name="threshold"
                rules={[{ required: true, message: '请输入评估阈值' }]}
              >
                <InputNumber
                  min={0.1}
                  max={1.0}
                  step={0.1}
                  style={{ width: '100%' }}
                  placeholder="评估阈值"
                />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item
            label="机器人评估任务描述"
            name="description"
            rules={[{ required: true, message: '请输入机器人评估任务描述' }]}
          >
            <Input placeholder="机器人评估任务描述" />
          </Form.Item>
          <Divider />
          <div className={styles.actionButtonsFixed}>
            <Button onClick={handleReset} style={{ marginRight: 24 }}>
              重新开始
            </Button>
            <Button 
              type="primary" 
              htmlType="submit"
              loading={evaluationLoading}
              icon={<ExperimentOutlined />}
            >
              开始评估
            </Button>
          </div>
        </Form>
      </div>
    );
  }

  return (
    <div className={styles.evaluationCreatePage}>
      <div className={styles.contentWrapper}>
        <div className={styles.pageHeader}>
          <Title level={1} className={styles.pageTitle}>发起评估</Title>
          <Text type="secondary">创建新的机器人模型评估任务</Text>
        </div>

        <Card className={styles.mainCard}>
          <div style={{display:'flex',alignItems:'center',minHeight:900}}>
            <div style={{marginRight:56}}>
              <VerticalTimeline steps={timelineSteps} currentStep={currentStep} />
            </div>
            <div style={{flex:1, position:'relative'}}>
              <div className={styles.stepContentContainer}>
                <div className={styles.stepContent}>
                  {steps[currentStep].content}
                </div>
              </div>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
};

export default EvaluationCreatePage; 