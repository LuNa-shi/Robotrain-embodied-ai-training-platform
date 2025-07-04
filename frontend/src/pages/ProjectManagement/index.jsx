import React, { useState } from 'react';
import { 
  Typography, 
  Table, 
  Tag, 
  Button, 
  Space, 
  Tooltip, 
  Input, 
  Select, 
  Card,
  Row,
  Col,
  Avatar,
  Dropdown,
  Progress,
  message,
  Pagination
} from 'antd';
import {
  SearchOutlined,
  FilterOutlined,
  DownloadOutlined,
  DeleteOutlined,
  EyeOutlined,
  UserOutlined,
  PlaySquareOutlined,
  ReloadOutlined,
  MoreOutlined,
  SyncOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  ClockCircleOutlined
} from '@ant-design/icons';
import styles from './ProjectManagement.module.css';

const { Title, Text } = Typography;
const { Search } = Input;
const { Option } = Select;

// 模拟所有用户的训练记录
const mockAllUserTrainingRecords = [
  {
    id: 'train-20250625-001',
    name: '图像识别-模型A',
    username: 'admin',
    userAvatar: null,
    dataset: '无人机航拍数据集',
    startTime: '2025-06-25 10:30',
    endTime: '2025-06-25 12:45',
    duration: '2h 15m',
    status: 'completed',
    accuracy: '98.5%',
    progress: 100,
    gpuUsage: '85%',
    memoryUsage: '12GB',
  },
  {
    id: 'train-20250625-002',
    name: '路径规划-AlphaGo',
    username: 'zhang_wei',
    userAvatar: null,
    dataset: '棋谱数据集-v3',
    startTime: '2025-06-25 14:00',
    endTime: null,
    duration: '进行中...',
    status: 'running',
    accuracy: 'N/A',
    progress: 65,
    gpuUsage: '92%',
    memoryUsage: '16GB',
  },
  {
    id: 'train-20250624-005',
    name: '自然语言生成模型',
    username: 'li_ming',
    userAvatar: null,
    dataset: '客户服务对话日志',
    startTime: '2025-06-24 09:00',
    endTime: '2025-06-24 09:45',
    duration: '45m',
    status: 'failed',
    accuracy: '20.1%',
    progress: 0,
    gpuUsage: '0%',
    memoryUsage: '0GB',
  },
  {
    id: 'train-20250624-003',
    name: '语音识别-中文模型',
    username: 'wang_fang',
    userAvatar: null,
    dataset: '语音识别训练集',
    startTime: '2025-06-24 16:30',
    endTime: '2025-06-24 18:20',
    duration: '1h 50m',
    status: 'completed',
    accuracy: '96.2%',
    progress: 100,
    gpuUsage: '78%',
    memoryUsage: '14GB',
  },
  {
    id: 'train-20250623-008',
    name: '推荐系统-协同过滤',
    username: 'chen_li',
    userAvatar: null,
    dataset: '推荐系统用户行为',
    startTime: '2025-06-23 20:00',
    endTime: '2025-06-24 02:30',
    duration: '6h 30m',
    status: 'completed',
    accuracy: '89.7%',
    progress: 100,
    gpuUsage: '45%',
    memoryUsage: '8GB',
  },
  {
    id: 'train-20250623-012',
    name: '自动驾驶-感知模型',
    username: 'admin',
    userAvatar: null,
    dataset: '自动驾驶传感器数据',
    startTime: '2025-06-23 10:00',
    endTime: null,
    duration: '进行中...',
    status: 'running',
    accuracy: 'N/A',
    progress: 32,
    gpuUsage: '95%',
    memoryUsage: '18GB',
  },
];

// 根据状态返回不同的Tag和Icon
const StatusDisplay = ({ status, progress }) => {
  const statusMap = {
    completed: { color: 'success', text: '已完成', icon: <CheckCircleOutlined /> },
    running: { color: 'processing', text: '进行中', icon: <SyncOutlined spin /> },
    failed: { color: 'error', text: '失败', icon: <CloseCircleOutlined /> },
  };
  const { color, text, icon } = statusMap[status] || { color: 'default', text: '未知', icon: <ClockCircleOutlined /> };
  
  return (
    <div className={styles.statusDisplay}>
      <Tag icon={icon} color={color}>{text}</Tag>
      {status === 'running' && (
        <Progress 
          percent={progress} 
          size="small" 
          showInfo={false}
          strokeColor="#1890ff"
          style={{ marginTop: 4, width: 60 }}
        />
      )}
    </div>
  );
};

const ProjectManagementPage = () => {
  const [loading, setLoading] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [userFilter, setUserFilter] = useState('all');
  // 分页相关状态
  const [current, setCurrent] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  // 统计数据
  const totalRecords = mockAllUserTrainingRecords.length;
  const completedRecords = mockAllUserTrainingRecords.filter(record => record.status === 'completed').length;
  const runningRecords = mockAllUserTrainingRecords.filter(record => record.status === 'running').length;
  const failedRecords = mockAllUserTrainingRecords.filter(record => record.status === 'failed').length;
  const activeUsers = new Set(mockAllUserTrainingRecords.map(record => record.username)).size;

  // 过滤数据
  const filteredData = mockAllUserTrainingRecords.filter(record => {
    const matchesSearch = record.name.toLowerCase().includes(searchText.toLowerCase()) ||
                         record.username.toLowerCase().includes(searchText.toLowerCase()) ||
                         record.id.toLowerCase().includes(searchText.toLowerCase()) ||
                         record.dataset.toLowerCase().includes(searchText.toLowerCase());
    const matchesStatus = statusFilter === 'all' || record.status === statusFilter;
    const matchesUser = userFilter === 'all' || record.username === userFilter;
    
    return matchesSearch && matchesStatus && matchesUser;
  });
  // 当前页数据
  const pagedData = filteredData.slice((current - 1) * pageSize, current * pageSize);

  // 表格列定义
  const columns = [
    {
      title: '训练项目信息',
      key: 'training',
      render: (_, record) => (
        <div className={styles.trainingInfo}>
          <div className={styles.trainingName}>{record.name}</div>
          <div className={styles.trainingMeta}>
            <Text type="secondary">ID: {record.id}</Text>
            <Text type="secondary">• 数据集: {record.dataset}</Text>
          </div>
        </div>
      ),
    },
    {
      title: '用户',
      key: 'user',
      render: (_, record) => (
        <div className={styles.userInfo}>
          <Avatar size="small" icon={<UserOutlined />} />
          <Text style={{ marginLeft: 8 }}>{record.username}</Text>
        </div>
      ),
    },
    {
      title: '状态',
      key: 'status',
      render: (_, record) => <StatusDisplay status={record.status} progress={record.progress} />,
      filters: [
        { text: '已完成', value: 'completed' },
        { text: '进行中', value: 'running' },
        { text: '失败', value: 'failed' },
      ],
      onFilter: (value, record) => record.status === value,
    },
    {
      title: '准确率',
      key: 'accuracy',
      dataIndex: 'accuracy',
      render: (accuracy, record) => {
        if (record.status === 'running') {
          return <Text type="secondary">训练中...</Text>;
        }
        return accuracy;
      },
      sorter: (a, b) => {
        if (a.status === 'running' || b.status === 'running') return 0;
        const accA = parseFloat(a.accuracy.replace('%', ''));
        const accB = parseFloat(b.accuracy.replace('%', ''));
        return accA - accB;
      },
    },
    {
      title: '开始时间',
      key: 'startTime',
      dataIndex: 'startTime',
      sorter: (a, b) => new Date(a.startTime) - new Date(b.startTime),
    },
    {
      title: '用时',
      key: 'duration',
      dataIndex: 'duration',
    },
    {
      title: '资源使用',
      key: 'resources',
      render: (_, record) => (
        <div className={styles.resourceInfo}>
          <div>GPU: {record.gpuUsage}</div>
          <div>内存: {record.memoryUsage}</div>
        </div>
      ),
    },
    {
      title: '操作',
      key: 'actions',
      render: (_, record) => (
        <Space>
          <Tooltip title="查看详情">
            <Button type="text" shape="circle" icon={<EyeOutlined />} />
          </Tooltip>
          {record.status === 'completed' && (
            <Tooltip title="下载模型">
              <Button type="text" shape="circle" icon={<DownloadOutlined />} />
            </Tooltip>
          )}
          {record.status === 'running' && (
            <Tooltip title="停止训练">
              <Button type="text" shape="circle" icon={<SyncOutlined />} />
            </Tooltip>
          )}
          <Dropdown
            menu={{
              items: [
                { key: 'details', label: '查看详情', icon: <EyeOutlined /> },
                ...(record.status === 'completed' ? [{ key: 'download', label: '下载模型', icon: <DownloadOutlined /> }] : []),
                ...(record.status === 'running' ? [{ key: 'stop', label: '停止训练', icon: <SyncOutlined /> }] : []),
                { key: 'restart', label: '重新训练', icon: <SyncOutlined /> },
                { type: 'divider' },
                { key: 'delete', label: '删除记录', danger: true, icon: <DeleteOutlined /> },
              ],
              onClick: ({ key }) => {
                if (key === 'delete') {
                  message.warning('删除功能需要确认');
                } else {
                  message.info(`执行操作: ${key}`);
                }
              }
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

  const handleSearch = (value) => {
    setSearchText(value);
  };

  const handleRefresh = () => {
    setLoading(true);
    setTimeout(() => {
      setLoading(false);
      message.success('数据已刷新');
    }, 1000);
  };

  return (
    <div className={styles.projectManagementPage}>
      <div className={styles.contentWrapper}>
        <div className={styles.pageHeader}>
          <Title level={1} className={styles.pageTitle}>项目管理</Title>
          <Text type="secondary">管理员查看和管理所有用户的训练项目</Text>
        </div>

        {/* 搜索和过滤 */}
        <Card className={styles.filterCard}>
          <Row gutter={16} align="middle" justify="center">
            <Col xs={24} sm={4}>
              <Select
                placeholder="状态筛选"
                value={statusFilter}
                onChange={setStatusFilter}
                style={{ width: '100%' }}
                allowClear
              >
                <Option value="all">全部状态</Option>
                <Option value="completed">已完成</Option>
                <Option value="running">进行中</Option>
                <Option value="failed">失败</Option>
              </Select>
            </Col>
            <Col xs={24} sm={4}>
              <Select
                placeholder="用户筛选"
                value={userFilter}
                onChange={setUserFilter}
                style={{ width: '100%' }}
                allowClear
              >
                <Option value="all">全部用户</Option>
                {Array.from(new Set(mockAllUserTrainingRecords.map(record => record.username))).map(username => (
                  <Option key={username} value={username}>{username}</Option>
                ))}
              </Select>
            </Col>
            <Col xs={24} sm={8}>
              <Search
                placeholder="搜索任务名称、用户、数据集或ID"
                allowClear
                onSearch={handleSearch}
                style={{ width: '100%' }}
              />
            </Col>
            <Col xs={24} sm={8}>
              <Space>
                <Button 
                  icon={<ReloadOutlined />} 
                  onClick={handleRefresh}
                  loading={loading}
                >
                  刷新
                </Button>
                <Button icon={<FilterOutlined />}>
                  高级筛选
                </Button>
              </Space>
            </Col>
          </Row>
        </Card>

        {/* 数据表格 */}
        <Card className={styles.tableCard}>
          <Table
            columns={columns}
            dataSource={pagedData}
            rowKey="id"
            loading={loading}
            pagination={false}
            scroll={{ x: 1400 }}
          />
          <div className={styles.paginationWrapper}>
            <Pagination
              current={current}
              pageSize={pageSize}
              total={filteredData.length}
              showSizeChanger
              showQuickJumper
              showTotal={(total, range) => `第 ${range[0]}-${range[1]} 条，共 ${total} 条`}
              onChange={(page, size) => {
                setCurrent(page);
                setPageSize(size);
              }}
              pageSizeOptions={["10", "20", "50", "100"]}
            />
          </div>
        </Card>
      </div>
    </div>
  );
};

export default ProjectManagementPage; 