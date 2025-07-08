import React from 'react';
import { Typography, Card, Tag, Button, Tooltip, Space, Dropdown } from 'antd';
import {
  InfoCircleOutlined,
  PlayCircleOutlined,
  DownloadOutlined,
  EditOutlined,
  DeleteOutlined,
  MoreOutlined
} from '@ant-design/icons';
import styles from './DataRecords.module.css';

const { Title, Text } = Typography;

// 模拟数据记录
const mockDataRecords = [
  {
    id: 'ds-20250625-001',
    name: '无人机航拍数据集',
    uploadTime: '2025-06-25 10:30:15',
    status: 'unused',
  },
  {
    id: 'ds-20250624-007',
    name: '医疗影像-CT扫描',
    uploadTime: '2025-06-24 18:45:00',
    status: 'training',
  },
  {
    id: 'ds-20250623-003',
    name: '客户服务对话日志',
    uploadTime: '2025-06-23 09:12:55',
    status: 'archived',
  },
  {
    id: 'ds-20250622-011',
    name: '自动驾驶传感器数据',
    uploadTime: '2025-06-22 22:05:10',
    status: 'error',
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


const DataRecordsPage = () => {

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
          <Text type="secondary">管理您上传的数据集和文件</Text>
        </div>
      
      <div className={styles.recordList}>
        {mockDataRecords.map(record => (
          <Card key={record.id} className={styles.recordCard}>
            <div className={styles.cardHeader}>
              <Text type="secondary">编号: {record.id}</Text>
              <StatusTag status={record.status} />
            </div>
            <div className={styles.cardContent}>
              <Title level={5} className={styles.datasetName}>{record.name}</Title>
              <Text type="secondary">上传于: {record.uploadTime}</Text>
            </div>
            <div className={styles.cardActions}>
              <Space>
                <Tooltip title="查看详情">
                  <Button type="text" shape="circle" icon={<InfoCircleOutlined />} />
                </Tooltip>
                <Tooltip title="发起训练">
                  <Button type="text" shape="circle" icon={<PlayCircleOutlined />} />
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

export default DataRecordsPage;
