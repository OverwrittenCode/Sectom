import { Category, RateLimit, TIME_UNIT } from "@discordx/utilities";
import type { ButtonInteraction, CommandInteraction } from "discord.js";
import { ApplicationCommandOptionType } from "discord.js";
import {
	ButtonComponent,
	Discord,
	Guard,
	Slash,
	SlashGroup,
	SlashOption
} from "discordx";

import { CasesModel } from "../../models/Moderation/Cases.js";
import { findOrCreateServer } from "../../models/Server.js";
import { capitalizeFirstLetter, concatenate } from "../../utils/casing.js";
import {
	ButtonComponentMoveSnowflake,
	PaginationSender
} from "../../utils/components/PaginationButtons.js";
import { UNEXPECTED_FALSEY_VALUE__MESSAGE } from "../../utils/config.js";
import { getEntityFromGuild, replyNoData } from "../../utils/interaction.js";
import { moderationHierarchy } from "../../utils/moderationHierarchy.js";
import type {
	AccessGateSubGroupApplicationCommandOptionType,
	SubCommandActionType
} from "../../utils/ts/Access.js";
import {
	AccessListBarrier,
	CombinedTargetClass
} from "../../utils/ts/Access.js";
import { ListType } from "../../utils/ts/Enums.js";
import type { TitleCase } from "../../utils/ts/General.js";
import type {
	IBaseListManager,
	ISubCommandManager
} from "../../utils/ts/Interfaces.js";

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

function createBaseListManagerClass<T extends `${ListType}`>(
	list: `${ListType}`
) {
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
			interaction: CommandInteraction
		) {
			const retrieveServer = await findOrCreateServer(interaction, true);
			if (retrieveServer.status == 404) return replyNoData(interaction);

			const server = retrieveServer.object;

			PaginationSender({
				server,
				list,
				snowflakePluralType: CombinedTargetClass.GUILDS,
				interaction,
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

	const list =
		AccessListBarrier[root.toUpperCase() as Uppercase<`${ListType}`>];

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
			interaction: CommandInteraction
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
					return interaction.reply({
						content: fairCheck,
						ephemeral: true
					});
			}

			const cases = await CasesModel.findByServerId(server.serverId);
			if (!cases) throw new Error(UNEXPECTED_FALSEY_VALUE__MESSAGE);

			cases.blacklist.applicationModifySelection({
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
			interaction: CommandInteraction
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
			interaction: CommandInteraction
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
			const server = await findOrCreateServer(interaction);

			PaginationSender({
				server,
				list: root,
				snowflakePluralType:
					CombinedTargetClass[
						`${subCommandType.toUpperCase()}s` as
							| "USERS"
							| "ROLES"
							| "CHANNELS"
					],
				interaction,
				commandName
			});
		}
	}

	return SubCommandManager;
}

export default listManagerClasses;
