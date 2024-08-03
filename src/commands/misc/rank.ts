import { Category, RateLimit, TIME_UNIT } from "@discordx/utilities";
import { Discord, Guard, Slash } from "discordx";

import { TargetSlashOption } from "~/helpers/decorators/slashOptions/target.js";
import { CommandUtils } from "~/helpers/utils/command.js";
import { InteractionUtils } from "~/helpers/utils/interaction.js";
import { DBConnectionManager } from "~/models/framework/managers/DBConnectionManager.js";
import { Enums } from "~/ts/Enums.js";

import type { ChatInputCommandInteraction, GuildMember } from "discord.js";

@Discord()
@Category(Enums.CommandCategory.Misc)
@Guard(RateLimit(TIME_UNIT.seconds, 3))
export abstract class Rank {
	@Slash({ dmPermission: false, description: "View a members or your current rank" })
	public async rank(
		@TargetSlashOption({
			entityType: CommandUtils.entityType.USER,
			flags: [
				Enums.CommandSlashOptionTargetFlags.Guild,
				Enums.CommandSlashOptionTargetFlags.Passive,
				Enums.CommandSlashOptionTargetFlags.NoBot
			],
			required: false
		})
		target: GuildMember | undefined,
		interaction: ChatInputCommandInteraction<"cached">
	) {
		target ??= interaction.member;

		const rankCard = await DBConnectionManager.Prisma.leveling.buildRankCard({ interaction, target });

		return await InteractionUtils.replyOrFollowUp(interaction, { files: [rankCard] });
	}
}
