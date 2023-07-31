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

import { CounterModel } from "./models/Moderation/Counter.js";
import { replyOrFollowUp } from "./utils/interaction.js";
import { logger } from "./utils/logger.js";

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
		await bot.guilds.fetch();
		await bot.clearApplicationCommands();
		await bot.initApplicationCommands();
		logger.info(`Logged in as ${bot.user!.tag}`);
	} catch (error) {
		logger.error("An error occurred: ", error);
	}
});

bot.on("interactionCreate", handleInteraction);

async function handleInteraction(interaction: Interaction) {
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

	bot.executeInteraction(interaction);
}

try {
	await importx(`${dirname(import.meta.url)}/{events,commands}/**/*.{ts,js}`);
	const mongoClient = await mongoose.connect(MONGO_URI);
	const checkCounterPresence = await CounterModel.count();
	if (!checkCounterPresence) {
		const counter = new CounterModel();
		await counter.save();

		logger.http("Created Counter Model", counter.toJSON());
	}
	logger.info(
		`Disconnected from previous MongoDB connection and now connected to ${mongoClient.connection.db.databaseName} database`
	);
	await bot.login(BOT_TOKEN);
} catch (error) {
	logger.error("An error occurred launching", error);
}
