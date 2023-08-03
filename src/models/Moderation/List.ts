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
import {
	UNEXPECTED_FALSY_VALUE__MESSAGE,
	UNEXPECTED_TRUTHY_VALUE_MESSAGE
} from "../../utils/config.js";
import { ValidationError } from "../../utils/errors/ValidationError.js";
import {
	getEntityFromGuild,
	getMentionPrefixFromEntity,
	replyOrFollowUp
} from "../../utils/interaction.js";
import {
	AccessGateSubGroupApplicationCommandOptionType,
	ServerModelSelectionSnowflakeType,
	SubCommandActionType,
	TargetClass,
	TargetType
} from "../../utils/ts/Access.js";
import type { GuildInteraction } from "../../utils/ts/Action.js";
import type { ListType } from "../../utils/ts/Enums.js";
import type { MongooseDocumentType } from "../../utils/ts/General.js";
import type { User } from "../Server.js";
import { AccessSelection } from "./Access.js";
import type { Cases } from "./Cases.js";
import { Command } from "./Command.js";
import { CounterModel } from "./Counter.js";

export type ListClassUnion = ListManager<"blacklist" | "whitelist">;

@pre<ListClassUnion>("save", async function (next) {
	try {
		const counter = await CounterModel.findOneAndUpdate(
			{ caseNumber: "" },
			{ $inc: { seq: 1 } },
			{ new: true, upsert: true }
		);
		this.caseNumber = counter.seq;
		next();
	} catch (error) {
		if (error instanceof Error) return next(error);
		next();
	}
})
@post<ListClassUnion>("save", function (doc: DocumentType<ListClassUnion>) {
	console.log(`A ${doc.listType} document has been saved.`, doc.toJSON());
})
class ListManager<T extends `${ListType}`> extends AccessSelection {
	listType!: T;

	constructor(listType: T) {
		super();
		this.listType = listType;
	}

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
		this: SubDocumentType<ListManager<T>>,
		element: ServerModelSelectionSnowflakeType,
		strProp: `${TargetClass}`
	) {
		(this[strProp]! as ServerModelSelectionSnowflakeType[]).push(element);
		return await this.ownerDocument().save();
	}

	public async removeFromList(
		this: SubDocumentType<ListManager<T>>,
		element: ServerModelSelectionSnowflakeType,
		strProp: `${TargetClass}`
	) {
		const selection = this[strProp] as ServerModelSelectionSnowflakeType[];
		(this[strProp] as ServerModelSelectionSnowflakeType[]) = selection.filter(
			(e) => e.id != element.id
		);
		return await this.ownerDocument().save();
	}

	public async applicationModifySelection(
		this: SubDocumentType<ListManager<T>>,
		params: {
			type: AccessGateSubGroupApplicationCommandOptionType;
			interaction:
				| CommandInteraction
				| ButtonInteraction
				| UserContextMenuCommandInteraction
				| MessageContextMenuCommandInteraction;
			action: `${SubCommandActionType}`;
			commandName?: string;
			transfering?: boolean;
		}
	) {
		const oppositeList =
			this.listType === "whitelist" ? "blacklist" : "whitelist";

		const { type, commandName, interaction, action, transfering } = params;

		const entitiyObject = await getEntityFromGuild(
			interaction,
			["all"],
			type.id
		);
		if (!entitiyObject) throw new ValidationError(UNEXPECTED_FALSY_VALUE__MESSAGE); 
		if (entitiyObject.channels) throw new ValidationError(UNEXPECTED_TRUTHY_VALUE_MESSAGE); 

		const strProp = Object.keys(entitiyObject)[0] as `${TargetClass}`;

		const entityKey = strProp.toUpperCase() as Uppercase<
			keyof typeof entitiyObject
		>;

		const targetClassStr: TargetClass = TargetClass[entityKey];

		const targetTypeStr = capitalizeFirstLetter(
			targetClassStr.slice(0, -1)
		) as TargetType;

		const mentionPrefx = getMentionPrefixFromEntity(entitiyObject);
		const targetMention = `<${mentionPrefx}${type!.id}>` as ReturnType<
			typeof getMentionPrefixFromEntity
		>;

		const targetObj = {
			id: type.id,
			name: entitiyObject.members?.user.tag ?? (type as DiscordRole).name
		} as ServerModelSelectionSnowflakeType;

		const cases = this.ownerDocument() as MongooseDocumentType<Cases>;

		const oppositeListObj = cases[oppositeList] as typeof this;

		const isExisting = await this.checkIfExists(
			type,
			targetClassStr,
			commandName
		);

		if (action == "add" && isExisting) {
			await replyOrFollowUp(interaction, {
				content: `${targetMention} is already in the ${this.listType}.`,
				ephemeral: true
			});
			return;
		}

		if (action == "remove" && !isExisting) {
			await replyOrFollowUp(interaction, {
				content: `${targetMention} does not exist in the ${this.listType}.`,
				ephemeral: true
			});
			return;
		}

		if (
			!transfering &&
			action == "add" &&
			(await oppositeListObj.checkIfExists(
				type,
				targetClassStr,
				commandName
			))
		) {
			const snowflakeSingular = targetClassStr.slice(0, -1);

			const buttonIdPrefix = `${this.listType}_${snowflakeSingular}_`;

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
					} database. Do you want to move this data to the ${
						this.listType
					}?`
				)
				.setColor(Colors.Gold) // Yellow color for confirmation
				.setAuthor({
					name: targetObj.name
				})
				.setFooter({
					text: `${targetTypeStr} ID: ${targetObj.id}`
				});

			if (entitiyObject.members)
				confirmationEmbed.toJSON().author!.icon_url =
					entitiyObject.members.user.displayAvatarURL();
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

			await this[functionStr](targetObj, strProp);
			if (!transfering) {
				const successEmbed = new EmbedBuilder()
					.setTitle("Success")
					.setDescription(
						`${targetMention} has been ${embedDirectionStr} the ${this.listType}`
					)
					.setColor(Colors.Green) // Green color for success
					.setAuthor({
						name: targetObj.name
					})
					.setFooter({ text: `${targetTypeStr} ID: ${targetObj.id}` })
					.setTimestamp();

				if (entitiyObject.members)
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

export class Blacklist extends ListManager<"blacklist"> {}

export class Whitelist extends ListManager<"whitelist"> {}
