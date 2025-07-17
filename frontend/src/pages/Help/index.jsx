import React, { useState } from 'react';
import { 
  Card, 
  Typography, 
  Collapse, 
  List, 
  Button, 
  Input, 
  Row, 
  Col, 
  Tag,
  Divider,
  Space,
  message,
  Statistic
} from 'antd';
import { 
  QuestionCircleOutlined, 
  BookOutlined, 
  MessageOutlined, 
  SearchOutlined,
  FileTextOutlined,
  VideoCameraOutlined,
  DownloadOutlined,
  MailOutlined,
  PhoneOutlined,
  GlobalOutlined,
  ArrowLeftOutlined
} from '@ant-design/icons';
import styles from './Help.module.css';
import { useNavigate } from 'react-router-dom';

const { Title, Text, Paragraph, Link } = Typography;
const { Panel } = Collapse;
const { Search } = Input;

const Help = () => {
  const [searchValue, setSearchValue] = useState('');
  const navigate = useNavigate();

  // 常见问题数据
  const faqData = [
    { key: '1', question: '如何上传数据集？', answer: '在主页点击"上传数据"按钮，选择您要上传的数据文件。支持ZIP格式。' },
    { key: '2', question: '训练模型需要多长时间？', answer: '训练时间取决于数据集大小、模型复杂度和硬件配置。通常小型数据集（<1GB）需要10-30分钟，大型数据集可能需要数小时。' },
    { key: '3', question: '如何查看训练进度？', answer: '在"项目中心"页面可以实时查看所有训练项目的进度、状态和详细日志信息。' },
    { key: '4', question: '支持哪些模型类型？', answer: '目前支持分类、回归、聚类等多种机器学习模型。具体包括：随机森林、支持向量机、神经网络、深度学习模型等。' },
    { key: '5', question: '如何导出训练结果？', answer: '训练完成后，在训练记录页面点击"导出"按钮，可以下载模型文件、训练报告和性能指标。' },
  ];

  // 使用指南数据
  const guides = [
    { title: '快速开始指南', description: '了解如何快速上手使用平台', icon: <BookOutlined />, color: '#1677ff', link: '#' },
    { title: '数据预处理教程', description: '学习如何准备和清洗数据', icon: <FileTextOutlined />, color: '#52c41a', link: '#' },
    { title: '模型训练详解', description: '深入了解模型训练流程', icon: <VideoCameraOutlined />, color: '#faad14', link: '#' },
    { title: 'API文档', description: '查看完整的API接口文档', icon: <DownloadOutlined />, color: '#722ed1', link: '#' }
  ];

  // 联系信息
  const contactInfo = [
    { title: '技术支持', value: 'support@robotrain.com', icon: <MailOutlined />, color: '#1677ff' },
    { title: '客服热线', value: '400-123-4567', icon: <PhoneOutlined />, color: '#52c41a' },
    { title: '官方网站', value: 'www.robotrain.com', icon: <GlobalOutlined />, color: '#faad14' }
  ];

  const handleSearch = (value) => {
    setSearchValue(value.toLowerCase());
  };

  const filteredFaq = faqData.filter(item => 
    item.question.toLowerCase().includes(searchValue) ||
    item.answer.toLowerCase().includes(searchValue)
  );

  const handleBack = () => {
    // 如果有 opener 且不是同一个页面，优先关闭标签页
    if (window.opener) {
      window.close();
    } else if (window.history.length > 1) {
      navigate(-1);
    } else {
      navigate('/', { replace: true }); // 或跳转到你希望的默认页面
    }
  };

  return (
    <div className={styles.helpContainer}>
      <Button 
        className={styles.backButton}
        icon={<ArrowLeftOutlined />} 
        onClick={handleBack}
      >
        返回上一页
      </Button>

      <div className={styles.pageHeader}>
        <Title level={1}>帮助中心</Title>
        <Text type="secondary">找到您需要的所有帮助和支持信息</Text>
      </div>

      <Search
        placeholder="搜索问题或关键词..."
        allowClear
        enterButton={<SearchOutlined />}
        size="large"
        onSearch={handleSearch}
        onChange={(e) => setSearchValue(e.target.value.toLowerCase())}
        className={styles.searchInput}
      />

      <div className={styles.mainContent}>
        <Row gutter={[24, 24]} align="start">
          {/* 左侧：常见问题 */}
          <Col xs={24} lg={10}>
            <Card className={styles.contentCard}>
              <div className={styles.cardHeader}>
                <div className={styles.cardTitle}>
                  <Title level={4}><QuestionCircleOutlined /> 常见问题</Title>
                </div>
                <Tag color="blue">{filteredFaq.length} 个问题</Tag>
              </div>
              
              <Collapse defaultActiveKey={['1']} accordion className={styles.faqCollapse}>
                {filteredFaq.length > 0 ? filteredFaq.map(item => (
                  <Panel header={item.question} key={item.key}>
                    <Paragraph>{item.answer}</Paragraph>
                  </Panel>
                )) : (
                  <div className={styles.noResults}>没有找到相关的问题。</div>
                )}
              </Collapse>
            </Card>
          </Col>

          {/* 右侧：使用指南和联系方式 */}
          <Col xs={24} lg={14}>
            <Space direction="vertical" style={{ width: '100%' }} size="large">
              <Card className={styles.contentCard}>
                <div className={styles.cardHeader}>
                  <div className={styles.cardTitle}>
                    <Title level={4}><BookOutlined /> 使用指南</Title>
                  </div>
                </div>
                <List
                  dataSource={guides}
                  renderItem={item => (
                    <List.Item className={styles.guideItem}>
                      <Space align="start">
                        <div className={styles.guideIcon} style={{ backgroundColor: item.color }}>{item.icon}</div>
                        <div>
                          <Text strong>{item.title}</Text>
                          <Paragraph type="secondary" style={{ margin: 0 }}>{item.description}</Paragraph>
                        </div>
                      </Space>
                      <Button type="link" size="small">查看</Button>
                    </List.Item>
                  )}
                />
              </Card>

              <Card className={styles.contentCard} style={{ marginTop: '24px' }}>
                <div className={styles.cardHeader}>
                  <div className={styles.cardTitle}>
                    <Title level={4}><MessageOutlined /> 联系我们</Title>
                  </div>
                </div>
                <List
                  dataSource={contactInfo}
                  renderItem={item => (
                    <List.Item className={styles.contactItem}>
                      <Space>
                        <div className={styles.guideIcon} style={{ backgroundColor: item.color }}>{item.icon}</div>
                        <div>
                          <Text strong>{item.title}</Text>
                          <Paragraph type="secondary" style={{ margin: 0 }}>{item.value}</Paragraph>
                        </div>
                      </Space>
                    </List.Item>
                  )}
                />
                <Divider style={{ margin: '12px 0' }}/>
                <Text type="secondary" style={{ fontSize: 12, padding: '0 24px' }}>工作时间：周一至周五 9:00-18:00</Text>
              </Card>
            </Space>
          </Col>
        </Row>
      </div>
    </div>
  );
};

export default Help;
