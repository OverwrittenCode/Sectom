export class ValidationError extends Error {
	constructor(message: string) {
		if (!message.endsWith(".")) {
			message += ".";
		}

		super(message);
	}
}
