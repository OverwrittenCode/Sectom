import { dirname, importx } from "@discordx/importer";
import { NotBot } from "@discordx/utilities";
import type { Interaction } from "discord.js";
import {
	ActivityType,
	Colors,
	EmbedBuilder,
	IntentsBitField,
	Partials
} from "discord.js";
import { Client } from "discordx";
import "dotenv/config";
import mongoose from "mongoose";

import { CasesModel } from "./models/Moderation/Cases.js";
import { UNEXPECTED_FALSY_VALUE__MESSAGE } from "./utils/config.js";
import { ValidationError } from "./utils/errors/ValidationError.js";
import { replyOrFollowUp } from "./utils/interaction.js";

const { BOT_TOKEN, MONGO_URI } = process.env;

if (!BOT_TOKEN) {
	throw new Error("BOT_TOKEN is not set in the environment variables.");
}

if (!MONGO_URI) {
	throw new Error("MONGO_URI is not set in the environment variables.");
}

// Structured logging setup

export const bot = new Client({
	// To use only guild command
	// botGuilds: [(client) => client.guilds.cache.map((guild) => guild.id)],

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

bot.once("ready", async () => {
	try {
		// await bot.guilds.fetch();
		// await bot.clearApplicationCommands();
		await bot.initApplicationCommands();
		console.log(`Logged in as ${bot.user!.tag}`);
	} catch (e) {
		if (e instanceof Error)
			return console.error("An error occured:", e.stack);
		console.log(e);
	}
});

bot.on("interactionCreate", handleInteraction);

async function handleInteraction(interaction: Interaction) {
	if (!interaction.guild || !interaction.guildId)
		throw new ValidationError(UNEXPECTED_FALSY_VALUE__MESSAGE);

	if (interaction.isButton()) {
		if (interaction.customId.endsWith("cancel_move"))
			return replyOrFollowUp(interaction, {
				embeds: [
					EmbedBuilder.from(interaction.message.embeds[0])
						.setColor(Colors.Red)
						.setTitle("Cancelled")
						.setDescription("Action cancelled.")
				],
				components: [],
				ephemeral: true
			});
		if (interaction.customId.includes("pagination")) return;
	}

	if (!interaction.isCommand()) return;

	const cases = await CasesModel.findByServerId(interaction.guildId);
	if (cases) {
		const { blacklist, whitelist } = cases;

		const isBlacklisted = blacklist.isEntityInList(
			interaction,
			interaction.user.id
		);
		if (isBlacklisted) {
			interaction.reply({
				content: "You are blacklisted from using this command",
				ephemeral: true
			});
			return;
		}

		const isWhitelisted = whitelist.isEntityInList(
			interaction,
			interaction.user.id
		);
		if (!isWhitelisted) {
			interaction.reply({
				content: "You are not whitelisted to use this command",
				ephemeral: true
			});
			return;
		}
	}

	bot.executeInteraction(interaction);
}

try {
	await importx(`${dirname(import.meta.url)}/{events,commands}/**/*.{ts,js}`);
	const mongoClient = await mongoose.connect(MONGO_URI);
	console.log(
		`Disconnected from previous MongoDB connection and now connected to ${mongoClient.connection.db.databaseName} database`
	);
	await bot.login(BOT_TOKEN);
} catch (e) {
	if (e instanceof Error) console.error(e.stack);
}
