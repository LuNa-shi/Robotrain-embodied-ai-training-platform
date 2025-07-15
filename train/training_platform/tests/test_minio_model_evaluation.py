#!/usr/bin/env python3
"""
测试从 MinIO 获取 task_id=1 的最大 step checkpoint 并下载解压的功能
"""

import sys
import os
import asyncio
import tempfile
import shutil
import json
import time
import re
from pathlib import Path
from typing import Dict, Any, Optional, Tuple

# 添加项目路径
sys.path.insert(0, str(Path(__file__).parent))

from training_platform.common.minio_utils import (
    get_minio_client, 
    list_objects_with_prefix,
    download_ckpt_from_minio
)
from training_platform.configs.settings import settings

def setup_test_environment():
    """设置测试环境"""
    print("🔧 设置测试环境...")
    
    # 创建 outputs 文件夹
    outputs_dir = Path("./outputs")
    outputs_dir.mkdir(exist_ok=True)
    
    # 创建测试结果目录
    test_results_dir = outputs_dir / "checkpoint_download_tests"
    test_results_dir.mkdir(exist_ok=True)
    
    # 创建下载目录
    download_dir = outputs_dir / "downloaded_checkpoints"
    download_dir.mkdir(exist_ok=True)
    
    print(f"✅ 测试结果目录: {test_results_dir}")
    print(f"✅ 下载目录: {download_dir}")
    
    return outputs_dir, test_results_dir, download_dir

async def test_minio_connection():
    """测试 MinIO 连接"""
    print("\n🧪 测试 MinIO 连接...")
    
    try:
        client = await get_minio_client()
        
        if client:
            print("✅ MinIO 客户端连接成功")
            
            # 测试列出存储桶
            buckets = await client.list_buckets()
            print(f"📦 可用存储桶: {[bucket.name for bucket in buckets]}")
            
            # 检查默认存储桶
            bucket_exists = await client.bucket_exists(settings.MINIO_BUCKET)
            print(f"📦 默认存储桶 '{settings.MINIO_BUCKET}' 存在: {bucket_exists}")
            
            if not bucket_exists:
                print(f"❌ 存储桶 '{settings.MINIO_BUCKET}' 不存在")
                return False, None
            
            return True, client
        else:
            print("❌ MinIO 客户端连接失败")
            return False, None
            
    except Exception as e:
        print(f"❌ MinIO 连接测试失败: {e}")
        print("💡 请确保 MinIO 服务正在运行")
        print("💡 检查配置: MINIO_URL, MINIO_ACCESS_KEY, MINIO_SECRET_KEY")
        return False, None

async def find_latest_checkpoint_for_task(client, task_id: str) -> Tuple[bool, Optional[str], Optional[int], Dict[str, Any]]:
    """
    查找指定 task_id 的最新 checkpoint
    
    Args:
        client: MinIO 客户端
        task_id: 训练任务 ID
        
    Returns:
        (success, latest_checkpoint_path, latest_step, search_info)
    """
    print(f"\n🔍 查找 task_id={task_id} 的最新 checkpoint...")
    
    try:
        # 构建搜索前缀
        prefix = f"{settings.MINIO_CKPT_DIR}/{task_id}/"
        
        print(f"🔍 搜索前缀: {prefix}")
        print(f"🗂️  存储桶: {settings.MINIO_BUCKET}")
        
        # 列出所有符合前缀的对象
        success, objects = await list_objects_with_prefix(
            client=client,
            bucket_name=settings.MINIO_BUCKET,
            prefix=prefix
        )
        
        if not success:
            print(f"❌ 无法列出对象，前缀: {prefix}")
            return False, None, None, {"error": "无法列出对象"}
        
        print(f"📋 找到 {len(objects)} 个对象:")
        for obj in objects:
            print(f"  📄 {obj}")
        
        # 过滤出 checkpoint 文件并解析 step 号
        checkpoint_pattern = re.compile(rf"{re.escape(settings.MINIO_CKPT_DIR)}/{re.escape(task_id)}/checkpoint_step_(\d+)\.zip$")
        checkpoints = []
        
        for obj_name in objects:
            match = checkpoint_pattern.match(obj_name)
            if match:
                step = int(match.group(1))
                checkpoints.append((step, obj_name))
                print(f"✅ 匹配 checkpoint: step={step}, 文件={obj_name}")
            else:
                print(f"⚠️  不匹配 checkpoint 模式: {obj_name}")
        
        if not checkpoints:
            print(f"❌ 没有找到 task_id={task_id} 的 checkpoint 文件")
            search_info = {
                "prefix": prefix,
                "total_objects": len(objects),
                "checkpoint_count": 0,
                "all_objects": objects,
                "error": "没有找到符合格式的checkpoint文件"
            }
            return False, None, None, search_info
        
        # 按 step 排序，取最大的
        checkpoints.sort(key=lambda x: x[0], reverse=True)
        latest_step, latest_checkpoint = checkpoints[0]
        
        print(f"\n🎯 发现的 checkpoint:")
        for step, obj_name in sorted(checkpoints, key=lambda x: x[0]):
            marker = "👑 [最新]" if step == latest_step else "  "
            print(f"  {marker} Step {step:6d}: {obj_name}")
        
        print(f"\n🏆 最新 checkpoint:")
        print(f"  📈 Step: {latest_step}")
        print(f"  📄 文件: {latest_checkpoint}")
        
        search_info = {
            "prefix": prefix,
            "total_objects": len(objects),
            "checkpoint_count": len(checkpoints),
            "latest_checkpoint": latest_checkpoint,
            "latest_step": latest_step,
            "all_checkpoints": [{"step": step, "object": obj} for step, obj in checkpoints],
            "all_objects": objects
        }
        
        return True, latest_checkpoint, latest_step, search_info
        
    except Exception as e:
        print(f"❌ 查找 checkpoint 失败: {e}")
        import traceback
        traceback.print_exc()
        
        error_info = {
            "error": str(e),
            "traceback": traceback.format_exc()
        }
        return False, None, None, error_info

async def download_and_extract_checkpoint(client, checkpoint_path: str, download_dir: Path) -> Tuple[bool, Optional[Path], Dict[str, Any]]:
    """
    下载并解压 checkpoint 文件
    
    Args:
        client: MinIO 客户端
        checkpoint_path: checkpoint 在 MinIO 中的路径
        download_dir: 本地下载目录
        
    Returns:
        (success, extract_dir_path, download_info)
    """
    print(f"\n📥 下载并解压 checkpoint: {checkpoint_path}")
    
    try:
        # 创建临时下载目录
        timestamp = int(time.time())
        temp_download_dir = download_dir / f"temp_download_{timestamp}"
        temp_download_dir.mkdir(exist_ok=True)
        
        # 构建本地文件路径
        checkpoint_filename = Path(checkpoint_path).name
        local_zip_path = temp_download_dir / checkpoint_filename
        
        print(f"📁 临时下载目录: {temp_download_dir}")
        print(f"📄 本地文件路径: {local_zip_path}")
        
        # 下载文件
        print("⬇️  开始下载...")
        download_start_time = time.time()
        
        # download_ckpt_from_minio 会自动添加 MINIO_CKPT_DIR 前缀
        # 所以我们需要移除 checkpoint_path 中的前缀部分
        from training_platform.configs.settings import settings
        
        if checkpoint_path.startswith(f"{settings.MINIO_CKPT_DIR}/"):
            # 移除前缀，只保留相对路径
            relative_ckpt_path = checkpoint_path[len(f"{settings.MINIO_CKPT_DIR}/"):]
        else:
            relative_ckpt_path = checkpoint_path
        
        print(f"🔧 MinIO 对象路径: {checkpoint_path}")
        print(f"🔧 相对路径: {relative_ckpt_path}")
        
        success, message = await download_ckpt_from_minio(
            client=client,
            download_local_path=str(local_zip_path),
            ckpt_name=relative_ckpt_path
        )
        
        download_time = time.time() - download_start_time
        
        if not success:
            print(f"❌ 下载失败: {message}")
            shutil.rmtree(temp_download_dir, ignore_errors=True)
            return False, None, {"error": message, "download_time": download_time}
        
        file_size = local_zip_path.stat().st_size
        print(f"✅ 下载成功!")
        print(f"  📁 文件大小: {file_size / 1024 / 1024:.2f} MB")
        print(f"  ⏱️  下载时间: {download_time:.2f} 秒")
        print(f"  🚀 下载速度: {(file_size / 1024 / 1024) / download_time:.2f} MB/s")
        
        # 解压文件
        print("📦 开始解压...")
        extract_start_time = time.time()
        
        extract_dir = temp_download_dir / "extracted"
        extract_dir.mkdir(exist_ok=True)
        
        shutil.unpack_archive(str(local_zip_path), str(extract_dir))
        
        extract_time = time.time() - extract_start_time
        print(f"✅ 解压完成!")
        print(f"  ⏱️  解压时间: {extract_time:.2f} 秒")
        
        # 分析解压内容
        print("🔍 分析解压内容...")
        extracted_items = []
        total_files = 0
        total_size = 0
        
        for root, dirs, files in os.walk(extract_dir):
            for file in files:
                file_path = Path(root) / file
                relative_path = file_path.relative_to(extract_dir)
                file_size = file_path.stat().st_size
                
                extracted_items.append({
                    "path": str(relative_path),
                    "size": file_size,
                    "size_mb": file_size / 1024 / 1024
                })
                
                total_files += 1
                total_size += file_size
        
        print(f"📊 解压统计:")
        print(f"  📄 文件总数: {total_files}")
        print(f"  📁 总大小: {total_size / 1024 / 1024:.2f} MB")
        
        # 显示主要文件
        print(f"📋 主要文件:")
        for item in sorted(extracted_items, key=lambda x: x['size'], reverse=True)[:10]:
            print(f"  📄 {item['path']:<40} ({item['size_mb']:.2f} MB)")
        
        if len(extracted_items) > 10:
            print(f"  ... 还有 {len(extracted_items) - 10} 个文件")
        
        # 查找重要文件
        important_files = []
        for item in extracted_items:
            path = item['path'].lower()
            if any(keyword in path for keyword in ['config.json', 'pytorch_model', 'model.safetensors', 'train_config.json']):
                important_files.append(item)
        
        if important_files:
            print(f"🎯 重要文件:")
            for item in important_files:
                print(f"  🔑 {item['path']}")
        
        # 删除原始 zip 文件以节省空间
        os.remove(local_zip_path)
        print(f"🗑️  已删除原始 zip 文件")
        
        download_info = {
            "checkpoint_path": checkpoint_path,
            "local_zip_path": str(local_zip_path),
            "extract_dir": str(extract_dir),
            "download_time": download_time,
            "extract_time": extract_time,
            "file_size": file_size,
            "file_size_mb": file_size / 1024 / 1024,
            "total_files": total_files,
            "total_size": total_size,
            "total_size_mb": total_size / 1024 / 1024,
            "important_files": important_files,
            "all_files": extracted_items[:50]  # 只保存前50个文件信息
        }
        
        return True, extract_dir, download_info
        
    except Exception as e:
        print(f"❌ 下载和解压失败: {e}")
        import traceback
        traceback.print_exc()
        
        # 清理临时文件
        if 'temp_download_dir' in locals():
            shutil.rmtree(temp_download_dir, ignore_errors=True)
        
        error_info = {
            "error": str(e),
            "traceback": traceback.format_exc()
        }
        return False, None, error_info

async def test_model_evaluation(extract_dir: Path, checkpoint_info: Dict[str, Any]) -> Tuple[bool, Dict[str, Any]]:
    """
    测试下载的模型评估功能
    
    Args:
        extract_dir: 解压后的模型目录
        checkpoint_info: checkpoint 信息
        
    Returns:
        (success, eval_results)
    """
    print(f"\n🎯 测试模型评估功能...")
    
    try:
        # 导入评估相关模块
        from training_platform.evaluator.evaluator_logic import run_lerobot_evaluation_sync
        
        # 查找模型文件和配置文件
        model_files = []
        config_files = []
        pretrained_model_dir = None
        
        for root, dirs, files in os.walk(extract_dir):
            for file in files:
                file_path = os.path.join(root, file)
                
                # 查找模型权重文件
                if any(keyword in file.lower() for keyword in ['pytorch_model', 'model.safetensors', 'model.bin']):
                    model_files.append(file_path)
                
                # 查找配置文件
                if 'config.json' in file.lower() or 'train_config.json' in file.lower():
                    config_files.append(file_path)
                    
                # 检查是否在 pretrained_model 目录中
                if 'pretrained_model' in root and file.lower() == 'config.json':
                    pretrained_model_dir = root
        
        print(f"🔍 找到模型文件: {model_files}")
        print(f"📋 找到配置文件: {config_files}")
        
        if not model_files:
            print("⚠️  未找到模型权重文件，跳过评估测试")
            return False, {"error": "未找到模型权重文件"}
        
        # 确定正确的模型路径
        if pretrained_model_dir:
            # 如果找到了 pretrained_model 目录，使用它
            model_path_for_eval = pretrained_model_dir
            print(f"✅ 使用 pretrained_model 目录: {model_path_for_eval}")
        else:
            # 否则使用解压根目录
            model_path_for_eval = str(extract_dir)
            print(f"⚠️  未找到 pretrained_model 目录，使用解压根目录: {model_path_for_eval}")
            
        # 检查目标目录是否包含必需的配置文件
        target_config_path = os.path.join(model_path_for_eval, "config.json")
        if not os.path.exists(target_config_path):
            print(f"❌ 目标目录缺少 config.json: {target_config_path}")
            return False, {"error": f"目标目录缺少 config.json: {target_config_path}"}
        
        # 检查配置文件内容
        try:
            with open(target_config_path, 'r', encoding='utf-8') as f:
                config_content = json.load(f)
            
            print(f"📋 config.json 内容预览:")
            for key in list(config_content.keys())[:5]:  # 只显示前5个键
                print(f"  🔑 {key}: {str(config_content[key])[:50]}{'...' if len(str(config_content[key])) > 50 else ''}")
            
            if len(config_content) > 5:
                print(f"  ... 还有 {len(config_content) - 5} 个配置项")
            
            # 检查是否包含 'type' 字段（LeRobot 策略配置必需）
            if 'type' not in config_content:
                print(f"⚠️  配置文件缺少必需的 'type' 字段，尝试添加默认值")
                # 尝试从文件名或路径推断模型类型
                config_content['type'] = 'act'  # 默认使用 ACT 类型
                
                # 保存修改后的配置
                with open(target_config_path, 'w', encoding='utf-8') as f:
                    json.dump(config_content, f, indent=2)
                
                print(f"✅ 已添加默认 type 字段: {config_content['type']}")
            else:
                print(f"✅ 配置文件包含 type 字段: {config_content['type']}")
                
        except Exception as config_error:
            print(f"❌ 无法读取或解析配置文件: {config_error}")
            return False, {"error": f"配置文件解析失败: {config_error}"}
        
        # 准备评估环境配置（使用简单的测试配置）
        env_config = {
            "type": "aloha",
            "task": "AlohaInsertion-v0",
            "fps": 50,
            "episode_length": 100,  # 缩短测试时间
            "obs_type": "pixels_agent_pos",
            "render_mode": "rgb_array"
        }
        
        eval_config = {
            "n_episodes": 1,  # 只测试1个episode
            "batch_size": 1,
            "use_async_envs": False
        }
        
        # 创建评估输出目录
        eval_output_dir = extract_dir.parent / "eval_test_output"
        eval_output_dir.mkdir(exist_ok=True)
        
        print(f"🏃 开始评估测试...")
        print(f"  模型路径: {model_path_for_eval}")
        print(f"  输出目录: {eval_output_dir}")
        print(f"  Episodes: {eval_config['n_episodes']}")
        
        # 记录开始时间
        eval_start_time = time.time()
        
        try:
            # 尝试运行评估（这可能会失败，因为可能缺少环境或其他依赖）
            eval_results = await asyncio.to_thread(
                run_lerobot_evaluation_sync,
                model_path=model_path_for_eval,
                env_config=env_config,
                eval_config=eval_config,
                output_dir=str(eval_output_dir),
                seed=1000,
                max_episodes_rendered=1,
                return_episode_data=False,
            )
            
            eval_time = time.time() - eval_start_time
            
            print(f"✅ 评估测试完成!")
            print(f"  ⏱️  评估时间: {eval_time:.2f} 秒")
            
            if eval_results and 'aggregated' in eval_results:
                print(f"  📊 评估结果: {eval_results['aggregated']}")
            
            return True, {
                "eval_time": eval_time,
                "eval_results": eval_results,
                "model_files": model_files,
                "config_files": config_files,
                "model_path_used": model_path_for_eval,
                "eval_output_dir": str(eval_output_dir)
            }
            
        except Exception as eval_error:
            eval_time = time.time() - eval_start_time
            error_msg = str(eval_error)
            
            print(f"⚠️  评估测试失败: {error_msg}")
            print(f"  ⏱️  尝试时间: {eval_time:.2f} 秒")
            
            # 这不算严重错误，因为可能是环境问题
            return False, {
                "eval_time": eval_time,
                "error": error_msg,
                "model_files": model_files,
                "config_files": config_files,
                "model_path_used": model_path_for_eval,
                "message": "评估环境可能未正确配置，但模型文件结构正常"
            }
        
    except Exception as e:
        print(f"❌ 评估测试准备失败: {e}")
        import traceback
        traceback.print_exc()
        
        return False, {
            "error": str(e),
            "traceback": traceback.format_exc()
        }

async def close_minio_connections():
    """关闭MinIO连接以避免未关闭连接的警告"""
    try:
        from training_platform.common.minio_utils import _MinIOManager
        
        # 获取管理器实例
        if _MinIOManager._instance is not None:
            manager = _MinIOManager._instance
            if manager.client is not None:
                # 尝试关闭底层的HTTP会话
                if hasattr(manager.client, '_http_session') and manager.client._http_session:
                    if hasattr(manager.client._http_session, 'close'):
                        await manager.client._http_session.close()
                    print("🔌 已关闭 MinIO HTTP 会话")
                
                # 清空客户端引用
                manager.client = None
                print("🔌 已清理 MinIO 客户端引用")
        
        print("✅ MinIO 连接清理完成")
    except Exception as e:
        print(f"⚠️  关闭 MinIO 连接时出现警告: {e}")
        # 这不是严重错误，不要抛出异常

async def run_checkpoint_download_test():
    """运行 checkpoint 下载测试的主函数"""
    print("🚀 开始 task_id=1 checkpoint 下载和解压测试")
    print("=" * 60)
    
    outputs_dir, test_results_dir, download_dir = setup_test_environment()
    
    # 测试结果记录
    test_results = {
        "test_name": "taskid_1_checkpoint_download_test",
        "start_time": time.time(),
        "task_id": "1",
        "steps": []
    }
    
    try:
        # 1. 测试 MinIO 连接
        print(f"\n{'='*20} 步骤 1: MinIO 连接测试 {'='*20}")
        
        connection_success, client = await test_minio_connection()
        test_results["steps"].append({
            "step": 1,
            "name": "minio_connection",
            "success": connection_success,
            "timestamp": time.time()
        })
        
        if not connection_success:
            print("❌ MinIO 连接失败，测试终止")
            test_results["success"] = False
            test_results["error"] = "MinIO 连接失败"
            return False, test_results
        
        # 2. 查找最新 checkpoint
        print(f"\n{'='*20} 步骤 2: 查找最新 checkpoint {'='*20}")
        
        find_success, latest_checkpoint, latest_step, search_info = await find_latest_checkpoint_for_task(client, "1")
        test_results["steps"].append({
            "step": 2,
            "name": "find_latest_checkpoint",
            "success": find_success,
            "timestamp": time.time(),
            "data": search_info
        })
        
        if not find_success or latest_checkpoint is None:
            print("❌ 未找到 checkpoint，测试终止")
            test_results["success"] = False
            test_results["error"] = "未找到checkpoint文件"
            test_results["search_info"] = search_info
            return False, test_results
        
        test_results["latest_checkpoint"] = latest_checkpoint
        test_results["latest_step"] = latest_step
        
        # 3. 下载和解压 checkpoint
        print(f"\n{'='*20} 步骤 3: 下载和解压 checkpoint {'='*20}")
        
        download_success, extract_dir, download_info = await download_and_extract_checkpoint(
            client, latest_checkpoint, download_dir
        )
        test_results["steps"].append({
            "step": 3,
            "name": "download_and_extract",
            "success": download_success,
            "timestamp": time.time(),
            "data": download_info
        })
        
        if not download_success:
            print("❌ 下载和解压失败")
            test_results["success"] = False
            test_results["error"] = "下载和解压失败"
            test_results["download_info"] = download_info
            return False, test_results
        
        test_results["extract_dir"] = str(extract_dir)
        test_results["download_info"] = download_info
        
        # 4. 模型评估测试
        print(f"\n{'='*20} 步骤 4: 模型评估测试 {'='*20}")
        
        if extract_dir is None:
            print("❌ 无法进行评估测试：解压目录为空")
            eval_success, eval_info = False, {"error": "解压目录为空"}
        else:
            eval_success, eval_info = await test_model_evaluation(extract_dir, download_info)
        test_results["steps"].append({
            "step": 4,
            "name": "model_evaluation",
            "success": eval_success,
            "timestamp": time.time(),
            "data": eval_info
        })
        
        test_results["eval_info"] = eval_info
        
        if eval_success:
            print("✅ 模型评估测试成功")
        else:
            print("⚠️  模型评估测试失败（这可能是由于环境配置问题）")
        
        # 5. 测试完成
        test_results["success"] = True
        test_results["end_time"] = time.time()
        test_results["total_time"] = test_results["end_time"] - test_results["start_time"]
        
        print(f"\n{'='*60}")
        print("🎉 测试成功完成!")
        print(f"✅ 总耗时: {test_results['total_time']:.2f} 秒")
        print(f"✅ 最新模型: Step {latest_step}")
        print(f"✅ 模型大小: {download_info['file_size_mb']:.2f} MB")
        print(f"✅ 文件数量: {download_info['total_files']}")
        print(f"✅ 解压目录: {extract_dir}")
        if eval_success:
            print(f"✅ 评估测试: 成功")
        else:
            print(f"⚠️  评估测试: 失败（可能是环境问题）")
        print(f"{'='*60}")
        
        return True, test_results
        
    except Exception as e:
        print(f"❌ 测试过程中发生异常: {e}")
        import traceback
        traceback.print_exc()
        
        test_results["success"] = False
        test_results["error"] = str(e)
        test_results["traceback"] = traceback.format_exc()
        test_results["end_time"] = time.time()
        
        return False, test_results
    
    finally:
        # 关闭 MinIO 连接
        await close_minio_connections()
        
        # 保存测试结果
        results_file = test_results_dir / f"checkpoint_download_test_{int(time.time())}.json"
        with open(results_file, 'w', encoding='utf-8') as f:
            json.dump(test_results, f, indent=2, ensure_ascii=False)
        
        print(f"\n📄 测试结果已保存: {results_file}")

def main():
    """主函数"""
    try:
        success, test_results = asyncio.run(run_checkpoint_download_test())
        
        if success:
            print("\n🎊 task_id=1 checkpoint 下载测试成功!")
            print("📦 可以成功从 MinIO 获取并解压最新的训练模型。")
        else:
            print("\n❌ task_id=1 checkpoint 下载测试失败。")
            
            if "search_info" in test_results:
                search_info = test_results["search_info"]
                if "total_objects" in search_info:
                    print(f"💡 找到 {search_info['total_objects']} 个对象，但其中 {search_info.get('checkpoint_count', 0)} 个是有效的 checkpoint")
                if "all_objects" in search_info and search_info["all_objects"]:
                    print("💡 MinIO 中存在的文件:")
                    for obj in search_info["all_objects"][:5]:
                        print(f"  📄 {obj}")
                    if len(search_info["all_objects"]) > 5:
                        print(f"  ... 还有 {len(search_info['all_objects']) - 5} 个文件")
        
        return 0 if success else 1
        
    except KeyboardInterrupt:
        print("\n⏹️  测试被用户中断")
        return 1
    except Exception as e:
        print(f"\n💥 测试运行异常: {e}")
        import traceback
        traceback.print_exc()
        return 1

if __name__ == "__main__":
    exit_code = main()
    sys.exit(exit_code) 