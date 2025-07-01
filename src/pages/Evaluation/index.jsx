import React, { useState, useEffect } from 'react';
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
  Descriptions
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
  ExperimentOutlined
} from '@ant-design/icons';
import styles from './Evaluation.module.css';

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
  const [selectedRecord, setSelectedRecord] = useState(null);
  const [records, setRecords] = useState(mockEvaluationRecords);



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
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <Title level={1} className={styles.pageTitle}>机器人模型评估测试</Title>
              <Text type="secondary">查看机器人模型的性能评估和仿真测试结果</Text>
            </div>
            <Button 
              type="primary" 
              icon={<ExperimentOutlined />}
              onClick={() => navigate('/evaluation-create')}
            >
              发起评估
            </Button>
          </div>
        </div>

        {/* 统计信息 */}
        <Row gutter={16} className={styles.statsRow}>
          <Col span={6}>
            <Card>
              <Statistic
                title="总测试数"
                value={records.length}
                prefix={<BarChartOutlined />}
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


      </div>
    </div>
  );
};

export default EvaluationPage; 