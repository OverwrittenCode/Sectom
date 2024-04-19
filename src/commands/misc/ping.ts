import { Category, RateLimit, TIME_UNIT } from "@discordx/utilities";
import { Discord, Guard, Slash } from "discordx";

import { COMMAND_CATEGORY } from "~/ts/enums/COMMAND_CATEGORY.js";

import type { ChatInputCommandInteraction } from "discord.js";

@Discord()
@Category(COMMAND_CATEGORY.MISC)
@Guard(RateLimit(TIME_UNIT.seconds, 3))
export abstract class Ping {
	@Slash({ description: "Get the latency of the bot in milliseconds" })
	public async ping(interaction: ChatInputCommandInteraction<"cached">) {
		const reply = await interaction.reply({ content: "Pinging...", fetchReply: true });

		const messageTime = `${reply.createdTimestamp - interaction.createdTimestamp - interaction.client.ws.ping}ms`;

		await reply.edit({
			content: `🏓 Pong! ${messageTime}`
		});
	}
}
