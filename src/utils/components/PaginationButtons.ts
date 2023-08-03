import { Pagination, PaginationType } from "@discordx/pagination";
import {
	ButtonInteraction,
	ButtonStyle,
	Colors,
	CommandInteraction,
	EmbedBuilder,
	GuildMember
} from "discord.js";
import lodash from "lodash";

import {
	ArraySubDocumentType,
	SubDocumentType
} from "@typegoose/typegoose/lib/types.js";
import { Action } from "../../models/Moderation/Action.js";
import { CasesModel } from "../../models/Moderation/Cases.js";
import { Command } from "../../models/Moderation/Command.js";
import { ListClassUnion } from "../../models/Moderation/List.js";
import { Server } from "../../models/Server.js";
import {
	MAX_DESCRIPTION_LENGTH,
	UNEXPECTED_FALSY_VALUE__MESSAGE
} from "../config.js";
import { ValidationError } from "../errors/ValidationError.js";
import {
	getEntityFromGuild,
	getMentionPrefixFromEntity,
	replyNoData
} from "../interaction.js";
import type {
	ButtonIDFormat,
	CombinedTargetClass,
	EnumValues,
	PaginationIDBarrier,
	ServerModelSelectionSnowflakeType,
	TargetClass,
	TargetClassSingular,
	TargetType
} from "../ts/Access.js";
import { AccessListBarrier } from "../ts/Access.js";
import type { MongooseDocumentType } from "../ts/General.js";
const { compact } = lodash;

export class PaginationButtons {}

export async function paginateData(
	data: (Command | ServerModelSelectionSnowflakeType)[],
	interaction: CommandInteraction
): Promise<string[]> {
	const descriptions: string[] = [];

	const addEntryToDescription = async (
		description: string,
		info: string,
		index: number
	): Promise<{ description: string; index: number } | void> => {
		const entry = `\`${listIndex}\` ${info}\n`;

		if (description.length + entry.length > MAX_DESCRIPTION_LENGTH) {
			return; // Reached the limit for this description
		}

		description += entry;
		listIndex++;
		index++;

		return { description, index };
	};

	const getMention = async (snowflake: ServerModelSelectionSnowflakeType) => {
		if (interaction.guild?.channels.cache.has(snowflake.id))
			return `<#${snowflake.id}>`;
		else if (interaction.guild?.roles.cache.has(snowflake.id))
			return `<@&${snowflake.id}>`;

		try {
			return (
				(await interaction.guild?.members.fetch(snowflake.id)) ||
				(await interaction.guild?.channels.fetch(snowflake.id)) ||
				(await interaction.guild?.roles.fetch(snowflake.id))
			)?.toString();
		} catch (error) {
			return "undefined";
		}
	};

	let listIndex = 1;

	while (data && data.length > 0) {
		let description = "";
		let index = 0;
		let info = "";

		while (index < data.length) {
			if (data[index] instanceof Command) {
				const command = data[index] as Command;

				const groups = [
					command.users,
					command.roles,
					command.channels
				].filter(
					async (v, i) => typeof (await getMention(v[i])) != "undefined"
				);

				for (const group of groups) {
					for (const item of group) {
						info = `\`${command.commandName}\`: ${item.name} (${item.id})`;

						const result = await addEntryToDescription(
							description,
							info,
							index
						);
						if (!result) break;

						description = result.description;
						index = result.index;
					}
				}
			} else {
				const snowflake = data[index] as ServerModelSelectionSnowflakeType;

				const snowflakeMention = await getMention(snowflake);
				if (snowflakeMention) info = snowflakeMention;

				const result = await addEntryToDescription(
					description,
					info,
					index
				);
				if (!result) {
					break; // Reached the limit for this description
				}

				description = result.description;
				index = result.index;
			}

			if (description.length + info.length > MAX_DESCRIPTION_LENGTH) {
				break;
			}
		}

		descriptions.push(description);
		data = data.slice(index);
	}

	return descriptions;
}

export function createPaginationButtons(
	accessListType: `${PaginationIDBarrier}`,
	targetTypePlural: TargetClass | "guilds" = "guilds"
) {
	const targetTypeSingular = targetTypePlural.slice(
		0,
		-1
	) as TargetClassSingular;
	const prefix =
		`${accessListType}_${targetTypeSingular}_pagination` as ButtonIDFormat<"pagination">;

	return createPaginationOptions(prefix);
}

function createPaginationOption(prefix: string, type: string, emoji: string) {
	return {
		emoji: { name: emoji },
		id: `${prefix}_${type}`,
		label: "\u200B",
		style: ButtonStyle.Secondary
	};
}

function createPaginationOptions(prefix: string) {
	return {
		type: PaginationType.Button,
		start: createPaginationOption(prefix, "beginning", "⏮️"),
		previous: createPaginationOption(prefix, "previous", "◀"),
		next: createPaginationOption(prefix, "next", "▶"),
		end: createPaginationOption(prefix, "end", "⏭"),
		exit: createPaginationOption(prefix, "exit", "❌"),
		ephemeral: true
	};
}

export async function ButtonComponentMoveSnowflake(
	interaction: ButtonInteraction
) {
	await interaction.deferReply({ ephemeral: true });
	const server = (await ServerModel.findOne({
		serverId: interaction.guild?.id
	}))!;

	const fetchedMessage = interaction.message;
	const confirmationEmbed = fetchedMessage.embeds[0];
	const messageContentArray = confirmationEmbed.description!.split(" ");
	const footerWordArr = confirmationEmbed.footer!.text.split(" ");

	let commandName: string | undefined;

	if (messageContentArray.indexOf("guild") == -1)
		commandName =
			messageContentArray[messageContentArray.indexOf("database") - 1];

	const targetTypeStr = footerWordArr[0] as TargetType;
	const targetGuildPropertyStr =
		targetTypeStr == "User"
			? "members"
			: (`${targetTypeStr.toLowerCase()}s` as "roles" | "channels");

	const target = (await interaction.guild?.[targetGuildPropertyStr].fetch(
		confirmationEmbed.footer!.text!.split(" ").at(-1)!
	))!;

	const targetMention = `<${
		interaction.guild!.members.cache.has(target.id)
			? "@"
			: interaction.guild!.roles.cache.has(target.id)
			? "@&"
			: "#"
	}${target!.id}>`;

	const list = messageContentArray.pop()?.slice(0, -1) as AccessListBarrier; // do you want to move this data to the [whitelist | blacklist] -> the one to add to database

	const listInstance = server.cases[list] as SubDocumentType<
		Blacklist | Whitelist
	>;

	const oppositeList: AccessListBarrier =
		list === AccessListBarrier.WHITELIST
			? AccessListBarrier.BLACKLIST
			: AccessListBarrier.WHITELIST; // the one to remove from the database

	const oppositeListInstance = server.cases[
		oppositeList
	] as typeof listInstance;

	await oppositeListInstance.applicationModifySelection({
		action: "remove",
		commandName,
		interaction,
		type: interaction.guild!.members.cache.has(target.id)
			? (target as GuildMember).user
			: (target as DiscordRole | GuildBasedChannel),
		list: oppositeList,
		transfering: true
	});

	// in case the bot shutdown unexpectedly, it's better to remove the data first than to have the target in both whitelist and blacklsit

	await listInstance.applicationModifySelection({
		action: "add",
		commandName,
		interaction,
		type: interaction.guild!.members.cache.has(target.id)
			? (target as GuildMember).user
			: (target as DiscordRole | GuildBasedChannel),
		list,
		transfering: true
	});

	const confirmedEmbed = new EmbedBuilder()
		.setTitle("Success")
		.setDescription(
			`${targetMention} has been moved from the ${oppositeList} to the ${list}	${
				commandName ?? "guild"
			}`
		)
		.setColor(Colors.Green)
		.setAuthor(confirmationEmbed.author)
		.setFooter(confirmationEmbed.footer)
		.setTimestamp();

	await interaction.editReply({
		embeds: [confirmedEmbed],
		components: []
	});
}

export async function PaginationSender(params: {
	server: MongooseDocumentType<Server>;
	list: ClassPropertyNames<Cases>;
	snowflakePluralType: EnumValues<typeof CombinedTargetClass>;
	interaction: CommandInteraction;
	commandName?: string;
}) {
	const { server, list, snowflakePluralType, commandName, interaction } =
		params;

	let data: string[] = [];
	if (list === "whitelist" || list === "blacklist") {
		const accessList = server.cases[list];

		if (commandName)
			data = await paginateData(
				accessList.commands.filter((v) => v.commandName == commandName),
				interaction
			);
		else
			data = await paginateData(
				snowflakePluralType == "guilds"
					? [
							...accessList.channels,
							...accessList.roles,
							...accessList.users
					  ]
					: accessList[snowflakePluralType],
				interaction
			);
	} else if (list === "actions") {
		const actions = server.cases[list];
		const actionObjects = compact(
			actions.map((action) => {
				if (action.caseNumber)
					return {
						id: action.caseNumber.toString(),
						name: `Case #${action.caseNumber} - Type: ${
							action.type
						} - Executor: ${action.executor.id} - Target: ${
							action.target.id
						} - Reason: ${action.reason || "No reason provided"}`
					};
			})
		);

		data = await paginateData(actionObjects, interaction);
	}

	if (data.length == 0) return await replyNoData(interaction);

	const pages = data.map((d, i) => {
		return {
			embeds: [
				new EmbedBuilder()
					.setTitle(`${interaction.guild!.name} Cases`)
					.setDescription(d)
					.setColor("#e6c866")
					.setFooter({
						text: `Page ${i + 1}/${data.length}`
					})
			]
		};
	});

	const buttons = createPaginationButtons(list, snowflakePluralType);

	if (pages.length == 1)
		return await interaction.reply({
			embeds: pages[0].embeds,
			ephemeral: true
		});

	return await new Pagination(interaction, pages, buttons).send();
}
