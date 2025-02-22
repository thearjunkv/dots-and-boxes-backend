export class GameError extends Error {
	originalError: unknown;

	constructor(message: string, originalError?: unknown) {
		super(message);
		this.name = this.constructor.name;
		this.originalError = originalError;

		Object.setPrototypeOf(this, new.target.prototype);

		if (Error.captureStackTrace) {
			Error.captureStackTrace(this, this.constructor);
		}
	}
}
