import React, { useState } from 'react';
import {
  Layout,
  Button,
  Typography,
  Card,
  Upload,
  Slider,
  InputNumber,
  Select,
  Tooltip,
  Space,
} from 'antd';
import {
  InboxOutlined,
  CloseOutlined,
  SettingOutlined,
} from '@ant-design/icons';
import styles from './Home.module.css';

const { Sider, Content } = Layout;
const { Title, Paragraph, Text } = Typography;
const { Dragger } = Upload;
const { Option } = Select;

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
          {/* 为主标题添加className，方便设置独立样式 */}
          <Title level={2} className={styles.mainTitle}>RoboTrain</Title>
          <Paragraph type="secondary">你的机器人训练助手</Paragraph>
          
          {/* 已移除 Input.TextArea 组件 */}
          
          <Dragger {...draggerProps} className={styles.dragger}>
            {/* --- 核心改动在这里：增加了一个wrapper div --- */}
            <div className={styles.draggerContent}>
              <p className="ant-upload-drag-icon">
                <InboxOutlined />
              </p>
              {/* 将文字包裹起来，方便与图标并排显示 */}
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
