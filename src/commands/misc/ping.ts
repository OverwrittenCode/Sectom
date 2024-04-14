import { Category, RateLimit, TIME_UNIT } from "@discordx/utilities";
import type { ChatInputCommandInteraction } from "discord.js";
import { Discord, Guard, Slash } from "discordx";

@Discord()
@Category("Misc")
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
