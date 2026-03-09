/**
 * Get a single object from an R2 bucket by key.
 *
 * Returns null when the key does not exist.
 */
export async function getObject(bucket: R2Bucket, key: string): Promise<R2ObjectBody | null> {
	return bucket.get(key);
}

/**
 * List all objects in an R2 bucket with an optional prefix filter.
 *
 * Automatically paginates through all results using the cursor.
 */
export async function listObjects(bucket: R2Bucket, prefix?: string): Promise<R2Object[]> {
	const objects: R2Object[] = [];
	let cursor: string | undefined;

	do {
		const result = await bucket.list({ prefix, cursor });
		objects.push(...result.objects);
		cursor = result.truncated ? result.cursor : undefined;
	} while (cursor);

	return objects;
}
