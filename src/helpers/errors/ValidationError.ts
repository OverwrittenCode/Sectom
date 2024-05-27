import { ChannelType } from "discord.js";

import { StringUtils } from "~/utils/string.js";

export class ValidationError extends Error {
	public static MessageTemplates = {
		NotConfigured: (name: string) => `the ${name} configuration has not been setup yet`,
		SystemIsDisabled: (name: string) => `the ${name} system is disabled`,
		InvalidChannelType: (reference: string, requiredType: ChannelType) =>
			`The ${reference} channel type must be ${ChannelType[requiredType]}`,
		CannotRecall: (name: string) =>
			`${name} cannot be identified, either because it has been deleted or its reference has been altered`,
		AlreadyMatched:
			"The options you provided are included in the current configuration. If you are trying to replace an option, remove the old one first."
	};

	constructor(message: string) {
		if (!message.endsWith(".")) {
			message += ".";
		}

		super(StringUtils.capitaliseFirstLetter(message));
	}
}
