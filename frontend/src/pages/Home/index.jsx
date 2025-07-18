import React, { useState, useEffect } from 'react';
import { Layout, Typography, Upload, Form, Input, Button, Modal, Row, Col, Card, App, Divider } from 'antd';
import { InboxOutlined, UploadOutlined, DatabaseOutlined, ProjectOutlined, RobotOutlined } from '@ant-design/icons';
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
  const [modelFileList, setModelFileList] = useState([]);
  const [uploadModalVisible, setUploadModalVisible] = useState(false);

  const handleCancel = () => {
    setUploadModalVisible(false);
    form.resetFields();
    setFileList([]);
    setModelFileList([]);
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
    const hasModelFile = modelFileList.length > 0;
    
    try {
      setUploading(true);
      // 根据是否上传模型文件设置is_aloha参数
      const isAloha = !hasModelFile;
      const result = await datasetsAPI.upload(values.name, values.description, file, isAloha);
      
      // 如果上传了模型文件，额外保持2秒加载状态
      if (hasModelFile) {
        await new Promise(resolve => setTimeout(resolve, 2000));
        message.success('数据集和模型文件上传成功！');
      } else {
        message.success('数据集上传成功！');
      }
      
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
    
    // 检查文件大小限制 (500MB)
    const maxSize = 500 * 1024 * 1024; // 500MB in bytes
    if (file.size > maxSize) {
      message.error('文件大小不能超过500MB！');
      return Upload.LIST_IGNORE;
    }
    
    return false;
  };

  const handleFileChange = (info) => {
    setFileList(info.fileList.slice(-1));
  };

  const handleModelFileChange = (info) => {
    setModelFileList(info.fileList.slice(-1));
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
              <TextArea rows={3} placeholder="请输入数据集描述" showCount maxLength={500} />
            </Form.Item>
            <Form.Item label="上传数据文件">
              <Dragger 
                name="file" 
                fileList={fileList} 
                beforeUpload={beforeUpload} 
                onChange={handleFileChange} 
                className={styles.modalDragger} 
                data-testid="file-dragger-input"
                showUploadList={false}
                style={{ padding: '20px 0 16px 0' }}
              >
                <div className={styles.modalDraggerContent}>
                  <InboxOutlined style={{ fontSize: '48px', color: '#1890ff', marginBottom: '16px' }} />
                  <div className={styles.modalDraggerText}>
                    <p style={{ fontSize: '16px', fontWeight: '500', color: '#262626', margin: '0 0 8px 0' }}>
                      点击或拖拽文件到此区域上传
                    </p>
                    <p style={{ fontSize: '14px', color: '#666', margin: '0 0 8px 0' }}>
                      支持ZIP格式，文件大小不能超过500MB<br/>
                      仅支持lerobot dataset数据集
                    </p>
                  </div>
                </div>
              </Dragger>
              {fileList.length > 0 && (<div className={styles.selectedFile}><Text type="secondary">已选择文件: {fileList[0].name}</Text></div>)}
            </Form.Item>
            
            <Divider />
            
            <Form.Item label="上传模型文件（可选）">
              <Dragger 
                name="modelFile" 
                fileList={modelFileList} 
                beforeUpload={beforeUpload} 
                onChange={handleModelFileChange} 
                className={styles.modalDragger} 
                data-testid="model-file-dragger-input"
                showUploadList={false}
                style={{ padding: '16px 0 12px 0' }}
              >
                <div className={styles.modalDraggerContent} style={{ padding: '12px', gap: '8px' }}>
                  <RobotOutlined style={{ fontSize: '32px', color: '#52c41a', marginBottom: '8px' }} />
                  <div className={styles.modalDraggerText}>
                    <p style={{ fontSize: '14px', fontWeight: '500', color: '#262626', margin: '0 0 4px 0' }}>
                      点击或拖拽模型文件到此区域上传
                    </p>
                    <p style={{ fontSize: '12px', color: '#666', margin: '0 0 4px 0' }}>
                      支持ZIP格式，文件大小不能超过500MB（可选）<br/>
                      仅支持URDF+STL格式模型文件
                    </p>
                  </div>
                </div>
              </Dragger>
              {modelFileList.length > 0 && (<div className={styles.selectedFile}><Text type="secondary" style={{ fontSize: '12px' }}>已选择模型文件: {modelFileList[0].name}</Text></div>)}
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