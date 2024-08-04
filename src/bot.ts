import "@total-typescript/ts-reset";
import assert from "assert";
import "reflect-metadata";
import "dotenv/config.js";

import { dirname, importx } from "@discordx/importer";
import { NotBot } from "@discordx/utilities";
import { ActivityType, IntentsBitField, Partials } from "discord.js";
import { Client, DIService, tsyringeDependencyRegistryEngine } from "discordx";
import { container } from "tsyringe";

import { BOT_ID, GUILD_IDS } from "~/constants";
import { Beans } from "~/framework/DI/Beans.js";
import { DBConnectionManager } from "~/managers/DBConnectionManager.js";

const { BOT_TOKEN } = process.env;

abstract class Main {
	public static readonly bot = new Client({
		botId: BOT_ID,
		botGuilds: GUILD_IDS,
		intents: [
			IntentsBitField.Flags.Guilds,
			IntentsBitField.Flags.GuildMembers,
			IntentsBitField.Flags.GuildMessages,
			IntentsBitField.Flags.GuildMessageReactions,
			IntentsBitField.Flags.GuildVoiceStates,
			IntentsBitField.Flags.MessageContent
		],
		partials: [Partials.Channel, Partials.GuildMember, Partials.User],
		allowedMentions: {
			parse: ["users"]
		},
		silent: false,
		guards: [NotBot],
		presence: {
			activities: [
				{
					name: "Dev Mode",
					type: ActivityType.Watching
				}
			],
			status: "online"
		}
	});

	public static async start() {
		try {
			assert(BOT_TOKEN, "BOT_TOKEN is not set in the environment variables.");

			DIService.engine = tsyringeDependencyRegistryEngine.setInjector(container);

			await DBConnectionManager.initRedis();
			await DBConnectionManager.initPrisma();

			container.registerInstance<Client>(Beans.ISectomToken, this.bot);

			await importx(`${dirname(import.meta.url)}/{events,commands}/**/*.{ts,js}`);

			console.groupCollapsed("[DISCORDX]");

			await this.bot.login(BOT_TOKEN);
		} catch (err) {
			throw err;
		}
	}
}

await Main.start();
