import type {
	ArraySubDocumentType,
	DocumentType,
	SubDocumentType
} from "@typegoose/typegoose";
import { PropType, post, pre, prop } from "@typegoose/typegoose";
import type {
	ButtonInteraction,
	Role as DiscordRole,
	User as DiscordUser,
	MessageContextMenuCommandInteraction,
	UserContextMenuCommandInteraction
} from "discord.js";
import {
	ActionRowBuilder,
	ButtonBuilder,
	ButtonStyle,
	Colors,
	CommandInteraction,
	EmbedBuilder
} from "discord.js";

import { capitalizeFirstLetter } from "../../utils/casing.js";
import { logger } from "../../utils/logger.js";
import { replyOrFollowUp } from "../../utils/others.js";
import {
	AccessGateSubGroupApplicationCommandOptionType,
	AccessListBarrier,
	ButtonIDFormat,
	ServerModelSelectionSnowflakeType,
	TargetClass,
	TargetClassSingular,
	TargetType
} from "../../utils/type.js";
import { ServerModel } from "../ServerModel.js";

import { AccessSelection } from "./AccessGate.js";
import { Blacklist } from "./Blacklist.js";
import { Command } from "./Command.js";
import { CounterModel } from "./Counter.js";

/**
 * Whitelist class
 * Represents a whitelist in the system
 */

@pre<Whitelist>("save", async function (next) {
	try {
		const counter = await CounterModel.findOneAndUpdate(
			{ caseNumber: "" },
			{ $inc: { seq: 1 } },
			{ new: true, upsert: true }
		);
		this.caseNumber = counter.seq;
		next();
	} catch (error: any) {
		return next(error);
	}
})
@post<Whitelist>("save", function (doc: DocumentType<Whitelist>) {
	logger.http("A whitelist document has been saved.", doc.toJSON());
})
export class Whitelist extends AccessSelection {
	@prop({ type: () => [Command], default: [] }, PropType.ARRAY)
	public commands!: ArraySubDocumentType<Command>[];

	@prop()
	public caseNumber?: number;

	public async checkIfExists(
		target: AccessGateSubGroupApplicationCommandOptionType,
		targetClassStr: TargetClass,
		commandName?: string
	) {
		return commandName
			? this.commands!.findIndex(
					(cmd) =>
						cmd.commandName === commandName &&
						cmd[targetClassStr]!.find((v) => v.id == target.id)
			  ) != -1
			: typeof this[targetClassStr]!.find((v) => v.id == target.id) !=
					"undefined";
	}

	public async addToList(
		this: SubDocumentType<Whitelist>,
		element: ServerModelSelectionSnowflakeType,
		interaction: CommandInteraction | ButtonInteraction
	) {
		const strProp = interaction.guild!.members.cache.has(element.id)
			? "users"
			: interaction.guild!.roles.cache.has(element.id)
			? "roles"
			: "channels";
		(this[strProp]! as ServerModelSelectionSnowflakeType[]).push(element);
		return await this.ownerDocument().save();
	}

	public async removeFromList(
		this: SubDocumentType<Whitelist>,
		element: ServerModelSelectionSnowflakeType,
		interaction: CommandInteraction | ButtonInteraction
	) {
		const strProp = interaction.guild!.members.cache.has(element.id)
			? "users"
			: interaction.guild!.roles.cache.has(element.id)
			? "roles"
			: "channels";
		const selection = this[strProp] as ServerModelSelectionSnowflakeType[];
		(this[strProp] as ServerModelSelectionSnowflakeType[]) = selection.filter(
			(e) => e.id != element.id
		);

		return await this.ownerDocument().save();
	}

	public async applicationModifySelection(params: {
		type: AccessGateSubGroupApplicationCommandOptionType;
		interaction:
			| CommandInteraction
			| ButtonInteraction
			| UserContextMenuCommandInteraction
			| MessageContextMenuCommandInteraction;
		list: AccessListBarrier;
		action: "add" | "remove";
		commandName?: string;
		transfering?: boolean;
	}) {
		const { type, commandName, interaction, list, action, transfering } =
			params;

		const targetClassStr: TargetClass = interaction.guild?.members.cache.has(
			type.id
		)
			? TargetClass.USERS
			: interaction.guild?.roles.cache.has(type.id)
			? TargetClass.ROLES
			: TargetClass.CHANNELS;

		const targetTypeStr = capitalizeFirstLetter(
			targetClassStr.slice(0, -1)
		) as TargetType;

		const targetMention = `<${
			interaction.guild!.members.cache.has(type.id)
				? "@"
				: interaction.guild!.roles.cache.has(type.id)
				? "@&"
				: "#"
		}${type!.id}>`;

		let server = await ServerModel.findOne({
			serverId: interaction.guildId
		});

		if (!server) {
			server = await new ServerModel({
				createdBy: {
					id: interaction.guild?.ownerId,
					name: (await interaction.guild?.fetchOwner())!.user.tag
				},
				serverId: interaction.guildId,
				serverName: interaction.guild?.name
			}).save();
		}

		const targetObj = {
			id: type.id,
			name:
				interaction.guild!.members.cache.get(type.id)?.user.tag ??
				(type as DiscordRole).name
		};

		const oppositeList = list === "whitelist" ? "blacklist" : "whitelist";

		const serverListObj = server.cases[list] as SubDocumentType<Whitelist>;
		const serverOppositeListObj = server.cases[
			oppositeList
		] as SubDocumentType<Blacklist>;

		if (
			action == "add" &&
			(await this.checkIfExists(type, targetClassStr, commandName))
		) {
			await replyOrFollowUp(interaction, {
				content: `${targetMention} is already in the ${list}.`,
				ephemeral: true
			});
			return;
		}

		if (
			action == "remove" &&
			!(await serverListObj.checkIfExists(type, targetClassStr, commandName))
		) {
			await replyOrFollowUp(interaction, {
				content: `${targetMention} does not exist in the ${list}.`,
				ephemeral: true
			});
			return;
		}

		if (
			!transfering &&
			action == "add" &&
			(await serverOppositeListObj.checkIfExists(
				type,
				targetClassStr,
				commandName
			))
		) {
			const snowflakeSingular = targetClassStr.slice(
				0,
				-1
			) as TargetClassSingular;
			const buttonIdPrefix =
				`${list}_${snowflakeSingular}_` as ButtonIDFormat;

			const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
				new ButtonBuilder()
					.setCustomId(`${buttonIdPrefix}move_target`)
					.setLabel("Yes")
					.setStyle(ButtonStyle.Success),
				new ButtonBuilder()
					.setCustomId(`${buttonIdPrefix}cancel_move`)
					.setLabel("No")
					.setStyle(ButtonStyle.Danger)
			);

			const confirmationEmbed = new EmbedBuilder()
				.setTitle("Confirmation")
				.setDescription(
					`${targetMention} exists in the ${oppositeList} ${
						commandName ?? "guild"
					} database. Do you want to move this data to the ${list}?`
				)
				.setColor(Colors.Gold) // Yellow color for confirmation
				.setAuthor({
					name: targetObj.name
				})
				.setFooter({
					text: `${targetTypeStr} ID: ${targetObj.id}`
				});

			if (interaction.guild!.members.cache.has(type.id))
				confirmationEmbed.toJSON().author!.icon_url = (
					type as DiscordUser
				).displayAvatarURL();
			await replyOrFollowUp(interaction, {
				embeds: [confirmationEmbed],
				ephemeral: true,
				components: [row]
			});

			return;
		} else {
			const functionStr = action == "add" ? "addToList" : "removeFromList";
			const embedDirectionStr =
				action == "add" ? "added to" : "removed from";
			await serverListObj[functionStr](targetObj, interaction);
			if (!transfering) {
				const successEmbed = new EmbedBuilder()
					.setTitle("Success")
					.setDescription(
						`${targetMention} has been ${embedDirectionStr} the ${list}`
					)
					.setColor(Colors.Green) // Green color for success
					.setAuthor({
						name: targetObj.name
					})
					.setFooter({ text: `${targetTypeStr} ID: ${targetObj.id}` })
					.setTimestamp();

				if (interaction.guild!.members.cache.has(type.id))
					successEmbed.toJSON().author!.icon_url = (
						type as DiscordUser
					).displayAvatarURL();

				await replyOrFollowUp(interaction, {
					embeds: [successEmbed],
					ephemeral: true
				});

				return;
			}
		}
	}
}
