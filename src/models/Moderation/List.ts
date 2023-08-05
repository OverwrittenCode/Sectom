import type {
	ArraySubDocumentType,
	DocumentType,
	SubDocumentType
} from "@typegoose/typegoose";
import { PropType, post, pre, prop } from "@typegoose/typegoose";
import type {
	ButtonInteraction,
	Role as DiscordRole,
	User as DiscordUser
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
type Filter = `${TargetClass}`;
type UserInputFilters = Filter[];
type Entity = {
	[K in Filter]?: boolean;
};

export function createListClass(listType: `${ListType}`) {
	@pre<ListManager>("save", async function (next) {
		next();
	})
	@post<ListManager>("save", function (doc: DocumentType<ListManager>) {
		if (this.updatedAt?.toISOString() == this.createdAt?.toISOString())
			return;
		console.log(`A ${doc.listType()} has been saved`, doc.toJSON());
	})
	class ListManager extends AccessSelection {
		@prop({ type: () => [Command], default: [] }, PropType.ARRAY)
		public commands!: ArraySubDocumentType<Command>[];

		@prop()
		public caseNumber?: number;

		public listType(
			this: SubDocumentType<ListManager> | DocumentType<ListManager>
		): `${ListType}` {
			return listType;
		}
		public isEntityInList(
			this: SubDocumentType<ListManager>,
			interaction: GuildInteraction,
			targetId: string
		) {
			if (!interaction.guild || !interaction.guildId)
				throw new ValidationError(UNEXPECTED_FALSY_VALUE__MESSAGE);
			const accessBarrierBoolean =
				this.listType() == "blacklist" ? undefined : true;
			if (interaction.guild.ownerId == targetId) return accessBarrierBoolean;

			const entityMap: Entity = {
				users: false,
				roles: false,
				channels: false
			};

			const selection: UserInputFilters = ["users", "roles", "channels"];

			const hasData = (str: Filter) =>
				this[str].length >= 1 ||
				this.commands.some((cmd) => cmd[str].length >= 1);

			const keys = selection.filter(hasData);

			if (keys.length == 0) return accessBarrierBoolean;

			const containsTarget = (entityType: ArraySubDocumentType<User>) =>
				entityType.id == targetId;

			for (const key of keys) {
				const isPresent = (entityMap[key] =
					this[key].some(containsTarget) ||
					this.commands.some((cmd) => cmd[key].some(containsTarget)));

				entityMap[key] = isPresent;
			}

			return Object.values(entityMap).some((v) => v);
		}

		public checkIfExists(
			this: SubDocumentType<ListManager>,
			target: AccessGateSubGroupApplicationCommandOptionType,
			targetClassStr: `${TargetClass}`,
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
			this: SubDocumentType<ListManager>,
			element: ServerModelSelectionSnowflakeType,
			strProp: `${TargetClass}`
		) {
			(this[strProp]! as ServerModelSelectionSnowflakeType[]).push(element);
			return await this.ownerDocument().save();
		}

		public async removeFromList(
			this: SubDocumentType<ListManager>,
			element: ServerModelSelectionSnowflakeType,
			strProp: `${TargetClass}`
		) {
			const selection = this[strProp] as ServerModelSelectionSnowflakeType[];
			(this[strProp] as ServerModelSelectionSnowflakeType[]) =
				selection.filter((e) => e.id != element.id);
			return await this.ownerDocument().save();
		}

		public async applicationModifySelection(
			this: SubDocumentType<ListManager>,
			params: {
				type: AccessGateSubGroupApplicationCommandOptionType;
				interaction: CommandInteraction | ButtonInteraction;
				action: `${SubCommandActionType}`;
				commandName?: string;
				transfering?: boolean;
			}
		) {
			const oppositeList =
				this.listType() === "whitelist" ? "blacklist" : "whitelist";

			const { type, commandName, interaction, action, transfering } = params;

			const entitiyObject = await getEntityFromGuild(
				interaction,
				["all"],
				type.id
			);
			if (!entitiyObject)
				throw new ValidationError(UNEXPECTED_FALSY_VALUE__MESSAGE);
			if (entitiyObject.channels)
				throw new ValidationError(UNEXPECTED_TRUTHY_VALUE_MESSAGE);

			const firstValue = Object.keys(
				entitiyObject
			)[0] as keyof typeof entitiyObject;
			const strProp = firstValue == "members" ? "users" : firstValue;
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

			const oppositeListObj = cases[
				oppositeList
			] as SubDocumentType<ListManager>;

			const isExisting = this.checkIfExists(
				type,
				targetClassStr,
				commandName
			);

			if (action == "add" && isExisting) {
				await replyOrFollowUp(interaction, {
					content: `${targetMention} is already in the ${this.listType()}.`,
					ephemeral: true
				});
				return;
			}

			if (action == "remove" && !isExisting) {
				await replyOrFollowUp(interaction, {
					content: `${targetMention} does not exist in the ${this.listType()}.`,
					ephemeral: true
				});
				return;
			}

			if (
				!transfering &&
				action == "add" &&
				oppositeListObj.checkIfExists(type, targetClassStr, commandName)
			) {
				const snowflakeSingular = targetClassStr.slice(0, -1);

				const buttonIdPrefix = `${this.listType()}_${snowflakeSingular}_`;

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
						} database. Do you want to move this data to the ${this.listType()}?`
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
				const functionStr =
					action == "add" ? "addToList" : "removeFromList";
				const embedDirectionStr =
					action == "add" ? "added to" : "removed from";

				await this[functionStr](targetObj, strProp);
				if (!transfering) {
					const successEmbed = new EmbedBuilder()
						.setTitle("Success")
						.setDescription(
							`${targetMention} has been ${embedDirectionStr} the ${this.listType()}`
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

	return ListManager;
}

export const Blacklist = createListClass("blacklist");
export const Whitelist = createListClass("whitelist");

export type ListInstanceUnion = InstanceType<
	typeof Whitelist | typeof Blacklist
>;
