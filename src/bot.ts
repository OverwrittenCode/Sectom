import "@total-typescript/ts-reset";
import assert from "assert";
import "reflect-metadata";

import { BOT_ID, GUILD_IDS } from "@constants";
import { dirname, importx } from "@discordx/importer";
import { NotBot } from "@discordx/utilities";
import { Beans } from "@framework/DI/Beans.js";
import { DBConnectionManager } from "@managers/DBConnectionManager.js";
import { ActivityType, IntentsBitField, Partials } from "discord.js";
import { Client, DIService, Discord, On, tsyringeDependencyRegistryEngine, type ArgsOf } from "discordx";
import dotenv from "dotenv";
import { container } from "tsyringe";
import { TargetValidator } from "./guards/TargetValidator.js";

dotenv.config();

const { BOT_TOKEN } = process.env;

@Discord()
export abstract class Main {
	public static connectionDates: {
		loggedIn?: Date;
		readyAt?: Date;
	} = {};

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

		silent: false,
		guards: [NotBot, TargetValidator],
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
			console.log("---------------------[START]--------------------");
			console.group("[DATABASE]");
			await DBConnectionManager.initRedis();
			await DBConnectionManager.initPrisma();

			console.groupEnd();

			container.registerInstance<Client>(Beans.ISectomToken, this.bot);

			console.group("[FILES]");
			console.log("> Importing files...");
			await importx(`${dirname(import.meta.url)}/{events,commands}/**/*.{ts,js}`);
			console.log("> > Success");
			console.groupEnd();

			console.group("[DISCORD BOT]");

			console.group("[LOGIN]");
			console.log("> Logging in...");

			console.group("[DISCORDX INFO]");

			await this.bot.login(BOT_TOKEN);
		} catch (err) {
			console.error(err);
			throw err;
		}
	}

	@On({
		event: "ready"
	})
	private async init([client]: ArgsOf<"ready">): Promise<void> {
		try {
			console.groupEnd();

			Main.connectionDates.loggedIn = new Date();
			console.log(`> > Logged in as ${client.user!.tag}`, Main.connectionDates.loggedIn);
			console.groupEnd();

			console.group("[APPLICATION COMMANDS]");
			console.log("> Initialising application commands...");

			console.group("[DISCORDX INFO]");
			await Main.bot.initApplicationCommands();

			console.groupEnd();

			console.log("> > Success");
			console.groupEnd();

			Main.connectionDates.readyAt = new Date();
			console.log("> Bot is ready.", Main.connectionDates.readyAt);
			console.groupEnd();

			console.group("[TIMING]");
			const { prisma, redis } = DBConnectionManager.connectionDates;
			const { loggedIn, readyAt } = Main.connectionDates;
			const timings = {
				Databases: {
					prisma,
					redis
				},
				DiscordBot: {
					loggedIn,
					readyAt
				}
			};
			const discordBotTimeDifference = readyAt.getTime() - loggedIn.getTime();

			console.log(timings);
			console.log("> > Ready in", discordBotTimeDifference, "ms");
			console.groupEnd();
			console.log("---------------------[END]--------------------");
		} catch (err) {
			console.error(err);
			throw err;
		}
	}
}

await Main.start();
