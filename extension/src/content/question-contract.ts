import type { QuestionSelectionMode } from '../types/questions';

const CHECKBOX_QUESTION_MARKER = 'CheckboxQuestion';
const MULTIPLE_CHOICE_QUESTION_MARKER = 'MultipleChoiceQuestion';
const CODE_EXPRESSION_MARKER = 'CodeExpression';
const NUMERIC_QUESTION_MARKER = 'NumericQuestion';

export function isCodeExpressionQuestion(testId: string): boolean {
	return testId.includes(CODE_EXPRESSION_MARKER);
}

export function isNumericQuestion(testId: string): boolean {
	return testId.includes(NUMERIC_QUESTION_MARKER);
}

export function getQuestionSelectionMode(
	element: Element,
	testId: string = '',
	fallback: QuestionSelectionMode = 'unknown',
): QuestionSelectionMode {
	if (testId.includes(CHECKBOX_QUESTION_MARKER)) return 'multiple';
	if (testId.includes(MULTIPLE_CHOICE_QUESTION_MARKER)) return 'single';
	if (isCodeExpressionQuestion(testId)) return 'text-input';
	if (testId.includes(NUMERIC_QUESTION_MARKER)) return 'numeric';
	if (element.querySelector('input[type="checkbox"]')) return 'multiple';
	if (element.querySelector('input[type="radio"]')) return 'single';
	return fallback;
}
