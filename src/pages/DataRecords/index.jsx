import React, { useState, useEffect } from 'react';
import { 
  Typography, 
  Card, 
  Tag, 
  Button, 
  Tooltip, 
  Space, 
  Dropdown, 
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
  Alert
} from 'antd';
import {
  InfoCircleOutlined,
  PlayCircleOutlined,
  DownloadOutlined,
  EditOutlined,
  DeleteOutlined,
  MoreOutlined,
  ReloadOutlined,
  SettingOutlined,
  RobotOutlined
} from '@ant-design/icons';
import { datasetsAPI } from '@/utils/api';
import styles from './DataRecords.module.css';

const { Title, Text } = Typography;
const { Option } = Select;
const { TextArea } = Input;

// 数据集状态映射
const getDatasetStatus = (dataset) => {
  // 这里可以根据数据集的实际状态字段来映射
  // 暂时使用默认状态，实际项目中需要根据后端返回的状态字段调整
  return 'unused';
};

// 根据状态返回不同的Tag样式
const StatusTag = ({ status }) => {
  const statusMap = {
    unused: { color: 'green', text: '未使用' },
    training: { color: 'blue', text: '训练中' },
    archived: { color: 'purple', text: '已归档' },
    error: { color: 'red', text: '校验失败' },
  };
  const { color, text } = statusMap[status] || { color: 'default', text: '未知' };
  return <Tag color={color}>{text}</Tag>;
};


const DataRecordsPage = () => {
  // 使用静态数据替代API请求
  const [datasets, setDatasets] = useState([
    {
      id: 1,
      dataset_name: '工业机器人视觉数据集',
      description: '包含多种工业场景的机器人视觉图像，用于目标检测、抓取定位和路径规划训练',
      owner_id: 1,
      dataset_uuid: 'ds-20250625-001',
      uploaded_at: '2025-06-25T10:30:15.000Z'
    },
    {
      id: 2,
      dataset_name: '机械臂动作控制数据',
      description: '机械臂运动轨迹和关节角度数据，用于机器人动作控制和轨迹优化训练',
      owner_id: 1,
      dataset_uuid: 'ds-20250624-007',
      uploaded_at: '2025-06-24T18:45:00.000Z'
    },
    {
      id: 3,
      dataset_name: '机器人语音指令数据集',
      description: '机器人语音交互数据，包含指令识别、语音合成和对话管理训练数据',
      owner_id: 1,
      dataset_uuid: 'ds-20250623-003',
      uploaded_at: '2025-06-23T09:12:55.000Z'
    },
    {
      id: 4,
      dataset_name: '移动机器人导航数据',
      description: '包含激光雷达、摄像头、IMU等多种传感器的机器人导航和避障数据',
      owner_id: 1,
      dataset_uuid: 'ds-20250622-011',
      uploaded_at: '2025-06-22T22:05:10.000Z'
    },
    {
      id: 5,
      dataset_name: '机器人安全监控数据',
      description: '机器人工作环境安全监控数据，用于异常检测和安全预警模型训练',
      owner_id: 1,
      dataset_uuid: 'ds-20250621-005',
      uploaded_at: '2025-06-21T14:20:30.000Z'
    }
  ]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  
  // 训练弹窗相关状态
  const [trainingModalVisible, setTrainingModalVisible] = useState(false);
  const [selectedDataset, setSelectedDataset] = useState(null);
  const [trainingForm] = Form.useForm();
  const [trainingLoading, setTrainingLoading] = useState(false);
  
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

  // 获取用户数据集列表（使用静态数据）
  const fetchDatasets = async () => {
    try {
      setLoading(true);
      setError(null);
      // 模拟API调用延迟
      await new Promise(resolve => setTimeout(resolve, 500));
      // 使用静态数据，不需要实际API调用
      console.log('使用静态数据集列表');
    } catch (err) {
      console.error('获取数据集列表失败:', err);
      setError(err.message);
      message.error('获取数据集列表失败: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  // 组件挂载时获取数据
  useEffect(() => {
    fetchDatasets();
  }, []);

  // 处理发起训练
  const handleStartTraining = (dataset) => {
    setSelectedDataset(dataset);
    setTrainingModalVisible(true);
    // 设置表单默认值
    trainingForm.setFieldsValue({
      model: 'gpt-4-vision',
      epochs: 10,
      batchSize: 32,
      learningRate: 0.001,
      validationSplit: 0.2,
      maxLength: 512,
      temperature: 0.7,
      description: `机器人训练任务 - ${dataset.dataset_name}`
    });
  };

  // 处理训练弹窗确认
  const handleTrainingSubmit = async (values) => {
    try {
      setTrainingLoading(true);
      
      // 构建训练参数
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
      
      // TODO: 调用后端训练API
      // const response = await trainingAPI.startTraining(trainingConfig);
      
      // 模拟API调用
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      message.success('训练任务已成功创建！');
      setTrainingModalVisible(false);
      trainingForm.resetFields();
      
    } catch (error) {
      console.error('创建训练任务失败:', error);
      message.error('创建训练任务失败: ' + error.message);
    } finally {
      setTrainingLoading(false);
    }
  };

  // 处理训练弹窗取消
  const handleTrainingCancel = () => {
    setTrainingModalVisible(false);
    setSelectedDataset(null);
    trainingForm.resetFields();
  };

  // 处理菜单项点击
  const handleMenuClick = ({ key }, record) => {
    switch (key) {
      case 'details':
        message.info('查看详情功能待实现');
        break;
      case 'train':
        handleStartTraining(record);
        break;
      case 'download':
        message.info('下载功能待实现');
        break;
      case 'edit':
        message.info('编辑功能待实现');
        break;
      case 'delete':
        message.info('删除功能待实现');
        break;
      default:
        break;
    }
  };

  const getMenuItems = (record) => [
    { key: 'details', label: '查看详情', icon: <InfoCircleOutlined /> },
    { key: 'train', label: '发起训练', icon: <PlayCircleOutlined /> },
    { key: 'download', label: '下载', icon: <DownloadOutlined /> },
    { key: 'edit', label: '编辑', icon: <EditOutlined /> },
    { type: 'divider' },
    { key: 'delete', label: '删除', danger: true, icon: <DeleteOutlined /> },
  ];
  
  return (
    <div className={styles.dataRecordsPage}>
      <div className={styles.contentWrapper}>
        <div className={styles.pageHeader}>
          <Title level={1} className={styles.pageTitle}>数据记录</Title>
          <Text type="secondary">管理您上传的机器人训练数据集和文件</Text>
        </div>
        
        {/* 静态数据提示 */}
        <Alert
          message="机器人训练演示模式"
          description="当前使用机器人相关静态数据展示，点击任意机器人数据集的发起训练按钮可测试训练弹窗功能。"
          type="info"
          showIcon
          style={{ marginBottom: '16px' }}
        />
      
        {loading ? (
          <div style={{ textAlign: 'center', padding: '50px' }}>
            <Spin size="large" />
            <div style={{ marginTop: '16px' }}>加载中...</div>
          </div>
        ) : error ? (
          <div style={{ textAlign: 'center', padding: '50px' }}>
            <Text type="danger">加载失败: {error}</Text>
            <br />
            <Button type="primary" onClick={fetchDatasets} style={{ marginTop: '16px' }}>
              重试
            </Button>
          </div>
        ) : datasets.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '50px' }}>
            <Text type="secondary">暂无机器人数据集</Text>
            <br />
            <Text type="secondary">您还没有上传任何机器人训练数据集</Text>
          </div>
        ) : (
          <div className={styles.recordList}>
            {datasets.map(dataset => (
              <Card key={dataset.id} className={styles.recordCard}>
                <div className={styles.cardHeader}>
                  <Text type="secondary">编号: {dataset.dataset_uuid}</Text>
                  <StatusTag status={getDatasetStatus(dataset)} />
                </div>
                <div className={styles.cardContent}>
                  <Title level={5} className={styles.datasetName}>{dataset.dataset_name}</Title>
                  <Text type="secondary">{dataset.description}</Text>
                  <br />
                  <Text type="secondary">上传于: {new Date(dataset.uploaded_at).toLocaleString('zh-CN')}</Text>
                </div>
                <div className={styles.cardActions}>
                  <Space>
                    <Tooltip title="查看详情">
                      <Button type="text" shape="circle" icon={<InfoCircleOutlined />} />
                    </Tooltip>
                    <Tooltip title="发起训练">
                      <Button 
                        type="text" 
                        shape="circle" 
                        icon={<PlayCircleOutlined />} 
                        onClick={() => handleStartTraining(dataset)}
                      />
                    </Tooltip>
                    <Dropdown 
                      menu={{ 
                        items: getMenuItems(dataset),
                        onClick: (e) => handleMenuClick(e, dataset)
                      }} 
                      placement="bottomRight" 
                      arrow
                    >
                      <Button type="text" shape="circle" icon={<MoreOutlined />} />
                    </Dropdown>
                  </Space>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
      
      {/* 训练参数设置弹窗 */}
      <Modal
        title={
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <RobotOutlined style={{ color: '#1677ff' }} />
            <span>发起机器人训练任务</span>
          </div>
        }
        open={trainingModalVisible}
        onCancel={handleTrainingCancel}
        footer={null}
        width={800}
        destroyOnClose
        className="training-modal"
      >
        {selectedDataset && (
          <div style={{ marginBottom: '16px' }}>
            <Alert
              message={`机器人数据集: ${selectedDataset.dataset_name}`}
              description={`UUID: ${selectedDataset.dataset_uuid} | 描述: ${selectedDataset.description}`}
              type="info"
              showIcon
            />
          </div>
        )}
        
        <Form
          form={trainingForm}
          layout="vertical"
          onFinish={handleTrainingSubmit}
          initialValues={{
            model: 'gpt-4-vision',
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
                  label="选择机器人模型"
                  name="model"
                  rules={[{ required: true, message: '请选择机器人训练模型' }]}
                >
                  <Select placeholder="选择机器人训练模型">
                  {availableModels.map(model => (
                    <Option key={model.value} value={model.value}>
                      <div>
                        <div style={{ fontWeight: 'bold' }}>{model.label}</div>
                        <div style={{ fontSize: '12px', color: '#666' }}>{model.description}</div>
                      </div>
                    </Option>
                  ))}
                </Select>
              </Form.Item>
            </Col>
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
          </Row>

          <Row gutter={16}>
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
          </Row>

          <Row gutter={16}>
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
          </Row>

          <Row gutter={16}>
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
            <Col span={12}>
                              <Form.Item
                  label="机器人训练任务描述"
                  name="description"
                  rules={[{ required: true, message: '请输入机器人训练任务描述' }]}
                >
                  <Input placeholder="机器人训练任务描述" />
                </Form.Item>
            </Col>
          </Row>

          <Form.Item
            noStyle
            shouldUpdate={(prevValues, currentValues) => prevValues.model !== currentValues.model}
          >
            {({ getFieldValue }) => {
              const selectedModel = getFieldValue('model');
              return selectedModel === 'custom-model' ? (
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

          <div style={{ textAlign: 'right' }}>
            <Space>
              <Button onClick={handleTrainingCancel}>
                取消
              </Button>
              <Button 
                type="primary" 
                htmlType="submit"
                loading={trainingLoading}
                icon={<PlayCircleOutlined />}
              >
                开始机器人训练
              </Button>
            </Space>
          </div>
        </Form>
      </Modal>
    </div>
  );
};

export default DataRecordsPage;
