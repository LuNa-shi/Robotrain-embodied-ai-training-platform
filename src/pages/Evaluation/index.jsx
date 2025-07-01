import React, { useState, useEffect } from 'react';
import { 
  Typography, 
  Card, 
  Button, 
  Space, 
  Table, 
  Tag, 
  Modal, 
  Form, 
  Select, 
  InputNumber, 
  Input, 
  Row, 
  Col, 
  Progress, 
  Alert, 
  message, 
  Tooltip,
  Dropdown,
  Divider,
  Statistic,
  Descriptions
} from 'antd';
import {
  PlayCircleOutlined,
  PauseCircleOutlined,
  StopOutlined,
  ReloadOutlined,
  SettingOutlined,
  DownloadOutlined,
  DeleteOutlined,
  MoreOutlined,
  ExperimentOutlined,
  RobotOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  ClockCircleOutlined,
  BarChartOutlined,
  FileTextOutlined
} from '@ant-design/icons';
import styles from './Evaluation.module.css';

const { Title, Text, Paragraph } = Typography;
const { Option } = Select;
const { TextArea } = Input;

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
    failedCases: 48
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
    failedCases: 0
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
    failedCases: 172
  }
];

// 可用的测试模型
const availableModels = [
  { value: 'gpt-4-vision', label: 'GPT-4 Vision', description: '机器人视觉识别模型' },
  { value: 'claude-3-sonnet', label: 'Claude 3 Sonnet', description: '机器人语音交互模型' },
  { value: 'whisper-large', label: 'Whisper Large', description: '机器人语音识别模型' },
  { value: 'llama-2-13b', label: 'Llama 2 13B', description: '机器人决策推理模型' },
  { value: 'robot-arm-controller', label: 'Robot Arm Controller', description: '机械臂控制模型' },
  { value: 'navigation-model', label: 'Navigation Model', description: '机器人导航模型' },
  { value: 'custom-model', label: '自定义模型', description: '使用您自己的机器人模型配置' },
];

// 测试类型
const testTypes = [
  { value: 'accuracy', label: '准确率测试', description: '测试机器人模型的整体准确率' },
  { value: 'precision', label: '精确率测试', description: '测试机器人动作的精确度' },
  { value: 'recall', label: '召回率测试', description: '测试机器人指令识别率' },
  { value: 'f1-score', label: 'F1分数测试', description: '测试机器人综合性能指标' },
  { value: 'comprehensive', label: '综合测试', description: '执行机器人所有性能指标测试' },
  { value: 'stress', label: '压力测试', description: '测试机器人在高负载下的表现' },
  { value: 'safety', label: '安全测试', description: '测试机器人安全性能' },
  { value: 'custom', label: '自定义测试', description: '使用自定义机器人测试脚本' },
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
  const [evaluationModalVisible, setEvaluationModalVisible] = useState(false);
  const [selectedRecord, setSelectedRecord] = useState(null);
  const [evaluationForm] = Form.useForm();
  const [evaluationLoading, setEvaluationLoading] = useState(false);
  const [records, setRecords] = useState(mockEvaluationRecords);

  // 处理开始测试
  const handleStartEvaluation = () => {
    setEvaluationModalVisible(true);
    evaluationForm.setFieldsValue({
      model: 'gpt-4-vision',
      testType: 'comprehensive',
      testCases: 1000,
      timeout: 300,
      description: '模型性能评估测试'
    });
  };

  // 处理测试弹窗确认
  const handleEvaluationSubmit = async (values) => {
    try {
      setEvaluationLoading(true);
      
      // 构建测试配置
      const evaluationConfig = {
        model: values.model,
        testType: values.testType,
        testCases: values.testCases,
        timeout: values.timeout,
        description: values.description,
        customScript: values.testType === 'custom' ? values.customScript : null,
      };
      
      console.log('测试配置:', evaluationConfig);
      
      // 模拟API调用
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // 创建新的测试记录
      const newRecord = {
        id: `eval-${Date.now()}`,
        name: values.description,
        model: availableModels.find(m => m.value === values.model)?.label || values.model,
        dataset: '机器人测试数据集',
        startTime: new Date().toLocaleString('zh-CN'),
        duration: '进行中...',
        status: 'running',
        accuracy: 'N/A',
        precision: 'N/A',
        recall: 'N/A',
        f1Score: 'N/A',
        testCases: values.testCases,
        passedCases: 0,
        failedCases: 0
      };
      
      setRecords([newRecord, ...records]);
      
      message.success('测试任务已成功创建！');
      setEvaluationModalVisible(false);
      evaluationForm.resetFields();
      
    } catch (error) {
      console.error('创建测试任务失败:', error);
      message.error('创建测试任务失败: ' + error.message);
    } finally {
      setEvaluationLoading(false);
    }
  };

  // 处理测试弹窗取消
  const handleEvaluationCancel = () => {
    setEvaluationModalVisible(false);
    setSelectedRecord(null);
    evaluationForm.resetFields();
  };

  // 处理菜单项点击
  const handleMenuClick = ({ key }, record) => {
    switch (key) {
      case 'details':
        setSelectedRecord(record);
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

  // 表格列定义
  const columns = [
    {
      title: '测试信息',
      key: 'testInfo',
      render: (_, record) => (
        <div className={styles.testInfo}>
          <div className={styles.testName}>{record.name}</div>
          <div className={styles.testMeta}>
            <Text type="secondary">ID: {record.id}</Text>
            <Text type="secondary">• {record.model}</Text>
            <Text type="secondary">• {record.dataset}</Text>
          </div>
        </div>
      ),
    },
    {
      title: '状态',
      key: 'status',
      render: (_, record) => <StatusDisplay status={record.status} />,
      filters: [
        { text: '已完成', value: 'completed' },
        { text: '进行中', value: 'running' },
        { text: '失败', value: 'failed' },
        { text: '等待中', value: 'pending' },
      ],
      onFilter: (value, record) => record.status === value,
    },
    {
      title: '准确率',
      key: 'accuracy',
      dataIndex: 'accuracy',
      sorter: (a, b) => {
        const aVal = parseFloat(a.accuracy.replace('%', '')) || 0;
        const bVal = parseFloat(b.accuracy.replace('%', '')) || 0;
        return aVal - bVal;
      },
    },
    {
      title: 'F1分数',
      key: 'f1Score',
      dataIndex: 'f1Score',
      sorter: (a, b) => {
        const aVal = parseFloat(a.f1Score.replace('%', '')) || 0;
        const bVal = parseFloat(b.f1Score.replace('%', '')) || 0;
        return aVal - bVal;
      },
    },
    {
      title: '测试用例',
      key: 'testCases',
      render: (_, record) => (
        <div>
          <Text>{record.testCases}</Text>
          <br />
          <Text type="secondary">
            通过: {record.passedCases} | 失败: {record.failedCases}
          </Text>
        </div>
      ),
    },
    {
      title: '开始时间',
      key: 'startTime',
      dataIndex: 'startTime',
      sorter: (a, b) => new Date(a.startTime) - new Date(b.startTime),
    },
    {
      title: '操作',
      key: 'actions',
      render: (_, record) => (
        <Space>
          <Tooltip title="查看详情">
            <Button 
              type="text" 
              shape="circle" 
              icon={<FileTextOutlined />} 
              onClick={() => setSelectedRecord(record)}
            />
          </Tooltip>
          <Dropdown 
            menu={{ 
              items: getMenuItems(record),
              onClick: (e) => handleMenuClick(e, record)
            }} 
            placement="bottomRight" 
            arrow
          >
            <Button type="text" shape="circle" icon={<MoreOutlined />} />
          </Dropdown>
        </Space>
      ),
    },
  ];

  return (
    <div className={styles.evaluationPage}>
      <div className={styles.contentWrapper}>
        <div className={styles.pageHeader}>
          <Title level={1} className={styles.pageTitle}>机器人模型评估测试</Title>
          <Text type="secondary">对训练好的机器人模型进行性能评估和仿真测试</Text>
          <Button 
            className={styles.startButton}
            type="primary"
            icon={<ExperimentOutlined />} 
            onClick={handleStartEvaluation}
            size="large"
          >
            开始新测试
          </Button>
        </div>

        {/* 统计信息 */}
        <Row gutter={16} className={styles.statsRow}>
          <Col span={6}>
            <Card>
              <Statistic
                title="总测试数"
                value={records.length}
                prefix={<ExperimentOutlined />}
              />
            </Card>
          </Col>
          <Col span={6}>
            <Card>
              <Statistic
                title="已完成"
                value={records.filter(r => r.status === 'completed').length}
                prefix={<CheckCircleOutlined />}
                valueStyle={{ color: '#3f8600' }}
              />
            </Card>
          </Col>
          <Col span={6}>
            <Card>
              <Statistic
                title="进行中"
                value={records.filter(r => r.status === 'running').length}
                prefix={<ClockCircleOutlined />}
                valueStyle={{ color: '#1890ff' }}
              />
            </Card>
          </Col>
          <Col span={6}>
            <Card>
              <Statistic
                title="失败"
                value={records.filter(r => r.status === 'failed').length}
                prefix={<CloseCircleOutlined />}
                valueStyle={{ color: '#cf1322' }}
              />
            </Card>
          </Col>
        </Row>

        {/* 测试记录表格 */}
        <Card title="机器人测试记录" className={styles.tableCard}>
          <Table
            columns={columns}
            dataSource={records}
            rowKey="id"
            pagination={{
              pageSize: 10,
              showSizeChanger: true,
              showQuickJumper: true,
              showTotal: (total, range) => `第 ${range[0]}-${range[1]} 条，共 ${total} 条`,
            }}
          />
        </Card>

        {/* 测试详情弹窗 */}
        <Modal
          title={
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <BarChartOutlined style={{ color: '#1677ff' }} />
              <span>测试详情</span>
            </div>
          }
          open={!!selectedRecord}
          onCancel={() => setSelectedRecord(null)}
          footer={[
            <Button key="close" onClick={() => setSelectedRecord(null)}>
              关闭
            </Button>,
            <Button key="download" type="primary" icon={<DownloadOutlined />}>
              下载报告
            </Button>
          ]}
          width={800}
        >
          {selectedRecord && (
            <div>
              <Descriptions title="基本信息" bordered column={2}>
                <Descriptions.Item label="测试ID">{selectedRecord.id}</Descriptions.Item>
                <Descriptions.Item label="测试名称">{selectedRecord.name}</Descriptions.Item>
                <Descriptions.Item label="模型">{selectedRecord.model}</Descriptions.Item>
                <Descriptions.Item label="数据集">{selectedRecord.dataset}</Descriptions.Item>
                <Descriptions.Item label="开始时间">{selectedRecord.startTime}</Descriptions.Item>
                <Descriptions.Item label="持续时间">{selectedRecord.duration}</Descriptions.Item>
                <Descriptions.Item label="状态">
                  <StatusDisplay status={selectedRecord.status} />
                </Descriptions.Item>
                <Descriptions.Item label="测试用例数">{selectedRecord.testCases}</Descriptions.Item>
              </Descriptions>

              <Divider />

              <Descriptions title="性能指标" bordered column={2}>
                <Descriptions.Item label="准确率">{selectedRecord.accuracy}</Descriptions.Item>
                <Descriptions.Item label="精确率">{selectedRecord.precision}</Descriptions.Item>
                <Descriptions.Item label="召回率">{selectedRecord.recall}</Descriptions.Item>
                <Descriptions.Item label="F1分数">{selectedRecord.f1Score}</Descriptions.Item>
              </Descriptions>

              <Divider />

              <div>
                <Text strong>测试用例统计</Text>
                <Row gutter={16} style={{ marginTop: 16 }}>
                  <Col span={8}>
                    <Card size="small">
                      <Statistic
                        title="总用例"
                        value={selectedRecord.testCases}
                        valueStyle={{ color: '#1890ff' }}
                      />
                    </Card>
                  </Col>
                  <Col span={8}>
                    <Card size="small">
                      <Statistic
                        title="通过"
                        value={selectedRecord.passedCases}
                        valueStyle={{ color: '#3f8600' }}
                      />
                    </Card>
                  </Col>
                  <Col span={8}>
                    <Card size="small">
                      <Statistic
                        title="失败"
                        value={selectedRecord.failedCases}
                        valueStyle={{ color: '#cf1322' }}
                      />
                    </Card>
                  </Col>
                </Row>
              </div>
            </div>
          )}
        </Modal>

        {/* 开始测试弹窗 */}
        <Modal
          title={
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <ExperimentOutlined style={{ color: '#1677ff' }} />
              <span>开始机器人模型测试</span>
            </div>
          }
          open={evaluationModalVisible}
          onCancel={handleEvaluationCancel}
          footer={null}
          width={800}
          destroyOnClose
        >
          <Form
            form={evaluationForm}
            layout="vertical"
            onFinish={handleEvaluationSubmit}
            initialValues={{
              model: 'gpt-4-vision',
              testType: 'comprehensive',
              testCases: 1000,
              timeout: 300,
            }}
          >
            <Row gutter={16}>
              <Col span={12}>
                <Form.Item
                  label="选择机器人模型"
                  name="model"
                  rules={[{ required: true, message: '请选择机器人测试模型' }]}
                >
                  <Select placeholder="选择机器人测试模型">
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
                  label="机器人测试类型"
                  name="testType"
                  rules={[{ required: true, message: '请选择机器人测试类型' }]}
                >
                  <Select placeholder="选择机器人测试类型">
                    {testTypes.map(type => (
                      <Option key={type.value} value={type.value}>
                        <div>
                          <div style={{ fontWeight: 'bold' }}>{type.label}</div>
                          <div style={{ fontSize: '12px', color: '#666' }}>{type.description}</div>
                        </div>
                      </Option>
                    ))}
                  </Select>
                </Form.Item>
              </Col>
            </Row>

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

            <Form.Item
              label="机器人测试描述"
              name="description"
              rules={[{ required: true, message: '请输入机器人测试描述' }]}
            >
              <Input placeholder="机器人测试任务描述" />
            </Form.Item>

            <Form.Item
              noStyle
              shouldUpdate={(prevValues, currentValues) => prevValues.testType !== currentValues.testType}
            >
              {({ getFieldValue }) => {
                const selectedTestType = getFieldValue('testType');
                return selectedTestType === 'custom' ? (
                  <Form.Item
                    label="自定义机器人测试脚本"
                    name="customScript"
                    rules={[{ required: true, message: '请输入自定义机器人测试脚本' }]}
                  >
                    <TextArea
                      rows={6}
                      placeholder="请输入自定义机器人测试脚本（Python代码）"
                    />
                  </Form.Item>
                ) : null;
              }}
            </Form.Item>

            <Divider />

            <div style={{ textAlign: 'right' }}>
              <Space>
                <Button onClick={handleEvaluationCancel}>
                  取消
                </Button>
                <Button 
                  type="primary" 
                  htmlType="submit"
                  loading={evaluationLoading}
                  icon={<ExperimentOutlined />}
                >
                  开始机器人测试
                </Button>
              </Space>
            </div>
          </Form>
        </Modal>
      </div>
    </div>
  );
};

export default EvaluationPage; 