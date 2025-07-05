import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
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
import { datasetsAPI, modelsAPI, trainTasksAPI } from '@/utils/api';

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

// 默认的模型列表（作为备用）
const defaultModels = [];

const TrainingPage = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [currentStep, setCurrentStep] = useState(0);
  const [selectedDataset, setSelectedDataset] = useState(null);
  const [selectedModel, setSelectedModel] = useState(null);
  const [trainingForm] = Form.useForm();
  const [trainingLoading, setTrainingLoading] = useState(false);
  const [datasets, setDatasets] = useState([]);
  const [availableModels, setAvailableModels] = useState(defaultModels);
  const [loading, setLoading] = useState(false);
  const [modelsLoading, setModelsLoading] = useState(false);
  const [createdProjectId, setCreatedProjectId] = useState(null);

  // 获取数据集列表
  const fetchDatasets = async () => {
    try {
      setLoading(true);
      const data = await datasetsAPI.getMyDatasets();
      setDatasets(data);
      // 检查URL参数，自动选中数据集
      const params = new URLSearchParams(location.search);
      const datasetId = params.get('datasetId');
      if (datasetId) {
        const found = data.find(ds => String(ds.id) === String(datasetId));
        if (found) {
          setSelectedDataset(found);
          setCurrentStep(1);
        }
      }
      console.log('获取数据集列表成功:', data);
    } catch (err) {
      console.error('获取数据集列表失败:', err);
      message.error('获取数据集列表失败: ' + err.message);
      // 如果获取失败，使用静态数据作为备用
      setDatasets(mockDatasets);
      // 检查URL参数，自动选中数据集（静态数据）
      const params = new URLSearchParams(location.search);
      const datasetId = params.get('datasetId');
      if (datasetId) {
        const found = mockDatasets.find(ds => String(ds.id) === String(datasetId));
        if (found) {
          setSelectedDataset(found);
          setCurrentStep(1);
        }
      }
    } finally {
      setLoading(false);
    }
  };

  // 获取模型类型列表
  const fetchModelTypes = async () => {
    try {
      setModelsLoading(true);
      const data = await modelsAPI.getAllModelTypes();
      // 将后端返回的数据格式转换为前端需要的格式
      const formattedModels = data.map(model => ({
        value: model.id.toString(),
        label: model.type_name,
        description: model.description
      }));
      setAvailableModels(formattedModels);
      console.log('获取模型类型列表成功:', formattedModels);
    } catch (err) {
      console.error('获取模型类型列表失败:', err);
      message.error('获取模型类型列表失败: ' + err.message);
      // 如果获取失败，使用空列表
      setAvailableModels([]);
    } finally {
      setModelsLoading(false);
    }
  };

  useEffect(() => {
    fetchDatasets();
    fetchModelTypes();
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
    
    console.log('选择模型:', modelValue, '模型对象:', model);
    
    // 设置表单默认值
    trainingForm.setFieldsValue({
      model: modelValue,
      epochs: 10,
      batchSize: 32,
      learningRate: 0.001,
      validationSplit: 0.2,
      maxLength: 512,
      temperature: 0.7,
    });
  };

  // 处理训练提交
  const handleTrainingSubmit = async (values) => {
    try {
      setTrainingLoading(true);
      
      // 构建超参数对象
      const hyperparameter = {
          epochs: values.epochs,
          batch_size: values.batchSize,
          learning_rate: values.learningRate,
          validation_split: values.validationSplit,
          max_length: values.maxLength,
          temperature: values.temperature,
      };
      

      
      // 添加调试信息
      console.log('表单值:', values);
      console.log('selectedModel:', selectedModel);
      console.log('values.model:', values.model, '类型:', typeof values.model);
      
      // 验证model值
      if (!values.model || values.model === 'undefined' || values.model === 'null') {
        throw new Error('请先选择模型');
      }
      
      // 构建训练项目创建请求体
      const trainTaskData = {
        dataset_id: parseInt(selectedDataset.id),
        model_type_id: parseInt(values.model),
        hyperparameter: hyperparameter
      };
      
      console.log('训练项目创建请求:', trainTaskData);
      console.log('数据类型检查:', {
        dataset_id: typeof trainTaskData.dataset_id,
        model_type_id: typeof trainTaskData.model_type_id,
        dataset_id_value: trainTaskData.dataset_id,
        model_type_id_value: trainTaskData.model_type_id
      });
      
      // 调用后端API创建训练项目
      const response = await trainTasksAPI.create(trainTaskData);
      
      console.log('训练项目创建成功:', response);
      
      // 设置创建的项目ID
      setCreatedProjectId(response.id.toString());
      
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
          ) : datasets.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '50px' }}>
              <InfoCircleOutlined style={{ fontSize: '48px', color: '#1890ff', marginBottom: '16px' }} />
              <Title level={4}>暂无数据集</Title>
              <Text type="secondary" style={{ display: 'block', marginBottom: '24px' }}>
                您还没有上传任何数据集，请先上传数据集后再创建训练项目
              </Text>
              <Button type="primary" onClick={() => navigate('/home')}>
                去上传数据
              </Button>
            </div>
          ) : (
            <div className={styles.cardGrid}>
              {datasets.map(dataset => (
                <Card 
                  key={dataset.id} 
                  className={
                    selectedDataset && selectedDataset.id === dataset.id
                      ? `${styles.datasetCard} ${styles.datasetCardSelected}`
                      : styles.datasetCard
                  }
                  hoverable
                  onClick={() => handleDatasetSelect(dataset)}
                >
                  <div className={styles.cardContent}>
                    <Title level={3} className={styles.cardTitle}>{dataset.dataset_name}</Title>
                    <Text type="secondary" className={styles.cardDescription}>{dataset.description}</Text>
                    <div className={styles.cardMeta}>
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
              description={`描述: ${selectedDataset.description}`}
              type="info"
              showIcon
              style={{ marginBottom: '16px', width: '540px', maxWidth: '100%' }}
            />
          )}
          
          {modelsLoading ? (
            <div style={{ textAlign: 'center', padding: '50px' }}>
              <Spin size="large" />
              <div style={{ marginTop: '16px' }}>加载模型中...</div>
            </div>
          ) : availableModels.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '50px' }}>
              <InfoCircleOutlined style={{ fontSize: '48px', color: '#1890ff', marginBottom: '16px' }} />
              <Title level={4}>暂无可用模型</Title>
              <Text type="secondary" style={{ display: 'block', marginBottom: '24px' }}>
                当前没有可用的模型类型，请联系管理员添加模型
              </Text>
            </div>
          ) : (
          <>
            <div className={styles.cardGrid}>
              {availableModels.map(model => (
                <Card 
                  key={model.value} 
                  className={
                    selectedModel && selectedModel.value === model.value
                      ? `${styles.modelCard} ${styles.modelCardSelected}`
                      : styles.modelCard
                  }
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
            <div style={{ width: '100%', display: 'flex', justifyContent: 'center', marginTop: 32 }}>
              <Button onClick={() => {
                setCurrentStep(0);
                setSelectedModel(null);
                setSelectedDataset(null);
              }}>
                返回上一步
              </Button>
            </div>
          </>
          )}
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
              model: selectedModel?.value || undefined,
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

            {/* 隐藏的模型字段，确保模型值被正确传递 */}
            <Form.Item
              name="model"
              hidden
              rules={[{ required: true, message: '请选择模型' }]}
                  >
              <Input />
            </Form.Item>



            <Divider />

            <div className={styles.actionButtonsFixed} style={{ marginTop: '12px' }}>
              <Button onClick={handleReset} style={{ marginRight: 16 }}>
                重新开始
              </Button>
              <Button onClick={() => {
                setCurrentStep(1);
                setSelectedModel(null);
              }} style={{ marginRight: 16 }}>
                返回上一步
              </Button>
              <Button 
                type="primary" 
                htmlType="submit"
                loading={trainingLoading}
                icon={<PlayCircleOutlined />}
              >
                开始训练
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
                <Button type="primary" onClick={() => navigate(`/project-center/${createdProjectId}/progress`)}>
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
          <div style={{display:'flex',alignItems:'flex-start',justifyContent:'center',height:'600px'}}>
            <div style={{marginRight:48, display:'flex', alignItems:'center', height:'100%'}}>
              <VerticalTimeline steps={timelineSteps} currentStep={currentStep} />
            </div>
            <div style={{minWidth: 800, maxWidth: 800, marginLeft: 0, marginRight: 'auto', display:'flex', justifyContent:'center'}}>
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