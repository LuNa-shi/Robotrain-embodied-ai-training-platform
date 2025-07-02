import React, { useState } from 'react';
import {
  Layout,
  Typography,
  Upload,
  Form,
  Input,
  Button,
  message,
  Modal,
} from 'antd';
import {
  InboxOutlined,
  UploadOutlined,
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { datasetsAPI } from '@/utils/api';
import styles from './Home.module.css';

const { Content } = Layout;
const { Title, Paragraph, Text } = Typography;
const { Dragger } = Upload;
const { TextArea } = Input;

const HomePage = () => {
  const navigate = useNavigate();
  const [form] = Form.useForm();
  const [uploading, setUploading] = useState(false);
  const [fileList, setFileList] = useState([]);
  const [uploadModalVisible, setUploadModalVisible] = useState(false);

  // 处理文件上传
  const handleUpload = async (values) => {
    if (fileList.length === 0) {
      message.error('请选择要上传的文件');
      return;
    }

    const file = fileList[0].originFileObj;
    
    // 检查文件格式
    if (!file.name.toLowerCase().endsWith('.zip')) {
      message.error('只支持上传ZIP格式的文件');
      return;
    }

    // 检查文件大小（限制为100MB）
    const maxSize = 100 * 1024 * 1024; // 100MB
    if (file.size > maxSize) {
      message.error('文件大小不能超过100MB');
      return;
    }

    try {
      setUploading(true);
      
      const result = await datasetsAPI.upload(
        values.name,
        values.description,
        file
      );
      
      message.success('数据集上传成功！');
      console.log('上传成功:', result);
      
      // 关闭模态框并重置表单
      setUploadModalVisible(false);
      form.resetFields();
      setFileList([]);
      
      // 跳转到数据集详情页面查看上传的数据集
      navigate(`/dataset/${result.id}`);
      
    } catch (error) {
      console.error('上传失败:', error);
      message.error('上传失败: ' + error.message);
    } finally {
      setUploading(false);
    }
  };

  // 处理文件选择
  const handleFileChange = (info) => {
    setFileList(info.fileList.slice(-1)); // 只保留最后一个文件
  };

  // 文件上传前的验证
  const beforeUpload = (file) => {
    const isZip = file.name.toLowerCase().endsWith('.zip');
    if (!isZip) {
      message.error('只支持上传ZIP格式的文件！');
      return false;
    }
    
    const isLt100M = file.size / 1024 / 1024 < 100;
    if (!isLt100M) {
      message.error('文件大小不能超过100MB！');
      return false;
    }
    
    return false; // 阻止自动上传
  };

  // 打开上传模态框
  const showUploadModal = () => {
    setUploadModalVisible(true);
  };

  // 关闭上传模态框
  const handleCancel = () => {
    setUploadModalVisible(false);
    form.resetFields();
    setFileList([]);
  };

  return (
    <Layout className={styles.homePageLayout}>
      <Content className={styles.mainContent}>
        <div className={styles.centerStage}>
          <Title level={2} className={styles.mainTitle}>RoboTrain</Title>
          <Paragraph type="secondary">你的机器人训练助手</Paragraph>
          
          <div className={styles.uploadSection}>
            <Dragger
              name="file"
              fileList={fileList}
              beforeUpload={beforeUpload}
              onChange={handleFileChange}
              accept=".zip"
              className={styles.dragger}
            >
              <div className={styles.draggerContent}>
                <p className="ant-upload-drag-icon">
                  <InboxOutlined />
                </p>
                <div className={styles.draggerText}>
                  <p className="ant-upload-text">上传数据文件</p>
                  <p className="ant-upload-hint">
                    点击或拖拽ZIP文件到此区域进行上传
                  </p>
                  <Text type="secondary">支持ZIP格式，最大100MB</Text>
                </div>
              </div>
            </Dragger>
            
            <Button
              type="primary"
              size="large"
              icon={<UploadOutlined />}
              onClick={showUploadModal}
              disabled={fileList.length === 0}
              className={styles.uploadButton}
            >
              开始上传
            </Button>
          </div>
                  </div>

          {/* 上传模态框 */}
          <Modal
            title="上传数据集"
            open={uploadModalVisible}
            onCancel={handleCancel}
            footer={null}
            width={600}
          >
            <Form
              form={form}
              layout="vertical"
              onFinish={handleUpload}
              initialValues={{
                name: '',
                description: '',
              }}
            >
              <Form.Item
                label="数据集名称"
                name="name"
                rules={[
                  { required: true, message: '请输入数据集名称' },
                  { max: 100, message: '数据集名称不能超过100个字符' }
                ]}
              >
                <Input placeholder="请输入数据集名称" />
              </Form.Item>

              <Form.Item
                label="数据集描述"
                name="description"
                rules={[
                  { required: true, message: '请输入数据集描述' },
                  { max: 500, message: '数据集描述不能超过500个字符' }
                ]}
              >
                <TextArea
                  rows={4}
                  placeholder="请输入数据集描述"
                  showCount
                  maxLength={500}
                />
              </Form.Item>

              <Form.Item label="上传文件">
                <Text>{fileList.length > 0 ? fileList[0].name : '未选择文件'}</Text>
              </Form.Item>

              <Form.Item>
                <Button
                  type="primary"
                  htmlType="submit"
                  loading={uploading}
                  block
                  size="large"
                >
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
