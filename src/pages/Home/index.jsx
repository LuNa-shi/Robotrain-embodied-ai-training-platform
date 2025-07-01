import React from 'react';
import {
  Layout,
  Typography,
  Upload,
} from 'antd';
import {
  InboxOutlined,
} from '@ant-design/icons';
import styles from './Home.module.css';

const { Content } = Layout;
const { Title, Paragraph } = Typography;
const { Dragger } = Upload;

const HomePage = () => {
  const draggerProps = {
    name: 'file',
    multiple: true,
    action: 'https://run.mocky.io/v3/435e224c-44fb-4773-9faf-380c5e6a2188',
  };

  return (
    <Layout className={styles.homePageLayout}>
      <Content className={styles.mainContent}>
        <div className={styles.centerStage}>
          <Title level={2} className={styles.mainTitle}>RoboTrain</Title>
          <Paragraph type="secondary">你的机器人训练助手</Paragraph>
          
          <Dragger {...draggerProps} className={styles.dragger}>
            <div className={styles.draggerContent}>
              <p className="ant-upload-drag-icon">
                <InboxOutlined />
              </p>
              <div className={styles.draggerText}>
                <p className="ant-upload-text">上传数据文件</p>
                <p className="ant-upload-hint">
                  点击或拖拽文件到此区域进行上传
                </p>
              </div>
            </div>
          </Dragger>
        </div>
      </Content>
    </Layout>
  );
};

export default HomePage;
