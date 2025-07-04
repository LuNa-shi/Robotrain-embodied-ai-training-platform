import pytest
from .conftest import TEST_DATASET_BUCKET # Import constants from conftest

pytestmark = pytest.mark.asyncio

@pytest.mark.asyncio
async def test_dataset_upload_to_minio(minio_test_client, prepared_dataset_in_minio):
    """
    Verifies that the dataset preparation fixture successfully uploaded the dataset to MinIO.
    """
    print("\n--- Verifying dataset presence in MinIO ---")
    
    client = minio_test_client
    dataset_object_name = prepared_dataset_in_minio
    
    try:
        # stat_object will throw an exception if the object is not found.
        response = await client.stat_object(TEST_DATASET_BUCKET, dataset_object_name)
        print(f"Found dataset object '{dataset_object_name}' in bucket '{TEST_DATASET_BUCKET}'. Size: {response.size}")
        # A simple check to ensure the file is not empty
        assert response.size > 1024 # Assert it's larger than 1KB
    except Exception as e:
        pytest.fail(f"Dataset object '{dataset_object_name}' not found in MinIO after preparation: {e}")