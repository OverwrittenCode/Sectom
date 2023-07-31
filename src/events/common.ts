import type { ArgsOf, Client } from "discordx";
import { Discord, On } from "discordx";

import { logger } from "../utils/logger.js";

@Discord()
export class Example {
	@On()
	async messageDelete(
		[message]: ArgsOf<"messageDelete">,
		client: Client
	): Promise<void> {
		let fullMessage = message;
		if (message.createdTimestamp > client.user!.createdTimestamp)
			logger.verbose("Can't retrieve message content");
		if (message.partial || !message.content)
			fullMessage = await message.fetch(true);

		logger.verbose("Message Deleted", {
			username: client.user?.username,
			test: fullMessage.content
		});
	}
}
