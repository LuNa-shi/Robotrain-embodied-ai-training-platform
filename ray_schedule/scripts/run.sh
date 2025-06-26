#!/bin/bash

# Ray调度器启动脚本

echo "🚀 Ray调度器启动脚本"
echo "=================="

# 检查Python环境
if ! command -v python3 &> /dev/null; then
    echo "❌ Python3 未找到，请先安装Python3"
    exit 1
fi

# 检查Ray是否安装
if ! python3 -c "import ray" &> /dev/null; then
    echo "❌ Ray未安装，正在安装..."
    pip install ray
fi

echo "✅ 环境检查完成"

# 显示菜单
echo ""
echo "请选择运行模式："
echo "1) 运行主程序 (src/main.py)"
echo "2) 运行测试 (test/test_core.py)"
echo "3) 退出"
echo ""

read -p "请输入选择 (1-3): " choice

case $choice in
    1)
        echo "🎯 启动主程序..."
        cd "$(dirname "$0")/.."
        python3 src/main.py
        ;;
    2)
        echo "🧪 启动测试..."
        cd "$(dirname "$0")/.."
        python3 test/test_core.py
        ;;
    3)
        echo "👋 退出"
        exit 0
        ;;
    *)
        echo "❌ 无效选择"
        exit 1
        ;;
esac
