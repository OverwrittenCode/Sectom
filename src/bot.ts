import "@total-typescript/ts-reset";
import assert from "assert";
import "reflect-metadata";

import { dirname, importx } from "@discordx/importer";
import { NotBot } from "@discordx/utilities";
import { ActivityType, IntentsBitField, Partials } from "discord.js";
import {
	type ArgsOf,
	Client,
	DIService,
	Discord,
	MetadataStorage,
	On,
	tsyringeDependencyRegistryEngine
} from "discordx";
import dotenv from "dotenv";
import _ from "lodash";
import { container } from "tsyringe";

import { BOT_ID, GUILD_IDS } from "~/constants";
import { Beans } from "~/framework/DI/Beans.js";
import { DBConnectionManager } from "~/managers/DBConnectionManager.js";
import type { Enums } from "~/ts/Enums.js";
import type { Typings } from "~/ts/Typings.js";
import { CommandUtils } from "~/utils/command.js";
import { ObjectUtils } from "~/utils/object.js";

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

			const commandSlashes = _.cloneDeep(
				MetadataStorage.instance.applicationCommandSlashes
			) as Array<Typings.DSlashCommand>;

			const flatCommandSlashes = MetadataStorage.instance
				.applicationCommandSlashesFlat as ReadonlyArray<Typings.DSlashCommand>;

			const categoryAppliedCommands = commandSlashes.map((cmd) => {
				cmd.category = flatCommandSlashes.find(({ name, group }) => [name, group].includes(cmd.name))!.category;

				return ObjectUtils.pickKeys(
					cmd as Required<Typings.DSlashCommand>,
					"name",
					"description",
					"options",
					"category"
				);
			});

			const categoryGroupedObj = Object.groupBy(categoryAppliedCommands, ({ category }) => category!) as Record<
				Enums.CommandCategory,
				typeof categoryAppliedCommands
			>;

			CommandUtils.CategoryGroupedData = {
				keys: ObjectUtils.keys(categoryGroupedObj),
				values: Object.values(categoryGroupedObj),
				obj: categoryGroupedObj
			};

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
