import {
	Category,
	// Category,
	RateLimit,
	TIME_UNIT
} from "@discordx/utilities";
import type {
	ButtonInteraction,
	ChatInputCommandInteraction,
	CommandInteraction
} from "discord.js";
import {
	ApplicationCommandOptionType,
	Colors,
	EmbedBuilder,
	GuildMember
} from "discord.js";
import {
	ButtonComponent,
	Discord,
	Guard,
	Slash,
	SlashGroup,
	SlashOption
} from "discordx";

import { RedisCache } from "../../DB/cache/index.js";
import { CasesModel } from "../../DB/models/Moderation/Cases.js";
import { capitalizeFirstLetter, concatenate } from "../../utils/casing.js";
import { UNEXPECTED_FALSY_VALUE__MESSAGE } from "../../utils/config.js";
import { ValidationError } from "../../utils/errors/ValidationError.js";
import {
	getEntityFromGuild,
	getMentionPrefixFromEntity,
	replyOrFollowUp
} from "../../utils/interaction.js";
import { moderationHierarchy } from "../../utils/moderationHierarchy.js";
import type {
	AccessGateSubGroupApplicationCommandOptionType,
	AccessListBarrier,
	SubCommandActionType,
	TargetType
} from "../../utils/ts/Access.js";
import { ListType } from "../../utils/ts/Enums.js";

enum SubCommandType {
	USER = "user",
	ROLE = "role",
	CHANNEL = "channel"
}

type TitleCaseList = TitleCase<`${ListType}`>;

const GuardDecorator = (() =>
	Guard(RateLimit(TIME_UNIT.seconds, 3, { ephemeral: true })))();

const listManagerClasses: {
	[K in
		| TitleCaseList
		| `${TitleCase<`${SubCommandType}`>}${TitleCaseList}`]: K extends TitleCaseList
		? new () => IBaseListManager
		: new () => ISubCommandManager;
} = {
	Blacklist: createBaseListManagerClass("blacklist"),
	Whitelist: createBaseListManagerClass("whitelist"),
	UserBlacklist: createSubCommandManagerClass("blacklist", "user"),
	RoleBlacklist: createSubCommandManagerClass("blacklist", "role"),
	ChannelBlacklist: createSubCommandManagerClass("blacklist", "channel"),
	UserWhitelist: createSubCommandManagerClass("whitelist", "user"),
	RoleWhitelist: createSubCommandManagerClass("whitelist", "role"),
	ChannelWhitelist: createSubCommandManagerClass("whitelist", "channel")
};

function createBaseListManagerClass(list: `${ListType}`) {
	@Discord()
	@Category("Admin Commands")
	@SlashGroup({
		description: `Manage ${list} for the guild or in a specific command`,
		name: list
	})
	@SlashGroup(list)
	class BaseListManager implements IBaseListManager {
		@Slash({ description: `View the ${list}`, name: "view" })
		@GuardDecorator
		async view(
			@SlashOption({
				description: "The command name",
				name: "command",
				type: ApplicationCommandOptionType.String
			})
			commandName: string | undefined,
			interaction: ChatInputCommandInteraction
		) {
			if (!interaction.guild || !interaction.guildId)
				throw new ValidationError(UNEXPECTED_FALSY_VALUE__MESSAGE);
			const cases = await CasesModel.findByServerId(interaction.guildId);

			if (!cases) throw new ValidationError(UNEXPECTED_FALSY_VALUE__MESSAGE);

			await cases.PaginateData({
				interaction,
				caseType: list,
				searchFilter: ["all"],
				commandName
			});
		}
	}

	return BaseListManager;
}

function createSubCommandManagerClass(
	root: `${ListType}`,
	subCommandType: `${SubCommandType}`
) {
	const description = concatenate(
		capitalizeFirstLetter(subCommandType),
		capitalizeFirstLetter(root)
	);

	const targetTypeNumber =
		ApplicationCommandOptionType[capitalizeFirstLetter(subCommandType)];

	@Discord()
	@SlashGroup({
		description,
		name: subCommandType,
		root
	})
	@SlashGroup(subCommandType, root)
	class SubCommandManager implements ISubCommandManager {
		async manageSubCommandAction(
			action: `${SubCommandActionType}`,
			target: AccessGateSubGroupApplicationCommandOptionType,
			commandName: string | undefined,
			interaction: ChatInputCommandInteraction
		) {
			const server = await findOrCreateServer(interaction);

			const guildMemberOrRole = await getEntityFromGuild(
				interaction,
				["members", "roles"],
				target.id,
				true
			);

			if (guildMemberOrRole) {
				const fairCheck = await moderationHierarchy(
					guildMemberOrRole,
					interaction
				);
				if (fairCheck)
					return replyOrFollowUp(interaction, {
						content: fairCheck,
						ephemeral: true
					});
			}

			const cases = await CasesModel.findByServerId(server.serverId);
			if (!cases) throw new ValidationError(UNEXPECTED_FALSY_VALUE__MESSAGE);

			cases[root].applicationModifySelection({
				type: target,
				commandName,
				interaction,
				action
			});
		}

		@ButtonComponent({ id: `${root}_${subCommandType}_move_target` })
		async moveSubCommandType(interaction: ButtonInteraction) {
			ButtonComponentMoveSnowflake(interaction);
		}
		@Slash({
			description: `Add a ${subCommandType} to the ${root}`,
			name: "add"
		})
		@GuardDecorator
		async add(
			@SlashOption({
				name: "target",
				type: targetTypeNumber,
				required: true,
				description: `Add a ${subCommandType} to the ${root}`
			})
			target: AccessGateSubGroupApplicationCommandOptionType,
			@SlashOption({
				description: "The command name",
				name: "command",
				type: ApplicationCommandOptionType.String
			})
			commandName: string | undefined,
			interaction: ChatInputCommandInteraction
		) {
			await this.manageSubCommandAction(
				"add",
				target,
				commandName,
				interaction
			);
		}

		@Slash({
			description: `Remove a ${subCommandType} from the ${root}`,
			name: "remove"
		})
		@GuardDecorator
		async remove(
			@SlashOption({
				name: "target",
				type: targetTypeNumber,
				required: true,
				description: `Remove a ${subCommandType} from the ${root}`
			})
			target: AccessGateSubGroupApplicationCommandOptionType,
			@SlashOption({
				description: "The command name",
				name: "command",
				type: ApplicationCommandOptionType.String
			})
			commandName: string | undefined,
			interaction: ChatInputCommandInteraction
		) {
			await this.manageSubCommandAction(
				"remove",
				target,
				commandName,
				interaction
			);
		}

		@Slash({
			description: `View the ${subCommandType} ${root}`,
			name: "view"
		})
		@GuardDecorator
		async view(
			@SlashOption({
				description: "The command name",
				name: "command",
				type: ApplicationCommandOptionType.String
			})
			commandName: string | undefined,
			interaction: CommandInteraction
		) {
			if (!interaction.guild || !interaction.guildId)
				throw new ValidationError(UNEXPECTED_FALSY_VALUE__MESSAGE);
			const cases = await CasesModel.findByServerId(interaction.guildId);

			if (!cases) throw new ValidationError(UNEXPECTED_FALSY_VALUE__MESSAGE);

			await cases.PaginateData({
				interaction,
				caseType: root,
				searchFilter: [`${subCommandType}s`],
				commandName
			});
		}
	}

	return SubCommandManager;
}

export default listManagerClasses;
