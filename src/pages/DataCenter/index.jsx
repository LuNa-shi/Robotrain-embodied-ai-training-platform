import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
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
  SettingOutlined
} from '@ant-design/icons';
import { datasetsAPI } from '@/utils/api';
import styles from './DataCenter.module.css';

const { Title, Text } = Typography;

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


const DataCenterPage = () => {
  const navigate = useNavigate();
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

  // 处理发起训练 - 跳转到训练页面
  const handleStartTraining = (dataset) => {
    // 跳转到训练页面，并传递选中的数据集信息
    navigate(`/training?dataset=${dataset.id}`);
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
    <div className={styles.dataCenterPage}>
      <div className={styles.contentWrapper}>
        <div className={styles.pageHeader}>
          <Title level={1} className={styles.pageTitle}>数据中心</Title>
          <Text type="secondary">管理您上传的机器人训练数据集和文件</Text>
        </div>
        
        {/* 静态数据提示 */}
        <Alert
          message="机器人训练演示模式"
          description="当前使用机器人相关静态数据展示，点击任意机器人数据集的发起训练按钮可跳转到训练页面。"
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
    </div>
  );
};

export default DataCenterPage;
