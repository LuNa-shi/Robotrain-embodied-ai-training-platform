// 文件路径: src/pages/DataCenter/index.jsx (最终版)

import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
// 1. 修改 antd 的导入，引入 App，移除 message 和 Modal
import {
  App,
  Typography,
  Card,
  Button,
  Tooltip,
  Space,
  Dropdown,
  Spin,
} from 'antd';
import {
  InfoCircleOutlined,
  PlayCircleOutlined,
  DownloadOutlined,
  DeleteOutlined,
  MoreOutlined,
  UploadOutlined,
  BarChartOutlined,
  SyncOutlined // 补充导入 SyncOutlined
} from '@ant-design/icons';
import { datasetsAPI } from '@/utils/api';
import styles from './DataCenter.module.css';

const { Title, Text } = Typography;

const DataCenterPage = () => {
  // 2. 使用 App.useApp() hook，这是核心修改
  const { message, modal } = App.useApp();
  const navigate = useNavigate();
  const [datasets, setDatasets] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [deletingId, setDeletingId] = useState(null);

  const fetchDatasets = async (signal) => {
    try {
      setLoading(true);
      setError(null);
      const response = await datasetsAPI.getMyDatasets();
      if (signal.aborted) return;
      setDatasets(response);
    } catch (err) {
      if (signal.aborted) return;
      setError(err.message);
      // message 的用法保持不变
      message.error('获取数据集列表失败: ' + err.message);
    } finally {
      if (!signal.aborted) {
        setLoading(false);
      }
    }
  };

  useEffect(() => {
    const abortController = new AbortController();
    fetchDatasets(abortController.signal);
    return () => abortController.abort();
  }, []);

  const handleStartTraining = (dataset) => {
    navigate(`/training?datasetId=${dataset.id}`);
  };

  const handleGoToHome = () => {
    navigate('/home');
  };

  const handleViewDetails = (dataset) => {
    navigate(`/dataset/${dataset.id}`);
  };

  const handleViewVisualization = (dataset) => {
    navigate(`/dataset-visualization/${dataset.id}`);
  };

  const handleDownloadClick = () => {
    message.info('下载功能待实现');
  };
  
  const handleDeleteClick = (record) => {
    modal.confirm({
      title: '确认删除',
      content: '删除后数据无法恢复，确定要删除该数据集吗？',
      okText: '删除',
      okType: 'danger',
      cancelText: '取消',
      centered: true,
      onOk: async () => {
        setDeletingId(record.id);
        try {
          await datasetsAPI.delete(record.id);
          message.success('数据集删除成功');
          const abortController = new AbortController();
          fetchDatasets(abortController.signal);
        } catch (err) {
          // ...
        } finally {
          setDeletingId(null);
        }
      },
    });
  };

  const getMenuItems = (record) => [
    {
      key: 'details',
      label: '查看详情',
      icon: <InfoCircleOutlined />,
      // 为每个菜单项直接绑定 onClick
      onClick: () => handleViewDetails(record),
    },
    {
      key: 'visualization',
      label: '查看可视化',
      icon: <BarChartOutlined />,
      onClick: () => handleViewVisualization(record),
    },
    {
      key: 'download',
      label: '下载',
      icon: <DownloadOutlined />,
      onClick: () => handleDownloadClick(), // 调用新的独立函数
    },
    { type: 'divider' },
    {
      key: 'delete',
      label: '删除',
      danger: true,
      icon: <DeleteOutlined />,
      onClick: () => handleDeleteClick(record), // 调用新的独立函数
    },
  ];

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: '50px' }}>
        <Spin size="large" />
        <div style={{ marginTop: '16px' }}>加载中...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ textAlign: 'center', padding: '50px' }}>
        <Text type="danger">加载失败: {error}</Text>
        <br />
        <Button
          type="primary"
          icon={<SyncOutlined />}
          onClick={() => {
            const abortController = new AbortController();
            fetchDatasets(abortController.signal);
          }}
          style={{ marginTop: '16px' }}
        >
          重试
        </Button>
      </div>
    );
  }

  return (
    <div className={styles.dataCenterPage}>
      <div className={styles.contentWrapper}>
        <div className={styles.pageHeader}>
          <Title level={1} className={styles.pageTitle}>数据中心</Title>
          <Text type="secondary">管理您上传的机器人训练数据集和文件</Text>
        </div>

        {datasets.length === 0 ? (
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
                  <Text type="secondary" className={styles.datasetDescription}>{dataset.description}</Text>
                  <Text type="secondary" className={styles.uploadTime}>上传于: {new Date(dataset.uploaded_at).toLocaleString('zh-CN')}</Text>
                </div>
                <div className={styles.cardActions} onClick={e => e.stopPropagation()}>
                  <Space>
                    <Tooltip title="查看详情">
                      <Button
                        type="text"
                        shape="circle"
                        icon={<InfoCircleOutlined />}
                        onClick={() => handleViewDetails(dataset)}
                        aria-label="查看详情"
                      />
                    </Tooltip>
                    <Tooltip title="发起训练">
                      <Button
                        type="text"
                        shape="circle"
                        icon={<PlayCircleOutlined />}
                        onClick={() => handleStartTraining(dataset)}
                        aria-label="发起训练"
                      />
                    </Tooltip>
                    <Dropdown
                      menu={{ items: getMenuItems(dataset) }}
                      placement="bottomRight"
                      arrow
                    >
                      <Button
                        type="text"
                        shape="circle"
                        icon={<MoreOutlined />}
                        loading={deletingId === dataset.id}
                        aria-label="更多"
                      />
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