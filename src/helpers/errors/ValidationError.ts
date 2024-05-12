export class ValidationError extends Error {
	public static MessageTemplates = {
		NotConfigured: (name: string) => `the ${name} configuration has not been setup yet`,
		SystemIsDisabled: (name: string) => `the ${name} system is disabled`,
		InvalidChannelType: (reference: string, requiredType: string) =>
			`The ${reference} channel type must be ${requiredType}`,
		CannotRecall: (name: string) =>
			`${name} cannot be identified, either because it has been deleted or its reference has been altered`,
		AlreadyMatched: "The options you provided are included in the current configuration"
	};

	constructor(message: string) {
		super(message);
	}
}
