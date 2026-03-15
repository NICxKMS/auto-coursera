/**
 * DOM helpers for settings overlay form construction.
 * Reduces repeated section / field creation boilerplate.
 */

/**
 * Create a settings section container with a title bar.
 * Returns the section element — append field content to it after creation.
 */
export function createSection(titleText: string): HTMLDivElement {
	const section = document.createElement('div');
	section.className = 'ac-section';

	const title = document.createElement('span');
	title.className = 'ac-section__title';
	title.textContent = titleText;
	section.appendChild(title);

	return section;
}

/**
 * Create a labeled form field wrapper.
 * Links the `<label>` to the control via `htmlFor` / `id` and wraps
 * both in an `.ac-field` container.
 */
export function createField(
	labelText: string,
	controlId: string,
	control: HTMLElement,
): HTMLDivElement {
	const field = document.createElement('div');
	field.className = 'ac-field';

	const label = document.createElement('label');
	label.className = 'ac-field__label';
	label.textContent = labelText;
	label.htmlFor = controlId;
	control.id = controlId;

	field.append(label, control);
	return field;
}
