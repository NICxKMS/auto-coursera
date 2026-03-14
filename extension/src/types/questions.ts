/** Canonical selection modality used by detect/extract/solve/apply flow. */
export type QuestionSelectionMode = 'single' | 'multiple' | 'text-input' | 'numeric' | 'unknown';

/** A question container detected in the DOM by QuestionDetector */
export interface DetectedQuestion {
	element: HTMLElement;
	/** FNV-1a hash of content */
	uid: string;
}

/** Fully extracted question data ready for AI processing */
export interface ExtractedQuestion {
	questionText: string;
	selectionMode: QuestionSelectionMode;
	options: AnswerOption[];
	/** Question-level image URLs (from the prompt/legend, not options) */
	images: string[];
	/** The input element for numeric/text-input questions */
	inputElement?: HTMLInputElement;
	/** Code blocks from embedded Monaco editors, for AI context */
	codeBlocks?: string[];
}

/** A single answer option extracted from the DOM */
export interface AnswerOption {
	element: Element;
	index: number;
	text: string;
	inputElement: HTMLInputElement | null;
	images?: string[];
}

/** Result of an answer selection attempt */
export interface SelectionResult {
	success: boolean;
	selectedIndex: number;
	confidence: number;
	method: 'click' | 'input-change' | 'label-click';
}

/** Result of filling a numeric/text-input answer */
export interface FillResult {
	success: boolean;
	value: string;
	confidence: number;
}
