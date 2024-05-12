import type { APIEmbed as _APIEmbed } from "discord.js";

declare global {
	namespace PrismaJson {
		interface APIEmbed extends _APIEmbed {}
	}
}
