CREATE TYPE traintaskstatus AS ENUM ('pending', 'running', 'completed', 'failed');
CREATE TYPE evaltaskstatus AS ENUM ('pending', 'running', 'completed', 'failed');

CREATE TABLE IF NOT EXISTS app_user (
    id SERIAL PRIMARY KEY,              -- 用户ID，自增主键
    username VARCHAR(50) UNIQUE NOT NULL, -- 用户名，唯一且不能为空
    password_hash VARCHAR(255) NOT NULL,  -- 密码哈希值，存储加密后的密码
    is_admin BOOLEAN NOT NULL DEFAULT FALSE,          -- 是否为管理员，默认为FALSE
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc', NOW()) NOT NULL, -- 注册时间，默认为当前时间
    last_login TIMESTAMP WITH TIME ZONE DEFAULT NULL  -- 最后登录时间，可为空
);
CREATE INDEX IF NOT EXISTS idx_users_username ON app_user (username);

CREATE TABLE IF NOT EXISTS dataset (
    id SERIAL PRIMARY KEY,              -- 数据集ID，自增主键
    dataset_name VARCHAR(100) NOT NULL,         -- 数据集名称，不能为空
    description TEXT DEFAULT NULL,       -- 数据集描述，可为空
    dataset_uuid UUID NOT NULL,         -- 数据集UUID(作为minio里的文件夹名)，不能为空
    owner_id INTEGER NOT NULL REFERENCES app_user(id) ON DELETE CASCADE, -- 所有者ID，外键引用users表
    uploaded_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc', NOW()) NOT NULL,-- 创建时间，默认为当前时间

    total_episodes INTEGER DEFAULT 0 NOT NULL, -- 总集数
    total_chunks INTEGER DEFAULT 0 NOT NULL,   -- 总分块数
    video_keys TEXT[] DEFAULT '{}' NOT NULL, -- 视频文件的键，存储为字符串数组
    chunks_size INTEGER DEFAULT 0  NOT NULL,   -- 分块大小
    video_path TEXT DEFAULT '' NOT NULL, -- 视频文件路径
    data_path TEXT DEFAULT '' NOT NULL, -- 数据文件路径
    is_aloha BOOLEAN NOT NULL DEFAULT FALSE -- 是否为aloha数据集，默认为FALSE
);
CREATE INDEX IF NOT EXISTS idx_datasets_owner_id ON dataset (owner_id);

CREATE TABLE IF NOT EXISTS model_type (
    id SERIAL PRIMARY KEY,              -- 模型类型ID，自增主键
    type_name VARCHAR(50) UNIQUE NOT NULL, -- 模型类型名称，唯一且不能为空
    description TEXT DEFAULT NULL         -- 模型类型描述，可为空
);

CREATE TABLE IF NOT EXISTS train_task(
    id SERIAL PRIMARY KEY,              -- 训练记录ID，自增主键
    owner_id INTEGER NOT NULL REFERENCES app_user(id) ON DELETE CASCADE, -- 用户ID，外键引用users表
    dataset_id INTEGER REFERENCES dataset(id) ON DELETE SET NULL, -- 数据集ID，外键引用datasets表
    model_type_id INTEGER REFERENCES model_type(id) ON DELETE SET NULL, -- 模型类型ID，外键引用model_types表
    hyperparameter JSONB NOT NULL, -- 超参数，存储为JSONB格式
    status traintaskstatus NOT NULL DEFAULT 'pending',        -- 训练状态，如 'pending', 'running', 'completed', 'failed'
    create_time TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc', NOW()) NOT NULL, -- 开始时间，默认为当前时间
    start_time TIMESTAMP WITH TIME ZONE DEFAULT NULL, 
    end_time TIMESTAMP WITH TIME ZONE DEFAULT NULL, -- 结束时间，可为空
    logs_uuid UUID, -- 训练日志的UUID，可为空
    task_name TEXT NOT NULL,

    CONSTRAINT chk_status CHECK (status IN ('pending', 'running', 'completed', 'failed'))

);
CREATE INDEX IF NOT EXISTS idx_train_tasks_owner_id ON train_task (owner_id);

CREATE TABLE IF NOT EXISTS eval_task(
    id SERIAL PRIMARY KEY,              -- 评估记录ID，自增主键
    owner_id INTEGER NOT NULL REFERENCES app_user(id) ON DELETE CASCADE, -- 用户ID，外键引用users表
    train_task_id INTEGER NOT NULL REFERENCES train_task(id) ON DELETE CASCADE, -- 训练任务ID，外键引用train_tasks表
    status evaltaskstatus NOT NULL DEFAULT 'pending',        -- 评估状态，如 'pending', 'running', 'completed', 'failed'
    eval_stage INTEGER NOT NULL DEFAULT 1, -- 评估的训练阶段，默认为1，只能为1，2，3，4
    create_time TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc', NOW()) NOT NULL, -- 创建时间，默认为当前时间
    start_time TIMESTAMP WITH TIME ZONE DEFAULT NULL, 
    end_time TIMESTAMP WITH TIME ZONE DEFAULT NULL, -- 结束时间，可为空
    task_name TEXT NOT NULL,

    CONSTRAINT chk_eval_status CHECK (status IN ('pending', 'running', 'completed', 'failed')),
    CONSTRAINT chk_eval_stage CHECK (eval_stage IN (1, 2, 3, 4))
);
CREATE INDEX IF NOT EXISTS idx_eval_tasks_owner_id ON eval_task (owner_id);

CREATE TABLE IF NOT EXISTS train_log (
    id SERIAL PRIMARY KEY,              -- 训练日志ID，自增主键
    train_task_id INTEGER NOT NULL REFERENCES train_task(id) ON DELETE CASCADE, -- 训练任务ID，外键引用train_tasks表
    log_message TEXT NOT NULL,          -- 日志消息，不能为空
    log_time TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc', NOW()) NOT NULL -- 日志时间，默认为当前时间
);
CREATE INDEX IF NOT EXISTS idx_train_logs_task_id ON train_log (train_task_id);

-- 往model_type表中插入初始数据
INSERT INTO model_type (type_name, description) VALUES
    ('ACT', 'ACT'),
    ('Diffusion', 'Diffusion')



