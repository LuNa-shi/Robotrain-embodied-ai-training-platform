import React from 'react';
import { Typography, Card, Tag, Button, Tooltip, Space, Dropdown, Row, Col, message } from 'antd';
import { useNavigate } from 'react-router-dom';
import {
  InfoCircleOutlined,
  SyncOutlined,
  DownloadOutlined,
  DeleteOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  ClockCircleOutlined,
  PlusOutlined,
  ExperimentOutlined
} from '@ant-design/icons';
import styles from './ProjectCenter.module.css';

const { Title, Text } = Typography;

// 模拟训练记录数据
const mockTrainingRecords = [
  {
    id: 'train-20250625-001',
    name: '机器人视觉识别模型',
    dataset: '工业机器人视觉数据集',
    startTime: '2025-06-25 10:30',
    duration: '2h 15m',
    status: 'completed',
    accuracy: '98.5%',
  },
  {
    id: 'train-20250625-002',
    name: '机械臂动作控制模型',
    dataset: '机械臂动作控制数据',
    startTime: '2025-06-25 14:00',
    duration: '进行中...',
    status: 'running',
    accuracy: 'N/A',
  },
  {
    id: 'train-20250624-005',
    name: '机器人语音交互模型',
    dataset: '机器人语音指令数据集',
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

const ProjectCenterPage = () => {
  const navigate = useNavigate();

  const handleViewDetail = (trainingId) => {
    navigate(`/project-center/${trainingId}/progress`);
  };

  const handleDownload = (record) => {
    message.success(`开始下载模型: ${record.name}`);
    // 这里可以添加实际的下载逻辑
  };

  const handleDelete = (record) => {
    message.success(`删除项目: ${record.name}`);
    // 这里可以添加实际的删除逻辑
  };

  const handleStartEvaluation = async (record) => {
    try {
      // 构建评估配置 - 使用项目默认参数
      const evaluationConfig = {
        trained_project_id: record.id,
        trained_project_name: record.name,
        dataset: record.dataset,
        parameters: {
          testCases: 1000,
          timeout: 300,
          batchSize: 32,
          threshold: 0.8,
        },
        description: `机器人模型评估 - ${record.name}`,
      };
      
      console.log('评估配置:', evaluationConfig);
      
      // 模拟API调用
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // 生成评估ID（模拟后端返回）
      const evaluationId = `eval-${Date.now()}-${Math.floor(Math.random() * 1000).toString().padStart(3, '0')}`;
      
      message.success(`评估任务 ${evaluationId} 创建成功！`);
      
      // 可以在这里跳转到评估页面查看详情
      // navigate(`/evaluation/${evaluationId}`);
      
    } catch (error) {
      console.error('创建评估任务失败:', error);
      message.error('创建评估任务失败: ' + error.message);
    }
  };


  
  return (
    <div className={styles.projectCenterPage}>
      <div className={styles.contentWrapper}>
      <div className={styles.pageHeader}>
        <Title level={1} className={styles.pageTitle}>项目中心</Title>
          <Text type="secondary">查看和管理您的机器人模型训练历史</Text>
      </div>
      
      <div className={styles.recordList}>
        {mockTrainingRecords.map(record => (
          <Card 
            key={record.id} 
            className={styles.recordCard}
            hoverable
            onClick={() => handleViewDetail(record.id)}
          >
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
                  <Text type="secondary">机器人数据集:</Text>
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
                {record.status === 'completed' && (
                  <Tooltip title="发起评估">
                    <Button 
                      type="text" 
                      shape="circle" 
                      icon={<ExperimentOutlined />} 
                      onClick={(e) => {
                        e.stopPropagation();
                        handleStartEvaluation(record);
                      }}
                    />
                  </Tooltip>
                )}
                <Tooltip title="下载模型">
                  <Button 
                    type="text" 
                    shape="circle" 
                    icon={<DownloadOutlined />} 
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDownload(record);
                    }}
                  />
                </Tooltip>
                <Tooltip title="删除项目">
                  <Button 
                    type="text" 
                    shape="circle" 
                    icon={<DeleteOutlined />} 
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDelete(record);
                    }}
                  />
                </Tooltip>
              </Space>
            </div>
          </Card>
        ))}
        </div>
      </div>
    </div>
  );
};

export default ProjectCenterPage;
