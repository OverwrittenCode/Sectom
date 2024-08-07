import { Events } from "discord.js";
import { Discord, On } from "discordx";

import { ValidationError } from "~/helpers/errors/ValidationError.js";
import { DBConnectionManager } from "~/managers/DBConnectionManager.js";

import type { ArgsOf } from "discordx";

@Discord()
export abstract class MessageCreate {
	@On({ event: Events.MessageCreate })
	public async messageCreate([message]: ArgsOf<Events.MessageCreate>) {
		const { member: target } = message;

		if (!message.inGuild() || !target) {
			return;
		}

		try {
			const levelingData = await DBConnectionManager.Prisma.leveling.getLevelingData(message, target);

			if (!levelingData || levelingData.isOnCooldown) {
				return;
			}

			await DBConnectionManager.Prisma.leveling.awardXP({ interaction: message, levelingData, target });
		} catch (err) {
			if (err instanceof ValidationError) {
				return;
			}

			throw err;
		}
	}
}
