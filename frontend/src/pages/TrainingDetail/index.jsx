import React from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Button,
  Tag,
  Typography,
  Row,
  Col,
  Card,
  Descriptions,
  Divider,
  Empty,
  Space,
  message
} from 'antd';
import {
  PlayCircleOutlined,
  DownloadOutlined,
  ShareAltOutlined,
  CheckCircleOutlined,
  ArrowLeftOutlined,
  SyncOutlined,
  CloseCircleOutlined
} from '@ant-design/icons';
import ReactECharts from 'echarts-for-react';
import styles from './TrainingDetail.module.css';

const { Title, Paragraph } = Typography;

// 模拟的训练记录详情数据 - 根据不同的 trainingId 返回不同的数据
const getTrainingDetail = (trainingId) => {
  const trainingDetails = {
    'train-20250625-001': {
      id: 'train-20250625-001',
      name: '图像识别-模型A',
      status: 'completed',
      startTime: '2025-06-25 10:30:15',
      endTime: '2025-06-25 12:45:15',
      duration: '2h 15m',
      dataset: '无人机航拍数据集 (ds-20250625-001)',
      baseModel: 'ResNet-50',
      accuracy: '98.5%',
      loss: '0.012',
      learningRate: 0.001,
      epochs: 200,
      batchSize: 32,
      videoUrl: 'https://www.w3schools.com/html/mov_bbb.mp4',
    },
    'train-20250625-002': {
      id: 'train-20250625-002',
      name: '路径规划-AlphaGo',
      status: 'running',
      startTime: '2025-06-25 14:00:00',
      endTime: null,
      duration: '进行中...',
      dataset: '棋谱数据集-v3 (ds-20250625-002)',
      baseModel: 'AlphaGo-Zero',
      accuracy: 'N/A',
      loss: 'N/A',
      learningRate: 0.0001,
      epochs: 1000,
      batchSize: 64,
      videoUrl: null,
    },
    'train-20250624-005': {
      id: 'train-20250624-005',
      name: '自然语言生成模型',
      status: 'failed',
      startTime: '2025-06-24 09:00:00',
      endTime: '2025-06-24 09:45:00',
      duration: '45m',
      dataset: '客户服务对话日志 (ds-20250624-005)',
      baseModel: 'GPT-2',
      accuracy: '20.1%',
      loss: '2.5',
      learningRate: 0.01,
      epochs: 50,
      batchSize: 16,
      videoUrl: null,
    },
  };
  
  // 如果是新创建的项目ID（格式：train-timestamp-random），生成动态项目详情
  if (trainingId && trainingId.startsWith('train-') && trainingId.includes('-')) {
    const parts = trainingId.split('-');
    if (parts.length >= 3) {
      const timestamp = parseInt(parts[1]);
      const randomNum = parts[2];
      const createTime = new Date(timestamp);
      
      // 生成动态项目详情
      const dynamicProject = {
        id: trainingId,
        name: `机器人训练项目-${randomNum}`,
        status: 'running', // 新创建的项目默认为运行中状态
        startTime: createTime.toLocaleString('zh-CN'),
        endTime: null,
        duration: '进行中...',
        dataset: '工业机器人视觉数据集 (ds-20250625-001)', // 默认数据集
        baseModel: 'GPT-4 Vision', // 默认模型
        accuracy: 'N/A',
        loss: 'N/A',
        learningRate: 0.001,
        epochs: 10,
        batchSize: 32,
        videoUrl: null,
      };
      
      return dynamicProject;
    }
  }
  
  return trainingDetails[trainingId] || null;
};

// 根据状态返回不同的Tag和Icon
const StatusDisplay = ({ status }) => {
  const statusMap = {
    completed: { color: 'success', text: '已完成', icon: <CheckCircleOutlined /> },
    running: { color: 'processing', text: '进行中', icon: <SyncOutlined spin /> },
    failed: { color: 'error', text: '失败', icon: <CloseCircleOutlined /> },
  };
  const { color, text, icon } = statusMap[status] || { color: 'default', text: '未知' };
  return <Tag icon={icon} color={color}>{text}</Tag>;
};

// ECharts 图表配置 - 准确率
const getAccuracyChartOption = (accuracy) => ({
  title: { text: '准确率 (Accuracy)', left: 'center', textStyle: { fontSize: 14, fontWeight: 'normal' } },
  tooltip: { trigger: 'axis' },
  xAxis: { type: 'category', data: Array.from({length: 10}, (_, i) => i + 1) },
  yAxis: { type: 'value', min: 0.8, max: 1 },
  series: [{
    data: [0.85, 0.88, 0.90, 0.92, 0.94, 0.95, 0.96, 0.97, 0.98, parseFloat(accuracy) / 100 || 0.985],
    type: 'line',
    smooth: true,
  }],
  grid: { top: 40, right: 20, bottom: 30, left: 40 },
});

// ECharts 图表配置 - 损失
const getLossChartOption = (loss) => ({
  title: { text: '损失 (Loss)', left: 'center', textStyle: { fontSize: 14, fontWeight: 'normal' } },
  tooltip: { trigger: 'axis' },
  xAxis: { type: 'category', data: Array.from({length: 10}, (_, i) => i + 1) },
  yAxis: { type: 'value' },
  series: [{
    data: [0.5, 0.4, 0.3, 0.2, 0.1, 0.08, 0.05, 0.03, 0.02, parseFloat(loss) || 0.012],
    type: 'line',
    smooth: true,
    color: '#ff7875'
  }],
  grid: { top: 40, right: 20, bottom: 30, left: 40 },
});

const TrainingDetailPage = () => {
  const { trainingId } = useParams();
  const navigate = useNavigate();
  
  const trainingDetail = getTrainingDetail(trainingId);
  
  if (!trainingDetail) {
    message.error('未找到对应的项目记录');
    navigate('/project-center');
    return null;
  }

  const handleBack = () => {
    navigate('/project-center');
  };

  return (
    <div className={styles.detailPage}>
      {/* 自定义页面头部 */}
      <div className={styles.pageHeader}>
        <div className={styles.headerLeft}>
          <Button 
            type="text" 
            shape="circle"
            icon={<ArrowLeftOutlined />} 
            onClick={handleBack}
          />
          <div className={styles.headerInfo}>
            <Space align="center">
              <Title level={4} className={styles.headerTitle}>
                {trainingDetail.name}
              </Title>
              <StatusDisplay status={trainingDetail.status} />
            </Space>
            <Paragraph className={styles.headerSubtitle}>
              ID: {trainingDetail.id}
            </Paragraph>
          </div>
        </div>
        <div className={styles.headerActions}>
          <Button icon={<DownloadOutlined />}>操作按钮</Button>
          <Button type="primary" icon={<PlayCircleOutlined />}>操作按钮</Button>
        </div>
      </div>

      <div className={styles.pageContent}>
        {/* 主要内容区域 - flex布局 */}
        <div className={styles.flexMain}>
          <div className={styles.leftMain}>
            <Space direction="vertical" size="middle" style={{ width: '100%' }}>
              <Card 
                title="训练模拟成功视频展示区域" 
                className={styles.videoCard}
                size="small"
              >
                {trainingDetail.videoUrl ? (
                   <video controls src={trainingDetail.videoUrl} className={styles.videoPlayer}></video>
                ) : (
                  <Empty description="暂无视频记录" />
                )}
              </Card>

              {/* 底部：训练指标图表 */}
              <div className={styles.chartsSection}>
                <Row gutter={[16, 16]}>
                  <Col xs={24} lg={12}>
                    <Card size="small" className={styles.chartsCard}>
                      <div className={styles.chartContainer}>
                        <ReactECharts option={getAccuracyChartOption(trainingDetail.accuracy)} />
                      </div>
                    </Card>
                  </Col>
                  <Col xs={24} lg={12}>
                    <Card size="small" className={styles.chartsCard}>
                      <div className={styles.chartContainer}>
                        <ReactECharts option={getLossChartOption(trainingDetail.loss)} />
                      </div>
                    </Card>
                  </Col>
                </Row>
              </div>
            </Space>
          </div>
          <div className={styles.rightInfo}>
            <Space direction="vertical" size="middle" style={{ width: '100%' }}>
              <Card 
                title="基本信息" 
                className={styles.infoCard}
                size="small"
              >
                <Descriptions 
                  column={1} 
                  className={styles.infoDescriptions}
                  size="small"
                >
                  <Descriptions.Item label="数据集">{trainingDetail.dataset}</Descriptions.Item>
                  <Descriptions.Item label="基础模型">{trainingDetail.baseModel}</Descriptions.Item>
                  <Descriptions.Item label="开始时间">{trainingDetail.startTime}</Descriptions.Item>
                  <Descriptions.Item label="结束时间">{trainingDetail.endTime || 'N/A'}</Descriptions.Item>
                  <Descriptions.Item label="总计用时">{trainingDetail.duration}</Descriptions.Item>
                </Descriptions>
              </Card>
              
              <Card 
                title="训练参数" 
                className={styles.infoCard}
                size="small"
              >
                <Descriptions 
                  column={1} 
                  className={styles.infoDescriptions}
                  size="small"
                >
                  <Descriptions.Item label="学习率">{trainingDetail.learningRate}</Descriptions.Item>
                  <Descriptions.Item label="迭代次数">{trainingDetail.epochs}</Descriptions.Item>
                  <Descriptions.Item label="批量大小">{trainingDetail.batchSize}</Descriptions.Item>
                </Descriptions>
              </Card>
            </Space>
          </div>
        </div>
      </div>
    </div>
  );
};

export default TrainingDetailPage;
