# RoboTrain

## 配置项目环境

## Train
1. 修改训练配置文件
2. 运行训练脚本
```bash
python3 lerobot/scripts/train.py --config-path config/diffusion_pusht_config.json
```
## Evaluate
```bash
python lerobot/scripts/eval.py \
    --policy.path=lerobot/diffusion_pusht \
    --env.type=pusht \
    --eval.batch_size=10 \
    --eval.n_episodes=10
```
