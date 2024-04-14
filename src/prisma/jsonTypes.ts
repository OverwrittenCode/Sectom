import type { APIEmbed } from "discord.js";

declare global {
	namespace PrismaJson {
		interface Embed extends APIEmbed {}
	}
}
