import React, { useState, useEffect } from 'react';
import { Typography, Card, Tag, Button, Tooltip, Space, Dropdown, Row, Col, message, Spin } from 'antd';
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
import { trainTasksAPI } from '@/utils/api';

const { Title, Text } = Typography;

// 默认的训练记录数据（作为备用）
const defaultTrainingRecords = [];

// 根据状态返回不同的Tag和Icon
const StatusDisplay = ({ status }) => {
  const statusMap = {
    completed: { color: 'success', text: '已完成', icon: <CheckCircleOutlined /> },
    running: { color: 'processing', text: '进行中', icon: <SyncOutlined spin /> },
    failed: { color: 'error', text: '失败', icon: <CloseCircleOutlined /> },
    pending: { color: 'default', text: '等待中', icon: <ClockCircleOutlined /> },
  };
  const { color, text, icon } = statusMap[status] || { color: 'default', text: '未知', icon: <ClockCircleOutlined /> };
  return <Tag icon={icon} color={color}>{text}</Tag>;
};

const ProjectCenterPage = () => {
  const navigate = useNavigate();
  const [trainingRecords, setTrainingRecords] = useState(defaultTrainingRecords);
  const [loading, setLoading] = useState(false);

  // 获取训练任务列表
  const fetchTrainingTasks = async () => {
    try {
      setLoading(true);
      const data = await trainTasksAPI.getMyTasks();
      
      // 将后端数据格式转换为前端需要的格式
      const formattedRecords = data.map(task => ({
        id: task.id.toString(),
        name: `训练任务 ${task.id}`,
        dataset: `数据集 ${task.dataset_id}`,
        startTime: new Date(task.create_time).toLocaleString('zh-CN'),
        duration: task.status === 'running' ? '进行中...' : 'N/A',
        status: task.status,
        accuracy: 'N/A', // 后端数据中没有准确率字段
        // 保存原始数据用于后续操作
        originalData: task
      }));
      
      setTrainingRecords(formattedRecords);
      console.log('获取训练任务列表成功:', formattedRecords);
    } catch (err) {
      console.error('获取训练任务列表失败:', err);
      message.error('获取训练任务列表失败: ' + err.message);
      // 如果获取失败，使用空列表
      setTrainingRecords([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTrainingTasks();
  }, []);

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
        {loading ? (
          <div style={{ textAlign: 'center', padding: '50px' }}>
            <Spin size="large" />
            <div style={{ marginTop: '16px' }}>加载中...</div>
          </div>
        ) : trainingRecords.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '50px' }}>
            <InfoCircleOutlined style={{ fontSize: '48px', color: '#1890ff', marginBottom: '16px' }} />
            <Title level={4}>暂无训练项目</Title>
            <Text type="secondary" style={{ display: 'block', marginBottom: '24px' }}>
              您还没有创建任何训练项目，请先创建训练项目
            </Text>
            <Button type="primary" onClick={() => navigate('/training')}>
              发起训练
            </Button>
          </div>
        ) : (
          trainingRecords.map(record => (
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
        ))
        )}
        </div>
      </div>
    </div>
  );
};

export default ProjectCenterPage;
