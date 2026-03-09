/** Classification of detected question types */
export type QuestionType = 'single-choice' | 'multiple-choice' | 'image-based' | 'unknown';

/** Question type as determined during extraction (maps to AI prompt format) */
export type ExtractedQuestionType = 'multiple-choice' | 'checkbox' | 'text-input';

/** A question container detected in the DOM by QuestionDetector */
export interface DetectedQuestion {
	element: HTMLElement;
	type: QuestionType;
	/** FNV-1a hash of content */
	uid: string;
	processed: boolean;
}

/** Fully extracted question data ready for AI processing */
export interface ExtractedQuestion {
	questionText: string;
	questionType: ExtractedQuestionType;
	options: AnswerOption[];
	/** Question-level image URLs (from the prompt/legend, not options) */
	images: string[];
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
