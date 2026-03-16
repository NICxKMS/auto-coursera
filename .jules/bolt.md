## 2024-05-18 - Parallelizing WebCrypto API Operations
**Learning:** Sequential async operations for bulk cryptographic tasks (like AES-GCM encryption/decryption of multiple API keys) block the event loop needlessly. WebCrypto API calls (`crypto.subtle`) map well to `Promise.all` for a considerable performance boost.
**Action:** Use `Promise.all` when dealing with multiple async crypto/storage operations rather than sequential loops (`for...of`) to reduce total blocking time.
