import React from 'react';
import { Typography, Card, Tag, Button, Tooltip, Space, Dropdown, Row, Col } from 'antd';
import { useNavigate } from 'react-router-dom';
import {
  InfoCircleOutlined,
  SyncOutlined,
  DownloadOutlined,
  DeleteOutlined,
  MoreOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  ClockCircleOutlined,
  PlusOutlined
} from '@ant-design/icons';
import styles from './TrainingRecords.module.css';

const { Title, Text } = Typography;

// 模拟训练记录数据
const mockTrainingRecords = [
  {
    id: 'train-20250625-001',
    name: '图像识别-模型A',
    dataset: '无人机航拍数据集',
    startTime: '2025-06-25 10:30',
    duration: '2h 15m',
    status: 'completed',
    accuracy: '98.5%',
  },
  {
    id: 'train-20250625-002',
    name: '路径规划-AlphaGo',
    dataset: '棋谱数据集-v3',
    startTime: '2025-06-25 14:00',
    duration: '进行中...',
    status: 'running',
    accuracy: 'N/A',
  },
  {
    id: 'train-20250624-005',
    name: '自然语言生成模型',
    dataset: '客户服务对话日志',
    startTime: '2025-06-24 09:00',
    duration: '45m',
    status: 'failed',
    accuracy: '20.1%',
  },
];

// 根据状态返回不同的Tag和Icon
const StatusDisplay = ({ status }) => {
  const statusMap = {
    completed: { color: 'success', text: '已完成', icon: <CheckCircleOutlined /> },
    running: { color: 'processing', text: '进行中', icon: <SyncOutlined spin /> },
    failed: { color: 'error', text: '失败', icon: <CloseCircleOutlined /> },
  };
  const { color, text, icon } = statusMap[status] || { color: 'default', text: '未知', icon: <ClockCircleOutlined /> };
  return <Tag icon={icon} color={color}>{text}</Tag>;
};

const TrainingRecordsPage = () => {
  const navigate = useNavigate();

  const handleViewDetail = (trainingId) => {
    navigate(`/training-records/${trainingId}`);
  };

  const getMenuItems = (record) => [
    { key: 'download', label: '下载模型', icon: <DownloadOutlined /> },
    { key: 'delete', label: '删除记录', danger: true, icon: <DeleteOutlined /> },
  ];
  
  return (
    <div className={styles.trainingRecordsPage}>
      <div className={styles.contentWrapper}>
      <div className={styles.pageHeader}>
        <Title level={1} className={styles.pageTitle}>训练记录</Title>
          <Text type="secondary">查看和管理您的模型训练历史</Text>
      </div>
      
      <div className={styles.recordList}>
        {mockTrainingRecords.map(record => (
          <Card key={record.id} className={styles.recordCard}>
            {/* 上方部分 */}
            <div className={styles.cardHeader}>
              <Text type="secondary">编号: {record.id}</Text>
              <StatusDisplay status={record.status} />
            </div>

            {/* 中间部分 */}
            <div className={styles.cardBody}>
              <Title level={5} className={styles.recordName}>{record.name}</Title>
              <Row gutter={[48, 16]} className={styles.infoGrid}>
                <Col span={12}>
                  <Text type="secondary">数据集:</Text>
                  <Text>{record.dataset}</Text>
                </Col>
                <Col span={12}>
                  <Text type="secondary">准确率:</Text>
                  <Text>{record.accuracy}</Text>
                </Col>
                <Col span={12}>
                  <Text type="secondary">开始时间:</Text>
                  <Text>{record.startTime}</Text>
                </Col>
                <Col span={12}>
                  <Text type="secondary">
                    {record.status === 'running' ? '累计用时:' : '总计用时:'}
                  </Text>
                  <Text>{record.duration}</Text>
                </Col>
              </Row>
            </div>

            {/* 下方部分 */}
            <div className={styles.cardFooter}>
              <Space>
                <Tooltip title="查看详情">
                  <Button 
                    type="text" 
                    shape="circle" 
                    icon={<InfoCircleOutlined />} 
                    onClick={() => handleViewDetail(record.id)}
                  />
                </Tooltip>
                <Tooltip title="重新训练">
                  <Button type="text" shape="circle" icon={<SyncOutlined />} />
                </Tooltip>
                <Dropdown menu={{ items: getMenuItems(record) }} placement="bottomRight" arrow>
                  <Button type="text" shape="circle" icon={<MoreOutlined />} />
                </Dropdown>
              </Space>
            </div>
          </Card>
        ))}
        </div>
      </div>
    </div>
  );
};

export default TrainingRecordsPage;
