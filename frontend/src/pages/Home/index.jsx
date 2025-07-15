import React, { useState, useEffect } from 'react';
import { Layout, Typography, Upload, Form, Input, Button, Modal, Row, Col, Card, App } from 'antd';
import { InboxOutlined, UploadOutlined, DatabaseOutlined, ProjectOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { datasetsAPI } from '@/utils/api';
import styles from './Home.module.css';

const { Content } = Layout;
const { Title, Paragraph, Text } = Typography;
const { Dragger } = Upload;
const { TextArea } = Input;

const HomePage = () => {
  const { message } = App.useApp();
  const navigate = useNavigate();
  const [form] = Form.useForm();
  const [uploading, setUploading] = useState(false);
  const [fileList, setFileList] = useState([]);
  const [uploadModalVisible, setUploadModalVisible] = useState(false);

  const handleCancel = () => {
    setUploadModalVisible(false);
    form.resetFields();
    setFileList([]);
  };

  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') handleCancel();
    };
    if (uploadModalVisible) {
      document.addEventListener('keydown', handleKeyDown);
    }
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [uploadModalVisible]);

  const handleUpload = async (values) => {
    if (fileList.length === 0) {
      message.error('请选择要上传的文件');
      return;
    }
    const file = fileList[0].originFileObj;
    try {
      setUploading(true);
      const result = await datasetsAPI.upload(values.name, values.description, file);
      message.success('数据集上传成功！');
      handleCancel();
      navigate(`/dataset/${result.id}`);
    } catch (error) {
      message.error('上传失败: ' + error.message);
    } finally {
      setUploading(false);
    }
  };

  const beforeUpload = (file) => {
    const isZip = file.name.toLowerCase().endsWith('.zip');
    if (!isZip) {
      message.error('只支持上传ZIP格式的文件！');
      return Upload.LIST_IGNORE;
    }
    return false;
  };

  const handleFileChange = (info) => {
    setFileList(info.fileList.slice(-1));
  };
  
  const showUploadModal = () => setUploadModalVisible(true);
  const handleDataCenterClick = () => navigate('/data-center');
  const handleProjectCenterClick = () => navigate('/project-center');

  return (
    <Layout className={styles.homePageLayout}>
      <Content className={styles.mainContent}>
        <div className={styles.centerStage}>
          <Title level={2} className={styles.mainTitle}>RoboTrain</Title>
          <Paragraph className={styles.subTitle}>你的机器人训练助手</Paragraph>
          <Row gutter={[24, 24]} className={styles.threeColumnLayout}>
            <Col xs={24} lg={8}>
              <Card className={styles.card}>
                <div className={styles.cardContent}>
                  <Title level={3} className={styles.cardTitle}>上传数据</Title>
                  <Paragraph className={styles.cardDescription}>上传您的训练数据文件，支持ZIP格式。上传后可以查看和管理您的数据集。</Paragraph>
                  <Button type="primary" size="large" icon={<UploadOutlined />} onClick={showUploadModal} className={styles.cardButton}>上传数据</Button>
                </div>
              </Card>
            </Col>
            <Col xs={24} lg={8}>
              <Card className={styles.card} hoverable onClick={handleDataCenterClick}>
                <div className={styles.cardContent}>
                  <Title level={3} className={styles.cardTitle}>数据中心</Title>
                  <Paragraph className={styles.cardDescription}>管理和查看您的训练数据，包括数据上传、预处理和标注等功能。</Paragraph>
                  <Button type="primary" size="large" icon={<DatabaseOutlined />} onClick={handleDataCenterClick} className={styles.cardButton}>进入数据中心</Button>
                </div>
              </Card>
            </Col>
            <Col xs={24} lg={8}>
              <Card className={styles.card} hoverable onClick={handleProjectCenterClick}>
                <div className={styles.cardContent}>
                  <Title level={3} className={styles.cardTitle}>项目中心</Title>
                  <Paragraph className={styles.cardDescription}>管理训练项目，创建新的训练项目，监控训练进度和结果。</Paragraph>
                  <Button type="primary" size="large" icon={<ProjectOutlined />} onClick={handleProjectCenterClick} className={styles.cardButton}>进入项目中心</Button>
                </div>
              </Card>
            </Col>
          </Row>
        </div>
        <Modal title="上传数据集" open={uploadModalVisible} onCancel={handleCancel} footer={null} width={600}>
          <Form form={form} layout="vertical" onFinish={handleUpload} initialValues={{ name: '', description: '' }}>
            <Form.Item label="数据集名称" name="name" rules={[{ required: true, message: '请输入数据集名称' }, { max: 100, message: '数据集名称不能超过100个字符' }]}>
              <Input placeholder="请输入数据集名称" />
            </Form.Item>
            <Form.Item label="数据集描述" name="description" rules={[{ required: true, message: '请输入数据集描述' }, { max: 500, message: '数据集描述不能超过500个字符' }]}>
              <TextArea rows={4} placeholder="请输入数据集描述" showCount maxLength={500} />
            </Form.Item>
            <Form.Item label="上传数据文件">
              <Dragger name="file" fileList={fileList} beforeUpload={beforeUpload} onChange={handleFileChange} className={styles.modalDragger} data-testid="file-dragger-input" />
              {fileList.length > 0 && (<div className={styles.selectedFile}><Text type="secondary">已选择文件: {fileList[0].name}</Text></div>)}
            </Form.Item>
            <Form.Item>
              <Button type="primary" htmlType="submit" loading={uploading} block size="large" disabled={fileList.length === 0}>
                {uploading ? '上传中...' : '确认上传'}
              </Button>
            </Form.Item>
          </Form>
        </Modal>
      </Content>
    </Layout>
  );
};
export default HomePage;