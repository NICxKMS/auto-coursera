/**
 * Copy text to the system clipboard with a hidden-textarea fallback.
 */
export async function copyToClipboard(text: string): Promise<void> {
	try {
		await navigator.clipboard.writeText(text);
	} catch {
		// Fallback for restricted clipboard contexts
		const ta = document.createElement('textarea');
		ta.value = text;
		ta.style.position = 'fixed';
		ta.style.opacity = '0';
		document.body.appendChild(ta);
		ta.select();
		document.execCommand('copy');
		ta.remove();
	}
}
