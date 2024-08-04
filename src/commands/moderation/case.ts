import assert from "assert";

import { Category, RateLimit, TIME_UNIT } from "@discordx/utilities";
import { ActionType, EntityType } from "@prisma/client";
import {
	ActionRowBuilder,
	ApplicationCommandOptionType,
	ButtonBuilder,
	ButtonStyle,
	PermissionFlagsBits,
	TextChannel,
	inlineCode,
	messageLink
} from "discord.js";
import { Discord, Guard, Slash, SlashGroup, SlashOption } from "discordx";

import { AutoCompleteSlashOption } from "~/helpers/decorators/slashOptions/autocomplete.js";
import { ReasonSlashOption } from "~/helpers/decorators/slashOptions/reason.js";
import { TargetSlashOption } from "~/helpers/decorators/slashOptions/target.js";
import { ValidationError } from "~/helpers/errors/ValidationError.js";
import { CommandUtils } from "~/helpers/utils/command.js";
import { InteractionUtils } from "~/helpers/utils/interaction.js";
import { ObjectUtils } from "~/helpers/utils/object.js";
import { StringUtils } from "~/helpers/utils/string.js";
import { DBConnectionManager } from "~/managers/DBConnectionManager.js";
import { RetrieveCaseOptions } from "~/models/DB/prisma/extensions/case.js";
import { ActionManager } from "~/models/framework/managers/ActionManager.js";
import { EmbedManager } from "~/models/framework/managers/EmbedManager.js";
import { Enums } from "~/ts/Enums.js";
import { Typings } from "~/ts/Typings.js";

import type { ChatInputCommandInteraction, GuildBasedChannel, GuildMember, User } from "discord.js";

interface CaseModifyOptions
	extends Typings.DisplaceObjects<RetrieveCaseOptions, { interaction: ChatInputCommandInteraction<"cached"> }> {
	type: CaseModifyType;
	reason: string;
}

export enum CaseModifyType {
	EDIT = "edit",
	REMOVE = "remove"
}

@Discord()
@Category(Enums.CommandCategory.Moderation)
@Guard(RateLimit(TIME_UNIT.seconds, 3))
@SlashGroup({ dmPermission: false, description: "Container of all cases in the server", name: "case" })
@SlashGroup("case")
export abstract class Case {
	public static IDSlashOption() {
		return (target: Record<string, any>, propertyKey: string, parameterIndex: number) => {
			SlashOption({
				description: "The case id",
				name: "case_id",
				type: ApplicationCommandOptionType.String,
				required: true,
				minLength: 6,
				maxLength: 6
			})(target, propertyKey, parameterIndex);
		};
	}

	public static async modify(options: CaseModifyOptions) {
		const { interaction, caseID, type, reason } = options;

		const { guildId } = interaction;

		const caseData = await DBConnectionManager.Prisma.case.retrieveCase({
			interaction,
			caseID
		});

		if (caseData.action.endsWith("EDIT")) {
			throw new ValidationError(
				"This case is readonly as the action type is reserved for editing cases. If you are trying to edit a case again, please find the original case id and use that instead."
			);
		}

		const actionTypeStem = caseData.action.replace(StringUtils.regexes.allActionModifiers, "");

		const actionType = Object.values(ActionType).find(
			(actionType) => actionType === `${actionTypeStem}_${type.toUpperCase()}`
		);

		if (!actionType) {
			throw new ValidationError(`you may not ${type} cases under this group`);
		}

		const isInsufficientPermission =
			caseData.perpetratorId !== interaction.user.id &&
			!interaction.memberPermissions.has(PermissionFlagsBits.Administrator);

		if (isInsufficientPermission) {
			throw new ValidationError("administrator permission required to edit cases not initiated by you");
		}

		const [apiEmbed, ...updatedEmbeds] = caseData.apiEmbeds;

		const buttonActionRows: ActionRowBuilder<ButtonBuilder>[] = [];

		let timestampFieldIndex: number | null = null;
		let caseRecordChannel: GuildBasedChannel | null = null;
		let retrievedMessageId: string | null = null;
		let messageURL: string | null = null;

		if (caseData.messageURL) {
			const [, channelId, messageId] = caseData.messageURL.split("channels/")[1].split("/");

			retrievedMessageId = messageId;
			caseRecordChannel = interaction.guild.channels.resolve(channelId);

			if (caseRecordChannel) {
				messageURL = messageLink(caseRecordChannel.id, retrievedMessageId, guildId);
			}
		}

		const updatedEmbed = ObjectUtils.cloneObject(apiEmbed);

		const { fields } = updatedEmbed;

		assert(fields);

		const [retrievedTimestampFieldIndex, targetInformationFieldIndex] = ["timestamps", "target information"]
			.map((str) => fields.findIndex((field) => field.name.toLowerCase().includes(str)))
			.filter((index) => index !== -1) as Array<number | undefined>;

		let embedReasonFieldIndex = caseData.apiEmbeds.length - 1;
		let reasonFieldIndex = -1;

		caseData.apiEmbeds.forEach((embed, index) => {
			embed.fields ??= [];

			embedReasonFieldIndex = index;
			reasonFieldIndex = embed.fields.findIndex((field) => field.name.toLowerCase().includes("reason"));
		});

		assert(updatedEmbed.fields && targetInformationFieldIndex);

		const [sentenceCaseEntityType, , hyperlinkedTargetId] = fields[targetInformationFieldIndex].value
			.replaceAll(StringUtils.tabCharacter, "")
			.split(StringUtils.lineBreak)
			.find((str) => str.includes("ID"))!
			.replaceAll("*", "")
			.split(" ");

		const entityType = EntityType[sentenceCaseEntityType.toUpperCase() as EntityType];
		const targetId = hyperlinkedTargetId.split("(")[0].slice(1, -1);

		let pendingExecution: () => Promise<any>;

		if (type === CaseModifyType.REMOVE) {
			pendingExecution = async () => {
				await DBConnectionManager.Prisma.case.delete({
					where: { id: caseData.id },
					select: {
						id: true
					}
				});
			};
		} else {
			if (typeof retrievedTimestampFieldIndex === "number") {
				timestampFieldIndex = retrievedTimestampFieldIndex;
			}

			if (reasonFieldIndex !== -1) {
				caseData.apiEmbeds[embedReasonFieldIndex].fields![reasonFieldIndex].value = reason;
			} else {
				caseData.apiEmbeds[embedReasonFieldIndex].fields!.push({
					name: "Reason",
					value: reason
				});
			}

			if (typeof timestampFieldIndex === "number") {
				updatedEmbed.fields[timestampFieldIndex] = ActionManager.generateTimestampField({
					createdAt: caseData.createdAt,
					updatedAt: new Date()
				});
			}

			updatedEmbeds.unshift(updatedEmbed);

			const newAPIEmbeds = EmbedManager.formatEmbeds(updatedEmbeds).map((embed) => embed.toJSON());

			if (caseRecordChannel instanceof TextChannel) {
				const caseRecordLogMessage = await caseRecordChannel.messages
					.fetch(retrievedMessageId ?? "")
					.catch(() => {});

				if (caseRecordLogMessage?.editable) {
					await caseRecordLogMessage
						.edit({
							embeds: newAPIEmbeds
						})
						.catch(() => {});
				} else {
					const message = await caseRecordChannel.send({
						embeds: newAPIEmbeds
					});

					messageURL = messageLink(caseRecordChannel.id, message.id, guildId);
				}

				assert(messageURL);

				const messageURLButton = new ButtonBuilder()
					.setLabel(`CASE ${caseData.id}`)
					.setStyle(ButtonStyle.Link)
					.setURL(messageURL);

				const buttonActionRow = new ActionRowBuilder<ButtonBuilder>().addComponents(messageURLButton);

				buttonActionRows.push(buttonActionRow);
			}

			pendingExecution = async () => {
				await DBConnectionManager.Prisma.case.update({
					where: { id: caseData.id },
					data: {
						messageURL,
						apiEmbeds: newAPIEmbeds,
						reason
					},
					select: {
						id: true
					}
				});
			};
		}

		return await ActionManager.logCase({
			interaction,
			target: {
				id: targetId,
				type: entityType
			},
			actionType,
			reason,
			actionOptions: {
				notifyIfUser: false,
				pendingExecution
			},
			successContent: `${type === "edit" ? "edited the reason for" : "removed"} case ${inlineCode(caseData.id)}`,
			buttonActionRows
		});
	}

	@Slash({ description: "Edit a case reason" })
	public async edit(
		@Case.IDSlashOption()
		caseID: string,
		@ReasonSlashOption({ isAmmendedReason: true, required: true })
		newReason: string,
		interaction: ChatInputCommandInteraction<"cached">
	) {
		return Case.modify({
			interaction,
			caseID,
			type: CaseModifyType.EDIT,
			reason: newReason
		});
	}

	@Slash({ description: "List and filter all cases on the server" })
	public async list(
		@AutoCompleteSlashOption(
			{
				description: "The action type",
				name: "action_type",
				type: ApplicationCommandOptionType.String
			},
			ActionType
		)
		action: ActionType | undefined,
		@TargetSlashOption({
			entityType: CommandUtils.entityType.USER,
			flags: [Enums.CommandSlashOptionTargetFlags.Passive],
			name: "perpetrator",
			required: false
		})
		perpetrator: GuildMember | User | undefined,
		@TargetSlashOption({
			entityType: CommandUtils.entityType.USER,
			flags: [Enums.CommandSlashOptionTargetFlags.Passive],
			name: "target",
			required: false
		})
		target: GuildMember | User | undefined,
		@TargetSlashOption({
			entityType: CommandUtils.entityType.CHANNEL,
			flags: [Enums.CommandSlashOptionTargetFlags.Passive],
			required: false
		})
		channel: GuildBasedChannel | undefined,
		interaction: ChatInputCommandInteraction<"cached">
	) {
		return ActionManager.listCases(interaction, {
			action,
			perpetratorId: perpetrator?.valueOf(),
			targetId: target?.valueOf(),
			channelId: channel?.valueOf()
		});
	}

	@Slash({ description: "View a specific case on the server" })
	public async view(
		@Case.IDSlashOption()
		id: string | undefined,
		interaction: ChatInputCommandInteraction<"cached">
	) {
		const { guildId } = interaction;

		const { doc } = await DBConnectionManager.Prisma.case.fetchFirstOrThrow({
			where: { guildId, id },
			select: { apiEmbeds: true },
			validationError: true
		});

		return await InteractionUtils.replyOrFollowUp(interaction, { embeds: doc.apiEmbeds });
	}
}
