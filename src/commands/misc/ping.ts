import { Category, RateLimit, TIME_UNIT } from "@discordx/utilities";
import { Discord, Guard, Slash } from "discordx";

import { Enums } from "~/ts/Enums.js";

import type { ChatInputCommandInteraction } from "discord.js";

@Discord()
@Category(Enums.CommandCategory.Misc)
@Guard(RateLimit(TIME_UNIT.seconds, 3))
export abstract class Ping {
	@Slash({ dmPermission: false, description: "Get the latency of the bot in milliseconds" })
	public async ping(interaction: ChatInputCommandInteraction<"cached">) {
		const reply = await interaction.reply({ content: "Pinging...", fetchReply: true });

		const messageTime = `${reply.createdTimestamp - interaction.createdTimestamp - interaction.client.ws.ping}ms`;

		await reply.edit({
			content: `🏓 Pong! ${messageTime}`
		});
	}
}
