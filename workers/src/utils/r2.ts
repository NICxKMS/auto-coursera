/**
 * Get a single object from an R2 bucket by key.
 *
 * Returns null when the key does not exist.
 */
export async function getObject(bucket: R2Bucket, key: string): Promise<R2ObjectBody | null> {
	return bucket.get(key);
}

/**
 * List objects in an R2 bucket with an optional prefix filter.
 */
export async function listObjects(bucket: R2Bucket, prefix?: string): Promise<R2Objects> {
	return bucket.list({ prefix });
}
