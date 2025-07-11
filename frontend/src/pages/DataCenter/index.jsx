import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  Typography, 
  Card, 
  Button, 
  Tooltip, 
  Space, 
  Dropdown, 
  message, 
  Spin,
  Modal
} from 'antd';
import {
  InfoCircleOutlined,
  PlayCircleOutlined,
  DownloadOutlined,
  DeleteOutlined,
  MoreOutlined,
  UploadOutlined,
  BarChartOutlined
} from '@ant-design/icons';
import { datasetsAPI } from '@/utils/api';
import styles from './DataCenter.module.css';

const { Title, Text } = Typography;

const DataCenterPage = () => {
  const navigate = useNavigate();
  const [datasets, setDatasets] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [deletingId, setDeletingId] = useState(null);
  


  // 获取用户数据集列表
  const fetchDatasets = async (signal) => {
    try {
      setLoading(true);
      setError(null);
      
      // 调用后端API获取数据集列表
      const response = await datasetsAPI.getMyDatasets();
      // 检查是否已经被取消
      if (signal.aborted) return;
      
      setDatasets(response);
      console.log('成功获取数据集列表:', response);
    } catch (err) {
      // 如果是取消请求，不显示错误
      if (signal.aborted) return;
      
      console.error('获取数据集列表失败:', err);
      setError(err.message);
      message.error('获取数据集列表失败: ' + err.message);
    } finally {
      if (!signal.aborted) {
        setLoading(false);
      }
    }
  };

  // 组件挂载时获取数据
  useEffect(() => {
    const abortController = new AbortController();
    fetchDatasets(abortController.signal);
    
    // 清理函数，取消未完成的请求
    return () => {
      abortController.abort();
    };
  }, []);

  // 处理发起训练 - 跳转到训练页面
  const handleStartTraining = (dataset) => {
    // 跳转到训练页面，并传递选中的数据集信息（通过URL参数datasetId）
    navigate(`/training?datasetId=${dataset.id}`);
  };

  // 处理跳转到首页
  const handleGoToHome = () => {
    // 跳转到首页
    navigate('/home');
  };

  // 处理查看详情 - 跳转到数据集详情页面
  const handleViewDetails = (dataset) => {
    navigate(`/dataset/${dataset.id}`);
  };

  // 处理查看可视化 - 跳转到数据集可视化页面
  const handleViewVisualization = (dataset) => {
    console.log('dataset', dataset);
    navigate(`/dataset-visualization/${dataset.id}`);
  };

  // 处理菜单项点击
  const handleMenuClick = ({ key }, record) => {
    switch (key) {
      case 'details':
        handleViewDetails(record);
        break;
      case 'visualization':
        handleViewVisualization(record);
        break;
      case 'train':
        handleStartTraining(record);
        break;
      case 'download':
        message.info('下载功能待实现');
        break;
      case 'delete':
        Modal.confirm({
          title: '确认删除',
          content: '删除后数据无法恢复，确定要删除该数据集吗？',
          okText: '删除',
          okType: 'danger',
          cancelText: '取消',
          onOk: async () => {
            setDeletingId(record.id);
            try {
              await datasetsAPI.delete(record.id);
              message.success('数据集删除成功');
              // 刷新数据集列表
              const abortController = new AbortController();
              fetchDatasets(abortController.signal);
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
              setDeletingId(null);
            }
          },
        });
        break;
      default:
        break;
    }
  };

  const getMenuItems = (record) => [
    { key: 'details', label: '查看详情', icon: <InfoCircleOutlined /> },
    { key: 'visualization', label: '查看可视化', icon: <BarChartOutlined /> },
    { key: 'download', label: '下载', icon: <DownloadOutlined /> },
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
        

      
        {loading ? (
          <div style={{ textAlign: 'center', padding: '50px' }}>
            <Spin size="large" />
            <div style={{ marginTop: '16px' }}>加载中...</div>
          </div>
        ) : error ? (
          <div style={{ textAlign: 'center', padding: '50px' }}>
            <Text type="danger">加载失败: {error}</Text>
            <br />
            <Button type="primary" onClick={() => {
              const abortController = new AbortController();
              fetchDatasets(abortController.signal);
            }} style={{ marginTop: '16px' }}>
              重试
            </Button>
          </div>
        ) : datasets.length === 0 ? (
          <div className={styles.emptyState}>
            <Text type="secondary" className={styles.emptyStateText}>
              数据列表为空
            </Text>
            <Button 
              type="primary" 
              size="large"
              icon={<UploadOutlined />}
              onClick={handleGoToHome}
              className={styles.emptyStateButton}
            >
              去上传数据
            </Button>
          </div>
        ) : (
          <div className={styles.recordList}>
            {datasets.map(dataset => (
              <Card 
                key={dataset.id} 
                className={styles.recordCard}
                hoverable
                onClick={() => handleViewVisualization(dataset)}
                style={{ cursor: 'pointer' }}
              >
                <div className={styles.cardHeader}>
                  <Text type="secondary">编号: {dataset.dataset_uuid}</Text>
                </div>
                <div className={styles.cardContent}>
                  <Title level={5} className={styles.datasetName}>{dataset.dataset_name}</Title>
                  <Text type="secondary">{dataset.description}</Text>
                  <br />
                  <Text type="secondary">上传于: {new Date(dataset.uploaded_at).toLocaleString('zh-CN')}</Text>
                </div>
                <div className={styles.cardActions} onClick={e => e.stopPropagation()}>
                  <Space>
                    <Tooltip title="查看详情">
                      <Button 
                        type="text" 
                        shape="circle" 
                        icon={<InfoCircleOutlined />} 
                        onClick={() => handleViewDetails(dataset)}
                      />
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
                      <Button type="text" shape="circle" icon={<MoreOutlined />} loading={deletingId === dataset.id} />
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
