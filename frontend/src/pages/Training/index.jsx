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
  InfoCircleOutlined
} from '@ant-design/icons';
import styles from './Training.module.css';
import VerticalTimeline from './VerticalTimeline';

const { Title, Text, Paragraph } = Typography;
const { Option } = Select;
const { TextArea } = Input;
const { Step } = Steps;

// 模拟数据集列表
const mockDatasets = [
  {
    id: 1,
    dataset_name: '工业机器人视觉数据集',
    description: '包含多种工业场景的机器人视觉图像，用于目标检测、抓取定位和路径规划训练',
    owner_id: 1,
    dataset_uuid: 'ds-20250625-001',
    uploaded_at: '2025-06-25T10:30:15.000Z',
    size: '2.5GB',
    samples: 15000
  },
  {
    id: 2,
    dataset_name: '机械臂动作控制数据',
    description: '机械臂运动轨迹和关节角度数据，用于机器人动作控制和轨迹优化训练',
    owner_id: 1,
    dataset_uuid: 'ds-20250624-007',
    uploaded_at: '2025-06-24T18:45:00.000Z',
    size: '1.8GB',
    samples: 12000
  },
  {
    id: 3,
    dataset_name: '机器人语音指令数据集',
    description: '机器人语音交互数据，包含指令识别、语音合成和对话管理训练数据',
    owner_id: 1,
    dataset_uuid: 'ds-20250623-003',
    uploaded_at: '2025-06-23T09:12:55.000Z',
    size: '3.2GB',
    samples: 25000
  },
  {
    id: 4,
    dataset_name: '移动机器人导航数据',
    description: '包含激光雷达、摄像头、IMU等多种传感器的机器人导航和避障数据',
    owner_id: 1,
    dataset_uuid: 'ds-20250622-011',
    uploaded_at: '2025-06-22T22:05:10.000Z',
    size: '4.1GB',
    samples: 18000
  },
  {
    id: 5,
    dataset_name: '机器人安全监控数据',
    description: '机器人工作环境安全监控数据，用于异常检测和安全预警模型训练',
    owner_id: 1,
    dataset_uuid: 'ds-20250621-005',
    uploaded_at: '2025-06-21T14:20:30.000Z',
    size: '1.5GB',
    samples: 8000
  }
];

// 可用的模型列表
const availableModels = [
  { value: 'gpt-4-vision', label: 'GPT-4 Vision', description: '机器人视觉识别和图像理解模型' },
  { value: 'claude-3-sonnet', label: 'Claude 3 Sonnet', description: '机器人语音交互和决策推理模型' },
  { value: 'whisper-large', label: 'Whisper Large', description: '机器人语音识别和指令理解模型' },
  { value: 'robot-arm-controller', label: 'Robot Arm Controller', description: '机械臂动作控制和轨迹规划模型' },
  { value: 'navigation-model', label: 'Navigation Model', description: '移动机器人导航和避障模型' },
  { value: 'safety-monitor', label: 'Safety Monitor', description: '机器人安全监控和异常检测模型' },
  { value: 'custom-model', label: '自定义模型', description: '使用您自己的机器人模型配置' },
];

const TrainingPage = () => {
  const navigate = useNavigate();
  const [currentStep, setCurrentStep] = useState(0);
  const [selectedDataset, setSelectedDataset] = useState(null);
  const [selectedModel, setSelectedModel] = useState(null);
  const [trainingForm] = Form.useForm();
  const [trainingLoading, setTrainingLoading] = useState(false);
  const [datasets, setDatasets] = useState(mockDatasets);
  const [loading, setLoading] = useState(false);
  const [createdProjectId, setCreatedProjectId] = useState(null);

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

  // 处理模型选择
  const handleModelSelect = (modelValue) => {
    const model = availableModels.find(m => m.value === modelValue);
    setSelectedModel(model);
    setCurrentStep(2);
    
    // 设置表单默认值
    trainingForm.setFieldsValue({
      model: modelValue,
      epochs: 10,
      batchSize: 32,
      learningRate: 0.001,
      validationSplit: 0.2,
      maxLength: 512,
      temperature: 0.7,
      description: `机器人训练项目 - ${selectedDataset?.dataset_name}`
    });
  };

  // 处理训练提交
  const handleTrainingSubmit = async (values) => {
    try {
      setTrainingLoading(true);
      
      // 构建训练配置
      const trainingConfig = {
        dataset_id: selectedDataset.id,
        dataset_name: selectedDataset.dataset_name,
        model: values.model,
        parameters: {
          epochs: values.epochs,
          batch_size: values.batchSize,
          learning_rate: values.learningRate,
          validation_split: values.validationSplit,
          max_length: values.maxLength,
          temperature: values.temperature,
        },
        description: values.description,
        custom_model_config: values.model === 'custom-model' ? values.customModelConfig : null,
      };
      
      console.log('训练配置:', trainingConfig);
      
      // 模拟API调用
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // 生成项目ID（模拟后端返回）
      const projectId = `train-${Date.now()}-${Math.floor(Math.random() * 1000).toString().padStart(3, '0')}`;
      setCreatedProjectId(projectId);
      
      message.success('机器人训练项目已成功创建！');
      setCurrentStep(3);
      
    } catch (error) {
      console.error('创建训练项目失败:', error);
      message.error('创建训练项目失败: ' + error.message);
    } finally {
      setTrainingLoading(false);
    }
  };

  // 重置训练流程
  const handleReset = () => {
    setCurrentStep(0);
    setSelectedDataset(null);
    setSelectedModel(null);
    setCreatedProjectId(null);
    trainingForm.resetFields();
  };

  // 步骤配置
  const steps = [
    {
      title: '选择数据集',
      icon: <DatabaseOutlined />,
      content: (
        <div className={styles.stepContent}>
          <Title level={4} style={{ textAlign: 'center' }}>选择机器人训练数据集</Title>
          <Text type="secondary" style={{ display: 'block', textAlign: 'center', marginBottom: 24 }}>请选择要用于训练的数据集</Text>
          
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
      title: '选择模型',
      icon: <RobotOutlined />,
      content: (
        <div className={styles.stepContent}>
          <Title level={4} style={{ textAlign: 'center' }}>选择机器人训练模型</Title>
          <Text type="secondary" style={{ display: 'block', textAlign: 'center', marginBottom: 24 }}>请选择适合的机器人模型</Text>
          
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
            {availableModels.map(model => (
              <Card 
                key={model.value} 
                className={styles.card}
                hoverable
                onClick={() => handleModelSelect(model.value)}
              >
                <div className={styles.cardContent}>
                  <Title level={5} className={styles.cardTitle}>{model.label}</Title>
                  <Text type="secondary" className={styles.cardDescription}>{model.description}</Text>
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
      content: (
        <div className={styles.stepContent} style={{ position: 'relative', minHeight: 500 }}>
          <Title level={4} style={{ textAlign: 'center' }}>配置机器人训练参数</Title>
          <Text type="secondary" style={{ display: 'block', textAlign: 'center', marginBottom: 24 }}>设置训练参数和项目描述</Text>
          
          {selectedDataset && selectedModel && (
            <Alert
              message={`数据集: ${selectedDataset.dataset_name} | 模型: ${selectedModel.label}`}
              description={`UUID: ${selectedDataset.dataset_uuid}`}
              type="info"
              showIcon
              style={{ marginBottom: '16px' }}
            />
          )}
          
          <Form
            form={trainingForm}
            layout="vertical"
            onFinish={handleTrainingSubmit}
            className={styles.formContainer}
            initialValues={{
              model: selectedModel?.value,
              epochs: 10,
              batchSize: 32,
              learningRate: 0.001,
              validationSplit: 0.2,
              maxLength: 512,
              temperature: 0.7,
            }}
          >
            <Row gutter={16}>
              <Col span={12}>
                <Form.Item
                  label="训练轮数 (Epochs)"
                  name="epochs"
                  rules={[{ required: true, message: '请输入训练轮数' }]}
                >
                  <InputNumber
                    min={1}
                    max={1000}
                    style={{ width: '100%' }}
                    placeholder="训练轮数"
                  />
                </Form.Item>
              </Col>
              <Col span={12}>
                <Form.Item
                  label="批次大小 (Batch Size)"
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
            </Row>

            <Row gutter={16}>
              <Col span={12}>
                <Form.Item
                  label="学习率 (Learning Rate)"
                  name="learningRate"
                  rules={[{ required: true, message: '请输入学习率' }]}
                >
                  <InputNumber
                    min={0.0001}
                    max={1}
                    step={0.0001}
                    style={{ width: '100%' }}
                    placeholder="学习率"
                  />
                </Form.Item>
              </Col>
              <Col span={12}>
                <Form.Item
                  label="验证集比例"
                  name="validationSplit"
                  rules={[{ required: true, message: '请输入验证集比例' }]}
                >
                  <InputNumber
                    min={0.1}
                    max={0.5}
                    step={0.05}
                    style={{ width: '100%' }}
                    placeholder="验证集比例"
                  />
                </Form.Item>
              </Col>
            </Row>

            <Row gutter={16}>
              <Col span={12}>
                <Form.Item
                  label="最大序列长度"
                  name="maxLength"
                  rules={[{ required: true, message: '请输入最大序列长度' }]}
                >
                  <InputNumber
                    min={64}
                    max={4096}
                    style={{ width: '100%' }}
                    placeholder="最大序列长度"
                  />
                </Form.Item>
              </Col>
              <Col span={12}>
                <Form.Item
                  label="温度参数 (Temperature)"
                  name="temperature"
                  rules={[{ required: true, message: '请输入温度参数' }]}
                >
                  <InputNumber
                    min={0.1}
                    max={2.0}
                    step={0.1}
                    style={{ width: '100%' }}
                    placeholder="温度参数"
                  />
                </Form.Item>
              </Col>
            </Row>

            <Form.Item
              label="机器人训练项目描述"
              name="description"
              rules={[{ required: true, message: '请输入机器人训练项目描述' }]}
            >
              <Input placeholder="机器人训练项目描述" />
            </Form.Item>

            <Form.Item
              noStyle
              shouldUpdate={(prevValues, currentValues) => prevValues.model !== currentValues.model}
            >
              {({ getFieldValue }) => {
                const selectedModelValue = getFieldValue('model');
                return selectedModelValue === 'custom-model' ? (
                  <Form.Item
                    label="自定义机器人模型配置"
                    name="customModelConfig"
                    rules={[{ required: true, message: '请输入自定义机器人模型配置' }]}
                  >
                    <TextArea
                      rows={4}
                      placeholder="请输入自定义机器人模型的配置信息（JSON格式）"
                    />
                  </Form.Item>
                ) : null;
              }}
            </Form.Item>

            <Divider />

            <div className={styles.actionButtonsFixed}>
              <Button onClick={handleReset} style={{ marginRight: 24 }}>
                重新开始
              </Button>
              <Button 
                type="primary" 
                htmlType="submit"
                loading={trainingLoading}
                icon={<PlayCircleOutlined />}
              >
                开始机器人训练
              </Button>
            </div>
          </Form>
        </div>
      )
    },
    {
      title: '创建完成',
      icon: <CheckCircleOutlined />,
      content: (
        <div className={`${styles.stepContent} ${styles.completionAnimation}`}>
          <div style={{ textAlign: 'center', padding: '50px' }}>
            <CheckCircleOutlined className={styles.completionIcon} style={{ fontSize: '64px', color: '#52c41a', marginBottom: '24px' }} />
            <Title level={3}>机器人训练项目创建成功！</Title>
            <Text type="secondary">您的训练项目已成功提交，可以在项目中心页面查看进度</Text>
            
            <div className={styles.actionButtons}>
              <Button type="primary" onClick={handleReset}>
                创建新训练项目
              </Button>
              {createdProjectId && (
                <Button type="primary" onClick={() => navigate(`/project-center/${createdProjectId}`)}>
                  查看项目详情
                </Button>
              )}
              <Button onClick={() => navigate('/project-center')}>
                查看项目中心
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
      desc: '选择用于训练的机器人数据集'
    },
    {
      title: '选择模型',
      icon: <RobotOutlined />, 
      desc: '选择要训练的机器人模型'
    },
    {
      title: '配置参数',
      icon: <SettingOutlined />, 
      desc: '设置训练参数和项目描述'
    },
    {
      title: '创建完成',
      icon: <CheckCircleOutlined />, 
      desc: '训练项目创建成功'
    }
  ];

  return (
    <div className={styles.trainingPage}>
      <div className={styles.contentWrapper}>
        <div className={styles.pageHeader}>
          <Title level={1} className={styles.pageTitle}>发起训练</Title>
          <Text type="secondary">创建新的机器人模型训练项目</Text>
        </div>

        <Card className={styles.mainCard}>
          <div style={{display:'flex',alignItems:'center',minHeight:900}}>
            <div style={{marginRight:56}}>
              <VerticalTimeline steps={timelineSteps} currentStep={currentStep} />
            </div>
            <div style={{flex:1}}>
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

export default TrainingPage; 