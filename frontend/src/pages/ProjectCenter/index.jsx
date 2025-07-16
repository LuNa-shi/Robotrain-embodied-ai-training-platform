import React, { useState, useEffect, useCallback } from 'react';
import { Typography, Card, Tag, Button, Tooltip, Space, Dropdown, Row, Col, message, Spin, App } from 'antd';
import { useNavigate } from 'react-router-dom';
import {
  InfoCircleOutlined,
  SyncOutlined,
  DownloadOutlined,
  DeleteOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  ClockCircleOutlined,
  PlusOutlined
} from '@ant-design/icons';
import styles from './ProjectCenter.module.css';
import { trainTasksAPI, modelsAPI, deleteTrainTask } from '@/utils/api';

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
  const { message, modal } = App.useApp();
  const navigate = useNavigate();
  const [trainingRecords, setTrainingRecords] = useState(defaultTrainingRecords);
  const [loading, setLoading] = useState(false);
  const [modelTypes, setModelTypes] = useState([]);
  const [modelTypesLoading, setModelTypesLoading] = useState(false);
  const [downloadingStates, setDownloadingStates] = useState({});
  const [deletingId, setDeletingId] = useState(null);

  // 获取模型类型列表
  const fetchModelTypes = async () => {
    try {
      setModelTypesLoading(true);
      const data = await modelsAPI.getAllModelTypes();
      setModelTypes(data);
      console.log('获取模型类型列表成功:', data);
    } catch (err) {
      console.error('获取模型类型列表失败:', err);
      // 如果获取失败，使用空列表
      setModelTypes([]);
    } finally {
      setModelTypesLoading(false);
    }
  };

  // 获取训练项目列表
  const fetchTrainingTasks = async () => {
    try {
      setLoading(true);
      const data = await trainTasksAPI.getMyTasks();
      
      // 将后端数据格式转换为前端需要的格式
      const formattedRecords = data.map(task => {
        // 获取模型类型名称
        const modelType = modelTypes.find(mt => mt.id === task.model_type_id);
        const modelTypeName = modelType ? modelType.type_name : '未知模型';
        
        // 计算训练时长
        let duration = 'N/A';
        if (task.status === 'completed' && task.start_time && task.end_time) {
          const startTime = new Date(task.start_time);
          const endTime = new Date(task.end_time);
          const diffMs = endTime - startTime;
          const diffSeconds = Math.floor(diffMs / 1000);
          const diffMinutes = Math.floor(diffSeconds / 60);
          const diffHours = Math.floor(diffMinutes / 60);
          
          if (diffHours > 0) {
            duration = `${diffHours}小时${diffMinutes % 60}分钟`;
          } else if (diffMinutes > 0) {
            duration = `${diffMinutes}分钟${diffSeconds % 60}秒`;
          } else {
            duration = `${diffSeconds}秒`;
          }
        } else if (task.status === 'running') {
          duration = '进行中...';
        }
        
        return {
          id: task.id.toString(),
          name: `训练项目 ${task.id}`,
          modelType: modelTypeName,
          dataset: task.dataset_id ? `数据集 ${task.dataset_id}` : '未指定数据集',
          startTime: new Date(task.create_time).toLocaleString('zh-CN'),
          duration: duration,
          status: task.status,
          modelUuid: task.model_uuid,
          // 保存原始数据用于后续操作
          originalData: task
        };
      });
      
      setTrainingRecords(formattedRecords);
      console.log('获取训练项目列表成功:', formattedRecords);
    } catch (err) {
      console.error('获取训练项目列表失败:', err);
      message.error('获取训练项目列表失败: ' + err.message);
      // 如果获取失败，使用空列表
      setTrainingRecords([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchModelTypes();
  }, []);

  useEffect(() => {
    if (modelTypes.length > 0) {
      fetchTrainingTasks();
    }
  }, [modelTypes]);

  const handleViewDetail = (trainingId) => {
    navigate(`/project-center/${trainingId}/progress`);
  };

  const handleDownload = useCallback(async (record, e) => {
    if (e && e.stopPropagation) e.stopPropagation();
    if (downloadingStates[record.id]) return;
    setDownloadingStates(prev => ({ ...prev, [record.id]: true }));
    try {
      const blob = await trainTasksAPI.downloadModel(record.id);
      if (!(blob instanceof Blob)) {
        throw new Error('下载接口未返回文件流');
      }
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `model_task_${record.id}.zip`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
      message.success('模型文件下载成功');
    } catch (err) {
      message.error('下载失败: ' + (err.message || '未知错误'));
    } finally {
      setDownloadingStates(prev => ({ ...prev, [record.id]: false }));
    }
  }, [downloadingStates]);



  const handleDeleteClick = (record) => {
    modal.confirm({
      title: '确认删除',
      content: '删除后数据无法恢复，确定要删除该训练项目吗？',
      okText: '删除',
      okType: 'danger',
      cancelText: '取消',
      centered: true, // 新增，弹窗居中
      onOk: async () => {
        setDeletingId(record.id);
        try {
          await deleteTrainTask(record.id);
          message.success('训练项目删除成功');
          fetchTrainingTasks(); // Refresh the list after successful deletion
        } catch (err) {
          message.error(err.message || '删除失败');
        } finally {
          setDeletingId(null);
        }
      },
    });
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
                  <Text type="secondary">模型类型:</Text>
                  <Text>{record.modelType}</Text>
                </Col>
                <Col span={12}>
                  <Text type="secondary">数据集:</Text>
                  <Text>{record.dataset}</Text>
                </Col>
                <Col span={12}>
                  <Text type="secondary">创建时间:</Text>
                  <Text>{record.startTime}</Text>
                </Col>
                <Col span={12}>
                  <Text type="secondary">
                    {record.status === 'running' ? '累计用时:' : '训练用时:'}
                  </Text>
                  <Text>{record.duration}</Text>
                </Col>
                {record.status === 'completed'}
              </Row>
            </div>

            {/* 下方部分 */}
            <div className={styles.cardFooter}>
              <Space>
                <Tooltip title={record.status === 'completed' ? "下载模型" : "只有已完成的训练项目才能下载模型"}>
                  <Button 
                    type="text" 
                    shape="circle" 
                    icon={downloadingStates[record.id] ? <SyncOutlined spin /> : <DownloadOutlined />} 
                    disabled={record.status !== 'completed' || downloadingStates[record.id]}
                    loading={downloadingStates[record.id]}
                    onClick={(e) => handleDownload(record, e)}
                    aria-label="下载模型"
                  />
                </Tooltip>
                <Tooltip title="删除项目">
                  <Button 
                    type="text" 
                    shape="circle" 
                    icon={<DeleteOutlined />} 
                    loading={deletingId === record.id}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDeleteClick(record);
                    }}
                    aria-label="删除项目"
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
