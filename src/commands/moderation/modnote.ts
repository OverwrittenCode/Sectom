import { Category, RateLimit, TIME_UNIT } from "@discordx/utilities";
import { ActionType, EntityType } from "@prisma/client";
import { type ChatInputCommandInteraction, type GuildMember, PermissionFlagsBits, User } from "discord.js";
import { Discord, Guard, Slash, SlashGroup } from "discordx";

import { Case, CaseModifyType } from "~/commands/moderation/case.js";
import { ReasonSlashOption } from "~/helpers/decorators/slash/reason.js";
import { TargetSlashOption } from "~/helpers/decorators/slash/target.js";
import { ClientRequiredPermissions } from "~/helpers/guards/ClientRequiredPermissions.js";
import { CommandUtils } from "~/helpers/utils/command.js";
import { ActionManager } from "~/models/framework/managers/ActionManager.js";
import { Enums } from "~/ts/Enums.js";

@Discord()
@Category(Enums.CommandCategory.Moderation)
@Guard(RateLimit(TIME_UNIT.seconds, 3), ClientRequiredPermissions(ModNote.mutualPermissions))
@SlashGroup({
	dmPermission: false,
	description: "Modify or list the notes of a user for moderators to view",
	name: "modnote",
	defaultMemberPermissions: ModNote.mutualPermissions
})
@SlashGroup("modnote")
export abstract class ModNote {
	private static readonly mutualPermissions = [PermissionFlagsBits.KickMembers];

	@Slash({ description: "Add a modnote to a member" })
	public async add(
		@TargetSlashOption({
			entityType: EntityType.USER,
			flags: [Enums.CommandSlashOptionTargetFlags.Guild, Enums.CommandSlashOptionTargetFlags.NoBot]
		})
		target: GuildMember,
		@ReasonSlashOption({ required: true })
		modnote: string,
		interaction: ChatInputCommandInteraction<"cached">
	) {
		return ActionManager.logCase({
			interaction,
			target: {
				id: target.id,
				type: EntityType.USER
			},
			reason: modnote,
			actionType: ActionType.MOD_NOTE_ADD,
			actionOptions: {
				notifyIfUser: false
			},
			successContent: "recorded the modnote onto the member's profile"
		});
	}

	@Slash({ description: "Edit a modnote case. Internally calls /case edit" })
	public async edit(
		@Case.IDSlashOption()
		caseID: string,
		@ReasonSlashOption({ isAmmended: true, required: true })
		newModnote: string,
		interaction: ChatInputCommandInteraction<"cached">
	) {
		return Case.modify({ interaction, caseID, type: CaseModifyType.EDIT, reason: newModnote });
	}

	@Slash({ description: "Lists the modnotes of a user. Internally calls /case list" })
	public list(
		@TargetSlashOption({
			entityType: CommandUtils.entityType.USER,
			flags: [Enums.CommandSlashOptionTargetFlags.Passive, Enums.CommandSlashOptionTargetFlags.NoBot]
		})
		target: User | GuildMember,
		interaction: ChatInputCommandInteraction<"cached">
	) {
		return ActionManager.listCases(interaction, {
			guildId: interaction.guildId,
			targetId: target.id,
			action: ActionType.MOD_NOTE_ADD
		});
	}

	@Slash({ description: "Remove a modnote case" })
	public async remove(
		@Case.IDSlashOption()
		caseID: string,
		@ReasonSlashOption()
		modnote: string,
		interaction: ChatInputCommandInteraction<"cached">
	) {
		return Case.modify({ interaction, caseID, type: CaseModifyType.REMOVE, reason: modnote });
	}
}
