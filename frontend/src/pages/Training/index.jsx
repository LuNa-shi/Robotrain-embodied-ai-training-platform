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

const TrainingPage = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [currentStep, setCurrentStep] = useState(0);
  const [selectedDataset, setSelectedDataset] = useState(null);
  const [selectedModel, setSelectedModel] = useState(null);
  const [trainingForm] = Form.useForm();
  const [trainingLoading, setTrainingLoading] = useState(false);
  const [datasets, setDatasets] = useState([]);
  const [availableModels, setAvailableModels] = useState([]);
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
      setDatasets([]);
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
      env: 'aloha',
      log_freq: 25,
      steps: 100,
      batch_size: 8,
    });
  };

  // 处理训练提交
  const handleTrainingSubmit = async (values) => {
    try {
      setTrainingLoading(true);

      // 验证model值
      if (!values.model || values.model === 'undefined' || values.model === 'null') {
        throw new Error('请先选择模型');
      }

      // 使用用户选择的超参数
      const hyperparameter = {
        policy: { type: selectedModel.label.toLowerCase() }, // 使用选择的模型的type_name，转换为小写
        env: { type: values.env },
        log_freq: values.log_freq,
        steps: values.steps,
        batch_size: values.batch_size
      };

      // 构建训练项目创建请求体
      const trainTaskData = {
        dataset_id: parseInt(selectedDataset.id),
        model_type_id: parseInt(values.model),
        hyperparameter: hyperparameter
      };

      console.log('训练项目创建请求:', trainTaskData);

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
              description={`策略类型 (Policy): ${selectedModel.label} (由选择的模型决定)`}
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
              env: 'aloha',
              log_freq: 25,
              steps: 100,
              batch_size: 8,
            }}
          >
            <Row gutter={16}>
              <Col span={12}>
                <Form.Item
                  label="环境类型 (Environment)"
                  name="env"
                  rules={[{ required: true, message: '请选择环境类型' }]}
                >
                  <Select placeholder="选择环境类型">
                    <Option value="aloha">Aloha</Option>
                    <Option value="pusht">Pusht</Option>
                  </Select>
                </Form.Item>
              </Col>
              <Col span={12}>
                <Form.Item
                  label="训练步数 (Steps)"
                  name="steps"
                  rules={[{ required: true, message: '请输入训练步数' }]}
                >
                  <InputNumber
                    min={1}
                    max={1000000}
                    style={{ width: '100%' }}
                    placeholder="训练步数"
                  />
                </Form.Item>
              </Col>
            </Row>

            <Row gutter={16}>
              <Col span={12}>
                <Form.Item
                  label="日志频率 (Log Frequency)"
                  name="log_freq"
                  rules={[{ required: true, message: '请输入日志频率' }]}
                >
                  <InputNumber
                    min={10}
                    max={1000}
                    style={{ width: '100%' }}
                    placeholder="日志频率"
                  />
                </Form.Item>
              </Col>
              <Col span={12}>
                <Form.Item
                  label="批次大小 (Batch Size)"
                  name="batch_size"
                  rules={[{ required: true, message: '请输入批次大小' }]}
                >
                  <InputNumber
                    min={1}
                    max={16}
                    style={{ width: '100%' }}
                    placeholder="批次大小"
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