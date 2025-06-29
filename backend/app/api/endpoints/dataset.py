from fastapi import APIRouter, Depends, File, UploadFile, Form, HTTPException, status
from sqlmodel.ext.asyncio.session import AsyncSession
from typing import Annotated

from app.core.deps import get_db
from app.service.dataset import DatasetService
from app.schemas.dataset import DatasetPublic
from app.core.security import get_current_user
from app.models.user import AppUser
from app.schemas.dataset import DatasetCreate

# 创建路由实例
router = APIRouter()

# 依赖注入 UserService
async def get_dataset_service(db: Annotated[AsyncSession, Depends(get_db)]) -> DatasetService:
    return DatasetService(db)

@router.get("/me", summary="获取当前用户的数据集列表")
async def get_my_datasets(
    current_user: Annotated[AppUser, Depends(get_current_user)],
    dataset_service: Annotated[DatasetService, Depends(get_dataset_service)],
) -> list[DatasetPublic]:
    """
    **获取当前用户的数据集列表**

    返回当前登录用户拥有的数据集的公开信息列表。

    **响应:**
    - `200 OK`: 成功获取数据集列表。
    - `401 Unauthorized`: 用户未登录。
    """
    datasets = await dataset_service.get_datasets_by_user_id(current_user.id)
    return datasets

@router.get("/{dataset_id}", summary="获取数据集详情")
async def get_dataset(
    dataset_id: int,
    current_user: Annotated[AppUser, Depends(get_current_user)],
    dataset_service: Annotated[DatasetService, Depends(get_dataset_service)],
) -> DatasetPublic:
    """
    **获取数据集详情**

    根据数据集ID获取数据集的详细信息。

    **路径参数:**
    - `dataset_id`: 要查询的数据集的ID。

    **响应:**
    - `200 OK`: 成功获取数据集详情。
    - `404 Not Found`: 数据集不存在。
    """
    # 验证用户是否拥有该数据集
    if dataset_id not in [dataset.id for dataset in current_user.owned_datasets]:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="该数据集不存在或该数据集不属于当前用户。",
        )
    dataset = await dataset_service.get_dataset_by_id(dataset_id)
    if not dataset:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="数据集未找到。",
        )
    return dataset

@router.post("/upload", response_model=DatasetPublic, summary="创建新数据集")
async def upload_dataset(
    current_user: Annotated[AppUser, Depends(get_current_user)],
    dataset_service: Annotated[DatasetService, Depends(get_dataset_service)],
    name: str = Form(..., description="数据集名称"),
    description: str = Form(..., description="数据集描述"),
    file: UploadFile = File(..., description="上传的数据集文件"),
) -> DatasetPublic:
    """
    **创建新数据集**

    上传数据集文件并创建新的数据集记录。
    仅支持上传 zip 格式的文件。
    
    **表单参数:**
    - `name`: 数据集名称。
    - `description`: 数据集描述。
    - `file`: 上传的数据集文件。

    **响应:**
    - `201 Created`: 成功创建数据集。
    - `400 Bad Request`: 请求参数错误。
    - `401 Unauthorized`: 用户未登录。
    """
    if not file.filename.endswith(('.zip')):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="仅支持上传 zip 格式的文件。",
        )
    
    dataset_create: DatasetCreate = DatasetCreate(
        dataset_name=name,
        description=description,
    )
    # service层
    dataset = await dataset_service.upload_dataset_for_user(
        user=current_user,
        dataset_create=dataset_create,
        upload_file=file
    )
    if not dataset:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="数据集上传失败，请稍后重试。",
        )
    return dataset

@router.delete("/{dataset_id}", summary="删除数据集")
async def delete_dataset(
    dataset_id: int,
    current_user: Annotated[AppUser, Depends(get_current_user)],
    dataset_service: Annotated[DatasetService, Depends(get_dataset_service)],
) -> DatasetPublic:
    """
    **删除数据集**

    根据数据集ID删除指定的数据集。

    **路径参数:**
    - `dataset_id`: 要删除的数据集的ID。

    **响应:**
    - `204 No Content`: 成功删除数据集。
    - `404 Not Found`: 数据集不存在。
    - `401 Unauthorized`: 用户未登录。
    """
    # 验证用户是否拥有该数据集
    if dataset_id not in [dataset.id for dataset in current_user.owned_datasets]:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="该数据集不存在或该数据集不属于当前用户。",
        )
    
    deleted_dataset = await dataset_service.delete_dataset_by_id(dataset_id)
    if not delete_dataset:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="数据集未找到。",
        )
    
    return deleted_dataset