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
  message
} from 'antd';
import {
  SearchOutlined,
  FilterOutlined,
  DownloadOutlined,
  DeleteOutlined,
  EyeOutlined,
  UserOutlined,
  DatabaseOutlined,
  ReloadOutlined,
  MoreOutlined
} from '@ant-design/icons';
import styles from './DataManagement.module.css';

const { Title, Text } = Typography;
const { Search } = Input;
const { Option } = Select;

// 模拟所有用户的数据记录
const mockAllUserDataRecords = [
  {
    id: 'ds-20250625-001',
    name: '无人机航拍数据集',
    username: 'admin',
    userAvatar: null,
    uploadTime: '2025-06-25 10:30:15',
    fileSize: '2.5GB',
    fileType: '图像数据',
    status: 'unused',
    recordCount: 15000,
  },
  {
    id: 'ds-20250624-007',
    name: '医疗影像-CT扫描',
    username: 'zhang_wei',
    userAvatar: null,
    uploadTime: '2025-06-24 18:45:00',
    fileSize: '8.7GB',
    fileType: '医疗数据',
    status: 'training',
    recordCount: 5000,
  },
  {
    id: 'ds-20250623-003',
    name: '客户服务对话日志',
    username: 'li_ming',
    userAvatar: null,
    uploadTime: '2025-06-23 09:12:55',
    fileSize: '1.2GB',
    fileType: '文本数据',
    status: 'archived',
    recordCount: 25000,
  },
  {
    id: 'ds-20250622-011',
    name: '自动驾驶传感器数据',
    username: 'wang_fang',
    userAvatar: null,
    uploadTime: '2025-06-22 22:05:10',
    fileSize: '15.3GB',
    fileType: '传感器数据',
    status: 'error',
    recordCount: 80000,
  },
  {
    id: 'ds-20250621-005',
    name: '语音识别训练集',
    username: 'chen_li',
    userAvatar: null,
    uploadTime: '2025-06-21 14:20:30',
    fileSize: '5.8GB',
    fileType: '音频数据',
    status: 'unused',
    recordCount: 12000,
  },
  {
    id: 'ds-20250620-009',
    name: '推荐系统用户行为',
    username: 'admin',
    userAvatar: null,
    uploadTime: '2025-06-20 11:15:45',
    fileSize: '3.1GB',
    fileType: '行为数据',
    status: 'training',
    recordCount: 45000,
  },
];

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

const DataManagementPage = () => {
  const [loading, setLoading] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [userFilter, setUserFilter] = useState('all');

  // 统计数据
  const totalRecords = mockAllUserDataRecords.length;
  const totalSize = mockAllUserDataRecords.reduce((sum, record) => {
    const size = parseFloat(record.fileSize.replace('GB', ''));
    return sum + size;
  }, 0);
  const activeUsers = new Set(mockAllUserDataRecords.map(record => record.username)).size;

  // 过滤数据
  const filteredData = mockAllUserDataRecords.filter(record => {
    const matchesSearch = record.name.toLowerCase().includes(searchText.toLowerCase()) ||
                         record.username.toLowerCase().includes(searchText.toLowerCase()) ||
                         record.id.toLowerCase().includes(searchText.toLowerCase());
    const matchesStatus = statusFilter === 'all' || record.status === statusFilter;
    const matchesUser = userFilter === 'all' || record.username === userFilter;
    
    return matchesSearch && matchesStatus && matchesUser;
  });

  // 表格列定义
  const columns = [
    {
      title: '数据集信息',
      key: 'dataset',
      render: (_, record) => (
        <div className={styles.datasetInfo}>
          <div className={styles.datasetName}>{record.name}</div>
          <div className={styles.datasetMeta}>
            <Text type="secondary">ID: {record.id}</Text>
            <Text type="secondary">• {record.fileType}</Text>
            <Text type="secondary">• {record.recordCount.toLocaleString()} 条记录</Text>
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
      title: '文件大小',
      key: 'fileSize',
      dataIndex: 'fileSize',
      sorter: (a, b) => {
        const sizeA = parseFloat(a.fileSize.replace('GB', ''));
        const sizeB = parseFloat(b.fileSize.replace('GB', ''));
        return sizeA - sizeB;
      },
    },
    {
      title: '上传时间',
      key: 'uploadTime',
      dataIndex: 'uploadTime',
      sorter: (a, b) => new Date(a.uploadTime) - new Date(b.uploadTime),
    },
    {
      title: '状态',
      key: 'status',
      render: (_, record) => <StatusTag status={record.status} />,
      filters: [
        { text: '未使用', value: 'unused' },
        { text: '训练中', value: 'training' },
        { text: '已归档', value: 'archived' },
        { text: '校验失败', value: 'error' },
      ],
      onFilter: (value, record) => record.status === value,
    },
    {
      title: '操作',
      key: 'actions',
      render: (_, record) => (
        <Space>
          <Tooltip title="查看详情">
            <Button type="text" shape="circle" icon={<EyeOutlined />} />
          </Tooltip>
          <Tooltip title="下载">
            <Button type="text" shape="circle" icon={<DownloadOutlined />} />
          </Tooltip>
          <Dropdown
            menu={{
              items: [
                { key: 'details', label: '查看详情', icon: <EyeOutlined /> },
                { key: 'download', label: '下载', icon: <DownloadOutlined /> },
                { type: 'divider' },
                { key: 'delete', label: '删除', danger: true, icon: <DeleteOutlined /> },
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
    <div className={styles.dataManagementPage}>
      <div className={styles.contentWrapper}>
        <div className={styles.pageHeader}>
          <Title level={1} className={styles.pageTitle}>数据管理</Title>
          <Text type="secondary">管理员查看和管理所有用户的数据集</Text>
        </div>

        {/* 统计卡片 */}
        <Row gutter={16} className={styles.statsRow}>
          <Col xs={24}>
            <Card className={styles.statCard}>
              <div className={styles.statsContainer}>
                <div className={styles.statItem}>
                  <DatabaseOutlined className={styles.statIcon} />
                  <div className={styles.statInfo}>
                    <div className={styles.statLabel}>总数据集</div>
                    <div className={styles.statValue}>{totalRecords} 个</div>
                  </div>
                </div>
                <div className={styles.statItem}>
                  <DatabaseOutlined className={styles.statIcon} />
                  <div className={styles.statInfo}>
                    <div className={styles.statLabel}>总存储量</div>
                    <div className={styles.statValue}>{totalSize.toFixed(1)} GB</div>
                  </div>
                </div>
                <div className={styles.statItem}>
                  <UserOutlined className={styles.statIcon} />
                  <div className={styles.statInfo}>
                    <div className={styles.statLabel}>活跃用户</div>
                    <div className={styles.statValue}>{activeUsers} 人</div>
                  </div>
                </div>
              </div>
            </Card>
          </Col>
        </Row>

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
                <Option value="unused">未使用</Option>
                <Option value="training">训练中</Option>
                <Option value="archived">已归档</Option>
                <Option value="error">校验失败</Option>
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
                {Array.from(new Set(mockAllUserDataRecords.map(record => record.username))).map(username => (
                  <Option key={username} value={username}>{username}</Option>
                ))}
              </Select>
            </Col>
            <Col xs={24} sm={8}>
              <Search
                placeholder="搜索数据集名称、用户或ID"
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
            dataSource={filteredData}
            rowKey="id"
            loading={loading}
            pagination={{
              total: filteredData.length,
              pageSize: 10,
              showSizeChanger: true,
              showQuickJumper: true,
              showTotal: (total, range) => `第 ${range[0]}-${range[1]} 条，共 ${total} 条`,
            }}
            scroll={{ x: 1200 }}
          />
        </Card>
      </div>
    </div>
  );
};

export default DataManagementPage; 