import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { 
  Typography, 
  Card, 
  Button, 
  Space, 
  message, 
  Spin,
  Descriptions,
  Tag,
  Divider,
  Row,
  Col,
  Statistic,
  Alert,
  Modal
} from 'antd';
import {
  ArrowLeftOutlined,
  PlayCircleOutlined,
  DownloadOutlined,
  EditOutlined,
  DeleteOutlined,
  InfoCircleOutlined,
  CalendarOutlined,
  UserOutlined,
  FileOutlined
} from '@ant-design/icons';
import { datasetsAPI } from '@/utils/api';
import styles from './DatasetDetail.module.css';

const { Title, Text, Paragraph } = Typography;

const DatasetDetailPage = () => {
  const { datasetId } = useParams();
  const navigate = useNavigate();
  const [dataset, setDataset] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [debugInfo, setDebugInfo] = useState(null);
  const [deleting, setDeleting] = useState(false);

  // 调试函数：测试token和API连接
  const testConnection = async () => {
    try {
      const token = localStorage.getItem('token');
      const userInfo = localStorage.getItem('userInfo');
      
      console.log('=== 调试信息 ===');
      console.log('Token:', token);
      console.log('UserInfo:', userInfo);
      console.log('DatasetId:', datasetId);
      console.log('API BaseURL:', import.meta.env.VITE_API_BASE_URL);
      
      setDebugInfo({
        token: token ? token.substring(0, 20) + '...' : '无',
        userInfo: userInfo ? JSON.parse(userInfo) : '无',
        datasetId: datasetId,
        apiBaseURL: import.meta.env.VITE_API_BASE_URL || '未设置',
        timestamp: new Date().toLocaleString()
      });
      
      // 测试API连接
      const response = await datasetsAPI.getMyDatasets();
      console.log('API连接测试成功:', response);
      message.success('API连接正常');
    } catch (err) {
      console.error('API连接测试失败:', err);
      message.error('API连接失败: ' + err.message);
    }
  };

  // 获取数据集详情的函数
  const fetchDatasetDetail = async () => {
    try {
      setLoading(true);
      setError(null);
      
      // 检查是否有token
      const token = localStorage.getItem('token');
      if (!token) {
        throw new Error('未找到认证token，请重新登录');
      }
      
      console.log('正在获取数据集详情，ID:', datasetId, 'Token:', token.substring(0, 20) + '...');
      console.log('API配置:', import.meta.env.VITE_API_BASE_URL || '使用默认配置');
      
      const response = await datasetsAPI.getById(datasetId);
      setDataset(response);
      console.log('成功获取数据集详情:', response);
    } catch (err) {
      console.error('获取数据集详情失败:', err);
      console.error('错误详情:', {
        message: err.message,
        status: err.response?.status,
        statusText: err.response?.statusText,
        url: err.config?.url,
        baseURL: err.config?.baseURL
      });
      
      // 特殊处理认证错误
      if (err.message.includes('401') || err.message.includes('未认证') || err.message.includes('token')) {
        setError('认证失败，请重新登录');
        message.error('认证失败，请重新登录');
        // 清除无效token并跳转到登录页
        localStorage.removeItem('token');
        localStorage.removeItem('userInfo');
        setTimeout(() => {
          navigate('/user/login');
        }, 2000);
      } else {
        setError(err.message);
        message.error('获取数据集详情失败: ' + err.message);
      }
    } finally {
      setLoading(false);
    }
  };

  // 组件挂载时获取数据
  useEffect(() => {
    if (datasetId) {
      fetchDatasetDetail();
    }
  }, [datasetId, navigate]);

  // 处理返回
  const handleBack = () => {
    navigate('/data-center');
  };

  // 处理发起训练
  const handleStartTraining = () => {
    navigate(`/training?dataset=${datasetId}`);
  };

  // 处理编辑数据集
  const handleEdit = () => {
    message.info('编辑功能待实现');
  };

  // 处理删除数据集
  const handleDelete = () => {
    Modal.confirm({
      title: '确认删除',
      content: '删除后数据无法恢复，确定要删除该数据集吗？',
      okText: '删除',
      okType: 'danger',
      cancelText: '取消',
      onOk: async () => {
        setDeleting(true);
        try {
          await datasetsAPI.delete(datasetId);
          message.success('数据集删除成功');
          navigate('/data-center');
        } catch (err) {
          if (err.message.includes('401')) {
            message.error('未登录或登录已过期，请重新登录');
            localStorage.removeItem('token');
            localStorage.removeItem('userInfo');
            setTimeout(() => navigate('/user/login'), 1500);
          } else if (err.message.includes('404')) {
            message.error('数据集不存在或已被删除');
          } else {
            message.error('删除失败: ' + err.message);
          }
        } finally {
          setDeleting(false);
        }
      },
    });
  };

  // 处理下载数据集
  const handleDownload = () => {
    message.info('下载功能待实现');
  };

  if (loading) {
    return (
      <div className={styles.loadingContainer}>
        <Spin size="large" />
        <div style={{ marginTop: '16px' }}>加载中...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={styles.errorContainer}>
        <Text type="danger">加载失败: {error}</Text>
        <br />
        <Button type="primary" onClick={fetchDatasetDetail} style={{ marginTop: '16px' }}>
          重试
        </Button>
        <Button onClick={handleBack} style={{ marginTop: '16px', marginLeft: '8px' }}>
          返回
        </Button>
      </div>
    );
  }

  if (!dataset) {
    return (
      <div className={styles.errorContainer}>
        <Text type="danger">数据集不存在</Text>
        <br />
        <Button onClick={handleBack} style={{ marginTop: '16px' }}>
          返回
        </Button>
      </div>
    );
  }

  return (
    <div className={styles.datasetDetailPage}>
      <div className={styles.contentWrapper}>
        {/* 页面头部 */}
        <div className={styles.pageHeader}>
          <Button 
            icon={<ArrowLeftOutlined />} 
            onClick={handleBack}
            className={styles.backButton}
          >
            返回
          </Button>
        </div>

        {/* 数据集信息卡片（只保留基本信息） */}
        <Card className={styles.mainCard} style={{ maxWidth: 750, margin: '0 auto', padding: 30 }}>
          {/* 居中且更大字号的标题 */}
          <div style={{ textAlign: 'center', marginBottom: 20 }}>
            <Title level={2} style={{ margin: 0 }}>数据集信息</Title>
          </div>
          <Descriptions 
            column={1} 
            bordered
            labelStyle={{ fontWeight: 'bold', fontSize: 17 }}
            contentStyle={{ fontSize: 16 }}
          >
            <Descriptions.Item label="数据集名称">
              {dataset.dataset_name}
            </Descriptions.Item>
            <Descriptions.Item label="数据集描述">
              {dataset.description}
            </Descriptions.Item>
            <Descriptions.Item label="数据集UUID">
              <Tag color="blue">{dataset.dataset_uuid}</Tag>
            </Descriptions.Item>
            <Descriptions.Item label="上传时间">
              <Space>
                <CalendarOutlined />
                {new Date(dataset.uploaded_at).toLocaleString('zh-CN')}
              </Space>
            </Descriptions.Item>
          </Descriptions>
          {/* 操作按钮区域，右下角对齐，距离表格较近 */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 30 }}>
            <Space size="large">
              <Button icon={<DownloadOutlined />} onClick={handleDownload} type="default">
                下载
              </Button>
              <Button icon={<EditOutlined />} onClick={handleEdit} type="primary">
                编辑
              </Button>
              <Button icon={<DeleteOutlined />} onClick={handleDelete} danger type="default" loading={deleting}>
                删除
              </Button>
            </Space>
          </div>
        </Card>
      </div>
    </div>
  );
};

export default DatasetDetailPage; 