import { beforeEach } from 'vitest';
import { installChromeMock, resetChromeMock } from './mocks/chrome';

installChromeMock();

beforeEach(() => {
	resetChromeMock();
});
