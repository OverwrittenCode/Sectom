import { ValidationError } from "~/helpers/errors/ValidationError.js";
import { CommandUtils } from "~/utils/command.js";

import type { CommandInteraction } from "discord.js";
import type { GuardFunction } from "discordx";

export const AtLeastOneSlashOption: GuardFunction<CommandInteraction> = async (interaction, _client, next) => {
	const options = CommandUtils.retrieveCommandInteractionOptions(interaction);

	const noOptionsProvided = !options.filter(({ name }) => !name.includes("reason")).length;

	if (noOptionsProvided) {
		throw new ValidationError("you must provide at least one option");
	}

	await next();
};
