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

import { ReasonSlashOption } from "~/helpers/decorators/slashOptions/reason.js";
import { TargetSlashOption } from "~/helpers/decorators/slashOptions/target.js";
import { ValidationError } from "~/helpers/errors/ValidationError.js";
import { DBConnectionManager } from "~/managers/DBConnectionManager.js";
import { ActionManager } from "~/models/framework/managers/ActionManager.js";
import { Enums } from "~/ts/Enums.js";
import { CommandUtils } from "~/utils/command.js";
import { InteractionUtils } from "~/utils/interaction.js";
import { ObjectUtils } from "~/utils/object.js";
import { StringUtils } from "~/utils/string.js";

import type { ChatInputCommandInteraction, GuildBasedChannel, GuildMember, User } from "discord.js";

@Discord()
@Category(Enums.CommandCategory.Moderation)
@Guard(RateLimit(TIME_UNIT.seconds, 3))
@SlashGroup({ dmPermission: false, description: "Container of all cases in the server", name: "case" })
@SlashGroup("case")
export abstract class Case {
	@Slash({ description: "Edit a case reason" })
	public async edit(
		@SlashOption({
			description: "The case id",
			name: "case_id",
			type: ApplicationCommandOptionType.String,
			required: true
		})
		caseID: string,
		@ReasonSlashOption({ isAmmendedReason: true, required: true })
		newReason: string,
		interaction: ChatInputCommandInteraction<"cached">
	) {
		const { guildId } = interaction;

		const caseData = await DBConnectionManager.Prisma.case.retrieveCase({
			interaction,
			caseID
		});

		const actionTypeStem = caseData.action.replace(StringUtils.Regexes.AllActionModifiers, "");

		const actionTypes = Object.values(ActionType);

		const actionTypeEdit = actionTypes.find((actionType) => actionType === `${actionTypeStem}_EDIT`);

		if (caseData.action.endsWith("EDIT") || !actionTypeEdit) {
			throw new ValidationError("you may not edit cases under this group");
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

		assert(apiEmbed.fields);

		const fields = apiEmbed.fields;

		const [retrievedTimestampFieldIndex, targetInformationFieldIndex, reasonFieldIndex, newReasonFieldIndex] = [
			"timestamps",
			"target information",
			"reason",
			"new reason"
		]
			.map((str) => fields.findIndex((field) => field.name.toLowerCase().includes(str)))
			.filter((index) => index !== -1) as Array<number | undefined>;

		const updatedEmbed = ObjectUtils.cloneObject(apiEmbed);

		assert(updatedEmbed.fields && targetInformationFieldIndex);

		const [sentenceCaseEntityType, , hyperlinkedTargetId] = fields[targetInformationFieldIndex].value
			.replaceAll(StringUtils.TabCharacter, "")
			.split(StringUtils.LineBreak)
			.find((str) => str.includes("ID"))!
			.replaceAll("*", "")
			.split(" ");

		const entityType = EntityType[sentenceCaseEntityType.toUpperCase() as EntityType];
		const targetId = hyperlinkedTargetId.split("(")[0].slice(1, -1);

		if (retrievedTimestampFieldIndex) {
			timestampFieldIndex = retrievedTimestampFieldIndex;
		}

		if (newReasonFieldIndex) {
			updatedEmbed.fields[newReasonFieldIndex].value = newReason;
		} else if (reasonFieldIndex) {
			updatedEmbed.fields[reasonFieldIndex].name = "Original Reason";
			updatedEmbed.fields.splice(reasonFieldIndex + 1, 0, {
				name: "New Reason",
				value: newReason
			});
		} else {
			updatedEmbed.fields.push({ name: "Reason", value: newReason });
		}

		updatedEmbeds.unshift(updatedEmbed);

		if (timestampFieldIndex) {
			updatedEmbeds[0].fields![timestampFieldIndex] = ActionManager.generateTimestampField({
				createdAt: caseData.createdAt,
				updatedAt: new Date()
			});
		}

		if (caseRecordChannel instanceof TextChannel) {
			const caseRecordLogMessage = await caseRecordChannel.messages.fetch(retrievedMessageId ?? "").catch();

			if (caseRecordLogMessage?.editable) {
				await caseRecordLogMessage
					.edit({
						embeds: updatedEmbeds
					})
					.catch();
			} else {
				const message = await caseRecordChannel.send({ embeds: updatedEmbeds });
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

		await DBConnectionManager.Prisma.case.update({
			where: { id: caseData.id },
			data: {
				messageURL,
				apiEmbeds: updatedEmbeds,
				reason: newReason
			},
			select: {
				id: true
			}
		});

		return await ActionManager.logCase({
			interaction,
			target: {
				id: targetId,
				type: entityType
			},
			actionType: actionTypeEdit,
			actionOptions: {
				notifyIfUser: false
			},
			successContent: `${reasonFieldIndex === -1 ? "set" : "edited"} the reason for case ${inlineCode(caseData.id)}`,
			buttonActionRows
		});
	}

	@Slash({ description: "View a specific, or all cases, on the server" })
	public async view(
		@SlashOption({
			description: "The case ID",
			name: "case_id",
			type: ApplicationCommandOptionType.String
		})
		id: string | undefined,
		@TargetSlashOption({
			entityType: CommandUtils.EntityType.USER,
			flags: [Enums.CommandSlashOptionTargetFlags.Passive],
			descriptionNote: "This is ignored if case_id is provided",
			name: "perpetrator",
			required: false
		})
		perpetrator: GuildMember | User | undefined,
		@TargetSlashOption({
			entityType: CommandUtils.EntityType.USER,
			flags: [Enums.CommandSlashOptionTargetFlags.Passive],
			descriptionNote: "This is ignored if case_id is provided",
			name: "target",
			required: false
		})
		target: GuildMember | User | undefined,
		@TargetSlashOption({
			entityType: CommandUtils.EntityType.CHANNEL,
			flags: [Enums.CommandSlashOptionTargetFlags.Passive],
			descriptionNote: "This is ignored if case_id is provided",
			required: false
		})
		channel: GuildBasedChannel | undefined,
		interaction: ChatInputCommandInteraction<"cached">
	) {
		if (!id) {
			return ActionManager.listCases(interaction, {
				perpetratorId: perpetrator?.valueOf(),
				targetId: target?.valueOf(),
				channelId: channel?.valueOf()
			});
		}

		const { guildId } = interaction;

		const { doc } = await DBConnectionManager.Prisma.case.fetchFirstOrThrow({
			where: { guildId, id },
			select: { apiEmbeds: true },
			validationError: true
		});

		return await InteractionUtils.replyOrFollowUp(interaction, { embeds: doc.apiEmbeds });
	}
}
