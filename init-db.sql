CREATE TABLE IF NOT EXISTS app_user (
    id SERIAL PRIMARY KEY,              -- 用户ID，自增主键
    username VARCHAR(50) UNIQUE NOT NULL, -- 用户名，唯一且不能为空
    password_hash VARCHAR(255) NOT NULL,  -- 密码哈希值，存储加密后的密码
    is_admin BOOLEAN NOT NULL DEFAULT FALSE,          -- 是否为管理员，默认为FALSE
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() AT TIME ZONE 'utc' NOT NULL, -- 注册时间，默认为当前时间
    last_login TIMESTAMP WITH TIME ZONE DEFAULT NULL  -- 最后登录时间，可为空
);
CREATE INDEX IF NOT EXISTS idx_users_username ON app_user (username);

CREATE TABLE IF NOT EXISTS dataset (
    id SERIAL PRIMARY KEY,              -- 数据集ID，自增主键
    dataset_name VARCHAR(100) NOT NULL,         -- 数据集名称，不能为空
    description TEXT DEFAULT NULL,       -- 数据集描述，可为空
    dataset_uuid UUID NOT NULL,         -- 数据集UUID(作为minio里的文件夹名)，不能为空
    owner_id INTEGER NOT NULL REFERENCES app_user(id) ON DELETE CASCADE, -- 所有者ID，外键引用users表
    uploaded_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() AT TIME ZONE 'utc' NOT NULL-- 创建时间，默认为当前时间
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
    status VARCHAR(20) NOT NULL DEFAULT 'pending',        -- 训练状态，如 'pending', 'running', 'completed', 'failed'
    create_time TIMESTAMP WITH TIME ZONE DEFAULT NOW() AT TIME ZONE 'utc' NOT NULL, -- 开始时间，默认为当前时间
    start_time TIMESTAMP WITH TIME ZONE DEFAULT NULL, 
    end_time TIMESTAMP WITH TIME ZONE DEFAULT NULL, -- 结束时间，可为空
    logs_uuid UUID, -- 训练日志的UUID，可为空
    model_uuid UUID, -- 训练生成的模型的UUID，可为空

    CONSTRAINT chk_status CHECK (status IN ('pending', 'running', 'completed', 'failed')),

    CONSTRAINT chk_completed_fields CHECK (
        CASE
            WHEN status = 'completed' THEN (model_uuid IS NOT NULL AND logs_uuid IS NOT NULL)
            ELSE TRUE
        END
    )
);
CREATE INDEX IF NOT EXISTS idx_train_tasks_owner_id ON train_task (owner_id);





